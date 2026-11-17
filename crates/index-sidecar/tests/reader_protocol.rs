use serde_json::{Value, json};
use std::fs;
#[path = "support/maintenance_session.rs"]
mod session;
use session::{SidecarProcess, TestDir, changes, init, parsed, start, terminal};
fn data_status(p: &mut SidecarProcess, id: u64) -> Value {
    p.request(json!({"protocol":1,"id":id,"method":"index/status","params":{"input":{"issuer":"window","revision":1}}}))
}
#[test]
fn authoritative_status_uses_the_current_database_not_an_owners_cached_ready_state() {
    let temp = TestDir::new("reader-data-status");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let source = root.join("A.ets");
    fs::write(&source, "export class Before {}\n").unwrap();
    let cache = temp.path().join("cache");
    let mut a = SidecarProcess::spawn();
    init(&mut a, &root, &cache);
    start(&mut a, 2, 1);
    let first = terminal(&mut a);
    assert_eq!(first["outcome"], "qualified");
    let current = data_status(&mut a, 3);
    assert_eq!(
        current["ok"], true,
        "real data status must be exposed: {current}"
    );
    assert_eq!(current["result"]["statusScope"], "data");
    assert_eq!(current["result"]["qualification"], first["qualification"]);
    let mut b = SidecarProcess::spawn();
    init(&mut b, &root, &cache);
    let r=b.request(json!({"protocol":1,"id":2,"method":"maintenance/start","params":{"attemptId":"peer-noop","input":{"issuer":"peer","revision":1},"reason":"reconcile"}}));
    assert_eq!(r["result"]["accepted"], true);
    assert_eq!(terminal(&mut b)["outcome"], "qualified");
    assert_eq!(
        data_status(&mut a, 4)["result"]["qualification"],
        first["qualification"],
        "another issuer at the same head must not replace this owners qualification"
    );
    fs::write(&source, "export class After {}\n").unwrap();
    let changed=b.request(json!({"protocol":1,"id":3,"method":"maintenance/changes","params":{"input":{"issuer":"peer","revision":2},"changes":[{"uri":arkts_index_sqlite::path_to_file_uri(&source),"kind":"changed"}],"uncertainty":[]}}));
    assert_eq!(changed["result"]["accepted"], true);
    let updated = terminal(&mut b);
    assert_eq!(updated["outcome"], "data-updated");
    let cached = a.request(json!({"protocol":1,"id":5,"method":"status","params":{}}));
    assert_eq!(cached["result"]["state"], "ready");
    let fresh = data_status(&mut a, 6);
    assert_eq!(fresh["result"]["snapshot"], updated["snapshot"]);
    assert_eq!(fresh["result"]["completeness"], "stale");
    assert!(fresh["result"]["qualification"].is_null());
    let forced=b.request(json!({"protocol":1,"id":4,"method":"maintenance/start","params":{"attemptId":"peer-replace","input":{"issuer":"peer","revision":3},"reason":"force-reconcile","force":true}}));
    assert_eq!(forced["result"]["accepted"], true);
    let replacement = terminal(&mut b);
    assert_eq!(replacement["outcome"], "qualified");
    assert_ne!(
        replacement["qualification"]["storeId"],
        updated["snapshot"]["storeId"]
    );
    assert_eq!(replacement["qualification"]["head"], 1);
    let replaced = data_status(&mut a, 7);
    assert_eq!(
        replaced["result"]["snapshot"]["storeId"],
        replacement["qualification"]["storeId"]
    );
    assert_eq!(replaced["result"]["committedGeneration"], 1);
    assert!(replaced["result"]["qualification"].is_null());
    b.shutdown(5);
    a.shutdown(8);
}

