mod autostart;
mod gh_cmds;
mod sysinfo_cmds;
mod tray;

#[tauri::command]
fn ping() -> &'static str {
    "pong"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            tray::build(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            sysinfo_cmds::list_processes,
            sysinfo_cmds::system_stats,
            gh_cmds::gh_today_commits,
            gh_cmds::gh_auth_status,
            autostart::autostart_status,
            autostart::set_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
