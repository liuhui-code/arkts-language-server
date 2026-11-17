//! Real Native cancellation after a committed prefix, then current-input recovery.
use arkts_index_sqlite::path_to_file_uri;
use serde_json::json;
use std::fs;
#[expect(
    dead_code,
    reason = "shared protocol helpers used by other transcripts"
)]
#[path = "support/maintenance_session.rs"]
mod session;
use session::{SidecarProcess, TestDir, init, parsed, start, terminal};
#[test]
fn cancelled_cold_prefix_is_reused_but_changed_removed_and_new_inputs_are_revalidated() {
    let temp = TestDir::new("retained-bootstrap-prefix");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    for i in 0..128 {
        fs::write(
            root.join(format!("{i:04}.ets")),
            format!("export class Before{i:04} {{}}\n"),
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
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    // The modern full engine emits indexed64 only after write+stage have returned.
    // Parser65 cannot return, so the global private catalog cannot publish yet.
    loop {
        let event = p.read_event();
        if event["event"] == "maintenance/progress" && event["indexed"].as_u64().unwrap_or(0) >= 64
        {
            break;
        }
    }
    let cancel=p.request(json!({"protocol":1,"id":3,"method":"maintenance/cancel","params":{"attemptId":"reconcile-1","input":{"issuer":"window","revision":1}}}));
    assert_eq!(cancel["result"]["accepted"], true);
    assert_eq!(terminal(&mut p)["outcome"], "cancelled");
    let invisible = p.request(
        json!({"protocol":1,"id":4,"method":"search","params":{"query":"Before","limit":1000}}),
    );
    assert!(
        invisible["result"]["items"].as_array().unwrap().is_empty(),
        "unpublished facts must stay invisible"
    );
    assert_eq!(invisible["result"]["completeness"], "stale");
    fs::write(root.join("0000.ets"), "export class ChangedOne {}\n").unwrap();
    fs::remove_file(root.join("0001.ets")).unwrap();
    fs::write(root.join("new.ets"), "export class AddedOne {}\n").unwrap();
    fs::write(&gate, "next input").unwrap();
    fs::write(&trace, "").unwrap();
    start(&mut p, 5, 2);
    let done = terminal(&mut p);
    assert_eq!(done["outcome"], "qualified", "{done}");
    assert_eq!(
        done["writtenDocuments"], 66,
        "the 62 still-current sealed files must not be rewritten: {done}"
    );
    assert_eq!(done["reusedDocuments"], 62);
    assert_eq!(
        parsed(&trace),
        66,
        "reused facts must also skip the actual parser calls"
    );
    for (id, query, count) in [
        (6, "Before0000", 0),
        (7, "Before0001", 0),
        (8, "Before", 126),
        (9, "ChangedOne", 1),
        (10, "AddedOne", 1),
    ] {
        let answer = p.request(
            json!({"protocol":1,"id":id,"method":"search","params":{"query":query,"limit":1000}}),
        );
        assert_eq!(
            answer["result"]["items"].as_array().unwrap().len(),
            count,
            "{answer}"
        );
        assert_eq!(answer["result"]["qualification"], done["qualification"]);
    }
    // Current results alone cannot detect pinned obsolete private facts. Inspect
    // the now-selected store through its public content-cache interface too.
    let location =
        arkts_index_sqlite::workspace_cache_location(temp.path().join("cache"), &root).unwrap();
    let q = &done["qualification"];
    let facts = arkts_index_sqlite::VersionedFacts::open_existing(
        &location
            .database_path
            .with_file_name(q["storeId"].as_str().unwrap()),
        &location.workspace_identity,
        q["storeId"].as_str().unwrap(),
        q["factsDomain"].as_str().unwrap(),
    )
    .unwrap();
    for i in [0, 1] {
        let text = format!("export class Before{i:04} {{}}\n");
        let sha: String = arkts_index_sqlite::CatalogInputs::source_digest(&text)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        assert!(
            facts
                .find_version(&path_to_file_uri(&root.join(format!("{i:04}.ets"))), &sha)
                .unwrap()
                .is_none(),
            "obsolete unpublished prefix version {i} survived retry"
        );
    }
    p.shutdown(11);
}

#[test]
fn failed_final_fence_reuses_a_private_published_manifest_without_reviving_removed_members() {
    use std::{
        ffi::OsStr,
        time::{Duration, Instant},
    };
    let temp = TestDir::new("retained-bootstrap-private-head");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    for i in 0..128 {
        fs::write(
            root.join(format!("{i:04}.ets")),
            format!("export class Before{i:04} {{}}\n"),
        )
        .unwrap();
    }
    let gate = temp.path().join("release");
    let trace = temp.path().join("trace.jsonl");
    let mut p = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_STREAM_TRACE", trace.as_os_str()),
        (
            "ARKTS_INDEX_TEST_ACTIVATION_GATE_GENERATION",
            OsStr::new("1"),
        ),
        ("ARKTS_INDEX_TEST_ACTIVATION_GATE_FILE", gate.as_os_str()),
    ]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    let deadline = Instant::now() + Duration::from_secs(30);
    let mut id = 3;
    loop {
        let status =
            p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
        id += 1;
        if status["result"]["phase"] == "validating" {
            break;
        }
        assert!(Instant::now() < deadline, "EOF gate not reached: {status}");
        std::thread::sleep(Duration::from_millis(5));
    }
    // No watch notification: the real final namespace/content fence must reject it.
    fs::write(root.join("0000.ets"), "export class ChangedOne {}\n").unwrap();
    fs::remove_file(root.join("0001.ets")).unwrap();
    fs::write(root.join("new.ets"), "export class AddedOne {}\n").unwrap();
    fs::write(&gate, "source changed after parse").unwrap();
    let failed = terminal(&mut p);
    assert_eq!(failed["outcome"], "failed", "{failed}");
    assert!(
        failed["error"]["message"]
            .as_str()
            .unwrap()
            .contains("migration source fence failed"),
        "{failed}"
    );
    assert_eq!(failed["dataPublished"], false);
    let status = p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
    id += 1;
    assert_eq!(status["result"]["retainedBootstrapDraft"], true);
    let invisible = p.request(
        json!({"protocol":1,"id":id,"method":"search","params":{"query":"Before","limit":1000}}),
    );
    id += 1;
    assert!(invisible["result"]["items"].as_array().unwrap().is_empty());
    assert!(invisible["result"]["qualification"].is_null());
    fs::write(&trace, "").unwrap();
    start(&mut p, id, 2);
    id += 1;
    let done = terminal(&mut p);
    assert_eq!(done["outcome"], "qualified", "{done}");
    assert_eq!(done["writtenDocuments"], 2);
    assert_eq!(done["reusedDocuments"], 126);
    assert_eq!(parsed(&trace), 2);
    assert_eq!(
        done["qualification"]["head"], 2,
        "the private head is retained, never reset or compared to a different store"
    );
    for (query, count) in [
        ("Before0000", 0),
        ("Before0001", 0),
        ("Before", 126),
        ("ChangedOne", 1),
        ("AddedOne", 1),
    ] {
        let answer = p.request(
            json!({"protocol":1,"id":id,"method":"search","params":{"query":query,"limit":1000}}),
        );
        id += 1;
        assert_eq!(
            answer["result"]["items"].as_array().unwrap().len(),
            count,
            "{answer}"
        );
        assert_eq!(answer["result"]["qualification"], done["qualification"]);
    }
    let status = p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
    id += 1;
    assert_eq!(status["result"]["retainedBootstrapDraft"], false);
    p.shutdown(id);
}

#[test]
fn superseded_producer_releases_its_retained_draft_without_publishing_or_rebuilding() {
    use arkts_index_core::{Document, parse_document_symbols};
    use arkts_index_sqlite::{
        CatalogMigration, CompleteScanInputs, FileVersionWrite, InputRevision,
        workspace_cache_location,
    };
    let temp = TestDir::new("retained-bootstrap-superseded");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    for i in 0..128 {
        fs::write(
            root.join(format!("{i:04}.ets")),
            format!("export class Before{i:04} {{}}\n"),
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
    let cache = temp.path().join("cache");
    init(&mut p, &root, &cache);
    start(&mut p, 2, 1);
    loop {
        let event = p.read_event();
        if event["event"] == "maintenance/progress" && event["indexed"].as_u64().unwrap_or(0) >= 64
        {
            break;
        }
    }
    let cancel=p.request(json!({"protocol":1,"id":3,"method":"maintenance/cancel","params":{"attemptId":"reconcile-1","input":{"issuer":"window","revision":1}}}));
    assert_eq!(cancel["result"]["accepted"], true);
    assert_eq!(terminal(&mut p)["outcome"], "cancelled");
    let location = workspace_cache_location(&cache, &root).unwrap();
    let directory = location.database_path.parent().unwrap();
    let private = fs::read_dir(directory)
        .unwrap()
        .map(|e| e.unwrap().path())
        .find(|p| {
            let name = p.file_name().unwrap().to_string_lossy();
            name.starts_with("catalog-")
                && name.ends_with(".sqlite3")
                && name != "catalog-state.sqlite3"
        })
        .expect("the owned unpublished draft must still exist");
    let mut peer = CatalogMigration::begin(
        &location.database_path,
        &location.workspace_identity,
        "another-producer",
    )
    .unwrap();
    let mut scan = CompleteScanInputs::new().unwrap();
    let mut documents = Vec::new();
    for i in 0..128 {
        let uri = path_to_file_uri(&root.join(format!("{i:04}.ets")));
        let text = fs::read_to_string(root.join(format!("{i:04}.ets"))).unwrap();
        let sha = arkts_index_sqlite::CatalogInputs::source_digest(&text)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        scan.record(&uri, &text);
        documents.push((
            format!("peer-{i}"),
            sha,
            parse_document_symbols(&Document::new(&uri, text)).unwrap(),
        ));
    }
    for chunk in documents.chunks(64) {
        let inputs = chunk
            .iter()
            .map(|(id, sha, document)| FileVersionWrite { id, sha, document })
            .collect::<Vec<_>>();
        peer.facts_mut().write_versions(&inputs, || true).unwrap();
        peer.facts_mut()
            .stage_group(
                "peer",
                &chunk
                    .iter()
                    .map(|(id, _, doc)| (doc.uri.clone(), id.clone()))
                    .collect::<Vec<_>>(),
            )
            .unwrap();
    }
    peer.facts_mut().publish_group("peer", 0).unwrap();
    let receipt = peer
        .activate(
            &InputRevision::new("peer", 1).unwrap(),
            &scan.finish().unwrap(),
            || Ok(true),
            || Ok(true),
        )
        .unwrap();
    fs::write(&trace, "").unwrap();
    fs::write(&gate, "old owner remains superseded").unwrap();
    start(&mut p, 4, 2);
    let rejected = terminal(&mut p);
    assert_eq!(rejected["outcome"], "failed");
    assert_eq!(rejected["error"]["code"], "producer_superseded");
    let status = p.request(json!({"protocol":1,"id":5,"method":"maintenance/status","params":{}}));
    assert_eq!(
        status["result"]["retainedBootstrapDraft"], false,
        "a permanently superseded owner must not pin its obsolete private DB: {status}"
    );
    assert_eq!(parsed(&trace), 0);
    assert_eq!(status["result"]["maintenanceWorkerSpawns"], 2);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while private.exists() {
        assert!(
            std::time::Instant::now() < deadline,
            "obsolete private DB was not retired: {}",
            private.display()
        );
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    let current = arkts_index_sqlite::CatalogStore::open_with_domain(
        &location.database_path,
        &location.workspace_identity,
        "another-producer",
    )
    .unwrap();
    assert_eq!(
        current
            .qualified_read(&InputRevision::new("peer", 1).unwrap(), |s| s.metadata())
            .unwrap()
            .unwrap()
            .store,
        receipt.store
    );
    p.shutdown(6);
}
