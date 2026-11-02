use arkts_index_core::{Document, FullCatalogBatch, WorkspaceIndex, parse_document_symbols};
use arkts_index_sqlite::{CatalogStore, SqliteStore, build_catalog};
use std::fs;

#[path = "support/temp_dir.rs"]
mod temp_dir;

const IDENTITY: &str = "file:///catalog-open-contract";

fn populate(index: &mut WorkspaceIndex) {
    index
        .refresh(
            1,
            [Document::new(
                format!("{IDENTITY}/Stable.ets"),
                "export class StableService {}",
            )],
            &[],
        )
        .unwrap();
}

#[test]
fn a_fresh_catalog_initializes_and_reopens_without_requiring_a_positive_generation() {
    let temp = temp_dir::TestDir::new("catalog-fresh-open");
    let database = temp.path().join("symbols-v2.sqlite3");
    let index = WorkspaceIndex::with_store(CatalogStore::open(&database, IDENTITY).unwrap());
    assert_eq!(index.metadata().unwrap().committed_generation, 0);
    drop(index);
    let reopened = WorkspaceIndex::with_store(CatalogStore::open(&database, IDENTITY).unwrap());
    assert_eq!(reopened.metadata().unwrap().committed_generation, 0);
}

#[test]
fn an_existing_legacy_catalog_is_imported_without_replacing_its_incremental_generation() {
    let temp = temp_dir::TestDir::new("catalog-legacy-import");
    let database = temp.path().join("symbols-v2.sqlite3");
    let mut legacy = WorkspaceIndex::with_store(SqliteStore::open(&database, IDENTITY).unwrap());
    populate(&mut legacy);
    drop(legacy);
    assert!(!temp.path().join("catalog-state.sqlite3").exists());
    let index = WorkspaceIndex::with_store(CatalogStore::open(&database, IDENTITY).unwrap());
    assert_eq!(index.metadata().unwrap().committed_generation, 1);
    let result = index.search("StableService", 10).unwrap();
    assert_eq!(result.served_generation, 1);
    assert_eq!(result.items.len(), 1);
}

#[test]
fn missing_legacy_database_with_existing_control_fails_without_creating_an_empty_replacement() {
    let temp = temp_dir::TestDir::new("catalog-missing-legacy");
    let database = temp.path().join("symbols-v2.sqlite3");
    let mut index = WorkspaceIndex::with_store(CatalogStore::open(&database, IDENTITY).unwrap());
    populate(&mut index);
    drop(index);
    // Incremental commits do not advance the separate control generation.
    let control = rusqlite::Connection::open(temp.path().join("catalog-state.sqlite3")).unwrap();
    let generation: i64 = control
        .query_row("SELECT published_generation FROM catalog_state", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(generation, 0);
    drop(control);
    fs::remove_file(&database).unwrap();
    assert!(CatalogStore::open(&database, IDENTITY).is_err());
    assert!(
        !database.exists(),
        "a missing published DB must not be recreated"
    );
}

#[test]
fn missing_named_generation_fails_without_recreating_it() {
    let temp = temp_dir::TestDir::new("catalog-missing-generation");
    let database = temp.path().join("symbols-v2.sqlite3");
    build_catalog(
        &database,
        IDENTITY,
        FullCatalogBatch {
            generation: 1,
            documents: vec![
                parse_document_symbols(&Document::new(
                    format!("{IDENTITY}/Stable.ets"),
                    "export class StableService {}",
                ))
                .unwrap(),
            ],
            rejected_uris: vec![],
        },
        |_| true,
    )
    .unwrap();
    let control = rusqlite::Connection::open(temp.path().join("catalog-state.sqlite3")).unwrap();
    let name: String = control
        .query_row("SELECT database_name FROM catalog_state", [], |r| r.get(0))
        .unwrap();
    drop(control);
    let published = temp.path().join(name);
    fs::remove_file(&published).unwrap();
    assert!(CatalogStore::open(&database, IDENTITY).is_err());
    assert!(!published.exists());
}

#[test]
fn explicit_whole_cache_removal_allows_a_new_bootstrap() {
    let temp = temp_dir::TestDir::new("catalog-explicit-reset");
    let directory = temp.path().join("cache");
    let database = directory.join("symbols-v2.sqlite3");
    let mut index = WorkspaceIndex::with_store(CatalogStore::open(&database, IDENTITY).unwrap());
    populate(&mut index);
    drop(index);
    fs::remove_dir_all(&directory).unwrap();
    let reopened = WorkspaceIndex::with_store(CatalogStore::open(&database, IDENTITY).unwrap());
    assert_eq!(reopened.metadata().unwrap().committed_generation, 0);
}

#[test]
fn interrupted_bootstrap_with_control_but_no_database_fails_closed() {
    let temp = temp_dir::TestDir::new("catalog-interrupted-bootstrap");
    let database = temp.path().join("symbols-v2.sqlite3");
    // A crash can leave the control file before its bootstrap database exists.
    drop(rusqlite::Connection::open(temp.path().join("catalog-state.sqlite3")).unwrap());
    assert!(CatalogStore::open(&database, IDENTITY).is_err());
    assert!(!database.exists());
}

#[test]
fn a_truncated_published_legacy_database_is_not_reinitialized() {
    let temp = temp_dir::TestDir::new("catalog-truncated-legacy");
    let database = temp.path().join("symbols-v2.sqlite3");
    let mut index = WorkspaceIndex::with_store(CatalogStore::open(&database, IDENTITY).unwrap());
    populate(&mut index);
    drop(index);
    fs::write(&database, []).unwrap();
    assert!(CatalogStore::open(&database, IDENTITY).is_err());
    assert_eq!(fs::metadata(database).unwrap().len(), 0);
}

#[test]
fn an_existing_control_without_a_schema_cannot_be_recreated_over_valid_legacy_data() {
    let temp = temp_dir::TestDir::new("catalog-truncated-control");
    let database = temp.path().join("symbols-v2.sqlite3");
    let mut index = WorkspaceIndex::with_store(CatalogStore::open(&database, IDENTITY).unwrap());
    populate(&mut index);
    drop(index);
    let control = temp.path().join("catalog-state.sqlite3");
    fs::write(&control, []).unwrap();
    assert!(CatalogStore::open(&database, IDENTITY).is_err());
    assert_eq!(fs::metadata(control).unwrap().len(), 0);
    let legacy = WorkspaceIndex::with_store(SqliteStore::open(&database, IDENTITY).unwrap());
    assert_eq!(legacy.metadata().unwrap().committed_generation, 1);
    assert_eq!(legacy.search("StableService", 10).unwrap().items.len(), 1);
}

#[test]
fn an_existing_control_without_its_publication_row_cannot_invent_a_legacy_pointer() {
    let temp = temp_dir::TestDir::new("catalog-missing-publication-row");
    let database = temp.path().join("symbols-v2.sqlite3");
    let mut index = WorkspaceIndex::with_store(CatalogStore::open(&database, IDENTITY).unwrap());
    populate(&mut index);
    drop(index);
    let control = rusqlite::Connection::open(temp.path().join("catalog-state.sqlite3")).unwrap();
    control.execute("DELETE FROM catalog_state", []).unwrap();
    assert!(CatalogStore::open(&database, IDENTITY).is_err());
    let rows: i64 = control
        .query_row("SELECT count(*) FROM catalog_state", [], |r| r.get(0))
        .unwrap();
    assert_eq!(rows, 0);
}
