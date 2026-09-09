use std::{
    collections::VecDeque,
    fmt::Write as _,
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{self, Child, ChildStdin, ChildStdout, Command, Stdio},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
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
    events: VecDeque<Value>,
    finished: bool,
}

impl SidecarProcess {
    fn spawn() -> Self {
        Self::spawn_with_test_gates(None, None, None)
    }

    fn spawn_with_catalog_gate(delay: Duration) -> Self {
        Self::spawn_with_test_gates(Some(delay), None, None)
    }

    fn spawn_with_activation_gate(delay: Duration) -> Self {
        Self::spawn_with_test_gates(None, Some(delay), None)
    }

    fn spawn_with_entry_delay(delay: Duration) -> Self {
        Self::spawn_with_test_gates(None, None, Some(delay))
    }

    fn spawn_with_test_gates(
        catalog_delay: Option<Duration>,
        activation_delay: Option<Duration>,
        entry_delay: Option<Duration>,
    ) -> Self {
        let mut command = Command::new(env!("CARGO_BIN_EXE_arkts-index-sidecar"));
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(delay) = catalog_delay {
            command.env(
                "ARKTS_INDEX_TEST_CATALOG_GATE_MS",
                delay.as_millis().to_string(),
            );
        }
        if let Some(delay) = activation_delay {
            command.env(
                "ARKTS_INDEX_TEST_ACTIVATION_GATE_MS",
                delay.as_millis().to_string(),
            );
        }
        if let Some(delay) = entry_delay {
            command.env(
                "ARKTS_INDEX_TEST_ENTRY_DELAY_MS",
                delay.as_millis().to_string(),
            );
        }
        let mut child = command.spawn().expect("sidecar should spawn");
        let stdin = child.stdin.take().expect("sidecar stdin should be piped");
        let stdout = child.stdout.take().expect("sidecar stdout should be piped");
        Self {
            child,
            stdin: Some(stdin),
            stdout: BufReader::new(stdout),
            events: VecDeque::new(),
            finished: false,
        }
    }

    fn request(&mut self, request: Value) -> Value {
        let expected_id = request["id"].clone();
        let stdin = self.stdin.as_mut().expect("sidecar stdin should be open");
        serde_json::to_writer(&mut *stdin, &request).expect("request should serialize");
        stdin.write_all(b"\n").expect("request should be written");
        stdin.flush().expect("request should be flushed");

        loop {
            let message = self.read_message();
            if message.get("event").is_some() {
                self.events.push_back(message);
                continue;
            }
            assert_eq!(
                message["id"], expected_id,
                "sidecar responses must preserve request ordering in this harness"
            );
            return message;
        }
    }

    fn read_event(&mut self) -> Value {
        if let Some(event) = self.events.pop_front() {
            return event;
        }
        let message = self.read_message();
        if message.get("event").is_some() {
            return message;
        }
        panic!("received an unexpected response while waiting for event: {message}");
    }

    fn read_message(&mut self) -> Value {
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
fn sidecar_discovers_an_export_beyond_the_old_completion_scan_bound() {
    const FILLER_EXPORTS: usize = 4_999;
    let temp = TestDir::new("exports-over-4096");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace).expect("workspace should exist");
    let mut source = String::new();
    for ordinal in 0..FILLER_EXPORTS {
        writeln!(&mut source, "export class FillerExport{ordinal:04} {{}}")
            .expect("writing to String should succeed");
    }
    source.push_str("export class ExactNeedleExport {}\n");

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
                    "uri": "file:///workspace/Exports.ets",
                    "text": source
                }],
                "removedUris": []
            }
        }))["ok"],
        true
    );

    let searched = process.request(json!({
        "protocol": 1,
        "id": 3,
        "method": "exports/search",
        "params": { "query": "ExactNeedle", "limit": 20 }
    }));
    assert_eq!(searched["ok"], true);
    assert_eq!(searched["result"]["servedGeneration"], 1);
    assert_eq!(
        searched["result"]["items"][0]["exportedName"],
        "ExactNeedleExport"
    );
    assert_eq!(searched["result"]["items"][0]["ordinal"], FILLER_EXPORTS);
    process.shutdown(4);
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

#[test]
fn search_excludes_open_uris_before_ranking_and_limiting() {
    let temp = TestDir::new("search-excluded-uris");
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
                "changed": [
                    {
                        "uri": "file:///workspace/A.ets",
                        "text": "class TwinService {}\n"
                    },
                    {
                        "uri": "file:///workspace/B.ets",
                        "text": "class TwinService {}\n"
                    }
                ],
                "removedUris": []
            }
        }))["ok"],
        true
    );

    let legacy = process.request(json!({
        "protocol": 1,
        "id": 3,
        "method": "search",
        "params": {"query": "TwinService", "limit": 1}
    }));
    assert_eq!(
        legacy["result"]["items"][0]["uri"],
        "file:///workspace/A.ets"
    );

    let excluded = process.request(json!({
        "protocol": 1,
        "id": 4,
        "method": "search",
        "params": {
            "query": "TwinService",
            "limit": 1,
            "excludedUris": ["file:///workspace/A.ets"]
        }
    }));
    assert_eq!(excluded["ok"], true);
    assert_eq!(
        excluded["result"]["items"].as_array().map(Vec::len),
        Some(1)
    );
    assert_eq!(
        excluded["result"]["items"][0]["uri"],
        "file:///workspace/B.ets"
    );
    process.shutdown(5);
}

