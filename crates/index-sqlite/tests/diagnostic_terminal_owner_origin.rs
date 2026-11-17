//! Historical creator identity is separate from a releasable resource reference.
use arkts_index_core::{Document, SymbolStore, parse_document_symbols};
use arkts_index_sqlite::{CatalogInputs, VersionedFacts};
#[path = "support/temp_dir.rs"]
mod temp_dir;
#[test]
fn terminal_receipt_keeps_its_original_logical_creator_identity() {
    let temp = temp_dir::TestDir::new("terminal-owner-origin");
    let path = temp.path().join("facts.sqlite3");
    let mut collector = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    for n in 0..2 {
        let mut task =
            VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap();
        let uri = "file:///terminal-origin/A.ets";
        let text = format!("export class Origin{n} {{}}");
        let document = parse_document_symbols(&Document::new(uri, &text)).unwrap();
        let digest = CatalogInputs::source_digest(&text)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        task.write_version(&format!("v{n}"), &digest, &document)
            .unwrap();
        task.stage_group(&format!("g{n}"), &[(uri.into(), format!("v{n}"))])
            .unwrap();
        task.publish_group(&format!("g{n}"), n).unwrap();
    }
    let db = rusqlite::Connection::open(&path).unwrap();
    let original: Option<String> = db
        .query_row("SELECT owner FROM manifest_groups WHERE id='g0'", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert!(original.is_some());
    for _ in 0..128 {
        collector.collect_garbage(16).unwrap();
    }
    let after: Option<String> = db
        .query_row("SELECT owner FROM manifest_groups WHERE id='g0'", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(
        after, original,
        "releasing resource ownership must not erase the immutable logical origin"
    );
    assert_eq!(collector.publish_group("g0", 0).unwrap(), 1);
    assert_eq!(collector.metadata().unwrap().committed_generation, 2);
}
