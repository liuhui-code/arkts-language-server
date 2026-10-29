use arkts_index_sqlite::{SqliteStore, workspace_cache_location};
use serde_json::Value;
use std::{
    fs,
    io::Read,
    path::Path,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

#[expect(
    dead_code,
    reason = "this integration crate uses only initialization from the shared protocol fixture"
)]
#[path = "support/sidecar_process.rs"]
mod sidecar_process;
use sidecar_process::TestDir;

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
    serde_json::from_slice(&output.stdout).expect("cache CLI must return one JSON report")
}

fn fixture(temp: &TestDir) -> (std::path::PathBuf, std::path::PathBuf, String) {
    let root = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir(&root).unwrap();
    let location = workspace_cache_location(&cache, &root).unwrap();
    drop(SqliteStore::open(&location.database_path, &location.workspace_identity).unwrap());
    let directory = location.database_path.parent().unwrap().to_owned();
    let _ = fs::remove_file(directory.join("cache-use.json"));
    (root, directory, location.workspace_identity)
}

#[test]
fn preview_identifies_a_real_legacy_database_without_modifying_it() {
    let temp = TestDir::new("gc-preview");
    let (root, directory, identity) = fixture(&temp);
    fs::remove_dir(&root).unwrap();
    let database = directory.join("symbols-v2.sqlite3");
    let before = fs::read(&database).unwrap();
    let modified = fs::metadata(&database).unwrap().modified().unwrap();
    let report = gc(&temp.path().join("cache"), &["--include-legacy"]);
    assert_eq!(report["apply"], false);
    assert_eq!(report["scanned"], 1);
    assert_eq!(report["entries"][0]["workspaceIdentity"], identity);
    assert_eq!(report["entries"][0]["legacy"], true);
    assert_eq!(report["entries"][0]["reason"], "missing-grace-unobserved");
    assert_eq!(fs::read(&database).unwrap(), before);
    assert_eq!(
        fs::metadata(&database).unwrap().modified().unwrap(),
        modified
    );
    assert!(!temp.path().join("cache/.gc-state").exists());
}

#[test]
fn legacy_orphan_is_observed_then_retired_as_one_directory() {
    let temp = TestDir::new("gc-legacy");
    let (root, directory, _) = fixture(&temp);
    fs::remove_dir(&root).unwrap();
    // Valid persisted SQLite side files are retired with the database, never separately.
    fs::write(directory.join("symbols-v2.sqlite3-wal"), []).unwrap();
    fs::write(directory.join("symbols-v2.sqlite3-shm"), []).unwrap();
    let cache = temp.path().join("cache");
    let options = ["--include-legacy", "--apply", "--orphan-grace-ms", "0"];
    let first = gc(&cache, &options);
    assert_eq!(first["entries"][0]["outcome"], "observing");
    assert!(directory.exists());
    let next = gc(&cache, &options);
    assert_eq!(next["entries"][0]["outcome"], "removed");
    assert!(next["removedBytes"].as_u64().unwrap() > 0);
    assert!(!directory.exists());
}

#[test]
fn an_active_store_is_protected_and_its_last_use_survives_close() {
    let temp = TestDir::new("gc-active");
    let (_, directory, identity) = fixture(&temp);
    let store = SqliteStore::open(directory.join("symbols-v2.sqlite3"), &identity).unwrap();
    let cache = temp.path().join("cache");
    let result = gc(&cache, &["--apply", "--idle-ms", "0"]);
    assert_eq!(result["entries"][0]["reason"], "active-workspace");
    assert!(directory.exists());
    drop(store);
    assert!(directory.join("cache-use.json").exists());
    let result = gc(&cache, &["--apply", "--idle-ms", "0"]);
    assert_eq!(result["entries"][0]["outcome"], "removed");
}

#[test]
fn restoring_a_missing_source_resets_the_missing_observation() {
    let temp = TestDir::new("gc-restored");
    let (root, directory, _) = fixture(&temp);
    fs::remove_dir(&root).unwrap();
    let cache = temp.path().join("cache");
    let args = ["--apply", "--include-legacy", "--orphan-grace-ms", "0"];
    gc(&cache, &args);
    fs::create_dir(&root).unwrap();
    assert_eq!(
        gc(&cache, &args)["entries"][0]["reason"],
        "legacy-last-use-unknown"
    );
    fs::remove_dir(&root).unwrap();
    assert_eq!(gc(&cache, &args)["entries"][0]["outcome"], "observing");
    assert!(directory.exists());
}

