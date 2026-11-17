use arkts_index_sqlite::path_to_file_uri;
use serde_json::{Value, json};
use std::{ffi::OsStr, fs};
#[path = "support/maintenance_session.rs"]
mod session;
use session::{SidecarProcess, TestDir, changes, init, parsed, start, terminal};
fn event(p: &mut SidecarProcess, id: u64, rev: u64, uri: &str, kind: &str) -> Value {
    p.request(json!({"protocol":1,"id":id,"method":"maintenance/changes","params":{"input":{"issuer":"window","revision":rev},"changes":[{"uri":uri,"kind":kind}],"uncertainty":[]}}))
}
#[test]
fn duplicate_events_are_idempotent_but_new_input_with_same_bytes_is_not_complete_proof() {
    let temp = TestDir::new("maintenance-event-noop");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let file = root.join("A.ets");
    fs::write(&file, "export class Before {}\n").unwrap();
    let trace = temp.path().join("trace.jsonl");
    let mut p = SidecarProcess::spawn_with_environment(&[(
        "ARKTS_INDEX_TEST_STREAM_TRACE",
        trace.as_os_str(),
    )]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    fs::write(&trace, "").unwrap();
    fs::write(&file, "export class After {}\n").unwrap();
    let uri = path_to_file_uri(&file);
    assert_eq!(changes(&mut p, 3, 2, &uri)["result"]["accepted"], true);
    let first = terminal(&mut p);
    assert_eq!(first["outcome"], "data-updated");
    let replay = changes(&mut p, 4, 2, &uri);
    assert_eq!(replay["result"]["accepted"], false);
    assert_eq!(replay["result"]["status"]["maintenanceWorkerSpawns"], 2);
    let conflict = event(&mut p, 5, 2, &uri, "removed");
    assert_eq!(conflict["error"]["code"], "invalid_generation");
    assert_eq!(changes(&mut p, 6, 3, &uri)["result"]["accepted"], true);
    let noop = terminal(&mut p);
    assert_eq!(noop["outcome"], "unchanged", "{noop}");
    assert_eq!(noop["snapshot"], first["snapshot"]);
    assert_eq!(noop["writtenDocuments"], 0);
    assert_eq!(noop["factRowsWritten"], 0);
    assert_eq!(noop["dataPublished"], false);
    assert!(noop["qualification"].is_null());
    assert_eq!(parsed(&trace), 1);
    start(&mut p, 7, 3);
    let q = terminal(&mut p);
    assert_eq!(q["outcome"], "qualified");
    assert_eq!(q["currentInput"], true);
    assert_eq!(q["qualification"]["head"], noop["snapshot"]["head"]);
    assert_eq!(q["writtenDocuments"], 0);
    assert_eq!(parsed(&trace), 1);
    p.shutdown(8);
}

#[test]
fn deletion_restore_creation_and_late_removed_hint_use_disk_authority_and_reuse_content() {
    let temp = TestDir::new("maintenance-members");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let file = root.join("A.ets");
    let text = "export class Restorable {}\n";
    fs::write(&file, text).unwrap();
    let uri = path_to_file_uri(&file);
    let trace = temp.path().join("trace.jsonl");
    let mut p = SidecarProcess::spawn_with_environment(&[(
        "ARKTS_INDEX_TEST_STREAM_TRACE",
        trace.as_os_str(),
    )]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    fs::write(&trace, "").unwrap();
    fs::remove_file(&file).unwrap();
    assert_eq!(
        event(&mut p, 3, 2, &uri, "removed")["result"]["accepted"],
        true
    );
    let removed = terminal(&mut p);
    assert_eq!(removed["outcome"], "data-updated");
    assert_eq!(removed["changeKind"], "removed");
    assert_eq!(removed["writtenDocuments"], 0);
    fs::write(&file, text).unwrap();
    assert_eq!(
        event(&mut p, 4, 3, &uri, "created")["result"]["accepted"],
        true
    );
    let restored = terminal(&mut p);
    assert_eq!(restored["outcome"], "data-updated");
    assert_eq!(restored["changeKind"], "created");
    assert_eq!(restored["writtenDocuments"], 0);
    assert_eq!(
        parsed(&trace),
        0,
        "restoration reuses the pinned/sealed content key"
    );
    assert_eq!(
        event(&mut p, 5, 4, &uri, "removed")["result"]["accepted"],
        true
    );
    let late = terminal(&mut p);
    assert_eq!(late["outcome"], "unchanged");
    assert_eq!(late["changeKind"], "removed");
    assert_eq!(late["snapshot"], restored["snapshot"]);
    let found = p.request(
        json!({"protocol":1,"id":6,"method":"search","params":{"query":"Restorable","limit":10}}),
    );
    assert_eq!(found["result"]["items"].as_array().unwrap().len(), 1);
    let new_file = root.join("New.ets");
    fs::write(&new_file, "export class NewlyCreated {}\n").unwrap();
    assert_eq!(
        event(&mut p, 7, 5, &path_to_file_uri(&new_file), "created")["result"]["accepted"],
        true
    );
    assert_eq!(terminal(&mut p)["writtenDocuments"], 1);
    assert_eq!(parsed(&trace), 1);
    start(&mut p, 8, 5);
    let q = terminal(&mut p);
    assert_eq!(q["outcome"], "qualified");
    assert_eq!(q["writtenDocuments"], 0);
    p.shutdown(9);
}

#[test]
fn point_updates_do_not_walk_the_project_and_unknown_read_or_invalid_uri_never_deletes_facts() {
    let temp = TestDir::new("maintenance-point-admission");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let file = root.join("A.ets");
    fs::write(&file, "export class Before {}\n").unwrap();
    let cache = temp.path().join("cache");
    let mut p = SidecarProcess::spawn();
    init(&mut p, &root, &cache);
    start(&mut p, 2, 1);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    p.shutdown(3);
    let mut p = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_SCAN_ERROR_KIND", OsStr::new("directory")),
        ("ARKTS_INDEX_TEST_SCAN_ERROR_PATH", root.as_os_str()),
    ]);
    init(&mut p, &root, &cache);
    let uri = path_to_file_uri(&file);
    fs::write(&file, "export class PointUpdated {}\n").unwrap();
    assert_eq!(changes(&mut p, 2, 2, &uri)["result"]["accepted"], true);
    assert_eq!(terminal(&mut p)["outcome"], "data-updated");
    start(&mut p, 3, 2);
    let full = terminal(&mut p);
    assert_eq!(full["outcome"], "failed");
    assert!(
        full["error"]["message"]
            .as_str()
            .unwrap()
            .contains("failed to read directory")
    );
    fs::write(&file, [0xff, 0xfe]).unwrap();
    assert_eq!(changes(&mut p, 4, 3, &uri)["result"]["accepted"], true);
    let unknown = terminal(&mut p);
    assert_eq!(unknown["outcome"], "failed");
    assert_eq!(unknown["dataPublished"], false);
    let outside = path_to_file_uri(&temp.path().join("workspace-neighbor/Evil.ets"));
    assert_eq!(
        changes(&mut p, 5, 4, &outside)["error"]["code"],
        "invalid_params"
    );
    let found = p.request(
        json!({"protocol":1,"id":6,"method":"search","params":{"query":"PointUpdated","limit":10}}),
    );
    assert_eq!(found["result"]["items"].as_array().unwrap().len(), 1);
    assert_eq!(found["result"]["completeness"], "stale");
    let status = p.request(json!({"protocol":1,"id":7,"method":"maintenance/status","params":{}}));
    assert_eq!(status["result"]["observedInput"]["revision"], 3);
    assert_eq!(status["result"]["pendingUriCount"], 0);
    assert_eq!(status["result"]["activeMaintenanceTasks"], 0);
    p.shutdown(8);
}

