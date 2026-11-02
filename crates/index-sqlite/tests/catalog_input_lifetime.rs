use std::{
    alloc::{GlobalAlloc, Layout, System},
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
};

use arkts_index_core::{Document, FullCatalogBatch, WorkspaceIndex, parse_document_symbols};
use arkts_index_sqlite::{CatalogStage, CatalogStore, build_catalog_with_fingerprint};

#[path = "support/temp_dir.rs"]
mod temp_dir;

struct TrackingAllocator;
#[global_allocator]
static ALLOCATOR: TrackingAllocator = TrackingAllocator;
static TRACKED: AtomicUsize = AtomicUsize::new(0);
static RELEASED: AtomicBool = AtomicBool::new(false);
static TRACKED_VECTOR: AtomicUsize = AtomicUsize::new(0);
static VECTOR_RELEASED: AtomicBool = AtomicBool::new(false);

// Observe only allocations owned by the input String and documents Vec. No allocator callback
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
        let vector = TRACKED_VECTOR.load(Ordering::SeqCst) == pointer as usize;
        unsafe { System.dealloc(pointer, layout) };
        if vector {
            VECTOR_RELEASED.store(true, Ordering::SeqCst);
        }
        if tracked {
            RELEASED.store(true, Ordering::SeqCst);
        }
    }
}

struct Track;
impl Track {
    fn input(batch: &FullCatalogBatch) -> Self {
        let name = &batch.documents[0].symbols[0].name;
        assert!(!name.is_empty());
        RELEASED.store(false, Ordering::SeqCst);
        VECTOR_RELEASED.store(false, Ordering::SeqCst);
        TRACKED_VECTOR.store(batch.documents.as_ptr() as usize, Ordering::SeqCst);
        TRACKED.store(name.as_ptr() as usize, Ordering::SeqCst);
        Self
    }
}
impl Drop for Track {
    fn drop(&mut self) {
        TRACKED.store(0, Ordering::SeqCst);
        TRACKED_VECTOR.store(0, Ordering::SeqCst);
    }
}

const ROOT: &str = "file:///catalog-input-lifetime";
fn batch(generation: u64, name: &str) -> FullCatalogBatch {
    FullCatalogBatch {
        generation,
        documents: vec![
            parse_document_symbols(&Document::new(
                format!("{ROOT}/Target.ets"),
                format!("export class {name} {{}}\nnew {name}();\n"),
            ))
            .unwrap(),
        ],
        rejected_uris: vec![],
    }
}

#[test]
fn private_catalog_releases_written_input_before_validation_without_publishing_early() {
    // Both outcomes run serially in this test binary, avoiding shared tracking
    // state between tests and retaining the cancellation/publication contrast.
    for cancel_at_validation in [false, true] {
        let temp = temp_dir::TestDir::new("catalog-input-lifetime");
        let database = temp.path().join("symbols-v2.sqlite3");
        let reader = WorkspaceIndex::with_store(CatalogStore::open(&database, ROOT).unwrap());
        build_catalog_with_fingerprint(
            &database,
            ROOT,
            batch(1, "OldTracked"),
            Some("old-input"),
            |_| true,
        )
        .unwrap();
        let mut input = batch(2, "NewTracked");
        input.rejected_uris = vec![format!("{ROOT}/Rejected.ets"); 2];
        let tracking = Track::input(&input);
        let mut validating = false;
        let mut wrote = false;
        let outcome =
            build_catalog_with_fingerprint(&database, ROOT, input, Some("new-input"), |progress| {
                if progress.stage == CatalogStage::Committing {
                    wrote = true;
                    assert!(!RELEASED.load(Ordering::SeqCst));
                    assert!(!VECTOR_RELEASED.load(Ordering::SeqCst));
                }
                if progress.stage == CatalogStage::Validating {
                    validating = true;
                    assert!(
                        RELEASED.load(Ordering::SeqCst),
                        "written input String must be deallocated before validating the private DB"
                    );
                    assert!(
                        VECTOR_RELEASED.load(Ordering::SeqCst),
                        "written documents Vec capacity must be released before validation"
                    );
                    let old = reader.search("OldTracked", 10).unwrap();
                    assert_eq!(old.served_generation, 1);
                    assert_eq!(old.items.len(), 1);
                    assert!(reader.search("NewTracked", 10).unwrap().items.is_empty());
                    return !cancel_at_validation;
                }
                true
            });
        assert!(wrote && validating);
        assert!(RELEASED.load(Ordering::SeqCst));
        drop(tracking);
        if cancel_at_validation {
            assert!(outcome.is_err());
            assert_eq!(
                reader.search("OldTracked", 10).unwrap().served_generation,
                1
            );
            assert!(reader.search("NewTracked", 10).unwrap().items.is_empty());
        } else {
            let receipt = outcome.unwrap();
            assert_eq!(receipt.committed_generation, 2);
            assert_eq!(
                receipt.rejected_documents,
                vec![format!("{ROOT}/Rejected.ets")]
            );
            let reopened = WorkspaceIndex::with_store(CatalogStore::open(&database, ROOT).unwrap());
            let symbols = reopened.search("NewTracked", 10).unwrap();
            assert_eq!(symbols.served_generation, 2);
            assert_eq!(symbols.items.len(), 1);
            assert_eq!(
                reopened
                    .search_exports("NewTracked", 10)
                    .unwrap()
                    .items
                    .len(),
                1
            );
            assert!(reopened.search("OldTracked", 10).unwrap().items.is_empty());
        }
    }
}
