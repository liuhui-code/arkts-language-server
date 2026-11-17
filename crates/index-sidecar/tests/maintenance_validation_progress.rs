//! Public NDJSON proves SQL-stage work reaches the unblocked maintenance owner.
use serde_json::json;
use std::fs;
#[expect(dead_code, reason = "shared public child-process harness")]
#[path = "support/sidecar_process.rs"]
mod support;
use support::{SidecarProcess, TestDir};
#[test]
fn cold_validation_emits_real_sql_work_before_the_single_qualified_terminal() {
    let temp = TestDir::new("maintenance-validation-progress");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let text = (0..500)
        .map(|i| format!("export class Widget{i} {{ value: number = {i} }}\n"))
        .collect::<String>();
    fs::write(root.join("Main.ets"), text).unwrap();
    let mut p = SidecarProcess::spawn();
    let initialized = p.request(json!({"protocol":1,"id":1,"method":"initialize","params":{
        "workspaceRoot":root,"cacheDirectory":temp.path().join("cache"),"capabilities":["versioned-file-maintenance-v1"]}}));
    assert_eq!(initialized["ok"], true);
    let start = p.request(
        json!({"protocol":1,"id":2,"method":"maintenance/start","params":{
        "attemptId":"cold","input":{"issuer":"session","revision":1},"reason":"startup"}}),
    );
    assert_eq!(start["ok"], true);
    let mut events = Vec::new();
    let terminal = loop {
        let e = p.read_event();
        if e["event"] == "maintenance/terminal" {
            break e;
        }
        events.push(e);
    };
    p.shutdown(3);
    assert_eq!(terminal["outcome"], "qualified", "{terminal}");
    for stage in ["QuickCheck", "ForeignKeys", "Fts"] {
        assert!(
            events.iter().any(|e| e["event"] == "maintenance/progress"
                && e["validation"]["stage"] == stage
                && e["validation"]["vmSteps"].as_u64().is_some_and(|n| n > 0)),
            "missing real validation progress for {stage}: {events:?}"
        );
    }
}
