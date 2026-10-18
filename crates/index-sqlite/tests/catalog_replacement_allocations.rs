use std::{path::Path, process::Command};

use arkts_index_core::{
    Document, DocumentSymbols, MemoryStore, WorkspaceIndex, parse_document_symbols,
};
use arkts_index_sqlite::SqliteStore;

#[path = "support/sqlite_allocations.rs"]
mod sqlite_allocations;
#[path = "support/temp_dir.rs"]
mod temp_dir;

const ROOT: &str = "file:///catalog-replacement-allocations";
const CHILD_DB: &str = "ARKTS_INDEX_CATALOG_REPLACEMENT_ALLOCATION_TEST_DB";
const TEST_NAME: &str = "catalog_replacement_bounds_sqlite_allocations_and_preserves_queries";
const DOCUMENTS: usize = 1_000;
const COST_CHILD_DB: &str = "ARKTS_INDEX_CATALOG_REPLACEMENT_COST_TEST_DB";
const COST_TEST: &str =
    "large_catalog_replacement_does_not_spend_more_on_removal_than_fresh_activation";
const COST_DOCUMENTS: usize = 100_000;

fn documents(generation: u64) -> Vec<DocumentSymbols> {
    documents_with_count(generation, DOCUMENTS)
}

fn documents_with_count(generation: u64, count: usize) -> Vec<DocumentSymbols> {
    let prefix = if generation == 1 {
        "OldCatalogProbe"
    } else {
        "NewCatalogProbe"
    };
    (0..count).map(|ordinal| {
        let text = format!(
            "export class {prefix}{ordinal:06} {{\n  member: number = {ordinal}\n  build(): number {{ return this.member }}\n}}\n"
        );
        parse_document_symbols(&Document::new(format!("{ROOT}/File{ordinal:06}.ets"), text))
            .expect("catalog fixture should parse completely")
    }).collect()
}

fn timing(record: &str, key: &str) -> f64 {
    let prefix = format!("\"{key}\":");
    record
        .trim_start_matches('{')
        .trim_end_matches('}')
        .split(',')
        .find_map(|field| field.strip_prefix(&prefix))
        .expect("public SQL trace field")
        .parse()
        .expect("finite timing")
}

#[test]
fn large_catalog_replacement_does_not_spend_more_on_removal_than_fresh_activation() {
    if let Some(database) = std::env::var_os(COST_CHILD_DB) {
        for generation in [1, 2] {
            let mut index =
                WorkspaceIndex::with_store(SqliteStore::open(Path::new(&database), ROOT).unwrap());
            index
                .activate_catalog(
                    generation,
                    documents_with_count(generation, COST_DOCUMENTS),
                    vec![],
                )
                .expect("complete atomic catalog replacement");
            let expected = if generation == 1 {
                "OldCatalogProbe"
            } else {
                "NewCatalogProbe"
            };
            let opposite = if generation == 1 {
                "NewCatalogProbe"
            } else {
                "OldCatalogProbe"
            };
            let current = index.search(expected, COST_DOCUMENTS + 1).unwrap();
            assert_eq!(current.served_generation, generation);
            assert_eq!(current.items.len(), COST_DOCUMENTS);
            assert!(
                current
                    .items
                    .iter()
                    .all(|item| item.name.starts_with(expected))
            );
            assert!(
                index
                    .search(opposite, COST_DOCUMENTS + 1)
                    .unwrap()
                    .items
                    .is_empty()
            );
        }
        let trace = std::fs::read_to_string(
            std::env::var_os("ARKTS_INDEX_CATALOG_SQL_TRACE_FILE").unwrap(),
        )
        .unwrap();
        let records: Vec<_> = trace.lines().collect();
        assert_eq!(
            records.len(),
            2,
            "one actual committed trace per generation"
        );
        let cold = timing(records[0], "totalMs");
        let removal = timing(records[1], "deleteDocumentsMs");
        assert!(cold.is_finite() && cold > 0.0 && removal.is_finite() && removal > 0.0);
        println!("CATALOG_REPLACEMENT_COST_MS cold={cold} warm_removal={removal}");
        assert!(
            removal <= cold,
            "warm catalog removal {removal}ms alone exceeds complete fresh activation {cold}ms"
        );
        return;
    }
    let directory = temp_dir::TestDir::new("catalog-replacement-cost");
    let output = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", COST_TEST, "--nocapture"])
        .env(COST_CHILD_DB, directory.path().join("catalog.sqlite3"))
        .env(
            "ARKTS_INDEX_CATALOG_SQL_TRACE_FILE",
            directory.path().join("sql.ndjson"),
        )
        .env_remove("ARKTS_INDEX_CATALOG_STAGE_TRACE_FILE")
        .env_remove("ARKTS_INDEX_CATALOG_STORAGE_TRACE_FILE")
        .output()
        .expect("real full-scale public catalog cost regression");
    let transcript = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    print!("{transcript}");
    assert!(
        output.status.success(),
        "public large catalog cost contract failed: {transcript}"
    );
}

