use serde::Serialize;
use sysinfo::System;

#[derive(Serialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu: f32,
    #[serde(rename = "memMb")]
    pub mem_mb: u64,
}

#[derive(Serialize)]
pub struct SystemStats {
    #[serde(rename = "cpuPercent")]
    pub cpu_percent: f32,
    #[serde(rename = "memUsedMb")]
    pub mem_used_mb: u64,
    #[serde(rename = "memTotalMb")]
    pub mem_total_mb: u64,
}

// We sample twice with a short delay because sysinfo's per-process CPU
// is a delta between two refreshes.
fn sample() -> System {
    let mut sys = System::new_all();
    sys.refresh_all();
    std::thread::sleep(std::time::Duration::from_millis(250));
    sys.refresh_all();
    sys
}

#[tauri::command]
pub fn list_processes(top: Option<usize>) -> Vec<ProcessInfo> {
    let sys = sample();
    let mut list: Vec<ProcessInfo> = sys
        .processes()
        .iter()
        .map(|(pid, p)| ProcessInfo {
            pid: pid.as_u32(),
            name: p.name().to_string_lossy().into_owned(),
            cpu: p.cpu_usage(),
            mem_mb: p.memory() / 1024 / 1024,
        })
        .collect();
    list.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal));
    list.truncate(top.unwrap_or(25));
    list
}

#[tauri::command]
pub fn system_stats() -> SystemStats {
    let sys = sample();
    let cpu = sys.global_cpu_usage();
    SystemStats {
        cpu_percent: cpu,
        mem_used_mb: sys.used_memory() / 1024 / 1024,
        mem_total_mb: sys.total_memory() / 1024 / 1024,
    }
}
