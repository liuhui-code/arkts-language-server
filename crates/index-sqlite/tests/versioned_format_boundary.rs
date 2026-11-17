use arkts_index_sqlite::VersionedFacts;
#[path = "support/temp_dir.rs"]
mod temp_dir;
#[test]
fn incompatible_file_version_format_is_rejected_before_registering_an_owner() {
    let temp = temp_dir::TestDir::new("versioned-format-boundary");
    let path = temp.path().join("facts.sqlite3");
    drop(VersionedFacts::create(&path, "workspace", "store", "domain").unwrap());
    let db = rusqlite::Connection::open(&path).unwrap();
    // Deliberate compatibility fixture, not a product migration: an unknown
    // newer component format must not receive any owner registration writes.
    db.execute_batch("PRAGMA ignore_check_constraints=ON; UPDATE file_facts_format SET version=999; PRAGMA ignore_check_constraints=OFF;").unwrap();
    let before: i64 = db
        .query_row("SELECT count(*) FROM manifest_owners", [], |r| r.get(0))
        .unwrap();
    drop(db);
    assert!(VersionedFacts::open_existing(&path, "workspace", "store", "domain").is_err());
    let db = rusqlite::Connection::open(&path).unwrap();
    let after: i64 = db
        .query_row("SELECT count(*) FROM manifest_owners", [], |r| r.get(0))
        .unwrap();
    assert_eq!(after, before, "an unsupported layout must remain untouched");
}

#[test]
fn occurrence_table_uses_the_actual_selected_physical_profile() {
    let temp = temp_dir::TestDir::new("versioned-physical-profile");
    let path = temp.path().join("facts.sqlite3");
    drop(VersionedFacts::create(&path, "workspace", "store", "domain").unwrap());
    let db = rusqlite::Connection::open(&path).unwrap();
    let without_rowid: bool = db
        .query_row(
            "SELECT wr FROM pragma_table_list WHERE schema='main' AND name='v_occurrences'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        without_rowid,
        cfg!(feature = "experimental-occurrence-without-rowid")
    );
}

#[test]
fn matching_format_tag_with_wrong_physical_layout_is_rejected_before_owner_registration() {
    let temp = temp_dir::TestDir::new("versioned-profile-mismatch");
    let path = temp.path().join("facts.sqlite3");
    drop(VersionedFacts::create(&path, "workspace", "store", "domain").unwrap());
    let db = rusqlite::Connection::open(&path).unwrap();
    let mut sql: String = db
        .query_row(
            "SELECT sql FROM sqlite_schema WHERE type='table' AND name='v_occurrences'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    if cfg!(feature = "experimental-occurrence-without-rowid") {
        sql = sql
            .trim_end()
            .strip_suffix(" WITHOUT ROWID")
            .unwrap()
            .into();
    } else {
        sql.push_str(" WITHOUT ROWID");
    }
    // Isolated incompatible-schema fixture: retain the format tag but replace
    // this empty table with the other physical layout. No real cache is edited.
    db.execute_batch("ALTER TABLE v_occurrences RENAME TO incompatible_occurrences")
        .unwrap();
    db.execute_batch(&sql).unwrap();
    let before: i64 = db
        .query_row("SELECT count(*) FROM manifest_owners", [], |r| r.get(0))
        .unwrap();
    drop(db);
    let error = VersionedFacts::open_existing(&path, "workspace", "store", "domain")
        .err()
        .expect("a matching tag must not bypass physical-layout validation");
    assert!(
        error.to_string().contains("occurrence layout mismatch"),
        "{error}"
    );
    let db = rusqlite::Connection::open(&path).unwrap();
    let after: i64 = db
        .query_row("SELECT count(*) FROM manifest_owners", [], |r| r.get(0))
        .unwrap();
    assert_eq!(after, before);
}
