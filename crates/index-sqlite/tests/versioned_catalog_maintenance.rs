use arkts_index_core::{Document, WorkspaceIndex, parse_document_symbols};
use arkts_index_sqlite::{
    CatalogMaintenance, CatalogMigration, CatalogStore, CompleteScanInputs, InputRevision,
    ManifestEntry,
};
use sha2::{Digest, Sha256};
#[path = "support/temp_dir.rs"]
mod temp_dir;
const ROOT: &str = "file:///catalog-maintenance";
fn put(m: &mut CatalogMigration, id: &str, uri: &str, text: &str) {
    let doc = parse_document_symbols(&Document::new(uri, text)).unwrap();
    m.facts_mut()
        .write_version(id, &format!("{:x}", Sha256::digest(text.as_bytes())), &doc)
        .unwrap();
    m.facts_mut()
        .stage_group(id, &[(uri.into(), id.into())])
        .unwrap();
}
#[test]
fn ordinary_file_maintenance_reuses_the_active_physical_store_and_qualifies_without_new_noop_head()
{
    let temp = temp_dir::TestDir::new("catalog-file-maintenance");
    let base = temp.path().join("symbols-v2.sqlite3");
    let a = format!("{ROOT}/A.ets");
    let b = format!("{ROOT}/B.ets");
    let a1 = "export class Before {}";
    let stable = "export class Stable {}";
    let mut migration = CatalogMigration::begin(&base, ROOT, "domain").unwrap();
    put(&mut migration, "a1", &a, a1);
    put(&mut migration, "b1", &b, stable);
    // One atomic initial group; the preceding per-file draft groups stay hidden.
    migration
        .facts_mut()
        .stage_group("all", &[(a.clone(), "a1".into()), (b.clone(), "b1".into())])
        .unwrap();
    migration.facts_mut().publish_group("all", 0).unwrap();
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(&a, a1);
    scan.record(&b, stable);
    let initial = migration
        .activate(
            &InputRevision::new("issuer", 1).unwrap(),
            &scan.finish().unwrap(),
            || Ok(true),
            || Ok(true),
        )
        .unwrap();
    let mut edit =
        CatalogMaintenance::begin(&base, ROOT, "domain", std::slice::from_ref(&a)).unwrap();
    assert_eq!(
        edit.inputs()[0].source_sha.as_deref(),
        Some(format!("{:x}", Sha256::digest(a1.as_bytes())).as_str())
    );
    let after = "export class After {}";
    let doc = parse_document_symbols(&Document::new(&a, after)).unwrap();
    edit.write_version(
        "a2",
        &format!("{:x}", Sha256::digest(after.as_bytes())),
        &doc,
    )
    .unwrap();
    edit.stage_changes("edit", &[ManifestEntry::accepted(&a, "a2")])
        .unwrap();
    assert_eq!(edit.commit("edit", || Ok(true), || Ok(true)).unwrap(), 2);
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(&a, after);
    scan.record(&b, stable);
    let proof = scan.finish().unwrap();
    let updated = edit
        .qualify(
            "edit-receipt",
            &InputRevision::new("issuer", 2).unwrap(),
            &proof,
            || Ok(true),
            || Ok(true),
        )
        .unwrap();
    assert_eq!(updated.store, initial.store);
    let reader =
        WorkspaceIndex::with_store(CatalogStore::open_with_domain(&base, ROOT, "domain").unwrap());
    assert_eq!(reader.search("After", 10).unwrap().items.len(), 1);
    assert_eq!(reader.search("Stable", 10).unwrap().items.len(), 1);
    assert!(reader.search("Before", 10).unwrap().items.is_empty());
    let mut noop = CatalogMaintenance::begin(&base, ROOT, "domain", &[]).unwrap();
    let receipt = noop
        .qualify(
            "noop-receipt",
            &InputRevision::new("issuer", 3).unwrap(),
            &proof,
            || Ok(true),
            || Ok(true),
        )
        .unwrap();
    assert_eq!(receipt.head, 2);
    assert_eq!(receipt.store, initial.store);
}

