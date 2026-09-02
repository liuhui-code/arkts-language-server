use std::{
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{self, Child, ChildStdin, ChildStdout, Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::{Value, json};

struct TestDir(PathBuf);

impl TestDir {
    fn new(name: &str) -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after epoch")
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("arkts-sidecar-{name}-{}-{nonce}", process::id()));
        fs::create_dir_all(&path).expect("test directory should be created");
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

struct SidecarProcess {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    finished: bool,
}

impl SidecarProcess {
    fn spawn() -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_arkts-index-sidecar"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("sidecar should spawn");
        let stdin = child.stdin.take().expect("sidecar stdin should be piped");
        let stdout = child.stdout.take().expect("sidecar stdout should be piped");
        Self {
            child,
            stdin: Some(stdin),
            stdout: BufReader::new(stdout),
            finished: false,
        }
    }

    fn request(&mut self, request: Value) -> Value {
        let stdin = self.stdin.as_mut().expect("sidecar stdin should be open");
        serde_json::to_writer(&mut *stdin, &request).expect("request should serialize");
        stdin.write_all(b"\n").expect("request should be written");
        stdin.flush().expect("request should be flushed");

        let mut line = String::new();
        self.stdout
            .read_line(&mut line)
            .expect("sidecar response should be readable");
        assert!(!line.is_empty(), "sidecar exited before responding");
        serde_json::from_str(&line).expect("every stdout line must be JSON protocol")
    }

    fn shutdown(mut self, id: u64) {
        let response = self.request(json!({
            "protocol": 1,
            "id": id,
            "method": "shutdown",
            "params": {}
        }));
        assert_eq!(response["ok"], true);
        drop(self.stdin.take());
        let status = self.child.wait().expect("sidecar should exit");
        assert!(status.success(), "sidecar should exit successfully");
        let mut trailing_stdout = String::new();
        self.stdout
            .read_to_string(&mut trailing_stdout)
            .expect("remaining stdout should be readable");
        assert!(
            trailing_stdout.is_empty(),
            "stdout must contain protocol responses only: {trailing_stdout:?}"
        );
        self.finished = true;
    }
}

impl Drop for SidecarProcess {
    fn drop(&mut self) {
        if !self.finished {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }
}

fn initialize(process: &mut SidecarProcess, root: &Path, cache: &Path, id: u64) -> Value {
    process.request(json!({
        "protocol": 1,
        "id": id,
        "method": "initialize",
        "params": {
            "workspaceRoot": root,
            "cacheDirectory": cache
        }
    }))
}

#[test]
fn sidecar_persists_symbols_and_restores_them_as_stale_after_restart() {
    let temp = TestDir::new("restart");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace).expect("workspace should exist");

    let mut first = SidecarProcess::spawn();
    let initialized = initialize(&mut first, &workspace, &cache, 1);
    assert_eq!(initialized["protocol"], 1);
    assert_eq!(initialized["ok"], true);
    assert_eq!(initialized["result"]["status"]["state"], "warming");
    assert_eq!(initialized["result"]["status"]["committedGeneration"], 0);

    let refreshed = first.request(json!({
        "protocol": 1,
        "id": 2,
        "method": "refresh",
        "params": {
            "generation": 1,
            "changed": [{
                "uri": "file:///workspace/Persisted.ets",
                "text": "class PersistedService { run() {} }\n"
            }],
            "removedUris": []
        }
    }));
    assert_eq!(refreshed["ok"], true);
    assert_eq!(refreshed["result"]["status"]["state"], "ready");
    assert_eq!(refreshed["result"]["status"]["committedGeneration"], 1);

    let searched = first.request(json!({
        "protocol": 1,
        "id": 3,
        "method": "search",
        "params": {"query": "PS", "limit": 20}
    }));
    assert_eq!(searched["ok"], true);
    assert_eq!(searched["result"]["servedGeneration"], 1);
    assert_eq!(searched["result"]["completeness"], "ready");
    assert_eq!(searched["result"]["items"][0]["name"], "PersistedService");
    first.shutdown(4);

    let mut second = SidecarProcess::spawn();
    let restored = initialize(&mut second, &workspace, &cache, 5);
    assert_eq!(restored["ok"], true);
    assert_eq!(restored["result"]["status"]["state"], "warming");
    assert_eq!(restored["result"]["status"]["committedGeneration"], 1);
    let stale = second.request(json!({
        "protocol": 1,
        "id": 6,
        "method": "search",
        "params": {"query": "PS", "limit": 20}
    }));
    assert_eq!(stale["ok"], true);
    assert_eq!(stale["result"]["servedGeneration"], 1);
    assert_eq!(stale["result"]["completeness"], "stale");
    assert_eq!(stale["result"]["items"][0]["name"], "PersistedService");
    second.shutdown(7);
}

#[test]
fn protocol_mismatch_is_rejected_without_changing_the_persisted_generation() {
    let temp = TestDir::new("protocol-mismatch");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace).expect("workspace should exist");

    let mut seed = SidecarProcess::spawn();
    assert_eq!(initialize(&mut seed, &workspace, &cache, 1)["ok"], true);
    let committed = seed.request(json!({
        "protocol": 1,
        "id": 2,
        "method": "refresh",
        "params": {
            "generation": 1,
            "changed": [{
                "uri": "file:///workspace/Service.ets",
                "text": "class StableService {}\n"
            }],
            "removedUris": []
        }
    }));
    assert_eq!(committed["ok"], true);
    seed.shutdown(3);

    let mut mismatched = SidecarProcess::spawn();
    let rejected_initialize = mismatched.request(json!({
        "protocol": 99,
        "id": 4,
        "method": "initialize",
        "params": {
            "workspaceRoot": workspace,
            "cacheDirectory": cache
        }
    }));
    assert_eq!(rejected_initialize["ok"], false);
    assert_eq!(rejected_initialize["error"]["code"], "protocol_mismatch");
    let rejected_refresh = mismatched.request(json!({
        "protocol": 99,
        "id": 5,
        "method": "refresh",
        "params": {
            "generation": 2,
            "changed": [{
                "uri": "file:///workspace/Service.ets",
                "text": "class MutatedService {}\n"
            }],
            "removedUris": []
        }
    }));
    assert_eq!(rejected_refresh["ok"], false);
    assert_eq!(rejected_refresh["error"]["code"], "protocol_mismatch");
    mismatched.shutdown(6);

    let mut verify = SidecarProcess::spawn();
    let restored = initialize(&mut verify, &workspace, &cache, 7);
    assert_eq!(restored["result"]["status"]["committedGeneration"], 1);
    let stable = verify.request(json!({
        "protocol": 1,
        "id": 8,
        "method": "search",
        "params": {"query": "Service", "limit": 20}
    }));
    assert_eq!(stable["result"]["items"][0]["name"], "StableService");
    assert_eq!(stable["result"]["items"].as_array().map(Vec::len), Some(1));
    verify.shutdown(9);
}

