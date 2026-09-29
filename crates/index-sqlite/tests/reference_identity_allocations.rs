use std::{
    alloc::{GlobalAlloc, Layout, System},
    cell::Cell,
    collections::BTreeSet,
    path::Path,
    process::Command,
};

use arkts_index_core::{
    Document, DocumentSymbols, MemoryStore, Position, ReferenceCandidateQuery,
    ReferenceOccurrenceIdentity, WorkspaceIndex, parse_document_symbols,
};
use arkts_index_sqlite::SqliteStore;

#[path = "support/temp_dir.rs"]
mod temp_dir;
use temp_dir::TestDir;

const ROOT: &str = "file:///identity-allocations";
const TARGET: &str = "file:///identity-allocations/Target.ets";
const CHILD_DB: &str = "ARKTS_INDEX_REFERENCE_IDENTITY_ALLOCATION_TEST_DB";
const TEST_NAME: &str =
    "catalog_activation_bounds_rust_allocations_and_preserves_reference_identity";
const CONSUMERS: usize = 33;
const MEMBERS_PER_CONSUMER: usize = 31;
const ALLOCATIONS_PER_IDENTITY: usize = 3;
const FIXED_ACTIVATION_ALLOWANCE: usize = 512;
const OBSERVER_ENVIRONMENTS: [&str; 5] = [
    "ARKTS_INDEX_CATALOG_STAGE_TRACE_FILE",
    "ARKTS_INDEX_CATALOG_SQL_TRACE_FILE",
    "ARKTS_INDEX_CATALOG_STORAGE_TRACE_FILE",
    "ARKTS_INDEX_REFERENCE_INSERT_TRACE_FILE",
    "ARKTS_INDEX_REFERENCE_TRACE",
];

struct CountingAllocator;

#[global_allocator]
static ALLOCATOR: CountingAllocator = CountingAllocator;

thread_local! {
    static ALLOCATION_COUNT: Cell<Option<usize>> = const { Cell::new(None) };
}

fn record_allocation() {
    let _ = ALLOCATION_COUNT.try_with(|count| {
        if let Some(current) = count.get() {
            count.set(Some(current.saturating_add(1)));
        }
    });
}

// Count allocation and reallocation requests only on the measured test thread.
// System retains ownership of every allocation; C/SQLite allocations are excluded.
unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        record_allocation();
        unsafe { System.alloc(layout) }
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        record_allocation();
        unsafe { System.alloc_zeroed(layout) }
    }

    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, size: usize) -> *mut u8 {
        record_allocation();
        unsafe { System.realloc(pointer, layout, size) }
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        unsafe { System.dealloc(pointer, layout) }
    }
}

struct AllocationScope;

impl Drop for AllocationScope {
    fn drop(&mut self) {
        ALLOCATION_COUNT.with(|count| count.set(None));
    }
}

fn count_allocations<T>(operation: impl FnOnce() -> T) -> (T, usize) {
    ALLOCATION_COUNT.with(|count| {
        assert!(count.get().is_none(), "allocation scopes must not overlap");
        count.set(Some(0));
    });
    let scope = AllocationScope;
    let result = operation();
    let allocations = ALLOCATION_COUNT.with(|count| count.get().unwrap());
    drop(scope);
    (result, allocations)
}

fn parsed(uri: impl Into<String>, source: impl Into<String>) -> DocumentSymbols {
    parse_document_symbols(&Document::new(uri, source))
        .expect("generated reference fixture should be parseable")
}

fn documents() -> Vec<DocumentSymbols> {
    let mut documents = vec![
        parsed(TARGET, "export class Thing {}\nexport class Decoy {}\n"),
        parsed(
            format!("{ROOT}/Barrel.ets"),
            "export { Thing as PublicThing } from './Target'\n",
        ),
    ];
    for ordinal in 0..CONSUMERS {
        let mut source = String::from(
            "import { PublicThing as Alias } from './Barrel'\n\
             new Alias()\n\
             new Alias()\n\
             Namespace.Decoy\n\
             Namespace.Decoy\n\
             OtherNamespace.Decoy\n",
        );
        for member in 0..MEMBERS_PER_CONSUMER {
            source.push_str(&format!(
                "Alias.member{member:03}\nAlias.member{member:03}\n"
            ));
        }
        documents.push(parsed(format!("{ROOT}/Consumer{ordinal:03}.ets"), source));
    }
    documents
}

