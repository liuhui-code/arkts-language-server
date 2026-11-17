use serde_json::json;
use std::{fs, time::Duration};
#[expect(dead_code, reason = "shared public stdio harness")]
#[path = "support/sidecar_process.rs"]
mod support;
use support::{SidecarProcess, TestDir};
fn init(p: &mut SidecarProcess, temp: &TestDir) {
    fs::create_dir_all(temp.path().join("workspace")).unwrap();
    let response=p.request(json!({"protocol":1,"id":1,"method":"initialize","params":{"workspaceRoot":temp.path().join("workspace"),"cacheDirectory":temp.path().join("cache"),"capabilities":["versioned-file-maintenance-v1"]}}));
    assert_eq!(response["ok"], true);
    assert_eq!(
        response["result"]["capabilities"][0],
        "versioned-file-maintenance-v1"
    );
}
fn start(p: &mut SidecarProcess) {
    let response=p.request(json!({"protocol":1,"id":2,"method":"maintenance/start","params":{"attemptId":"cold-1","input":{"issuer":"window-a","revision":1},"reason":"startup"}}));
    assert_eq!(
        response["ok"], true,
        "maintenance must be reachable through the actual child protocol: {response}"
    );
    assert_eq!(response["result"]["accepted"], true);
}
#[test]
fn negotiated_initialize_identifies_the_maintenance_producer_and_reader_lifetime() {
    let temp = TestDir::new("maintenance-negotiation-identity");
    fs::create_dir_all(temp.path().join("workspace")).unwrap();
    let mut p = SidecarProcess::spawn();
    let response = p.request(json!({"protocol":1,"id":1,"method":"initialize","params":{
        "workspaceRoot":temp.path().join("workspace"),"cacheDirectory":temp.path().join("cache"),
        "capabilities":["versioned-file-maintenance-v1"]}}));
    assert_eq!(response["ok"], true, "{response}");
    let result = &response["result"];
    assert!(
        result["factsDomain"].as_str().is_some_and(|domain| {
            domain.starts_with("arkts-file-facts-v1:") && domain.len() > 20
        }),
        "parent must bind subsequent receipts to the negotiated producer: {response}"
    );
    assert!(
        result["readerEpoch"]
            .as_str()
            .is_some_and(|v| !v.is_empty())
    );
    p.shutdown(2);
}
#[test]
fn status_and_cancel_remain_responsive_while_the_maintenance_worker_waits() {
    let temp = TestDir::new("maintenance-control");
    let mut p = SidecarProcess::spawn_with_catalog_gate(Duration::from_secs(5));
    init(&mut p, &temp);
    start(&mut p);
    assert_eq!(
        p.request(json!({"protocol":1,"id":3,"method":"maintenance/status","params":{}}))["ok"],
        true
    );
    let cancel = p.request(
        json!({"protocol":1,"id":4,"method":"maintenance/cancel","params":{"attemptId":"cold-1","input":{"issuer":"window-a","revision":1}}}),
    );
    assert_eq!(cancel["result"]["accepted"], true);
    assert_eq!(cancel["result"]["status"]["phase"], "cancelling");
    loop {
        let event = p.read_event();
        if event["event"] == "maintenance/terminal" {
            assert_eq!(event["phase"], "cancelled");
            assert_eq!(event["dataPublished"], false);
            break;
        }
    }
    let status = p.request(json!({"protocol":1,"id":5,"method":"maintenance/status","params":{}}));
    assert_eq!(status["result"]["phase"], "cancelled");
    p.shutdown(6);
}

