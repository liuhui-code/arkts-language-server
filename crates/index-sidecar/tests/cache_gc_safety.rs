use arkts_index_sqlite::{SqliteStore, cache_key, workspace_cache_location};
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

fn legacy(temp: &TestDir) -> (std::path::PathBuf, std::path::PathBuf) {
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let location = workspace_cache_location(temp.path().join("cache"), &root).unwrap();
    drop(SqliteStore::open(&location.database_path, &location.workspace_identity).unwrap());
    fs::remove_file(
        location
            .database_path
            .parent()
            .unwrap()
            .join("cache-use.json"),
    )
    .unwrap();
    (root, location.database_path.parent().unwrap().to_owned())
}

#[test]
fn missing_non_temporary_roots_and_unsupported_uri_authorities_are_protected() {
    for identity in [
        "file:///Volumes/offline-device-arkts/project",
        "file://network-share/project",
    ] {
        let temp = TestDir::new("gc-offline");
        let directory = temp
            .path()
            .join("cache/workspaces")
            .join(cache_key(identity));
        drop(SqliteStore::open(directory.join("symbols-v2.sqlite3"), identity).unwrap());
        fs::remove_file(directory.join("cache-use.json")).unwrap();
        let report = gc(
            &temp.path().join("cache"),
            &["--apply", "--include-legacy", "--orphan-grace-ms", "0"],
        );
        assert_eq!(report["entries"][0]["outcome"], "protected");
        assert!(directory.exists());
        assert_eq!(report["removedBytes"], 0);
    }
}

#[test]
fn unknown_files_and_wrong_cache_keys_are_never_swept() {
    let temp = TestDir::new("gc-foreign");
    let (root, directory) = legacy(&temp);
    fs::remove_dir(root).unwrap();
    fs::write(directory.join("user-backup.txt"), "retain").unwrap();
    assert_eq!(
        gc(&temp.path().join("cache"), &["--apply", "--include-legacy"])["entries"][0]["reason"],
        "unsafe-cache-entry"
    );
    assert_eq!(
        fs::read_to_string(directory.join("user-backup.txt")).unwrap(),
        "retain"
    );
    fs::remove_file(directory.join("user-backup.txt")).unwrap();
    let wrong = directory.parent().unwrap().join("f".repeat(64));
    fs::rename(&directory, &wrong).unwrap();
    assert_eq!(
        gc(&temp.path().join("cache"), &["--apply", "--include-legacy"])["entries"][0]["reason"],
        "identity-key-mismatch"
    );
    assert!(wrong.exists());
}

#[test]
fn modified_database_and_future_schema_do_not_inherit_a_missing_proof() {
    let temp = TestDir::new("gc-proof-change");
    let (root, directory) = legacy(&temp);
    fs::remove_dir(root).unwrap();
    let cache = temp.path().join("cache");
    let args = ["--apply", "--include-legacy", "--orphan-grace-ms", "0"];
    gc(&cache, &args);
    let connection = rusqlite::Connection::open(directory.join("symbols-v2.sqlite3")).unwrap();
    connection
        .execute("UPDATE metadata SET committed_generation=2", [])
        .unwrap();
    drop(connection);
    assert_eq!(gc(&cache, &args)["entries"][0]["outcome"], "observing");
    let connection = rusqlite::Connection::open(directory.join("symbols-v2.sqlite3")).unwrap();
    connection
        .pragma_update(None, "user_version", 9999)
        .unwrap();
    drop(connection);
    assert_eq!(
        gc(&cache, &args)["entries"][0]["reason"],
        "unsupported-schema"
    );
    assert!(directory.exists());
}

#[test]
fn preview_pagination_reports_a_cursor_without_marking_missing_roots() {
    let temp = TestDir::new("gc-pages");
    let (_, directory) = legacy(&temp);
    fs::create_dir(directory.parent().unwrap().join("f".repeat(64))).unwrap();
    let first = gc(
        &temp.path().join("cache"),
        &["--include-legacy", "--limit", "1"],
    );
    assert_eq!(first["status"], "partial");
    assert_eq!(first["scanned"], 1);
    let cursor = first["nextCursor"].as_str().unwrap();
    let second = gc(
        &temp.path().join("cache"),
        &["--include-legacy", "--limit", "1", "--after-key", cursor],
    );
    assert_eq!(second["scanned"], 1);
    assert_ne!(first["entries"][0]["key"], second["entries"][0]["key"]);
    assert!(!temp.path().join("cache/.gc-state").exists());
}