fn wait_file(path: &std::path::Path) {
    use std::time::{Duration, Instant};
    let deadline = Instant::now() + Duration::from_secs(30);
    while !path.is_file() {
        assert!(
            Instant::now() < deadline,
            "gate not reached: {}",
            path.display()
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[test]
fn sqlite_vm_cancellation_does_not_poison_the_connection_or_restart_maintenance() {
    let temp = TestDir::new("reader-sqlite-cancel");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    fs::write(
        root.join("Many.ets"),
        (0..300)
            .map(|i| format!("export class Match{i} {{}}\n"))
            .collect::<String>(),
    )
    .unwrap();
    let gate = temp.path().join("sql-release");
    let trace = temp.path().join("trace.jsonl");
    let mut p = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_READ_SQL_GATE", gate.as_os_str()),
        ("ARKTS_INDEX_TEST_STREAM_TRACE", trace.as_os_str()),
    ]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    let complete = terminal(&mut p);
    assert_eq!(complete["outcome"], "qualified");
    let info = p.request(json!({"protocol":1,"id":3,"method":"index/reader-status","params":{}}));
    let epoch = info["result"]["readerEpoch"].clone();
    p.send(json!({"protocol":1,"id":50,"method":"search","params":{"query":"Match","limit":1000,"requestToken":"sql"}}));
    wait_file(&gate.with_extension("started"));
    let control=p.request(json!({"protocol":1,"id":51,"method":"index/cancel","params":{"readerEpoch":epoch,"requestId":50,"requestToken":"sql"}}));
    assert_eq!(control["result"]["accepted"], true);
    let result = p.response();
    assert_eq!(result["id"], 50);
    assert_eq!(result["error"]["code"], "cancelled");
    wait_file(&gate.with_extension("finished"));
    let mut id = 52;
    loop {
        let status =
            p.request(json!({"protocol":1,"id":id,"method":"index/reader-status","params":{}}));
        id += 1;
        if status["result"]["activeReaderTasks"] == 0 {
            assert_eq!(status["result"]["resourceFailures"], 0);
            break;
        }
    }
    let next=p.request(json!({"protocol":1,"id":id,"method":"search","params":{"query":"Match","limit":1000,"requestToken":"after-sql"}}));
    id += 1;
    assert_eq!(
        next["ok"], true,
        "SQLite interrupt/progress binding leaked into the next query: {next}"
    );
    assert_eq!(next["result"]["items"].as_array().unwrap().len(), 300);
    assert_eq!(
        next["result"]["snapshot"]["head"],
        next["result"]["servedGeneration"]
    );
    assert_eq!(next["result"]["qualification"], complete["qualification"]);
    let maintenance =
        p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
    id += 1;
    assert_eq!(maintenance["result"]["maintenanceWorkerSpawns"], 1);
    assert_eq!(parsed(&trace), 1);
    p.shutdown(id);
}

#[test]
fn read_backpressure_queued_cancel_and_shutdown_give_every_accepted_query_one_terminal() {
    use std::{collections::BTreeSet, ffi::OsStr};
    let temp = TestDir::new("reader-queue-close");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("A.ets"), "export class Visible {}\n").unwrap();
    let gate = temp.path().join("release");
    let mut p = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_READ_GATE", gate.as_os_str()),
        ("ARKTS_INDEX_TEST_READ_GATE_ID", OsStr::new("50,51")),
    ]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    let meta = p.request(json!({"protocol":1,"id":3,"method":"index/reader-status","params":{}}));
    let epoch = meta["result"]["readerEpoch"].clone();
    for id in [50, 51, 60, 61, 62, 63, 64] {
        p.send(json!({"protocol":1,"id":id,"method":"search","params":{"query":"Visible","limit":10,"requestToken":format!("q{id}")}}));
    }
    let busy = p.response();
    assert_eq!(busy["id"], 64);
    assert_eq!(busy["error"]["code"], "busy");
    let full = p.request(json!({"protocol":1,"id":70,"method":"index/reader-status","params":{}}));
    assert_eq!(full["result"]["activeReaderTasks"], 2);
    assert_eq!(full["result"]["queuedReads"], 4);
    let cancelled=p.request(json!({"protocol":1,"id":71,"method":"index/cancel","params":{"readerEpoch":epoch,"requestId":62,"requestToken":"q62"}}));
    assert_eq!(cancelled["result"]["accepted"], true);
    let done = p.response();
    assert_eq!(done["id"], 62);
    assert_eq!(done["error"]["code"], "cancelled");
    p.send(json!({"protocol":1,"id":65,"method":"search","params":{"query":"Visible","limit":10,"requestToken":"q65"}}));
    p.send(json!({"protocol":1,"id":100,"method":"shutdown","params":{}}));
    let mut ids = BTreeSet::new();
    loop {
        let response = p.response();
        let id = response["id"].as_u64().unwrap();
        if id == 100 {
            assert_eq!(response["ok"], true);
            break;
        }
        assert!(ids.insert(id), "duplicate terminal: {response}");
        assert_eq!(response["error"]["code"], "cancelled");
    }
    assert_eq!(ids, BTreeSet::from([50, 51, 60, 61, 63, 65]));
    fs::write(&gate, "allow actual reader cleanup").unwrap();
    p.finish_shutdown();
}

