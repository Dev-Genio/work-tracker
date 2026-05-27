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
/// once by committer — and merge the results so squash-merges (where you're
/// the author but someone else committed) still show up. Requires `gh` to be
/// authenticated with sufficient scopes (`repo`, `read:org`) for the user's
/// orgs.
#[tauri::command]
pub async fn gh_today_commits(since: Option<String>) -> Result<Vec<GhCommit>, String> {
    let date = since.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());
    if date.len() != 10 || !date.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err("invalid since date".into());
    }

    // Search GitHub-wide for both roles. Errors from either query are
    // tolerated so a partial result is better than nothing.
    let (by_author, by_committer) = tokio::join!(
        gh_search(&date, "--author"),
        gh_search(&date, "--committer"),
    );

    let mut merged: HashMap<(String, String), GhCommit> = HashMap::new();
    for batch in [by_author, by_committer] {
        if let Ok(rows) = batch {
            for c in rows {
                let key = (c.repository.name_with_owner.clone(), c.sha.clone());
                merged.entry(key).or_insert_with(|| GhCommit {
                    repo: c.repository.name_with_owner,
                    sha: c.sha,
                    message: c
                        .commit
                        .message
                        .lines()
                        .next()
                        .unwrap_or("")
                        .to_string(),
                    committed_at: c.commit.committer.date,
                });
            }
        }
    }

    let mut out: Vec<GhCommit> = merged.into_values().collect();
    // Newest first.
    out.sort_by(|a, b| b.committed_at.cmp(&a.committed_at));
    Ok(out)
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
        .map_err(|e| format!("failed to spawn gh: {e}"))?;

    if !out.status.success() {
        return Err(format!(
            "gh exited {}: {}",
            out.status,
            String::from_utf8_lossy(&out.stderr)
        ));
    }

    serde_json::from_slice(&out.stdout).map_err(|e| format!("parse gh output: {e}"))
}
