use serde_json::json;
use std::fs;
#[expect(dead_code, reason = "shared public protocol fixture")]
#[path = "support/sidecar_process.rs"]
mod sidecar_process;
use sidecar_process::{SidecarProcess, TestDir, initialize};
#[expect(dead_code, reason = "shared hash-first fixtures")]
#[path = "support/hash_first.rs"]
mod hash_first;
use hash_first::{build, count, parsed, stored};
#[test]
fn cold_establishes_complete_key_then_hot_reuses_without_parsers_or_bulk_writes() {
    let temp = TestDir::new("catalog-hash-first");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    let trace = temp.path().join("trace.jsonl");
    fs::create_dir(&workspace).unwrap();
    for index in 0..8 {
        fs::write(
            workspace.join(format!("{index:04}.ets")),
            format!("export class HashFirst{index} {{}}"),
        )
        .unwrap();
    }
    let mut process = SidecarProcess::spawn_with_environment(&[(
        "ARKTS_INDEX_TEST_STREAM_TRACE",
        trace.as_os_str(),
    )]);
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    build(&mut process, 2);
    let before = stored(&cache);
    assert!(
        before
            .1
            .as_deref()
            .unwrap()
            .starts_with("arkts-complete-scan-v2:"),
        "cold nonforce must publish qualified complete-scan identity"
    );
    assert_eq!(
        parsed(&trace),
        8,
        "cold parses each admitted source exactly once"
    );
    assert_eq!(count(&trace, "hash_read"), 0);
    assert_eq!(count(&trace, "parse_read"), 8);
    fs::write(&trace, "").unwrap();
    let stages = build(&mut process, 3);
    assert_eq!(parsed(&trace), 0, "hot hit must invoke zero parsers");
    assert_eq!(count(&trace, "hash_read"), 8);
    assert_eq!(count(&trace, "parse_read"), 0);
    assert_eq!(
        count(&trace, "started"),
        0,
        "hot hit must create zero parser workers"
    );
    assert_eq!(
        stored(&cache),
        before,
        "reuse keeps physical database and key"
    );
    assert!(stages.iter().any(|stage| stage == "reusing"));
    assert!(
        stages
            .iter()
            .all(|stage| matches!(stage.as_str(), "reusing" | "checking" | "publishing"))
    );
    let result = process.request(
        json!({"protocol":1,"id":4,"method":"search","params":{"query":"HashFirst7","limit":10}}),
    );
    assert_eq!(result["result"]["servedGeneration"], 2);
    assert_eq!(result["result"]["items"].as_array().unwrap().len(), 1);
    process.shutdown(5);
}
