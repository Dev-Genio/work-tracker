use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use chrono::Local;
use futures::stream::{self, StreamExt};
use once_cell::sync::Lazy;
use serde::Serialize;
use tokio::process::Command;

#[derive(Serialize, Clone)]
pub struct GhCommit {
    pub repo: String,
    pub sha: String,
    /// Subject line (first line of the commit message).
    pub message: String,
    /// Remaining body, "" if absent.
    pub body: String,
    pub additions: u32,
    pub deletions: u32,
    #[serde(rename = "committedAt")]
    pub committed_at: String,
}

#[derive(Serialize, Clone)]
pub struct GhTodayResult {
    pub commits: Vec<GhCommit>,
    pub warnings: Vec<String>,
}

// ----- gh search commits (cheap, paginated) ------------------------------

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
    #[serde(default, alias = "fullName", alias = "full_name", alias = "nameWithOwner")]
    name_with_owner: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    owner: Option<RawOwner>,
}
#[derive(serde::Deserialize)]
struct RawOwner {
    #[serde(default)]
    login: Option<String>,
}
impl RawRepo {
    fn name_owner(&self) -> Option<String> {
        if let Some(v) = &self.name_with_owner {
            if !v.is_empty() {
                return Some(v.clone());
            }
        }
        if let (Some(owner), Some(name)) = (&self.owner, &self.name) {
            if let Some(login) = &owner.login {
                if !login.is_empty() && !name.is_empty() {
                    return Some(format!("{}/{}", login, name));
                }
            }
        }
        None
    }
}

// ----- gh api repos/.../commits/SHA (expensive, per-commit enrichment) ---

#[derive(serde::Deserialize)]
struct CommitDetail {
    #[serde(default)]
    commit: Option<CommitDetailInner>,
    #[serde(default)]
    stats: Option<CommitStats>,
}
#[derive(serde::Deserialize)]
struct CommitDetailInner {
    #[serde(default)]
    message: Option<String>,
}
#[derive(serde::Deserialize)]
struct CommitStats {
    #[serde(default)]
    additions: u32,
    #[serde(default)]
    deletions: u32,
}

// ----- Caching -----------------------------------------------------------

const CACHE_TTL: Duration = Duration::from_secs(10 * 60);
const SEARCH_LIMIT: &str = "200";
const ENRICH_CONCURRENCY: usize = 4;

struct Cached {
    fetched_at: Instant,
    date: String,
    result: GhTodayResult,
}
static CACHE: Lazy<Mutex<Option<Cached>>> = Lazy::new(|| Mutex::new(None));

fn cache_get(date: &str) -> Option<GhTodayResult> {
    let g = CACHE.lock().ok()?;
    let c = g.as_ref()?;
    if c.date == date && c.fetched_at.elapsed() < CACHE_TTL {
        Some(c.result.clone())
    } else {
        None
    }
}
fn cache_put(date: &str, r: &GhTodayResult) {
    if let Ok(mut g) = CACHE.lock() {
        *g = Some(Cached {
            fetched_at: Instant::now(),
            date: date.to_string(),
            result: r.clone(),
        });
    }
}

// ----- Public command ----------------------------------------------------

#[tauri::command]
pub async fn gh_today_commits(since: Option<String>) -> Result<GhTodayResult, String> {
    let date = since.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());
    if date.len() != 10 || !date.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err("invalid since date (expected YYYY-MM-DD)".into());
    }

    if let Some(cached) = cache_get(&date) {
        return Ok(cached);
    }

    let mut merged: HashMap<(String, String), GhCommit> = HashMap::new();
    let mut warnings: Vec<String> = Vec::new();

    // Step 1: gh search commits — twice (author + committer), serially.
    for (label, flag) in [("--author=@me", "--author"), ("--committer=@me", "--committer")] {
        match gh_search(&date, flag).await {
            Ok(rows) => {
                for c in rows {
                    let Some(repo) = c.repository.name_owner() else { continue };
                    let key = (repo.clone(), c.sha.clone());
                    let full_msg = c.commit.message;
                    merged.entry(key).or_insert_with(|| {
                        let (subject, body) = split_message(&full_msg);
                        GhCommit {
                            repo,
                            sha: c.sha,
                            message: subject,
                            body,
                            additions: 0,
                            deletions: 0,
                            committed_at: c.commit.committer.date,
                        }
                    });
                }
            }
            Err(e) => warnings.push(format!("gh search commits {} failed: {}", label, e)),
        }
        tokio::time::sleep(Duration::from_millis(750)).await;
    }

    // Step 2: enrich each commit with stats (additions/deletions) and the
    // full body (search only returns the subject reliably).
    let to_enrich: Vec<(String, String)> = merged.keys().cloned().collect();

    let mut enrich_failures = 0usize;
    let results: Vec<((String, String), Option<(String, u32, u32)>)> = stream::iter(to_enrich)
        .map(|(repo, sha)| async move {
            let res = enrich_commit(&repo, &sha).await.ok();
            ((repo, sha), res)
        })
        .buffer_unordered(ENRICH_CONCURRENCY)
        .collect()
        .await;

    for ((repo, sha), enriched) in results {
        if let Some(c) = merged.get_mut(&(repo, sha)) {
            match enriched {
                Some((full_msg, add, del)) => {
                    let (subject, body) = split_message(&full_msg);
                    c.message = subject;
                    c.body = body;
                    c.additions = add;
                    c.deletions = del;
                }
                None => enrich_failures += 1,
            }
        }
    }
    if enrich_failures > 0 {
        warnings.push(format!(
            "{} commit(s) could not be enriched with line stats. Common causes: SAML SSO not authorized for that org, repo deleted, or rate limited.\nFix: gh auth refresh -s read:org,repo",
            enrich_failures
        ));
    }

    let mut out: Vec<GhCommit> = merged.into_values().collect();
    out.sort_by(|a, b| b.committed_at.cmp(&a.committed_at));
    let result = GhTodayResult { commits: out, warnings };
    cache_put(&date, &result);
    Ok(result)
}

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