#[test]
fn newer_uncertain_input_cancels_a_complete_attempt_and_cannot_be_cleared_by_its_old_receipt() {
    use std::time::{Duration, Instant};
    let temp = TestDir::new("maintenance-uncertain-input");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("A.ets"), "export class Stable {}\n").unwrap();
    let gate = temp.path().join("release-old-full");
    let mut p = SidecarProcess::spawn_with_environment(&[
        (
            "ARKTS_INDEX_TEST_ACTIVATION_GATE_GENERATION",
            OsStr::new("2"),
        ),
        ("ARKTS_INDEX_TEST_ACTIVATION_GATE_FILE", gate.as_os_str()),
    ]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    let cold = terminal(&mut p);
    assert_eq!(cold["outcome"], "qualified");
    start(&mut p, 3, 2);
    let deadline = Instant::now() + Duration::from_secs(30);
    let mut id = 4;
    loop {
        let s = p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
        id += 1;
        if s["result"]["phase"] == "validating" {
            break;
        }
        assert!(Instant::now() < deadline, "{s}");
        std::thread::sleep(Duration::from_millis(10));
    }
    let state = p.request(json!({"protocol":1,"id":id,"method":"status","params":{}}));
    id += 1;
    assert_eq!(
        state["result"]["state"], "warming",
        "new input cannot retain the previous READY state: {state}"
    );
    let change = p.request(json!({"protocol":1,"id":id,"method":"maintenance/changes","params":{"input":{"issuer":"window","revision":3},"changes":[],"uncertainty":["configuration"]}}));
    id += 1;
    assert_eq!(change["result"]["accepted"], true);
    assert_eq!(change["result"]["status"]["needsReconcile"], true);
    let cancelled = terminal(&mut p);
    assert_eq!(cancelled["outcome"], "cancelled");
    assert_eq!(cancelled["currentInput"], false);
    start(&mut p, id, 3);
    id += 1;
    let recovered = terminal(&mut p);
    assert_eq!(recovered["outcome"], "qualified");
    assert_eq!(recovered["currentInput"], true);
    assert_eq!(
        recovered["qualification"]["head"],
        cold["qualification"]["head"]
    );
    assert_eq!(recovered["writtenDocuments"], 0);
    p.shutdown(id);
}

