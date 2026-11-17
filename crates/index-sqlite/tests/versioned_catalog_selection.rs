use arkts_index_core::{Document, WorkspaceIndex, parse_document_symbols};
use arkts_index_sqlite::{CatalogMigration, CatalogStore, CompleteScanInputs, InputRevision};
use sha2::{Digest, Sha256};
#[path = "support/temp_dir.rs"]
mod temp_dir;
const ROOT: &str = "file:///versioned-catalog-selection";
#[test]
fn negotiated_reader_keeps_old_catalog_until_complete_versioned_store_is_published() {
    let temp = temp_dir::TestDir::new("versioned-catalog-selection");
    let base = temp.path().join("symbols-v2.sqlite3");
    let mut old = WorkspaceIndex::with_store(CatalogStore::open(&base, ROOT).unwrap());
    old.refresh(
        5,
        [Document::new(
            format!("{ROOT}/Old.ets"),
            "export class Old {}",
        )],
        &[],
    )
    .unwrap();
    let reader =
        WorkspaceIndex::with_store(CatalogStore::open_with_domain(&base, ROOT, "domain").unwrap());
    let mut migration = CatalogMigration::begin(&base, ROOT, "domain").unwrap();
    let uri = format!("{ROOT}/New.ets");
    let text = "export class New {}";
    let doc = parse_document_symbols(&Document::new(&uri, text)).unwrap();
    migration
        .facts_mut()
        .write_version(
            "new",
            &format!("{:x}", Sha256::digest(text.as_bytes())),
            &doc,
        )
        .unwrap();
    migration
        .facts_mut()
        .stage_group("complete", &[(uri.clone(), "new".into())])
        .unwrap();
    migration.facts_mut().publish_group("complete", 0).unwrap();
    assert_eq!(reader.search("Old", 10).unwrap().items.len(), 1);
    assert!(reader.search("New", 10).unwrap().items.is_empty());
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(&uri, text);
    let input = InputRevision::new("issuer", 1).unwrap();
    let receipt = migration
        .activate(&input, &scan.finish().unwrap(), || Ok(true), || Ok(true))
        .unwrap();
    assert_eq!(
        receipt.head, 1,
        "a new physical store may restart below old generation five"
    );
    assert_eq!(reader.search("New", 10).unwrap().items.len(), 1);
    assert!(reader.search("Old", 10).unwrap().items.is_empty());
    assert!(
        old.search("New", 10).is_err(),
        "unnegotiated old reader must reject new format"
    );
    assert!(CatalogStore::open_with_domain(&base, ROOT, "wrong-domain").is_err());
    let reopened =
        WorkspaceIndex::with_store(CatalogStore::open_with_domain(&base, ROOT, "domain").unwrap());
    assert_eq!(reopened.search("New", 10).unwrap().served_generation, 1);
}

