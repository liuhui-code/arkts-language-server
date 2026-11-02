use serde_json::json;
use std::fs;
#[expect(dead_code, reason = "shared public protocol fixture")]
#[path = "support/sidecar_process.rs"]
mod sidecar_process;
use sidecar_process::{SidecarProcess, TestDir, initialize};

#[test]
fn force_writes_before_all_sources_are_parsed_without_advancing_activation_phase() {
    let temp = TestDir::new("force-streaming");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir(&workspace).unwrap();
    for index in 0..130 {
        fs::write(
            workspace.join(format!("{index:04}.ets")),
            format!("export class Streaming{index} {{}}"),
        )
        .unwrap();
    }
    let mut process = SidecarProcess::spawn();
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    assert_eq!(
        process.request(json!({"protocol":1,"id":2,"method":"catalog/start",
        "params":{"force":true,"reason":"streaming-contract"}}))["ok"],
        true
    );
    let mut observed_streaming = false;
    let started = std::time::Instant::now();
    let mut storage_events = 0;
    loop {
        let event = process.read_event();
        let status = &event["params"]["status"];
        if status.get("storage").is_some() {
            storage_events += 1;
        }
        if status["storage"]["writtenDocuments"].as_u64().unwrap_or(0) > 0 && !observed_streaming {
            assert!(
                status["indexed"].as_u64().unwrap() < 130,
                "force must commit a private chunk before retaining every parsed source"
            );
            assert_eq!(status["phase"], "discovering");
            assert_eq!(status["committedGeneration"], 0);
            observed_streaming = true;
        }
        if matches!(
            status["phase"].as_str(),
            Some("ready" | "partial" | "degraded" | "cancelled")
        ) {
            assert_eq!(status["phase"], "ready");
            break;
        }
    }
    assert!(observed_streaming);
    assert!(
        storage_events <= 40 + started.elapsed().as_millis() / 250,
        "storage updates must coalesce unchanged writer polls, got {storage_events}"
    );
    let result = process.request(json!({"protocol":1,"id":3,"method":"search",
        "params":{"query":"Streaming129","limit":10}}));
    assert_eq!(result["result"]["items"].as_array().unwrap().len(), 1);
    process.shutdown(4);
}

fn trace_events(path: &std::path::Path) -> Vec<serde_json::Value> {
    fs::read_to_string(path)
        .unwrap_or_default()
        .lines()
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect()
}
fn count(events: &[serde_json::Value], name: &str) -> usize {
    events.iter().filter(|event| event["event"] == name).count()
}
fn wait_trace(
    path: &std::path::Path,
    predicate: impl Fn(&[serde_json::Value]) -> bool,
) -> Vec<serde_json::Value> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    loop {
        let events = trace_events(path);
        if predicate(&events) {
            return events;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "pipeline did not reach expected gate: {events:?}"
        );
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
}
fn seed_old(process: &mut SidecarProcess) {
    assert_eq!(process.request(json!({"protocol":1,"id":2,"method":"refresh","params":{
        "generation":1,"changed":[{"uri":"file:///workspace/Old.ets","text":"class OldGeneration {}"}],
        "removedUris":[]}}))["ok"], true);
}
fn assert_old(process: &mut SidecarProcess, id: u64) {
    let old = process.request(json!({"protocol":1,"id":id,"method":"search",
        "params":{"query":"OldGeneration","limit":10}}));
    assert_eq!(old["result"]["servedGeneration"], 1);
    assert_eq!(old["result"]["items"].as_array().unwrap().len(), 1);
    let new = process.request(json!({"protocol":1,"id":id+1,"method":"search",
        "params":{"query":"Streaming0","limit":10}}));
    assert_eq!(new["result"]["servedGeneration"], 1);
    assert!(new["result"]["items"].as_array().unwrap().is_empty());
}
fn await_terminal(process: &mut SidecarProcess, expected: &str) {
    loop {
        let event = process.read_event();
        let status = &event["params"]["status"];
        if matches!(
            status["phase"].as_str(),
            Some("ready" | "partial" | "degraded" | "cancelled")
        ) {
            assert_eq!(status["phase"], expected, "{status}");
            return;
        }
    }
}

