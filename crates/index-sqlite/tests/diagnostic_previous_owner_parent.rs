//! Public migration API against a real, independently produced format8 catalog.
use arkts_index_sqlite::CatalogMigration;
#[path = "support/previous_owner_fixture.rs"]
mod previous_owner_fixture;
#[test]
fn previous_owner_format_can_be_pinned_as_migration_parent_without_inplace_upgrade() {
    assert_parent(false);
}
#[test]
fn previous_slot_owner_format_can_be_pinned_without_inplace_upgrade() {
    assert_parent(true);
}
fn assert_parent(slots: bool) {
    let (temp, record) = if slots {
        previous_owner_fixture::fixture_slots()
    } else {
        previous_owner_fixture::fixture()
    };
    let root = temp.path();
    let old = root.join(record["store"].as_str().unwrap());
    let workspace = record["workspace"].as_str().unwrap();
    let domain = record["domain"].as_str().unwrap();
    let format = || {
        let db =
            rusqlite::Connection::open_with_flags(&old, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                .unwrap();
        db.query_row("SELECT version FROM file_facts_format", [], |r| {
            r.get::<_, i64>(0)
        })
        .unwrap()
    };
    assert_eq!(format(), record["actualFormat"].as_i64().unwrap());
    let builder = CatalogMigration::begin(&root.join("symbols-v2.sqlite3"), workspace, domain)
        .expect("known previous layout needs a safe private migration path");
    assert!(builder.is_current_parent().unwrap());
    assert_eq!(
        format(),
        record["actualFormat"].as_i64().unwrap(),
        "old physical store must not be changed in place"
    );
    drop(builder);
    assert!(
        old.exists(),
        "dropping an uncommitted replacement must preserve the selected old store"
    );
    assert_eq!(format(), record["actualFormat"].as_i64().unwrap());
}

#[test]
fn same_domain_previous_layout_requests_migration_and_cannot_serve_current_queries() {
    assert_migration_required(false);
}
#[test]
fn same_domain_previous_slot_layout_requests_migration() {
    assert_migration_required(true);
}
fn assert_migration_required(slots: bool) {
    use arkts_index_core::{StoreErrorKind, SymbolQuery, SymbolStore};
    use arkts_index_sqlite::{CatalogStore, VersionedFacts};
    let (temp, record) = if slots {
        previous_owner_fixture::fixture_slots()
    } else {
        previous_owner_fixture::fixture()
    };
    let root = temp.path();
    let old = root.join(record["store"].as_str().unwrap());
    let workspace = record["workspace"].as_str().unwrap();
    let domain = record["domain"].as_str().unwrap();
    let store =
        CatalogStore::open_for_maintenance(root.join("symbols-v2.sqlite3"), workspace, domain)
            .unwrap();
    assert!(
        VersionedFacts::open_existing(&old, workspace, record["store"].as_str().unwrap(), domain)
            .is_err(),
        "ordinary public facts open stays strict"
    );
    assert!(
        store.migration_required().unwrap(),
        "matching facts domain does not make the previous owner layout current"
    );
    assert_eq!(
        store.migration_source_domain().unwrap(),
        Some(domain.into())
    );
    assert_eq!(store.file_inventory().unwrap(), None);
    assert_eq!(
        store
            .search(&SymbolQuery::new("PreviousOwnerFormat", 10))
            .unwrap_err()
            .kind(),
        StoreErrorKind::MigrationRequired
    );
}