#[test]
fn new_observed_input_cancels_an_accepted_old_snapshot_but_not_the_shared_update() {
    use std::ffi::OsStr;
    let temp = TestDir::new("reader-input-invalidation");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let source = root.join("A.ets");
    fs::write(&source, "export class Before {}\n").unwrap();
    let gate = temp.path().join("release");
    let mut p = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_READ_GATE", gate.as_os_str()),
        ("ARKTS_INDEX_TEST_READ_GATE_ID", OsStr::new("50")),
    ]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    p.send(json!({"protocol":1,"id":50,"method":"search","params":{"query":"Before","limit":10,"requestToken":"old","input":{"issuer":"window","revision":1}}}));
    wait_file(&gate.with_extension("started"));
    fs::write(&source, "export class After {}\n").unwrap();
    assert_eq!(
        changes(&mut p, 3, 2, &arkts_index_sqlite::path_to_file_uri(&source))["result"]["accepted"],
        true
    );
    let old = p.response();
    assert_eq!(old["id"], 50);
    assert_eq!(old["error"]["code"], "cancelled");
    assert_eq!(terminal(&mut p)["outcome"], "data-updated");
    let stale=p.request(json!({"protocol":1,"id":4,"method":"search","params":{"query":"Before","limit":10,"input":{"issuer":"window","revision":1}}}));
    assert_eq!(stale["error"]["code"], "invalid_generation");
    let current=p.request(json!({"protocol":1,"id":5,"method":"search","params":{"query":"After","limit":10,"input":{"issuer":"window","revision":2}}}));
    assert_eq!(current["ok"], true);
    assert_eq!(current["result"]["items"].as_array().unwrap().len(), 1);
    assert!(current["result"]["qualification"].is_null());
    fs::write(&gate, "old work may return").unwrap();
    wait_file(&gate.with_extension("finished"));
    p.shutdown(6);
}
#[test]
fn a_noncooperative_read_keeps_its_slot_after_cancel_while_control_other_reads_and_edits_progress()
{
    use std::ffi::OsStr;
    let temp = TestDir::new("reader-cancel-ownership");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let source = root.join("A.ets");
    fs::write(&source, "export class Visible {}\n").unwrap();
    let gate = temp.path().join("read-release");
    let mut p = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_READ_GATE", gate.as_os_str()),
        ("ARKTS_INDEX_TEST_READ_GATE_ID", OsStr::new("50")),
    ]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    let info = p.request(json!({"protocol":1,"id":3,"method":"index/reader-status","params":{}}));
    let epoch = info["result"]["readerEpoch"].clone();
    p.send(json!({"protocol":1,"id":50,"method":"search","params":{"query":"Visible","limit":10,"requestToken":"old-query"}}));
    wait_file(&gate.with_extension("started"));
    let control =
        p.request(json!({"protocol":1,"id":51,"method":"maintenance/status","params":{}}));
    assert_eq!(control["ok"], true);
    assert!(!gate.with_extension("finished").exists());
    assert_eq!(
        data_status(&mut p, 52)["result"]["completeness"],
        "ready",
        "the second read connection must remain usable"
    );
    let cancel=p.request(json!({"protocol":1,"id":53,"method":"index/cancel","params":{"readerEpoch":epoch,"requestId":50,"requestToken":"old-query"}}));
    assert_eq!(cancel["result"]["accepted"], true);
    let cancelled = p.response();
    assert_eq!(cancelled["id"], 50);
    assert_eq!(cancelled["error"]["code"], "cancelled");
    let held = p.request(json!({"protocol":1,"id":54,"method":"index/reader-status","params":{}}));
    assert_eq!(
        held["result"]["activeReaderTasks"], 1,
        "client completion must not free the still-running reader"
    );
    assert!(!gate.with_extension("finished").exists());
    fs::write(&source, "export class After {}\n").unwrap();
    let change = changes(
        &mut p,
        55,
        2,
        &arkts_index_sqlite::path_to_file_uri(&source),
    );
    assert_eq!(change["result"]["accepted"], true);
    assert_eq!(
        terminal(&mut p)["outcome"],
        "data-updated",
        "a cancelled reader cannot own/cancel the shared writer"
    );
    fs::write(&gate, "finish actual resource").unwrap();
    wait_file(&gate.with_extension("finished"));
    let mut id = 56;
    loop {
        let s = p.request(json!({"protocol":1,"id":id,"method":"index/reader-status","params":{}}));
        id += 1;
        if s["result"]["activeReaderTasks"] == 0 {
            assert_eq!(s["result"]["resourceFailures"], 0);
            break;
        }
    }
    fs::remove_file(&gate).unwrap();
    fs::remove_file(gate.with_extension("started")).unwrap();
    fs::remove_file(gate.with_extension("finished")).unwrap();
    // Reuse the numeric ID only after resource completion, with a fresh token.
    p.send(json!({"protocol":1,"id":50,"method":"search","params":{"query":"After","limit":10,"requestToken":"new-query"}}));
    wait_file(&gate.with_extension("started"));
    let late=p.request(json!({"protocol":1,"id":id,"method":"index/cancel","params":{"readerEpoch":epoch,"requestId":50,"requestToken":"old-query"}}));
    id += 1;
    assert_eq!(late["result"]["accepted"], false);
    fs::write(&gate, "new query may finish").unwrap();
    let result = p.response();
    assert_eq!(result["id"], 50);
    assert_eq!(result["ok"], true);
    assert_eq!(result["requestToken"], "new-query");
    assert_eq!(result["result"]["items"].as_array().unwrap().len(), 1);
    let healthy =
        p.request(json!({"protocol":1,"id":id,"method":"index/reader-status","params":{}}));
    id += 1;
    assert_eq!(healthy["result"]["readerThreadsCreated"], 2);
    assert_eq!(healthy["result"]["retiredReaders"], 0);
    p.shutdown(id);
}
