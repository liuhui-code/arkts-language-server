use arkts_index_core::{
    Document, ExportQuery, Position, ReferenceCandidateQuery, SymbolQuery, parse_document_symbols,
};
use arkts_index_sqlite::{
    CatalogMigration, CatalogStore, CompleteScanInputs, InputRevision, VersionedFacts,
};
use sha2::{Digest, Sha256};
#[path = "support/temp_dir.rs"]
mod temp_dir;
const URI: &str = "file:///workspace/Target.ets";
const OLD: &str = "export class Target {}";
fn write(f: &mut VersionedFacts, id: &str, text: &str, parent: u64) {
    let doc = parse_document_symbols(&Document::new(URI, text)).unwrap();
    f.write_version(id, &format!("{:x}", Sha256::digest(text.as_bytes())), &doc)
        .unwrap();
    f.stage_group(id, &[(URI.into(), id.into())]).unwrap();
    f.publish_group(id, parent).unwrap();
}

fn migration(
    base: &std::path::Path,
    domain: &str,
    input: &InputRevision,
) -> arkts_index_sqlite::QualificationReceipt {
    let mut m = CatalogMigration::begin(base, "workspace", domain).unwrap();
    write(m.facts_mut(), "initial", OLD, 0);
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(URI, OLD);
    m.activate(input, &scan.finish().unwrap(), || Ok(true), || Ok(true))
        .unwrap()
}
#[test]
fn selected_catalog_read_keeps_its_physical_identity_when_another_owner_publishes_a_store() {
    let temp = temp_dir::TestDir::new("qualified-catalog-swap");
    let base = temp.path().join("symbols-v2.sqlite3");
    let input = InputRevision::new("window", 1).unwrap();
    let first = migration(&base, "domain", &input);
    let reader = CatalogStore::open_with_domain(&base, "workspace", "domain").unwrap();
    let mut replacement = None;
    let old = reader
        .qualified_read(&input, |read| {
            replacement = Some(migration(&base, "domain", &input));
            read.search(&SymbolQuery::new("Target", 10))
        })
        .unwrap()
        .unwrap();
    assert_eq!(old.store, first.store);
    assert_eq!(old.qualification, Some(first));
    assert_eq!(old.head, old.value.served_generation);
    assert_eq!(old.value.items.len(), 1);
    let new = reader
        .qualified_read(&input, |read| read.search(&SymbolQuery::new("Target", 10)))
        .unwrap()
        .unwrap();
    let replacement = replacement.unwrap();
    assert_eq!(new.store, replacement.store);
    assert_ne!(
        new.store, old.store,
        "head one is not enough to identify a store"
    );
    assert_eq!(new.qualification, Some(replacement));
    assert_eq!(new.value.items.len(), 1);
}

#[test]
fn error_and_panic_release_the_read_snapshot_and_foreign_tokens_do_not_qualify() {
    use arkts_index_core::{StoreError, StoreErrorKind};
    let temp = temp_dir::TestDir::new("qualified-read-release");
    let path = temp.path().join("facts.sqlite3");
    let mut facts = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let input = InputRevision::new("window", 1).unwrap();
    facts
        .qualify_complete_scan(
            "q0",
            &input,
            0,
            &CompleteScanInputs::new().unwrap().finish().unwrap(),
        )
        .unwrap();
    let failed = facts.qualified_read::<()>(&input, |_| {
        Err(StoreError::new(
            StoreErrorKind::InvalidData,
            "controlled read failure",
        ))
    });
    assert_eq!(failed.unwrap_err().kind(), StoreErrorKind::InvalidData);
    assert!(
        facts
            .qualified_read(&input, |_| Ok(()))
            .unwrap()
            .qualification
            .is_some()
    );
    let panic = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = facts.qualified_read::<()>(&input, |_| panic!("controlled read panic"));
    }));
    assert!(panic.is_err());
    let foreign = facts
        .qualified_read(&InputRevision::new("other-window", 1).unwrap(), |_| Ok(()))
        .unwrap();
    assert_eq!(foreign.head, 0);
    assert!(foreign.qualification.is_none());
    write(&mut facts, "after-failure", OLD, 0);
    let next = facts
        .qualified_read(&input, |read| read.search(&SymbolQuery::new("Target", 10)))
        .unwrap();
    assert_eq!(next.head, 1);
    assert_eq!(next.value.items.len(), 1);
    assert!(next.qualification.is_none());
}

#[test]
fn legacy_store_cannot_invent_a_versioned_receipt_or_execute_the_qualified_callback() {
    let temp = temp_dir::TestDir::new("qualified-legacy");
    let store = CatalogStore::open_with_domain(
        temp.path().join("symbols-v2.sqlite3"),
        "workspace",
        "domain",
    )
    .unwrap();
    let legacy = store
        .qualified_read::<()>(&InputRevision::new("window", 1).unwrap(), |_| {
            panic!("legacy data cannot be read as qualified versioned facts")
        })
        .unwrap();
    assert!(legacy.is_none());
}
#[test]
fn every_read_port_and_qualification_share_one_snapshot_during_a_concurrent_publication() {
    let temp = temp_dir::TestDir::new("qualified-read");
    let path = temp.path().join("facts.sqlite3");
    let mut writer = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    write(&mut writer, "v1", OLD, 0);
    let input = InputRevision::new("window", 1).unwrap();
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(URI, OLD);
    let receipt = writer
        .qualify_complete_scan("q1", &input, 1, &scan.finish().unwrap())
        .unwrap();
    let reader = VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap();
    let observed = reader
        .qualified_read(&input, |read| {
            // The outer API has already fixed its data/qualification snapshot.
            write(&mut writer, "v2", "export class Replacement {}", 1);
            let symbols = read.search(&SymbolQuery::new("Target", 10))?;
            assert_eq!(symbols.items.len(), 1);
            assert_eq!(symbols.served_generation, 1);
            assert!(
                read.search(&SymbolQuery::new("Replacement", 10))?
                    .items
                    .is_empty()
            );
            assert_eq!(read.metadata()?.committed_generation, 1);
            let exports = read.search_exports(&ExportQuery::new("Target", 10))?;
            assert_eq!(exports.items.len(), 1);
            assert_eq!(exports.served_generation, 1);
            assert_eq!(read.class_heritage(URI)?.served_generation, 1);
            assert_eq!(
                read.class_binding_snapshot(&[URI.into()])?
                    .served_generation,
                1
            );
            let references = read.search_reference_candidates(
                &ReferenceCandidateQuery {
                    declaration_uri: URI.into(),
                    declaration_position: Position::new(0, 14),
                    limit: 100,
                },
                &[],
                &[],
            )?;
            assert!(references.supported);
            assert_eq!(references.served_generation, 1);
            Ok(symbols.items)
        })
        .unwrap();
    assert_eq!(observed.workspace, "workspace");
    assert_eq!(observed.store, "store");
    assert_eq!(observed.domain, "domain");
    assert_eq!(observed.head, 1);
    assert_eq!(observed.qualification, Some(receipt));
    assert_eq!(observed.value.len(), 1);
    let current = reader
        .qualified_read(&input, |read| {
            read.search(&SymbolQuery::new("Replacement", 10))
        })
        .unwrap();
    assert_eq!(current.head, 2);
    assert_eq!(current.value.served_generation, 2);
    assert_eq!(current.value.items.len(), 1);
    assert!(
        current.qualification.is_none(),
        "head two has no complete receipt"
    );
}
