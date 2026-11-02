use crate::sidecar_process::{SidecarProcess, initialize};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
fn control(path: &Path) -> Option<PathBuf> {
    for entry in fs::read_dir(path).unwrap() {
        let path = entry.unwrap().path();
        if path.file_name().unwrap() == "catalog-state.sqlite3" {
            return Some(path);
        }
        if path.is_dir()
            && let Some(found) = control(&path)
        {
            return Some(found);
        }
    }
    None
}
pub(crate) fn stored(cache: &Path) -> (String, Option<String>) {
    rusqlite::Connection::open(control(cache).unwrap())
        .unwrap()
        .query_row(
            "SELECT database_name,fingerprint FROM catalog_state WHERE id=1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap()
}
pub(crate) fn count(trace: &Path, event_name: &str) -> usize {
    fs::read_to_string(trace)
        .unwrap_or_default()
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter(|event| event["event"] == event_name)
        .count()
}
pub(crate) fn parsed(trace: &Path) -> usize {
    count(trace, "parser_call")
}
pub(crate) fn wait_trace(trace: &Path, event_name: &str) {
    let deadline = Instant::now() + Duration::from_secs(15);
    while count(trace, event_name) == 0 {
        assert!(Instant::now() < deadline, "missing {event_name} trace gate");
        std::thread::sleep(Duration::from_millis(5));
    }
}
pub(crate) fn start(process: &mut SidecarProcess, id: u64) {
    assert_eq!(
        process.request(json!({"protocol":1,"id":id,"method":"catalog/start",
        "params":{"force":false,"reason":"hash-first"}}))["ok"],
        true
    );
}
pub(crate) fn terminal(process: &mut SidecarProcess) -> (Value, Vec<String>) {
    let mut stages = Vec::new();
    loop {
        let event = process.read_event();
        let status = &event["params"]["status"];
        if let Some(stage) = status["storage"]["stage"].as_str() {
            stages.push(stage.to_owned());
        }
        if matches!(
            status["phase"].as_str(),
            Some("ready" | "partial" | "degraded" | "cancelled")
        ) {
            return (status.clone(), stages);
        }
    }
}
pub(crate) fn build(process: &mut SidecarProcess, id: u64) -> Vec<String> {
    start(process, id);
    let (status, stages) = terminal(process);
    assert_eq!(status["phase"], "ready", "{status}");
    assert_eq!(status["indexed"], 8);
    stages
}
pub(crate) fn create(workspace: &Path, count: usize) {
    fs::create_dir(workspace).unwrap();
    for index in 0..count {
        fs::write(
            workspace.join(format!("{index:04}.ets")),
            format!("export class HashFirst{index} {{}}"),
        )
        .unwrap();
    }
}
pub(crate) fn seed(workspace: &Path, cache: &Path) {
    let mut process = SidecarProcess::spawn();
    assert_eq!(initialize(&mut process, workspace, cache, 1)["ok"], true);
    start(&mut process, 2);
    assert_eq!(terminal(&mut process).0["phase"], "ready");
    assert!(
        stored(cache)
            .1
            .unwrap()
            .starts_with("arkts-complete-scan-v2:")
    );
    process.shutdown(3);
}
pub(crate) fn assert_old(process: &mut SidecarProcess, id: u64) {
    let result = process.request(json!({"protocol":1,"id":id,"method":"search",
        "params":{"query":"HashFirst0","limit":10}}));
    assert_eq!(result["result"]["servedGeneration"], 1);
    assert_eq!(result["result"]["items"].as_array().unwrap().len(), 1);
}
