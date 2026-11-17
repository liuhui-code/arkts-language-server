use arkts_index_core::{Document, parse_document_symbols};
use arkts_index_sqlite::VersionedFacts;
use sha2::{Digest, Sha256};
#[path = "support/temp_dir.rs"]
mod temp_dir;

#[test]
fn collection_preserves_live_borrowers_and_releases_closed_owner_drafts() {
    let temp = temp_dir::TestDir::new("versioned-lifetime");
    let path = temp.path().join("facts.sqlite3");
    let mut writer = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let text = "export class LiveBorrow {}";
    let sha = format!("{:x}", Sha256::digest(text.as_bytes()));
    let uri = "file:///workspace/A.ets";
    let doc = parse_document_symbols(&Document::new(uri, text)).unwrap();
    writer.write_version("borrowed", &sha, &doc).unwrap();
    let mut collector =
        VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap();
    collector.collect_garbage(4096).unwrap();
    assert_eq!(
        collector.read_version("borrowed").unwrap(),
        Some(doc.clone())
    );
    writer
        .stage_group("draft", &[(uri.into(), "borrowed".into())])
        .unwrap();
    writer.release_version("borrowed").unwrap();
    collector.collect_garbage(4096).unwrap();
    assert_eq!(collector.read_version("borrowed").unwrap(), Some(doc));
    drop(writer);
    for _ in 0..16 {
        collector.collect_garbage(4096).unwrap();
    }
    assert_eq!(collector.read_version("borrowed").unwrap(), None);
    assert_eq!(collector.visible_document(uri).unwrap(), None);
    assert!(collector.search("LiveBorrow", 10).unwrap().items.is_empty());
}

#[test]
fn reclaimed_owners_are_not_starved_by_many_live_connections() {
    let temp = temp_dir::TestDir::new("owner-scan-fairness");
    let path = temp.path().join("facts.sqlite3");
    let mut collector = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let live: Vec<_> = (0..65)
        .map(|_| VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap())
        .collect();
    let mut dead = VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap();
    let text = "export class Orphan {}";
    let doc = parse_document_symbols(&Document::new("file:///orphan.ets", text)).unwrap();
    dead.write_version(
        "orphan",
        &format!("{:x}", Sha256::digest(text.as_bytes())),
        &doc,
    )
    .unwrap();
    drop(dead);
    for _ in 0..8 {
        collector.collect_garbage(4096).unwrap();
    }
    assert_eq!(
        collector.read_version("orphan").unwrap(),
        None,
        "a live scan prefix cannot hide dead owners forever"
    );
    assert_eq!(live.len(), 65);
}

#[test]
fn sustained_new_versions_do_not_starve_queued_fact_reclamation() {
    let temp = temp_dir::TestDir::new("gc-fact-fairness");
    let path = temp.path().join("facts.sqlite3");
    let mut facts = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let mut removed = 0;
    for n in 0..32 {
        let text = format!("export class Garbage{n} {{}}");
        let doc = parse_document_symbols(&Document::new("file:///garbage.ets", &text)).unwrap();
        let id = format!("g{n}");
        facts
            .write_version(&id, &format!("{:x}", Sha256::digest(text.as_bytes())), &doc)
            .unwrap();
        facts.release_version(&id).unwrap();
        let report = facts.collect_garbage(1).unwrap();
        assert!(report.work_items <= 1);
        removed += report.facts_deleted;
    }
    assert!(
        removed > 0,
        "new garbage cannot consume every quantum before old facts get a turn"
    );
}

#[test]
fn an_independent_borrow_protects_history_while_current_queries_follow_new_head() {
    let temp = temp_dir::TestDir::new("versioned-borrow-history");
    let path = temp.path().join("facts.sqlite3");
    let uri = "file:///workspace/A.ets";
    let old_text = "export class Before {}";
    let old_sha = format!("{:x}", Sha256::digest(old_text.as_bytes()));
    let old = parse_document_symbols(&Document::new(uri, old_text)).unwrap();
    let mut writer = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    writer.write_version("old", &old_sha, &old).unwrap();
    writer
        .stage_group("initial", &[(uri.into(), "old".into())])
        .unwrap();
    writer.publish_group("initial", 0).unwrap();
    let mut borrower =
        VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap();
    assert_eq!(
        borrower
            .find_version(uri, &old_sha)
            .unwrap()
            .unwrap()
            .version,
        "old"
    );
    let new_text = "export class After {}";
    let new = parse_document_symbols(&Document::new(uri, new_text)).unwrap();
    writer
        .write_version(
            "new",
            &format!("{:x}", Sha256::digest(new_text.as_bytes())),
            &new,
        )
        .unwrap();
    writer
        .stage_group("edited", &[(uri.into(), "new".into())])
        .unwrap();
    writer.publish_group("edited", 1).unwrap();
    writer.release_version("old").unwrap();
    for _ in 0..4 {
        writer.collect_garbage(4096).unwrap();
    }
    assert_eq!(borrower.read_version("old").unwrap(), Some(old));
    assert_eq!(borrower.visible_document(uri).unwrap(), Some(new.clone()));
    assert!(borrower.search("Before", 10).unwrap().items.is_empty());
    borrower.release_version("old").unwrap();
    for _ in 0..4 {
        writer.collect_garbage(4096).unwrap();
    }
    assert_eq!(borrower.read_version("old").unwrap(), None);
    assert_eq!(writer.visible_document(uri).unwrap(), Some(new));
    assert_eq!(
        writer.publish_group("initial", 0).unwrap(),
        1,
        "cleanup retains the committed attempt terminal"
    );
}

