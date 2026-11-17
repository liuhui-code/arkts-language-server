use serde_json::json;
use std::fs;

#[expect(dead_code, reason = "shared hash-first fixtures")]
#[path = "support/hash_first.rs"]
mod hash_first;
#[expect(dead_code, reason = "shared public protocol fixture")]
#[path = "support/sidecar_process.rs"]
mod sidecar_process;
use hash_first::{create, parsed};
use sidecar_process::{SidecarProcess, TestDir};

#[test]
fn ordinary_catalog_change_reparses_only_changed_file_and_preserves_complete_search() {
    let temp = TestDir::new("incremental-maintenance");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    let trace = temp.path().join("trace.jsonl");
    create(&workspace, 128);
    let mut process = SidecarProcess::spawn_with_environment(&[(
        "ARKTS_INDEX_TEST_STREAM_TRACE",
        trace.as_os_str(),
    )]);
    // Production Node now explicitly negotiates this capability. The original
    // raw legacy transcript and its 128!=1 failure remain in the IX-00 evidence.
    // Keep the same 128-source and exact parser/result oracle on the default path.
    let initialized = process.request(json!({"protocol":1,"id":1,"method":"initialize",
        "params":{"workspaceRoot":workspace,"cacheDirectory":cache,
        "capabilities":["versioned-file-maintenance-v1"]}}));
    assert_eq!(initialized["ok"], true);
    start(&mut process, 2);
    let cold = terminal(&mut process);
    let cold_parsed = parsed(&trace);
    fs::write(&trace, "").unwrap();
    fs::write(workspace.join("0000.ets"), "export class ChangedFile {}\n").unwrap();
    start(&mut process, 3);
    let changed = terminal(&mut process);
    let changed_parsed = parsed(&trace);
    let renamed = process.request(json!({"protocol":1,"id":4,"method":"search",
        "params":{"query":"ChangedFile","limit":10}}));
    let removed = process.request(json!({"protocol":1,"id":5,"method":"search",
        "params":{"query":"HashFirst0","limit":10}}));
    let untouched = process.request(json!({"protocol":1,"id":6,"method":"search",
        "params":{"query":"HashFirst127","limit":10}}));
    process.shutdown(7);
    assert_eq!(cold["outcome"], "qualified");
    assert_eq!(cold["indexedDocuments"], 128);
    assert_eq!(cold_parsed, 128);
    assert_eq!(changed["outcome"], "qualified");
    assert_eq!(changed["indexedDocuments"], 128);
    assert_eq!(changed["writtenDocuments"], 1);
    assert_eq!(renamed["result"]["items"].as_array().unwrap().len(), 1);
    assert!(removed["result"]["items"].as_array().unwrap().is_empty());
    assert_eq!(untouched["result"]["items"].as_array().unwrap().len(), 1);
    assert_eq!(
        changed_parsed, 1,
        "one-file edit must not reparse unchanged workspace sources"
    );
}

fn start(process: &mut SidecarProcess, id: u64) {
    let response = process.request(json!({"protocol":1,"id":id,"method":"maintenance/start",
        "params":{"attemptId":format!("default-{id}"),"input":{"issuer":"default-lsp-path","revision":id},"reason":"reconcile"}}));
    assert_eq!(response["result"]["accepted"], true, "{response}");
}
fn terminal(process: &mut SidecarProcess) -> serde_json::Value {
    loop {
        let value = process.read_event();
        if value["event"] == "maintenance/terminal" {
            return value;
        }
    }
}
