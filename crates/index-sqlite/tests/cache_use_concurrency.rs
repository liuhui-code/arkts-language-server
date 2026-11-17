//! Real managed-cache use-record writers; no product files or SQLite internals.
use arkts_index_sqlite::{cache_gc::lease::CacheLease, workspace_cache_location};
use std::{
    fs,
    sync::{Arc, Barrier},
};
#[path = "support/temp_dir.rs"]
mod temp_dir;
#[test]
fn concurrent_valid_use_records_do_not_fail_open_or_close_of_a_managed_workspace() {
    let temp = temp_dir::TestDir::new("cache-use-concurrency");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let location = workspace_cache_location(temp.path().join("cache"), &root).unwrap();
    let seed = CacheLease::acquire(&location.database_path, &location.workspace_identity)
        .unwrap()
        .unwrap();
    seed.record_use().unwrap();
    let iterations: usize = std::env::var("ARKTS_INDEX_TEST_USE_RECORD_ITERATIONS")
        .map_or(32, |n| n.parse().expect("positive test iteration count"));
    assert!(iterations > 0);
    let barrier = Arc::new(Barrier::new(8));
    let handles: Vec<_> = (0..8)
        .map(|_| {
            let barrier = Arc::clone(&barrier);
            let database = location.database_path.clone();
            let identity = location.workspace_identity.clone();
            std::thread::spawn(move || {
                let lease = CacheLease::acquire(&database, &identity).unwrap().unwrap();
                barrier.wait();
                let mut errors = Vec::new();
                for _ in 0..iterations {
                    if let Err(error) = lease.record_use() {
                        errors.push(error);
                    }
                }
                errors
            })
        })
        .collect();
    let errors: Vec<_> = handles
        .into_iter()
        .flat_map(|t| t.join().unwrap())
        .collect();
    assert!(
        errors.is_empty(),
        "valid concurrent metadata replacements were rejected: count={}, sample={:?}",
        errors.len(),
        &errors[..errors.len().min(12)]
    );
    seed.record_use().unwrap();
    let value: serde_json::Value = serde_json::from_slice(
        &fs::read(location.database_path.with_file_name("cache-use.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(value["workspaceIdentity"], location.workspace_identity);
}

#[test]
fn a_writer_for_one_workspace_does_not_lock_unrelated_workspace_use_records() {
    use std::{fs::OpenOptions, sync::mpsc, time::Duration};
    let temp = temp_dir::TestDir::new("cache-use-independent");
    let cache = temp.path().join("cache");
    let mut locations = Vec::new();
    for name in ["a", "b"] {
        let root = temp.path().join(name);
        fs::create_dir(&root).unwrap();
        locations.push(workspace_cache_location(&cache, &root).unwrap());
    }
    let a = CacheLease::acquire(
        &locations[0].database_path,
        &locations[0].workspace_identity,
    )
    .unwrap()
    .unwrap();
    let b = CacheLease::acquire(
        &locations[1].database_path,
        &locations[1].workspace_identity,
    )
    .unwrap()
    .unwrap();
    a.record_use().unwrap();
    b.record_use().unwrap();
    let key = locations[0]
        .database_path
        .parent()
        .unwrap()
        .file_name()
        .unwrap()
        .to_string_lossy();
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .open(cache.join(".leases").join(format!("{key}.use.lock")))
        .unwrap();
    lock.lock().unwrap();
    let (ready, waiting) = mpsc::channel();
    let (done, result) = mpsc::channel();
    let thread = std::thread::spawn(move || {
        ready.send(()).unwrap();
        done.send(a.record_use()).unwrap();
    });
    waiting.recv_timeout(Duration::from_secs(5)).unwrap();
    b.record_use().unwrap();
    assert!(
        matches!(result.try_recv(), Err(mpsc::TryRecvError::Empty)),
        "A must still be waiting for its own record lock"
    );
    drop(lock);
    result
        .recv_timeout(Duration::from_secs(5))
        .unwrap()
        .unwrap();
    thread.join().unwrap();
}

#[cfg(unix)]
#[test]
fn unsafe_metadata_and_lock_targets_stay_rejected_without_touching_foreign_files() {
    use std::os::unix::fs::symlink;
    let temp = temp_dir::TestDir::new("cache-use-target-safety");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let cache = temp.path().join("cache");
    let location = workspace_cache_location(&cache, &root).unwrap();
    let lease = CacheLease::acquire(&location.database_path, &location.workspace_identity)
        .unwrap()
        .unwrap();
    lease.record_use().unwrap();
    let target = location.database_path.with_file_name("cache-use.json");
    let foreign = temp.path().join("foreign.json");
    fs::write(&foreign, "retain exactly").unwrap();
    for hard_link in [true, false] {
        fs::remove_file(&target).unwrap();
        if hard_link {
            fs::hard_link(&foreign, &target).unwrap();
        } else {
            symlink(&foreign, &target).unwrap();
        }
        assert_eq!(lease.record_use().unwrap_err(), "unsafe-metadata-target");
        assert_eq!(fs::read_to_string(&foreign).unwrap(), "retain exactly");
        fs::remove_file(&target).unwrap();
        lease.record_use().unwrap();
        assert!(
            !fs::read_dir(target.parent().unwrap()).unwrap().any(|e| e
                .unwrap()
                .file_name()
                .to_string_lossy()
                .contains(".tmp-")),
            "owned failed temporary files must be cleaned"
        );
    }
    let key = target
        .parent()
        .unwrap()
        .file_name()
        .unwrap()
        .to_string_lossy();
    let record_lock = cache.join(".leases").join(format!("{key}.use.lock"));
    fs::remove_file(&record_lock).unwrap(); // Closed, isolated corruption fixture only.
    symlink(&foreign, &record_lock).unwrap();
    assert_eq!(lease.record_use().unwrap_err(), "unsafe-lock-file");
    assert_eq!(fs::read_to_string(&foreign).unwrap(), "retain exactly");
    fs::remove_file(record_lock).unwrap();
    lease.record_use().unwrap();
}

#[test]
fn concurrent_record_child() {
    let Some(arguments) = std::env::var_os("ARKTS_INDEX_TEST_USE_RECORD_CHILD") else {
        return;
    };
    let value: serde_json::Value = serde_json::from_str(&arguments.to_string_lossy()).unwrap();
    let database = std::path::Path::new(value["database"].as_str().unwrap());
    let identity = value["identity"].as_str().unwrap();
    let lease = CacheLease::acquire(database, identity).unwrap().unwrap();
    let _record = if value["hold"] == true {
        let path = std::path::Path::new(value["lock"].as_str().unwrap());
        let file = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(path)
            .unwrap();
        file.lock().unwrap();
        Some(file)
    } else {
        None
    };
    fs::write(value["ready"].as_str().unwrap(), "ready").unwrap();
    if value["hold"] == true {
        loop {
            std::thread::park();
        }
    }
    let gate = std::path::Path::new(value["gate"].as_str().unwrap());
    while !gate.exists() {
        std::thread::sleep(std::time::Duration::from_millis(1));
    }
    for _ in 0..64 {
        lease.record_use().unwrap();
    }
}
struct WriterChild(std::process::Child);
impl Drop for WriterChild {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn spawn_writer(value: serde_json::Value) -> WriterChild {
    WriterChild(
        std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "concurrent_record_child", "--nocapture"])
            .env("ARKTS_INDEX_TEST_USE_RECORD_CHILD", value.to_string())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap(),
    )
}
fn wait_ready(paths: &[std::path::PathBuf]) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    while !paths.iter().all(|p| p.exists()) {
        assert!(
            std::time::Instant::now() < deadline,
            "controlled child did not reach its ready barrier"
        );
        std::thread::sleep(std::time::Duration::from_millis(2));
    }
}
#[test]
fn separate_process_writers_share_the_record_lock_and_a_killed_holder_releases_it() {
    use std::io::Read;
    let temp = temp_dir::TestDir::new("cache-use-cross-process");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let cache = temp.path().join("cache");
    let location = workspace_cache_location(&cache, &root).unwrap();
    let lease = CacheLease::acquire(&location.database_path, &location.workspace_identity)
        .unwrap()
        .unwrap();
    lease.record_use().unwrap();
    let key = location
        .database_path
        .parent()
        .unwrap()
        .file_name()
        .unwrap()
        .to_string_lossy();
    let lock = cache.join(".leases").join(format!("{key}.use.lock"));
    let gate = temp.path().join("release");
    let ready: Vec<_> = (0..2)
        .map(|i| temp.path().join(format!("ready-{i}")))
        .collect();
    let mut children:Vec<_> = ready.iter().map(|ready|spawn_writer(serde_json::json!({"database":location.database_path,"identity":location.workspace_identity,"ready":ready,"gate":gate,"hold":false}))).collect();
    wait_ready(&ready);
    fs::write(&gate, "go").unwrap();
    for child in &mut children {
        let status = child.0.wait().unwrap();
        let mut error = String::new();
        child
            .0
            .stderr
            .as_mut()
            .unwrap()
            .read_to_string(&mut error)
            .unwrap();
        assert!(status.success(), "cross-process use writer failed: {error}");
    }
    let held = temp.path().join("held");
    let mut killed = spawn_writer(
        serde_json::json!({"database":location.database_path,"identity":location.workspace_identity,"ready":held,"lock":lock,"hold":true}),
    );
    wait_ready(&[held]);
    killed.0.kill().unwrap();
    killed.0.wait().unwrap();
    lease.record_use().unwrap();
    let value: serde_json::Value = serde_json::from_slice(
        &fs::read(location.database_path.with_file_name("cache-use.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(value["workspaceIdentity"], location.workspace_identity);
    assert!(
        lock.exists(),
        "never unlink the shared lock inode during holder recovery"
    );
}
