//! Isolated public-storage RED; no published receipts or fact references exist.
use arkts_index_sqlite::VersionedFacts;
use rusqlite::Connection;
#[path = "support/temp_dir.rs"]
mod temp_dir;

#[test]
fn serial_closed_connections_do_not_accumulate_unreferenced_owner_metadata() {
    let temp = temp_dir::TestDir::new("owner-metadata-retention-control");
    let path = temp.path().join("facts.sqlite3");
    let mut collector = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let held = VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap();
    for _ in 0..64 {
        drop(VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap());
    }
    for _ in 0..256 {
        collector.collect_garbage(4).unwrap();
    }
    let db =
        Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
    let owners: i64 = db
        .query_row("SELECT count(*) FROM manifest_owners", [], |r| r.get(0))
        .unwrap();
    let live: i64 = db
        .query_row(
            "SELECT count(*) FROM manifest_owners WHERE state='live'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let groups: i64 = db
        .query_row("SELECT count(*) FROM manifest_groups", [], |r| r.get(0))
        .unwrap();
    let versions: i64 = db
        .query_row("SELECT count(*) FROM file_versions", [], |r| r.get(0))
        .unwrap();
    let locks = std::fs::read_dir(path.with_file_name("facts.sqlite3.owners"))
        .unwrap()
        .count();
    println!(
        "owner-control owners={owners} live={live} groups={groups} versions={versions} lock_paths={locks}"
    );
    assert_eq!(groups, 0, "no publication receipt justifies this history");
    assert_eq!(versions, 0, "no creator FK justifies this history");
    assert_eq!(live, 2, "collector and held connection remain protected");
    assert_eq!(held.visible_document("file:///absent.ets").unwrap(), None);
    assert_eq!(
        owners, live,
        "fully unreferenced closed owners should be reclaimable"
    );
    assert!(
        locks <= 3,
        "lock namespace should depend on live/referenced leases, not serial opens"
    );
}