#[cfg(unix)]
#[test]
fn a_symlinked_workspace_cache_is_not_followed() {
    let temp = TestDir::new("gc-symlink");
    let (_, directory) = legacy(&temp);
    let outside = temp.path().join("outside");
    fs::rename(&directory, &outside).unwrap();
    std::os::unix::fs::symlink(&outside, &directory).unwrap();
    let report = gc(&temp.path().join("cache"), &["--apply", "--include-legacy"]);
    assert_eq!(report["entries"][0]["outcome"], "protected");
    assert!(outside.join("symbols-v2.sqlite3").exists());
}

#[cfg(unix)]
#[test]
fn a_dangling_cache_root_is_rejected_instead_of_reported_as_empty() {
    let temp = TestDir::new("gc-dangling-root");
    let cache = temp.path().join("cache");
    std::os::unix::fs::symlink(temp.path().join("unavailable"), &cache).unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_arkts-index-sidecar"))
        .args(["--cache-gc", "--cache-dir"])
        .arg(&cache)
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("unsafe-directory"));
    assert!(
        fs::symlink_metadata(cache)
            .unwrap()
            .file_type()
            .is_symlink()
    );
}

#[cfg(unix)]
#[test]
fn a_failed_directory_delete_is_recorded_and_retried_from_trash() {
    use std::os::unix::fs::PermissionsExt;
    let temp = TestDir::new("gc-trash-retry");
    let (root, directory) = legacy(&temp);
    fs::remove_dir(root).unwrap();
    let cache = temp.path().join("cache");
    let args = ["--apply", "--include-legacy", "--orphan-grace-ms", "0"];
    gc(&cache, &args);
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o500)).unwrap();
    let report = gc(&cache, &args);
    if unsafe { libc::geteuid() } == 0 {
        assert_eq!(report["entries"][0]["outcome"], "removed");
        return;
    }
    assert_eq!(report["entries"][0]["outcome"], "deferred");
    let proof = fs::read_dir(cache.join(".gc-trash"))
        .unwrap()
        .flatten()
        .find(|item| item.path().extension().is_some_and(|ext| ext == "json"))
        .unwrap()
        .path();
    let intent: Value = serde_json::from_slice(&fs::read(proof).unwrap()).unwrap();
    let pending = cache
        .join(".gc-trash")
        .join(intent["name"].as_str().unwrap());
    assert_ne!(
        directory.exists(),
        pending.exists(),
        "exactly one copy must survive the failed operation"
    );
    if directory.exists() {
        // macOS may reject rename itself; Linux may permit it and reject unlink inside.
        assert!(
            report["entries"][0]["reason"]
                .as_str()
                .unwrap()
                .starts_with("retire-deferred")
        );
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).unwrap();
        // Model a crash immediately AFTER the atomic rename, using the CLI's actual durable intent.
        fs::rename(&directory, &pending).unwrap();
    } else {
        assert!(
            report["entries"][0]["reason"]
                .as_str()
                .unwrap()
                .starts_with("delete-deferred")
        );
    }
    fs::set_permissions(&pending, fs::Permissions::from_mode(0o700)).unwrap();
    let report = gc(&cache, &args);
    assert!(
        report["trashResults"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item[1] == "removed")
    );
    assert!(!pending.exists());
}

#[cfg(windows)]
#[test]
fn windows_open_handle_defers_retirement_then_allows_retry() {
    use std::os::windows::fs::OpenOptionsExt;
    let temp = TestDir::new("gc-windows-held");
    let (root, directory) = legacy(&temp);
    fs::remove_dir(root).unwrap();
    let cache = temp.path().join("cache");
    let args = ["--apply", "--include-legacy", "--orphan-grace-ms", "0"];
    gc(&cache, &args);
    // Permit concurrent reads/writes, refuse delete sharing: a real Windows file occupancy.
    let held = fs::OpenOptions::new()
        .read(true)
        .share_mode(3)
        .open(directory.join("symbols-v2.sqlite3"))
        .unwrap();
    let report = gc(&cache, &args);
    assert_eq!(report["entries"][0]["outcome"], "deferred");
    assert!(directory.exists());
    drop(held);
    assert_eq!(gc(&cache, &args)["entries"][0]["outcome"], "removed");
}
