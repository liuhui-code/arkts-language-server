//! Busy and large-file Native maintenance, distinct from a long UI soak.
use arkts_index_sqlite::path_to_file_uri;
use serde_json::{Value, json};
use std::{
    fs,
    time::{Duration, Instant},
};
#[expect(dead_code, reason = "shared protocol transcript helpers")]
#[path = "support/maintenance_session.rs"]
mod session;
use session::{SidecarProcess, TestDir, changes, init, start, terminal};
fn status(p: &mut SidecarProcess, id: &mut u64) -> Value {
    let r = p.request(json!({"protocol":1,"id":*id,"method":"maintenance/status","params":{}}));
    *id += 1;
    assert_eq!(r["ok"], true);
    r["result"].clone()
}
#[test]
fn serial_busy_inputs_make_both_data_and_gc_progress_with_one_retained_collector() {
    let temp = TestDir::new("automatic-gc-busy-inputs");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let file = root.join("A.ets");
    fs::write(&file, "export class Before {}\n").unwrap();
    let mut p = SidecarProcess::spawn();
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    let mut id = 3;
    let mut quanta = status(&mut p, &mut id)["collection"]["quanta"]
        .as_u64()
        .unwrap();
    for revision in 2..=8 {
        fs::write(&file, format!("export class Current{revision} {{}}\n")).unwrap();
        assert_eq!(
            changes(&mut p, id, revision, &path_to_file_uri(&file))["result"]["accepted"],
            true
        );
        id += 1;
        let done = terminal(&mut p);
        assert_eq!(done["outcome"], "data-updated", "{done}");
        assert_eq!(done["input"]["revision"], revision);
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            let s = status(&mut p, &mut id);
            let next = s["collection"]["quanta"].as_u64().unwrap();
            assert!(s["collection"]["error"].is_null(), "{s}");
            if next > quanta {
                quanta = next;
                break;
            }
            assert!(Instant::now() < deadline, "busy inputs starved GC: {s}");
        }
        let result=p.request(json!({"protocol":1,"id":id,"method":"search","params":{"query":format!("Current{revision}"),"limit":10}}));
        id += 1;
        assert_eq!(result["result"]["items"].as_array().unwrap().len(), 1);
        assert!(result["result"]["qualification"].is_null());
    }
    let s = status(&mut p, &mut id);
    assert_eq!(s["collection"]["workerSpawns"], 1);
    assert_eq!(s["collection"]["collectorOpens"], 1);
    assert!(s["collection"]["versionsDeleted"].as_u64().unwrap() > 0);
    p.shutdown(id);
}
#[test]
fn a_large_superseded_file_is_drained_over_multiple_automatic_quanta() {
    let temp = TestDir::new("automatic-gc-large-facts");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let file = root.join("A.ets");
    fs::write(
        &file,
        format!(
            "export class Obsolete {{}}\n{}",
            "Obsolete;\n".repeat(12_000)
        ),
    )
    .unwrap();
    let mut p = SidecarProcess::spawn();
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    let cold = terminal(&mut p);
    assert_eq!(cold["outcome"], "qualified");
    let rows = cold["factRowsWritten"].as_u64().unwrap();
    assert!(rows > 4096);
    fs::write(&file, "export class Current {}\n").unwrap();
    changes(&mut p, 3, 2, &path_to_file_uri(&file));
    assert_eq!(terminal(&mut p)["outcome"], "data-updated");
    // Keep the previous small content for undo; expire the much older big V1.
    fs::write(&file, "export class Latest {}\n").unwrap();
    changes(&mut p, 4, 3, &path_to_file_uri(&file));
    assert_eq!(terminal(&mut p)["outcome"], "data-updated");
    let mut id = 5;
    let deadline = Instant::now() + Duration::from_secs(20);
    let gc = loop {
        let s = status(&mut p, &mut id);
        assert!(s["collection"]["error"].is_null(), "{s}");
        if s["collection"]["versionsDeleted"].as_u64().unwrap() > 0 {
            break s["collection"].clone();
        }
        assert!(Instant::now() < deadline, "large history not drained: {s}");
        std::thread::sleep(Duration::from_millis(10));
    };
    assert_eq!(gc["factsDeleted"], rows);
    assert!(gc["quanta"].as_u64().unwrap() > 3);
    assert!(gc["last"]["workItems"].as_u64().unwrap() <= 4096);
    let result = p.request(
        json!({"protocol":1,"id":id,"method":"search","params":{"query":"Latest","limit":10}}),
    );
    id += 1;
    assert_eq!(result["result"]["items"].as_array().unwrap().len(), 1);
    p.shutdown(id);
}
