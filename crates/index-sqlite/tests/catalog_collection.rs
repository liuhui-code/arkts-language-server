use arkts_index_core::{Document, StoreErrorKind, parse_document_symbols};
use arkts_index_sqlite::{
    CatalogCollector, CatalogMaintenance, CatalogMigration, CatalogStore, CompleteScanInputs,
    InputRevision, ManifestEntry, VersionedFacts,
};
#[path = "support/temp_dir.rs"]
mod temp_dir;
const ROOT: &str = "file:///catalog-collection";
const URI: &str = "file:///catalog-collection/A.ets";
fn digest(text: &str) -> String {
    arkts_index_sqlite::CatalogInputs::source_digest(text)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
fn bootstrap(base: &std::path::Path, domain: &str) -> arkts_index_sqlite::QualificationReceipt {
    let text = "export class Before {}";
    let mut build = CatalogMigration::begin(base, ROOT, domain).unwrap();
    let doc = parse_document_symbols(&Document::new(URI, text)).unwrap();
    build
        .facts_mut()
        .write_version("one", &digest(text), &doc)
        .unwrap();
    build
        .facts_mut()
        .stage_group("first", &[(URI.into(), "one".into())])
        .unwrap();
    build.facts_mut().publish_group("first", 0).unwrap();
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(URI, text);
    build
        .activate(
            &InputRevision::new("window", 1).unwrap(),
            &scan.finish().unwrap(),
            || Ok(true),
            || Ok(true),
        )
        .unwrap()
}
#[test]
fn one_retained_collector_reclaims_history_in_quanta_without_changing_current_qualification() {
    let temp = temp_dir::TestDir::new("catalog-collection-lease");
    let base = temp.path().join("symbols-v2.sqlite3");
    let initial = bootstrap(&base, "domain");
    let path = base.with_file_name(&initial.store);
    let borrowed = VersionedFacts::open_existing(&path, ROOT, &initial.store, "domain").unwrap();
    assert!(
        borrowed
            .find_version(URI, &digest("export class Before {}"))
            .unwrap()
            .is_some()
    );
    let text = "export class After {}";
    let doc = parse_document_symbols(&Document::new(URI, text)).unwrap();
    let mut edit = CatalogMaintenance::begin(&base, ROOT, "domain", &[URI.into()]).unwrap();
    edit.write_version("two", &digest(text), &doc).unwrap();
    edit.stage_changes("second", &[ManifestEntry::accepted(URI, "two")])
        .unwrap();
    edit.commit("second", || Ok(true), || Ok(true)).unwrap();
    let input = InputRevision::new("window", 2).unwrap();
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(URI, text);
    let q = edit
        .qualify(
            "second",
            &input,
            &scan.finish().unwrap(),
            || Ok(true),
            || Ok(true),
        )
        .unwrap();
    drop(edit);
    let mut collector = CatalogCollector::begin(&base, ROOT, "domain").unwrap();
    assert!(collector.collect(0).is_err());
    let owners = path.with_file_name(format!("{}.owners", initial.store));
    let owner_files = std::fs::read_dir(&owners).unwrap().count();
    for _ in 0..8 {
        let report = collector.collect(1).unwrap();
        assert_eq!(report.store_id, initial.store);
        assert!(report.still_selected && report.garbage.work_items <= 1);
        assert_eq!(
            report.garbage.versions_deleted, 0,
            "live borrowed facts must survive"
        );
    }
    assert_eq!(
        std::fs::read_dir(&owners).unwrap().count(),
        owner_files,
        "one retained collector must not acquire an owner per quantum"
    );
    assert!(borrowed.read_version("one").unwrap().is_some());
    drop(borrowed);
    let observer = VersionedFacts::open_existing(&path, ROOT, &initial.store, "domain").unwrap();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    let mut deleted = 0;
    while deleted == 0 {
        let report = collector.collect(1).unwrap();
        assert!(report.garbage.work_items <= 1);
        deleted += report.garbage.versions_deleted;
        assert!(
            std::time::Instant::now() < deadline,
            "closed owner history was not reclaimed"
        );
        std::thread::sleep(std::time::Duration::from_millis(2));
    }
    assert_eq!(deleted, 1);
    assert!(observer.read_version("one").unwrap().is_none());
    assert_eq!(observer.read_version("two").unwrap(), Some(doc));
    let reader = CatalogStore::open_with_domain(&base, ROOT, "domain").unwrap();
    let current = reader
        .qualified_read(&input, |s| s.metadata())
        .unwrap()
        .unwrap();
    assert_eq!(current.qualification, Some(q));
    let checkpoint = collector.checkpoint().unwrap();
    assert!(
        checkpoint
            .log_frames
            .zip(checkpoint.checkpointed_frames)
            .is_none_or(|(log, done)| done <= log)
    );
}
#[test]
fn a_collector_refuses_a_replaced_physical_store_and_cannot_migrate_it_back() {
    let temp = temp_dir::TestDir::new("catalog-collection-takeover");
    let base = temp.path().join("symbols-v2.sqlite3");
    bootstrap(&base, "previous");
    let mut previous = CatalogCollector::begin(&base, ROOT, "previous").unwrap();
    let next = bootstrap(&base, "next");
    assert_eq!(
        previous.collect(4096).unwrap_err().kind(),
        StoreErrorKind::InvalidGeneration
    );
    assert_eq!(
        previous.checkpoint().unwrap_err().kind(),
        StoreErrorKind::InvalidGeneration
    );
    assert!(CatalogCollector::begin(&base, ROOT, "previous").is_err());
    let reader = CatalogStore::open_with_domain(&base, ROOT, "next").unwrap();
    assert_eq!(
        reader
            .qualified_read(&InputRevision::new("window", 1).unwrap(), |s| s.metadata())
            .unwrap()
            .unwrap()
            .store,
        next.store
    );
}

#[test]
fn collection_requires_a_valid_versioned_selection_and_preserves_legacy_data() {
    let temp = temp_dir::TestDir::new("catalog-collection-boundaries");
    let base = temp.path().join("symbols-v2.sqlite3");
    let mut legacy =
        arkts_index_core::WorkspaceIndex::with_store(CatalogStore::open(&base, ROOT).unwrap());
    legacy
        .refresh(1, [Document::new(URI, "export class Legacy {}")], &[])
        .unwrap();
    assert!(CatalogCollector::begin(&base, ROOT, "domain").is_err());
    assert!(CatalogCollector::begin(&base, ROOT, "").is_err());
    assert!(CatalogCollector::begin(&base, "file:///other-workspace", "domain").is_err());
    assert_eq!(legacy.search("Legacy", 10).unwrap().items.len(), 1);
    assert_eq!(legacy.metadata().unwrap().committed_generation, 1);
    bootstrap(&base, "domain");
    assert!(CatalogCollector::begin(&base, ROOT, "wrong-domain").is_err());
    let reader = CatalogStore::open_with_domain(&base, ROOT, "domain").unwrap();
    assert_eq!(
        reader
            .qualified_read(&InputRevision::new("window", 1).unwrap(), |s| s.metadata())
            .unwrap()
            .unwrap()
            .head,
        1
    );
}