#[test]
fn search_rejects_unbounded_or_empty_excluded_uri_payloads() {
    let temp = TestDir::new("search-excluded-uri-bounds");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace).expect("workspace should exist");

    let mut process = SidecarProcess::spawn();
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    let too_many = process.request(json!({
        "protocol": 1,
        "id": 2,
        "method": "search",
        "params": {
            "query": "Service",
            "limit": 20,
            "excludedUris": vec!["file:///workspace/Open.ets"; 257]
        }
    }));
    assert_eq!(too_many["ok"], false);
    assert_eq!(too_many["error"]["code"], "invalid_params");

    let empty = process.request(json!({
        "protocol": 1,
        "id": 3,
        "method": "search",
        "params": {
            "query": "Service",
            "limit": 20,
            "excludedUris": [""]
        }
    }));
    assert_eq!(empty["ok"], false);
    assert_eq!(empty["error"]["code"], "invalid_params");
    process.shutdown(4);
}

#[test]
fn empty_workspace_catalog_starts_nonblocking_and_reaches_truthful_ready_progress() {
    let temp = TestDir::new("empty-catalog");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace).expect("empty workspace should exist");

    let mut process = SidecarProcess::spawn();
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);

    let started_at = Instant::now();
    let started = process.request(json!({
        "protocol": 1,
        "id": 2,
        "method": "catalog/start",
        "params": {"reason": "workspace-open", "force": false}
    }));
    assert!(
        started_at.elapsed() < Duration::from_millis(250),
        "catalog/start must acknowledge before filesystem work completes"
    );
    assert_eq!(started["ok"], true);
    assert_eq!(started["result"]["accepted"], true);
    assert_eq!(started["result"]["generation"], 1);
    assert_eq!(started["result"]["status"]["phase"], "discovering");
    assert_eq!(started["result"]["status"]["buildingGeneration"], 1);
    assert!(
        started["result"]["status"].get("totalFiles").is_none(),
        "totalFiles must be absent until discovery is complete"
    );

    let initial = process.read_event();
    assert_eq!(initial["protocol"], 1);
    assert_eq!(initial["event"], "catalog/progress");
    assert!(initial.get("id").is_none());
    assert_eq!(initial["params"]["status"]["phase"], "discovering");
    assert!(initial["params"]["status"].get("totalFiles").is_none());

    let terminal = loop {
        let event = process.read_event();
        if matches!(
            event["params"]["status"]["phase"].as_str(),
            Some("ready" | "partial" | "degraded" | "cancelled")
        ) {
            break event;
        }
    };
    assert_eq!(terminal["event"], "catalog/progress");
    let status = &terminal["params"]["status"];
    assert_eq!(status["phase"], "ready");
    assert_eq!(status["state"], "ready");
    assert_eq!(status["completeness"], "ready");
    assert_eq!(status["committedGeneration"], 1);
    assert!(status["buildingGeneration"].is_null());
    assert_eq!(status["totalFiles"], 0);
    for counter in [
        "discovered",
        "indexed",
        "rejected",
        "policySkipped",
        "ignored",
    ] {
        assert_eq!(status[counter], 0, "counter {counter} must be truthful");
    }
    process.shutdown(3);
}

#[test]
fn catalog_symbol_uris_share_the_canonical_initialized_workspace_identity() {
    let temp = TestDir::new("canonical-catalog-root");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(workspace.join("nested")).expect("workspace should exist");
    fs::write(
        workspace.join("Canonical.ets"),
        "class CanonicalService {}\n",
    )
    .expect("source should be written");
    let aliased_workspace = workspace.join("nested/..");

    let mut process = SidecarProcess::spawn();
    let initialized = initialize(&mut process, &aliased_workspace, &cache, 1);
    let workspace_identity = initialized["result"]["workspaceIdentity"]
        .as_str()
        .expect("workspace identity should be a string")
        .to_owned();
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 2,
            "method": "catalog/start",
            "params": {"reason": "canonical-root", "force": false}
        }))["ok"],
        true
    );
    loop {
        let event = process.read_event();
        if matches!(
            event["params"]["status"]["phase"].as_str(),
            Some("ready" | "partial" | "degraded" | "cancelled")
        ) {
            break;
        }
    }

    let searched = process.request(json!({
        "protocol": 1,
        "id": 3,
        "method": "search",
        "params": {"query": "CanonicalService", "limit": 20}
    }));
    assert_eq!(
        searched["result"]["items"][0]["uri"],
        format!("{workspace_identity}/Canonical.ets")
    );
    process.shutdown(4);
}

