//! Run only with the frozen format9 producer and an explicit new fixture path.
use arkts_index_core::{Document, parse_document_symbols};
use arkts_index_sqlite::{CatalogMigration, CompleteScanInputs, InputRevision};
use std::{fs, path::PathBuf};
const ROOT: &str = "file:///owner-format-upgrade";
const DOMAIN: &str = "owner-format-upgrade-domain";
#[test]
fn emit_real_previous_owner_format_catalog() {
    let root = PathBuf::from(std::env::var("ARKTS_TEST_OWNER_FORMAT8_FIXTURE").expect("explicit isolated output required"));
    fs::create_dir(&root).expect("new fixture only; preserve existing data");
    let base = root.join("symbols-v2.sqlite3");
    let text = "export class PreviousOwnerFormat {}";
    let uri = "file:///owner-format-upgrade/A.ets";
    let doc = parse_document_symbols(&Document::new(uri,text)).unwrap();
    let mut old = CatalogMigration::begin(&base,ROOT,DOMAIN).unwrap();
    let digest = arkts_index_sqlite::CatalogInputs::source_digest(text).iter().map(|b|format!("{b:02x}")).collect::<String>();
    old.facts_mut().write_version("previous",&digest,&doc).unwrap();
    old.facts_mut().stage_group("previous",&[(uri.into(),"previous".into())]).unwrap();
    old.facts_mut().publish_group("previous",0).unwrap();
    let mut scan=CompleteScanInputs::new().unwrap();scan.record(uri,text);
    let receipt=old.activate(&InputRevision::new("previous-producer",1).unwrap(),&scan.finish().unwrap(),||Ok(true),||Ok(true)).unwrap();
    let db=rusqlite::Connection::open_with_flags(root.join(&receipt.store),rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
    let actual_format:i64=db.query_row("SELECT version FROM file_facts_format",[],|r|r.get(0)).unwrap();
    assert_eq!(actual_format,if cfg!(feature = "experimental-occurrence-without-rowid") {109} else {9},"fixture must be produced by the real previous binary");
    let record=serde_json::json!({"workspace":ROOT,"domain":DOMAIN,"store":receipt.store,"head":receipt.head,"actualFormat":actual_format});
    fs::write(root.join("fixture.json"),serde_json::to_vec_pretty(&record).unwrap()).unwrap();
    println!("previous-fixture={record}");
}
