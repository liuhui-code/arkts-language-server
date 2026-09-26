use std::{
    fs,
    time::{SystemTime, UNIX_EPOCH},
};

use arkts_index_core::StoreErrorKind;
use arkts_index_sqlite::SqliteStore;
use rusqlite::Connection;

#[test]
fn incompatible_layout_is_rejected_without_migrating_the_database() {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let directory = std::env::temp_dir().join(format!(
        "arkts-layout-boundary-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir_all(&directory).unwrap();
    let path = directory.join("index.sqlite3");
    let incompatible_version = if cfg!(feature = "experimental-occurrence-without-rowid") {
        9
    } else {
        109
    };
    // Fixture represents a foreign storage profile, not a private query oracle.
    let connection = Connection::open(&path).unwrap();
    connection
        .pragma_update(None, "application_id", 0x4152_4B49_i64)
        .unwrap();
    connection
        .pragma_update(None, "user_version", incompatible_version)
        .unwrap();
    drop(connection);
    let error = match SqliteStore::open(&path, "file:///layout-boundary") {
        Ok(_) => panic!("different storage profiles must never share a cache"),
        Err(error) => error,
    };
    assert_eq!(error.kind(), StoreErrorKind::Incompatible);
    let connection = Connection::open(&path).unwrap();
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, incompatible_version);
    drop(connection);
    fs::remove_dir_all(directory).unwrap();
}