fn candidate(
    base: &std::path::Path,
    domain: &str,
) -> (
    CatalogMigration,
    arkts_index_sqlite::CompleteScanFingerprint,
) {
    let mut migration = CatalogMigration::begin(base, ROOT, domain).unwrap();
    let uri = format!("{ROOT}/New.ets");
    let text = "export class New {}";
    let doc = parse_document_symbols(&Document::new(&uri, text)).unwrap();
    migration
        .facts_mut()
        .write_version(
            "new",
            &format!("{:x}", Sha256::digest(text.as_bytes())),
            &doc,
        )
        .unwrap();
    migration
        .facts_mut()
        .stage_group("complete", &[(uri.clone(), "new".into())])
        .unwrap();
    migration.facts_mut().publish_group("complete", 0).unwrap();
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(&uri, text);
    (migration, scan.finish().unwrap())
}
#[test]
fn source_and_admission_rejection_keep_the_existing_catalog_selected() {
    let temp = temp_dir::TestDir::new("migration-fences");
    let base = temp.path().join("symbols-v2.sqlite3");
    let mut old = WorkspaceIndex::with_store(CatalogStore::open(&base, ROOT).unwrap());
    old.refresh(
        1,
        [Document::new(
            format!("{ROOT}/Old.ets"),
            "export class Old {}",
        )],
        &[],
    )
    .unwrap();
    for (source, admission) in [(false, true), (true, false)] {
        let (migration, scan) = candidate(&base, "domain");
        assert!(
            migration
                .activate(
                    &InputRevision::new("issuer", 1).unwrap(),
                    &scan,
                    || Ok(source),
                    || Ok(admission)
                )
                .is_err()
        );
        assert_eq!(old.search("Old", 10).unwrap().items.len(), 1);
        assert_eq!(old.metadata().unwrap().committed_generation, 1);
        assert!(old.search("New", 10).unwrap().items.is_empty());
    }
}
#[test]
fn source_fence_does_not_hold_publication_lock_and_parent_edit_prevents_activation() {
    let temp = temp_dir::TestDir::new("migration-parent-fence");
    let base = temp.path().join("symbols-v2.sqlite3");
    let mut old = WorkspaceIndex::with_store(CatalogStore::open(&base, ROOT).unwrap());
    old.refresh(
        1,
        [Document::new(
            format!("{ROOT}/Old.ets"),
            "export class Old {}",
        )],
        &[],
    )
    .unwrap();
    let (migration, scan) = candidate(&base, "domain");
    let result = migration.activate(
        &InputRevision::new("issuer", 1).unwrap(),
        &scan,
        || {
            // This would deadlock if source verification held the publication lock.
            old.refresh(
                2,
                [Document::new(
                    format!("{ROOT}/Live.ets"),
                    "export class Live {}",
                )],
                &[],
            )?;
            Ok(true)
        },
        || Ok(true),
    );
    assert_eq!(
        result.unwrap_err().kind(),
        arkts_index_core::StoreErrorKind::InvalidGeneration
    );
    assert_eq!(old.search("Live", 10).unwrap().items.len(), 1);
    assert_eq!(old.metadata().unwrap().committed_generation, 2);
    assert!(old.search("New", 10).unwrap().items.is_empty());
}
#[test]
fn domain_upgrade_uses_another_private_store_and_does_not_reinterpret_old_facts() {
    let temp = temp_dir::TestDir::new("migration-domain-upgrade");
    let base = temp.path().join("symbols-v2.sqlite3");
    let (first, scan) = candidate(&base, "producer-a");
    let a = first
        .activate(
            &InputRevision::new("issuer", 1).unwrap(),
            &scan,
            || Ok(true),
            || Ok(true),
        )
        .unwrap();
    let (second, scan) = candidate(&base, "producer-b");
    let b = second
        .activate(
            &InputRevision::new("issuer", 2).unwrap(),
            &scan,
            || Ok(true),
            || Ok(true),
        )
        .unwrap();
    assert_ne!(a.store, b.store);
    assert_ne!(a.domain, b.domain);
    assert!(CatalogStore::open_with_domain(&base, ROOT, "producer-a").is_err());
    let reader = WorkspaceIndex::with_store(
        CatalogStore::open_with_domain(&base, ROOT, "producer-b").unwrap(),
    );
    assert_eq!(reader.search("New", 10).unwrap().items.len(), 1);
}