fn query(line: u32) -> ReferenceCandidateQuery {
    ReferenceCandidateQuery {
        declaration_uri: TARGET.to_owned(),
        declaration_position: Position::new(line, 14),
        limit: 256,
    }
}

fn characterize_activation(database: &Path) {
    let documents = documents();
    let occurrence_count: usize = documents.iter().map(|doc| doc.occurrences.len()).sum();
    let identity_count: usize = documents
        .iter()
        .map(|document| {
            document
                .occurrences
                .iter()
                .map(ReferenceOccurrenceIdentity::from)
                .collect::<BTreeSet<_>>()
                .len()
        })
        .sum();
    let alias_count: usize = documents.iter().map(|doc| doc.aliases.len()).sum();
    let binding_count: usize = documents.iter().map(|doc| doc.bindings.len()).sum();
    assert!(
        identity_count > 2 * 256,
        "fixture must cross several full batches"
    );
    assert_ne!(identity_count % 256, 0, "fixture must have a nonempty tail");
    assert!(
        occurrence_count > identity_count,
        "fixture must exercise deduplication"
    );
    assert!(
        alias_count > 0 && binding_count > 0,
        "fixture must exercise aliases and bindings"
    );
    assert!(documents.iter().any(|document| {
        document
            .occurrences
            .iter()
            .any(|occurrence| occurrence.qualified == Some(true) && occurrence.qualifier.is_some())
    }));

    let mut memory = WorkspaceIndex::with_store(MemoryStore::default());
    let expected_report = memory
        .activate_catalog(1, documents.clone(), vec![])
        .unwrap();
    let expected = memory.search_reference_candidates(query(0)).unwrap();
    let expected_qualified = memory.search_reference_candidates(query(1)).unwrap();
    assert!(expected.identity_complete, "{expected:#?}");
    assert_eq!(expected.identity_uris.len(), CONSUMERS + 2);
    assert_eq!(expected.served_generation, 1);

    let mut sqlite = WorkspaceIndex::with_store(
        SqliteStore::open(database, ROOT).expect("SQLite store should open before measurement"),
    );
    // Parsing, fixture census, reference expectations and opening are outside this scope.
    let (result, allocations) = count_allocations(|| sqlite.activate_catalog(1, documents, vec![]));
    let budget = identity_count * ALLOCATIONS_PER_IDENTITY + FIXED_ACTIVATION_ALLOWANCE;
    eprintln!(
        "catalog activation allocation cost: documents={} occurrences={occurrence_count} \
         identities={identity_count} aliases={alias_count} bindings={binding_count} \
         rust_allocations={allocations} budget={budget}",
        CONSUMERS + 2,
    );
    assert_eq!(
        result.expect("measured SQLite activation should commit"),
        expected_report
    );
    assert_eq!(
        sqlite.search_reference_candidates(query(0)).unwrap(),
        expected
    );
    assert_eq!(
        sqlite.search_reference_candidates(query(1)).unwrap(),
        expected_qualified,
        "qualified occurrences must preserve the same conservative candidate proof",
    );
    drop(sqlite);

    let reopened = WorkspaceIndex::with_store(
        SqliteStore::open(database, ROOT).expect("SQLite store should reopen after measurement"),
    );
    assert_eq!(
        reopened.search_reference_candidates(query(0)).unwrap(),
        expected
    );
    assert_eq!(
        reopened.search_reference_candidates(query(1)).unwrap(),
        expected_qualified,
        "reopen must retain distinct qualification and alias identities",
    );
    assert!(
        allocations <= budget,
        "public catalog activation allocated {allocations} times; budget is {budget} \
         for {identity_count} reference identities",
    );
}

#[test]
fn catalog_activation_bounds_rust_allocations_and_preserves_reference_identity() {
    if let Some(database) = std::env::var_os(CHILD_DB) {
        characterize_activation(Path::new(&database));
        return;
    }

    let directory = TestDir::new("reference-identity-allocations");
    let database = directory.path().join("catalog.sqlite3");
    let mut command = Command::new(std::env::current_exe().unwrap());
    command
        .args(["--exact", TEST_NAME, "--nocapture"])
        .current_dir(directory.path())
        .env(CHILD_DB, &database);
    for name in OBSERVER_ENVIRONMENTS {
        command.env_remove(name);
    }
    let output = command
        .output()
        .expect("allocation characterization child should start");
    eprint!("{}", String::from_utf8_lossy(&output.stderr));
    assert!(
        output.status.success(),
        "allocation characterization child failed: {}\nstdout:\n{}\nstderr:\n{}",
        output.status,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
    );
}
