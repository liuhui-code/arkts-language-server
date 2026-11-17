//! Automatic selected-store collection through the real negotiated Native API.
use arkts_index_sqlite::{
    CatalogInputs, VersionedFacts, path_to_file_uri, workspace_cache_location,
};
use serde_json::json;
use std::{
    fs,
    time::{Duration, Instant},
};
#[expect(dead_code, reason = "shared protocol transcript helpers")]
#[path = "support/maintenance_session.rs"]
mod session;
use session::{SidecarProcess, TestDir, changes, init, start, terminal};
#[test]
fn ordinary_updates_reclaim_superseded_facts_without_a_manual_gc_request_or_restart() {
    let temp = TestDir::new("automatic-selected-store-collection");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let source = root.join("A.ets");
    let before = "export class Before {}\n";
    fs::write(&source, before).unwrap();
    let cache = temp.path().join("cache");
    let mut p = SidecarProcess::spawn();
    init(&mut p, &root, &cache);
    start(&mut p, 2, 1);
    let cold = terminal(&mut p);
    assert_eq!(cold["outcome"], "qualified");
    let location = workspace_cache_location(&cache, &root).unwrap();
    let q = &cold["qualification"];
    let path = location
        .database_path
        .with_file_name(q["storeId"].as_str().unwrap());
    let sha: String = CatalogInputs::source_digest(before)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    let version = {
        let f = VersionedFacts::open_existing(
            &path,
            &location.workspace_identity,
            q["storeId"].as_str().unwrap(),
            q["factsDomain"].as_str().unwrap(),
        )
        .unwrap();
        f.find_version(&path_to_file_uri(&source), &sha)
            .unwrap()
            .unwrap()
            .version
    };
    fs::write(&source, "export class After {}\n").unwrap();
    assert_eq!(
        changes(&mut p, 3, 2, &path_to_file_uri(&source))["result"]["accepted"],
        true
    );
    let changed = terminal(&mut p);
    assert_eq!(changed["outcome"], "data-updated", "{changed}");
    // V1 is no longer in the two-content working window only after V3.
    // Preserve the strict actual-deletion assertion below, not immediate eviction.
    fs::write(&source, "export class Latest {}\n").unwrap();
    changes(&mut p, 4, 3, &path_to_file_uri(&source));
    assert_eq!(terminal(&mut p)["outcome"], "data-updated");
    let mut id = 5;
    let deadline = Instant::now() + Duration::from_secs(15);
    let gc = loop {
        let status =
            p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
        id += 1;
        let gc = &status["result"]["collection"];
        assert!(
            gc.is_object(),
            "automatic collector not installed: {status}"
        );
        if gc["versionsDeleted"].as_u64().unwrap_or(0) > 0 {
            break gc.clone();
        }
        assert!(
            Instant::now() < deadline,
            "obsolete facts never collected: {status}"
        );
        std::thread::sleep(Duration::from_millis(10));
    };
    assert_eq!(gc["workerSpawns"], 1);
    assert_eq!(
        gc["collectorOpens"], 1,
        "one physical store must retain one collector"
    );
    let facts = VersionedFacts::open_existing(
        &path,
        &location.workspace_identity,
        q["storeId"].as_str().unwrap(),
        q["factsDomain"].as_str().unwrap(),
    )
    .unwrap();
    assert!(facts.read_version(&version).unwrap().is_none());
    let result = p.request(
        json!({"protocol":1,"id":id,"method":"search","params":{"query":"Latest","limit":10}}),
    );
    id += 1;
    assert_eq!(result["result"]["items"].as_array().unwrap().len(), 1);
    assert!(
        result["result"]["qualification"].is_null(),
        "GC must not manufacture complete qualification"
    );
    p.shutdown(id);
}

