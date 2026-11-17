use arkts_index_core::{Document, parse_document_symbols};
use arkts_index_sqlite::{CatalogInputs, CatalogMigration, CatalogStore};
#[path = "support/temp_dir.rs"]
mod temp_dir;

#[test]
fn retry_reclaims_obsolete_private_facts_but_retains_matching_sealed_versions() {
    let temp = temp_dir::TestDir::new("private-draft-reclamation");
    let base = temp.path().join("symbols-v2.sqlite3");
    let root = "file:///draft-reclamation";
    let old = CatalogStore::open(&base, root).unwrap();
    let mut draft = CatalogMigration::begin(&base, root, "domain").unwrap();
    let mut obsolete_rows = 0;
    for i in 0..70 {
        let uri = format!("{root}/{i}.ets");
        let text = format!(
            "export class C{i} {{}}\n{}",
            format!("new C{i}();\n").repeat(80)
        );
        let sha: String = CatalogInputs::source_digest(&text)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        let doc = parse_document_symbols(&Document::new(&uri, &text)).unwrap();
        let id = format!("v{i}");
        let r = draft.facts_mut().write_version(&id, &sha, &doc).unwrap();
        if i != 0 {
            obsolete_rows += r.rows;
        }
        draft
            .facts_mut()
            .stage_group(&format!("g{i}"), &[(uri, id)])
            .unwrap();
    }
    let stats = draft.prepare_reuse(&["v0".into()], || true).unwrap();
    assert_eq!(stats.pins_released, 69);
    assert_eq!(stats.groups_abandoned, 70);
    assert_eq!(stats.facts_deleted, obsolete_rows);
    assert_eq!(stats.versions_deleted, 69);
    assert!(stats.quanta > 2);
    assert!(draft.facts_mut().read_version("v0").unwrap().is_some());
    for i in 1..70 {
        assert!(
            draft
                .facts_mut()
                .read_version(&format!("v{i}"))
                .unwrap()
                .is_none()
        );
    }
    assert_eq!(draft.inventory().unwrap().head, 0);
    assert!(draft.is_current_parent().unwrap());
    let again = draft.prepare_reuse(&["v0".into()], || true).unwrap();
    assert_eq!(again.facts_deleted, 0);
    assert_eq!(again.versions_deleted, 0);
    drop(old);
}

#[test]
fn invalid_or_cancelled_retention_never_releases_wanted_facts_and_cleanup_can_resume() {
    use arkts_index_core::StoreErrorKind;
    let temp = temp_dir::TestDir::new("private-draft-retain-validation");
    let base = temp.path().join("symbols-v2.sqlite3");
    let old = CatalogStore::open(&base, "root").unwrap();
    let mut draft = CatalogMigration::begin(&base, "root", "domain").unwrap();
    let text = "export class Keep {}";
    let sha: String = CatalogInputs::source_digest(text)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    let doc = parse_document_symbols(&Document::new("file:///Keep.ets", text)).unwrap();
    draft.facts_mut().write_version("keep", &sha, &doc).unwrap();
    draft
        .facts_mut()
        .stage_group("group", &[(doc.uri.clone(), "keep".into())])
        .unwrap();
    assert!(
        draft
            .prepare_reuse(&["keep".into(), "missing".into()], || true)
            .is_err()
    );
    // Failure while assembling the keep set must not start reclamation.
    let mut calls = 0;
    assert_eq!(
        draft
            .prepare_reuse(&["keep".into()], || {
                calls += 1;
                calls < 2
            })
            .unwrap_err()
            .kind(),
        StoreErrorKind::Cancelled
    );
    assert!(draft.facts_mut().read_version("keep").unwrap().is_some());
    let kept = draft.prepare_reuse(&["keep".into()], || true).unwrap();
    assert_eq!(kept.pins_released, 0);
    assert_eq!(kept.versions_deleted, 0);
    let removed = draft.prepare_reuse(&[], || true).unwrap();
    assert_eq!(removed.pins_released, 1);
    assert_eq!(removed.versions_deleted, 1);
    assert!(draft.facts_mut().read_version("keep").unwrap().is_none());
    drop(old);
}

