//! Rejected/removed manifest records cannot prevent safe orphan collection.
use arkts_index_core::{Document, parse_document_symbols};
use arkts_index_sqlite::{ManifestEntry, VersionedFacts};
use sha2::{Digest, Sha256};
#[path = "support/temp_dir.rs"]
mod temp_dir;
#[test]
fn null_manifest_versions_allow_orphan_collection_and_preserve_current_data_and_live_pins() {
    let temp = temp_dir::TestDir::new("gc-null-manifest-versions");
    let mut facts = VersionedFacts::create(
        &temp.path().join("facts.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    for name in ["Orphan", "Kept", "Pinned"] {
        let uri = format!("file:///workspace/{name}.ets");
        let text = format!("export class {name} {{}}\n");
        let doc = parse_document_symbols(&Document::new(&uri, &text)).unwrap();
        facts
            .write_version(
                name,
                &format!("{:x}", Sha256::digest(text.as_bytes())),
                &doc,
            )
            .unwrap();
    }
    facts
        .stage_changes(
            "current",
            &[
                ManifestEntry::accepted("file:///workspace/Kept.ets", "Kept"),
                ManifestEntry::rejected("file:///workspace/Rejected.ets", "parse-error"),
                ManifestEntry::removed("file:///workspace/Removed.ets"),
            ],
        )
        .unwrap();
    facts.publish_group("current", 0).unwrap();
    facts.release_version("Orphan").unwrap();
    let report = facts.collect_garbage(4096).unwrap();
    assert_eq!(report.versions_deleted, 1);
    assert!(report.facts_deleted > 0);
    assert!(facts.read_version("Orphan").unwrap().is_none());
    assert!(facts.read_version("Pinned").unwrap().is_some());
    assert!(
        facts
            .visible_document("file:///workspace/Kept.ets")
            .unwrap()
            .is_some()
    );
    assert!(
        facts
            .visible_document("file:///workspace/Rejected.ets")
            .unwrap()
            .is_none()
    );
    assert!(
        facts
            .visible_document("file:///workspace/Removed.ets")
            .unwrap()
            .is_none()
    );
}
