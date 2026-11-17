use arkts_index_sqlite::path_to_file_uri;
use serde_json::json;
use std::fs;
#[path = "support/maintenance_session.rs"]
mod session;
use session::{SidecarProcess, TestDir, changes, init, parsed, start, terminal};
#[test]
fn a_known_file_change_updates_only_its_facts_and_requires_a_separate_complete_qualification() {
    let temp = TestDir::new("maintenance-known-change");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    for n in 0..128 {
        fs::write(
            root.join(format!("{n:04}.ets")),
            format!("export class Item{n} {{}}\n"),
        )
        .unwrap();
    }
    let trace = temp.path().join("trace.jsonl");
    let mut p = SidecarProcess::spawn_with_environment(&[(
        "ARKTS_INDEX_TEST_STREAM_TRACE",
        trace.as_os_str(),
    )]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    let cold = terminal(&mut p);
    assert_eq!(cold["outcome"], "qualified");
    fs::write(&trace, "").unwrap();
    let file = root.join("0000.ets");
    fs::write(&file, "export class Updated {}\n").unwrap();
    let change = changes(&mut p, 3, 2, &path_to_file_uri(&file));
    assert_eq!(
        change["ok"], true,
        "the change must enter the real owner: {change}"
    );
    assert_eq!(change["result"]["accepted"], true);
    let updated = terminal(&mut p);
    assert_eq!(updated["scope"], "file");
    assert_eq!(updated["outcome"], "data-updated", "{updated}");
    assert_eq!(updated["writtenDocuments"], 1);
    assert!(updated["qualification"].is_null());
    assert_eq!(
        updated["snapshot"]["storeId"],
        cold["qualification"]["storeId"]
    );
    assert_eq!(parsed(&trace), 1);
    let found = p.request(
        json!({"protocol":1,"id":4,"method":"search","params":{"query":"Updated","limit":10}}),
    );
    assert_eq!(found["result"]["items"].as_array().unwrap().len(), 1);
    assert_eq!(found["result"]["completeness"], "stale");
    let status = p.request(json!({"protocol":1,"id":5,"method":"maintenance/status","params":{}}));
    assert_eq!(status["result"]["needsReconcile"], true);
    start(&mut p, 6, 2);
    let qualified = terminal(&mut p);
    assert_eq!(qualified["outcome"], "qualified");
    assert_eq!(qualified["qualification"]["input"]["revision"], 2);
    assert_eq!(qualified["writtenDocuments"], 0);
    assert_eq!(
        parsed(&trace),
        1,
        "qualification must not reparse the other 127 files"
    );
    p.shutdown(7);
}

#[test]
fn hot_file_changes_do_not_cancel_a_stable_files_validation_and_pending_keeps_the_latest_content() {
    use std::{
        collections::BTreeSet,
        ffi::OsStr,
        time::{Duration, Instant},
    };
    let temp = TestDir::new("maintenance-fair-changes");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let hot = root.join("Hot.ets");
    let stable = root.join("Stable.ets");
    fs::write(&hot, "export class HotBefore {}\n").unwrap();
    fs::write(&stable, "export class StableBefore {}\n").unwrap();
    let hot_uri = path_to_file_uri(&hot);
    let stable_uri = path_to_file_uri(&stable);
    let gate = temp.path().join("hot-release");
    let stable_gate = temp.path().join("stable-release");
    let trace = temp.path().join("trace.jsonl");
    fs::write(&gate, "cold may pass").unwrap();
    let mut p = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_STREAM_TRACE", trace.as_os_str()),
        ("ARKTS_INDEX_TEST_STREAM_FIRST_URI", OsStr::new(&hot_uri)),
        ("ARKTS_INDEX_TEST_STREAM_FIRST_GATE", gate.as_os_str()),
        (
            "ARKTS_INDEX_TEST_ACTIVATION_GATE_GENERATION",
            OsStr::new("3"),
        ),
        (
            "ARKTS_INDEX_TEST_ACTIVATION_GATE_FILE",
            stable_gate.as_os_str(),
        ),
    ]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    fs::remove_file(&gate).unwrap();
    fs::write(&trace, "").unwrap();
    fs::write(&hot, "export class HotIntermediate {}\n").unwrap();
    assert_eq!(changes(&mut p, 3, 2, &hot_uri)["result"]["accepted"], true);
    let mut id = 4;
    let deadline = Instant::now() + Duration::from_secs(30);
    while !fs::read_to_string(&trace)
        .unwrap_or_default()
        .contains("first_wait")
    {
        assert!(
            Instant::now() < deadline,
            "hot parser did not reach its gate"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    fs::write(&stable, "export class StableUpdated {}\n").unwrap();
    assert_eq!(
        changes(&mut p, id, 3, &stable_uri)["result"]["accepted"],
        true
    );
    id += 1;
    fs::write(&hot, "export class HotNext {}\n").unwrap();
    assert_eq!(changes(&mut p, id, 4, &hot_uri)["result"]["accepted"], true);
    id += 1;
    loop {
        let status =
            p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
        id += 1;
        if status["result"]["activeUri"] == stable_uri && status["result"]["phase"] == "validating"
        {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "stable file never received its fair turn: {status}"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    fs::write(&hot, "export class HotFinal {}\n").unwrap();
    let newer = changes(&mut p, id, 5, &hot_uri);
    id += 1;
    assert_eq!(newer["result"]["accepted"], true);
    assert_eq!(newer["result"]["status"]["pendingUriCount"], 1);
    fs::write(&stable_gate, "stable may publish").unwrap();
    let mut attempts = BTreeSet::new();
    loop {
        let event = terminal(&mut p);
        assert!(
            attempts.insert(event["attemptId"].as_str().unwrap().to_owned()),
            "duplicate terminal: {event}"
        );
        if event["uri"] == stable_uri {
            assert_eq!(event["input"]["revision"], 3);
            assert_eq!(
                event["outcome"], "data-updated",
                "an unrelated hot file cancelled stable validation: {event}"
            );
            break;
        }
    }
    let found = p.request(json!({"protocol":1,"id":id,"method":"search","params":{"query":"StableUpdated","limit":10}}));
    id += 1;
    assert_eq!(found["result"]["items"].as_array().unwrap().len(), 1);
    fs::write(&gate, "latest hot may pass").unwrap();
    loop {
        let event = terminal(&mut p);
        assert!(attempts.insert(event["attemptId"].as_str().unwrap().to_owned()));
        if event["uri"] == hot_uri && event["phase"] == "completed" {
            assert_eq!(
                event["input"]["revision"], 5,
                "pending must retain latest intent"
            );
            break;
        }
    }
    start(&mut p, id, 5);
    id += 1;
    let complete = terminal(&mut p);
    assert_eq!(complete["outcome"], "qualified");
    assert_eq!(complete["writtenDocuments"], 0);
    let current = p.request(
        json!({"protocol":1,"id":id,"method":"search","params":{"query":"HotFinal","limit":10}}),
    );
    id += 1;
    assert_eq!(current["result"]["items"].as_array().unwrap().len(), 1);
    let old = p.request(json!({"protocol":1,"id":id,"method":"search","params":{"query":"HotIntermediate","limit":10}}));
    id += 1;
    assert!(old["result"]["items"].as_array().unwrap().is_empty());
    p.shutdown(id);
}
