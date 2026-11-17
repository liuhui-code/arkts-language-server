use arkts_index_core::{Document, parse_document_symbols};
use arkts_index_sqlite::VersionedFacts;
use sha2::{Digest, Sha256};
#[path = "support/temp_dir.rs"]
mod temp_dir;

#[test]
fn complete_file_facts_roundtrip_and_remain_hidden_until_group_publication() {
    let temp = temp_dir::TestDir::new("versioned-file-facts");
    let path = temp.path().join("data.sqlite3");
    let uri = "file:///workspace/Child.ets";
    let text = "import { Base as Parent } from './Base';\nexport class Child extends Parent {}\nexport { Child as Alias };\nconst value = new Child();\nvalue.run();\n";
    let document = parse_document_symbols(&Document::new(uri, text)).unwrap();
    assert!(!document.symbols.is_empty());
    assert!(!document.exports.is_empty());
    assert!(!document.occurrences.is_empty());
    assert!(!document.bindings.is_empty());
    assert!(!document.aliases.is_empty());
    assert!(!document.class_heritage.as_ref().unwrap().classes.is_empty());
    let digest = format!("{:x}", Sha256::digest(text.as_bytes()));
    let mut facts = VersionedFacts::create(&path, "workspace", "store", "producer-domain").unwrap();
    let stored = facts.write_version("v1", &digest, &document).unwrap();
    assert_eq!(stored.version, "v1");
    assert!(!stored.reused);
    assert_eq!(facts.read_version("v1").unwrap(), Some(document.clone()));
    assert_eq!(facts.visible_document(uri).unwrap(), None);
    facts
        .stage_group("initial", &[(uri.to_owned(), stored.version)])
        .unwrap();
    facts.publish_group("initial", 0).unwrap();
    assert_eq!(facts.visible_document(uri).unwrap(), Some(document));
}