#[test]
fn failed_write_can_relinquish_its_partial_version_without_closing_the_session() {
    let temp = temp_dir::TestDir::new("partial-version-release");
    let path = temp.path().join("facts.sqlite3");
    let mut facts = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let text = format!("export class Partial {{}}\n{}", "Partial;\n".repeat(3000));
    let mut doc = parse_document_symbols(&Document::new("file:///partial.ets", &text)).unwrap();
    let sha = format!("{:x}", Sha256::digest(text.as_bytes()));
    assert!(
        !arkts_index_sqlite::FileWriteSize::for_input(
            &arkts_index_sqlite::FileVersionWrite {
                id: "failed",
                sha: &sha,
                document: &doc
            },
            "domain"
        )
        .fits()
    );
    doc.exports.push(doc.exports[0].clone());
    assert!(facts.write_version("failed", &sha, &doc).is_err());
    let work = facts.last_file_write_work().unwrap();
    assert!(
        work.commit_callbacks >= 2 && work.rollback_callbacks >= 1,
        "the failure must leave an actual committed prefix: {work:?}"
    );
    facts.release_version("failed").unwrap();
    let mut deleted = 0;
    for _ in 0..4 {
        deleted += facts.collect_garbage(4096).unwrap().versions_deleted;
    }
    assert_eq!(
        deleted, 1,
        "a relinquished failed attempt need not wait for owner death"
    );
}

#[test]
fn missing_owner_lock_is_unverifiable_and_does_not_authorize_deletion() {
    let temp = temp_dir::TestDir::new("unverifiable-owner");
    let path = temp.path().join("facts.sqlite3");
    let mut owner = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let text = "export class PreserveUnknownOwner {}";
    let doc = parse_document_symbols(&Document::new("file:///unknown.ets", text)).unwrap();
    owner
        .write_version(
            "unknown",
            &format!("{:x}", Sha256::digest(text.as_bytes())),
            &doc,
        )
        .unwrap();
    let directory = path.with_file_name("facts.sqlite3.owners");
    let marker = std::fs::read_dir(directory)
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    drop(owner);
    std::fs::remove_file(marker).unwrap(); // Isolated corruption fixture only.
    let mut collector =
        VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap();
    for _ in 0..4 {
        assert_eq!(collector.collect_garbage(4096).unwrap().owners_recovered, 0);
    }
    assert_eq!(collector.read_version("unknown").unwrap(), Some(doc));
}

#[test]
fn replacement_lock_inode_is_not_proof_that_the_original_owner_exited() {
    let temp = temp_dir::TestDir::new("replaced-owner-lock");
    let path = temp.path().join("facts.sqlite3");
    let mut owner = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let text = "export class PreserveReplacedLock {}";
    let doc = parse_document_symbols(&Document::new("file:///replaced.ets", text)).unwrap();
    owner
        .write_version(
            "replaced",
            &format!("{:x}", Sha256::digest(text.as_bytes())),
            &doc,
        )
        .unwrap();
    let directory = path.with_file_name("facts.sqlite3.owners");
    let marker = std::fs::read_dir(directory)
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    drop(owner);
    // Keep the old inode alive so the replacement cannot accidentally reuse it.
    let _old_inode = std::fs::File::open(&marker).unwrap();
    std::fs::remove_file(&marker).unwrap();
    std::fs::write(&marker, b"unrelated replacement").unwrap();
    let mut collector =
        VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap();
    for _ in 0..4 {
        assert_eq!(collector.collect_garbage(4096).unwrap().owners_recovered, 0);
    }
    assert_eq!(collector.read_version("replaced").unwrap(), Some(doc));
}
