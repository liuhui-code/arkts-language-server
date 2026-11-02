use arkts_index_core::{
    Document, FullCatalogBatch, StoreError, StoreErrorKind, WorkspaceIndex, parse_document_symbols,
};
use arkts_index_sqlite::{
    CatalogBuildSession, CatalogInput, CatalogStage, CatalogStore, CompleteScanFingerprint,
    CompleteScanInputs, build_catalog_with_fingerprint,
};
use std::{cell::Cell, panic::AssertUnwindSafe, path::Path};
#[path = "support/temp_dir.rs"]
mod temp_dir;
const ROOT: &str = "file:///session-contract";
fn uri() -> String {
    format!("{ROOT}/Target.ets")
}
fn source(name: &str) -> String {
    format!("export class {name} {{}}")
}
fn document(name: &str) -> arkts_index_core::DocumentSymbols {
    parse_document_symbols(&Document::new(uri(), source(name))).unwrap()
}
fn events(name: &str) -> Vec<Result<CatalogInput, StoreError>> {
    vec![
        Ok(CatalogInput::Document(Box::new(document(name)))),
        Ok(CatalogInput::Complete),
    ]
}
fn key(name: &str) -> CompleteScanFingerprint {
    let mut inputs = CompleteScanInputs::new().unwrap();
    inputs.record(&uri(), &source(name));
    inputs.finish().unwrap()
}
fn seed(database: &Path) -> CompleteScanFingerprint {
    let key = key("OldMarker");
    CatalogBuildSession::begin(database, ROOT, 1)
        .unwrap()
        .build_stream(
            None,
            || Ok(events("OldMarker")),
            || Ok(Some(key.clone())),
            |_| true,
        )
        .unwrap();
    key
}
fn assert_generation(database: &Path, name: &str, generation: u64) {
    let index = WorkspaceIndex::with_store(CatalogStore::open(database, ROOT).unwrap());
    let result = index.search(name, 10).unwrap();
    assert_eq!(result.served_generation, generation);
    assert_eq!(result.items.len(), 1);
}
fn active(database: &Path) -> String {
    rusqlite::Connection::open(database.with_file_name("catalog-state.sqlite3"))
        .unwrap()
        .query_row(
            "SELECT database_name FROM catalog_state WHERE id=1",
            [],
            |row| row.get(0),
        )
        .unwrap()
}

#[test]
fn matching_key_keeps_physical_database_and_miss_invokes_factory_once() {
    let temp = temp_dir::TestDir::new("session-hit-miss");
    let database = temp.path().join("symbols-v2.sqlite3");
    let old = seed(&database);
    let physical = active(&database);
    let hit = CatalogBuildSession::begin(&database, ROOT, 2).unwrap();
    assert!(
        hit.has_qualified_reuse_candidate(CompleteScanInputs::new().unwrap().producer_key())
            .unwrap()
    );
    hit.build_stream(
        Some(&old),
        || -> Result<Vec<Result<CatalogInput, StoreError>>, StoreError> {
            panic!("hit must not create a producer")
        },
        || panic!("hit must not finalize"),
        |_| true,
    )
    .unwrap();
    assert_eq!(active(&database), physical);
    let new = key("NewMarker");
    let calls = Cell::new(0);
    CatalogBuildSession::begin(&database, ROOT, 3)
        .unwrap()
        .build_stream(
            Some(&new),
            || {
                calls.set(calls.get() + 1);
                Ok(events("NewMarker"))
            },
            || Ok(Some(new.clone())),
            |_| true,
        )
        .unwrap();
    assert_eq!(calls.get(), 1);
    assert_ne!(active(&database), physical);
    assert_generation(&database, "NewMarker", 3);
}

#[test]
fn session_cannot_overwrite_a_parent_that_changed_during_input_preparation() {
    for reuse in [false, true] {
        let temp = temp_dir::TestDir::new("session-parent-fence");
        let database = temp.path().join("symbols-v2.sqlite3");
        let old = seed(&database);
        let pinned = CatalogBuildSession::begin(&database, ROOT, 3).unwrap();
        build_catalog_with_fingerprint(
            &database,
            ROOT,
            FullCatalogBatch {
                generation: 2,
                documents: vec![document("NewMarker")],
                rejected_uris: vec![],
            },
            None,
            |_| true,
        )
        .unwrap();
        let result = pinned.build_stream(
            reuse.then_some(&old),
            || Ok(events("OldMarker")),
            || Ok(Some(old.clone())),
            |_| true,
        );
        assert!(result.is_err());
        assert_generation(&database, "NewMarker", 2);
    }
}