#[test]
fn migration_open_exposes_only_a_hint_and_never_executes_an_old_domain_read() {
    use arkts_index_core::{StoreErrorKind, SymbolStore};
    use std::cell::Cell;
    let temp = temp_dir::TestDir::new("migration-read-boundary");
    let base = temp.path().join("symbols-v2.sqlite3");
    let (previous, scan) = candidate(&base, "previous");
    previous
        .activate(
            &InputRevision::new("old", 1).unwrap(),
            &scan,
            || Ok(true),
            || Ok(true),
        )
        .unwrap();
    let reader = CatalogStore::open_for_maintenance(&base, ROOT, "next").unwrap();
    assert_eq!(
        reader.migration_source_domain().unwrap().as_deref(),
        Some("previous")
    );
    assert_eq!(
        reader
            .metadata_for_maintenance()
            .unwrap()
            .committed_generation,
        1
    );
    assert!(reader.file_inventory().unwrap().is_none());
    let called = Cell::new(false);
    let input = InputRevision::new("new", 1).unwrap();
    let cancel = arkts_index_sqlite::ReadCancellation::default();
    assert_eq!(
        reader
            .qualified_read(&input, |_| {
                called.set(true);
                Ok(())
            })
            .unwrap_err()
            .kind(),
        StoreErrorKind::MigrationRequired
    );
    assert_eq!(
        reader
            .read_snapshot(Some(&input), &cancel, |_, _, _| {
                called.set(true);
                Ok(())
            })
            .unwrap_err()
            .kind(),
        StoreErrorKind::MigrationRequired
    );
    assert_eq!(
        reader
            .discovery_read(&cancel, |_| {
                called.set(true);
                Ok(())
            })
            .unwrap_err()
            .kind(),
        StoreErrorKind::MigrationRequired
    );
    assert_eq!(
        reader
            .search(&arkts_index_core::SymbolQuery::new("New", 10))
            .unwrap_err()
            .kind(),
        StoreErrorKind::MigrationRequired
    );
    assert!(
        !called.get(),
        "no payload callback may run against incompatible facts"
    );
    assert!(CatalogStore::open_for_maintenance(&base, "file:///other-workspace", "next").is_err());
    assert!(CatalogStore::open_for_maintenance(&base, ROOT, "").is_err());
    assert!(CatalogStore::open_with_domain(&base, ROOT, "next").is_err());
}

#[test]
fn startup_permission_allows_retry_but_not_a_different_producer_or_late_activation() {
    use arkts_index_core::StoreErrorKind;
    let temp = temp_dir::TestDir::new("migration-startup-authority");
    let base = temp.path().join("symbols-v2.sqlite3");
    let (previous, scan) = candidate(&base, "previous");
    let selected = previous
        .activate(
            &InputRevision::new("old", 1).unwrap(),
            &scan,
            || Ok(true),
            || Ok(true),
        )
        .unwrap();
    // A cancelled/failed candidate must leave the previous physical catalog selected.
    drop(CatalogMigration::begin_from(&base, ROOT, "next", Some("previous")).unwrap());
    let old = CatalogStore::open_with_domain(&base, ROOT, "previous").unwrap();
    assert_eq!(
        old.qualified_read(&InputRevision::new("old", 1).unwrap(), |s| s.metadata())
            .unwrap()
            .unwrap()
            .store,
        selected.store
    );
    let mut retry = CatalogMigration::begin_from(&base, ROOT, "next", Some("previous")).unwrap();
    let uri = format!("{ROOT}/New.ets");
    let text = "export class New {}";
    let doc = parse_document_symbols(&Document::new(&uri, text)).unwrap();
    retry
        .facts_mut()
        .write_version(
            "new",
            &format!("{:x}", Sha256::digest(text.as_bytes())),
            &doc,
        )
        .unwrap();
    retry
        .facts_mut()
        .stage_group("complete", &[(uri, "new".into())])
        .unwrap();
    retry.facts_mut().publish_group("complete", 0).unwrap();
    let (peer, scan) = candidate(&base, "other");
    let promoted = peer
        .activate(
            &InputRevision::new("peer", 1).unwrap(),
            &scan,
            || Ok(true),
            || Ok(true),
        )
        .unwrap();
    // The authority check is under the publication lock before a draft is created.
    let denied = CatalogMigration::begin_from(&base, ROOT, "next", Some("previous"));
    assert!(matches!(denied, Err(e) if e.kind() == StoreErrorKind::ProducerSuperseded));
    // A candidate created before takeover still cannot publish after that takeover.
    assert_eq!(
        retry
            .activate(
                &InputRevision::new("retry", 1).unwrap(),
                &scan,
                || Ok(true),
                || Ok(true)
            )
            .unwrap_err()
            .kind(),
        StoreErrorKind::InvalidGeneration
    );
    let current = CatalogStore::open_with_domain(&base, ROOT, "other").unwrap();
    assert_eq!(
        current
            .qualified_read(&InputRevision::new("peer", 1).unwrap(), |s| s.metadata())
            .unwrap()
            .unwrap()
            .store,
        promoted.store
    );
}
