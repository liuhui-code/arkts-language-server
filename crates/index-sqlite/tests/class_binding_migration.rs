use std::{
    path::Path,
    sync::{Arc, Barrier},
    thread,
    time::Duration,
};

use arkts_index_core::{
    Document, MemoryStore, Position, ReferenceCandidateQuery, WorkspaceIndex,
    parse_document_symbols,
};
use arkts_index_sqlite::SqliteStore;
use rusqlite::Connection;

#[path = "support/temp_dir.rs"]
mod temp_dir;
use temp_dir::TestDir;

const ROOT: &str = "file:///binding-migration";
const BASE: &str = "file:///binding-migration/Base.ets";
const CHILD: &str = "file:///binding-migration/Child.ets";

fn sources() -> [Document; 2] {
    [
        Document::new(BASE, "export class Base {}\n"),
        Document::new(
            CHILD,
            "import { Base } from './Base'\nexport class Child extends Base {}\n",
        ),
    ]
}

fn drop_column_if_present(connection: &Connection, table: &str, column: &str) {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .unwrap();
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    drop(statement);
    if columns.iter().any(|name| name == column) {
        connection
            .execute_batch(&format!("ALTER TABLE {table} DROP COLUMN {column};"))
            .unwrap();
    }
}

fn legacy_fixture(database: &Path) {
    let mut index = WorkspaceIndex::with_store(SqliteStore::open(database, ROOT).unwrap());
    index.refresh(4, sources(), &[]).unwrap();
    drop(index);
    // Preserve the old binding rows while constructing the actual previous format.
    let legacy = Connection::open(database).unwrap();
    let binding_rows: i64 = legacy
        .query_row("SELECT COUNT(*) FROM reference_bindings", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(binding_rows, 1);
    drop_column_if_present(&legacy, "documents", "class_bindings_source_supported");
    drop_column_if_present(&legacy, "class_heritage_declarations", "is_direct_export");
    let version = if cfg!(feature = "experimental-occurrence-without-rowid") {
        110
    } else {
        10
    };
    legacy.pragma_update(None, "user_version", version).unwrap();
}

#[test]
fn legacy_class_binding_rows_migrate_without_claiming_source_provenance() {
    let temp = TestDir::new("class-binding-migration");
    let database = temp.path().join("index.sqlite3");
    legacy_fixture(&database);
    let index = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    let symbols = index.search("Child", 10).unwrap();
    assert_eq!(symbols.served_generation, 4);
    assert_eq!(symbols.items.len(), 1);
    let exports = index.search_exports("Child", 10).unwrap();
    assert_eq!(exports.served_generation, 4);
    assert_eq!(exports.items.len(), 1);
    let references = index
        .search_reference_candidates(ReferenceCandidateQuery {
            declaration_uri: BASE.to_owned(),
            declaration_position: Position::new(0, 14),
            limit: 10,
        })
        .unwrap();
    assert_eq!(references.served_generation, 4);
    assert!(references.supported);
    assert_eq!(references.bindings.len(), 1);
    assert_eq!(references.bindings[0].uri, CHILD);
    assert_eq!(references.bindings[0].source_specifier, "./Base");
    let heritage = index.class_heritage(CHILD).unwrap();
    assert_eq!(heritage.served_generation, 4);
    assert_eq!(heritage.facts.as_ref().unwrap().classes[0].name, "Child");
    let migrated = Connection::open(&database).unwrap();
    let version: i64 = migrated
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    let expected = if cfg!(feature = "experimental-occurrence-without-rowid") {
        111
    } else {
        11
    };
    assert_eq!(version, expected);

    let uris = [
        CHILD.to_owned(),
        BASE.to_owned(),
        format!("{ROOT}/Missing.ets"),
    ];
    let snapshot = index.class_binding_snapshot(&uris).unwrap();
    assert_eq!(snapshot.served_generation, 4);
    assert_eq!(snapshot.documents.len(), 3);
    assert_eq!(snapshot.documents[0].heritage, heritage.facts);
    assert!(snapshot.documents[1].heritage.is_some());
    assert!(snapshot.documents[2].heritage.is_none());
    for (observed, requested) in snapshot.documents.iter().zip(&uris) {
        assert_eq!(&observed.uri, requested);
        assert!(observed.binding_provenance.is_none());
        assert!(observed.bindings.is_empty());
    }

    let legacy_documents = sources()
        .iter()
        .map(|source| {
            let mut parsed = parse_document_symbols(source).unwrap();
            parsed.class_binding_provenance = None;
            parsed
        })
        .collect();
    let mut memory = WorkspaceIndex::with_store(MemoryStore::default());
    memory
        .activate_catalog(4, legacy_documents, vec![])
        .unwrap();
    assert_eq!(memory.class_binding_snapshot(&uris).unwrap(), snapshot);
    drop(index);
    let reopened = WorkspaceIndex::with_store(SqliteStore::open(database, ROOT).unwrap());
    assert_eq!(reopened.class_binding_snapshot(&uris).unwrap(), snapshot);
}

#[test]
fn simultaneous_legacy_binding_cache_opens_migrate_and_read_the_same_generation() {
    let temp = TestDir::new("class-binding-concurrent-migration");
    for attempt in 0..4 {
        let database = temp.path().join(format!("index-{attempt}.sqlite3"));
        legacy_fixture(&database);
        // Both opens may inspect the legacy format while queued behind the writer.
        let writer = Connection::open(&database).unwrap();
        writer.execute_batch("BEGIN IMMEDIATE").unwrap();
        let ready = Arc::new(Barrier::new(3));
        let readers: Vec<_> = (0..2)
            .map(|_| {
                let database = database.clone();
                let ready = ready.clone();
                thread::spawn(move || {
                    ready.wait();
                    let index =
                        WorkspaceIndex::with_store(SqliteStore::open(database, ROOT).unwrap());
                    index.class_binding_snapshot(&[CHILD.to_owned(), BASE.to_owned()])
                })
            })
            .collect();
        ready.wait();
        thread::sleep(Duration::from_millis(100));
        writer.execute_batch("COMMIT").unwrap();
        let snapshots: Vec<_> = readers
            .into_iter()
            .map(|reader| {
                reader
                    .join()
                    .unwrap()
                    .expect("both queued opens must read the migrated snapshot")
            })
            .collect();
        assert_eq!(snapshots[0], snapshots[1]);
        for snapshot in snapshots {
            assert_eq!(snapshot.served_generation, 4);
            assert_eq!(snapshot.documents.len(), 2);
            for document in snapshot.documents {
                assert!(document.heritage.is_some());
                assert!(document.binding_provenance.is_none());
                assert!(document.bindings.is_empty());
            }
        }
        let version: i64 = writer
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        let expected = if cfg!(feature = "experimental-occurrence-without-rowid") {
            111
        } else {
            11
        };
        assert_eq!(version, expected);
    }
}