#[test]
fn pending_overflow_is_bounded_and_requires_reconciliation_instead_of_losing_the_watermark() {
    use std::time::{Duration, Instant};
    let temp = TestDir::new("maintenance-overflow");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let hot = root.join("Hot.ets");
    let uri = path_to_file_uri(&hot);
    fs::write(&hot, "export class Before {}\n").unwrap();
    let gate = temp.path().join("release");
    fs::write(&gate, "cold may pass").unwrap();
    let trace = temp.path().join("trace.jsonl");
    let mut p = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_STREAM_TRACE", trace.as_os_str()),
        ("ARKTS_INDEX_TEST_STREAM_FIRST_URI", OsStr::new(&uri)),
        ("ARKTS_INDEX_TEST_STREAM_FIRST_GATE", gate.as_os_str()),
    ]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    fs::write(&trace, "").unwrap();
    fs::remove_file(&gate).unwrap();
    fs::write(&hot, "export class After {}\n").unwrap();
    assert_eq!(changes(&mut p, 3, 2, &uri)["result"]["accepted"], true);
    let deadline = Instant::now() + Duration::from_secs(30);
    while !fs::read_to_string(&trace)
        .unwrap_or_default()
        .contains("first_wait")
    {
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(10));
    }
    for batch in 0..2 {
        let changes:Vec<_>=(0..128).map(|i|json!({"uri":path_to_file_uri(&root.join(format!("Pending{}.ets",batch*128+i))),"kind":"created"})).collect();
        let r=p.request(json!({"protocol":1,"id":4+batch,"method":"maintenance/changes","params":{"input":{"issuer":"window","revision":3+batch},"changes":changes,"uncertainty":[]}}));
        assert_eq!(r["result"]["accepted"], true, "{r}");
    }
    let overflow = event(
        &mut p,
        6,
        5,
        &path_to_file_uri(&root.join("Overflow.ets")),
        "created",
    );
    assert_eq!(overflow["result"]["accepted"], true);
    assert!(
        overflow["result"]["status"]["pendingUriCount"]
            .as_u64()
            .unwrap()
            <= 256
    );
    assert_eq!(overflow["result"]["status"]["precise"], false);
    assert_eq!(overflow["result"]["status"]["needsReconcile"], true);
    assert_eq!(overflow["result"]["status"]["observedInput"]["revision"], 5);
    let uncertain=p.request(json!({"protocol":1,"id":7,"method":"maintenance/changes","params":{"input":{"issuer":"window","revision":6},"changes":[],"uncertainty":["watch-overflow"]}}));
    assert_eq!(uncertain["result"]["accepted"], true);
    assert_eq!(uncertain["result"]["status"]["pendingUriCount"], 0);
    let cancelled = terminal(&mut p);
    assert_eq!(cancelled["outcome"], "cancelled");
    fs::write(&gate, "recovery may pass").unwrap();
    start(&mut p, 8, 6);
    let recovered = terminal(&mut p);
    assert_eq!(recovered["outcome"], "qualified");
    assert_eq!(recovered["qualification"]["input"]["revision"], 6);
    let status = p.request(json!({"protocol":1,"id":9,"method":"maintenance/status","params":{}}));
    assert_eq!(status["result"]["needsReconcile"], false);
    assert_eq!(status["result"]["precise"], true);
    assert_eq!(status["result"]["maintenanceWorkerSpawns"], 3);
    p.shutdown(10);
}