#[test]
fn a_collector_does_not_compete_with_another_collector() {
    let temp = TestDir::new("gc-competing");
    let (_, directory, _) = fixture(&temp);
    let cache = temp.path().join("cache");
    let lock = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .read(true)
        .open(cache.join(".gc-run.lock"))
        .unwrap();
    lock.lock().unwrap();
    assert_eq!(gc(&cache, &["--apply"])["status"], "busy");
    assert!(directory.exists());
}

#[test]
fn legacy_holder_process() {
    let Some(database) = std::env::var_os("ARKTS_GC_LEGACY_DB") else {
        return;
    };
    let connection = rusqlite::Connection::open(database).unwrap();
    let _: String = connection
        .query_row("SELECT workspace_identity FROM metadata", [], |r| r.get(0))
        .unwrap();
    if std::env::var_os("ARKTS_GC_LEGACY_WRITE").is_some() {
        connection
            .execute_batch(
                "PRAGMA wal_autocheckpoint=0; UPDATE metadata SET committed_generation=2;",
            )
            .unwrap();
    }
    fs::write(std::env::var_os("ARKTS_GC_LEGACY_READY").unwrap(), "ready").unwrap();
    let _ = std::io::stdin().read_to_end(&mut Vec::new());
    drop(connection);
}

#[test]
fn a_legacy_wal_reader_without_our_lease_blocks_retirement() {
    let temp = TestDir::new("gc-legacy-reader");
    let (root, directory, _) = fixture(&temp);
    fs::remove_dir(&root).unwrap();
    let cache = temp.path().join("cache");
    let args = ["--apply", "--include-legacy", "--orphan-grace-ms", "0"];
    gc(&cache, &args);
    let ready = temp.path().join("ready");
    let mut child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "legacy_holder_process", "--nocapture"])
        .env("ARKTS_GC_LEGACY_DB", directory.join("symbols-v2.sqlite3"))
        .env("ARKTS_GC_LEGACY_READY", &ready)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    while !ready.exists() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(ready.exists(), "legacy reader did not start");
    let result = gc(&cache, &args);
    assert_eq!(result["entries"][0]["outcome"], "protected");
    assert!(
        result["entries"][0]["reason"]
            .as_str()
            .unwrap()
            .starts_with("sqlite-in-use-or-unverifiable")
    );
    assert!(directory.exists());
    drop(child.stdin.take());
    assert!(child.wait().unwrap().success());
    // Closing the last WAL connection may checkpoint, so any changed DB must be re-observed.
    let result = gc(&cache, &args);
    if result["entries"][0]["outcome"] == "observing" {
        assert_eq!(gc(&cache, &args)["entries"][0]["outcome"], "removed");
    } else {
        assert_eq!(result["entries"][0]["outcome"], "removed");
    }
}

#[test]
fn automatic_collection_protects_legacy_but_reclaims_registered_orphans() {
    let temp = TestDir::new("gc-auto");
    let (root, directory, identity) = fixture(&temp);
    let cache = temp.path().join("cache");
    let args = [
        "--automatic",
        "--apply",
        "--interval-ms",
        "0",
        "--orphan-grace-ms",
        "0",
    ];
    assert_eq!(
        gc(&cache, &args)["entries"][0]["reason"],
        "legacy-opt-in-required"
    );
    drop(SqliteStore::open(directory.join("symbols-v2.sqlite3"), &identity).unwrap());
    fs::remove_dir(&root).unwrap();
    assert_eq!(gc(&cache, &args)["entries"][0]["outcome"], "observing");
    assert_eq!(gc(&cache, &args)["entries"][0]["outcome"], "removed");
}

#[test]
fn one_window_closing_does_not_release_another_windows_cache_use() {
    let temp = TestDir::new("gc-multiple-owners");
    let (_, directory, identity) = fixture(&temp);
    let first = SqliteStore::open(directory.join("symbols-v2.sqlite3"), &identity).unwrap();
    let second = SqliteStore::open(directory.join("symbols-v2.sqlite3"), &identity).unwrap();
    drop(first);
    let report = gc(&temp.path().join("cache"), &["--apply", "--idle-ms", "0"]);
    assert_eq!(report["entries"][0]["reason"], "active-workspace");
    assert!(directory.exists());
    drop(second);
    assert_eq!(
        gc(&temp.path().join("cache"), &["--apply", "--idle-ms", "0"])["entries"][0]["outcome"],
        "removed"
    );
}

