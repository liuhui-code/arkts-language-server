//! Cold activation keeps real SQL progress/cancellation separate from publication.
use arkts_index_core::{Document, StoreErrorKind, WorkspaceIndex, parse_document_symbols};
use arkts_index_sqlite::{
    CatalogMigration, CatalogStore, CatalogValidationObserver, CompleteScanInputs, InputRevision,
};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
#[path = "support/temp_dir.rs"]
mod temp_dir;
const ROOT: &str = "file:///catalog-validation-lifecycle";

#[test]
fn sql_validation_cancel_is_unpublished_and_retry_detaches_the_hook() {
    let temp = temp_dir::TestDir::new("validation-lifecycle");
    let base = temp.path().join("symbols-v2.sqlite3");
    let mut old = WorkspaceIndex::with_store(CatalogStore::open(&base, ROOT).unwrap());
    old.refresh(
        1,
        [Document::new(
            format!("{ROOT}/Old.ets"),
            "export class Old {}",
        )],
        &[],
    )
    .unwrap();
    let mut draft = CatalogMigration::begin(&base, ROOT, "domain").unwrap();
    let uri = format!("{ROOT}/New.ets");
    let text = (0..500)
        .map(|i| format!("export class Widget{i} {{ value: number = {i} }}\n"))
        .collect::<String>();
    let document = parse_document_symbols(&Document::new(&uri, &text)).unwrap();
    let sha = arkts_index_sqlite::CatalogInputs::source_digest(&text)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    draft
        .facts_mut()
        .write_version("one", &sha, &document)
        .unwrap();
    draft
        .facts_mut()
        .stage_group("group", &[(uri.clone(), "one".into())])
        .unwrap();
    draft.facts_mut().publish_group("group", 0).unwrap();
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(&uri, &text);
    let proof = scan.finish().unwrap();
    let progress = Arc::new(Mutex::new(Vec::new()));
    let captured = progress.clone();
    draft.set_validation_observer(CatalogValidationObserver::new(move |event| {
        captured.lock().unwrap().push(event);
        event.vm_steps == 0 // The first real VM callback cancels; stage entry alone is not SQL work.
    }));
    let failed_input = InputRevision::new("session", 1).unwrap();
    let failure = draft
        .try_activate(
            "cancelled",
            &failed_input,
            &proof,
            || panic!("source fence must not run after validation cancellation"),
            || panic!("control publication must not run after validation cancellation"),
        )
        .unwrap_err();
    assert_eq!(failure.kind(), StoreErrorKind::Cancelled);
    assert!(progress.lock().unwrap().iter().any(|p| p.vm_steps > 0));
    assert!(draft.is_current_parent().unwrap());
    assert_eq!(old.search("Old", 10).unwrap().items.len(), 1);
    let deny = Arc::new(AtomicBool::new(false));
    let deny_callback = deny.clone();
    let accepted = Arc::new(Mutex::new(Vec::new()));
    let accepted_callback = accepted.clone();
    draft.set_validation_observer(CatalogValidationObserver::new(move |event| {
        accepted_callback.lock().unwrap().push(event);
        !deny_callback.load(Ordering::Acquire)
    }));
    let current = InputRevision::new("session", 2).unwrap();
    let receipt = draft
        .try_activate("current", &current, &proof, || Ok(true), || Ok(true))
        .unwrap();
    for stage in ["QuickCheck", "ForeignKeys", "Fts"] {
        assert!(
            accepted
                .lock()
                .unwrap()
                .iter()
                .any(|p| format!("{:?}", p.stage) == stage && p.vm_steps > 0),
            "missing actual SQL work for {stage}"
        );
    }
    let callbacks = accepted.lock().unwrap().len();
    deny.store(true, Ordering::Release);
    let selected =
        WorkspaceIndex::with_store(CatalogStore::open_with_domain(&base, ROOT, "domain").unwrap());
    assert_eq!(selected.search("Widget499", 10).unwrap().items.len(), 1);
    assert_eq!(
        accepted.lock().unwrap().len(),
        callbacks,
        "validation hook must not leak into subsequent queries"
    );
    let store = CatalogStore::open_with_domain(&base, ROOT, "domain").unwrap();
    assert!(
        store
            .qualified_read(&failed_input, |s| s.metadata())
            .unwrap()
            .unwrap()
            .qualification
            .is_none()
    );
    assert_eq!(
        store
            .qualified_read(&current, |s| s.metadata())
            .unwrap()
            .unwrap()
            .qualification,
        Some(receipt)
    );
}

#[test]
fn observer_does_not_turn_real_foreign_key_corruption_into_progress_success() {
    let temp = temp_dir::TestDir::new("validation-corruption");
    let base = temp.path().join("symbols-v2.sqlite3");
    let parent = CatalogStore::open(&base, ROOT).unwrap();
    let mut draft = CatalogMigration::begin(&base, ROOT, "domain").unwrap();
    let uri = format!("{ROOT}/New.ets");
    let text = "export class New {}";
    let doc = parse_document_symbols(&Document::new(&uri, text)).unwrap();
    let sha = arkts_index_sqlite::CatalogInputs::source_digest(text)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    draft.facts_mut().write_version("one", &sha, &doc).unwrap();
    draft
        .facts_mut()
        .stage_group("group", &[(uri.clone(), "one".into())])
        .unwrap();
    draft.facts_mut().publish_group("group", 0).unwrap();
    let private = std::fs::read_dir(temp.path())
        .unwrap()
        .map(|p| p.unwrap().path())
        .find(|p| {
            p.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("catalog-")
                && p.extension().is_some_and(|e| e == "sqlite3")
                && p.file_name().unwrap() != "catalog-state.sqlite3"
        })
        .unwrap();
    let connection = rusqlite::Connection::open(private).unwrap();
    connection.execute_batch("PRAGMA foreign_keys=OFF; DROP TRIGGER v_symbols_guard_insert; INSERT INTO v_symbols(version,ordinal,name,name_folded,acronym_folded,kind) VALUES('missing-version',0,'Corrupt','corrupt','c',1);").unwrap();
    assert!(
        connection
            .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| r
                .get::<_, i64>(
                0
            ))
            .unwrap()
            > 0
    );
    drop(connection);
    let phases = Arc::new(Mutex::new(Vec::new()));
    let seen = phases.clone();
    draft.set_validation_observer(CatalogValidationObserver::new(move |p| {
        seen.lock().unwrap().push(p.stage);
        true
    }));
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(&uri, text);
    let error = draft
        .try_activate(
            "invalid",
            &InputRevision::new("session", 1).unwrap(),
            &scan.finish().unwrap(),
            || panic!("corrupt store must not reach source fence"),
            || panic!("corrupt store must not be published"),
        )
        .unwrap_err();
    assert_eq!(error.kind(), StoreErrorKind::Corrupt);
    assert!(
        phases
            .lock()
            .unwrap()
            .iter()
            .any(|p| format!("{p:?}") == "ForeignKeys")
    );
    assert!(draft.is_current_parent().unwrap());
    drop(parent);
}