fn bootstrap(base: &std::path::Path) -> (String, String) {
    let uri = format!("{ROOT}/A.ets");
    let text = "export class Before {}";
    let mut migration = CatalogMigration::begin(base, ROOT, "domain").unwrap();
    put(&mut migration, "a1", &uri, text);
    migration.facts_mut().publish_group("a1", 0).unwrap();
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(&uri, text);
    migration
        .activate(
            &InputRevision::new("init", 1).unwrap(),
            &scan.finish().unwrap(),
            || Ok(true),
            || Ok(true),
        )
        .unwrap();
    (uri, text.into())
}
fn stage_edit(edit: &mut CatalogMaintenance, uri: &str) {
    let text = "export class After {}";
    let doc = parse_document_symbols(&Document::new(uri, text)).unwrap();
    edit.write_version(
        "a2",
        &format!("{:x}", Sha256::digest(text.as_bytes())),
        &doc,
    )
    .unwrap();
    edit.stage_changes("edit", &[ManifestEntry::accepted(uri, "a2")])
        .unwrap();
}
#[test]
fn physical_replacement_during_source_check_rejects_old_store_data_commit() {
    let temp = temp_dir::TestDir::new("maintenance-store-fence");
    let base = temp.path().join("symbols-v2.sqlite3");
    let (uri, text) = bootstrap(&base);
    let mut edit =
        CatalogMaintenance::begin(&base, ROOT, "domain", std::slice::from_ref(&uri)).unwrap();
    stage_edit(&mut edit, &uri);
    let mut replacement = CatalogMigration::begin(&base, ROOT, "domain").unwrap();
    put(&mut replacement, "fresh", &uri, &text);
    replacement.facts_mut().publish_group("fresh", 0).unwrap();
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(&uri, &text);
    let proof = scan.finish().unwrap();
    let result = edit.commit(
        "edit",
        || {
            replacement.activate(
                &InputRevision::new("replacement", 1).unwrap(),
                &proof,
                || Ok(true),
                || Ok(true),
            )?;
            Ok(true)
        },
        || Ok(true),
    );
    assert_eq!(
        result.unwrap_err().kind(),
        arkts_index_core::StoreErrorKind::InvalidGeneration
    );
    let reader =
        WorkspaceIndex::with_store(CatalogStore::open_with_domain(&base, ROOT, "domain").unwrap());
    assert_eq!(reader.search("Before", 10).unwrap().items.len(), 1);
    assert!(reader.search("After", 10).unwrap().items.is_empty());
}
#[test]
fn qualification_rejection_cannot_relabel_an_already_published_edit_as_unwritten() {
    let temp = temp_dir::TestDir::new("maintenance-qualification-fence");
    let base = temp.path().join("symbols-v2.sqlite3");
    let (uri, _) = bootstrap(&base);
    let mut edit =
        CatalogMaintenance::begin(&base, ROOT, "domain", std::slice::from_ref(&uri)).unwrap();
    stage_edit(&mut edit, &uri);
    assert_eq!(edit.commit("edit", || Ok(true), || Ok(true)).unwrap(), 2);
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(&uri, "export class After {}");
    let proof = scan.finish().unwrap();
    assert!(
        edit.qualify(
            "cancelled",
            &InputRevision::new("issuer", 2).unwrap(),
            &proof,
            || Ok(true),
            || Ok(false)
        )
        .is_err()
    );
    let reader =
        WorkspaceIndex::with_store(CatalogStore::open_with_domain(&base, ROOT, "domain").unwrap());
    let data = reader.search("After", 10).unwrap();
    assert_eq!(data.served_generation, 2);
    assert_eq!(data.items.len(), 1);
    let mut retry = CatalogMaintenance::begin(&base, ROOT, "domain", &[]).unwrap();
    assert_eq!(
        retry
            .qualify(
                "recovered",
                &InputRevision::new("issuer", 3).unwrap(),
                &proof,
                || Ok(true),
                || Ok(true)
            )
            .unwrap()
            .head,
        2
    );
}
#[test]
fn inspecting_current_keys_does_not_acquire_per_file_pins() {
    let temp = temp_dir::TestDir::new("maintenance-input-keys");
    let base = temp.path().join("symbols-v2.sqlite3");
    let (uri, _) = bootstrap(&base);
    let control = rusqlite::Connection::open(base.with_file_name("catalog-state.sqlite3")).unwrap();
    let name: String = control
        .query_row("SELECT database_name FROM catalog_state", [], |r| r.get(0))
        .unwrap();
    drop(control);
    let db = rusqlite::Connection::open(base.with_file_name(name)).unwrap();
    let before: i64 = db
        .query_row("SELECT count(*) FROM version_pins", [], |r| r.get(0))
        .unwrap();
    let inputs =
        CatalogMaintenance::begin(&base, ROOT, "domain", std::slice::from_ref(&uri)).unwrap();
    assert_eq!(inputs.inputs().len(), 1);
    assert_eq!(inputs.inputs()[0].uri, uri);
    assert_eq!(
        db.query_row::<i64, _, _>("SELECT count(*) FROM version_pins", [], |r| r.get(0))
            .unwrap(),
        before
    );
}