#[test]
fn running_catalog_is_idempotent_responsive_and_cancellable_without_replacing_active_data() {
    let temp = TestDir::new("catalog-cancel");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace).expect("workspace should exist");
    fs::write(
        workspace.join("Replacement.ets"),
        "class ReplacementService {}\n",
    )
    .expect("replacement source should be written");

    let mut process = SidecarProcess::spawn_with_catalog_gate(Duration::from_millis(300));
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 2,
            "method": "refresh",
            "params": {
                "generation": 1,
                "changed": [{
                    "uri": "file:///workspace/Stable.ets",
                    "text": "class StableService {}\n"
                }],
                "removedUris": []
            }
        }))["ok"],
        true
    );

    let started = process.request(json!({
        "protocol": 1,
        "id": 3,
        "method": "catalog/start",
        "params": {"reason": "test-cancel", "force": false}
    }));
    assert_eq!(started["result"]["accepted"], true);
    assert_eq!(started["result"]["generation"], 2);

    let duplicate_started_at = Instant::now();
    let duplicate = process.request(json!({
        "protocol": 1,
        "id": 4,
        "method": "catalog/start",
        "params": {"reason": "duplicate", "force": true}
    }));
    assert!(duplicate_started_at.elapsed() < Duration::from_millis(200));
    assert_eq!(duplicate["result"]["accepted"], false);
    assert_eq!(duplicate["result"]["generation"], 2);

    let search_started_at = Instant::now();
    let during_scan = process.request(json!({
        "protocol": 1,
        "id": 5,
        "method": "search",
        "params": {"query": "StableService", "limit": 20}
    }));
    assert!(search_started_at.elapsed() < Duration::from_millis(200));
    assert_eq!(during_scan["result"]["servedGeneration"], 1);
    assert_eq!(during_scan["result"]["items"][0]["name"], "StableService");

    let cancelled = process.request(json!({
        "protocol": 1,
        "id": 6,
        "method": "catalog/cancel",
        "params": {"generation": 2}
    }));
    assert_eq!(cancelled["result"]["cancelled"], true);
    assert_eq!(cancelled["result"]["status"]["phase"], "cancelling");

    let terminal = loop {
        let event = process.read_event();
        if matches!(
            event["params"]["status"]["phase"].as_str(),
            Some("ready" | "partial" | "degraded" | "cancelled")
        ) {
            break event;
        }
    };
    let status = &terminal["params"]["status"];
    assert_eq!(status["phase"], "cancelled");
    assert_eq!(status["committedGeneration"], 1);
    assert_eq!(status["state"], "ready");
    assert_eq!(status["completeness"], "ready");
    assert!(status["buildingGeneration"].is_null());

    let stable = process.request(json!({
        "protocol": 1,
        "id": 7,
        "method": "search",
        "params": {"query": "Service", "limit": 20}
    }));
    assert_eq!(stable["result"]["servedGeneration"], 1);
    assert_eq!(stable["result"]["items"].as_array().map(Vec::len), Some(1));
    assert_eq!(stable["result"]["items"][0]["name"], "StableService");
    process.shutdown(8);
}

#[test]
fn directory_entries_stream_progress_and_honor_cancellation_mid_scan() {
    let temp = TestDir::new("catalog-streamed-directory");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace).expect("workspace should exist");
    for ordinal in 0..40 {
        fs::write(
            workspace.join(format!("Service{ordinal:02}.ets")),
            format!("class StreamedService{ordinal:02} {{}}\n"),
        )
        .expect("streamed source fixture should be written");
    }

    let mut process = SidecarProcess::spawn_with_entry_delay(Duration::from_millis(20));
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 2,
            "method": "catalog/start",
            "params": {"reason": "streamed-directory", "force": false}
        }))["result"]["accepted"],
        true
    );

    loop {
        let event = process.read_event();
        let status = &event["params"]["status"];
        assert!(
            !matches!(
                status["phase"].as_str(),
                Some("ready" | "partial" | "degraded" | "cancelled")
            ),
            "a bounded scan must expose progress before terminal activation"
        );
        if status["discovered"]
            .as_u64()
            .is_some_and(|discovered| discovered > 0)
        {
            break;
        }
    }
    let cancelled = process.request(json!({
        "protocol": 1,
        "id": 3,
        "method": "catalog/cancel",
        "params": {"generation": 1}
    }));
    assert_eq!(cancelled["result"]["cancelled"], true);
    loop {
        let event = process.read_event();
        if event["params"]["status"]["phase"] == "cancelled" {
            break;
        }
    }
    process.shutdown(4);
}