#[test]
fn cancelled_large_file_prefix_is_reclaimed_without_releasing_a_matching_version() {
    use arkts_index_sqlite::FileVersionWrite;
    let temp = temp_dir::TestDir::new("private-draft-partial-facts");
    let base = temp.path().join("symbols-v2.sqlite3");
    let old = CatalogStore::open(&base, "root").unwrap();
    let mut draft = CatalogMigration::begin(&base, "root", "domain").unwrap();
    let text = format!("export class Item {{}}\n{}", "Item;\n".repeat(12_000));
    let sha: String = CatalogInputs::source_digest(&text)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    let keep = parse_document_symbols(&Document::new("file:///Keep.ets", &text)).unwrap();
    draft
        .facts_mut()
        .write_version("keep", &sha, &keep)
        .unwrap();
    let partial = parse_document_symbols(&Document::new("file:///Partial.ets", &text)).unwrap();
    let mut reached_prefix = false;
    for stop in 1..64 {
        let id = format!("partial-{stop}");
        let mut checks = 0;
        let result = draft.facts_mut().write_versions(
            &[FileVersionWrite {
                id: &id,
                sha: &sha,
                document: &partial,
            }],
            || {
                checks += 1;
                checks < stop
            },
        );
        assert!(result.is_err(), "test must stop before file sealing");
        if draft.last_file_write_work().unwrap().commit_callbacks >= 4 {
            reached_prefix = true;
            break;
        }
    }
    assert!(reached_prefix);
    let stats = draft.prepare_reuse(&["keep".into()], || true).unwrap();
    assert!(stats.facts_deleted >= 4096, "{stats:?}");
    assert!(stats.versions_deleted > 0);
    assert_eq!(draft.facts_mut().read_version("keep").unwrap(), Some(keep));
    assert!(
        draft
            .facts_mut()
            .find_version(&partial.uri, &sha)
            .unwrap()
            .is_none()
    );
    draft
        .facts_mut()
        .write_version("retry", &sha, &partial)
        .unwrap();
    assert_eq!(
        draft.facts_mut().read_version("retry").unwrap(),
        Some(partial)
    );
    drop(old);
}

#[test]
fn cancellation_between_gc_quanta_preserves_progress_and_the_next_attempt_drains_the_rest() {
    let temp = temp_dir::TestDir::new("private-draft-cancel-reclaim");
    let base = temp.path().join("symbols-v2.sqlite3");
    let old = CatalogStore::open(&base, "root").unwrap();
    let mut draft = CatalogMigration::begin(&base, "root", "domain").unwrap();
    let text = format!(
        "export class Obsolete {{}}\n{}",
        "Obsolete;\n".repeat(12_000)
    );
    let sha: String = CatalogInputs::source_digest(&text)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    let doc = parse_document_symbols(&Document::new("file:///Old.ets", &text)).unwrap();
    let old_rows = draft
        .facts_mut()
        .write_version("old", &sha, &doc)
        .unwrap()
        .rows;
    let text = "export class Keep {}";
    let sha: String = CatalogInputs::source_digest(text)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    let keep = parse_document_symbols(&Document::new("file:///Keep.ets", text)).unwrap();
    draft
        .facts_mut()
        .write_version("keep", &sha, &keep)
        .unwrap();
    let mut calls = 0;
    let err = draft
        .prepare_reuse(&["keep".into()], || {
            calls += 1;
            calls < 9
        })
        .unwrap_err();
    assert_eq!(err.kind(), arkts_index_core::StoreErrorKind::Cancelled);
    assert_eq!(
        draft.facts_mut().read_version("keep").unwrap(),
        Some(keep.clone())
    );
    let rest = draft.prepare_reuse(&["keep".into()], || true).unwrap();
    assert!(
        rest.facts_deleted > 0 && rest.facts_deleted < old_rows,
        "earlier GC commits must persist: {rest:?}, originalRows={old_rows}"
    );
    assert_eq!(rest.versions_deleted, 1);
    assert!(draft.facts_mut().read_version("old").unwrap().is_none());
    assert_eq!(draft.facts_mut().read_version("keep").unwrap(), Some(keep));
    drop(old);
}
