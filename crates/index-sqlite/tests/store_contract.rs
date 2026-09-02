use std::{
    fs,
    path::{Path, PathBuf},
    process,
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
        Some("symbols-v1.sqlite3")
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
