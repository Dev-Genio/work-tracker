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

/// Shells out to `gh search commits --author=@me --committer-date=>=<since>`
/// and returns parsed commits. `since` is an ISO date (YYYY-MM-DD); defaults
/// to today in the user's local timezone.
#[tauri::command]
pub async fn gh_today_commits(since: Option<String>) -> Result<Vec<GhCommit>, String> {
    let date = since.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());
    // Validate date shape: YYYY-MM-DD, digits + dashes only. Refuse anything else
    // before it touches the shell-out argument.
    if date.len() != 10
        || !date
            .chars()
            .all(|c| c.is_ascii_digit() || c == '-')
    {
        return Err("invalid since date".into());
    }

    let mut cmd = Command::new("gh");
    cmd.arg("search")
        .arg("commits")
        .arg("--author=@me")
        .arg(format!("--committer-date=>={}", date))
        .arg("--json")
        .arg("sha,commit,repository")
        .arg("--limit")
        .arg("100");

    // Suppress the console window that flashes when shelling out to gh on
    // Windows. CREATE_NO_WINDOW = 0x08000000. tokio::process::Command exposes
    // creation_flags() directly on Windows.
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

    let raw: Vec<RawCommit> = serde_json::from_slice(&out.stdout)
        .map_err(|e| format!("parse gh output: {e}"))?;

    Ok(raw
        .into_iter()
        .map(|c| GhCommit {
            repo: c.repository.name_with_owner,
            sha: c.sha,
            // First line only — full body is noisy in summaries.
            message: c
                .commit
                .message
                .lines()
                .next()
                .unwrap_or("")
                .to_string(),
            committed_at: c.commit.committer.date,
        })
        .collect())
}