#[test]
fn point_noop_rechecks_read_set_and_physical_store_without_writing_a_group() {
    let temp = temp_dir::TestDir::new("maintenance-point-noop");
    let base = temp.path().join("symbols-v2.sqlite3");
    let (uri, _) = bootstrap(&base);
    let old = CatalogMaintenance::begin(&base, ROOT, "domain", std::slice::from_ref(&uri)).unwrap();
    assert_eq!(old.verify_noop(|| Ok(true), || Ok(true)).unwrap(), 1);
    assert!(old.verify_noop(|| Ok(false), || Ok(true)).is_err());
    assert!(old.verify_noop(|| Ok(true), || Ok(false)).is_err());
    let mut other =
        CatalogMaintenance::begin(&base, ROOT, "domain", std::slice::from_ref(&uri)).unwrap();
    other
        .stage_changes("removed", &[ManifestEntry::removed(&uri)])
        .unwrap();
    other.commit("removed", || Ok(true), || Ok(true)).unwrap();
    let mut restore =
        CatalogMaintenance::begin(&base, ROOT, "domain", std::slice::from_ref(&uri)).unwrap();
    let version = restore
        .find_version(
            &uri,
            &format!("{:x}", Sha256::digest(b"export class Before {}")),
        )
        .unwrap()
        .unwrap();
    restore
        .stage_changes(
            "restored",
            &[ManifestEntry::accepted(&uri, &version.version)],
        )
        .unwrap();
    restore
        .commit("restored", || Ok(true), || Ok(true))
        .unwrap();
    assert!(
        old.verify_noop(|| Ok(true), || Ok(true)).is_err(),
        "same content cannot bypass entry/namespace ABA"
    );
    let current =
        CatalogMaintenance::begin(&base, ROOT, "domain", std::slice::from_ref(&uri)).unwrap();
    let observed = current.verify_noop(|| Ok(true), || Ok(true)).unwrap();
    assert_eq!(observed, 3);
    let current_store = current.store_id().to_owned();
    let result = current.verify_noop(
        || {
            bootstrap(&base);
            let replacement =
                CatalogMaintenance::begin(&base, ROOT, "domain", std::slice::from_ref(&uri))
                    .unwrap();
            assert_ne!(replacement.store_id(), current_store);
            Ok(true)
        },
        || Ok(true),
    );
    assert!(
        result.is_err(),
        "source fence must not hold publication lock and an intervening physical swap must reject the noop"
    );
}
