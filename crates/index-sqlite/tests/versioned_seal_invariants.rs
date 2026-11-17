use arkts_index_core::{Document, parse_document_symbols};
use arkts_index_sqlite::VersionedFacts;
use sha2::{Digest, Sha256};
#[path = "support/temp_dir.rs"]
mod temp_dir;
#[test]
fn sealed_versions_and_current_mapping_cannot_change_behind_the_publication_header() {
    let temp = temp_dir::TestDir::new("sealed-facts-invariants");
    let path = temp.path().join("facts.sqlite3");
    let mut facts = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let uri = "file:///workspace/A.ets";
    let text = "export class Original {}";
    let doc = parse_document_symbols(&Document::new(uri, text)).unwrap();
    facts
        .write_version(
            "v1",
            &format!("{:x}", Sha256::digest(text.as_bytes())),
            &doc,
        )
        .unwrap();
    facts
        .stage_group("all", &[(uri.into(), "v1".into())])
        .unwrap();
    facts.publish_group("all", 0).unwrap();
    // Independent SQLite writer exercises durable storage invariants, not
    // private Rust methods or a mock publication path.
    let raw = rusqlite::Connection::open(&path).unwrap();
    raw.execute_batch("PRAGMA foreign_keys=ON").unwrap();
    for sql in [
        "UPDATE file_versions SET uri='file:///wrong.ets' WHERE id='v1'",
        "UPDATE file_versions SET state='collecting' WHERE id='v1'",
        "DELETE FROM file_versions WHERE id='v1'",
        "UPDATE v_symbols SET name='Changed' WHERE version='v1'",
        "DELETE FROM v_symbols WHERE version='v1'",
        "INSERT INTO v_symbols SELECT version,999,'Injected','injected','i',kind,container,sl,sc,el,ec FROM v_symbols WHERE version='v1' LIMIT 1",
        "UPDATE manifest_entries SET kind='removed',version=NULL WHERE group_id='all'",
        "DELETE FROM manifest_entries WHERE group_id='all'",
        "INSERT INTO manifest_entries VALUES('all','file:///new.ets','removed',NULL,NULL)",
        "UPDATE manifest_groups SET commit_seq=99 WHERE id='all'",
    ] {
        assert!(raw.execute(sql, []).is_err(), "must reject: {sql}");
    }
    assert_eq!(facts.read_version("v1").unwrap(), Some(doc));
    let result = facts.search("Original", 10).unwrap();
    assert_eq!(result.served_generation, 1);
    assert_eq!(result.items.len(), 1);
    assert_eq!(facts.publish_group("all", 0).unwrap(), 1);
}