#[test]
fn initialize_cannot_replace_workspace_while_a_catalog_worker_is_active() {
    let temp = TestDir::new("catalog-initialize-serialization");
    let workspace_a = temp.path().join("workspace-a");
    let workspace_b = temp.path().join("workspace-b");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace_a).expect("workspace A should exist");
    fs::create_dir_all(&workspace_b).expect("workspace B should exist");

    let mut process = SidecarProcess::spawn_with_catalog_gate(Duration::from_millis(300));
    assert_eq!(
        initialize(&mut process, &workspace_a, &cache, 1)["ok"],
        true
    );
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 2,
            "method": "catalog/start",
            "params": {"reason": "workspace-a", "force": false}
        }))["result"]["accepted"],
        true
    );

    let rejected = initialize(&mut process, &workspace_b, &cache, 3);
    assert_eq!(rejected["ok"], false);
    assert_eq!(rejected["error"]["code"], "busy");

    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 4,
            "method": "catalog/cancel",
            "params": {"generation": 1}
        }))["result"]["cancelled"],
        true
    );
    loop {
        let event = process.read_event();
        if event["params"]["status"]["phase"] == "cancelled" {
            break;
        }
    }
    assert_eq!(
        initialize(&mut process, &workspace_b, &cache, 5)["ok"],
        true
    );
    process.shutdown(6);
}

#[test]
fn refresh_cannot_race_the_catalog_generation_writer() {
    let temp = TestDir::new("catalog-refresh-serialization");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace).expect("workspace should exist");

    let mut process = SidecarProcess::spawn_with_catalog_gate(Duration::from_millis(300));
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 2,
            "method": "catalog/start",
            "params": {"reason": "serialize-writers", "force": false}
        }))["result"]["generation"],
        1
    );

    let rejected = process.request(json!({
        "protocol": 1,
        "id": 3,
        "method": "refresh",
        "params": {
            "generation": 1,
            "changed": [{
                "uri": "file:///workspace/Racing.ets",
                "text": "class RacingService {}\n"
            }],
            "removedUris": []
        }
    }));
    assert_eq!(rejected["ok"], false);
    assert_eq!(rejected["error"]["code"], "busy");

    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 4,
            "method": "catalog/cancel",
            "params": {"generation": 1}
        }))["result"]["cancelled"],
        true
    );
    loop {
        let event = process.read_event();
        if event["params"]["status"]["phase"] == "cancelled" {
            break;
        }
    }
    let status = process.request(json!({
        "protocol": 1,
        "id": 5,
        "method": "status",
        "params": {}
    }));
    assert_eq!(status["result"]["committedGeneration"], 0);
    process.shutdown(6);
}

#[test]
fn failed_catalog_worker_keeps_the_prior_active_generation() {
    let temp = TestDir::new("catalog-worker-failure");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace).expect("workspace should exist");

    let mut process = SidecarProcess::spawn_with_catalog_gate(Duration::from_millis(200));
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 2,
            "method": "refresh",
            "params": {
                "generation": 1,
                "changed": [{
                    "uri": "file:///workspace/Stable.ets",
                    "text": "class StableService {}\n"
                }],
                "removedUris": []
            }
        }))["ok"],
        true
    );
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 3,
            "method": "catalog/start",
            "params": {"reason": "worker-failure", "force": true}
        }))["result"]["generation"],
        2
    );
    fs::remove_dir_all(&workspace).expect("test workspace should be removed during the gate");

    let terminal = loop {
        let event = process.read_event();
        if matches!(
            event["params"]["status"]["phase"].as_str(),
            Some("ready" | "partial" | "degraded" | "cancelled")
        ) {
            break event;
        }
    };
    let status = &terminal["params"]["status"];
    assert_eq!(status["phase"], "degraded");
    assert_eq!(status["committedGeneration"], 1);
    assert_eq!(status["completeness"], "stale");
    assert!(status["buildingGeneration"].is_null());
    assert!(
        status["message"]
            .as_str()
            .is_some_and(|message| { message.contains("failed to read directory") })
    );

    let stable = process.request(json!({
        "protocol": 1,
        "id": 4,
        "method": "search",
        "params": {"query": "StableService", "limit": 20}
    }));
    assert_eq!(stable["result"]["servedGeneration"], 1);
    assert_eq!(stable["result"]["items"][0]["name"], "StableService");
    process.shutdown(5);
}