#[test]
fn slow_first_uri_bounds_reordering_to_four_slots_and_preserves_old_queries() {
    let temp = TestDir::new("stream-slow-first");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    let trace = temp.path().join("trace.jsonl");
    let gate = temp.path().join("release");
    fs::create_dir(&workspace).unwrap();
    for index in 0..130 {
        fs::write(
            workspace.join(format!("{index:04}.ets")),
            format!("export class Streaming{index} {{}}"),
        )
        .unwrap();
    }
    let first = arkts_index_sqlite::path_to_file_uri(&workspace.join("0000.ets"));
    let mut process = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_STREAM_TRACE", trace.as_os_str()),
        (
            "ARKTS_INDEX_TEST_STREAM_FIRST_URI",
            std::ffi::OsStr::new(&first),
        ),
        ("ARKTS_INDEX_TEST_STREAM_FIRST_GATE", gate.as_os_str()),
    ]);
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    seed_old(&mut process);
    assert_eq!(
        process.request(json!({"protocol":1,"id":3,"method":"catalog/start",
        "params":{"force":true,"reason":"slow-first"}}))["ok"],
        true
    );
    let events = wait_trace(&trace, |events| {
        count(events, "first_wait") == 1 && count(events, "parsed") == 3
    });
    assert_eq!(
        count(&events, "started"),
        4,
        "later URI results cannot open new dispatch slots"
    );
    assert_old(&mut process, 4);
    fs::write(&gate, "release").unwrap();
    await_terminal(&mut process, "ready");
    let events = trace_events(&trace);
    assert_eq!(count(&events, "started"), 130);
    assert_eq!(count(&events, "parsed"), 130);
    assert_eq!(count(&events, "worker_exit"), 4);
    assert_eq!(count(&events, "joined"), 1);
    process.shutdown(6);
}

#[test]
fn cancelling_a_paused_writer_disconnects_full_result_slots_and_joins_before_terminal() {
    let temp = TestDir::new("stream-cancel-full-slots");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    let trace = temp.path().join("trace.jsonl");
    let gate = temp.path().join("never-released");
    fs::create_dir(&workspace).unwrap();
    for index in 0..130 {
        fs::write(
            workspace.join(format!("{index:04}.ets")),
            format!("export class Streaming{index} {{}}"),
        )
        .unwrap();
    }
    let mut process = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_STREAM_TRACE", trace.as_os_str()),
        ("ARKTS_INDEX_TEST_STREAM_WRITER_GATE", gate.as_os_str()),
    ]);
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    seed_old(&mut process);
    assert_eq!(
        process.request(json!({"protocol":1,"id":3,"method":"catalog/start",
        "params":{"force":true,"reason":"cancel-full-slots"}}))["ok"],
        true
    );
    let events = wait_trace(&trace, |events| {
        count(events, "writer_wait") == 1 && count(events, "parsed") >= 68
    });
    assert_eq!(count(&events, "parsed"), 68);
    assert_eq!(
        count(&events, "started"),
        68,
        "writer pause must stop producer dispatch"
    );
    assert_old(&mut process, 4);
    let cancelled = process.request(json!({"protocol":1,"id":6,"method":"catalog/cancel",
        "params":{"generation":2}}));
    assert_eq!(cancelled["result"]["cancelled"], true);
    await_terminal(&mut process, "cancelled");
    let events = trace_events(&trace);
    assert_eq!(count(&events, "worker_exit"), 4);
    assert_eq!(count(&events, "joined"), 1);
    assert_eq!(count(&events, "started"), 68);
    assert_old(&mut process, 7);
    process.shutdown(9);
}

#[test]
fn a_parser_panic_joins_all_workers_and_cannot_publish_a_partial_catalog() {
    let temp = TestDir::new("stream-parser-panic");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    let trace = temp.path().join("trace.jsonl");
    fs::create_dir(&workspace).unwrap();
    for index in 0..8 {
        fs::write(
            workspace.join(format!("{index:04}.ets")),
            format!("class Streaming{index} {{}}"),
        )
        .unwrap();
    }
    let first = arkts_index_sqlite::path_to_file_uri(&workspace.join("0000.ets"));
    let mut process = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_STREAM_TRACE", trace.as_os_str()),
        (
            "ARKTS_INDEX_TEST_STREAM_PANIC_URI",
            std::ffi::OsStr::new(&first),
        ),
    ]);
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    seed_old(&mut process);
    assert_eq!(
        process.request(json!({"protocol":1,"id":3,"method":"catalog/start",
        "params":{"force":true,"reason":"panic-contract"}}))["ok"],
        true
    );
    await_terminal(&mut process, "degraded");
    let events = trace_events(&trace);
    assert_eq!(count(&events, "worker_exit"), 4);
    assert_eq!(count(&events, "joined"), 1);
    assert_old(&mut process, 4);
    process.shutdown(6);
}
