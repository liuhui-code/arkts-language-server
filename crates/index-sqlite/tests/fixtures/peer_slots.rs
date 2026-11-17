//! Run with actual previous8/108 library, never the successor.
use arkts_index_core::{Document, parse_document_symbols};
use arkts_index_sqlite::VersionedFacts;
#[test]
fn advance_previous_owner() {
    let root = std::path::PathBuf::from(std::env::var("ARKTS_TEST_OLD_OWNER_FIXTURE").unwrap());
    let record: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("fixture.json")).unwrap()).unwrap();
    let path = root.join(record["store"].as_str().unwrap());
    let mut facts = VersionedFacts::open_existing(&path, record["workspace"].as_str().unwrap(), record["store"].as_str().unwrap(), record["domain"].as_str().unwrap()).unwrap();
    let uri="file:///owner-format-upgrade/A.ets";
    let text="export class PreviousPeerUpdate {}";
    let document=parse_document_symbols(&Document::new(uri,text)).unwrap();
    let digest=arkts_index_sqlite::CatalogInputs::source_digest(text).iter().map(|b|format!("{b:02x}")).collect::<String>();
    facts.write_version("previous-peer", &digest, &document).unwrap();
    facts.stage_group("previous-peer", &[(uri.into(),"previous-peer".into())]).unwrap();
    assert_eq!(facts.publish_group("previous-peer",1).unwrap(),2);
    assert_eq!(facts.visible_document(uri).unwrap(),Some(document));
    let db=rusqlite::Connection::open_with_flags(&path,rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
    let actual:i64=db.query_row("SELECT version FROM file_facts_format",[],|r|r.get(0)).unwrap();
    assert_eq!(actual, if cfg!(feature="experimental-occurrence-without-rowid"){109}else{9});
    println!("old-peer actualFormat={actual} oldHead=1 newHead=2");
}