fn terminal(p: &mut SidecarProcess) -> serde_json::Value {
    loop {
        let event = p.read_event();
        if event["event"] == "maintenance/terminal" {
            return event;
        }
    }
}
fn parsed(path: &std::path::Path) -> usize {
    fs::read_to_string(path)
        .unwrap_or_default()
        .lines()
        .filter(|l| serde_json::from_str::<serde_json::Value>(l).unwrap()["event"] == "parser_call")
        .count()
}
#[test]
fn real_child_reconciles_128_files_but_parses_only_the_edited_file_and_noop_reuses_data_head() {
    let temp = TestDir::new("maintenance-delta");
    let trace = temp.path().join("trace.jsonl");
    let mut p = SidecarProcess::spawn_with_environment(&[(
        "ARKTS_INDEX_TEST_STREAM_TRACE",
        trace.as_os_str(),
    )]);
    init(&mut p, &temp);
    let workspace = temp.path().join("workspace");
    for n in 0..128 {
        fs::write(
            workspace.join(format!("{n:04}.ets")),
            format!("export class Item{n} {{}}\n"),
        )
        .unwrap();
    }
    start(&mut p);
    let cold = terminal(&mut p);
    assert_eq!(cold["outcome"], "qualified", "cold terminal: {cold}");
    assert_eq!(cold["indexedDocuments"], 128);
    assert_eq!(parsed(&trace), 128);
    let store = cold["qualification"]["storeId"].clone();
    let head = cold["qualification"]["head"].as_u64().unwrap();
    fs::write(&trace, "").unwrap();
    fs::write(workspace.join("0000.ets"), "export class ChangedFile {}\n").unwrap();
    let response=p.request(json!({"protocol":1,"id":3,"method":"maintenance/start","params":{"attemptId":"edit-2","input":{"issuer":"window-a","revision":2},"reason":"saved"}}));
    assert_eq!(response["result"]["accepted"], true);
    let edited = terminal(&mut p);
    assert_eq!(edited["outcome"], "qualified", "edited terminal: {edited}");
    assert_eq!(edited["qualification"]["storeId"], store);
    assert_eq!(edited["qualification"]["head"], head + 1);
    assert_eq!(
        parsed(&trace),
        1,
        "one changed file must not reparse the 127 unchanged files"
    );
    assert_eq!(edited["writtenDocuments"], 1);
    let found = p.request(
        json!({"protocol":1,"id":4,"method":"search","params":{"query":"ChangedFile","limit":10}}),
    );
    assert_eq!(found["result"]["items"].as_array().unwrap().len(), 1);
    let stable = p.request(
        json!({"protocol":1,"id":5,"method":"search","params":{"query":"Item127","limit":10}}),
    );
    assert_eq!(stable["result"]["items"].as_array().unwrap().len(), 1);
    let stale = p.request(
        json!({"protocol":1,"id":6,"method":"search","params":{"query":"Item0","limit":10}}),
    );
    assert!(stale["result"]["items"].as_array().unwrap().is_empty());
    fs::write(&trace, "").unwrap();
    p.request(json!({"protocol":1,"id":7,"method":"maintenance/start","params":{"attemptId":"noop-3","input":{"issuer":"window-a","revision":3},"reason":"reconcile"}}));
    let noop = terminal(&mut p);
    assert_eq!(noop["outcome"], "qualified", "noop terminal: {noop}");
    assert_eq!(noop["qualification"]["head"], head + 1);
    assert_eq!(noop["qualification"]["storeId"], store);
    assert_eq!(noop["writtenDocuments"], 0);
    assert_eq!(noop["indexedDocuments"], 128);
    assert_eq!(noop["factRowsWritten"], 0);
    assert_eq!(noop["dataPublished"], false);
    assert_eq!(parsed(&trace), 0);
    println!(
        "native128: cold=128 edit=1 noop=0; sameStore={store}; noopHead={}",
        head + 1
    );
    p.shutdown(8);
}