#[test]
fn completed_catalog_replaces_the_active_generation_atomically() {
    let temp = TestDir::new("catalog-atomic-activation");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace).expect("workspace should exist");
    fs::write(
        workspace.join("Replacement.ets"),
        "class ReplacementService {}\n",
    )
    .expect("replacement source should be written");

    let mut process = SidecarProcess::spawn_with_catalog_gate(Duration::from_millis(200));
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 2,
            "method": "refresh",
            "params": {
                "generation": 1,
                "changed": [{
                    "uri": "file:///workspace/Stable.ets",
                    "text": "class StableService {}\n"
                }],
                "removedUris": []
            }
        }))["ok"],
        true
    );
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 3,
            "method": "catalog/start",
            "params": {"reason": "atomic-replace", "force": true}
        }))["result"]["generation"],
        2
    );

    let before_activation = process.request(json!({
        "protocol": 1,
        "id": 4,
        "method": "search",
        "params": {"query": "Service", "limit": 20}
    }));
    assert_eq!(before_activation["result"]["servedGeneration"], 1);
    assert_eq!(
        before_activation["result"]["items"]
            .as_array()
            .map(Vec::len),
        Some(1)
    );
    assert_eq!(
        before_activation["result"]["items"][0]["name"],
        "StableService"
    );

    let terminal = loop {
        let event = process.read_event();
        if matches!(
            event["params"]["status"]["phase"].as_str(),
            Some("ready" | "partial" | "degraded" | "cancelled")
        ) {
            break event;
        }
    };
    let status = &terminal["params"]["status"];
    assert_eq!(status["phase"], "ready");
    assert_eq!(status["committedGeneration"], 2);
    assert_eq!(status["discovered"], 1);
    assert_eq!(status["indexed"], 1);

    let after_activation = process.request(json!({
        "protocol": 1,
        "id": 5,
        "method": "search",
        "params": {"query": "Service", "limit": 20}
    }));
    assert_eq!(after_activation["result"]["servedGeneration"], 2);
    assert_eq!(
        after_activation["result"]["items"].as_array().map(Vec::len),
        Some(1)
    );
    assert_eq!(
        after_activation["result"]["items"][0]["name"],
        "ReplacementService"
    );
    process.shutdown(6);
}

#[test]
fn sqlite_activation_does_not_block_status_or_search_on_the_protocol_loop() {
    let temp = TestDir::new("catalog-nonblocking-activation");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace).expect("workspace should exist");
    fs::write(
        workspace.join("Replacement.ets"),
        "class ReplacementService {}\n",
    )
    .expect("replacement source should be written");

    let mut process = SidecarProcess::spawn_with_activation_gate(Duration::from_millis(400));
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 2,
            "method": "refresh",
            "params": {
                "generation": 1,
                "changed": [{
                    "uri": "file:///workspace/Stable.ets",
                    "text": "class StableService {}\n"
                }],
                "removedUris": []
            }
        }))["ok"],
        true
    );
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 3,
            "method": "catalog/start",
            "params": {"reason": "activation-responsiveness", "force": true}
        }))["result"]["generation"],
        2
    );

    loop {
        let event = process.read_event();
        let phase = event["params"]["status"]["phase"]
            .as_str()
            .expect("phase should be a string");
        if phase == "activating" {
            break;
        }
        assert!(
            !matches!(phase, "ready" | "partial" | "degraded" | "cancelled"),
            "activation must be observable before terminal status"
        );
    }

    let status_started_at = Instant::now();
    let status = process.request(json!({
        "protocol": 1,
        "id": 4,
        "method": "status",
        "params": {}
    }));
    assert!(status_started_at.elapsed() < Duration::from_millis(200));
    assert_eq!(status["result"]["phase"], "activating");
    assert_eq!(status["result"]["committedGeneration"], 1);
    assert_eq!(status["result"]["buildingGeneration"], 2);

    let search_started_at = Instant::now();
    let old = process.request(json!({
        "protocol": 1,
        "id": 5,
        "method": "search",
        "params": {"query": "StableService", "limit": 20}
    }));
    assert!(search_started_at.elapsed() < Duration::from_millis(200));
    assert_eq!(old["result"]["servedGeneration"], 1);
    assert_eq!(old["result"]["items"][0]["name"], "StableService");

    let too_late_to_cancel = process.request(json!({
        "protocol": 1,
        "id": 6,
        "method": "catalog/cancel",
        "params": {"generation": 2}
    }));
    assert_eq!(too_late_to_cancel["result"]["cancelled"], false);
    assert_eq!(
        too_late_to_cancel["result"]["status"]["phase"],
        "activating"
    );

    loop {
        let event = process.read_event();
        if matches!(
            event["params"]["status"]["phase"].as_str(),
            Some("ready" | "partial" | "degraded" | "cancelled")
        ) {
            assert_eq!(event["params"]["status"]["phase"], "ready");
            break;
        }
    }
    let replacement = process.request(json!({
        "protocol": 1,
        "id": 7,
        "method": "search",
        "params": {"query": "ReplacementService", "limit": 20}
    }));
    assert_eq!(replacement["result"]["servedGeneration"], 2);
    assert_eq!(
        replacement["result"]["items"][0]["name"],
        "ReplacementService"
    );
    process.shutdown(8);
}

