use std::{ffi::OsStr, fs};
#[expect(dead_code, reason = "shared hash-first fixtures")]
#[path = "support/hash_first.rs"]
mod hash_first;
#[expect(dead_code, reason = "shared public protocol fixture")]
#[path = "support/sidecar_process.rs"]
mod sidecar_process;
use hash_first::{assert_old, count, create, parsed, seed, start, stored, terminal, wait_trace};
use sidecar_process::{SidecarProcess, TestDir, initialize};

#[test]
fn hash_miss_refuses_changed_deleted_or_grown_source_on_second_read() {
    for failure in ["same-length-time", "deleted", "grown"] {
        let temp = TestDir::new(failure);
        let workspace = temp.path().join("workspace");
        let cache = temp.path().join("cache");
        let trace = temp.path().join("trace.jsonl");
        let gate = temp.path().join("release");
        create(&workspace, 130);
        seed(&workspace, &cache);
        let before = stored(&cache);
        // Force a candidate miss while leaving the late gated source unchanged initially.
        fs::write(workspace.join("0000.ets"), "export class HashLater0 {}").unwrap();
        let changed = workspace.join("0129.ets");
        let uri = arkts_index_sqlite::path_to_file_uri(&changed);
        let mut process = SidecarProcess::spawn_with_environment(&[
            ("ARKTS_INDEX_TEST_STREAM_TRACE", trace.as_os_str()),
            ("ARKTS_INDEX_TEST_STREAM_FIRST_URI", OsStr::new(&uri)),
            ("ARKTS_INDEX_TEST_STREAM_FIRST_GATE", gate.as_os_str()),
        ]);
        assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
        start(&mut process, 2);
        wait_trace(&trace, "first_wait");
        let metadata = fs::metadata(&changed).unwrap();
        match failure {
            "same-length-time" => {
                fs::write(&changed, "export class HashOther129 {}").unwrap();
                fs::OpenOptions::new()
                    .write(true)
                    .open(&changed)
                    .unwrap()
                    .set_times(fs::FileTimes::new().set_modified(metadata.modified().unwrap()))
                    .unwrap();
                assert_eq!(fs::metadata(&changed).unwrap().len(), metadata.len());
                assert_eq!(
                    fs::metadata(&changed).unwrap().modified().unwrap(),
                    metadata.modified().unwrap()
                );
            }
            "deleted" => fs::remove_file(&changed).unwrap(),
            "grown" => fs::write(&changed, "x".repeat(2 * 1024 * 1024 + 1)).unwrap(),
            _ => unreachable!(),
        }
        assert_old(&mut process, 3);
        fs::write(&gate, "release").unwrap();
        let (status, stages) = terminal(&mut process);
        assert_eq!(status["phase"], "degraded", "{status}");
        assert_eq!(status["committedGeneration"], 1);
        assert!(
            status["message"]
                .as_str()
                .unwrap()
                .contains("between hash scan and parsing")
        );
        assert!(
            stages.iter().any(|stage| stage == "committing"),
            "failure follows private writes"
        );
        assert_eq!(
            parsed(&trace),
            129,
            "failed second read must not invoke parser for that file"
        );
        assert_eq!(count(&trace, "worker_exit"), 4);
        assert_eq!(count(&trace, "joined"), 1);
        assert_eq!(stored(&cache), before);
        assert_old(&mut process, 4);
        process.shutdown(5);
    }
}

#[test]
fn hash_hit_keeps_final_same_length_same_mtime_sha_fence_without_parsing() {
    let temp = TestDir::new("hash-hit-final-fence");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    let trace = temp.path().join("trace.jsonl");
    let gate = temp.path().join("release");
    create(&workspace, 8);
    seed(&workspace, &cache);
    let before = stored(&cache);
    let mut process = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_STREAM_TRACE", trace.as_os_str()),
        (
            "ARKTS_INDEX_TEST_ACTIVATION_GATE_GENERATION",
            OsStr::new("2"),
        ),
        ("ARKTS_INDEX_TEST_ACTIVATION_GATE_FILE", gate.as_os_str()),
    ]);
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    start(&mut process, 2);
    loop {
        let event = process.read_event();
        if event["params"]["status"]["phase"] == "activating" {
            break;
        }
        assert_eq!(event["params"]["status"]["committedGeneration"], 1);
    }
    let path = workspace.join("0000.ets");
    let metadata = fs::metadata(&path).unwrap();
    fs::write(&path, "export class HashOther0 {}").unwrap();
    fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(metadata.modified().unwrap()))
        .unwrap();
    assert_eq!(fs::metadata(&path).unwrap().len(), metadata.len());
    fs::write(&gate, "release").unwrap();
    let (status, _) = terminal(&mut process);
    assert_eq!(status["phase"], "degraded");
    assert_eq!(status["committedGeneration"], 1);
    assert!(
        status["message"]
            .as_str()
            .unwrap()
            .contains("sources changed before")
    );
    assert_eq!(parsed(&trace), 0);
    assert_eq!(stored(&cache), before);
    assert_old(&mut process, 3);
    process.shutdown(4);
}

#[test]
fn cancelling_a_hash_hit_never_creates_parser_workers_or_advances_old_generation() {
    let temp = TestDir::new("hash-hit-cancel");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    let trace = temp.path().join("trace.jsonl");
    let gate = temp.path().join("never-release");
    create(&workspace, 8);
    seed(&workspace, &cache);
    let before = stored(&cache);
    let mut process = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_STREAM_TRACE", trace.as_os_str()),
        (
            "ARKTS_INDEX_TEST_ACTIVATION_GATE_GENERATION",
            OsStr::new("2"),
        ),
        ("ARKTS_INDEX_TEST_ACTIVATION_GATE_FILE", gate.as_os_str()),
    ]);
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    start(&mut process, 2);
    loop {
        if process.read_event()["params"]["status"]["phase"] == "activating" {
            break;
        }
    }
    assert_old(&mut process, 3);
    assert_eq!(
        process.request(serde_json::json!({"protocol":1,"id":4,
        "method":"catalog/cancel","params":{"generation":2}}))["ok"],
        true
    );
    let (status, _) = terminal(&mut process);
    assert_eq!(status["phase"], "cancelled");
    assert_eq!(status["committedGeneration"], 1);
    assert_eq!(count(&trace, "hash_read"), 8);
    assert_eq!(parsed(&trace), 0);
    assert_eq!(count(&trace, "started"), 0);
    assert_eq!(count(&trace, "worker_exit"), 0);
    assert_eq!(stored(&cache), before);
    assert_old(&mut process, 5);
    process.shutdown(6);
}
