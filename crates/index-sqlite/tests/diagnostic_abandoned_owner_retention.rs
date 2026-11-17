//! Abandoned IDs remain tombstones without retaining a closed resource owner.
use arkts_index_core::{Document, SymbolStore, parse_document_symbols};
use arkts_index_sqlite::{CatalogInputs, VersionedFacts};
#[path = "support/temp_dir.rs"]
mod temp_dir;
#[test]
fn abandoned_group_keeps_its_identity_but_releases_a_proven_dead_owner() {
    let temp = temp_dir::TestDir::new("abandoned-owner-retention");
    let path = temp.path().join("facts.sqlite3");
    let uri = "file:///abandoned-owner/A.ets";
    let mut collector = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    {
        let mut task =
            VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap();
        let text = "export class Unpublished {}";
        let document = parse_document_symbols(&Document::new(uri, text)).unwrap();
        let digest = CatalogInputs::source_digest(text)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        task.write_version("unpublished", &digest, &document)
            .unwrap();
        task.stage_group("failed-attempt", &[(uri.into(), "unpublished".into())])
            .unwrap();
    }
    for _ in 0..256 {
        collector.collect_garbage(4).unwrap();
    }
    assert!(collector.read_version("unpublished").unwrap().is_none());
    assert!(collector.visible_document(uri).unwrap().is_none());
    assert_eq!(collector.metadata().unwrap().committed_generation, 0);
    let db =
        rusqlite::Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .unwrap();
    let state: String = db
        .query_row(
            "SELECT state FROM manifest_groups WHERE id='failed-attempt'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(state, "abandoned");
    let owners: i64 = db
        .query_row("SELECT count(*) FROM manifest_owners", [], |r| r.get(0))
        .unwrap();
    println!("abandoned-owner-control owners={owners} active=1 head=0 tombstone=abandoned");
    assert_eq!(
        owners, 1,
        "the active collector is the only remaining resource owner"
    );
    let text = "export class Replacement {}";
    let digest = CatalogInputs::source_digest(text)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    let document = parse_document_symbols(&Document::new(uri, text)).unwrap();
    collector
        .write_version("replacement", &digest, &document)
        .unwrap();
    assert!(
        collector
            .stage_group("failed-attempt", &[(uri.into(), "replacement".into())])
            .is_err(),
        "a consumed group identity cannot be reused after resource cleanup"
    );
    assert!(collector.publish_group("failed-attempt", 0).is_err());
    assert_eq!(collector.metadata().unwrap().committed_generation, 0);
}