#[test]
fn catalog_commits_healthy_snapshots_with_truthful_persisted_rejections() {
    let temp = TestDir::new("catalog-rejections");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace).expect("workspace should exist");
    fs::write(
        workspace.join("Healthy.ets"),
        "class HealthyCatalogService {}\n",
    )
    .expect("healthy source should be written");
    fs::write(
        workspace.join("Broken.ts"),
        "class BrokenCatalogService {\n  run( {\n}\n",
    )
    .expect("malformed source should be written");

    let mut first = SidecarProcess::spawn();
    assert_eq!(initialize(&mut first, &workspace, &cache, 1)["ok"], true);
    assert_eq!(
        first.request(json!({
            "protocol": 1,
            "id": 2,
            "method": "catalog/start",
            "params": {"reason": "rejection-fixture", "force": false}
        }))["ok"],
        true
    );
    let terminal = loop {
        let event = first.read_event();
        if matches!(
            event["params"]["status"]["phase"].as_str(),
            Some("ready" | "partial" | "degraded" | "cancelled")
        ) {
            break event;
        }
    };
    let status = &terminal["params"]["status"];
    assert_eq!(status["phase"], "degraded");
    assert_eq!(status["state"], "degraded");
    assert_eq!(status["completeness"], "partial");
    assert_eq!(status["committedGeneration"], 1);
    assert_eq!(status["totalFiles"], 2);
    assert_eq!(status["discovered"], 2);
    assert_eq!(status["indexed"], 1);
    assert_eq!(status["rejected"], 1);
    assert_eq!(status["rejectedCount"], 1);
    first.shutdown(3);

    let mut second = SidecarProcess::spawn();
    let restored = initialize(&mut second, &workspace, &cache, 4);
    assert_eq!(restored["result"]["status"]["committedGeneration"], 1);
    assert_eq!(restored["result"]["status"]["rejectedCount"], 1);
    let searched = second.request(json!({
        "protocol": 1,
        "id": 5,
        "method": "search",
        "params": {"query": "CatalogService", "limit": 20}
    }));
    assert_eq!(searched["result"]["servedGeneration"], 1);
    assert_eq!(searched["result"]["completeness"], "stale");
    assert_eq!(
        searched["result"]["items"].as_array().map(Vec::len),
        Some(1)
    );
    assert_eq!(
        searched["result"]["items"][0]["name"],
        "HealthyCatalogService"
    );
    second.shutdown(6);
}

#[test]
fn catalog_honors_hierarchical_ignores_hard_excludes_and_size_policy_exactly() {
    let temp = TestDir::new("catalog-ignore-policy");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    for directory in ["src", "ignored", "node_modules", "build"] {
        fs::create_dir_all(workspace.join(directory)).expect("fixture directory should exist");
    }
    fs::write(workspace.join(".gitignore"), "ignored/\n*.generated.ts\n")
        .expect("gitignore should be written");
    fs::write(
        workspace.join("src/Included.ets"),
        "class IncludedService {}\n",
    )
    .expect("included ArkTS file should be written");
    fs::write(workspace.join("src/Nested.ts"), "class NestedType {}\n")
        .expect("included TypeScript file should be written");
    fs::write(
        workspace.join("src/Skip.generated.ts"),
        "class IgnoredGenerated {}\n",
    )
    .expect("ignored pattern file should be written");
    fs::write(
        workspace.join("ignored/Ignored.ets"),
        "class IgnoredDirectory {}\n",
    )
    .expect("ignored directory file should be written");
    fs::write(
        workspace.join("node_modules/Dependency.ets"),
        "class DependencyType {}\n",
    )
    .expect("dependency file should be written");
    fs::write(
        workspace.join("build/Generated.ts"),
        "class BuildArtifact {}\n",
    )
    .expect("build output should be written");
    fs::write(workspace.join("README.md"), "not source\n")
        .expect("non-source file should be written");
    fs::write(
        workspace.join("src/Huge.ets"),
        vec![b' '; 2 * 1024 * 1024 + 1],
    )
    .expect("oversized source should be written");

    let mut process = SidecarProcess::spawn();
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    let started = process.request(json!({
        "protocol": 1,
        "id": 2,
        "method": "catalog/start",
        "params": {"reason": "fixture", "force": true}
    }));
    assert_eq!(started["ok"], true);

    let mut previous = [0_u64; 5];
    let terminal = loop {
        let event = process.read_event();
        assert_eq!(event["event"], "catalog/progress");
        let status = &event["params"]["status"];
        let current = [
            status["discovered"]
                .as_u64()
                .expect("discovered is numeric"),
            status["indexed"].as_u64().expect("indexed is numeric"),
            status["rejected"].as_u64().expect("rejected is numeric"),
            status["policySkipped"]
                .as_u64()
                .expect("policySkipped is numeric"),
            status["ignored"].as_u64().expect("ignored is numeric"),
        ];
        assert!(
            current
                .iter()
                .zip(previous)
                .all(|(current, previous)| *current >= previous),
            "catalog progress counters must be monotonic"
        );
        previous = current;
        if matches!(
            status["phase"].as_str(),
            Some("ready" | "partial" | "degraded" | "cancelled")
        ) {
            break event;
        }
    };
    let status = &terminal["params"]["status"];
    assert_eq!(status["phase"], "partial");
    assert_eq!(status["completeness"], "partial");
    assert_eq!(status["committedGeneration"], 1);
    assert_eq!(status["totalFiles"], 3);
    assert_eq!(status["discovered"], 3);
    assert_eq!(status["indexed"], 2);
    assert_eq!(status["rejected"], 0);
    assert_eq!(status["policySkipped"], 1);
    assert_eq!(
        status["ignored"], 4,
        "one gitignored directory, one gitignored file, and two hard directories are pruned"
    );

    let included = process.request(json!({
        "protocol": 1,
        "id": 3,
        "method": "search",
        "params": {"query": "IncludedService", "limit": 20}
    }));
    assert_eq!(included["result"]["items"][0]["name"], "IncludedService");
    let ignored = process.request(json!({
        "protocol": 1,
        "id": 4,
        "method": "search",
        "params": {"query": "Ignored", "limit": 20}
    }));
    assert_eq!(ignored["result"]["items"].as_array().map(Vec::len), Some(0));
    process.shutdown(5);
}

