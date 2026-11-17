use serde_json::Value;
use std::{fs, path::Path};
#[allow(dead_code)]
#[path = "support/maintenance_session.rs"]
mod session;
use session::{SidecarProcess, TestDir, changes, init, parsed, start, terminal};
fn count(trace: &Path, name: &str) -> usize {
    fs::read_to_string(trace)
        .unwrap_or_default()
        .split_inclusive('\n')
        .filter(|line| line.ends_with('\n'))
        .filter(|line| serde_json::from_str::<Value>(line).unwrap()["event"] == name)
        .count()
}
#[test]
fn parsers_are_retained_across_real_maintenance_tasks_and_joined_only_at_workspace_close() {
    let temp = TestDir::new("retained-maintenance-parsers");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    for i in 0..8 {
        fs::write(
            root.join(format!("{i}.ets")),
            format!("export class Original{i} {{}}\n"),
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
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    assert_eq!(
        count(&trace, "worker_exit"),
        0,
        "successful maintenance must release task ownership, not destroy the retained parser pool"
    );
    for revision in 2..=4 {
        let source = root.join(format!("{}.ets", revision - 2));
        fs::write(&source, format!("export class Changed{revision} {{}}\n")).unwrap();
        assert_eq!(
            changes(
                &mut p,
                revision + 1,
                revision,
                &arkts_index_sqlite::path_to_file_uri(&source)
            )["result"]["accepted"],
            true
        );
        assert_eq!(terminal(&mut p)["outcome"], "data-updated");
    }
    start(&mut p, 6, 5);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    assert_eq!(
        parsed(&trace),
        11,
        "unchanged reconciliation cannot create parser work"
    );
    assert_eq!(
        count(&trace, "worker_start"),
        4,
        "one bounded pool, not another pool per attempt"
    );
    assert_eq!(count(&trace, "worker_exit"), 0);
    p.shutdown(7);
    assert_eq!(
        count(&trace, "worker_exit"),
        4,
        "all actual parser resources must finish at close"
    );
    assert_eq!(count(&trace, "joined"), 1);
}
fn wait_trace(trace: &Path, event: &str, expected: usize) {
    use std::time::{Duration, Instant};
    let deadline = Instant::now() + Duration::from_secs(30);
    while count(trace, event) < expected {
        assert!(
            Instant::now() < deadline,
            "trace never reached {event}/{expected}"
        );
        std::thread::sleep(Duration::from_millis(5));
    }
}
#[test]
fn cancelling_a_parse_lease_drains_its_outcomes_before_the_next_input_reuses_the_pool() {
    use serde_json::json;
    let temp = TestDir::new("retained-parser-cancel");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    for i in 0..8 {
        fs::write(
            root.join(format!("{i}.ets")),
            format!("export class Before{i} {{}}\n"),
        )
        .unwrap();
    }
    let first = arkts_index_sqlite::path_to_file_uri(&root.join("0.ets"));
    let gate = temp.path().join("release");
    let trace = temp.path().join("trace.jsonl");
    let mut p = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_STREAM_TRACE", trace.as_os_str()),
        (
            "ARKTS_INDEX_TEST_STREAM_FIRST_URI",
            std::ffi::OsStr::new(&first),
        ),
        ("ARKTS_INDEX_TEST_STREAM_FIRST_GATE", gate.as_os_str()),
    ]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    wait_trace(&trace, "first_wait", 1);
    wait_trace(&trace, "parsed", 3);
    let cancelled=p.request(json!({"protocol":1,"id":3,"method":"maintenance/cancel","params":{"attemptId":"reconcile-1","input":{"issuer":"window","revision":1}}}));
    assert_eq!(cancelled["result"]["accepted"], true);
    assert_eq!(terminal(&mut p)["outcome"], "cancelled");
    assert_eq!(count(&trace, "worker_exit"), 0);
    for i in 0..8 {
        fs::write(
            root.join(format!("{i}.ets")),
            format!("export class After{i} {{}}\n"),
        )
        .unwrap();
    }
    fs::write(&gate, "release next input").unwrap();
    start(&mut p, 4, 2);
    let done = terminal(&mut p);
    assert_eq!(done["outcome"], "qualified", "{done}");
    for (id, query, expected) in [(5, "After", 8), (6, "Before", 0)] {
        let result = p.request(
            json!({"protocol":1,"id":id,"method":"search","params":{"query":query,"limit":100}}),
        );
        assert_eq!(
            result["result"]["items"].as_array().unwrap().len(),
            expected
        );
        assert_eq!(result["result"]["qualification"], done["qualification"]);
    }
    assert_eq!(count(&trace, "worker_start"), 4);
    assert_eq!(count(&trace, "parser_lease_released"), 2);
    p.shutdown(7);
    assert_eq!(count(&trace, "worker_exit"), 4);
}
#[test]
fn a_parser_panic_is_a_failed_task_and_a_repaired_input_uses_the_same_healthy_threads() {
    use serde_json::json;
    let temp = TestDir::new("retained-parser-panic");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    for i in 0..8 {
        fs::write(
            root.join(format!("{i}.ets")),
            format!("export class Visible{i} {{}}\n"),
        )
        .unwrap();
    }
    let bad = root.join("0.ets");
    let bad_uri = arkts_index_sqlite::path_to_file_uri(&bad);
    let trace = temp.path().join("trace.jsonl");
    let mut p = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_STREAM_TRACE", trace.as_os_str()),
        (
            "ARKTS_INDEX_TEST_STREAM_PANIC_URI",
            std::ffi::OsStr::new(&bad_uri),
        ),
    ]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    let failed = terminal(&mut p);
    assert_eq!(failed["outcome"], "failed");
    assert!(
        failed["error"]["message"]
            .as_str()
            .unwrap()
            .contains("parser panicked")
    );
    assert_eq!(
        count(&trace, "worker_exit"),
        0,
        "per-input unwind cannot kill the reusable pure parser thread"
    );
    fs::remove_file(&bad).unwrap();
    start(&mut p, 3, 2);
    let done = terminal(&mut p);
    assert_eq!(done["outcome"], "qualified", "{done}");
    let result = p.request(
        json!({"protocol":1,"id":4,"method":"search","params":{"query":"Visible","limit":100}}),
    );
    assert_eq!(result["result"]["items"].as_array().unwrap().len(), 7);
    assert_eq!(count(&trace, "worker_start"), 4);
    p.shutdown(5);
    assert_eq!(count(&trace, "worker_exit"), 4);
}
#[test]
fn a_consumer_unwind_while_holding_parser_work_returns_the_quiescent_pool_to_its_owner() {
    use serde_json::json;
    let temp = TestDir::new("retained-parser-consumer-unwind");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    for i in 0..8 {
        fs::write(
            root.join(format!("{i}.ets")),
            format!("export class Visible{i} {{}}\n"),
        )
        .unwrap();
    }
    let trace = temp.path().join("trace.jsonl");
    let mut p = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_STREAM_TRACE", trace.as_os_str()),
        (
            "ARKTS_INDEX_TEST_MAINTENANCE_PANIC",
            std::ffi::OsStr::new("with-parser-lease-once"),
        ),
    ]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    let interrupted = terminal(&mut p);
    assert_eq!(
        interrupted["outcome"], "unknown",
        "controlled consumer unwind was not exercised: {interrupted}"
    );
    assert_eq!(count(&trace, "parser_lease_released"), 1);
    assert_eq!(count(&trace, "worker_exit"), 0);
    start(&mut p, 3, 2);
    let done = terminal(&mut p);
    assert_eq!(
        done["outcome"], "qualified",
        "owner must not stay poisoned: {done}"
    );
    let result = p.request(
        json!({"protocol":1,"id":4,"method":"search","params":{"query":"Visible","limit":100}}),
    );
    assert_eq!(result["result"]["items"].as_array().unwrap().len(), 8);
    assert_eq!(count(&trace, "worker_start"), 4);
    p.shutdown(5);
    assert_eq!(count(&trace, "worker_exit"), 4);
}
