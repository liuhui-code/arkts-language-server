use arkts_index_core::{Document, WorkspaceIndex, parse_document_symbols};
use arkts_index_sqlite::{CatalogMigration, CatalogStore, CompleteScanInputs, InputRevision};
#[path = "support/temp_dir.rs"]
mod temp_dir;
const ROOT: &str = "file:///migration-retry";
#[test]
fn failed_private_activation_preserves_facts_but_never_exports_unadmitted_qualifications() {
    for source_passes in [false, true] {
        let temp = temp_dir::TestDir::new("migration-retry");
        let base = temp.path().join("symbols-v2.sqlite3");
        let mut old = WorkspaceIndex::with_store(CatalogStore::open(&base, ROOT).unwrap());
        old.refresh(
            5,
            [Document::new(
                format!("{ROOT}/Old.ets"),
                "export class Old {}",
            )],
            &[],
        )
        .unwrap();
        let mut draft = CatalogMigration::begin_from(&base, ROOT, "domain", None).unwrap();
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
            .stage_group("first", &[(uri.clone(), "one".into())])
            .unwrap();
        draft.facts_mut().publish_group("first", 0).unwrap();
        let mut scan = CompleteScanInputs::new().unwrap();
        scan.record(&uri, text);
        let proof = scan.finish().unwrap();
        let failed = InputRevision::new("issuer", 1).unwrap();
        let current = InputRevision::new("issuer", 2).unwrap();
        assert!(
            draft
                .try_activate(
                    "failed",
                    &failed,
                    &proof,
                    || Ok(source_passes),
                    || Ok(!source_passes)
                )
                .is_err()
        );
        assert!(draft.is_current_parent().unwrap());
        assert_eq!(draft.inventory().unwrap().head, 1);
        assert!(
            draft
                .facts_mut()
                .find_version(&uri, &sha)
                .unwrap()
                .is_some()
        );
        assert_eq!(old.search("Old", 10).unwrap().items.len(), 1);
        let receipt = draft
            .try_activate("accepted", &current, &proof, || Ok(true), || Ok(true))
            .unwrap();
        assert!(!draft.is_current_parent().unwrap());
        let selected = CatalogStore::open_with_domain(&base, ROOT, "domain").unwrap();
        let stale = selected
            .qualified_read(&failed, |s| s.metadata())
            .unwrap()
            .unwrap();
        assert!(
            stale.qualification.is_none(),
            "a failed source/admission attempt must not become valid when a later input activates the same private store"
        );
        let fresh = selected
            .qualified_read(&current, |s| s.metadata())
            .unwrap()
            .unwrap();
        assert_eq!(fresh.qualification, Some(receipt.clone()));
        assert!(
            draft
                .try_activate("again", &current, &proof, || Ok(true), || Ok(true))
                .is_err()
        );
        assert_eq!(
            selected
                .qualified_read(&current, |s| s.metadata())
                .unwrap()
                .unwrap()
                .qualification,
            Some(receipt)
        );
    }
}

#[test]
fn a_retained_candidate_cannot_rebase_after_its_parent_changes() {
    let temp = temp_dir::TestDir::new("migration-retained-parent-change");
    let base = temp.path().join("symbols-v2.sqlite3");
    let mut old = WorkspaceIndex::with_store(CatalogStore::open(&base, ROOT).unwrap());
    old.refresh(
        5,
        [Document::new(
            format!("{ROOT}/Old.ets"),
            "export class Old {}",
        )],
        &[],
    )
    .unwrap();
    let mut draft = CatalogMigration::begin_from(&base, ROOT, "domain", None).unwrap();
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
        .stage_group("first", &[(uri.clone(), "one".into())])
        .unwrap();
    draft.facts_mut().publish_group("first", 0).unwrap();
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(&uri, text);
    let proof = scan.finish().unwrap();
    let input = InputRevision::new("issuer", 1).unwrap();
    assert!(
        draft
            .try_activate("denied", &input, &proof, || Ok(true), || Ok(false))
            .is_err()
    );
    assert!(draft.is_current_parent().unwrap());
    old.refresh(
        6,
        [Document::new(
            format!("{ROOT}/Peer.ets"),
            "export class Peer {}",
        )],
        &[],
    )
    .unwrap();
    assert!(!draft.is_current_parent().unwrap());
    let checked = std::cell::Cell::new(false);
    let failure = draft
        .try_activate(
            "stale",
            &InputRevision::new("issuer", 2).unwrap(),
            &proof,
            || {
                checked.set(true);
                Ok(true)
            },
            || Ok(true),
        )
        .unwrap_err();
    assert_eq!(
        failure.kind(),
        arkts_index_core::StoreErrorKind::InvalidGeneration
    );
    assert!(
        !checked.get(),
        "known-stale parent must fail before scanning sources again"
    );
    assert_eq!(old.search("Peer", 10).unwrap().items.len(), 1);
    assert_eq!(old.metadata().unwrap().committed_generation, 6);
}

#[test]
fn successful_mutable_activation_releases_the_previous_store_before_the_builder_is_dropped() {
    let temp = temp_dir::TestDir::new("migration-releases-parent");
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
    drop(old);
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
        .stage_group("first", &[(uri.clone(), "one".into())])
        .unwrap();
    draft.facts_mut().publish_group("first", 0).unwrap();
    let mut scan = CompleteScanInputs::new().unwrap();
    scan.record(&uri, text);
    let receipt = draft
        .try_activate(
            "done",
            &InputRevision::new("issuer", 1).unwrap(),
            &scan.finish().unwrap(),
            || Ok(true),
            || Ok(true),
        )
        .unwrap();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while base.exists() {
        assert!(
            std::time::Instant::now() < deadline,
            "a completed builder still pins its obsolete parent DB"
        );
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    assert!(!draft.is_current_parent().unwrap());
    assert!(base.with_file_name(receipt.store).exists());
}
