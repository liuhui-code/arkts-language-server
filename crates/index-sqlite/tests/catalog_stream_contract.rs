use arkts_index_core::{
    Document, FullCatalogBatch, StoreError, StoreErrorKind, WorkspaceIndex, parse_document_symbols,
};
use arkts_index_sqlite::{
    CatalogInput, CatalogStage, CatalogStore, build_catalog, build_catalog_stream,
};
use std::{cell::Cell, panic::AssertUnwindSafe};

#[path = "support/temp_dir.rs"]
mod temp_dir;
const ROOT: &str = "file:///catalog-stream-contract";

fn document(index: usize) -> arkts_index_core::DocumentSymbols {
    parse_document_symbols(&Document::new(
        format!("{ROOT}/{index:04}.ets"),
        format!("export class Stream{index} {{}}"),
    ))
    .unwrap()
}
fn event(index: usize) -> Result<CatalogInput, StoreError> {
    Ok(CatalogInput::Document(Box::new(document(index))))
}
fn seed(database: &std::path::Path) -> WorkspaceIndex {
    let reader = WorkspaceIndex::with_store(CatalogStore::open(database, ROOT).unwrap());
    build_catalog(
        database,
        ROOT,
        FullCatalogBatch {
            generation: 1,
            documents: vec![document(9999)],
            rejected_uris: vec![],
        },
        |_| true,
    )
    .unwrap();
    reader
}
fn assert_old(reader: &WorkspaceIndex) {
    let old = reader.search("Stream9999", 10).unwrap();
    assert_eq!(old.served_generation, 1);
    assert_eq!(old.items.len(), 1);
    assert!(reader.search("Stream0", 10).unwrap().items.is_empty());
}

#[test]
fn incomplete_failed_trailing_and_out_of_order_streams_never_publish() {
    for failure in ["eof", "error", "trailing", "ordering", "duplicate"] {
        let temp = temp_dir::TestDir::new(failure);
        let database = temp.path().join("symbols-v2.sqlite3");
        let reader = seed(&database);
        // All invalid endings occur after at least one private batch was committed.
        let prefix = (0..64).map(event);
        let suffix = match failure {
            "eof" => vec![],
            "error" => vec![Err(StoreError::new(
                StoreErrorKind::Internal,
                "producer failed",
            ))],
            "trailing" => vec![Ok(CatalogInput::Complete), event(64)],
            "ordering" => vec![event(1), Ok(CatalogInput::Complete)],
            "duplicate" => vec![event(63), Ok(CatalogInput::Complete)],
            _ => unreachable!(),
        };
        assert!(build_catalog_stream(&database, ROOT, 2, prefix.chain(suffix), |_| true).is_err());
        assert_old(&reader);
        assert_old(&WorkspaceIndex::with_store(
            CatalogStore::open(&database, ROOT).unwrap(),
        ));
    }
}

#[test]
fn complete_stream_preserves_rejections_and_cumulative_committed_progress() {
    let temp = temp_dir::TestDir::new("catalog-stream-complete");
    let database = temp.path().join("symbols-v2.sqlite3");
    let reader = seed(&database);
    let rejected = format!("{ROOT}/Rejected.ets");
    let input = (0..65).map(event).chain([
        Ok(CatalogInput::Rejected(rejected.clone())),
        Ok(CatalogInput::Rejected(rejected.clone())),
        Ok(CatalogInput::Complete),
    ]);
    let mut previous = 0;
    let mut checks = 0;
    let receipt = build_catalog_stream(&database, ROOT, 2, input, |progress| {
        assert!(progress.written_documents >= previous);
        previous = progress.written_documents;
        if matches!(
            progress.stage,
            CatalogStage::Validating | CatalogStage::Checking
        ) {
            checks += 1;
            assert_eq!(progress.written_documents, 65);
            assert_old(&reader);
        }
        true
    })
    .unwrap();
    assert_eq!(checks, 2);
    assert_eq!(receipt.rejected_documents, vec![rejected]);
    assert_eq!(reader.search("Stream64", 10).unwrap().served_generation, 2);
}

#[test]
fn cancellation_stops_producer_polls_and_panic_never_publishes() {
    for panic in [false, true] {
        let temp = temp_dir::TestDir::new("catalog-stream-stop");
        let database = temp.path().join("symbols-v2.sqlite3");
        let reader = seed(&database);
        let polls = Cell::new(0);
        let input = (0..65).map(|index| {
            polls.set(polls.get() + 1);
            assert!(!(panic && index == 64), "producer panic");
            event(index)
        });
        let outcome = std::panic::catch_unwind(AssertUnwindSafe(|| {
            build_catalog_stream(&database, ROOT, 2, input, |progress| {
                panic || progress.written_documents < 64
            })
        }));
        if panic {
            assert!(outcome.is_err());
            assert_eq!(polls.get(), 65);
        } else {
            assert!(outcome.unwrap().is_err());
            assert_eq!(polls.get(), 64);
        }
        assert_old(&reader);
    }
}

#[test]
fn cancellation_while_receiving_complete_prevents_the_final_eof_poll() {
    let temp = temp_dir::TestDir::new("catalog-stream-complete-cancel");
    let database = temp.path().join("symbols-v2.sqlite3");
    let reader = seed(&database);
    let cancelled = Cell::new(false);
    let polls = Cell::new(0);
    let input = std::iter::from_fn(|| {
        let poll = polls.get();
        polls.set(poll + 1);
        match poll {
            0 => Some(event(0)),
            1 => {
                cancelled.set(true);
                Some(Ok(CatalogInput::Complete))
            }
            _ => None,
        }
    });
    let result = build_catalog_stream(&database, ROOT, 2, input, |_| !cancelled.get());
    assert!(result.is_err());
    assert_eq!(polls.get(), 2, "cancelled consumer must not poll for EOF");
    assert_old(&reader);
}