// ----- Helpers -----------------------------------------------------------

async fn gh_search(date: &str, role_flag: &str) -> Result<Vec<RawCommit>, String> {
    let mut cmd = Command::new("gh");
    cmd.arg("search")
        .arg("commits")
        .arg(format!("{}=@me", role_flag))
        .arg(format!("--committer-date=>={}", date))
        .arg("--json")
        .arg("sha,commit,repository")
        .arg("--limit")
        .arg(SEARCH_LIMIT);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);

    let out = cmd
        .output()
        .await
        .map_err(|e| explain_spawn_failure(&e.to_string()))?;
    if !out.status.success() {
        return Err(explain_gh_failure(
            out.status.code(),
            &String::from_utf8_lossy(&out.stderr),
        ));
    }
    serde_json::from_slice(&out.stdout).map_err(|e| {
        format!(
            "could not parse `gh search commits` JSON output ({}). Stdout (truncated): {}",
            e,
            truncate(&String::from_utf8_lossy(&out.stdout), 300),
        )
    })
}

/// Returns (full_message, additions, deletions) by calling
/// `gh api repos/{repo}/commits/{sha}`.
async fn enrich_commit(repo: &str, sha: &str) -> Result<(String, u32, u32), String> {
    let mut cmd = Command::new("gh");
    cmd.arg("api").arg(format!("repos/{}/commits/{}", repo, sha));
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);

    let out = cmd
        .output()
        .await
        .map_err(|e| explain_spawn_failure(&e.to_string()))?;
    if !out.status.success() {
        return Err(explain_gh_failure(
            out.status.code(),
            &String::from_utf8_lossy(&out.stderr),
        ));
    }
    let detail: CommitDetail = serde_json::from_slice(&out.stdout)
        .map_err(|e| format!("parse failed for {}@{}: {}", repo, &sha[..7.min(sha.len())], e))?;
    let msg = detail
        .commit
        .and_then(|c| c.message)
        .unwrap_or_default();
    let (add, del) = detail
        .stats
        .map(|s| (s.additions, s.deletions))
        .unwrap_or((0, 0));
    Ok((msg, add, del))
}

fn split_message(full: &str) -> (String, String) {
    let mut lines = full.lines();
    let subject = lines.next().unwrap_or("").to_string();
    let rest: Vec<&str> = lines.collect();
    let body = rest.join("\n").trim().to_string();
    (subject, body)
}

fn explain_spawn_failure(raw: &str) -> String {
    let lower = raw.to_lowercase();
    let mut msg = format!("failed to launch the `gh` CLI: {}", raw.trim());
    if lower.contains("not found")
        || lower.contains("os error 2")
        || lower.contains("the system cannot find")
        || lower.contains("cannot find the file")
    {
        msg.push_str("\nFix: install GitHub CLI from https://cli.github.com and make sure `gh` is on your PATH.");
    }
    msg
}

fn explain_gh_failure(code: Option<i32>, stderr: &str) -> String {
    let trimmed = stderr.trim();
    let lower = trimmed.to_lowercase();
    let exit = code.map(|c| format!("exit {}", c)).unwrap_or_else(|| "signal".into());

    let mut parts: Vec<String> = Vec::new();
    parts.push(format!("`gh` failed ({}).", exit));
    if !trimmed.is_empty() {
        parts.push(format!("Output:\n{}", trimmed));
    }
    let hint = if lower.contains("not logged into")
        || lower.contains("authentication")
        || lower.contains("authenticate")
        || lower.contains("you are not logged in")
    {
        Some("You are not signed in to `gh`. Run `gh auth login`.")
    } else if lower.contains("sso") || lower.contains("saml") || lower.contains("you must authorize") {
        Some("Your gh token is missing SAML/SSO authorization for one or more orgs. Run:\n  gh auth refresh -s read:org,repo\nThen click through the SSO prompt for each org.")
    } else if lower.contains("scope") || lower.contains("requires") || lower.contains("forbidden") {
        Some("Your gh token is missing required scopes. Run:\n  gh auth refresh -s read:org,repo")
    } else if lower.contains("secondary rate limit") {
        Some("GitHub's anti-abuse limiter is throttling rapid calls. Results are cached 10 min — subsequent batches reuse the cache. If this persists, lower your tracking cadence in Settings.")
    } else if lower.contains("rate limit") || lower.contains("rate-limit") || lower.contains("403") {
        Some("GitHub rate-limited the request. Wait a few minutes; results are cached for 10 min.")
    } else if lower.contains("could not resolve host") || lower.contains("network") || lower.contains("timeout") {
        Some("Network problem reaching api.github.com. Check your internet / VPN.")
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
