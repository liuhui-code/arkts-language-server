use arkts_index_core::{Document, WorkspaceIndex, parse_document_symbols};
use arkts_index_sqlite::{ManifestEntry, VersionedFacts};
use sha2::{Digest, Sha256};
#[path = "support/temp_dir.rs"]
mod temp_dir;
#[test]
fn class_snapshots_match_legacy_and_do_not_restore_rejected_or_staged_facts() {
    let temp = temp_dir::TestDir::new("versioned-class-query");
    let uri = "file:///Child.ets";
    let text = "import { Base } from './Base'; export class Child extends Base {}";
    let mut f = VersionedFacts::create(
        &temp.path().join("data.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let doc = parse_document_symbols(&Document::new(uri, text)).unwrap();
    f.write_version(
        "v1",
        &format!("{:x}", Sha256::digest(text.as_bytes())),
        &doc,
    )
    .unwrap();
    f.stage_group("one", &[(uri.into(), "v1".into())]).unwrap();
    assert!(f.class_heritage(uri).unwrap().facts.is_none());
    f.publish_group("one", 0).unwrap();
    let mut oracle = WorkspaceIndex::in_memory();
    oracle.refresh(1, [Document::new(uri, text)], &[]).unwrap();
    let uris = vec![uri.into(), "file:///missing.ets".into()];
    assert_eq!(
        f.class_binding_snapshot(&uris).unwrap(),
        oracle.class_binding_snapshot(&uris).unwrap()
    );
    assert_eq!(
        f.class_heritage(uri).unwrap(),
        oracle.class_heritage(uri).unwrap()
    );
    f.stage_changes("two", &[ManifestEntry::rejected(uri, "read-error")])
        .unwrap();
    f.publish_group("two", 1).unwrap();
    let result = f.class_binding_snapshot(&uris).unwrap();
    assert_eq!(result.served_generation, 2);
    assert!(f.class_binding_snapshot(&[uri.into(), uri.into()]).is_err());
    assert!(result.documents[0].heritage.is_none());
    assert!(result.documents[0].binding_provenance.is_none());
    assert!(result.documents[0].bindings.is_empty());
}
