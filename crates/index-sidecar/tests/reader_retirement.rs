//! Queued requests also own a terminal when the execution resources disappear.
use serde_json::json;
use std::{
    collections::BTreeSet,
    ffi::OsStr,
    fs,
    time::{Duration, Instant},
};
#[allow(dead_code)]
#[path = "support/maintenance_session.rs"]
mod session;
use session::{SidecarProcess, TestDir, init, start, terminal};
#[test]
fn losing_every_reader_finishes_the_accepted_queue_instead_of_leaving_it_owned_forever() {
    let temp = TestDir::new("reader-retire-pending");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("A.ets"), "export class Visible {}\n").unwrap();
    let gate = temp.path().join("allow-failure");
    let mut p = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_READER_FATAL_IDS", OsStr::new("50,51")),
        ("ARKTS_INDEX_TEST_READER_FATAL_GATE", gate.as_os_str()),
    ]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    for id in [50, 51, 60, 61, 62, 63] {
        p.send(json!({"protocol":1,"id":id,"method":"search","params":{"query":"Visible","limit":10,"requestToken":format!("q{id}")}}));
    }
    let full = p.request(json!({"protocol":1,"id":70,"method":"index/reader-status","params":{}}));
    assert_eq!(full["result"]["activeReaderTasks"], 2);
    assert_eq!(full["result"]["queuedReads"], 4);
    fs::write(&gate, "both readers may fail").unwrap();
    let mut completed = BTreeSet::new();
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut id = 71;
    loop {
        assert!(Instant::now() < deadline, "readers did not retire");
        p.send(json!({"protocol":1,"id":id,"method":"index/reader-status","params":{}}));
        let status = loop {
            let response = p.response();
            if response["id"] == id {
                break response;
            }
            let finished = response["id"].as_u64().unwrap();
            assert!(completed.insert(finished), "duplicate terminal: {response}");
            assert_eq!(response["error"]["code"], "reader_unavailable");
        };
        id += 1;
        if status["result"]["retiredReaders"] == 2 {
            assert_eq!(status["result"]["activeReaderTasks"], 0);
            assert_eq!(
                status["result"]["queuedReads"], 0,
                "accepted jobs cannot wait for nonexistent readers"
            );
            assert_eq!(status["result"]["readerThreadsCreated"], 2);
            assert_eq!(completed, BTreeSet::from([50, 51, 60, 61, 62, 63]));
            break;
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    p.shutdown(id);
}
