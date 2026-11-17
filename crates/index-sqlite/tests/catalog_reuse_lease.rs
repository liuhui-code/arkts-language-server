use arkts_index_core::{Document, parse_document_symbols};
use arkts_index_sqlite::{
    CatalogCollector, CatalogMaintenance, CatalogMigration, CatalogReuseLease, CompleteScanInputs,
    InputRevision, ManifestEntry, QualificationReceipt, VersionedFacts,
};
use std::path::Path;
#[path = "support/temp_dir.rs"]
mod temp_dir;
const ROOT: &str = "file:///reuse-lease";
const URI: &str = "file:///reuse-lease/A.ets";
fn sha(text: &str) -> String {
    arkts_index_sqlite::CatalogInputs::source_digest(text)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
fn bootstrap(base: &Path) -> QualificationReceipt {
    let mut m = CatalogMigration::begin(base, ROOT, "domain").unwrap();
    let text = "export class V1 {}";
    let doc = parse_document_symbols(&Document::new(URI, text)).unwrap();
    m.facts_mut().write_version("v1", &sha(text), &doc).unwrap();
    m.facts_mut()
        .stage_group("first", &[(URI.into(), "v1".into())])
        .unwrap();
    m.facts_mut().publish_group("first", 0).unwrap();
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(URI, text);
    m.activate(
        &InputRevision::new("window", 1).unwrap(),
        &scan.finish().unwrap(),
        || Ok(true),
        || Ok(true),
    )
    .unwrap()
}
fn replace(base: &Path, cache: &mut CatalogReuseLease, n: u64) {
    let mut m = CatalogMaintenance::begin(base, ROOT, "domain", &[URI.into()]).unwrap();
    let id = format!("v{n}");
    let text = format!("export class V{n} {{}}");
    let doc = parse_document_symbols(&Document::new(URI, &text)).unwrap();
    m.write_version(&id, &sha(&text), &doc).unwrap();
    let entry = ManifestEntry::accepted(URI, &id);
    cache
        .retain_transitions(std::slice::from_ref(&entry), || true)
        .unwrap();
    m.stage_changes(&id, &[entry]).unwrap();
    m.commit(&id, || Ok(true), || Ok(true)).unwrap();
}
#[test]
fn recent_content_has_a_workspace_lease_but_older_history_is_reclaimable() {
    let temp = temp_dir::TestDir::new("reuse-lease-window");
    let base = temp.path().join("symbols-v2.sqlite3");
    let initial = bootstrap(&base);
    let path = base.with_file_name(&initial.store);
    let mut cache = CatalogReuseLease::begin(&base, ROOT, "domain").unwrap();
    replace(&base, &mut cache, 2);
    let mut gc = CatalogCollector::begin(&base, ROOT, "domain").unwrap();
    let observer = VersionedFacts::open_existing(&path, ROOT, &initial.store, "domain").unwrap();
    for _ in 0..10 {
        assert_eq!(gc.collect(64).unwrap().garbage.versions_deleted, 0);
    }
    assert!(observer.read_version("v1").unwrap().is_some());
    replace(&base, &mut cache, 3);
    let mut deleted = 0;
    for _ in 0..20 {
        deleted += gc.collect(64).unwrap().garbage.versions_deleted;
    }
    assert_eq!(deleted, 1);
    assert!(observer.read_version("v1").unwrap().is_none());
    assert!(observer.read_version("v2").unwrap().is_some());
    assert!(observer.read_version("v3").unwrap().is_some());
    drop(cache);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while observer.read_version("v2").unwrap().is_some() {
        gc.collect(64).unwrap();
        assert!(std::time::Instant::now() < deadline);
    }
    assert!(observer.read_version("v3").unwrap().is_some());
}

#[test]
fn removed_content_stays_reusable_until_a_current_complete_namespace_receipt_retires_it() {
    let temp = temp_dir::TestDir::new("reuse-lease-namespace");
    let base = temp.path().join("symbols-v2.sqlite3");
    let initial = bootstrap(&base);
    let mut cache = CatalogReuseLease::begin(&base, ROOT, "domain").unwrap();
    let mut edit = CatalogMaintenance::begin(&base, ROOT, "domain", &[URI.into()]).unwrap();
    let removed = ManifestEntry::removed(URI);
    cache
        .retain_transitions(std::slice::from_ref(&removed), || true)
        .unwrap();
    edit.stage_changes("remove", &[removed]).unwrap();
    edit.commit("remove", || Ok(true), || Ok(true)).unwrap();
    assert!(
        cache.reconcile(&initial, || true).is_err(),
        "old receipts cannot retire a new namespace"
    );
    let mut gc = CatalogCollector::begin(&base, ROOT, "domain").unwrap();
    for _ in 0..10 {
        assert_eq!(gc.collect(64).unwrap().garbage.versions_deleted, 0);
    }
    let proof = CompleteScanInputs::new().unwrap().finish().unwrap();
    let q = edit
        .qualify(
            "empty",
            &InputRevision::new("window", 2).unwrap(),
            &proof,
            || Ok(true),
            || Ok(true),
        )
        .unwrap();
    assert_eq!(
        cache.reconcile(&q, || false).unwrap_err().kind(),
        arkts_index_core::StoreErrorKind::Cancelled
    );
    assert_eq!(cache.reconcile(&q, || true).unwrap(), 1);
    assert_eq!(cache.reconcile(&q, || true).unwrap(), 0);
    drop(edit);
    let mut deleted = 0;
    for _ in 0..20 {
        deleted += gc.collect(64).unwrap().garbage.versions_deleted;
    }
    assert_eq!(deleted, 1);
    let current = arkts_index_sqlite::CatalogStore::open_with_domain(&base, ROOT, "domain")
        .unwrap()
        .qualified_read(&q.input, |s| s.metadata())
        .unwrap()
        .unwrap();
    assert_eq!(current.qualification, Some(q));
}
#[test]
fn invalid_content_and_physical_takeover_cannot_replace_live_reuse_ownership() {
    let temp = temp_dir::TestDir::new("reuse-lease-validation");
    let base = temp.path().join("symbols-v2.sqlite3");
    let initial = bootstrap(&base);
    let mut cache = CatalogReuseLease::begin(&base, ROOT, "domain").unwrap();
    replace(&base, &mut cache, 2);
    assert!(
        cache
            .retain_transitions(&[ManifestEntry::accepted(URI, "missing")], || true)
            .is_err()
    );
    let mut gc = CatalogCollector::begin(&base, ROOT, "domain").unwrap();
    for _ in 0..10 {
        assert_eq!(gc.collect(64).unwrap().garbage.versions_deleted, 0);
    }
    drop(gc);
    let peer = bootstrap(&base);
    assert_ne!(peer.store, initial.store);
    assert_eq!(
        cache
            .retain_transitions(&[ManifestEntry::accepted(URI, "v1")], || true)
            .unwrap_err()
            .kind(),
        arkts_index_core::StoreErrorKind::InvalidGeneration
    );
    assert!(cache.reconcile(&peer, || true).is_err());
    drop(cache);
    let path = base.with_file_name(&initial.store);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while path.exists() {
        assert!(
            std::time::Instant::now() < deadline,
            "replaced reuse store remained pinned"
        );
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
}

#[test]
fn namespace_retirement_pages_examined_pins_and_releases_only_this_cache_owner() {
    let temp = temp_dir::TestDir::new("reuse-lease-paged-retirement");
    let base = temp.path().join("symbols-v2.sqlite3");
    let mut build = CatalogMigration::begin(&base, ROOT, "domain").unwrap();
    let mut entries = Vec::new();
    let mut scan = CompleteScanInputs::new().unwrap();
    for i in 0..130 {
        let uri = format!("{ROOT}/{i:04}.ets");
        let id = format!("id{i:04}");
        let text = format!("export class C{i} {{}}");
        let doc = parse_document_symbols(&Document::new(&uri, &text)).unwrap();
        build
            .facts_mut()
            .write_version(&id, &sha(&text), &doc)
            .unwrap();
        scan.record(&uri, &text);
        entries.push(ManifestEntry::accepted(&uri, &id));
    }
    for chunk in entries.chunks(64) {
        build.facts_mut().stage_changes("initial", chunk).unwrap();
    }
    build.facts_mut().publish_group("initial", 0).unwrap();
    let initial = build
        .activate(
            &InputRevision::new("window", 1).unwrap(),
            &scan.finish().unwrap(),
            || Ok(true),
            || Ok(true),
        )
        .unwrap();
    let path = base.with_file_name(&initial.store);
    let borrowed = VersionedFacts::open_existing(&path, ROOT, &initial.store, "domain").unwrap();
    borrowed
        .find_version(&format!("{ROOT}/0000.ets"), &sha("export class C0 {}"))
        .unwrap()
        .unwrap();
    let mut cache = CatalogReuseLease::begin(&base, ROOT, "domain").unwrap();
    cache.retain_transitions(&entries, || true).unwrap();
    let uris = entries.iter().map(|e| e.uri.clone()).collect::<Vec<_>>();
    let mut remove = CatalogMaintenance::begin(&base, ROOT, "domain", &uris).unwrap();
    let tombstones = uris
        .iter()
        .map(|u| ManifestEntry::removed(u))
        .collect::<Vec<_>>();
    for chunk in tombstones.chunks(64) {
        remove.stage_changes("removed", chunk).unwrap();
    }
    remove.commit("removed", || Ok(true), || Ok(true)).unwrap();
    let q = remove
        .qualify(
            "empty",
            &InputRevision::new("window", 2).unwrap(),
            &CompleteScanInputs::new().unwrap().finish().unwrap(),
            || Ok(true),
            || Ok(true),
        )
        .unwrap();
    assert_eq!(cache.reconcile(&q, || true).unwrap(), 130);
    assert_eq!(cache.reconcile(&q, || true).unwrap(), 0);
    drop(remove);
    let mut gc = CatalogCollector::begin(&base, ROOT, "domain").unwrap();
    let mut deleted = 0;
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    while deleted < 129 {
        deleted += gc.collect(4096).unwrap().garbage.versions_deleted;
        assert!(
            std::time::Instant::now() < deadline,
            "only {deleted} versions reclaimed"
        );
    }
    assert!(
        borrowed.read_version("id0000").unwrap().is_some(),
        "retirement must not remove another live owner's pin"
    );
    drop(borrowed);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while deleted < 130 {
        deleted += gc.collect(4096).unwrap().garbage.versions_deleted;
        assert!(std::time::Instant::now() < deadline);
    }
    assert_eq!(deleted, 130);
}
