use arkts_index_core::{Document, parse_document_symbols};
use arkts_index_sqlite::{
    CatalogMigration, CompleteScanInputs, InputRevision, path_to_file_uri, workspace_cache_location,
};
use serde_json::json;
use std::fs;
#[allow(dead_code)]
#[path = "support/maintenance_session.rs"]
mod session;
use session::{SidecarProcess, TestDir, start, terminal};
#[test]
fn a_new_producer_can_initialize_without_serving_old_facts_and_rebuild_the_same_workspace() {
    let temp = TestDir::new("producer-upgrade-session");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let source = root.join("A.ets");
    let uri = path_to_file_uri(&source);
    let before = "export class Before {}\n";
    fs::write(&source, before).unwrap();
    let cache = temp.path().join("cache");
    let location = workspace_cache_location(&cache, &root).unwrap();
    let mut migration = CatalogMigration::begin(
        &location.database_path,
        &location.workspace_identity,
        "previous-binary-producer",
    )
    .unwrap();
    let document = parse_document_symbols(&Document::new(&uri, before)).unwrap();
    migration
        .facts_mut()
        .write_version(
            "old",
            &arkts_index_sqlite::CatalogInputs::source_digest(before)
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>(),
            &document,
        )
        .unwrap();
    for index in 0..5 {
        let group = format!("old-{index}");
        migration
            .facts_mut()
            .stage_group(&group, &[(uri.clone(), "old".into())])
            .unwrap();
        migration.facts_mut().publish_group(&group, index).unwrap();
    }
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(&uri, before);
    let old = migration
        .activate(
            &InputRevision::new("previous-window", 1).unwrap(),
            &scan.finish().unwrap(),
            || Ok(true),
            || Ok(true),
        )
        .unwrap();
    assert_eq!(old.head, 5);
    fs::write(&source, [0xff, 0xfe]).unwrap();
    let mut p = SidecarProcess::spawn();
    let init=p.request(json!({"protocol":1,"id":1,"method":"initialize","params":{"workspaceRoot":root,"cacheDirectory":cache,"capabilities":["versioned-file-maintenance-v1"]}}));
    assert_eq!(
        init["ok"], true,
        "producer change must enter a recoverable migration state: {init}"
    );
    assert_eq!(init["result"]["migrationRequired"], true);
    assert_eq!(init["result"]["status"]["state"], "warming");
    let blocked = p.request(
        json!({"protocol":1,"id":2,"method":"search","params":{"query":"Before","limit":10}}),
    );
    assert_eq!(
        blocked["error"]["code"], "migration_required",
        "old facts cannot be reinterpreted by the new producer: {blocked}"
    );
    assert!(location.database_path.with_file_name(&old.store).exists());
    start(&mut p, 3, 1);
    let failed = terminal(&mut p);
    assert_eq!(
        failed["outcome"], "failed",
        "invalid source must not publish: {failed}"
    );
    let previous = arkts_index_sqlite::CatalogStore::open_with_domain(
        &location.database_path,
        &location.workspace_identity,
        "previous-binary-producer",
    )
    .unwrap();
    let still_selected = previous
        .qualified_read(&InputRevision::new("previous-window", 1).unwrap(), |s| {
            s.metadata()
        })
        .unwrap()
        .unwrap();
    assert_eq!(still_selected.store, old.store);
    assert_eq!(still_selected.head, 5);
    fs::write(&source, "export class After {}\n").unwrap();
    start(&mut p, 4, 2);
    let upgraded = terminal(&mut p);
    assert_eq!(
        upgraded["outcome"], "qualified",
        "same-session migration must succeed: {upgraded}"
    );
    assert_ne!(upgraded["qualification"]["storeId"], old.store);
    assert_eq!(upgraded["qualification"]["head"], 1);
    for (id, query, count) in [(5, "Before", 0), (6, "After", 1)] {
        let answer = p.request(
            json!({"protocol":1,"id":id,"method":"search","params":{"query":query,"limit":10}}),
        );
        assert_eq!(answer["result"]["items"].as_array().unwrap().len(), count);
        assert_eq!(answer["result"]["qualification"], upgraded["qualification"]);
    }
    let healthy =
        p.request(json!({"protocol":1,"id":7,"method":"index/reader-status","params":{}}));
    assert_eq!(
        healthy["result"]["resourceFailures"], 0,
        "migration is not a reader crash"
    );
    p.shutdown(8);
}

#[test]
fn an_existing_owner_cannot_migrate_back_over_a_producer_that_took_over_after_initialization() {
    let temp = TestDir::new("producer-upgrade-no-ping-pong");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let source = root.join("A.ets");
    let text = "export class Shared {}\n";
    fs::write(&source, text).unwrap();
    let cache = temp.path().join("cache");
    let location = workspace_cache_location(&cache, &root).unwrap();
    let mut p = SidecarProcess::spawn();
    session::init(&mut p, &root, &cache);
    start(&mut p, 2, 1);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    let uri = path_to_file_uri(&source);
    let mut next = CatalogMigration::begin(
        &location.database_path,
        &location.workspace_identity,
        "next-producer",
    )
    .unwrap();
    let doc = parse_document_symbols(&Document::new(&uri, text)).unwrap();
    let sha = arkts_index_sqlite::CatalogInputs::source_digest(text)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    next.facts_mut().write_version("next", &sha, &doc).unwrap();
    next.facts_mut()
        .stage_group("next", &[(uri.clone(), "next".into())])
        .unwrap();
    next.facts_mut().publish_group("next", 0).unwrap();
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(&uri, text);
    let promoted = next
        .activate(
            &InputRevision::new("new-window", 1).unwrap(),
            &scan.finish().unwrap(),
            || Ok(true),
            || Ok(true),
        )
        .unwrap();
    let read = p.request(
        json!({"protocol":1,"id":3,"method":"search","params":{"query":"Shared","limit":10}}),
    );
    start(&mut p, 4, 2);
    let rejected = terminal(&mut p);
    assert_eq!(
        rejected["outcome"], "failed",
        "an old producer must not publish another replacement: {rejected}"
    );
    assert_eq!(
        read["error"]["code"], "producer_superseded",
        "a live old owner must stop using the replaced producer: {read}"
    );

    assert_eq!(rejected["error"]["code"], "producer_superseded");
    let current = arkts_index_sqlite::CatalogStore::open_with_domain(
        &location.database_path,
        &location.workspace_identity,
        "next-producer",
    )
    .unwrap();
    let selected = current
        .qualified_read(&InputRevision::new("new-window", 1).unwrap(), |read| {
            read.metadata()
        })
        .unwrap()
        .unwrap();
    assert_eq!(
        selected.store, promoted.store,
        "old owner must not replace the new physical catalog"
    );
    let change = session::changes(&mut p, 5, 3, &uri);
    assert_eq!(change["result"]["accepted"], true);
    let rejected_file = terminal(&mut p);
    assert_eq!(rejected_file["outcome"], "failed");
    assert_eq!(
        rejected_file["error"]["code"], "producer_superseded",
        "precise file jobs must obey the same takeover rule: {rejected_file}"
    );
    let status = p.request(json!({"protocol":1,"id":6,"method":"index/reader-status","params":{}}));
    assert_eq!(status["result"]["resourceFailures"], 0);
    assert_eq!(status["result"]["retiredReaders"], 0);
    p.shutdown(7);
}