#[test]
fn cancellation_checks_before_factory_and_during_reuse_source_checking() {
    for reuse in [false, true] {
        let temp = temp_dir::TestDir::new("session-cancel");
        let database = temp.path().join("symbols-v2.sqlite3");
        let old = seed(&database);
        let calls = Cell::new(0);
        let result = CatalogBuildSession::begin(&database, ROOT, 2)
            .unwrap()
            .build_stream(
                reuse.then_some(&old),
                || {
                    calls.set(calls.get() + 1);
                    Ok(events("OldMarker"))
                },
                || panic!("cancelled session cannot finalize"),
                |progress| {
                    if reuse {
                        progress.stage != CatalogStage::Checking
                    } else {
                        false
                    }
                },
            );
        assert!(result.is_err());
        assert_eq!(calls.get(), 0);
        assert_generation(&database, "OldMarker", 1);
    }
}

#[test]
fn factory_failure_and_finalizer_failure_or_panic_never_publish() {
    for failure in ["factory", "finalizer", "panic"] {
        let temp = temp_dir::TestDir::new(failure);
        let database = temp.path().join("symbols-v2.sqlite3");
        seed(&database);
        let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
            CatalogBuildSession::begin(&database, ROOT, 2)
                .unwrap()
                .build_stream(
                    None,
                    || {
                        if failure == "factory" {
                            Err(StoreError::new(StoreErrorKind::Internal, "factory failure"))
                        } else {
                            Ok(events("NewMarker"))
                        }
                    },
                    || {
                        assert_ne!(failure, "panic", "finalizer panic");
                        Err(StoreError::new(
                            StoreErrorKind::Internal,
                            "finalizer failure",
                        ))
                    },
                    |_| true,
                )
        }));
        if failure == "panic" {
            assert!(result.is_err());
        } else {
            assert!(result.unwrap().is_err());
        }
        assert_generation(&database, "OldMarker", 1);
    }
}

#[test]
fn old_raw_opaque_values_still_reuse_but_cannot_impersonate_complete_scan_keys() {
    let qualified = key("OldMarker");
    for legacy in [
        "old-opaque-value".to_owned(),
        qualified.to_string(),
        format!("arkts-legacy-fingerprint-v2:{}", qualified),
    ] {
        let temp = temp_dir::TestDir::new("legacy-key-isolation");
        let database = temp.path().join("symbols-v2.sqlite3");
        for generation in [1, 2] {
            let mut reused = false;
            build_catalog_with_fingerprint(
                &database,
                ROOT,
                FullCatalogBatch {
                    generation,
                    documents: vec![document("OldMarker")],
                    rejected_uris: vec![],
                },
                Some(&legacy),
                |progress| {
                    reused |= progress.stage == CatalogStage::Reusing;
                    true
                },
            )
            .unwrap();
            assert_eq!(reused, generation == 2);
            if generation == 1 && legacy == "old-opaque-value" {
                // Characterize the historical pre-domain on-disk representation explicitly.
                rusqlite::Connection::open(database.with_file_name("catalog-state.sqlite3"))
                    .unwrap()
                    .execute(
                        "UPDATE catalog_state SET fingerprint=?1 WHERE id=1",
                        [&legacy],
                    )
                    .unwrap();
            }
        }
        let session = CatalogBuildSession::begin(&database, ROOT, 3).unwrap();
        assert!(
            !session
                .has_qualified_reuse_candidate(CompleteScanInputs::new().unwrap().producer_key())
                .unwrap()
        );
        let calls = Cell::new(0);
        session
            .build_stream(
                Some(&qualified),
                || {
                    calls.set(calls.get() + 1);
                    Ok(events("OldMarker"))
                },
                || Ok(Some(qualified.clone())),
                |_| true,
            )
            .unwrap();
        assert_eq!(calls.get(), 1);
    }
}

#[test]
fn incomplete_or_duplicate_inputs_and_parser_rejections_never_issue_qualified_key() {
    let mut incomplete = CompleteScanInputs::new().unwrap();
    incomplete.record(&uri(), &source("OldMarker"));
    incomplete.invalidate();
    assert!(incomplete.finish().is_none());
    let mut duplicate = CompleteScanInputs::new().unwrap();
    duplicate.record(&uri(), &source("OldMarker"));
    duplicate.record(&uri(), &source("OldMarker"));
    assert!(duplicate.finish().is_none());
    let temp = temp_dir::TestDir::new("session-reject-key");
    let database = temp.path().join("symbols-v2.sqlite3");
    let key = key("OldMarker");
    CatalogBuildSession::begin(&database, ROOT, 1)
        .unwrap()
        .build_stream(
            None,
            || {
                Ok([
                    Ok(CatalogInput::Document(Box::new(document("OldMarker")))),
                    Ok(CatalogInput::Rejected(format!("{ROOT}/Rejected.ets"))),
                    Ok(CatalogInput::Complete),
                ])
            },
            || Ok(Some(key)),
            |_| true,
        )
        .unwrap();
    assert!(
        !CatalogBuildSession::begin(&database, ROOT, 2)
            .unwrap()
            .has_qualified_reuse_candidate(CompleteScanInputs::new().unwrap().producer_key())
            .unwrap()
    );
}
