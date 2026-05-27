use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use chrono::Local;
use once_cell::sync::Lazy;
use serde::Serialize;
use tokio::process::Command;

#[derive(Serialize, Clone)]
pub struct GhCommit {
    pub repo: String,
    pub sha: String,
    pub message: String,
    #[serde(rename = "committedAt")]
    pub committed_at: String,
}

#[derive(Serialize, Clone)]
pub struct GhTodayResult {
    pub commits: Vec<GhCommit>,
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

/// `gh` returns the repo under different field names depending on which
/// underlying GitHub API the search hit. Accept all known variants.
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

// ----- In-process cache ---------------------------------------------------
// gh search commits is paginated client-side — `--limit 200` translates to
// two REST calls — and we hit it twice (author + committer). Running this
// every batch (~5 minutes) trips GitHub's secondary rate limit. Cache the
// merged result for TTL so repeated batches reuse it.

const CACHE_TTL: Duration = Duration::from_secs(10 * 60);
const SEARCH_LIMIT: &str = "200";

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

/// All of the user's commits since `since` (default: today, local timezone),
/// merged across `--author=@me` and `--committer=@me` so squash-merges still
/// appear. The two queries are run serially (not in parallel) and the result
/// is cached for 10 minutes to stay under GitHub's secondary rate limit.
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

    // Serial queries with a short pause between them. Two heavy paginated
    // searches launched concurrently is the fastest way to hit GitHub's
    // anti-abuse limiter.
    for (label, flag) in [("--author=@me", "--author"), ("--committer=@me", "--committer")] {
        match gh_search(&date, flag).await {
            Ok(rows) => {
                for c in rows {
                    let Some(repo) = c.repository.name_owner() else { continue };
                    let key = (repo.clone(), c.sha.clone());
                    merged.entry(key).or_insert_with(|| GhCommit {
                        repo,
                        sha: c.sha,
                        message: c.commit.message.lines().next().unwrap_or("").to_string(),
                        committed_at: c.commit.committer.date,
                    });
                }
            }
            Err(e) => warnings.push(format!("gh search commits {} failed: {}", label, e)),
        }
        // Tiny breather so two near-identical search requests don't burst.
        tokio::time::sleep(Duration::from_millis(750)).await;
    }

    let mut out: Vec<GhCommit> = merged.into_values().collect();
    out.sort_by(|a, b| b.committed_at.cmp(&a.committed_at));
    let result = GhTodayResult { commits: out, warnings };

    // Cache even partial results — we'd rather serve stale-but-useful data
    // than re-poke a rate-limited endpoint every five minutes.
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
        Some("You are not signed in to `gh`. Run `gh auth login` and choose GitHub.com → HTTPS, then sign in.")
    } else if lower.contains("sso")
        || lower.contains("saml")
        || lower.contains("you must authorize")
        || lower.contains("resource protected by")
    {
        Some("Your gh token is missing SAML/SSO authorization for one or more orgs. Run:\n  gh auth refresh -s read:org,repo\nThen click through the SSO prompt for each org in your browser.")
    } else if lower.contains("scope") || lower.contains("requires") || lower.contains("forbidden") {
        Some("Your gh token is missing required scopes. Run:\n  gh auth refresh -s read:org,repo")
    } else if lower.contains("secondary rate limit") {
        Some("GitHub's anti-abuse limiter is throttling rapid search calls. The app caches gh results for 10 minutes — subsequent batches will reuse the cache instead of re-querying. If this persists, lower your tracking cadence in Settings.")
    } else if lower.contains("rate limit") || lower.contains("rate-limit") || lower.contains("403") {
        Some("GitHub rate-limited the request. Wait a few minutes; the app caches gh results for 10 minutes so subsequent batches will reuse them.")
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
