//! Force and a same-producer peer must not reuse a stale private namespace.
use arkts_index_sqlite::{path_to_file_uri, workspace_cache_location};
use serde_json::json;
use std::{
    fs,
    path::{Path, PathBuf},
};
#[expect(
    dead_code,
    reason = "shared protocol helpers used by other transcripts"
)]
#[path = "support/maintenance_session.rs"]
mod session;
use session::{SidecarProcess, TestDir, init, parsed, start, terminal};
fn prefix(
    temp: &TestDir,
    root: &Path,
    cache: &Path,
) -> (SidecarProcess, PathBuf, PathBuf, PathBuf) {
    fs::create_dir(root).unwrap();
    for i in 0..128 {
        fs::write(
            root.join(format!("{i:04}.ets")),
            format!("export class Item{i:04} {{}}\n"),
        )
        .unwrap();
    }
    let blocked = path_to_file_uri(&root.join("0064.ets"));
    let gate = temp.path().join("release");
    let trace = temp.path().join("trace.jsonl");
    let mut p = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_STREAM_TRACE", trace.as_os_str()),
        (
            "ARKTS_INDEX_TEST_STREAM_FIRST_URI",
            std::ffi::OsStr::new(&blocked),
        ),
        ("ARKTS_INDEX_TEST_STREAM_FIRST_GATE", gate.as_os_str()),
    ]);
    init(&mut p, root, cache);
    start(&mut p, 2, 1);
    loop {
        let event = p.read_event();
        if event["event"] == "maintenance/progress" && event["indexed"].as_u64().unwrap_or(0) >= 64
        {
            break;
        }
    }
    let cancelled = p.request(json!({"protocol":1,"id":3,"method":"maintenance/cancel","params":{"attemptId":"reconcile-1","input":{"issuer":"window","revision":1}}}));
    assert_eq!(cancelled["result"]["accepted"], true);
    assert_eq!(terminal(&mut p)["outcome"], "cancelled");
    let location = workspace_cache_location(cache, root).unwrap();
    let private = fs::read_dir(location.database_path.parent().unwrap())
        .unwrap()
        .map(|e| e.unwrap().path())
        .find(|p| {
            let n = p.file_name().unwrap().to_string_lossy();
            n.starts_with("catalog-") && n.ends_with(".sqlite3") && n != "catalog-state.sqlite3"
        })
        .unwrap();
    fs::write(&gate, "resume").unwrap();
    fs::write(&trace, "").unwrap();
    (p, gate, trace, private)
}
fn retired(private: &Path) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while private.exists() {
        assert!(
            std::time::Instant::now() < deadline,
            "private data DB remains pinned"
        );
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
}
#[test]
fn explicit_force_discards_a_cancelled_prefix_and_extracts_every_current_file() {
    let temp = TestDir::new("draft-explicit-force");
    let root = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    let (mut p, _gate, trace, private) = prefix(&temp, &root, &cache);
    let accepted = p.request(json!({"protocol":1,"id":4,"method":"maintenance/start","params":{"attemptId":"forced","input":{"issuer":"window","revision":2},"reason":"explicit-force","force":true}}));
    assert_eq!(accepted["ok"], true, "{accepted}");
    let done = terminal(&mut p);
    assert_eq!(done["outcome"], "qualified", "{done}");
    assert_eq!(done["writtenDocuments"], 128);
    assert_eq!(done["reusedDocuments"], 0);
    assert_eq!(parsed(&trace), 128);
    retired(&private);
    p.shutdown(5);
}
#[test]
fn a_same_producer_peer_publication_replaces_the_draft_with_current_delta_reuse() {
    let temp = TestDir::new("draft-same-producer-peer");
    let root = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    let (mut p, _gate, trace, private) = prefix(&temp, &root, &cache);
    let mut peer = SidecarProcess::spawn();
    init(&mut peer, &root, &cache);
    start(&mut peer, 2, 1);
    let published = terminal(&mut peer);
    assert_eq!(published["outcome"], "qualified", "{published}");
    start(&mut p, 4, 2);
    let done = terminal(&mut p);
    assert_eq!(done["outcome"], "qualified", "{done}");
    assert_eq!(done["writtenDocuments"], 0);
    assert_eq!(done["reusedDocuments"], 128);
    assert_eq!(parsed(&trace), 0);
    assert_eq!(
        done["qualification"]["storeId"],
        published["qualification"]["storeId"]
    );
    let answer = p.request(
        json!({"protocol":1,"id":5,"method":"search","params":{"query":"Item","limit":1000}}),
    );
    assert_eq!(answer["result"]["items"].as_array().unwrap().len(), 128);
    assert_eq!(answer["result"]["qualification"], done["qualification"]);
    retired(&private);
    p.shutdown(6);
    peer.shutdown(3);
}
