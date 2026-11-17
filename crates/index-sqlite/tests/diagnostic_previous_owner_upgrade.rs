//! Real previous8 input -> private9 publication with an old reader held.
use arkts_index_core::{Document, SymbolQuery, parse_document_symbols};
use arkts_index_sqlite::{CatalogMigration, CatalogStore, CompleteScanInputs, InputRevision};
#[path = "support/previous_owner_fixture.rs"]
mod previous_owner_fixture;
#[test]
fn private_upgrade_replaces_selected_store_while_old_reader_keeps_its_snapshot() {
    assert_upgrade(false);
}
#[test]
fn private_slot_upgrade_preserves_old_reader_and_retries_failed_activation() {
    assert_upgrade(true);
}
fn assert_upgrade(slots: bool) {
    let (temp, old_record) = if slots {
        previous_owner_fixture::fixture_slots()
    } else {
        previous_owner_fixture::fixture()
    };
    let root = temp.path();
    let workspace = old_record["workspace"].as_str().unwrap();
    let domain = old_record["domain"].as_str().unwrap();
    let base = root.join("symbols-v2.sqlite3");
    let old_path = root.join(old_record["store"].as_str().unwrap());
    let held_old = CatalogStore::open_for_maintenance(&base, workspace, domain).unwrap();
    let active = CatalogStore::open_for_maintenance(&base, workspace, domain).unwrap();
    assert!(active.migration_required().unwrap());
    let old_db = rusqlite::Connection::open_with_flags(
        &old_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .unwrap();
    old_db.execute_batch("BEGIN;").unwrap();
    let old_name = || {
        old_db
            .query_row(
                "SELECT name FROM v_symbols WHERE version='previous' ORDER BY ordinal LIMIT 1",
                [],
                |r| r.get::<_, String>(0),
            )
            .unwrap()
    };
    assert_eq!(old_name(), "PreviousOwnerFormat");
    let mut replacement =
        CatalogMigration::begin_from(&base, workspace, domain, Some(domain)).unwrap();
    let uri = "file:///owner-format-upgrade/A.ets";
    let text = "export class UpgradedOwnerFormat {}";
    let doc = parse_document_symbols(&Document::new(uri, text)).unwrap();
    let digest = arkts_index_sqlite::CatalogInputs::source_digest(text)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    replacement
        .facts_mut()
        .write_version("upgrade", &digest, &doc)
        .unwrap();
    replacement
        .facts_mut()
        .stage_group("upgrade", &[(uri.into(), "upgrade".into())])
        .unwrap();
    replacement.facts_mut().publish_group("upgrade", 0).unwrap();
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(uri, text);
    let proof = scan.finish().unwrap();
    // Failed source/admission checks must leave the real previous catalog selected.
    for (sequence, sources_current) in [(1, false), (2, true)] {
        let denied = InputRevision::new("upgraded-producer", sequence).unwrap();
        assert!(
            replacement
                .try_activate(
                    &format!("denied-{sequence}"),
                    &denied,
                    &proof,
                    || Ok(sources_current),
                    || Ok(!sources_current),
                )
                .is_err()
        );
        assert!(replacement.is_current_parent().unwrap());
        assert!(active.migration_required().unwrap());
        assert_eq!(old_name(), "PreviousOwnerFormat");
    }
    let input = InputRevision::new("upgraded-producer", 3).unwrap();
    let selected = replacement
        .activate(&input, &proof, || Ok(true), || Ok(true))
        .unwrap();
    assert_ne!(selected.store, old_record["store"].as_str().unwrap());
    assert!(
        !active.migration_required().unwrap(),
        "a selected current layout must stop requesting migration"
    );
    let current = active
        .qualified_read(&input, |s| {
            s.search(&SymbolQuery::new("UpgradedOwnerFormat", 10))
        })
        .unwrap()
        .unwrap();
    assert_eq!(current.store, selected.store);
    assert_eq!(current.qualification, Some(selected.clone()));
    assert_eq!(current.value.items.len(), 1);
    assert_eq!(current.head, current.value.served_generation);
    let new_db = rusqlite::Connection::open_with_flags(
        root.join(&selected.store),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .unwrap();
    let format: i64 = new_db
        .query_row("SELECT version FROM file_facts_format", [], |r| r.get(0))
        .unwrap();
    assert_eq!(
        format,
        if cfg!(feature = "experimental-occurrence-without-rowid") {
            110
        } else {
            10
        }
    );
    assert!(
        old_path.exists(),
        "held old catalog lease prevents physical retirement"
    );
    assert_eq!(
        old_name(),
        "PreviousOwnerFormat",
        "old read transaction remains the old snapshot"
    );
    let old_format: i64 = old_db
        .query_row("SELECT version FROM file_facts_format", [], |r| r.get(0))
        .unwrap();
    assert_eq!(old_format, old_record["actualFormat"].as_i64().unwrap());
    old_db.execute_batch("ROLLBACK;").unwrap();
    drop(old_db);
    drop(held_old);
    println!(
        "upgrade-control oldFormat={old_format} newFormat={format} currentQualified=true oldSnapshotPreserved=true"
    );
}