#[test]
fn case_aliases_must_not_create_two_index_identities_for_one_physical_source() {
    let temp = TestDir::new("maintenance-case-alias");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let original = root.join("MixedCase.ets");
    let alias = root.join("mixedcase.ets");
    fs::write(&original, "export class PhysicalSource {}\n").unwrap();
    let mut p = SidecarProcess::spawn();
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    let aliases = alias.is_file()
        && fs::canonicalize(&alias).unwrap() == fs::canonicalize(&original).unwrap();
    assert_eq!(
        changes(&mut p, 3, 2, &path_to_file_uri(&alias))["result"]["accepted"],
        true
    );
    let result = terminal(&mut p);
    if aliases {
        assert_eq!(
            result["outcome"], "failed",
            "a noncanonical case alias must be rejected: {result}"
        );
    } else {
        assert_eq!(
            result["outcome"], "unchanged",
            "on a case-sensitive volume the absent URI is a separate file"
        );
    }
    let found=p.request(json!({"protocol":1,"id":4,"method":"search","params":{"query":"PhysicalSource","limit":10}}));
    assert_eq!(found["result"]["items"].as_array().unwrap().len(), 1);
    assert_eq!(
        found["result"]["items"][0]["uri"],
        path_to_file_uri(&original)
    );
    println!(
        "case_alias_volume: aliases={aliases}; outcome={}",
        result["outcome"]
    );
    p.shutdown(5);
}

#[test]
fn explicit_namespace_change_remains_a_barrier_for_later_precise_uris_until_atomic_reconciliation()
{
    let temp = TestDir::new("maintenance-namespace-barrier");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let before = root.join("Before.ets");
    let after = root.join("After.ets");
    fs::write(&before, "export class Moved {}\n").unwrap();
    let mut p = SidecarProcess::spawn();
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    let cold = terminal(&mut p);
    assert_eq!(cold["outcome"], "qualified");
    fs::rename(&before, &after).unwrap();
    let change=p.request(json!({"protocol":1,"id":3,"method":"maintenance/changes","params":{"input":{"issuer":"window","revision":2},"changes":[{"uri":path_to_file_uri(&before),"kind":"removed"},{"uri":path_to_file_uri(&after),"kind":"created"}],"uncertainty":["namespace"]}}));
    assert_eq!(change["result"]["accepted"], true);
    fs::write(&after, "export class Moved { value = 1; }\n").unwrap();
    assert_eq!(
        changes(&mut p, 4, 3, &path_to_file_uri(&after))["result"]["accepted"],
        true
    );
    let status = p.request(json!({"protocol":1,"id":5,"method":"maintenance/status","params":{}}));
    assert_eq!(
        status["result"]["maintenanceWorkerSpawns"], 1,
        "precise input crossed an outstanding namespace barrier: {status}"
    );
    assert_eq!(status["result"]["requiresReconcileBarrier"], true);
    assert_eq!(status["result"]["pendingUriCount"], 1);
    start(&mut p, 6, 3);
    let full = terminal(&mut p);
    assert_eq!(full["outcome"], "qualified");
    assert_eq!(full["currentInput"], true);
    assert_eq!(
        full["qualification"]["head"].as_u64().unwrap(),
        cold["qualification"]["head"].as_u64().unwrap() + 1,
        "the paired move must have one visible publication, not per-URI intermediate heads"
    );
    let found = p.request(
        json!({"protocol":1,"id":7,"method":"search","params":{"query":"Moved","limit":10}}),
    );
    assert_eq!(found["result"]["items"].as_array().unwrap().len(), 1);
    assert_eq!(found["result"]["items"][0]["uri"], path_to_file_uri(&after));
    let done = p.request(json!({"protocol":1,"id":8,"method":"maintenance/status","params":{}}));
    assert_eq!(done["result"]["pendingUriCount"], 0);
    assert_eq!(done["result"]["requiresReconcileBarrier"], false);
    assert_eq!(done["result"]["maintenanceWorkerSpawns"], 2);
    p.shutdown(9);
}