#[test]
fn file_key_reuse_is_uri_scoped_and_existing_versions_are_immutable() {
    let temp = temp_dir::TestDir::new("file-facts-reuse");
    let text = "export class Original {}";
    let digest = format!("{:x}", Sha256::digest(text.as_bytes()));
    let a = parse_document_symbols(&Document::new("file:///a.ets", text)).unwrap();
    let b = parse_document_symbols(&Document::new("file:///b.ets", text)).unwrap();
    let mut facts = VersionedFacts::create(
        &temp.path().join("data.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let first = facts.write_version("first", &digest, &a).unwrap();
    let reused = facts.write_version("unnecessary", &digest, &a).unwrap();
    assert_eq!(reused.version, first.version);
    assert_eq!(reused.rows, first.rows);
    assert!(reused.reused);
    assert!(facts.read_version("unnecessary").unwrap().is_none());
    assert!(
        !facts
            .write_version("other-uri", &digest, &b)
            .unwrap()
            .reused
    );
    assert!(facts.write_version("first", &"f".repeat(64), &a).is_err());
    assert_eq!(facts.read_version("first").unwrap(), Some(a.clone()));
    assert!(
        facts
            .stage_group("foreign", &[(b.uri.clone(), first.version)])
            .is_err()
    );
    facts
        .stage_group("valid", &[(a.uri.clone(), "first".into())])
        .unwrap();
    facts.publish_group("valid", 0).unwrap();
    assert_eq!(facts.visible_document(&a.uri).unwrap(), Some(a));
}

#[test]
fn reopening_preserves_all_fact_families_and_published_mapping() {
    let temp = temp_dir::TestDir::new("file-facts-reopen");
    let path = temp.path().join("data.sqlite3");
    let text = "export class Original {}";
    let doc = parse_document_symbols(&Document::new("file:///a.ets", text)).unwrap();
    let digest = format!("{:x}", Sha256::digest(text.as_bytes()));
    let mut facts = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    facts.write_version("first", &digest, &doc).unwrap();
    facts
        .stage_group("initial", &[(doc.uri.clone(), "first".into())])
        .unwrap();
    facts.publish_group("initial", 0).unwrap();
    drop(facts);
    let reopened = VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap();
    assert_eq!(reopened.visible_document(&doc.uri).unwrap(), Some(doc));
}

#[test]
fn alternate_manifest_writer_cannot_publish_missing_file_versions() {
    use arkts_index_sqlite::{ManifestEntry, ManifestLog};
    let temp = temp_dir::TestDir::new("file-facts-foreign-key");
    let path = temp.path().join("data.sqlite3");
    let facts = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let mut writer = ManifestLog::open_existing(&path, "workspace", "store", "domain").unwrap();
    let staged = writer.stage(
        "invalid",
        &[ManifestEntry::accepted("file:///a.ets", "missing")],
    );
    let rejected = staged.is_err()
        || writer
            .seal("invalid")
            .and_then(|_| writer.publish("invalid", 0))
            .is_err();
    assert!(
        rejected,
        "database constraints must protect publication through every write facade"
    );
    assert_eq!(facts.visible_document("file:///a.ets").unwrap(), None);
}

#[test]
fn partial_sql_failure_stays_unreadable_and_fresh_attempt_can_recover() {
    let temp = temp_dir::TestDir::new("file-facts-partial");
    let text = "export class Original {}";
    let good = parse_document_symbols(&Document::new("file:///a.ets", text)).unwrap();
    let mut malformed = good.clone();
    malformed.exports.push(malformed.exports[0].clone());
    let digest = format!("{:x}", Sha256::digest(text.as_bytes()));
    let path = temp.path().join("data.sqlite3");
    let mut facts = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    assert!(facts.write_version("failed", &digest, &malformed).is_err());
    assert!(facts.read_version("failed").unwrap().is_none());
    assert!(
        facts
            .stage_group("invalid", &[(good.uri.clone(), "failed".into())])
            .is_err()
    );
    let receipt = facts.write_version("recovered", &digest, &good).unwrap();
    facts
        .stage_group("valid", &[(good.uri.clone(), receipt.version)])
        .unwrap();
    facts.publish_group("valid", 0).unwrap();
    assert_eq!(facts.visible_document(&good.uri).unwrap(), Some(good));
}

#[test]
fn source_key_can_be_looked_up_before_requesting_a_parser() {
    let temp = temp_dir::TestDir::new("file-facts-key");
    let text = "export class Original {}";
    let doc = parse_document_symbols(&Document::new("file:///a.ets", text)).unwrap();
    let sha = format!("{:x}", Sha256::digest(text.as_bytes()));
    let mut facts = VersionedFacts::create(
        &temp.path().join("data.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    assert!(facts.find_version(&doc.uri, &sha).unwrap().is_none());
    facts.write_version("first", &sha, &doc).unwrap();
    let found = facts.find_version(&doc.uri, &sha).unwrap().unwrap();
    assert_eq!(found.version, "first");
    assert!(found.reused);
    assert!(
        facts
            .find_version("file:///other.ets", &sha)
            .unwrap()
            .is_none()
    );
    assert!(
        facts
            .find_version(&doc.uri, &"e".repeat(64))
            .unwrap()
            .is_none()
    );
}

#[test]
fn large_file_chunks_preserve_all_ordinals_and_unicode_positions() {
    let temp = temp_dir::TestDir::new("file-facts-chunks");
    let text = format!(
        "const face = '😀';\nexport class Dense {{}}\n{}",
        "new Dense();\n".repeat(12000)
    );
    let doc = parse_document_symbols(&Document::new("file:///dense.ets", text.clone())).unwrap();
    assert!(doc.occurrences.len() > 4096);
    let sha = format!("{:x}", Sha256::digest(text.as_bytes()));
    let mut facts = VersionedFacts::create(
        &temp.path().join("data.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let stored = facts.write_version("large", &sha, &doc).unwrap();
    assert!(stored.rows > doc.occurrences.len());
    assert_eq!(facts.read_version("large").unwrap(), Some(doc));
}

#[test]
fn rejected_removed_and_restored_files_reuse_facts_without_reviving_old_visibility() {
    use arkts_index_sqlite::ManifestEntry;
    let temp = temp_dir::TestDir::new("file-facts-lifecycle");
    let text = "export class Original {}";
    let doc = parse_document_symbols(&Document::new("file:///a.ets", text)).unwrap();
    let sha = format!("{:x}", Sha256::digest(text.as_bytes()));
    let mut facts = VersionedFacts::create(
        &temp.path().join("data.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    facts.write_version("first", &sha, &doc).unwrap();
    facts
        .stage_group("initial", &[(doc.uri.clone(), "first".into())])
        .unwrap();
    facts.publish_group("initial", 0).unwrap();
    facts
        .stage_changes("bad", &[ManifestEntry::rejected(&doc.uri, "read-error")])
        .unwrap();
    facts.publish_group("bad", 1).unwrap();
    assert!(facts.visible_document(&doc.uri).unwrap().is_none());
    facts
        .stage_changes("deleted", &[ManifestEntry::removed(&doc.uri)])
        .unwrap();
    facts.publish_group("deleted", 2).unwrap();
    assert!(facts.visible_document(&doc.uri).unwrap().is_none());
    let reuse = facts.find_version(&doc.uri, &sha).unwrap().unwrap();
    facts
        .stage_group("restored", &[(doc.uri.clone(), reuse.version)])
        .unwrap();
    facts.publish_group("restored", 3).unwrap();
    assert_eq!(facts.visible_document(&doc.uri).unwrap(), Some(doc));
}
