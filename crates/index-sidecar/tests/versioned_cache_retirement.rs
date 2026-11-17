//! Whole-workspace retirement includes the immutable-owner lock namespace.
use arkts_index_sqlite::workspace_cache_location;
use serde_json::Value;
use std::{fs, path::Path, process::Command};
#[path = "support/maintenance_session.rs"]
#[expect(dead_code, reason = "shared public protocol helpers")]
mod session;
use session::{SidecarProcess, TestDir, init, start, terminal};

fn gc(cache: &Path, apply: bool) -> Value {
    let mut command = Command::new(env!("CARGO_BIN_EXE_arkts-index-sidecar"));
    command
        .args(["--cache-gc", "--cache-dir"])
        .arg(cache)
        .args(["--idle-ms", "0"]);
    if apply {
        command.arg("--apply");
    }
    let output = command.output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: Value = serde_json::from_slice(&output.stdout).unwrap();
    if value["entries"].as_array().is_some_and(|entries| {
        entries
            .iter()
            .any(|entry| entry["reason"] == "unsafe-cache-entry")
    }) {
        for workspace in fs::read_dir(cache.join("workspaces")).unwrap().flatten() {
            let inventory: Vec<_> = fs::read_dir(workspace.path())
                .unwrap()
                .flatten()
                .map(|entry| {
                    let meta = fs::symlink_metadata(entry.path()).unwrap();
                    (entry.file_name(), meta.is_dir(), meta.len())
                })
                .collect();
            eprintln!("unsafe-cache-inventory: {inventory:?}");
        }
    }
    value
}

#[test]
fn active_versioned_owners_are_protected_and_closed_workspaces_retire_as_one_group() {
    let temp = TestDir::new("versioned-cache-retirement");
    let root = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("Source.ets"), "export class RetireTarget {}\n").unwrap();
    let mut process = SidecarProcess::spawn();
    init(&mut process, &root, &cache);
    start(&mut process, 2, 1);
    assert_eq!(terminal(&mut process)["outcome"], "qualified");
    let location = workspace_cache_location(&cache, &root).unwrap();
    let directory = location.database_path.parent().unwrap();
    assert!(
        fs::read_dir(directory)
            .unwrap()
            .flatten()
            .any(|e| e.file_name().to_string_lossy().ends_with(".owners"))
    );
    let active = gc(&cache, true);
    assert_eq!(
        active["entries"][0]["reason"], "active-workspace",
        "{active}"
    );
    assert!(directory.exists());
    process.shutdown(3);
    let preview = gc(&cache, false);
    assert_eq!(preview["entries"][0]["outcome"], "eligible", "{preview}");
    assert_eq!(preview["removedBytes"], 0);
    assert!(
        directory.exists(),
        "preview cannot mutate even inactive owner locks"
    );
    let removed = gc(&cache, true);
    assert_eq!(removed["entries"][0]["outcome"], "removed", "{removed}");
    assert!(!directory.exists());
    assert!(root.join("Source.ets").is_file());
}

fn closed(name: &str) -> (TestDir, std::path::PathBuf, std::path::PathBuf) {
    let temp = TestDir::new(name);
    let root = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("Source.ets"), "export class StillUserSource {}\n").unwrap();
    let mut process = SidecarProcess::spawn();
    init(&mut process, &root, &cache);
    start(&mut process, 2, 1);
    assert_eq!(terminal(&mut process)["outcome"], "qualified");
    process.shutdown(3);
    let location = workspace_cache_location(&cache, &root).unwrap();
    (
        temp,
        cache,
        location.database_path.parent().unwrap().to_owned(),
    )
}

fn owners(directory: &Path) -> std::path::PathBuf {
    fs::read_dir(directory)
        .unwrap()
        .flatten()
        .find(|e| e.file_name().to_string_lossy().ends_with(".owners"))
        .unwrap()
        .path()
}

#[test]
fn unknown_children_in_an_owner_namespace_remain_protected() {
    let (_temp, cache, directory) = closed("closed-unknown-child");
    let backup = owners(&directory).join("user-backup.txt");
    fs::write(&backup, "must retain").unwrap();
    let report = gc(&cache, true);
    assert_eq!(report["entries"][0]["outcome"], "protected", "{report}");
    assert_eq!(report["entries"][0]["reason"], "unsafe-owner-entry");
    assert_eq!(fs::read_to_string(backup).unwrap(), "must retain");
    assert!(directory.exists());
}

