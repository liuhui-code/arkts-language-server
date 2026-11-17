//! Public storage boundaries for separating receipts from resource lifetimes.
use arkts_index_core::{Document, DocumentSymbols, SymbolStore, parse_document_symbols};
use arkts_index_sqlite::{CatalogInputs, VersionedFacts};
use rusqlite::Connection;
#[path = "support/temp_dir.rs"]
mod temp_dir;
const URI: &str = "file:///terminal-owner/A.ets";
fn publish(facts: &mut VersionedFacts, n: u64) -> DocumentSymbols {
    let text = format!("export class Tiny{n} {{}}");
    let document = parse_document_symbols(&Document::new(URI, &text)).unwrap();
    let digest = CatalogInputs::source_digest(&text)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    facts
        .write_version(&format!("v{n}"), &digest, &document)
        .unwrap();
    facts
        .stage_group(&format!("g{n}"), &[(URI.into(), format!("v{n}"))])
        .unwrap();
    assert_eq!(facts.publish_group(&format!("g{n}"), n).unwrap(), n + 1);
    document
}
fn open(path: &std::path::Path) -> VersionedFacts {
    VersionedFacts::open_existing(path, "workspace", "store", "domain").unwrap()
}
fn resource_owner(db: &Connection, group: &str) -> Option<String> {
    let split: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM pragma_table_info('manifest_groups') WHERE name='resource_owner')", [], |r|r.get(0)).unwrap();
    let sql = if split {
        "SELECT resource_owner FROM manifest_groups WHERE id=?1"
    } else {
        "SELECT owner FROM manifest_groups WHERE id=?1"
    };
    db.query_row(sql, [group], |r| r.get(0)).unwrap()
}
#[test]
fn one_item_gc_budget_still_releases_terminal_owners_and_preserves_replay() {
    let temp = temp_dir::TestDir::new("terminal-owner-budget-one");
    let path = temp.path().join("facts.sqlite3");
    let mut collector = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let mut last = None;
    for n in 0..8 {
        last = Some(publish(&mut open(&path), n));
    }
    for _ in 0..1024 {
        let report = collector.collect_garbage(1).unwrap();
        assert!(
            report.work_items <= 1,
            "logical GC budget exceeded: {report:?}"
        );
    }
    assert_eq!(collector.visible_document(URI).unwrap(), last);
    assert!(collector.read_version("v0").unwrap().is_none());
    assert_eq!(collector.publish_group("g0", 0).unwrap(), 1);
    assert_eq!(collector.metadata().unwrap().committed_generation, 8);
    let db = Connection::open(&path).unwrap();
    let count: i64 = db
        .query_row("SELECT count(*) FROM manifest_owners", [], |r| r.get(0))
        .unwrap();
    assert!(
        count <= 2,
        "only collector and current fact creator justify owners, got {count}"
    );
}
#[test]
fn live_owner_and_committed_receipt_identity_stay_immutable() {
    let temp = temp_dir::TestDir::new("terminal-owner-live-guard");
    let path = temp.path().join("facts.sqlite3");
    let mut collector = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let mut writer = open(&path);
    publish(&mut writer, 0);
    let current = publish(&mut writer, 1);
    for _ in 0..128 {
        collector.collect_garbage(16).unwrap();
    }
    let db = Connection::open(&path).unwrap();
    assert!(resource_owner(&db, "g0").is_some());
    assert!(
        db.execute(
            "UPDATE manifest_groups SET resource_owner=NULL WHERE id='g0'",
            []
        )
        .is_err(),
        "a live owner is not releasable"
    );
    drop(writer);
    for _ in 0..128 {
        collector.collect_garbage(16).unwrap();
    }
    assert_eq!(resource_owner(&db, "g0"), None);
    for sql in [
        "UPDATE manifest_groups SET id='replacement' WHERE id='g0'",
        "UPDATE manifest_groups SET state='abandoned' WHERE id='g0'",
        "UPDATE manifest_groups SET commit_seq=99 WHERE id='g0'",
        "UPDATE manifest_groups SET owner=(SELECT id FROM manifest_owners WHERE state='live' LIMIT 1) WHERE id='g0'",
        "UPDATE manifest_groups SET resource_owner=(SELECT id FROM manifest_owners WHERE state='live' LIMIT 1) WHERE id='g0'",
    ] {
        assert!(
            db.execute(sql, []).is_err(),
            "receipt rewrite was allowed: {sql}"
        );
    }
    assert_eq!(collector.publish_group("g0", 0).unwrap(), 1);
    assert_eq!(collector.metadata().unwrap().committed_generation, 2);
    assert_eq!(collector.visible_document(URI).unwrap(), Some(current));
}
#[test]
fn failed_owner_delete_rolls_back_detachment_and_fact_gc_then_retry_succeeds() {
    let temp = temp_dir::TestDir::new("terminal-owner-rollback");
    let path = temp.path().join("facts.sqlite3");
    let mut collector = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    publish(&mut open(&path), 0);
    let current = publish(&mut open(&path), 1);
    let db = Connection::open(&path).unwrap();
    let before = resource_owner(&db, "g0");
    assert!(before.is_some());
    // SQL fault injection on this fixture only: exercise the real API's RAII
    // rollback after it attempted fact GC and terminal-owner detachment.
    db.execute_batch("CREATE TRIGGER deny_owner_delete BEFORE DELETE ON manifest_owners BEGIN SELECT RAISE(ABORT,'controlled owner delete failure'); END;").unwrap();
    let error = collector.collect_garbage(64).unwrap_err();
    assert!(
        error
            .to_string()
            .contains("controlled owner delete failure"),
        "{error}"
    );
    assert_eq!(
        resource_owner(&db, "g0"),
        before,
        "failed quantum leaked its detachment"
    );
    assert!(
        collector.read_version("v0").unwrap().is_some(),
        "failed quantum leaked fact deletion"
    );
    assert_eq!(
        collector.visible_document(URI).unwrap(),
        Some(current.clone())
    );
    assert_eq!(collector.publish_group("g0", 0).unwrap(), 1);
    db.execute_batch("DROP TRIGGER deny_owner_delete").unwrap();
    for _ in 0..128 {
        collector.collect_garbage(16).unwrap();
    }
    assert_eq!(resource_owner(&db, "g0"), None);
    assert!(collector.read_version("v0").unwrap().is_none());
    assert_eq!(collector.visible_document(URI).unwrap(), Some(current));
    assert_eq!(collector.publish_group("g0", 0).unwrap(), 1);
    assert_eq!(collector.metadata().unwrap().committed_generation, 2);
    let violations: i64 = db
        .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(violations, 0);
}
