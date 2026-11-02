use std::{
    alloc::{GlobalAlloc, Layout, System},
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
};

use arkts_index_core::{Document, FullCatalogBatch, WorkspaceIndex, parse_document_symbols};
use arkts_index_sqlite::{CatalogStore, build_catalog_with_fingerprint};

#[path = "support/temp_dir.rs"]
mod temp_dir;

struct TrackingAllocator;
#[global_allocator]
static ALLOCATOR: TrackingAllocator = TrackingAllocator;
static TRACKED: AtomicUsize = AtomicUsize::new(0);
static RELEASED: AtomicBool = AtomicBool::new(false);

// Observe only the first document symbol-name allocation. No allocator callback
// allocates, logs, locks, or dereferences the pointer; System owns every buffer.
unsafe impl GlobalAlloc for TrackingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        unsafe { System.alloc(layout) }
    }
    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        unsafe { System.alloc_zeroed(layout) }
    }
    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, size: usize) -> *mut u8 {
        unsafe { System.realloc(pointer, layout, size) }
    }
    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        let tracked = TRACKED.load(Ordering::SeqCst) == pointer as usize;
        unsafe { System.dealloc(pointer, layout) };
        if tracked {
            RELEASED.store(true, Ordering::SeqCst);
        }
    }
}

use arkts_index_sqlite::{CatalogInput, build_catalog_stream};
fn build_stream(
    database: &std::path::Path,
    input: impl Iterator<Item = CatalogInput>,
) -> Result<arkts_index_core::CommitReceipt, arkts_index_core::StoreError> {
    build_catalog_stream(database, ROOT, 2, input.map(Ok), |_| true)
}
const ROOT: &str = "file:///catalog-stream";
fn document(index: usize) -> arkts_index_core::DocumentSymbols {
    parse_document_symbols(&Document::new(
        format!("{ROOT}/{index:04}.ets"),
        format!("export class Stream{index} {{}}"),
    ))
    .unwrap()
}
#[test]
fn consumed_chunk_is_released_before_producer_is_polled_again() {
    let temp = temp_dir::TestDir::new("catalog-stream-lifetime");
    let database = temp.path().join("symbols-v2.sqlite3");
    let reader = WorkspaceIndex::with_store(CatalogStore::open(&database, ROOT).unwrap());
    build_catalog_with_fingerprint(
        &database,
        ROOT,
        FullCatalogBatch {
            generation: 1,
            documents: vec![document(9999)],
            rejected_uris: vec![],
        },
        None,
        |_| true,
    )
    .unwrap();
    let first = document(0);
    TRACKED.store(first.symbols[0].name.as_ptr() as usize, Ordering::SeqCst);
    RELEASED.store(false, Ordering::SeqCst);
    let mut first = Some(first);
    let input = (0..=65).map(|index| {
        if index == 64 {
            assert!(
                RELEASED.load(Ordering::SeqCst),
                "first committed chunk payload must be released before requesting next chunk"
            );
            let old = reader.search("Stream9999", 10).unwrap();
            assert_eq!(old.served_generation, 1);
            assert_eq!(old.items.len(), 1);
            assert!(reader.search("Stream0", 10).unwrap().items.is_empty());
        }
        match index {
            0 => CatalogInput::Document(Box::new(first.take().unwrap())),
            65 => CatalogInput::Complete,
            _ => CatalogInput::Document(Box::new(document(index))),
        }
    });
    let receipt = build_stream(&database, input).unwrap();
    TRACKED.store(0, Ordering::SeqCst);
    assert_eq!(receipt.committed_generation, 2);
    assert_eq!(reader.search("Stream64", 10).unwrap().items.len(), 1);
    assert!(reader.search("Stream9999", 10).unwrap().items.is_empty());
}
