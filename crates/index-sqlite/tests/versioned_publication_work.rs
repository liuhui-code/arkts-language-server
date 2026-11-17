use arkts_index_core::{Document, parse_document_symbols};
use arkts_index_sqlite::VersionedFacts;
use sha2::{Digest, Sha256};
#[path = "support/temp_dir.rs"]
mod temp_dir;
fn work(count: usize) -> i32 {
    let temp = temp_dir::TestDir::new("versioned-publication-work");
    let mut facts = VersionedFacts::create(
        &temp.path().join("facts.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let text = "export class Item {}";
    let sha = format!("{:x}", Sha256::digest(text.as_bytes()));
    let mut entries = Vec::new();
    for n in 0..count {
        let uri = format!("file:///workspace/F{n:04}.ets");
        let id = format!("v{n}");
        let doc = parse_document_symbols(&Document::new(&uri, text)).unwrap();
        facts.write_version(&id, &sha, &doc).unwrap();
        entries.push((uri, id));
    }
    for chunk in entries.chunks(64) {
        facts.stage_group("initial", chunk).unwrap();
    }
    facts.publish_group("initial", 0).unwrap();
    let metrics = facts.last_publication_work().unwrap();
    assert_eq!(metrics.head, 1);
    assert_eq!(metrics.group, "initial");
    println!(
        "publicationWork: members={count}; updateVmSteps={}",
        metrics.update_vm_steps
    );
    metrics.update_vm_steps
}
#[test]
fn final_publication_updates_do_not_walk_every_staged_group_member() {
    let single = work(1);
    let larger = work(129);
    assert_eq!(
        larger, single,
        "same header updates must not execute a per-member validation loop"
    );
}
