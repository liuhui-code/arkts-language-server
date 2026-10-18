use std::path::Path;

use arkts_index_core::{
    Document, DocumentSymbols, MemoryStore, Position, ReferenceCandidateQuery, WorkspaceIndex,
    parse_document_symbols,
};
use arkts_index_sqlite::SqliteStore;

#[path = "support/temp_dir.rs"]
mod temp_dir;

const ROOT: &str = "file:///catalog-reset-contract";
const TARGET: &str = "file:///catalog-reset-contract/Target.ets";
const CONSUMER: &str = "file:///catalog-reset-contract/Consumer.ets";

fn sources(generation: u64) -> Vec<Document> {
    let name = if generation == 1 {
        "LegacyMarker"
    } else {
        "CurrentMarker"
    };
    vec![
        Document::new(
            TARGET,
            format!("export class {name} {{ member: number = 1 }}\n"),
        ),
        Document::new(
            CONSUMER,
            format!("import {{ {name} as LocalAlias }} from './Target'\nnew LocalAlias()\n"),
        ),
    ]
}

fn parsed(generation: u64) -> Vec<DocumentSymbols> {
    sources(generation)
        .iter()
        .map(|document| parse_document_symbols(document).unwrap())
        .collect()
}

fn assert_public_parity(database: &Path, generation: u64) {
    let mut expected = WorkspaceIndex::with_store(MemoryStore::default());
    expected
        .activate_catalog(generation, parsed(generation), vec![])
        .unwrap();
    let actual = WorkspaceIndex::with_store(SqliteStore::open(database, ROOT).unwrap());
    for query in [
        "LegacyMarker",
        "CurrentMarker",
        "Marker",
        "member",
        "LocalAlias",
    ] {
        assert_eq!(
            actual.search(query, 32).unwrap(),
            expected.search(query, 32).unwrap()
        );
        assert_eq!(
            actual.search_exports(query, 32).unwrap(),
            expected.search_exports(query, 32).unwrap()
        );
    }
    let query = ReferenceCandidateQuery {
        declaration_uri: TARGET.into(),
        declaration_position: Position::new(0, 14),
        limit: 32,
    };
    assert_eq!(
        actual.search_reference_candidates(query.clone()).unwrap(),
        expected.search_reference_candidates(query).unwrap()
    );
}

#[test]
fn full_replacement_keeps_incremental_delete_triggers_and_all_public_queries() {
    let directory = temp_dir::TestDir::new("catalog-reset-refresh");
    let database = directory.path().join("catalog.sqlite3");
    for generation in [1, 2] {
        let mut index = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
        index
            .activate_catalog(generation, parsed(generation), vec![])
            .unwrap();
        drop(index);
        assert_public_parity(&database, generation);
    }
    let mut index = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    index
        .refresh(
            3,
            [Document::new(TARGET, "export class IncrementalMarker {}\n")],
            &[CONSUMER],
        )
        .unwrap();
    assert!(index.search("CurrentMarker", 32).unwrap().items.is_empty());
    assert!(index.search("LocalAlias", 32).unwrap().items.is_empty());
    assert_eq!(
        index.search("IncrementalMarker", 32).unwrap().items.len(),
        1
    );
    index.refresh(4, [], &[TARGET]).unwrap();
    assert!(index.search("Marker", 32).unwrap().items.is_empty());
    drop(index);
    let reopened = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    assert_eq!(reopened.search("Marker", 32).unwrap().served_generation, 4);
    assert!(reopened.search("Marker", 32).unwrap().items.is_empty());
}

#[test]
fn late_full_replacement_failure_restores_old_queries_and_incremental_triggers() {
    let directory = temp_dir::TestDir::new("catalog-reset-rollback");
    let database = directory.path().join("catalog.sqlite3");
    let mut index = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    index.activate_catalog(1, parsed(1), vec![]).unwrap();
    drop(index);
    // Real SQLite boundary failure after the old content/FTS reset and new rows.
    rusqlite::Connection::open(&database)
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER test_late_failure BEFORE INSERT ON reference_bindings \
         BEGIN SELECT RAISE(ABORT, 'late replacement failure'); END;",
        )
        .unwrap();
    let mut index = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    assert!(index.activate_catalog(2, parsed(2), vec![]).is_err());
    drop(index);
    assert_public_parity(&database, 1);
    rusqlite::Connection::open(&database)
        .unwrap()
        .execute_batch("DROP TRIGGER test_late_failure")
        .unwrap();
    let mut index = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    index
        .refresh(
            3,
            [Document::new(TARGET, "export class RecoveredMarker {}\n")],
            &[CONSUMER],
        )
        .unwrap();
    assert!(index.search("LegacyMarker", 32).unwrap().items.is_empty());
    assert_eq!(index.search("RecoveredMarker", 32).unwrap().items.len(), 1);
    drop(index);
    let reopened = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    assert!(
        reopened
            .search("LegacyMarker", 32)
            .unwrap()
            .items
            .is_empty()
    );
    assert_eq!(
        reopened.search("RecoveredMarker", 32).unwrap().items.len(),
        1
    );
}
