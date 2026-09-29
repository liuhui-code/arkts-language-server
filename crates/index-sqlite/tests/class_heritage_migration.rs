use arkts_index_core::{Document, SymbolStore, WorkspaceIndex};
use arkts_index_sqlite::SqliteStore;
use rusqlite::Connection;
use std::{
    path::Path,
    sync::{Arc, Barrier},
    thread,
    time::Duration,
};

#[path = "support/temp_dir.rs"]
mod temp_dir;
use temp_dir::TestDir;

const ROOT: &str = "file:///heritage-migration";
const CHILD: &str = "file:///heritage-migration/Child.ets";

fn legacy_fixture(database: &Path) {
    let mut index = WorkspaceIndex::with_store(SqliteStore::open(database, ROOT).unwrap());
    index
        .refresh(
            4,
            [Document::new(CHILD, "export class Child extends Base {}\n")],
            &[],
        )
        .unwrap();
    drop(index);
    // Construct the old on-disk format, not a private semantic result oracle.
    let legacy = Connection::open(database).unwrap();
    legacy
        .execute_batch(
            "DROP TABLE class_heritage_declarations; \
             ALTER TABLE documents DROP COLUMN heritage_lexically_complete; \
             ALTER TABLE documents DROP COLUMN class_bindings_source_supported;",
        )
        .unwrap();
    let version = if cfg!(feature = "experimental-occurrence-without-rowid") {
        109
    } else {
        9
    };
    legacy.pragma_update(None, "user_version", version).unwrap();
}

#[test]
fn migrated_legacy_documents_remain_unknown_until_refreshed_without_losing_symbols() {
    let temp = TestDir::new("heritage-migration");
    let database = temp.path().join("index.sqlite3");
    legacy_fixture(&database);
    let mut index = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    let unknown = index.class_heritage(CHILD).unwrap();
    assert_eq!(unknown.served_generation, 4);
    assert!(
        unknown.facts.is_none(),
        "old absent facts are not known-empty"
    );
    assert_eq!(index.search("Child", 10).unwrap().items.len(), 1);
    assert_eq!(index.search_exports("Child", 10).unwrap().items.len(), 1);
    index
        .refresh(
            5,
            [Document::new(CHILD, "export class Child extends Base {}\n")],
            &[],
        )
        .unwrap();
    let observed = index.class_heritage(CHILD).unwrap();
    assert_eq!(observed.served_generation, 5);
    assert!(observed.facts.as_ref().unwrap().lexically_complete);
    drop(index);
    let reopened = WorkspaceIndex::with_store(SqliteStore::open(database, ROOT).unwrap());
    assert_eq!(reopened.class_heritage(CHILD).unwrap(), observed);
}

#[test]
fn simultaneous_legacy_cache_opens_can_both_migrate_and_read_the_same_generation() {
    let temp = TestDir::new("heritage-concurrent-migration");
    for attempt in 0..4 {
        let database = temp.path().join(format!("index-{attempt}.sqlite3"));
        legacy_fixture(&database);
        // A legitimate concurrent writer holds migration's write lock. Both
        // readers may inspect the old format before they can acquire it.
        let writer = Connection::open(&database).unwrap();
        writer.execute_batch("BEGIN IMMEDIATE").unwrap();
        let ready = Arc::new(Barrier::new(3));
        let readers: Vec<_> = (0..2)
            .map(|_| {
                let database = database.clone();
                let ready = ready.clone();
                thread::spawn(move || {
                    ready.wait();
                    SqliteStore::open(database, ROOT).and_then(|store| store.class_heritage(CHILD))
                })
            })
            .collect();
        ready.wait();
        thread::sleep(Duration::from_millis(100));
        writer.execute_batch("COMMIT").unwrap();
        let results: Vec<_> = readers
            .into_iter()
            .map(|reader| reader.join().unwrap())
            .collect();
        for result in results {
            let found =
                result.expect("both queued opens must succeed, not duplicate a migrated column");
            assert_eq!(found.served_generation, 4);
            assert!(found.facts.is_none());
        }
    }
}
