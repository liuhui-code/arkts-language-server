use arkts_index_core::{Document, FullCatalogBatch, WorkspaceIndex, parse_document_symbols};
use arkts_index_sqlite::{
    CatalogStage, CatalogStore, build_catalog, build_catalog_with_fingerprint,
};

#[path = "support/temp_dir.rs"]
mod temp_dir;

const IDENTITY: &str = "file:///catalog-publication";

fn batch(generation: u64, name: &str) -> FullCatalogBatch {
    FullCatalogBatch {
        generation,
        documents: (0..130)
            .map(|n| {
                parse_document_symbols(&Document::new(
                    format!("{IDENTITY}/{n}.ets"),
                    format!("export class {name}{n} {{}}"),
                ))
                .unwrap()
            })
            .collect(),
        rejected_uris: vec![],
    }
}

#[test]
fn readers_keep_the_complete_old_catalog_until_the_private_build_is_published() {
    let directory = temp_dir::TestDir::new("catalog-publication");
    let database = directory.path().join("symbols-v2.sqlite3");
    let reader = WorkspaceIndex::with_store(CatalogStore::open(&database, IDENTITY).unwrap());
    build_catalog(&database, IDENTITY, batch(1, "Old"), |_| true).unwrap();
    assert_eq!(reader.search("Old", 200).unwrap().items.len(), 130);

    let mut committed_batches = 0;
    build_catalog(&database, IDENTITY, batch(2, "New"), |progress| {
        if progress.stage == CatalogStage::Writing && progress.written_documents > 0 {
            committed_batches += 1;
            let old = reader.search("Old", 200).unwrap();
            assert_eq!(old.served_generation, 1);
            assert_eq!(old.items.len(), 130);
            assert!(reader.search("New", 200).unwrap().items.is_empty());
        }
        true
    })
    .unwrap();
    assert!(committed_batches > 1);
    let result = reader.search("New", 200).unwrap();
    assert_eq!(result.served_generation, 2);
    assert_eq!(result.items.len(), 130);
    assert!(reader.search("Old", 200).unwrap().items.is_empty());
}

#[test]
fn cancellation_and_a_racing_incremental_write_preserve_the_active_catalog() {
    let directory = temp_dir::TestDir::new("catalog-abort");
    let database = directory.path().join("symbols-v2.sqlite3");
    let mut writer = WorkspaceIndex::with_store(CatalogStore::open(&database, IDENTITY).unwrap());
    build_catalog(&database, IDENTITY, batch(1, "Old"), |_| true).unwrap();
    assert!(
        build_catalog(&database, IDENTITY, batch(2, "Cancelled"), |p| p
            .written_documents
            == 0)
        .is_err()
    );
    assert_eq!(writer.metadata().unwrap().committed_generation, 1);
    assert!(
        build_catalog(&database, IDENTITY, batch(2, "Unpublished"), |p| p.stage
            != CatalogStage::Publishing)
        .is_err()
    );
    assert_eq!(writer.metadata().unwrap().committed_generation, 1);
    let mut updated = false;
    assert!(
        build_catalog(&database, IDENTITY, batch(2, "Stale"), |p| {
            if !updated && p.written_documents > 0 {
                writer
                    .refresh(
                        2,
                        [Document::new(
                            format!("{IDENTITY}/edit.ets"),
                            "class LiveEdit {}",
                        )],
                        &[],
                    )
                    .unwrap();
                updated = true;
            }
            true
        })
        .is_err()
    );
    assert_eq!(writer.search("LiveEdit", 10).unwrap().items.len(), 1);
    assert!(writer.search("Stale", 200).unwrap().items.is_empty());
    assert_eq!(writer.search("Old", 200).unwrap().items.len(), 130);
}