fn characterize(index: &WorkspaceIndex, generation: u64) {
    let expected = if generation == 1 {
        "OldCatalogProbe"
    } else {
        "NewCatalogProbe"
    };
    let opposite = if generation == 1 {
        "NewCatalogProbe"
    } else {
        "OldCatalogProbe"
    };
    let current = index
        .search(expected, DOCUMENTS + 1)
        .expect("current substring query");
    assert_eq!(current.served_generation, generation);
    assert_eq!(current.items.len(), DOCUMENTS);
    assert!(
        current
            .items
            .iter()
            .all(|item| item.name.starts_with(expected))
    );
    assert!(
        index
            .search(opposite, DOCUMENTS + 1)
            .expect("old substring query")
            .items
            .is_empty()
    );
    let exports = index
        .search_exports(expected, DOCUMENTS + 1)
        .expect("current exports");
    assert_eq!(exports.served_generation, generation);
    assert_eq!(exports.items.len(), DOCUMENTS);
}

fn exercise(database: &Path) {
    sqlite_allocations::install_before_sqlite_initialization();
    let mut baseline = WorkspaceIndex::with_store(MemoryStore::default());
    let mut counts = Vec::new();
    for generation in [1, 2] {
        let parsed = documents(generation);
        baseline
            .activate_catalog(generation, parsed.clone(), vec![])
            .expect("memory catalog");
        let mut index =
            WorkspaceIndex::with_store(SqliteStore::open(database, ROOT).expect("SQLite catalog"));
        let (receipt, count) =
            sqlite_allocations::measure(|| index.activate_catalog(generation, parsed, vec![]));
        assert_eq!(
            receipt
                .expect("complete atomic catalog")
                .committed_generation,
            generation
        );
        assert!(count > 0, "must observe real SQLite allocation requests");
        characterize(&index, generation);
        assert_eq!(
            index.search("CatalogProbe", DOCUMENTS + 1).unwrap(),
            baseline.search("CatalogProbe", DOCUMENTS + 1).unwrap()
        );
        drop(index);
        let reopened = WorkspaceIndex::with_store(
            SqliteStore::open(database, ROOT).expect("reopened catalog"),
        );
        characterize(&reopened, generation);
        counts.push(count);
    }
    println!(
        "CATALOG_SQLITE_ALLOCATION_REQUESTS cold={} warm={}",
        counts[0], counts[1]
    );
    // Replacement may pay removal plus reinsertion, but not unbounded per-row FTS churn.
    assert!(
        counts[1] <= counts[0] * 2,
        "warm replacement SQLite allocations {} exceed twice fresh activation {}",
        counts[1],
        counts[0]
    );
}

#[test]
fn catalog_replacement_bounds_sqlite_allocations_and_preserves_queries() {
    if let Some(database) = std::env::var_os(CHILD_DB) {
        exercise(Path::new(&database));
        return;
    }
    let directory = temp_dir::TestDir::new("catalog-replacement-allocations");
    let output = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", TEST_NAME, "--nocapture"])
        .env(CHILD_DB, directory.path().join("catalog.sqlite3"))
        .env_remove("ARKTS_INDEX_CATALOG_SQL_TRACE_FILE")
        .env_remove("ARKTS_INDEX_CATALOG_STAGE_TRACE_FILE")
        .env_remove("ARKTS_INDEX_CATALOG_STORAGE_TRACE_FILE")
        .output()
        .expect("isolated real SQLite allocation probe");
    let transcript = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    print!("{transcript}");
    assert!(
        output.status.success(),
        "public catalog resource contract failed: {transcript}"
    );
}
