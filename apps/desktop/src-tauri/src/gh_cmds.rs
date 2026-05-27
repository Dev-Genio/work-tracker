use std::collections::HashMap;

use chrono::Local;
use serde::Serialize;
use tokio::process::Command;

#[derive(Serialize)]
pub struct GhCommit {
    pub repo: String,
    pub sha: String,
    pub message: String,
    #[serde(rename = "committedAt")]
    pub committed_at: String,
}

#[derive(Serialize)]
pub struct GhTodayResult {
    pub commits: Vec<GhCommit>,
    /// Per-query diagnostics. Empty when both queries succeeded; populated with
    /// verbose, actionable messages when one (or both) failed so the UI can
    /// show *why* commits might be missing.
    pub warnings: Vec<String>,
}

#[derive(serde::Deserialize)]
struct RawCommit {
    sha: String,
    commit: RawCommitInner,
    repository: RawRepo,
}
#[derive(serde::Deserialize)]
struct RawCommitInner {
    message: String,
    committer: RawCommitter,
}
#[derive(serde::Deserialize)]
struct RawCommitter {
    date: String,
}
#[derive(serde::Deserialize)]
struct RawRepo {
    #[serde(rename = "nameWithOwner")]
    name_with_owner: String,
}

/// All of the user's commits for the day across every repo and org they have
/// access to. We hit GitHub's commit search twice — once filtering by author,
/// once by committer — and merge the results so squash-merges still appear.
/// Per-query failures are surfaced as verbose warnings rather than silently
/// swallowed.
#[tauri::command]
pub async fn gh_today_commits(since: Option<String>) -> Result<GhTodayResult, String> {
    let date = since.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());
    if date.len() != 10 || !date.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err("invalid since date (expected YYYY-MM-DD)".into());
    }

    let (by_author, by_committer) = tokio::join!(
        gh_search(&date, "--author"),
        gh_search(&date, "--committer"),
    );

    let mut merged: HashMap<(String, String), GhCommit> = HashMap::new();
    let mut warnings: Vec<String> = Vec::new();

    for (label, result) in [("--author=@me", by_author), ("--committer=@me", by_committer)] {
        match result {
            Ok(rows) => {
                for c in rows {
                    let key = (c.repository.name_with_owner.clone(), c.sha.clone());
                    merged.entry(key).or_insert_with(|| GhCommit {
                        repo: c.repository.name_with_owner,
                        sha: c.sha,
                        message: c.commit.message.lines().next().unwrap_or("").to_string(),
                        committed_at: c.commit.committer.date,
                    });
                }
            }
            Err(e) => warnings.push(format!("gh search commits {} failed: {}", label, e)),
        }
    }

    let mut out: Vec<GhCommit> = merged.into_values().collect();
    out.sort_by(|a, b| b.committed_at.cmp(&a.committed_at));
    Ok(GhTodayResult { commits: out, warnings })
}

/// Run `gh auth status` and return the formatted output. Useful when commits
/// look wrong: lets the UI show the user which orgs are authorized, which
/// ones need SSO, and the current scopes.
#[tauri::command]
pub async fn gh_auth_status() -> Result<String, String> {
    let mut cmd = Command::new("gh");
    cmd.arg("auth").arg("status");

    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);

    let out = cmd
        .output()
        .await
        .map_err(|e| explain_spawn_failure(&e.to_string()))?;

    // gh writes its banner to stderr even on success.
    let mut text = String::new();
    if !out.stdout.is_empty() {
        text.push_str(&String::from_utf8_lossy(&out.stdout));
    }
    if !out.stderr.is_empty() {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(&String::from_utf8_lossy(&out.stderr));
    }
    if !out.status.success() {
        return Err(if text.is_empty() {
            format!("gh auth status exited {}", out.status)
        } else {
            text
        });
    }
    Ok(text)
}

async fn gh_search(date: &str, role_flag: &str) -> Result<Vec<RawCommit>, String> {
    let mut cmd = Command::new("gh");
    cmd.arg("search")
        .arg("commits")
        .arg(format!("{}=@me", role_flag))
        .arg(format!("--committer-date=>={}", date))
        .arg("--json")
        .arg("sha,commit,repository")
        .arg("--limit")
        .arg("1000");

    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);

    let out = cmd
        .output()
        .await
        .map_err(|e| explain_spawn_failure(&e.to_string()))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
        return Err(explain_gh_failure(out.status.code(), &stderr));
    }

    serde_json::from_slice(&out.stdout).map_err(|e| {
        format!(
            "could not parse `gh search commits` JSON output ({}). Stdout (truncated): {}",
            e,
            truncate(&String::from_utf8_lossy(&out.stdout), 300),
        )
    })
}

fn explain_spawn_failure(raw: &str) -> String {
    let lower = raw.to_lowercase();
    let mut msg = format!("failed to launch the `gh` CLI: {}", raw.trim());
    if lower.contains("not found")
        || lower.contains("os error 2")
        || lower.contains("the system cannot find")
        || lower.contains("cannot find the file")
    {
        msg.push_str("\nFix: install GitHub CLI from https://cli.github.com and make sure `gh` is on your PATH (open a new terminal after installing).");
    }
    msg
}

fn explain_gh_failure(code: Option<i32>, stderr: &str) -> String {
    let trimmed = stderr.trim();
    let lower = trimmed.to_lowercase();
    let exit = code.map(|c| format!("exit {}", c)).unwrap_or_else(|| "signal".into());

    // Build a structured, multi-line message: what gh said + a plain-English
    // explanation + a copy-pasteable fix.
    let mut parts: Vec<String> = Vec::new();
    parts.push(format!("`gh` failed ({}).", exit));
    if !trimmed.is_empty() {
        parts.push(format!("Output:\n{}", trimmed));
    }

    // Match the most common failure modes and append targeted guidance.
    let hint = if lower.contains("not logged into")
        || lower.contains("authentication")
        || lower.contains("authenticate")
        || lower.contains("you are not logged in")
    {
        Some("You are not signed in to `gh`. Run `gh auth login` and choose GitHub.com → HTTPS, then sign in.")
    } else if lower.contains("sso")
        || lower.contains("saml")
        || lower.contains("you must authorize")
        || lower.contains("resource protected by")
    {
        Some("Your gh token is missing SAML/SSO authorization for one or more orgs. Run:\n  gh auth refresh -s read:org,repo\nThen click through the SSO prompt for each org in your browser.")
    } else if lower.contains("scope") || lower.contains("requires") || lower.contains("forbidden") {
        Some("Your gh token is missing required scopes. Run:\n  gh auth refresh -s read:org,repo")
    } else if lower.contains("rate limit") || lower.contains("rate-limit") || lower.contains("403") {
        Some("GitHub rate-limited the request. Wait a few minutes and retry; for heavy use, use a PAT with higher limits.")
    } else if lower.contains("could not resolve host") || lower.contains("network") || lower.contains("timeout") {
        Some("Network problem reaching api.github.com. Check your internet connection / proxy / VPN.")
    } else {
        None
    };
    if let Some(h) = hint {
        parts.push(format!("Fix: {}", h));
    }
    parts.join("\n")
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(n).collect();
        out.push_str("…");
        out
    }
}