#[test]
fn catalog_counts_root_and_nested_gitignore_pruning_without_hard_excludes() {
    let temp = TestDir::new("nested-gitignore-count");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(workspace.join("nested/ignored"))
        .expect("nested fixture directory should exist");
    fs::write(workspace.join(".gitignore"), "RootIgnored.ets\n")
        .expect("root gitignore should be written");
    fs::write(workspace.join("nested/.gitignore"), "ignored/\n")
        .expect("nested gitignore should be written");
    fs::write(workspace.join("RootIgnored.ets"), "class RootIgnored {}\n")
        .expect("root ignored source should be written");
    fs::write(
        workspace.join("nested/ignored/NestedIgnored.ts"),
        "class NestedIgnored {}\n",
    )
    .expect("nested ignored source should be written");
    fs::write(
        workspace.join("nested/Included.ets"),
        "class IncludedNested {}\n",
    )
    .expect("included source should be written");

    let mut process = SidecarProcess::spawn();
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 2,
            "method": "catalog/start",
            "params": {"reason": "nested-ignore", "force": false}
        }))["ok"],
        true
    );
    let terminal = loop {
        let event = process.read_event();
        if matches!(
            event["params"]["status"]["phase"].as_str(),
            Some("ready" | "partial" | "degraded" | "cancelled")
        ) {
            break event;
        }
    };
    let status = &terminal["params"]["status"];
    assert_eq!(status["phase"], "ready");
    assert_eq!(status["discovered"], 1);
    assert_eq!(status["indexed"], 1);
    assert_eq!(
        status["ignored"], 2,
        "both hierarchical gitignore pruning decisions must be counted"
    );
    process.shutdown(3);
}

#[test]
fn malformed_gitignore_rule_does_not_discard_valid_rules_or_healthy_sources() {
    let temp = TestDir::new("partial-gitignore");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace).expect("workspace should exist");
    fs::write(workspace.join(".gitignore"), "Ignored.ets\nbad\\\n")
        .expect("partially malformed gitignore should be written");
    fs::write(
        workspace.join("Ignored.ets"),
        "class IgnoredByValidRule {}\n",
    )
    .expect("ignored source should be written");
    fs::write(
        workspace.join("Included.ets"),
        "class IncludedDespiteBadRule {}\n",
    )
    .expect("healthy source should be written");

    let mut process = SidecarProcess::spawn();
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 2,
            "method": "catalog/start",
            "params": {"reason": "partial-gitignore", "force": false}
        }))["ok"],
        true
    );
    let terminal = loop {
        let event = process.read_event();
        if matches!(
            event["params"]["status"]["phase"].as_str(),
            Some("ready" | "partial" | "degraded" | "cancelled")
        ) {
            break event;
        }
    };
    let status = &terminal["params"]["status"];
    assert_eq!(status["phase"], "degraded");
    assert_eq!(status["committedGeneration"], 1);
    assert_eq!(status["discovered"], 1);
    assert_eq!(status["indexed"], 1);
    assert_eq!(status["rejected"], 1);
    assert_eq!(status["ignored"], 1);

    let included = process.request(json!({
        "protocol": 1,
        "id": 3,
        "method": "search",
        "params": {"query": "IncludedDespiteBadRule", "limit": 20}
    }));
    assert_eq!(included["result"]["servedGeneration"], 1);
    assert_eq!(
        included["result"]["items"][0]["name"],
        "IncludedDespiteBadRule"
    );
    process.shutdown(4);
}

