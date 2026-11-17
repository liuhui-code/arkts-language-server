//! Public API: reuse lock slots without losing live facts or committed replay.
use arkts_index_core::{Document, SymbolStore, parse_document_symbols};
use arkts_index_sqlite::VersionedFacts;
use sha2::{Digest, Sha256};
#[path = "support/temp_dir.rs"]
mod temp_dir;

#[test]
fn committed_replay_does_not_pin_obsolete_owner_lifetimes_after_fact_collection() {
    let temp = temp_dir::TestDir::new("owner-slot-replay");
    let path = temp.path().join("facts.sqlite3");
    let uri = "file:///owner-slot-replay/A.ets";
    let mut collector = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let held = VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap();
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
    assert_eq!(
        live, 2,
        "collector and independently held reader stay protected"
    );
    assert_eq!(
        held.visible_document(uri).unwrap(),
        Some(parse_document_symbols(&Document::new(uri, "export class Generation15 {}")).unwrap())
    );
    println!("committed-owner-control owners={owners} live={live} currentHead=16 firstReplay=1");
    assert!(
        owners <= 3,
        "obsolete committed replay must not pin every dead ownership incarnation; two live leases and one current fact creator justify at most three rows"
    );
    let locks = std::fs::read_dir(path.with_file_name("facts.sqlite3.owners"))
        .unwrap()
        .count();
    println!("replay-control lock_paths={locks} head=16 firstReplay=1 oldFactsCollected=true");
    assert!(
        locks <= 3,
        "lock namespace must depend on actual concurrent leases, not publications"
    );
}
