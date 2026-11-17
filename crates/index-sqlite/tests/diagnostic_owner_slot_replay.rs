//! Public API: reuse lock slots without losing live facts or committed replay.
use arkts_index_core::{Document, SymbolStore, parse_document_symbols};
use arkts_index_sqlite::VersionedFacts;
use sha2::{Digest, Sha256};
#[path = "support/temp_dir.rs"]
mod temp_dir;

#[test]
fn reused_slots_preserve_current_facts_and_lost_ack_replay_after_old_facts_gc() {
    let temp = temp_dir::TestDir::new("owner-slot-replay");
    let path = temp.path().join("facts.sqlite3");
    let uri = "file:///owner-slot-replay/A.ets";
    let mut collector = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    for n in 0..16 {
        let mut task =
            VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap();
        let text = format!("export class Generation{n} {{}}");
        let doc = parse_document_symbols(&Document::new(uri, text.clone())).unwrap();
        task.write_version(
            &format!("v{n}"),
            &format!("{:x}", Sha256::digest(text.as_bytes())),
            &doc,
        )
        .unwrap();
        task.stage_group(&format!("g{n}"), &[(uri.into(), format!("v{n}"))])
            .unwrap();
        assert_eq!(task.publish_group(&format!("g{n}"), n).unwrap(), n + 1);
    }
    for _ in 0..128 {
        collector.collect_garbage(16).unwrap();
    }
    assert!(collector.read_version("v0").unwrap().is_none());
    let expected =
        parse_document_symbols(&Document::new(uri, "export class Generation15 {}")).unwrap();
    assert_eq!(collector.visible_document(uri).unwrap(), Some(expected));
    assert_eq!(
        collector.publish_group("g0", 0).unwrap(),
        1,
        "lost ACK replays its original committed head"
    );
    assert_eq!(
        collector.metadata().unwrap().committed_generation,
        16,
        "replay must not roll back current head"
    );
    let db =
        rusqlite::Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .unwrap();
    let actual_format: i64 = db
        .query_row("SELECT version FROM file_facts_format", [], |r| r.get(0))
        .unwrap();
    println!("compiled-format-observation={actual_format}");
    let groups: i64 = db
        .query_row("SELECT count(*) FROM manifest_groups", [], |r| r.get(0))
        .unwrap();
    assert_eq!(
        groups, 16,
        "this test deliberately retains replay receipts, not unreferenced-owner rows"
    );
    let locks = std::fs::read_dir(path.with_file_name("facts.sqlite3.owners"))
        .unwrap()
        .count();
    println!(
        "replay-control groups={groups} lock_paths={locks} head=16 firstReplay=1 oldFactsCollected=true"
    );
    assert!(
        locks <= 2,
        "lock namespace must depend on actual concurrent leases, not publications"
    );
}
