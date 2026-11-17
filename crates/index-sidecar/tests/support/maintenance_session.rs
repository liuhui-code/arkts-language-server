use serde_json::{Value, json};
use std::{fs, path::Path};
#[expect(dead_code, reason = "shared public child-process harness")]
#[path = "sidecar_process.rs"]
mod support;
pub(crate) use support::{SidecarProcess, TestDir};
pub(crate) fn init(p: &mut SidecarProcess, root: &Path, cache: &Path) {
    let r = p.request(json!({"protocol":1,"id":1,"method":"initialize","params":{"workspaceRoot":root,"cacheDirectory":cache,"capabilities":["versioned-file-maintenance-v1"]}}));
    assert_eq!(r["ok"], true, "{r}");
}
pub(crate) fn start(p: &mut SidecarProcess, id: u64, revision: u64) {
    let r = p.request(json!({"protocol":1,"id":id,"method":"maintenance/start","params":{"attemptId":format!("reconcile-{revision}"),"input":{"issuer":"window","revision":revision},"reason":"reconcile"}}));
    assert_eq!(r["result"]["accepted"], true, "{r}");
}
pub(crate) fn terminal(p: &mut SidecarProcess) -> Value {
    loop {
        let event = p.read_event();
        if event["event"] == "maintenance/terminal" {
            return event;
        }
    }
}
pub(crate) fn changes(p: &mut SidecarProcess, id: u64, revision: u64, uri: &str) -> Value {
    p.request(json!({"protocol":1,"id":id,"method":"maintenance/changes","params":{"input":{"issuer":"window","revision":revision},"changes":[{"uri":uri,"kind":"changed"}],"uncertainty":[]}}))
}
pub(crate) fn parsed(trace: &Path) -> usize {
    fs::read_to_string(trace)
        .unwrap_or_default()
        .lines()
        .filter(|l| serde_json::from_str::<Value>(l).unwrap()["event"] == "parser_call")
        .count()
}
