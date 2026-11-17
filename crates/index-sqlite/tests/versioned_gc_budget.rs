use arkts_index_core::{Document, parse_document_symbols};
use arkts_index_sqlite::VersionedFacts;
use sha2::{Digest, Sha256};
#[path = "support/temp_dir.rs"]
mod temp_dir;
#[test]
fn large_fact_versions_are_deleted_in_quanta_without_bulk_cascade_or_current_data_loss() {
    let temp = temp_dir::TestDir::new("fact-gc-budget");
    let path = temp.path().join("facts.sqlite3");
    let mut facts = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let uri = "file:///workspace/Big.ets";
    let text = format!("export class Old {{}}\n{}", "new Old();\n".repeat(1200));
    let doc = parse_document_symbols(&Document::new(uri, &text)).unwrap();
    let old_rows = facts
        .write_version(
            "old",
            &format!("{:x}", Sha256::digest(text.as_bytes())),
            &doc,
        )
        .unwrap()
        .rows;
    facts
        .stage_group("initial", &[(uri.into(), "old".into())])
        .unwrap();
    facts.publish_group("initial", 0).unwrap();
    let current = "export class Current {}";
    let current = parse_document_symbols(&Document::new(uri, current)).unwrap();
    facts
        .write_version(
            "current",
            &format!("{:x}", Sha256::digest(b"export class Current {}")),
            &current,
        )
        .unwrap();
    facts
        .stage_group("replace", &[(uri.into(), "current".into())])
        .unwrap();
    facts.publish_group("replace", 1).unwrap();
    facts.release_version("old").unwrap();
    let mut deleted = 0;
    let mut versions = 0;
    let mut rounds = 0;
    for _ in 0..2000 {
        rounds += 1;
        let report = facts.collect_garbage(17).unwrap();
        assert!(report.work_items <= 17);
        assert!(report.estimated_fact_bytes <= 4 * 1024 * 1024);
        deleted += report.facts_deleted;
        versions += report.versions_deleted;
        if versions > 0 {
            break;
        }
    }
    assert!(rounds > 1);
    assert_eq!(deleted, old_rows);
    assert_eq!(versions, 1);
    assert_eq!(facts.visible_document(uri).unwrap(), Some(current));
    assert!(facts.search("Old", 10).unwrap().items.is_empty());
    assert_eq!(facts.search("Current", 10).unwrap().items.len(), 1);
    println!("gcBudget: facts={deleted}; rounds={rounds}; maxItems=17; versions={versions}");
}

#[test]
fn concurrent_collectors_do_not_double_delete_or_reclaim_live_pins() {
    use std::sync::{Arc, Barrier};
    let temp = temp_dir::TestDir::new("concurrent-version-collectors");
    let path = temp.path().join("facts.sqlite3");
    let mut owner = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let text = "export class Orphan {}";
    let doc = parse_document_symbols(&Document::new("file:///orphan.ets", text)).unwrap();
    let rows = owner
        .write_version(
            "orphan",
            &format!("{:x}", Sha256::digest(text.as_bytes())),
            &doc,
        )
        .unwrap()
        .rows;
    drop(owner);
    let barrier = Arc::new(Barrier::new(3));
    let tasks: Vec<_> = (0..2)
        .map(|_| {
            let path = path.clone();
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                let mut collector =
                    VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap();
                barrier.wait();
                let mut versions = 0;
                let mut facts = 0;
                for _ in 0..16 {
                    let report = collector.collect_garbage(17).unwrap();
                    versions += report.versions_deleted;
                    facts += report.facts_deleted;
                }
                (versions, facts)
            })
        })
        .collect();
    barrier.wait();
    let mut versions = 0;
    let mut deleted = 0;
    for task in tasks {
        let (v, f) = task.join().unwrap();
        versions += v;
        deleted += f;
    }
    assert_eq!(versions, 1);
    assert_eq!(deleted, rows);
    let reader = VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap();
    assert_eq!(reader.read_version("orphan").unwrap(), None);
}
