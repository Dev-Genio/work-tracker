// Per-user autostart by dropping a shortcut into the Windows Startup folder.
// %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\<SHORTCUT_NAME>

use std::path::PathBuf;

const SHORTCUT_NAME: &str = "work-tracker.lnk";

fn startup_dir() -> Result<PathBuf, String> {
    // dirs::config_dir() on Windows == %APPDATA%
    let appdata = dirs::config_dir().ok_or_else(|| "no APPDATA".to_string())?;
    Ok(appdata.join("Microsoft").join("Windows").join("Start Menu").join("Programs").join("Startup"))
}

fn shortcut_path() -> Result<PathBuf, String> {
    Ok(startup_dir()?.join(SHORTCUT_NAME))
}

#[tauri::command]
pub fn autostart_status() -> bool {
    shortcut_path().map(|p| p.exists()).unwrap_or(false)
}

#[tauri::command]
#[cfg(windows)]
pub fn set_autostart(enabled: bool) -> Result<(), String> {
    let path = shortcut_path()?;
    if enabled {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        let exe_str = exe.to_string_lossy().into_owned();
        let path_str = path.to_string_lossy().into_owned();
        let link = mslnk::ShellLink::new(&exe_str).map_err(|e| format!("{e:?}"))?;
        link.create_lnk(&path_str).map_err(|e| format!("{e:?}"))?;
    } else if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
#[cfg(not(windows))]
pub fn set_autostart(_enabled: bool) -> Result<(), String> {
    Err("autostart is only implemented on Windows".into())
}