#[test]
fn abnormal_sidecar_exit_does_not_leave_a_permanent_use_lock() {
    let temp = TestDir::new("gc-crash");
    let root = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir(&root).unwrap();
    {
        let mut process = sidecar_process::SidecarProcess::spawn();
        assert_eq!(
            sidecar_process::initialize(&mut process, &root, &cache, 1)["ok"],
            true
        );
        // Harness Drop kills and waits for the process, intentionally bypassing shutdown.
    }
    let location = workspace_cache_location(&cache, &root).unwrap();
    drop(SqliteStore::open(&location.database_path, &location.workspace_identity).unwrap());
    assert_eq!(
        gc(&cache, &["--apply", "--idle-ms", "0"])["entries"][0]["outcome"],
        "removed"
    );
}

#[test]
fn a_crashed_legacy_writers_new_wal_revokes_the_missing_observation() {
    let temp = TestDir::new("gc-crashed-writer");
    let (root, directory, _) = fixture(&temp);
    fs::remove_dir(root).unwrap();
    let cache = temp.path().join("cache");
    let args = ["--apply", "--include-legacy", "--orphan-grace-ms", "0"];
    gc(&cache, &args);
    let database = directory.join("symbols-v2.sqlite3");
    let before = fs::read(&database).unwrap();
    let modified = fs::metadata(&database).unwrap().modified().unwrap();
    let ready = temp.path().join("ready");
    let mut child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "legacy_holder_process", "--nocapture"])
        .env("ARKTS_GC_LEGACY_DB", &database)
        .env("ARKTS_GC_LEGACY_WRITE", "1")
        .env("ARKTS_GC_LEGACY_READY", &ready)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    while !ready.exists() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(ready.exists());
    child.kill().unwrap();
    child.wait().unwrap();
    assert_eq!(fs::read(&database).unwrap(), before);
    assert_eq!(
        fs::metadata(&database).unwrap().modified().unwrap(),
        modified
    );
    assert!(
        directory
            .join("symbols-v2.sqlite3-wal")
            .metadata()
            .unwrap()
            .len()
            > 0
    );
    assert_eq!(gc(&cache, &args)["entries"][0]["outcome"], "observing");
    assert!(directory.exists());
}

#[test]
fn an_explicitly_approved_legacy_orphan_can_finish_its_grace_in_automatic_mode() {
    let temp = TestDir::new("gc-approved-legacy");
    let (root, directory, _) = fixture(&temp);
    fs::remove_dir(root).unwrap();
    let cache = temp.path().join("cache");
    assert_eq!(
        gc(
            &cache,
            &["--apply", "--include-legacy", "--orphan-grace-ms", "0"]
        )["entries"][0]["outcome"],
        "observing"
    );
    let report = gc(
        &cache,
        &[
            "--automatic",
            "--apply",
            "--interval-ms",
            "0",
            "--orphan-grace-ms",
            "0",
        ],
    );
    assert_eq!(report["entries"][0]["outcome"], "removed");
    assert!(!directory.exists());
}

#[test]
fn a_legacy_identity_only_in_wal_is_inspected_without_writing_the_original() {
    let temp = TestDir::new("gc-wal-identity");
    let root = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir(&root).unwrap();
    {
        let mut process = sidecar_process::SidecarProcess::spawn();
        assert_eq!(
            sidecar_process::initialize(&mut process, &root, &cache, 1)["ok"],
            true
        );
    }
    let location = workspace_cache_location(&cache, &root).unwrap();
    let directory = location.database_path.parent().unwrap();
    fs::remove_file(directory.join("cache-use.json")).unwrap();
    fs::remove_dir(root).unwrap();
    let before = fs::read(&location.database_path).unwrap();
    assert_eq!(
        u32::from_be_bytes(before[68..72].try_into().unwrap()),
        0,
        "this reproducer must keep application_id only in the WAL"
    );
    let wal = directory.join("symbols-v2.sqlite3-wal");
    let wal_before = fs::read(&wal).unwrap();
    let modified = fs::metadata(&wal).unwrap().modified().unwrap();
    let report = gc(&cache, &["--include-legacy"]);
    assert_eq!(
        report["entries"][0]["workspaceIdentity"],
        location.workspace_identity
    );
    assert_eq!(report["entries"][0]["reason"], "missing-grace-unobserved");
    assert_eq!(fs::read(&location.database_path).unwrap(), before);
    assert_eq!(fs::read(&wal).unwrap(), wal_before);
    assert_eq!(fs::metadata(&wal).unwrap().modified().unwrap(), modified);
}
