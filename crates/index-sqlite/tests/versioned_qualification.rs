use arkts_index_sqlite::{CompleteScanInputs, InputRevision, ManifestEntry, VersionedFacts};
#[path = "support/temp_dir.rs"]
mod temp_dir;

#[test]
fn complete_receipts_are_session_scoped_and_noop_does_not_advance_data() {
    let temp = temp_dir::TestDir::new("versioned-qualification");
    let path = temp.path().join("facts.sqlite3");
    let mut facts = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let scan = CompleteScanInputs::new().unwrap().finish().unwrap();
    let a = InputRevision::new("session-a", 1).unwrap();
    let b = InputRevision::new("session-b", 1).unwrap();
    let first = facts
        .qualify_complete_scan("receipt-a", &a, 0, &scan)
        .unwrap();
    assert_eq!(first.head, 0);
    assert_eq!(first.store, "store");
    assert_eq!(first.domain, "domain");
    assert_eq!(first.input, a);
    let second = facts
        .qualify_complete_scan("receipt-b", &b, 0, &scan)
        .unwrap();
    assert_eq!(second.head, 0);
    assert_ne!(first.id, second.id);
    assert_eq!(facts.qualification(&a).unwrap(), Some(first.clone()));
    assert_eq!(
        facts
            .qualify_complete_scan("retry-id", &a, 0, &scan)
            .unwrap(),
        first
    );
    drop(facts);
    let mut facts = VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap();
    assert_eq!(facts.qualification(&b).unwrap(), Some(second));
    facts
        .stage_changes(
            "unknown",
            &[ManifestEntry::rejected("bad.ets", "read-error")],
        )
        .unwrap();
    facts.publish_group("unknown", 0).unwrap();
    assert_eq!(facts.qualification(&a).unwrap(), None);
    assert!(facts.qualify_complete_scan("stale", &a, 0, &scan).is_err());
    assert!(
        facts
            .qualify_complete_scan(
                "unknown",
                &InputRevision::new("session-a", 2).unwrap(),
                1,
                &scan
            )
            .is_err()
    );
}

#[test]
fn qualification_matches_the_complete_visible_content_and_cannot_rebind_old_tokens() {
    use arkts_index_core::{Document, parse_document_symbols};
    use sha2::{Digest, Sha256};
    let temp = temp_dir::TestDir::new("qualification-content");
    let path = temp.path().join("facts.sqlite3");
    let mut facts = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let uri = "file:///workspace/A.ets";
    let text = "export class Alpha {}";
    let doc = parse_document_symbols(&Document::new(uri, text)).unwrap();
    let sha = format!("{:x}", Sha256::digest(text.as_bytes()));
    facts.write_version("a1", &sha, &doc).unwrap();
    facts
        .stage_group("first", &[(uri.into(), "a1".into())])
        .unwrap();
    facts.publish_group("first", 0).unwrap();
    let input = InputRevision::new("window", 1).unwrap();
    let incomplete = CompleteScanInputs::new().unwrap().finish().unwrap();
    assert!(
        facts
            .qualify_complete_scan("missing", &input, 1, &incomplete)
            .is_err()
    );
    assert_eq!(facts.qualification(&input).unwrap(), None);
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(uri, text);
    let complete = scan.finish().unwrap();
    let receipt = facts
        .qualify_complete_scan("valid", &input, 1, &complete)
        .unwrap();
    assert_eq!(receipt.head, 1);
    assert_eq!(facts.search("Alpha", 10).unwrap().served_generation, 1);
    // A staged replacement neither invalidates the receipt nor enters the proof.
    facts
        .stage_changes("delete", &[ManifestEntry::removed(uri)])
        .unwrap();
    assert_eq!(facts.qualification(&input).unwrap(), Some(receipt));
    facts.publish_group("delete", 1).unwrap();
    assert_eq!(facts.qualification(&input).unwrap(), None);
    assert!(
        facts
            .qualify_complete_scan("rebind", &input, 2, &incomplete)
            .is_err()
    );
    let newer = InputRevision::new("window", 2).unwrap();
    let result = facts
        .qualify_complete_scan("new-input", &newer, 2, &incomplete)
        .unwrap();
    assert_eq!(result.head, 2);
    assert!(InputRevision::new("", 1).is_err());
    assert!(InputRevision::new("window", u64::MAX).is_err());
}