#[test]
#[ignore = "release gate: set ARKTS_INDEX_REAL_FIXTURE to the pinned 455-file checkout"]
fn pinned_large_arkts_fixture_meets_cold_catalog_and_deterministic_query_gates() {
    let workspace = PathBuf::from(
        std::env::var_os("ARKTS_INDEX_REAL_FIXTURE")
            .expect("ARKTS_INDEX_REAL_FIXTURE must name the pinned 455-file checkout"),
    );
    assert!(
        workspace.is_dir(),
        "large ArkTS fixture must be a directory"
    );
    let revision = Command::new("git")
        .args([
            "-C",
            workspace.to_str().expect("fixture path must be UTF-8"),
            "rev-parse",
            "HEAD",
        ])
        .output()
        .expect("git must inspect the pinned fixture");
    assert!(revision.status.success(), "fixture must be a Git checkout");
    assert_eq!(
        String::from_utf8(revision.stdout)
            .expect("fixture revision must be UTF-8")
            .trim(),
        "585feb45114a128a0d2a23947c83faf338e758f7",
        "large ArkTS fixture revision drifted"
    );

    let temp = TestDir::new("real-catalog");
    let cache = temp.path().join("cache");
    let mut process = SidecarProcess::spawn();
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);

    let cold_started_at = Instant::now();
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 2,
            "method": "catalog/start",
            "params": {"reason": "real-fixture-gate", "force": true}
        }))["result"]["accepted"],
        true
    );
    let terminal = loop {
        let event = process.read_event();
        if matches!(
            event["params"]["status"]["phase"].as_str(),
            Some("ready" | "partial" | "degraded" | "cancelled")
        ) {
            break event;
        }
    };
    let cold_elapsed = cold_started_at.elapsed();
    assert!(
        cold_elapsed <= Duration::from_secs(3),
        "455-file cold catalog must finish within 3s; took {cold_elapsed:?}"
    );
    let status = &terminal["params"]["status"];
    assert_eq!(status["phase"], "ready", "unexpected terminal: {status:#?}");
    assert_eq!(status["state"], "ready");
    assert_eq!(status["completeness"], "ready");
    assert_eq!(status["discovered"], 455);
    assert_eq!(status["indexed"], 455);
    assert_eq!(status["rejected"], 0);
    assert_eq!(status["totalFiles"], 455);
    assert_eq!(status["committedGeneration"], 1);

    for (id, query, expected) in [
        (3, "ChatBaseViewModel", "ChatBaseViewModel"),
        (4, "CBVM", "ChatBaseViewModel"),
        (5, "ChatP2PPage", "ChatP2PPage"),
        (6, "BuildProfile", "BuildProfile"),
    ] {
        let result = process.request(json!({
            "protocol": 1,
            "id": id,
            "method": "search",
            "params": {"query": query, "limit": 20}
        }));
        assert_eq!(result["ok"], true, "query {query} should succeed");
        assert_eq!(result["result"]["servedGeneration"], 1);
        assert_eq!(
            result["result"]["items"][0]["name"], expected,
            "query {query} must return the pinned deterministic first match"
        );
    }

    for (id, query, expected_count, expected_locations) in [
        (
            7,
            "TeamRepo",
            1,
            vec![("chatkit/src/main/ets/repo/TeamRepo.ets", 96)],
        ),
        (
            8,
            "sendMessage",
            4,
            vec![
                ("chatkit/src/main/ets/repo/ChatRepo.ets", 261),
                ("chatkit_ui/src/main/ets/view/MultiLineInputView.ets", 463),
                (
                    "chatkit_ui/src/main/ets/viewmodel/ChatBaseViewModel.ets",
                    1044,
                ),
                (
                    "chatkit_ui/src/main/ets/viewmodel/ChatBotSubSessionViewModel.ets",
                    284,
                ),
            ],
        ),
        (
            9,
            "BuildProfile",
            7,
            vec![
                ("chatkit/BuildProfile.ets", 11),
                ("chatkit_ui/BuildProfile.ets", 11),
                ("common/BuildProfile.ets", 11),
                ("contactkit_ui/BuildProfile.ets", 11),
                ("conversationkit_ui/BuildProfile.ets", 11),
                ("corekit/BuildProfile.ets", 11),
                ("teamkit_ui/BuildProfile.ets", 11),
            ],
        ),
    ] {
        let result = process.request(json!({
            "protocol": 1,
            "id": id,
            "method": "search",
            // Workspace-symbol search is intentionally fuzzy. Limiting the
            // response to the number of exact definitions proves exact-name
            // matches rank ahead of prefix and substring matches.
            "params": {"query": query, "limit": expected_count}
        }));
        let items = result["result"]["items"]
            .as_array()
            .expect("search items must be an array");
        assert_eq!(
            items.len(),
            expected_count,
            "unexpected {query} matches: {items:#?}"
        );
        let mut actual = items
            .iter()
            .map(|item| {
                let uri = item["uri"].as_str().expect("symbol URI must be a string");
                let relative = uri
                    .split("/nim-uikit-harmony/")
                    .nth(1)
                    .expect("symbol URI must be inside the pinned fixture");
                (
                    relative.to_owned(),
                    item["range"]["start"]["line"]
                        .as_u64()
                        .expect("symbol line must be an integer"),
                )
            })
            .collect::<Vec<_>>();
        actual.sort();
        let mut expected = expected_locations
            .into_iter()
            .map(|(uri, line)| (uri.to_owned(), line))
            .collect::<Vec<_>>();
        expected.sort();
        assert_eq!(
            actual, expected,
            "{query} must jump to every exact definition"
        );
    }
    process.shutdown(10);
}
