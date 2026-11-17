use arkts_index_core::{Document, parse_document_symbols};
use arkts_index_sqlite::{FileVersionWrite, VersionedFacts};
use sha2::{Digest, Sha256};
#[path = "support/temp_dir.rs"]
mod temp_dir;
#[test]
fn sixty_four_small_files_share_one_actual_sqlite_commit_and_remain_hidden_until_publication() {
    let temp = temp_dir::TestDir::new("file-facts-batch-commits");
    let mut store = VersionedFacts::create(
        &temp.path().join("data.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let text = "export class Item {}\n";
    let sha = format!("{:x}", Sha256::digest(text.as_bytes()));
    let docs = (0..64)
        .map(|i| {
            parse_document_symbols(&Document::new(format!("file:///workspace/F{i}.ets"), text))
                .unwrap()
        })
        .collect::<Vec<_>>();
    let ids = (0..64).map(|i| format!("v{i}")).collect::<Vec<_>>();
    let inputs = docs
        .iter()
        .zip(&ids)
        .map(|(document, id)| FileVersionWrite {
            id,
            sha: &sha,
            document,
        })
        .collect::<Vec<_>>();
    let receipts = store.write_versions(&inputs, || true).unwrap();
    assert_eq!(receipts.len(), 64);
    let work = store.last_file_write_work().unwrap();
    println!(
        "actual file-write commit callbacks: {}",
        work.commit_callbacks
    );
    assert_eq!(
        work.commit_callbacks, 1,
        "small files/fact families must not each commit separately"
    );
    assert_eq!(work.rollback_callbacks, 0);
    for (doc, receipt) in docs.iter().zip(&receipts) {
        assert!(!receipt.reused);
        assert_eq!(
            store.read_version(&receipt.version).unwrap().as_ref(),
            Some(doc)
        );
        assert!(store.visible_document(&doc.uri).unwrap().is_none());
    }
    let entries = docs
        .iter()
        .zip(&receipts)
        .map(|(d, r)| (d.uri.clone(), r.version.clone()))
        .collect::<Vec<_>>();
    store.stage_group("publish", &entries).unwrap();
    store.publish_group("publish", 0).unwrap();
    assert_eq!(store.search("Item", 100).unwrap().items.len(), 64);
    let reused = store.write_versions(&inputs, || true).unwrap();
    assert!(reused.iter().all(|r| r.reused));
    assert_eq!(
        reused.iter().map(|r| &r.version).collect::<Vec<_>>(),
        receipts.iter().map(|r| &r.version).collect::<Vec<_>>()
    );
    assert_eq!(store.last_file_write_work().unwrap().commit_callbacks, 1);
    for d in &docs {
        assert_eq!(store.visible_document(&d.uri).unwrap().as_ref(), Some(d));
    }
}

#[test]
fn batch_admission_splits_on_documents_rows_and_estimated_bytes_without_losing_facts() {
    use arkts_index_sqlite::FileWriteSize;
    for (label, count, text, expected) in [
        ("documents", 65, "export class Item {}\n".to_string(), 2),
        (
            "rows",
            2,
            (0..300)
                .map(|i| format!("export class Item{i} {{}}\n"))
                .collect::<String>(),
            2,
        ),
        (
            "bytes",
            64,
            format!("export class {} {{}}\n", "LongName".repeat(1000)),
            2,
        ),
    ] {
        let temp = temp_dir::TestDir::new(label);
        let mut store = VersionedFacts::create(
            &temp.path().join("facts.sqlite3"),
            "workspace",
            "store",
            "domain",
        )
        .unwrap();
        let sha = format!("{:x}", Sha256::digest(text.as_bytes()));
        let docs = (0..count)
            .map(|i| {
                parse_document_symbols(&Document::new(format!("file:///workspace/F{i}.ets"), &text))
                    .unwrap()
            })
            .collect::<Vec<_>>();
        let ids = (0..count).map(|i| format!("v{i}")).collect::<Vec<_>>();
        let inputs = docs
            .iter()
            .zip(&ids)
            .map(|(document, id)| FileVersionWrite {
                id,
                sha: &sha,
                document,
            })
            .collect::<Vec<_>>();
        let total = inputs.iter().fold(FileWriteSize::default(), |size, i| {
            size.combine(FileWriteSize::for_input(i, "domain"))
        });
        if label == "rows" {
            assert!(
                total.rows > 4096
                    && total.estimated_bytes < 4 * 1024 * 1024
                    && total.documents < 64
            );
        }
        if label == "bytes" {
            assert!(
                total.estimated_bytes > 4 * 1024 * 1024
                    && total.rows < 4096
                    && total.documents == 64
            );
        }
        let receipts = store.write_versions(&inputs, || true).unwrap();
        assert_eq!(
            store.last_file_write_work().unwrap().commit_callbacks,
            expected,
            "{label}: {total:?}"
        );
        for (doc, receipt) in docs.iter().zip(&receipts) {
            assert_eq!(
                store.read_version(&receipt.version).unwrap().as_ref(),
                Some(doc)
            );
        }
    }
}
#[test]
fn a_data_identity_collision_rolls_back_the_whole_small_batch_and_the_connection_recovers() {
    let temp = temp_dir::TestDir::new("batch-collision-rollback");
    let mut store = VersionedFacts::create(
        &temp.path().join("facts.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let text = "export class Item {}\n";
    let sha = format!("{:x}", Sha256::digest(text.as_bytes()));
    let a = parse_document_symbols(&Document::new("file:///workspace/A.ets", text)).unwrap();
    let b = parse_document_symbols(&Document::new("file:///workspace/B.ets", text)).unwrap();
    let error = store
        .write_versions(
            &[
                FileVersionWrite {
                    id: "same",
                    sha: &sha,
                    document: &a,
                },
                FileVersionWrite {
                    id: "same",
                    sha: &sha,
                    document: &b,
                },
            ],
            || true,
        )
        .unwrap_err();
    assert_eq!(error.kind(), arkts_index_core::StoreErrorKind::InvalidData);
    let work = store.last_file_write_work().unwrap().clone();
    assert_eq!(work.commit_callbacks, 0);
    assert_eq!(work.rollback_callbacks, 1);
    assert!(store.find_version(&a.uri, &sha).unwrap().is_none());
    assert!(store.find_version(&b.uri, &sha).unwrap().is_none());
    let next = store.write_version("same", &sha, &a).unwrap();
    assert!(!next.reused);
    assert_eq!(store.last_file_write_work().unwrap().commit_callbacks, 1);
}
#[test]
fn cancellation_at_each_visited_admission_boundary_never_seals_a_partial_small_batch() {
    let temp = temp_dir::TestDir::new("batch-cancellation-boundaries");
    let mut store = VersionedFacts::create(
        &temp.path().join("facts.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let text = "export class Item {}\n";
    let sha = format!("{:x}", Sha256::digest(text.as_bytes()));
    let a = parse_document_symbols(&Document::new("file:///workspace/A.ets", text)).unwrap();
    let b = parse_document_symbols(&Document::new("file:///workspace/B.ets", text)).unwrap();
    let inputs = [
        FileVersionWrite {
            id: "a",
            sha: &sha,
            document: &a,
        },
        FileVersionWrite {
            id: "b",
            sha: &sha,
            document: &b,
        },
    ];
    let (mut before, mut rollback, mut success) = (false, false, false);
    for stop in 1..=64 {
        let mut checks = 0;
        let result = store.write_versions(&inputs, || {
            checks += 1;
            checks < stop
        });
        let work = store.last_file_write_work().unwrap().clone();
        match result {
            Err(error) => {
                assert_eq!(error.kind(), arkts_index_core::StoreErrorKind::Cancelled);
                assert_eq!(work.commit_callbacks, 0);
                before |= work.rollback_callbacks == 0;
                rollback |= work.rollback_callbacks == 1;
                assert!(store.find_version(&a.uri, &sha).unwrap().is_none());
                assert!(store.find_version(&b.uri, &sha).unwrap().is_none());
            }
            Ok(receipts) => {
                success = true;
                assert_eq!(receipts.len(), 2);
                assert_eq!(work.commit_callbacks, 1);
            }
        }
    }
    assert!(
        before && rollback && success,
        "must exercise both cancellation phases and a successful control"
    );
    assert!(store.visible_document(&a.uri).unwrap().is_none());
}
#[test]
fn large_file_cancel_keeps_committed_prefix_unpublished_reclaimable_and_retryable() {
    let temp = temp_dir::TestDir::new("large-file-write-cancel");
    let mut store = VersionedFacts::create(
        &temp.path().join("facts.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let text = format!("export class Item {{}}\n{}", "Item;\n".repeat(12_000));
    let sha = format!("{:x}", Sha256::digest(text.as_bytes()));
    let baseline =
        parse_document_symbols(&Document::new("file:///workspace/Baseline.ets", &text)).unwrap();
    store.write_version("baseline", &sha, &baseline).unwrap();
    let complete_commits = store.last_file_write_work().unwrap().commit_callbacks;
    let doc = parse_document_symbols(&Document::new("file:///workspace/Large.ets", &text)).unwrap();
    let mut prefix = None;
    for stop in 1..64 {
        let id = format!("attempt-{stop}");
        let mut checks = 0;
        let result = store.write_versions(
            &[FileVersionWrite {
                id: &id,
                sha: &sha,
                document: &doc,
            }],
            || {
                checks += 1;
                checks < stop
            },
        );
        let work = store.last_file_write_work().unwrap().clone();
        if let Err(error) = result {
            assert_eq!(error.kind(), arkts_index_core::StoreErrorKind::Cancelled);
            assert!(store.find_version(&doc.uri, &sha).unwrap().is_none());
            assert!(store.visible_document(&doc.uri).unwrap().is_none());
            store.release_version(&id).unwrap();
            let mut deleted = 0;
            for _ in 0..20 {
                let report = store.collect_garbage(4096).unwrap();
                deleted += report.facts_deleted;
                if report.work_items == 0 {
                    break;
                }
            }
            if work.commit_callbacks >= 4 {
                prefix = Some((work.commit_callbacks, deleted));
                break;
            }
        } else {
            panic!("cancellation windows never reached a partial fact-write prefix");
        }
    }
    let (commits, deleted) =
        prefix.expect("must observe cancellation after a committed fact chunk");
    assert!(commits < complete_commits && deleted >= 4096);
    let retried = store.write_version("retry", &sha, &doc).unwrap();
    assert_eq!(store.read_version(&retried.version).unwrap(), Some(doc));
    assert_eq!(store.read_version("baseline").unwrap(), Some(baseline));
}

#[test]
fn callback_unwind_rolls_back_and_detaches_observers_before_the_same_store_is_reused() {
    let temp = temp_dir::TestDir::new("file-write-admission-unwind");
    let mut store = VersionedFacts::create(
        &temp.path().join("facts.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let text = "export class Item {}\n";
    let sha = format!("{:x}", Sha256::digest(text.as_bytes()));
    let a = parse_document_symbols(&Document::new("file:///workspace/A.ets", text)).unwrap();
    let b = parse_document_symbols(&Document::new("file:///workspace/B.ets", text)).unwrap();
    let inputs = [
        FileVersionWrite {
            id: "a",
            sha: &sha,
            document: &a,
        },
        FileVersionWrite {
            id: "b",
            sha: &sha,
            document: &b,
        },
    ];
    let keep = parse_document_symbols(&Document::new("file:///workspace/Keep.ets", text)).unwrap();
    store.write_version("keep", &sha, &keep).unwrap();
    let mut successes = 0;
    let mut panics = 0;
    for stop in 1..=64 {
        let mut checks = 0;
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            store.write_versions(&inputs, || {
                checks += 1;
                assert_ne!(checks, stop, "controlled admission callback unwind");
                true
            })
        }));
        match outcome {
            Err(_) => {
                panics += 1;
                assert!(
                    store.last_file_write_work().is_none(),
                    "a panic must not expose a prior call's counters"
                );
                assert!(store.find_version(&a.uri, &sha).unwrap().is_none());
                assert!(store.find_version(&b.uri, &sha).unwrap().is_none());
            }
            Ok(result) => {
                result.unwrap();
                successes += 1;
                break;
            }
        }
    }
    assert!(panics > 2 && successes == 1);
    let next = store.write_versions(&inputs, || true).unwrap();
    assert_eq!(next.len(), 2);
    let work = store.last_file_write_work().unwrap();
    assert_eq!(work.commit_callbacks, 1);
    assert_eq!(work.rollback_callbacks, 0);
    assert_eq!(store.read_version("keep").unwrap(), Some(keep));
}
#[test]
fn combined_transaction_roundtrips_every_fact_family_without_publishing_a_partial_model() {
    let temp = temp_dir::TestDir::new("all-families-file-write-batch");
    let mut store = VersionedFacts::create(
        &temp.path().join("facts.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let text = "import { Base as Parent } from './Base';\nexport class Child extends Parent {}\n";
    let sha = format!("{:x}", Sha256::digest(text.as_bytes()));
    let docs = (0..16)
        .map(|i| {
            parse_document_symbols(&Document::new(
                format!("file:///workspace/Child{i}.ets"),
                text,
            ))
            .unwrap()
        })
        .collect::<Vec<_>>();
    assert!(docs.iter().all(|d| {
        !d.symbols.is_empty()
            && !d.exports.is_empty()
            && !d.occurrences.is_empty()
            && !d.aliases.is_empty()
            && !d.bindings.is_empty()
            && !d.class_heritage.as_ref().unwrap().classes.is_empty()
            && !d
                .class_binding_provenance
                .as_ref()
                .unwrap()
                .direct_exports
                .is_empty()
    }));
    let ids = (0..16).map(|i| format!("v{i}")).collect::<Vec<_>>();
    let inputs = docs
        .iter()
        .zip(&ids)
        .map(|(document, id)| FileVersionWrite {
            id,
            sha: &sha,
            document,
        })
        .collect::<Vec<_>>();
    let receipts = store.write_versions(&inputs, || true).unwrap();
    assert_eq!(store.last_file_write_work().unwrap().commit_callbacks, 1);
    for (doc, r) in docs.iter().zip(receipts) {
        assert_eq!(store.read_version(&r.version).unwrap().as_ref(), Some(doc));
        assert!(store.visible_document(&doc.uri).unwrap().is_none());
    }
}
