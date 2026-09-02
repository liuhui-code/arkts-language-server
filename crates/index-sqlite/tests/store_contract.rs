use std::{
    fmt::Write as _,
    fs,
    path::{Path, PathBuf},
    process,
    sync::{Arc, Barrier},
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

use arkts_index_core::{Document, IndexState, MemoryStore, WorkspaceIndex};
use arkts_index_sqlite::{SqliteStore, workspace_cache_location};

struct TestDir(PathBuf);

impl TestDir {
    fn new(name: &str) -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after epoch")
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("arkts-index-{name}-{}-{nonce}", process::id()));
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

fn assert_store_contract(mut index: WorkspaceIndex) {
    let report = index
        .refresh(
            1,
            [
                Document::new(
                    "file:///workspace/Ranking.ets",
                    "class DomainMain {}\nclass MainPanel {}\n",
                ),
                Document::new(
                    "file:///workspace/Panel.ets",
                    "struct MainPage {\n  render() {}\n}\n",
                ),
            ],
            &[],
        )
        .expect("refresh should commit");
    assert_eq!(report.committed_generation, 1);
    assert_eq!(report.state, IndexState::Ready);

    let result = index.search("MP", 20).expect("search should succeed");
    let names: Vec<_> = result
        .items
        .iter()
        .map(|symbol| symbol.name.as_str())
        .collect();
    assert_eq!(result.served_generation, 1);
    assert_eq!(names, ["MainPage", "MainPanel"]);
    assert_eq!(result.items[0].uri, "file:///workspace/Panel.ets");
    assert_eq!(result.items[0].container, None);
}

#[test]
fn memory_and_sqlite_implement_the_same_store_contract_and_sqlite_reopens() {
    assert_store_contract(WorkspaceIndex::with_store(MemoryStore::default()));

    let temp = TestDir::new("restart");
    let database = temp.path().join("symbols.sqlite3");
    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open");
    assert_store_contract(WorkspaceIndex::with_store(store));

    let reopened =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should reopen");
    let restored = WorkspaceIndex::with_store(reopened)
        .search("render", 20)
        .expect("persisted symbols should be searchable after reopen");
    assert_eq!(restored.served_generation, 1);
    assert_eq!(restored.items.len(), 1);
    assert_eq!(restored.items[0].container.as_deref(), Some("MainPage"));
}

#[test]
fn failed_generation_rolls_back_the_entire_sqlite_batch() {
    let temp = TestDir::new("rollback");
    let database = temp.path().join("symbols.sqlite3");
    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open");
    let mut index = WorkspaceIndex::with_store(store);
    index
        .refresh(
            1,
            [Document::new(
                "file:///workspace/Service.ets",
                "class StableService {}\n",
            )],
            &[],
        )
        .expect("first generation should commit");
    drop(index);

    let mut store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should reopen");
    store.fail_before_commit_once();
    let mut index = WorkspaceIndex::with_store(store);
    let failure = index
        .refresh(
            2,
            [Document::new(
                "file:///workspace/Service.ets",
                "class UncommittedService {}\n",
            )],
            &[],
        )
        .expect_err("injected pre-commit failure should abort generation two");
    assert_eq!(failure.kind(), arkts_index_core::StoreErrorKind::Internal);
    drop(index);

    let reopened = SqliteStore::open(&database, "file:///workspace")
        .expect("SQLite should recover the last committed generation");
    let restored = WorkspaceIndex::with_store(reopened);
    assert_eq!(
        restored
            .metadata()
            .expect("metadata should be readable")
            .committed_generation,
        1
    );
    assert_eq!(
        restored
            .search("StableService", 20)
            .expect("generation one should remain searchable")
            .items
            .len(),
        1
    );
    assert!(
        restored
            .search("UncommittedService", 20)
            .expect("search should succeed")
            .items
            .is_empty()
    );
}

#[test]
fn malformed_document_is_isolated_while_the_degraded_generation_commits() {
    let temp = TestDir::new("malformed");
    let database = temp.path().join("symbols.sqlite3");
    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open");
    let mut index = WorkspaceIndex::with_store(store);
    index
        .refresh(
            1,
            [Document::new(
                "file:///workspace/Broken.ets",
                "class PreviouslyValid {}\n",
            )],
            &[],
        )
        .expect("first generation should commit");

    let report = index
        .refresh(
            2,
            [
                Document::new("file:///workspace/Healthy.ets", "class HealthyService {}\n"),
                Document::new(
                    "file:///workspace/Broken.ets",
                    "class BrokenService {\n  run( {\n  }\n}\n",
                ),
            ],
            &[],
        )
        .expect("healthy documents should commit despite one parse failure");
    assert_eq!(report.indexed_documents, 1);
    assert_eq!(report.rejected_documents, ["file:///workspace/Broken.ets"]);
    assert_eq!(report.committed_generation, 2);
    assert_eq!(report.state, IndexState::Degraded);
    drop(index);

    let reopened = SqliteStore::open(&database, "file:///workspace")
        .expect("degraded generation should reopen");
    let restored = WorkspaceIndex::with_store(reopened);
    assert_eq!(
        restored
            .metadata()
            .expect("metadata should be readable")
            .committed_generation,
        2
    );
    assert_eq!(
        restored
            .search("HealthyService", 20)
            .expect("healthy symbol should survive restart")
            .items
            .len(),
        1
    );
    assert!(
        restored
            .search("PreviouslyValid", 20)
            .expect("search should succeed")
            .items
            .is_empty()
    );
    assert!(
        restored
            .search("BrokenService", 20)
            .expect("search should succeed")
            .items
            .is_empty()
    );
}

#[test]
fn unresolved_malformed_uri_stays_degraded_until_fixed_or_removed_across_restart() {
    let temp = TestDir::new("persistent-rejections");
    let database = temp.path().join("symbols.sqlite3");
    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open");
    let mut index = WorkspaceIndex::with_store(store);

    let rejected = index
        .refresh(
            1,
            [Document::new(
                "file:///workspace/Broken.ets",
                "class BrokenService {\n  run( {\n}\n",
            )],
            &[],
        )
        .expect("malformed generation should commit as partial");
    assert_eq!(rejected.state, IndexState::Degraded);
    drop(index);

    let reopened =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should reopen");
    let mut index = WorkspaceIndex::with_store(reopened);
    let healthy_only = index
        .refresh(
            2,
            [Document::new(
                "file:///workspace/Healthy.ets",
                "class HealthyService {}\n",
            )],
            &[],
        )
        .expect("unrelated healthy generation should commit");
    assert_eq!(
        healthy_only.state,
        IndexState::Degraded,
        "a later healthy batch must not forget an unresolved malformed URI"
    );

    let no_op = index
        .refresh(3, [], &[])
        .expect("no-op generation should commit");
    assert_eq!(
        no_op.state,
        IndexState::Degraded,
        "a no-op generation must remain partial while the URI is unresolved"
    );

    let fixed = index
        .refresh(
            4,
            [Document::new(
                "file:///workspace/Broken.ets",
                "class RepairedService {}\n",
            )],
            &[],
        )
        .expect("fixed URI should commit");
    assert_eq!(fixed.state, IndexState::Ready);

    let rejected_again = index
        .refresh(
            5,
            [Document::new(
                "file:///workspace/Broken.ets",
                "class BrokenAgain {\n",
            )],
            &[],
        )
        .expect("second malformed snapshot should commit as partial");
    assert_eq!(rejected_again.state, IndexState::Degraded);

    let removed = index
        .refresh(6, [], &["file:///workspace/Broken.ets"])
        .expect("explicit removal should resolve the rejected URI");
    assert_eq!(removed.state, IndexState::Ready);
}

#[test]
fn older_generation_cannot_commit_after_a_newer_connection_commits() {
    let temp = TestDir::new("generation-race");
    let database = temp.path().join("symbols.sqlite3");
    let mut older_store =
        SqliteStore::open(&database, "file:///workspace").expect("older store should open");
    let newer_store =
        SqliteStore::open(&database, "file:///workspace").expect("newer store should open");

    let reached_preflight = Arc::new(Barrier::new(2));
    let resume_older = Arc::new(Barrier::new(2));
    older_store.pause_after_generation_preflight_once(
        Arc::clone(&reached_preflight),
        Arc::clone(&resume_older),
    );
    let older = thread::spawn(move || {
        WorkspaceIndex::with_store(older_store).refresh(
            1,
            [Document::new(
                "file:///workspace/Service.ets",
                "class OlderService {}\n",
            )],
            &[],
        )
    });

    reached_preflight.wait();
    WorkspaceIndex::with_store(newer_store)
        .refresh(
            2,
            [Document::new(
                "file:///workspace/Service.ets",
                "class NewerService {}\n",
            )],
            &[],
        )
        .expect("newer connection should commit generation two");
    resume_older.wait();

    let failure = older
        .join()
        .expect("older refresh thread should finish")
        .expect_err("generation one must be rejected after generation two commits");
    assert_eq!(
        failure.kind(),
        arkts_index_core::StoreErrorKind::InvalidGeneration
    );

    let reopened = SqliteStore::open(&database, "file:///workspace").expect("store should reopen");
    let index = WorkspaceIndex::with_store(reopened);
    assert_eq!(
        index
            .metadata()
            .expect("metadata should remain readable")
            .committed_generation,
        2
    );
    assert_eq!(
        index
            .search("NewerService", 20)
            .expect("newer snapshot should remain searchable")
            .items
            .len(),
        1
    );
    assert!(
        index
            .search("OlderService", 20)
            .expect("search should succeed")
            .items
            .is_empty()
    );
}

#[test]
fn search_items_and_served_generation_share_one_snapshot_during_concurrent_commit() {
    let temp = TestDir::new("search-snapshot");
    let database = temp.path().join("symbols.sqlite3");
    let seed_store =
        SqliteStore::open(&database, "file:///workspace").expect("seed store should open");
    WorkspaceIndex::with_store(seed_store)
        .refresh(
            1,
            [Document::new(
                "file:///workspace/Service.ets",
                "class OldService {}\n",
            )],
            &[],
        )
        .expect("generation one should commit");

    let mut reader_store =
        SqliteStore::open(&database, "file:///workspace").expect("reader should open");
    let writer_store =
        SqliteStore::open(&database, "file:///workspace").expect("writer should open");
    let rows_read = Arc::new(Barrier::new(2));
    let resume_reader = Arc::new(Barrier::new(2));
    reader_store.pause_after_search_rows_once(Arc::clone(&rows_read), Arc::clone(&resume_reader));

    let reader =
        thread::spawn(move || WorkspaceIndex::with_store(reader_store).search("Service", 20));
    rows_read.wait();
    WorkspaceIndex::with_store(writer_store)
        .refresh(
            2,
            [Document::new(
                "file:///workspace/Service.ets",
                "class NewService {}\n",
            )],
            &[],
        )
        .expect("writer should commit generation two while the WAL reader is active");
    resume_reader.wait();

    let result = reader
        .join()
        .expect("reader thread should finish")
        .expect("search should succeed");
    assert_eq!(
        result.served_generation, 1,
        "the generation must describe the same snapshot as the returned rows"
    );
    assert_eq!(
        result
            .items
            .iter()
            .map(|symbol| symbol.name.as_str())
            .collect::<Vec<_>>(),
        ["OldService"]
    );
}

#[test]
fn long_substring_search_uses_indexed_trigrams_at_workspace_scale() {
    const SYMBOL_COUNT: usize = 10_000;
    const DOCUMENT_COUNT: usize = 100;
    const SYMBOLS_PER_DOCUMENT: usize = SYMBOL_COUNT / DOCUMENT_COUNT;

    let temp = TestDir::new("trigram-scale");
    let database = temp.path().join("symbols.sqlite3");
    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open");
    let mut documents = Vec::with_capacity(DOCUMENT_COUNT);
    for document_index in 0..DOCUMENT_COUNT {
        let mut source = String::new();
        for local_ordinal in 0..SYMBOLS_PER_DOCUMENT {
            let ordinal = document_index * SYMBOLS_PER_DOCUMENT + local_ordinal;
            writeln!(&mut source, "class GeneratedSymbol{ordinal:05} {{}}")
                .expect("writing to String should succeed");
        }
        if document_index + 1 == DOCUMENT_COUNT {
            source.push_str("class AlphaNeedleOmega {}\n");
        }
        documents.push(Document::new(
            format!("file:///workspace/Generated{document_index:03}.ets"),
            source,
        ));
    }
    WorkspaceIndex::with_store(store)
        .refresh(1, documents, &[])
        .expect("large symbol generation should commit");

    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should reopen");
    let plan = store
        .explain_search_plan("needle")
        .expect("query plan should be inspectable");
    assert!(
        plan.iter().any(|detail| {
            detail.contains("symbol_name_trigrams") && detail.contains("VIRTUAL TABLE INDEX")
        }),
        "long substring candidates must come from the trigram index: {plan:#?}"
    );
    assert!(
        plan.iter().all(|detail| {
            let normalized = detail.to_ascii_uppercase();
            !normalized.contains("SCAN SYMBOLS")
                && !normalized.contains("USE TEMP B-TREE")
                && !normalized.contains("MATERIALIZE")
        }),
        "the plan must not scan/sort/materialize the whole symbol table: {plan:#?}"
    );

    let result = WorkspaceIndex::with_store(store)
        .search("needle", 20)
        .expect("indexed substring search should succeed");
    assert_eq!(
        result
            .items
            .iter()
            .map(|symbol| symbol.name.as_str())
            .collect::<Vec<_>>(),
        ["AlphaNeedleOmega"]
    );
}

#[test]
fn one_and_two_character_queries_use_bounded_prefix_and_acronym_indexes() {
    let source = "class AiPanel {}\nclass DomainAi {}\nclass MainPage {}\nclass IndexedPane {}\n";

    let mut memory = WorkspaceIndex::with_store(MemoryStore::default());
    memory
        .refresh(
            1,
            [Document::new("file:///workspace/Short.ets", source)],
            &[],
        )
        .expect("memory generation should commit");
    assert_eq!(
        memory
            .search("Ai", 20)
            .expect("short memory search should succeed")
            .items
            .iter()
            .map(|symbol| symbol.name.as_str())
            .collect::<Vec<_>>(),
        ["AiPanel"],
        "short queries intentionally avoid broad substring matches"
    );
    assert_eq!(
        memory
            .search("MP", 20)
            .expect("acronym memory search should succeed")
            .items[0]
            .name,
        "MainPage"
    );
    assert!(
        memory
            .search("", 20)
            .expect("empty memory search should succeed")
            .items
            .is_empty()
    );

    let temp = TestDir::new("short-query");
    let database = temp.path().join("symbols.sqlite3");
    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open");
    WorkspaceIndex::with_store(store)
        .refresh(
            1,
            [Document::new("file:///workspace/Short.ets", source)],
            &[],
        )
        .expect("SQLite generation should commit");

    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should reopen");
    let plan = store
        .explain_search_plan("Ai")
        .expect("short query plan should be inspectable");
    assert!(
        plan.iter()
            .any(|detail| { detail.contains("symbols_name_folded") && detail.contains("SEARCH") }),
        "name prefixes must use their B-tree index: {plan:#?}"
    );
    assert!(
        plan.iter().any(|detail| {
            detail.contains("symbols_acronym_folded") && detail.contains("SEARCH")
        }),
        "acronym prefixes must use their B-tree index: {plan:#?}"
    );
    assert!(
        plan.iter().all(|detail| {
            let normalized = detail.to_ascii_uppercase();
            !normalized.contains("SCAN SYMBOLS")
                && !normalized.contains("USE TEMP B-TREE")
                && !normalized.contains("MATERIALIZE")
        }),
        "short query candidates must remain bounded: {plan:#?}"
    );

    let index = WorkspaceIndex::with_store(store);
    assert_eq!(
        index
            .search("Ai", 20)
            .expect("short SQLite search should succeed")
            .items
            .iter()
            .map(|symbol| symbol.name.as_str())
            .collect::<Vec<_>>(),
        ["AiPanel"]
    );
    assert_eq!(
        index
            .search("MP", 20)
            .expect("acronym SQLite search should succeed")
            .items[0]
            .name,
        "MainPage"
    );
    assert!(
        index
            .search("", 20)
            .expect("empty SQLite search should succeed")
            .items
            .is_empty()
    );
}

#[test]
fn canonical_workspace_cache_keys_are_stable_and_identity_is_verified() {
    let temp = TestDir::new("cache-key");
    let workspace_a = temp.path().join("workspace-a");
    let workspace_b = temp.path().join("workspace-b");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace_a).expect("workspace A should exist");
    fs::create_dir_all(&workspace_b).expect("workspace B should exist");

    let direct = workspace_cache_location(&cache, &workspace_a)
        .expect("direct workspace cache location should resolve");
    let alias = workspace_cache_location(&cache, workspace_a.join("."))
        .expect("equivalent workspace path should resolve");
    let distinct = workspace_cache_location(&cache, &workspace_b)
        .expect("second workspace cache location should resolve");

    assert_eq!(direct, alias);
    assert_ne!(direct.workspace_identity, distinct.workspace_identity);
    assert_ne!(direct.database_path, distinct.database_path);
    assert!(direct.database_path.starts_with(cache.join("workspaces")));
    assert_eq!(
        direct
            .database_path
            .file_name()
            .and_then(|name| name.to_str()),
        Some("symbols-v2.sqlite3")
    );

    let store = SqliteStore::open(&direct.database_path, &direct.workspace_identity)
        .expect("workspace A cache should open");
    drop(store);
    let error = match SqliteStore::open(&direct.database_path, &distinct.workspace_identity) {
        Ok(_) => panic!("workspace B must not read workspace A cache"),
        Err(error) => error,
    };
    assert_eq!(
        error.kind(),
        arkts_index_core::StoreErrorKind::WorkspaceMismatch
    );
}