#[test]
fn duplicate_start_and_stale_cancel_do_not_spawn_or_cancel_another_input() {
    let temp = TestDir::new("maintenance-request-identity");
    let mut p = SidecarProcess::spawn_with_catalog_gate(Duration::from_secs(5));
    init(&mut p, &temp);
    start(&mut p);
    let duplicate=p.request(json!({"protocol":1,"id":3,"method":"maintenance/start","params":{"attemptId":"cold-1","input":{"issuer":"window-a","revision":1},"reason":"startup"}}));
    assert_eq!(duplicate["result"]["accepted"], false);
    assert_eq!(duplicate["result"]["status"]["maintenanceWorkerSpawns"], 1);
    let stale=p.request(json!({"protocol":1,"id":4,"method":"maintenance/cancel","params":{"attemptId":"cold-1","input":{"issuer":"window-a","revision":0}}}));
    assert_eq!(stale["result"]["accepted"], false);
    let correct=p.request(json!({"protocol":1,"id":5,"method":"maintenance/cancel","params":{"attemptId":"cold-1","input":{"issuer":"window-a","revision":1}}}));
    assert_eq!(correct["result"]["accepted"], true);
    let cancelled = terminal(&mut p);
    assert_eq!(cancelled["phase"], "cancelled");
    assert!(
        cancelled["error"].is_null(),
        "expected cancellation is not an error: {cancelled}"
    );
    let retry=p.request(json!({"protocol":1,"id":6,"method":"maintenance/start","params":{"attemptId":"cold-1","input":{"issuer":"window-a","revision":1},"reason":"startup"}}));
    assert_eq!(retry["result"]["accepted"], false);
    assert_eq!(retry["result"]["status"]["maintenanceWorkerSpawns"], 1);
    p.shutdown(7);
}
#[test]
fn panic_after_data_commit_is_unknown_and_recovers_on_new_input_without_losing_published_data() {
    let temp = TestDir::new("maintenance-publication-unknown");
    let mut p = SidecarProcess::spawn_with_environment(&[
        (
            "ARKTS_INDEX_TEST_MAINTENANCE_PANIC",
            std::ffi::OsStr::new("after-data-commit"),
        ),
        ("RUST_BACKTRACE", std::ffi::OsStr::new("0")),
    ]);
    init(&mut p, &temp);
    let file = temp.path().join("workspace/A.ets");
    fs::write(&file, "export class Before {}\n").unwrap();
    start(&mut p);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    fs::write(&file, "export class After {}\n").unwrap();
    p.request(json!({"protocol":1,"id":3,"method":"maintenance/start","params":{"attemptId":"edit-2","input":{"issuer":"window-a","revision":2},"reason":"saved"}}));
    let failed = terminal(&mut p);
    assert_eq!(
        failed["outcome"], "unknown",
        "publication outcome after panic: {failed}"
    );
    assert!(failed["dataPublished"].is_null());
    let visible = p.request(
        json!({"protocol":1,"id":4,"method":"search","params":{"query":"After","limit":10}}),
    );
    assert_eq!(visible["result"]["servedGeneration"], 2);
    assert_eq!(visible["result"]["items"].as_array().unwrap().len(), 1);
    p.request(json!({"protocol":1,"id":5,"method":"maintenance/start","params":{"attemptId":"recover-3","input":{"issuer":"window-a","revision":3},"reason":"explicit-reconcile"}}));
    let recovered = terminal(&mut p);
    assert_eq!(recovered["outcome"], "qualified");
    assert_eq!(recovered["qualification"]["head"], 2);
    assert_eq!(recovered["writtenDocuments"], 0);
    p.shutdown(6);
}

#[test]
fn missing_terminal_after_worker_exit_is_reported_and_the_same_session_can_continue() {
    let temp = TestDir::new("maintenance-missing-terminal");
    let mut p = SidecarProcess::spawn_with_environment(&[
        (
            "ARKTS_INDEX_TEST_MAINTENANCE_PANIC",
            std::ffi::OsStr::new("outside-catch-once"),
        ),
        ("RUST_BACKTRACE", std::ffi::OsStr::new("0")),
    ]);
    init(&mut p, &temp);
    fs::write(
        temp.path().join("workspace/A.ets"),
        "export class Present {}\n",
    )
    .unwrap();
    start(&mut p);
    let deadline = std::time::Instant::now() + Duration::from_secs(30);
    let mut id = 3;
    loop {
        let status =
            p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
        id += 1;
        if status["result"]["activeMaintenanceTasks"] == 0 {
            assert_eq!(status["result"]["phase"], "failed");
            break;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "completed worker without a result remained active: {status}"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    let unknown = terminal(&mut p);
    assert_eq!(unknown["outcome"], "unknown");
    assert!(unknown["dataPublished"].is_null());
    assert!(unknown["resourceError"].is_string());
    p.request(json!({"protocol":1,"id":id,"method":"maintenance/start","params":{"attemptId":"recover-2","input":{"issuer":"window-a","revision":2},"reason":"explicit-reconcile"}}));
    id += 1;
    let restored = terminal(&mut p);
    assert_eq!(restored["outcome"], "qualified");
    assert_eq!(restored["writtenDocuments"], 0);
    assert_eq!(restored["qualification"]["head"], 1);
    p.shutdown(id);
}