#[cfg(unix)]
#[test]
fn linked_owner_namespaces_do_not_authorize_following_or_deleting_outside_content() {
    let (temp, cache, directory) = closed("closed-linked-owner");
    let owner = owners(&directory);
    let outside = temp.path().join("outside");
    fs::rename(&owner, &outside).unwrap();
    std::os::unix::fs::symlink(&outside, &owner).unwrap();
    let before: Vec<_> = fs::read_dir(&outside)
        .unwrap()
        .flatten()
        .map(|e| e.file_name())
        .collect();
    let report = gc(&cache, true);
    assert_eq!(report["entries"][0]["outcome"], "protected", "{report}");
    assert_eq!(report["entries"][0]["reason"], "unsafe-directory");
    assert_eq!(fs::read_dir(&outside).unwrap().count(), before.len());
    assert!(directory.exists());
}

#[cfg(unix)]
#[test]
fn a_partial_owner_directory_sweep_can_retry_using_the_original_retirement_intent() {
    use std::os::unix::fs::PermissionsExt;
    let (_temp, cache, directory) = closed("closed-partial-owner");
    let owner = owners(&directory);
    let owner_name = owner.file_name().unwrap().to_os_string();
    fs::set_permissions(&owner, fs::Permissions::from_mode(0o500)).unwrap();
    let report = gc(&cache, true);
    if unsafe { libc::geteuid() } == 0 {
        assert_eq!(report["entries"][0]["outcome"], "removed", "{report}");
        return;
    }
    assert_eq!(report["entries"][0]["outcome"], "deferred", "{report}");
    let proof = fs::read_dir(cache.join(".gc-trash"))
        .unwrap()
        .flatten()
        .find(|e| e.path().extension().is_some_and(|x| x == "json"))
        .unwrap()
        .path();
    let intent: Value = serde_json::from_slice(&fs::read(proof).unwrap()).unwrap();
    let target = cache
        .join(".gc-trash")
        .join(intent["name"].as_str().unwrap());
    let retained = if directory.exists() {
        &directory
    } else {
        &target
    };
    fs::set_permissions(
        retained.join(&owner_name),
        fs::Permissions::from_mode(0o700),
    )
    .unwrap();
    if directory.exists() {
        fs::rename(&directory, &target).unwrap();
    }
    let retried = gc(&cache, true);
    assert!(
        retried["trashResults"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e[1] == "removed"),
        "{retried}"
    );
    assert!(!target.exists());
}

#[test]
fn an_owner_shaped_filename_does_not_authorize_deleting_unexpected_content() {
    let (_temp, cache, directory) = closed("closed-owner-content");
    let backup = owners(&directory).join("abc-def-123");
    fs::write(&backup, "unexpected user content").unwrap();
    let report = gc(&cache, true);
    assert_eq!(report["entries"][0]["outcome"], "protected", "{report}");
    assert_eq!(report["entries"][0]["reason"], "unsafe-owner-entry");
    assert_eq!(
        fs::read_to_string(backup).unwrap(),
        "unexpected user content"
    );
}

#[test]
fn unknown_formats_and_mismatched_known_profiles_remain_protected() {
    for (name, sql, reason) in [
        (
            "future-schema",
            "PRAGMA user_version=9999;",
            "unsupported-schema",
        ),
        (
            "future-facts",
            "PRAGMA ignore_check_constraints=ON; UPDATE file_facts_format SET version=9999;",
            "unsupported-file-facts-format",
        ),
        (
            "wrong-layout",
            if cfg!(feature = "experimental-occurrence-without-rowid") {
                "PRAGMA ignore_check_constraints=ON; PRAGMA user_version=12; UPDATE file_facts_format SET version=8;"
            } else {
                "PRAGMA ignore_check_constraints=ON; PRAGMA user_version=112; UPDATE file_facts_format SET version=108;"
            },
            "file-facts-layout-mismatch",
        ),
    ] {
        let (_temp, cache, directory) = closed(name);
        let control = rusqlite::Connection::open(directory.join("catalog-state.sqlite3")).unwrap();
        let file: String = control
            .query_row(
                "SELECT database_name FROM catalog_state WHERE id=1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        drop(control);
        let connection = rusqlite::Connection::open(directory.join(file)).unwrap();
        connection.execute_batch(sql).unwrap();
        drop(connection);
        let report = gc(&cache, true);
        assert_eq!(report["entries"][0]["outcome"], "protected", "{report}");
        assert_eq!(report["entries"][0]["reason"], reason, "{report}");
        assert!(directory.exists());
    }
}
