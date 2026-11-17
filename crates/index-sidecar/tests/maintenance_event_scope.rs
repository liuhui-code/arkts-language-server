use arkts_index_sqlite::path_to_file_uri;
use std::fs;
#[path = "support/maintenance_session.rs"]
#[expect(dead_code, reason = "shared public protocol helpers")]
mod session;
use session::{SidecarProcess, TestDir, changes, init, start, terminal};

#[test]
fn file_task_progress_has_an_explicit_scope_and_source_identity() {
    let temp = TestDir::new("maintenance-event-scope");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let source = root.join("Source.ets");
    fs::write(&source, "export class Before {}\n").unwrap();
    let mut process = SidecarProcess::spawn();
    init(&mut process, &root, &temp.path().join("cache"));
    start(&mut process, 2, 1);
    assert_eq!(terminal(&mut process)["outcome"], "qualified");
    fs::write(&source, "export class After {}\n").unwrap();
    let uri = path_to_file_uri(&source);
    assert_eq!(
        changes(&mut process, 3, 2, &uri)["result"]["accepted"],
        true
    );
    let mut progress = Vec::new();
    loop {
        let event = process.read_event();
        if event["event"] == "maintenance/terminal" {
            assert_eq!(event["scope"], "file");
            assert_eq!(event["outcome"], "data-updated");
            break;
        }
        progress.push(event);
    }
    process.shutdown(4);
    assert!(!progress.is_empty(), "the real parser must report progress");
    for event in progress {
        assert_eq!(event["scope"], "file", "{event}");
        assert_eq!(event["uri"], uri, "{event}");
    }
}