#[test]
fn failed_store_operation_changes_status_from_ready_to_degraded() {
    let temp = TestDir::new("degraded-status");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace).expect("workspace should exist");

    let mut process = SidecarProcess::spawn();
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    let first = process.request(json!({
        "protocol": 1,
        "id": 2,
        "method": "refresh",
        "params": {
            "generation": 1,
            "changed": [{
                "uri": "file:///workspace/Service.ets",
                "text": "class StableService {}\n"
            }],
            "removedUris": []
        }
    }));
    assert_eq!(first["result"]["status"]["state"], "ready");

    let rejected = process.request(json!({
        "protocol": 1,
        "id": 3,
        "method": "refresh",
        "params": {"generation": 1, "changed": [], "removedUris": []}
    }));
    assert_eq!(rejected["ok"], false);
    assert_eq!(rejected["error"]["code"], "invalid_generation");

    let status = process.request(json!({
        "protocol": 1,
        "id": 4,
        "method": "status",
        "params": {}
    }));
    assert_eq!(status["result"]["state"], "degraded");
    assert_eq!(status["result"]["completeness"], "stale");
    assert_eq!(status["result"]["committedGeneration"], 1);
    process.shutdown(5);
}

#[test]
fn sidecar_restores_unresolved_rejections_and_only_clears_them_by_uri() {
    let temp = TestDir::new("persistent-rejections");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace).expect("workspace should exist");

    let mut first = SidecarProcess::spawn();
    assert_eq!(initialize(&mut first, &workspace, &cache, 1)["ok"], true);
    let rejected = first.request(json!({
        "protocol": 1,
        "id": 2,
        "method": "refresh",
        "params": {
            "generation": 1,
            "changed": [{
                "uri": "file:///workspace/Broken.ets",
                "text": "class BrokenService {\n  run( {\n}\n"
            }],
            "removedUris": []
        }
    }));
    assert_eq!(rejected["result"]["status"]["state"], "degraded");
    assert_eq!(rejected["result"]["status"]["rejectedCount"], 1);
    first.shutdown(3);

    let mut second = SidecarProcess::spawn();
    let restored = initialize(&mut second, &workspace, &cache, 4);
    assert_eq!(restored["result"]["status"]["state"], "warming");
    assert_eq!(
        restored["result"]["status"]["rejectedCount"], 1,
        "restart must retain unresolved rejection coverage"
    );
    let unrelated = second.request(json!({
        "protocol": 1,
        "id": 5,
        "method": "refresh",
        "params": {
            "generation": 2,
            "changed": [{
                "uri": "file:///workspace/Healthy.ets",
                "text": "class HealthyService {}\n"
            }],
            "removedUris": []
        }
    }));
    assert_eq!(unrelated["result"]["status"]["state"], "degraded");
    assert_eq!(unrelated["result"]["status"]["completeness"], "partial");

    let removed = second.request(json!({
        "protocol": 1,
        "id": 6,
        "method": "refresh",
        "params": {
            "generation": 3,
            "changed": [],
            "removedUris": ["file:///workspace/Broken.ets"]
        }
    }));
    assert_eq!(removed["result"]["status"]["state"], "ready");
    assert_eq!(removed["result"]["status"]["rejectedCount"], 0);
    second.shutdown(7);
}

#[test]
fn search_omits_absent_container_name_and_matches_the_exact_protocol_shape() {
    let temp = TestDir::new("search-shape");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace).expect("workspace should exist");

    let mut process = SidecarProcess::spawn();
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 2,
            "method": "refresh",
            "params": {
                "generation": 1,
                "changed": [{
                    "uri": "file:///workspace/Root.ets",
                    "text": "class Root {}\n"
                }],
                "removedUris": []
            }
        }))["ok"],
        true
    );

    let searched = process.request(json!({
        "protocol": 1,
        "id": 3,
        "method": "search",
        "params": {"query": "Root", "limit": 20}
    }));
    assert_eq!(
        searched,
        json!({
            "protocol": 1,
            "id": 3,
            "ok": true,
            "result": {
                "items": [{
                    "name": "Root",
                    "kind": "class",
                    "uri": "file:///workspace/Root.ets",
                    "range": {
                        "start": {"line": 0, "character": 6},
                        "end": {"line": 0, "character": 10}
                    }
                }],
                "servedGeneration": 1,
                "completeness": "ready"
            }
        })
    );
    process.shutdown(4);
}
