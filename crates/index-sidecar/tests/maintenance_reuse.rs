//! Recent content ownership across ordinary editing, GC and physical replacement.
use arkts_index_sqlite::path_to_file_uri;
use serde_json::{Value, json};
use std::{
    fs,
    time::{Duration, Instant},
};
#[path = "support/maintenance_session.rs"]
mod session;
use session::{SidecarProcess, TestDir, changes, init, parsed, start, terminal};
fn status(p: &mut SidecarProcess, id: &mut u64) -> Value {
    let s = p.request(json!({"protocol":1,"id":*id,"method":"maintenance/status","params":{}}));
    *id += 1;
    s["result"].clone()
}
#[test]
fn one_step_undo_redo_and_an_unrelated_file_update_reuse_sealed_content_without_parsing() {
    let temp = TestDir::new("reuse-undo-redo");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let a = root.join("A.ets");
    let b = root.join("B.ets");
    fs::write(&a, "export class Before {}\n").unwrap();
    fs::write(&b, "export class Other {}\n").unwrap();
    let trace = temp.path().join("trace.jsonl");
    let mut p = SidecarProcess::spawn_with_environment(&[(
        "ARKTS_INDEX_TEST_STREAM_TRACE",
        trace.as_os_str(),
    )]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    terminal(&mut p);
    fs::write(&a, "export class After {}\n").unwrap();
    changes(&mut p, 3, 2, &path_to_file_uri(&a));
    assert_eq!(terminal(&mut p)["writtenDocuments"], 1);
    fs::write(&b, "export class UpdatedOther {}\n").unwrap();
    changes(&mut p, 4, 3, &path_to_file_uri(&b));
    assert_eq!(terminal(&mut p)["writtenDocuments"], 1);
    fs::write(&trace, "").unwrap();
    let mut id = 5;
    for (revision, name) in [(4, "Before"), (5, "After"), (6, "Before"), (7, "After")] {
        fs::write(&a, format!("export class {name} {{}}\n")).unwrap();
        changes(&mut p, id, revision, &path_to_file_uri(&a));
        id += 1;
        let done = terminal(&mut p);
        assert_eq!(done["outcome"], "data-updated");
        assert_eq!(done["writtenDocuments"], 0, "{done}");
        let found = p.request(
            json!({"protocol":1,"id":id,"method":"search","params":{"query":name,"limit":10}}),
        );
        id += 1;
        assert_eq!(found["result"]["items"].as_array().unwrap().len(), 1);
        assert!(found["result"]["qualification"].is_null());
    }
    assert_eq!(
        parsed(&trace),
        0,
        "content reuse does not bypass disk/final-fence checks"
    );
    p.shutdown(id);
}
#[test]
fn complete_absence_confirmation_retires_removed_content_cache_without_advancing_the_data_head() {
    let temp = TestDir::new("reuse-namespace-retirement");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let a = root.join("A.ets");
    fs::write(&a, "export class Removed {}\n").unwrap();
    let mut p = SidecarProcess::spawn();
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    terminal(&mut p);
    fs::remove_file(&a).unwrap();
    changes(&mut p, 3, 2, &path_to_file_uri(&a));
    let removed = terminal(&mut p);
    start(&mut p, 4, 3);
    let qualified = terminal(&mut p);
    assert_eq!(qualified["outcome"], "qualified");
    assert_eq!(
        qualified["qualification"]["head"],
        removed["snapshot"]["head"]
    );
    let mut id = 5;
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        let s = status(&mut p, &mut id);
        if s["collection"]["versionsDeleted"].as_u64().unwrap() > 0 {
            break;
        }
        assert!(Instant::now() < deadline, "removed cache not retired: {s}");
        std::thread::sleep(Duration::from_millis(10));
    }
    let found = p.request(
        json!({"protocol":1,"id":id,"method":"search","params":{"query":"Removed","limit":10}}),
    );
    id += 1;
    assert!(found["result"]["items"].as_array().unwrap().is_empty());
    assert_eq!(found["result"]["qualification"], qualified["qualification"]);
    p.shutdown(id);
}
#[test]
fn idle_peer_replacement_releases_the_cache_bound_to_the_previous_physical_store() {
    let temp = TestDir::new("reuse-peer-retirement");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let a = root.join("A.ets");
    fs::write(&a, "export class Before {}\n").unwrap();
    let cache = temp.path().join("cache");
    let mut p = SidecarProcess::spawn();
    init(&mut p, &root, &cache);
    start(&mut p, 2, 1);
    terminal(&mut p);
    fs::write(&a, "export class After {}\n").unwrap();
    changes(&mut p, 3, 2, &path_to_file_uri(&a));
    let edited = terminal(&mut p);
    let old = edited["snapshot"]["storeId"].clone();
    let mut id = 4;
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        let s = status(&mut p, &mut id);
        if s["retainedReuseStore"] == old && s["collection"]["active"] == false {
            break;
        }
        assert!(Instant::now() < deadline, "cache was not retained: {s}");
        std::thread::sleep(Duration::from_millis(10));
    }
    let mut peer = SidecarProcess::spawn();
    init(&mut peer, &root, &cache);
    let ack=peer.request(json!({"protocol":1,"id":2,"method":"maintenance/start","params":{"attemptId":"peer-force","input":{"issuer":"peer","revision":1},"reason":"force","force":true}}));
    assert_eq!(ack["result"]["accepted"], true);
    let next = terminal(&mut peer);
    assert_eq!(next["outcome"], "qualified");
    assert_ne!(next["qualification"]["storeId"], old);
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        let s = status(&mut p, &mut id);
        if s["collection"]["last"]["storeId"] == next["qualification"]["storeId"]
            && s["collection"]["active"] == false
        {
            assert!(
                s["retainedReuseStore"].is_null(),
                "obsolete cache remains owned: {s}"
            );
            break;
        }
        assert!(
            Instant::now() < deadline,
            "peer replacement not reconciled while idle: {s}"
        );
        std::thread::sleep(Duration::from_millis(20));
    }
    let found = p.request(
        json!({"protocol":1,"id":id,"method":"search","params":{"query":"After","limit":10}}),
    );
    id += 1;
    assert_eq!(
        found["result"]["snapshot"]["storeId"],
        next["qualification"]["storeId"]
    );
    assert_eq!(found["result"]["items"].as_array().unwrap().len(), 1);
    p.shutdown(id);
    peer.shutdown(3);
}
