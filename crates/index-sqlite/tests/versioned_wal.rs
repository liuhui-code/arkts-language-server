use arkts_index_core::{Document, parse_document_symbols};
use arkts_index_sqlite::VersionedFacts;
use sha2::{Digest, Sha256};
#[path = "support/temp_dir.rs"]
mod temp_dir;
#[test]
fn old_sqlite_read_snapshot_survives_gc_and_passive_checkpoint_reports_pinned_frames() {
    let temp = temp_dir::TestDir::new("versioned-wal-reader");
    let path = temp.path().join("facts.sqlite3");
    let uri = "file:///workspace/A.ets";
    let mut facts = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let put = |facts: &mut VersionedFacts, id: &str, text: &str, head: u64| {
        let doc = parse_document_symbols(&Document::new(uri, text)).unwrap();
        facts
            .write_version(id, &format!("{:x}", Sha256::digest(text.as_bytes())), &doc)
            .unwrap();
        facts.stage_group(id, &[(uri.into(), id.into())]).unwrap();
        facts.publish_group(id, head).unwrap();
    };
    put(&mut facts, "old", "export class Before {}", 0);
    // Deliberately independent SQLite consumer: physical WAL snapshot and
    // integrity checks, not an alternate implementation of product query logic.
    let reader = rusqlite::Connection::open(&path).unwrap();
    reader.execute_batch("BEGIN").unwrap();
    let head: i64 = reader
        .query_row("SELECT head FROM manifest_identity WHERE id=1", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(head, 1);
    put(&mut facts, "new", "export class After {}", 1);
    facts.release_version("old").unwrap();
    for _ in 0..8 {
        facts.collect_garbage(4096).unwrap();
    }
    assert_eq!(facts.read_version("old").unwrap(), None);
    assert_eq!(facts.search("After", 10).unwrap().items.len(), 1);
    let old_name:String=reader.query_row("SELECT name FROM v_symbols s JOIN current_file_versions c ON c.version=s.version WHERE c.uri=?1 AND c.kind='accepted'",[uri],|r|r.get(0)).unwrap();
    assert_eq!(old_name, "Before");
    let held = facts.checkpoint_passive().unwrap();
    assert!(held.log_frames.unwrap() > held.checkpointed_frames.unwrap());
    reader.execute_batch("COMMIT").unwrap();
    drop(reader);
    let released = facts.checkpoint_passive().unwrap();
    assert_eq!(released.log_frames, released.checkpointed_frames);
    let db = rusqlite::Connection::open(&path).unwrap();
    assert_eq!(
        db.query_row::<String, _, _>("PRAGMA integrity_check", [], |r| r.get(0))
            .unwrap(),
        "ok"
    );
    let fks: i64 = db
        .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(fks, 0);
    println!(
        "wal: sqlite={}; held={held:?}; released={released:?}",
        rusqlite::version()
    );
}
