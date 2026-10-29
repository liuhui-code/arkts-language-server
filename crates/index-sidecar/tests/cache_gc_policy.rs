use arkts_index_sqlite::{SqliteStore, workspace_cache_location};
use serde_json::Value;
use std::{fs, path::Path, process::Command};
#[allow(dead_code)]
#[path = "support/sidecar_process.rs"]
mod support;
use support::TestDir;

fn gc(cache: &Path, args: &[&str]) -> Value {
    let output = Command::new(env!("CARGO_BIN_EXE_arkts-index-sidecar"))
        .args(["--cache-gc", "--cache-dir"])
        .arg(cache)
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn capacity_preview_and_apply_choose_the_same_oldest_idle_entry() {
    let temp = TestDir::new("gc-capacity");
    let cache = temp.path().join("cache");
    let mut locations = Vec::new();
    for i in 0..3 {
        let root = temp.path().join(format!("workspace-{i}"));
        fs::create_dir(&root).unwrap();
        let location = workspace_cache_location(&cache, &root).unwrap();
        drop(SqliteStore::open(&location.database_path, &location.workspace_identity).unwrap());
        let record = location
            .database_path
            .parent()
            .unwrap()
            .join("cache-use.json");
        let mut value: Value = serde_json::from_slice(&fs::read(&record).unwrap()).unwrap();
        value["lastUsedMs"] = Value::from(1000 + i);
        fs::write(record, serde_json::to_vec(&value).unwrap()).unwrap();
        locations.push(location);
    }
    let all = gc(&cache, &["--idle-ms", "0"]);
    let oldest_key = locations[0]
        .database_path
        .parent()
        .unwrap()
        .file_name()
        .unwrap()
        .to_str()
        .unwrap();
    let oldest = all["entries"]
        .as_array()
        .unwrap()
        .iter()
        .find(|entry| entry["key"] == oldest_key)
        .unwrap();
    let budget =
        (all["observedBytes"].as_u64().unwrap() - oldest["bytes"].as_u64().unwrap()).to_string();
    let preview = gc(&cache, &["--idle-ms", "0", "--max-bytes", &budget]);
    assert_eq!(
        preview["entries"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|item| item["outcome"] == "eligible")
            .count(),
        1
    );
    assert_eq!(preview["budgetUnmet"], false);
    let result = gc(
        &cache,
        &["--apply", "--idle-ms", "0", "--max-bytes", &budget],
    );
    assert_eq!(
        result["entries"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|item| item["outcome"] == "removed")
            .count(),
        1
    );
    assert!(!locations[0].database_path.exists());
    assert!(locations[1].database_path.exists());
    assert!(locations[2].database_path.exists());
    assert_eq!(result["budgetUnmet"], false);
}

#[test]
fn capacity_cannot_override_an_active_owner_or_a_partial_inventory() {
    let temp = TestDir::new("gc-capacity-protected");
    let cache = temp.path().join("cache");
    let mut stores = Vec::new();
    for i in 0..2 {
        let root = temp.path().join(format!("workspace-{i}"));
        fs::create_dir(&root).unwrap();
        let location = workspace_cache_location(&cache, &root).unwrap();
        stores.push(
            SqliteStore::open(&location.database_path, &location.workspace_identity).unwrap(),
        );
    }
    let result = gc(
        &cache,
        &[
            "--apply",
            "--idle-ms",
            "0",
            "--max-bytes",
            "0",
            "--limit",
            "1",
        ],
    );
    assert_eq!(result["removedBytes"], 0);
    assert!(result["observedBytes"].as_u64().unwrap() > 0);
    assert_eq!(result["budgetUnmet"], true);
    drop(stores);
}

#[test]
fn automatic_runs_resume_inventory_and_share_a_cooldown() {
    let temp = TestDir::new("gc-auto-cursor");
    let cache = temp.path().join("cache");
    for i in 0..3 {
        let root = temp.path().join(format!("workspace-{i}"));
        fs::create_dir(&root).unwrap();
        let location = workspace_cache_location(&cache, &root).unwrap();
        drop(SqliteStore::open(&location.database_path, &location.workspace_identity).unwrap());
    }
    let args = ["--automatic", "--apply", "--limit", "1"];
    let first = gc(&cache, &args);
    let second = gc(&cache, &args);
    let third = gc(&cache, &args);
    assert_eq!(first["scanned"], 1);
    assert_ne!(first["entries"][0]["key"], second["entries"][0]["key"]);
    assert_ne!(second["entries"][0]["key"], third["entries"][0]["key"]);
    assert_eq!(third["nextCursor"], Value::Null);
    assert_eq!(gc(&cache, &args)["status"], "cooldown");
}

#[test]
fn an_automatic_report_write_failure_still_returns_the_actual_removal_result() {
    let temp = TestDir::new("gc-report-failure");
    let cache = temp.path().join("cache");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let location = workspace_cache_location(&cache, &root).unwrap();
    drop(SqliteStore::open(&location.database_path, &location.workspace_identity).unwrap());
    fs::create_dir(cache.join(".gc-last-report.json")).unwrap();
    let report = gc(&cache, &["--automatic", "--apply", "--idle-ms", "0"]);
    assert_eq!(report["entries"][0]["outcome"], "removed");
    assert!(report["removedBytes"].as_u64().unwrap() > 0);
    assert_eq!(report["issues"].as_array().unwrap().len(), 1);
    assert!(!location.database_path.exists());
}

#[test]
fn observed_active_use_protects_a_long_running_cache_after_abnormal_exit() {
    let temp = TestDir::new("gc-last-active");
    let cache = temp.path().join("cache");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let mut process = support::SidecarProcess::spawn();
    assert_eq!(
        support::initialize(&mut process, &root, &cache, 1)["ok"],
        true
    );
    let location = workspace_cache_location(&cache, &root).unwrap();
    let record = location
        .database_path
        .parent()
        .unwrap()
        .join("cache-use.json");
    let mut value: Value = serde_json::from_slice(&fs::read(&record).unwrap()).unwrap();
    value["lastUsedMs"] = Value::from(1);
    fs::write(record, serde_json::to_vec(&value).unwrap()).unwrap();
    assert_eq!(
        gc(&cache, &["--apply"])["entries"][0]["reason"],
        "active-workspace"
    );
    drop(process); // abrupt termination cannot update the normal close timestamp
    let report = gc(&cache, &["--apply"]);
    assert_eq!(report["entries"][0]["reason"], "recently-used");
    assert!(location.database_path.exists());
}
