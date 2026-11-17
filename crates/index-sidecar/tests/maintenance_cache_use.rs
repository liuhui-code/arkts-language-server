//! Public Native recovery while another process updates the same managed use record.
use arkts_index_sqlite::{cache_gc::lease::CacheLease, workspace_cache_location};
use serde_json::json;
use std::{fs, thread::JoinHandle};
#[expect(
    dead_code,
    reason = "shared protocol helpers used by other transcripts"
)]
#[path = "support/maintenance_session.rs"]
mod session;
use session::{SidecarProcess, TestDir, init, start, terminal};
#[derive(Default)]
struct Writers(Vec<JoinHandle<Result<(), String>>>);
impl Writers {
    fn finish(&mut self) {
        for handle in self.0.drain(..) {
            handle.join().unwrap().unwrap();
        }
    }
}
impl Drop for Writers {
    fn drop(&mut self) {
        for handle in self.0.drain(..) {
            let _ = handle.join();
        }
    }
}
#[test]
fn consumer_unwind_recovers_with_independent_cache_use_write_load() {
    let temp = TestDir::new("maintenance-usage-recovery");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    for i in 0..8 {
        fs::write(
            root.join(format!("{i}.ets")),
            format!("export class Visible{i} {{}}\n"),
        )
        .unwrap();
    }
    let cache = temp.path().join("cache");
    let trace = temp.path().join("trace.jsonl");
    let mut writers = Writers::default(); // Child is dropped first on an assertion failure.
    let mut p = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_STREAM_TRACE", trace.as_os_str()),
        (
            "ARKTS_INDEX_TEST_MAINTENANCE_PANIC",
            std::ffi::OsStr::new("with-parser-lease-once"),
        ),
    ]);
    init(&mut p, &root, &cache);
    let location = workspace_cache_location(&cache, &root).unwrap();
    for _ in 0..4 {
        let database = location.database_path.clone();
        let identity = location.workspace_identity.clone();
        writers.0.push(std::thread::spawn(move || {
            let lease = CacheLease::acquire(&database, &identity)
                .map_err(|e| e.to_string())?
                .unwrap();
            for _ in 0..32 {
                lease.record_use()?;
            }
            Ok(())
        }));
    }
    start(&mut p, 2, 1);
    assert_eq!(terminal(&mut p)["outcome"], "unknown");
    start(&mut p, 3, 2);
    let current = terminal(&mut p);
    assert_eq!(
        current["outcome"], "qualified",
        "recovery under metadata churn failed: {current}"
    );
    let answer = p.request(
        json!({"protocol":1,"id":4,"method":"search","params":{"query":"Visible","limit":100}}),
    );
    assert_eq!(answer["result"]["items"].as_array().unwrap().len(), 8);
    assert_eq!(answer["result"]["qualification"], current["qualification"]);
    let status = p.request(json!({"protocol":1,"id":5,"method":"maintenance/status","params":{}}));
    assert_eq!(
        status["result"]["maintenanceWorkerSpawns"], 2,
        "no extra recovery/rebuild loop is allowed"
    );
    writers.finish();
    let events = fs::read_to_string(trace).unwrap();
    let started = events
        .lines()
        .filter(|l| {
            serde_json::from_str::<serde_json::Value>(l).unwrap()["event"] == "worker_start"
        })
        .count();
    assert_eq!(
        started, 4,
        "the same healthy parser threads must be retained"
    );
    p.shutdown(6);
}
