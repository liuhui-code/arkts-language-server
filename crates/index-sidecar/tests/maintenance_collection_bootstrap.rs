//! Background GC is activated by a valid selected versioned store, not by failure.
use serde_json::json;
use std::{
    fs,
    time::{Duration, Instant},
};
#[expect(dead_code, reason = "shared Native transcript helpers")]
#[path = "support/maintenance_session.rs"]
mod session;
use session::{SidecarProcess, TestDir, init, start, terminal};
#[test]
fn failed_first_bootstrap_does_not_spawn_a_collector_and_repaired_input_activates_it() {
    let temp = TestDir::new("gc-failed-bootstrap-gate");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let source = root.join("A.ets");
    fs::write(&source, [0xff]).unwrap();
    let mut p = SidecarProcess::spawn();
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    let failed = terminal(&mut p);
    assert_eq!(failed["outcome"], "failed", "{failed}");
    assert_eq!(failed["dataPublished"], false);
    let status = p.request(json!({"protocol":1,"id":3,"method":"maintenance/status","params":{}}));
    assert_eq!(
        status["result"]["collection"]["workerSpawns"], 0,
        "GC must not probe a legacy store after a failed bootstrap: {status}"
    );
    assert!(status["result"]["collection"]["error"].is_null());
    fs::write(&source, "export class Repaired {}\n").unwrap();
    start(&mut p, 4, 2);
    let done = terminal(&mut p);
    assert_eq!(done["outcome"], "qualified");
    let mut id = 5;
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        let s = p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
        id += 1;
        assert!(s["result"]["collection"]["error"].is_null(), "{s}");
        if s["result"]["collection"]["quanta"].as_u64().unwrap() > 0 {
            assert_eq!(s["result"]["collection"]["workerSpawns"], 1);
            break;
        }
        assert!(
            Instant::now() < deadline,
            "repaired bootstrap never activated GC: {s}"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    p.shutdown(id);
}
#[test]
fn a_complete_cache_noop_reopen_activates_gc_even_without_publishing_data() {
    let temp = TestDir::new("gc-noop-reopen-activation");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("A.ets"), "export class Existing {}\n").unwrap();
    let cache = temp.path().join("cache");
    let mut first = SidecarProcess::spawn();
    init(&mut first, &root, &cache);
    start(&mut first, 2, 1);
    assert_eq!(terminal(&mut first)["outcome"], "qualified");
    first.shutdown(3);
    let mut second = SidecarProcess::spawn();
    init(&mut second, &root, &cache);
    start(&mut second, 2, 1);
    let done = terminal(&mut second);
    assert_eq!(done["outcome"], "qualified");
    assert_eq!(done["dataPublished"], false);
    assert_eq!(done["writtenDocuments"], 0);
    let mut id = 3;
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        let s =
            second.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
        id += 1;
        assert!(s["result"]["collection"]["error"].is_null(), "{s}");
        if s["result"]["collection"]["quanta"].as_u64().unwrap() > 0 {
            assert_eq!(s["result"]["collection"]["workerSpawns"], 1);
            break;
        }
        assert!(
            Instant::now() < deadline,
            "noop cache must activate GC: {s}"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    second.shutdown(id);
}