#[test]
fn a_large_single_document_reports_committed_rows_before_it_finishes() {
    let directory = temp_dir::TestDir::new("catalog-large-document");
    let database = directory.path().join("symbols-v2.sqlite3");
    let reader = WorkspaceIndex::with_store(CatalogStore::open(&database, IDENTITY).unwrap());
    let document = parse_document_symbols(&Document::new(
        format!("{IDENTITY}/large.ets"),
        format!(
            "export class Target {{}}\n{}",
            "new Target();\n".repeat(40_000)
        ),
    ))
    .unwrap();
    let mut partial_rows = 0;
    build_catalog(
        &database,
        IDENTITY,
        FullCatalogBatch {
            generation: 1,
            documents: vec![document],
            rejected_uris: vec![],
        },
        |p| {
            if p.written_rows > 0 && p.written_documents == 0 {
                partial_rows += 1;
            }
            true
        },
    )
    .unwrap();
    assert!(partial_rows > 1);
    assert_eq!(reader.search("Target", 10).unwrap().served_generation, 1);
}

#[test]
fn unchanged_inputs_reuse_the_catalog_and_an_incremental_edit_invalidates_reuse() {
    let directory = temp_dir::TestDir::new("catalog-reuse");
    let database = directory.path().join("symbols-v2.sqlite3");
    let mut reader = WorkspaceIndex::with_store(CatalogStore::open(&database, IDENTITY).unwrap());
    build_catalog_with_fingerprint(
        &database,
        IDENTITY,
        batch(1, "Old"),
        Some("producer-and-source-hash"),
        |_| true,
    )
    .unwrap();
    let mut reused = false;
    build_catalog_with_fingerprint(
        &database,
        IDENTITY,
        batch(2, "Old"),
        Some("producer-and-source-hash"),
        |p| {
            assert_ne!(p.stage, CatalogStage::Writing);
            reused |= p.stage == CatalogStage::Reusing;
            true
        },
    )
    .unwrap();
    assert!(reused);
    assert_eq!(reader.search("Old", 200).unwrap().served_generation, 2);
    reader
        .refresh(
            3,
            [Document::new(
                format!("{IDENTITY}/edit.ets"),
                "class LiveEdit {}",
            )],
            &[],
        )
        .unwrap();
    let mut wrote = false;
    build_catalog_with_fingerprint(
        &database,
        IDENTITY,
        batch(4, "Old"),
        Some("producer-and-source-hash"),
        |p| {
            assert_ne!(p.stage, CatalogStage::Reusing);
            wrote |= p.written_documents > 0;
            true
        },
    )
    .unwrap();
    assert!(wrote);
    assert_eq!(reader.search("Old", 200).unwrap().served_generation, 4);
    assert!(reader.search("LiveEdit", 10).unwrap().items.is_empty());
}

#[test]
fn invalid_private_data_never_changes_the_published_catalog() {
    let directory = temp_dir::TestDir::new("catalog-invalid");
    let database = directory.path().join("symbols-v2.sqlite3");
    let reader = WorkspaceIndex::with_store(CatalogStore::open(&database, IDENTITY).unwrap());
    build_catalog(&database, IDENTITY, batch(1, "Old"), |_| true).unwrap();
    let mut invalid = batch(2, "Invalid");
    invalid.documents.push(invalid.documents[0].clone());
    assert!(build_catalog(&database, IDENTITY, invalid, |_| true).is_err());
    assert_eq!(reader.metadata().unwrap().committed_generation, 1);
    assert_eq!(reader.search("Old", 200).unwrap().items.len(), 130);
    assert!(reader.search("Invalid", 200).unwrap().items.is_empty());
}

#[test]
fn missing_publication_state_does_not_create_an_empty_catalog_over_existing_generations() {
    let directory = temp_dir::TestDir::new("catalog-missing-control");
    let database = directory.path().join("symbols-v2.sqlite3");
    build_catalog(&database, IDENTITY, batch(1, "Published"), |_| true).unwrap();
    let isolated = directory.path().join("missing-control");
    std::fs::create_dir(&isolated).unwrap();
    let generation = std::fs::read_dir(directory.path())
        .unwrap()
        .filter_map(Result::ok)
        .find(|entry| {
            entry.file_name().to_string_lossy().starts_with("catalog-")
                && entry.path().extension().is_some_and(|e| e == "sqlite3")
                && entry.file_name() != "catalog-state.sqlite3"
        })
        .unwrap();
    std::fs::copy(generation.path(), isolated.join(generation.file_name())).unwrap();
    assert!(CatalogStore::open(isolated.join("symbols-v2.sqlite3"), IDENTITY).is_err());
    assert!(!isolated.join("symbols-v2.sqlite3").exists());
}
