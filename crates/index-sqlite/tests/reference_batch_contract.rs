use std::{
    fs,
    path::{Path, PathBuf},
    process,
    time::{SystemTime, UNIX_EPOCH},
};

use arkts_index_core::{
    Document, DocumentSymbols, MemoryStore, Position, ReferenceCandidateQuery, WorkspaceIndex,
    parse_document_symbols,
};
use arkts_index_sqlite::SqliteStore;

const ROOT: &str = "file:///workspace";
const TARGET: &str = "file:///workspace/Target.ets";
const BARREL: &str = "file:///workspace/Barrel.ets";
const CONSUMER_COUNT: usize = 120;

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "arkts-index-reference-batch-{}-{nonce}",
            process::id()
        ));
        fs::create_dir_all(&path).expect("test directory should be created");
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn parsed(uri: impl Into<String>, source: impl Into<String>) -> DocumentSymbols {
    parse_document_symbols(&Document::new(uri, source))
        .expect("generated ArkTS source should be parseable")
}

fn catalog(consumer_count: usize, alias: &str) -> Vec<DocumentSymbols> {
    let mut documents = vec![
        parsed(TARGET, "export class Thing {}\nexport class Decoy {}\n"),
        parsed(BARREL, "export { Thing as PublicThing } from './Target'\n"),
    ];
    for number in 0..consumer_count {
        documents.push(parsed(
            format!("{ROOT}/Consumer{number:03}.ets"),
            format!(
                "import {{ PublicThing as {alias} }} from './Barrel'\n\
                 const value = new {alias}()\n\
                 const unrelated = Namespace.Decoy\n"
            ),
        ));
    }
    documents
}

fn target_query() -> ReferenceCandidateQuery {
    ReferenceCandidateQuery {
        declaration_uri: TARGET.to_owned(),
        declaration_position: Position::new(0, 14),
        limit: 256,
    }
}

fn qualified_query() -> ReferenceCandidateQuery {
    ReferenceCandidateQuery {
        declaration_uri: TARGET.to_owned(),
        declaration_position: Position::new(1, 14),
        limit: 256,
    }
}

#[test]
fn catalog_replacement_preserves_reference_identity_across_many_documents_and_reopen() {
    let temp = TestDir::new();
    let database = temp.path().join("symbols.sqlite3");
    let mut memory = WorkspaceIndex::with_store(MemoryStore::default());
    let mut sqlite = WorkspaceIndex::with_store(
        SqliteStore::open(&database, ROOT).expect("SQLite store should open"),
    );

    let first = catalog(CONSUMER_COUNT, "Alias");
    assert!(
        first
            .iter()
            .map(|document| document.occurrences.len())
            .sum::<usize>()
            > 96,
        "fixture must cross the intended reference-insertion batch size"
    );
    assert!(first.iter().any(|document| !document.aliases.is_empty()));
    assert!(first.iter().any(|document| !document.bindings.is_empty()));
    assert!(first.iter().any(|document| {
        document
            .occurrences
            .iter()
            .any(|occurrence| occurrence.qualified == Some(true))
    }));
    memory
        .activate_catalog(1, first.clone(), vec![])
        .expect("memory generation one should commit");
    sqlite
        .activate_catalog(1, first, vec![])
        .expect("SQLite generation one should commit");

    let expected = memory
        .search_reference_candidates(target_query())
        .expect("memory reference candidates should be searchable");
    let persisted = sqlite
        .search_reference_candidates(target_query())
        .expect("SQLite reference candidates should be searchable");
    assert_eq!(persisted, expected);
    assert!(persisted.identity_complete, "{persisted:#?}");
    assert_eq!(persisted.identity_uris.len(), CONSUMER_COUNT + 2);
    assert_eq!(persisted.served_generation, 1);
    assert_eq!(
        sqlite
            .search_reference_candidates(qualified_query())
            .unwrap(),
        memory
            .search_reference_candidates(qualified_query())
            .unwrap(),
        "qualified occurrences must retain the same conservative proof"
    );
    drop(sqlite);

    let mut sqlite = WorkspaceIndex::with_store(
        SqliteStore::open(&database, ROOT).expect("SQLite store should reopen"),
    );
    assert_eq!(
        sqlite.search_reference_candidates(target_query()).unwrap(),
        expected,
        "reopen must preserve the complete identity proof"
    );
    assert_eq!(
        sqlite
            .search_reference_candidates(qualified_query())
            .unwrap(),
        memory
            .search_reference_candidates(qualified_query())
            .unwrap(),
        "reopen must preserve qualified-occurrence proof"
    );

    let second = catalog(1, "NextAlias");
    memory
        .activate_catalog(2, second.clone(), vec![])
        .expect("memory generation two should commit");
    sqlite
        .activate_catalog(2, second, vec![])
        .expect("SQLite generation two should replace the first catalog");
    let replaced = memory
        .search_reference_candidates(target_query())
        .expect("replacement candidates should be searchable in memory");
    assert_eq!(
        sqlite.search_reference_candidates(target_query()).unwrap(),
        replaced
    );
    assert!(replaced.identity_complete, "{replaced:#?}");
    assert_eq!(replaced.identity_uris.len(), 3);
    assert_eq!(replaced.served_generation, 2);
    assert_eq!(
        sqlite
            .search_reference_candidates(qualified_query())
            .unwrap(),
        memory
            .search_reference_candidates(qualified_query())
            .unwrap(),
        "replacement must discard stale qualified occurrences"
    );
    drop(sqlite);

    let reopened = WorkspaceIndex::with_store(
        SqliteStore::open(&database, ROOT).expect("SQLite store should reopen after replacement"),
    );
    assert_eq!(
        reopened
            .search_reference_candidates(target_query())
            .unwrap(),
        replaced
    );
    assert_eq!(
        reopened
            .search_reference_candidates(qualified_query())
            .unwrap(),
        memory
            .search_reference_candidates(qualified_query())
            .unwrap()
    );
}
