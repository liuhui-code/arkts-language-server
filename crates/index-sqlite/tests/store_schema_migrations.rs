use arkts_index_core::{Document, Position, ReferenceCandidateQuery, WorkspaceIndex};
use arkts_index_sqlite::SqliteStore;
use rusqlite::Connection;

#[path = "support/temp_dir.rs"]
mod temp_dir;
use temp_dir::TestDir;

#[test]
fn version_eight_database_migrates_reference_export_names_in_place() {
    let temp = TestDir::new("v8-reference-export-name-migration");
    let database = temp.path().join("symbols-v8.sqlite3");
    let mut index = WorkspaceIndex::with_store(
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open"),
    );
    index
        .refresh(
            1,
            [Document::new(
                "file:///workspace/Target.ets",
                "export class Thing {}\n",
            )],
            &[],
        )
        .expect("generation one should commit");
    drop(index);

    let legacy = Connection::open(&database).expect("database should open directly");
    legacy
        .execute_batch(
            "ALTER TABLE documents DROP COLUMN class_bindings_source_supported; \
             ALTER TABLE class_heritage_declarations DROP COLUMN is_direct_export; \
             DROP INDEX exports_reference_export_name; \
             ALTER TABLE exports DROP COLUMN reference_export_name; \
             PRAGMA user_version = 8;",
        )
        .expect("test fixture should emulate schema version eight");
    drop(legacy);

    let reopened =
        SqliteStore::open(&database, "file:///workspace").expect("version eight should migrate");
    let result = WorkspaceIndex::with_store(reopened)
        .search_reference_candidates(ReferenceCandidateQuery {
            declaration_uri: "file:///workspace/Target.ets".to_owned(),
            declaration_position: Position::new(0, 14),
            limit: 20,
        })
        .expect("migrated named export should remain searchable");
    assert!(result.supported);
    assert_eq!(result.identity_uris, ["file:///workspace/Target.ets"]);

    let migrated = Connection::open(&database).expect("migrated database should reopen");
    let version: i64 = migrated
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .expect("schema version should be readable");
    let reference_export_name: String = migrated
        .query_row(
            "SELECT reference_export_name FROM exports WHERE exported_name = 'Thing'",
            [],
            |row| row.get(0),
        )
        .expect("reference export name should migrate");
    assert_eq!(version, 11);
    assert_eq!(reference_export_name, "Thing");
}

#[test]
fn version_two_database_migrates_in_place_without_losing_committed_symbols() {
    let temp = TestDir::new("v2-migration");
    let database = temp.path().join("symbols-v2.sqlite3");
    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open");
    WorkspaceIndex::with_store(store)
        .refresh(
            1,
            [Document::new(
                "file:///workspace/Existing.ets",
                "class ExistingSymbol {}\n",
            )],
            &[],
        )
        .expect("generation one should commit");

    let legacy = Connection::open(&database).expect("database should open directly");
    legacy
        .execute_batch(
            "ALTER TABLE documents DROP COLUMN class_bindings_source_supported; \
             ALTER TABLE class_heritage_declarations DROP COLUMN is_direct_export; \
             DROP TABLE reference_bindings; \
             DROP TABLE reference_occurrence_identities; \
             DROP TABLE reference_aliases; \
             DROP TABLE reference_occurrences; \
             DROP TABLE exports; \
             PRAGMA user_version = 2;",
        )
        .expect("test fixture should emulate the previous schema");
    drop(legacy);

    let store = SqliteStore::open(&database, "file:///workspace")
        .expect("version two database should migrate in place");
    let mut index = WorkspaceIndex::with_store(store);
    assert_eq!(
        index
            .search("ExistingSymbol", 20)
            .expect("existing symbols should survive migration")
            .items
            .len(),
        1
    );
    index
        .refresh(
            2,
            [Document::new(
                "file:///workspace/NewExport.ets",
                "export class NewExport {}\n",
            )],
            &[],
        )
        .expect("migrated database should accept exports");
    assert_eq!(
        index
            .search_exports("NewExport", 20)
            .expect("new export should be searchable")
            .items
            .len(),
        1
    );

    let migrated = Connection::open(&database).expect("migrated database should reopen");
    let version: i64 = migrated
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .expect("schema version should be readable");
    assert_eq!(version, 11);
}
