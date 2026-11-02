use arkts_index_core::{Document, parse_document_symbols};
use arkts_index_sqlite::{CatalogBuildSession, CatalogInput, CatalogStage, CompleteScanInputs};
use std::cell::Cell;
#[path = "support/temp_dir.rs"]
mod temp_dir;
const ROOT: &str = "file:///lazy-catalog";
fn document() -> arkts_index_core::DocumentSymbols {
    parse_document_symbols(&Document::new(
        format!("{ROOT}/Target.ets"),
        "export class Target {}",
    ))
    .unwrap()
}
#[test]
fn unchanged_catalog_never_invokes_the_lazy_payload_factory() {
    let temp = temp_dir::TestDir::new("lazy-factory");
    let database = temp.path().join("symbols-v2.sqlite3");
    let mut inputs = CompleteScanInputs::new().unwrap();
    inputs.record(&format!("{ROOT}/Target.ets"), "export class Target {}");
    let key = inputs.finish().unwrap();
    CatalogBuildSession::begin(&database, ROOT, 1)
        .unwrap()
        .build_stream(
            None,
            || {
                Ok(vec![
                    Ok(CatalogInput::Document(Box::new(document()))),
                    Ok(CatalogInput::Complete),
                ])
            },
            || Ok(Some(key.clone())),
            |_| true,
        )
        .unwrap();
    let calls = Cell::new(0);
    let result = CatalogBuildSession::begin(&database, ROOT, 2)
        .unwrap()
        .build_stream(
            Some(&key),
            || {
                calls.set(calls.get() + 1);
                Ok(vec![
                    Ok(CatalogInput::Document(Box::new(document()))),
                    Ok(CatalogInput::Complete),
                ])
            },
            || panic!("reuse must not finalize a producer that never ran"),
            |progress| {
                assert!(matches!(
                    progress.stage,
                    CatalogStage::Reusing | CatalogStage::Checking | CatalogStage::Publishing
                ));
                true
            },
        )
        .unwrap();
    assert_eq!(result.committed_generation, 2);
    assert_eq!(calls.get(), 0, "reuse must not invoke the input factory");
}