#[test]
fn a_gc_quantum_precedes_the_next_mutation_but_queries_and_close_remain_responsive() {
    let temp = TestDir::new("automatic-collection-writer-barrier");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let source = root.join("A.ets");
    fs::write(&source, "export class Before {}\n").unwrap();
    let gate = temp.path().join("release-gc");
    let mut p = SidecarProcess::spawn_with_environment(&[(
        "ARKTS_INDEX_TEST_COLLECTION_GATE",
        gate.as_os_str(),
    )]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    let mut id = 3;
    loop {
        let status =
            p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
        id += 1;
        if status["result"]["collection"]["active"] == true {
            break;
        }
    }
    let before = p.request(
        json!({"protocol":1,"id":id,"method":"search","params":{"query":"Before","limit":10}}),
    );
    id += 1;
    assert_eq!(before["result"]["items"].as_array().unwrap().len(), 1);
    fs::write(&source, "export class After {}\n").unwrap();
    assert_eq!(
        changes(&mut p, id, 2, &path_to_file_uri(&source))["result"]["accepted"],
        true
    );
    id += 1;
    let status = p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
    id += 1;
    assert_eq!(status["result"]["activeMaintenanceTasks"], 1);
    assert_eq!(status["result"]["collection"]["active"], true);
    assert!(
        status["result"]["terminal"].is_null(),
        "mutation must wait for the GC quantum"
    );
    let after = p.request(
        json!({"protocol":1,"id":id,"method":"search","params":{"query":"After","limit":10}}),
    );
    id += 1;
    assert!(after["result"]["items"].as_array().unwrap().is_empty());
    assert!(after["result"]["qualification"].is_null());
    // Shutdown must release the blocked GC and the input waiting behind it;
    // the gate is intentionally never opened. This is not an OS thread kill.
    p.shutdown(id);
}

#[test]
fn a_live_borrow_survives_gc_and_idle_probing_reclaims_it_after_close_without_changing_qualification()
 {
    let temp = TestDir::new("automatic-collection-live-borrow");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let source = root.join("A.ets");
    let before = "export class Before {}\n";
    fs::write(&source, before).unwrap();
    let cache = temp.path().join("cache");
    let mut p = SidecarProcess::spawn();
    init(&mut p, &root, &cache);
    start(&mut p, 2, 1);
    let cold = terminal(&mut p);
    let q = &cold["qualification"];
    let location = workspace_cache_location(&cache, &root).unwrap();
    let path = location
        .database_path
        .with_file_name(q["storeId"].as_str().unwrap());
    let borrowed = VersionedFacts::open_existing(
        &path,
        &location.workspace_identity,
        q["storeId"].as_str().unwrap(),
        q["factsDomain"].as_str().unwrap(),
    )
    .unwrap();
    let sha: String = CatalogInputs::source_digest(before)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    let version = borrowed
        .find_version(&path_to_file_uri(&source), &sha)
        .unwrap()
        .unwrap()
        .version;
    fs::write(&source, "export class After {}\n").unwrap();
    changes(&mut p, 3, 2, &path_to_file_uri(&source));
    assert_eq!(terminal(&mut p)["outcome"], "data-updated");
    fs::write(&source, "export class Latest {}\n").unwrap();
    changes(&mut p, 4, 3, &path_to_file_uri(&source));
    assert_eq!(terminal(&mut p)["outcome"], "data-updated");
    start(&mut p, 5, 4);
    let current = terminal(&mut p);
    assert_eq!(current["outcome"], "qualified");
    let mut id = 6;
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        let status =
            p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
        id += 1;
        if status["result"]["collection"]["last"]["ownerScanWrapped"] == true
            && status["result"]["collection"]["pending"] == false
        {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "collector never became quiescent: {status}"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(borrowed.read_version(&version).unwrap().is_some());
    drop(borrowed);
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        let status =
            p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
        id += 1;
        if status["result"]["collection"]["versionsDeleted"]
            .as_u64()
            .unwrap_or(0)
            > 0
        {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "idle closed borrower never reclaimed: {status}"
        );
        std::thread::sleep(Duration::from_millis(20));
    }
    let result = p.request(
        json!({"protocol":1,"id":id,"method":"search","params":{"query":"Latest","limit":10}}),
    );
    id += 1;
    assert_eq!(result["result"]["qualification"], current["qualification"]);
    assert_eq!(result["result"]["items"].as_array().unwrap().len(), 1);
    p.shutdown(id);
}

#[test]
fn a_fatal_collector_fault_does_not_change_data_terminal_or_restart_on_each_input_and_reinitialize_recovers()
 {
    let temp = TestDir::new("automatic-collection-fatal-isolation");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("A.ets"), "export class Healthy {}\n").unwrap();
    let cache = temp.path().join("cache");
    let mut p = SidecarProcess::spawn_with_environment(&[(
        "ARKTS_INDEX_TEST_COLLECTION_PANIC",
        std::ffi::OsStr::new("once"),
    )]);
    init(&mut p, &root, &cache);
    start(&mut p, 2, 1);
    assert_eq!(
        terminal(&mut p)["outcome"],
        "qualified",
        "GC fault must not rewrite the data terminal"
    );
    let mut id = 3;
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        let status =
            p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
        id += 1;
        let c = &status["result"]["collection"];
        if c["disabled"] == true || (c["quanta"].as_u64().unwrap_or(0) > 0 && c["active"] == false)
        {
            assert_eq!(
                c["fatal"], true,
                "controlled GC panic not isolated: {status}"
            );
            assert!(c["error"].as_str().unwrap().contains("panicked"));
            break;
        }
        assert!(
            Instant::now() < deadline,
            "GC fault never observed: {status}"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    for revision in 2..=4 {
        fs::write(
            root.join("A.ets"),
            format!("export class Updated{revision} {{}}\n"),
        )
        .unwrap();
        start(&mut p, id, revision);
        id += 1;
        assert_eq!(terminal(&mut p)["outcome"], "qualified");
        let status =
            p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
        id += 1;
        assert_eq!(status["result"]["collection"]["workerSpawns"], 1);
        assert_eq!(status["result"]["collection"]["fatal"], true);
        assert_eq!(status["result"]["collection"]["disabled"], true);
        assert!(
            status["result"]["retainedReuseStore"].is_null(),
            "fatal GC must not retain unreachable cache leases: {status}"
        );
    }
    let reinit=p.request(json!({"protocol":1,"id":id,"method":"initialize","params":{"workspaceRoot":root,"cacheDirectory":cache,"capabilities":["versioned-file-maintenance-v1"]}}));
    id += 1;
    assert_eq!(reinit["ok"], true, "{reinit}");
    let started=p.request(json!({"protocol":1,"id":id,"method":"maintenance/start","params":{"attemptId":"new-workspace-session","input":{"issuer":"reinitialized-window","revision":1},"reason":"reconcile"}}));
    assert_eq!(started["result"]["accepted"], true);
    id += 1;
    let reopened = terminal(&mut p);
    assert_eq!(reopened["outcome"], "qualified", "{reopened}");
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        let status =
            p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
        id += 1;
        let c = &status["result"]["collection"];
        if c["quanta"].as_u64().unwrap_or(0) > 0 {
            assert_eq!(c["fatal"], false);
            assert_eq!(c["disabled"], false);
            break;
        }
        assert!(
            Instant::now() < deadline,
            "reinitialized GC never ran: {status}"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    p.shutdown(id);
}

#[test]
fn cancelling_an_input_waiting_for_gc_ends_that_request_without_cancelling_the_collector() {
    let temp = TestDir::new("automatic-collection-wait-cancel");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let source = root.join("A.ets");
    fs::write(&source, "export class Before {}\n").unwrap();
    let gate = temp.path().join("release-gc");
    let mut p = SidecarProcess::spawn_with_environment(&[(
        "ARKTS_INDEX_TEST_COLLECTION_GATE",
        gate.as_os_str(),
    )]);
    init(&mut p, &root, &temp.path().join("cache"));
    start(&mut p, 2, 1);
    terminal(&mut p);
    let mut id = 3;
    fs::write(&source, "export class After {}\n").unwrap();
    changes(&mut p, id, 2, &path_to_file_uri(&source));
    id += 1;
    let status = p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
    id += 1;
    let attempt = status["result"]["attemptId"].clone();
    assert_eq!(status["result"]["collection"]["active"], true);
    let cancel=p.request(json!({"protocol":1,"id":id,"method":"maintenance/cancel","params":{"attemptId":attempt,"input":{"issuer":"window","revision":2}}}));
    id += 1;
    assert_eq!(cancel["result"]["accepted"], true);
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let status =
            p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
        id += 1;
        if status["result"]["terminal"]["outcome"] == "cancelled" {
            assert_eq!(status["result"]["collection"]["active"], true);
            assert!(!gate.exists());
            break;
        }
        assert!(
            Instant::now() < deadline,
            "cancelled input remains trapped behind GC: {status}"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(terminal(&mut p)["outcome"], "cancelled");
    fs::write(&gate, "GC can finish independently").unwrap();
    start(&mut p, id, 3);
    id += 1;
    let current = terminal(&mut p);
    assert_eq!(current["outcome"], "qualified");
    let after = p.request(
        json!({"protocol":1,"id":id,"method":"search","params":{"query":"After","limit":10}}),
    );
    id += 1;
    assert_eq!(after["result"]["items"].as_array().unwrap().len(), 1);
    assert_eq!(after["result"]["qualification"], current["qualification"]);
    p.shutdown(id);
}

#[test]
fn explicit_reinitialize_quiesces_background_gc_instead_of_returning_busy() {
    let temp = TestDir::new("automatic-gc-explicit-reinitialize");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("A.ets"), "export class Existing {}\n").unwrap();
    let cache = temp.path().join("cache");
    let gate = temp.path().join("never-opened");
    let mut p = SidecarProcess::spawn_with_environment(&[(
        "ARKTS_INDEX_TEST_COLLECTION_GATE",
        gate.as_os_str(),
    )]);
    init(&mut p, &root, &cache);
    start(&mut p, 2, 1);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    let epoch = p.request(json!({"protocol":1,"id":3,"method":"index/reader-status","params":{}}))
        ["result"]["readerEpoch"]
        .clone();
    let mut id = 4;
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        let status =
            p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
        id += 1;
        if status["result"]["collection"]["active"] == true {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "GC never reached controlled active state: {status}"
        );
    }
    let invalid=p.request(json!({"protocol":1,"id":id,"method":"initialize","params":{"workspaceRoot":root.join("missing"),"cacheDirectory":cache,"capabilities":["versioned-file-maintenance-v1"]}}));
    id += 1;
    assert_eq!(invalid["error"]["code"], "io");
    let preserved =
        p.request(json!({"protocol":1,"id":id,"method":"maintenance/status","params":{}}));
    id += 1;
    assert_eq!(
        preserved["result"]["collection"]["active"], true,
        "failed replacement must preserve the old workspace"
    );
    let reinit=p.request(json!({"protocol":1,"id":id,"method":"initialize","params":{"workspaceRoot":root,"cacheDirectory":cache,"capabilities":["versioned-file-maintenance-v1"]}}));
    id += 1;
    assert_eq!(
        reinit["ok"], true,
        "background GC must quiesce during explicit lifecycle replacement: {reinit}"
    );
    assert_ne!(reinit["result"]["readerEpoch"], epoch);
    assert!(
        !gate.exists(),
        "reinitialize must not require opening the old GC gate"
    );
    let ack=p.request(json!({"protocol":1,"id":id,"method":"maintenance/start","params":{"attemptId":"new-lifecycle","input":{"issuer":"new-window","revision":1},"reason":"reconcile"}}));
    id += 1;
    assert_eq!(ack["result"]["accepted"], true);
    let current = terminal(&mut p);
    assert_eq!(current["outcome"], "qualified");
    let found = p.request(
        json!({"protocol":1,"id":id,"method":"search","params":{"query":"Existing","limit":10}}),
    );
    id += 1;
    assert_eq!(found["result"]["items"].as_array().unwrap().len(), 1);
    assert_eq!(found["result"]["qualification"], current["qualification"]);
    p.shutdown(id);
}
