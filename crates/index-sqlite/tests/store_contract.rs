use std::{
    fmt::Write as _,
    fs,
    path::{Path, PathBuf},
    process,
    sync::{Arc, Barrier},
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

use arkts_index_core::{
    Document, IndexState, MemoryStore, Position, ReferenceBindingKind, ReferenceBindingResolution,
    ReferenceCandidateQuery, ReferenceSourceResolution, WorkspaceIndex,
};
use arkts_index_sqlite::{SqliteStore, workspace_cache_location};
use rusqlite::Connection;

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
                    "class DomainMain {}\nexport class MainPanel {}\n",
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

    let exports = index
        .search_exports("MainP", 20)
        .expect("export search should succeed");
    assert_eq!(exports.served_generation, 1);
    assert_eq!(exports.items.len(), 1);
    assert_eq!(exports.items[0].exported_name, "MainPanel");
    let references = index
        .search_reference_candidates(ReferenceCandidateQuery {
            declaration_uri: "file:///workspace/Ranking.ets".to_owned(),
            declaration_position: Position::new(1, 13),
            limit: 20,
        })
        .expect("reference candidates should be searchable");
    assert!(references.supported);
    assert!(references.complete);
    assert_eq!(references.uris, ["file:///workspace/Ranking.ets"]);
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

    let reopened =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should reopen");
    let references = WorkspaceIndex::with_store(reopened)
        .search_reference_candidates(ReferenceCandidateQuery {
            declaration_uri: "file:///workspace/Ranking.ets".to_owned(),
            declaration_position: Position::new(1, 13),
            limit: 20,
        })
        .expect("persisted reference candidates should be searchable after reopen");
    assert!(references.supported);
    assert_eq!(references.served_generation, 1);
}

fn assert_type_assertions_do_not_widen_reference_names(mut index: WorkspaceIndex) {
    index
        .refresh(
            1,
            [
                Document::new("file:///workspace/Target.ets", "export class Thing {}\n"),
                Document::new(
                    "file:///workspace/Consumer.ets",
                    "import { Thing } from './Target'\n\
                     const typed = Thing as BusinessError\n\
                     const use = new Thing()\n",
                ),
                Document::new(
                    "file:///workspace/Unrelated.ets",
                    "export class BusinessError {}\n\
                     const unrelated = new BusinessError()\n",
                ),
            ],
            &[],
        )
        .expect("reference generation should commit");

    let result = index
        .search_reference_candidates(ReferenceCandidateQuery {
            declaration_uri: "file:///workspace/Target.ets".to_owned(),
            declaration_position: Position::new(0, 14),
            limit: 20,
        })
        .expect("reference candidates should be searchable");
    assert_eq!(result.names, ["Thing"]);
    assert_eq!(
        result.uris,
        [
            "file:///workspace/Consumer.ets",
            "file:///workspace/Target.ets",
        ]
    );
    assert!(result.identity_complete);
    assert_eq!(result.identity_uris, result.uris);
}

#[test]
fn memory_and_sqlite_ignore_type_assertions_when_expanding_reference_names() {
    assert_type_assertions_do_not_widen_reference_names(WorkspaceIndex::with_store(
        MemoryStore::default(),
    ));

    let temp = TestDir::new("reference-type-assertion");
    let database = temp.path().join("symbols.sqlite3");
    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open");
    assert_type_assertions_do_not_widen_reference_names(WorkspaceIndex::with_store(store));
}

fn assert_direct_named_import_usage_resolves_the_reference_declaration(mut index: WorkspaceIndex) {
    index
        .refresh(
            1,
            [
                Document::new(
                    "file:///workspace/Target.ets",
                    "export type Thing = object\n",
                ),
                Document::new(
                    "file:///workspace/Consumer.ets",
                    "import { Thing } from './Target'\nconst value: Thing = {}\n",
                ),
            ],
            &[],
        )
        .expect("reference generation should commit");

    let result = index
        .search_reference_candidates(ReferenceCandidateQuery {
            declaration_uri: "file:///workspace/Consumer.ets".to_owned(),
            declaration_position: Position::new(1, 14),
            limit: 20,
        })
        .expect("a direct named import usage should resolve through the index");

    assert!(result.supported);
    assert!(result.complete);
    assert_eq!(result.names, ["Thing"]);
    assert_eq!(
        result.declaration_identity.as_deref(),
        Some("file:///workspace/Target.ets#0:12:Thing")
    );
    assert_eq!(
        result.identity_uris,
        [
            "file:///workspace/Consumer.ets",
            "file:///workspace/Target.ets",
        ]
    );

    let excluded_target = index
        .search_reference_candidates_with_scope(
            ReferenceCandidateQuery {
                declaration_uri: "file:///workspace/Consumer.ets".to_owned(),
                declaration_position: Position::new(1, 14),
                limit: 20,
            },
            &[],
            &["file:///workspace/consumer-only".to_owned()],
        )
        .expect("an out-of-scope import target should fail conservative");
    assert!(!excluded_target.supported);
    assert!(!excluded_target.complete);
}

#[test]
fn memory_and_sqlite_resolve_direct_named_import_usages() {
    assert_direct_named_import_usage_resolves_the_reference_declaration(
        WorkspaceIndex::with_store(MemoryStore::default()),
    );

    let temp = TestDir::new("reference-direct-import-anchor");
    let database = temp.path().join("symbols.sqlite3");
    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open");
    assert_direct_named_import_usage_resolves_the_reference_declaration(
        WorkspaceIndex::with_store(store),
    );
}

fn assert_reference_admission_scope(mut index: WorkspaceIndex) {
    index
        .refresh(
            1,
            [
                Document::new(
                    "file:///workspace/shared/src/main/ets/Target.ets",
                    "export class Thing {}\n",
                ),
                Document::new(
                    "file:///workspace/entry/src/main/ets/Consumer.ets",
                    "import { Thing } from '../../../../shared/src/main/ets/Target'\n\
                     const value = new Thing()\n",
                ),
                Document::new(
                    "file:///workspace/demo/Detached.ets",
                    "export { Thing as DetachedThing } from './Missing'\n",
                ),
            ],
            &[],
        )
        .expect("reference admission fixture should commit");
    let query = || ReferenceCandidateQuery {
        declaration_uri: "file:///workspace/shared/src/main/ets/Target.ets".to_owned(),
        declaration_position: Position::new(0, 14),
        limit: 20,
    };

    assert!(
        !index
            .search_reference_candidates(query())
            .expect("unscoped reference candidates should remain conservative")
            .identity_complete
    );
    let admitted = index
        .search_reference_candidates_with_scope(
            query(),
            &[],
            &[
                "file:///workspace/entry/src/main/ets".to_owned(),
                "file:///workspace/shared/src/main/ets".to_owned(),
            ],
        )
        .expect("declared-module scope should be searchable");
    assert!(admitted.identity_complete);
    assert_eq!(admitted.names, ["Thing"]);
    assert_eq!(admitted.names, ["Thing"]);
    assert_eq!(
        admitted.identity_uris,
        [
            "file:///workspace/entry/src/main/ets/Consumer.ets",
            "file:///workspace/shared/src/main/ets/Target.ets",
        ]
    );
    assert!(
        admitted
            .bindings
            .iter()
            .all(|binding| !binding.uri.contains("/demo/"))
    );

    index
        .refresh(
            2,
            [Document::new(
                "file:///workspace/entry/src/main/ets/Broken.ets",
                "export { Thing as BrokenThing } from './Missing'\n",
            )],
            &[],
        )
        .expect("in-scope broken binding should commit");
    assert!(
        !index
            .search_reference_candidates_with_scope(
                query(),
                &[],
                &[
                    "file:///workspace/entry/src/main/ets".to_owned(),
                    "file:///workspace/shared/src/main/ets".to_owned(),
                ],
            )
            .expect("in-scope missing bindings must stay conservative")
            .identity_complete
    );
}

#[test]
fn reference_identity_proof_only_excludes_files_outside_an_explicit_admission_scope() {
    assert_reference_admission_scope(WorkspaceIndex::with_store(MemoryStore::default()));

    let temp = TestDir::new("reference-admission-scope");
    let database = temp.path().join("symbols.sqlite3");
    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open");
    assert_reference_admission_scope(WorkspaceIndex::with_store(store));
}

fn assert_external_sdk_terminal_contract(mut index: WorkspaceIndex) {
    index
        .refresh(
            1,
            [
                Document::new("file:///workspace/Target.ets", "export class Thing {}\n"),
                Document::new(
                    "file:///workspace/Consumer.ets",
                    "import { Thing } from './Target'\nconst value = new Thing()\n",
                ),
                Document::new(
                    "file:///workspace/SdkUse.ets",
                    "import { Thing as SdkThing } from '@ohos.example'\n\
                     const sdk = new SdkThing()\n",
                ),
            ],
            &[],
        )
        .expect("external SDK terminal fixture should commit");
    let result = index
        .search_reference_candidates_with_source_resolutions(
            ReferenceCandidateQuery {
                declaration_uri: "file:///workspace/Target.ets".to_owned(),
                declaration_position: Position::new(0, 14),
                limit: 20,
            },
            &[ReferenceSourceResolution {
                binding_uri: "file:///workspace/SdkUse.ets".to_owned(),
                source_specifier: "@ohos.example".to_owned(),
                resolved_source_uri: None,
                external_terminal_identity: Some(
                    "sdk:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
                        .to_owned(),
                ),
            }],
        )
        .expect("external SDK terminal should be classifiable");
    assert!(result.identity_complete);
    assert_eq!(
        result.identity_uris,
        [
            "file:///workspace/Consumer.ets",
            "file:///workspace/Target.ets",
        ]
    );
    let sdk = result
        .bindings
        .iter()
        .find(|binding| binding.uri.ends_with("/SdkUse.ets"))
        .expect("SDK binding should be returned");
    assert_eq!(sdk.source_resolution, ReferenceBindingResolution::External);
    assert!(sdk.resolved_source_uri.is_none());
    assert!(sdk.external_terminal_identity.is_some());
}

#[test]
fn memory_and_sqlite_classify_locked_sdk_modules_as_external_terminals() {
    assert_external_sdk_terminal_contract(WorkspaceIndex::with_store(MemoryStore::default()));

    let temp = TestDir::new("reference-sdk-terminal");
    let database = temp.path().join("symbols.sqlite3");
    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open");
    assert_external_sdk_terminal_contract(WorkspaceIndex::with_store(store));
}

#[test]
fn sqlite_persists_reference_binding_sources_across_reopen() {
    let temp = TestDir::new("reference-bindings");
    let database = temp.path().join("symbols.sqlite3");
    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open");
    WorkspaceIndex::with_store(store)
        .refresh(
            1,
            [
                Document::new("file:///workspace/Target.ets", "export class Thing {}\n"),
                Document::new(
                    "file:///workspace/Barrel.ets",
                    "export { Thing as PublicThing } from './Target'\n",
                ),
                Document::new(
                    "file:///workspace/Consumer.ets",
                    "import { PublicThing as Alias } from './Barrel'\nconst value = new Alias()\n",
                ),
                Document::new(
                    "file:///workspace/SameName.ets",
                    "export class Thing {}\nconst unrelated = new Thing()\n",
                ),
            ],
            &[],
        )
        .expect("reference generation should commit");

    let reopened =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should reopen");
    let result = WorkspaceIndex::with_store(reopened)
        .search_reference_candidates(ReferenceCandidateQuery {
            declaration_uri: "file:///workspace/Target.ets".to_owned(),
            declaration_position: Position::new(0, 14),
            limit: 20,
        })
        .expect("persisted reference bindings should be searchable");

    assert!(result.identity_complete);
    assert_eq!(
        result.uris,
        [
            "file:///workspace/Barrel.ets",
            "file:///workspace/Consumer.ets",
            "file:///workspace/SameName.ets",
            "file:///workspace/Target.ets",
        ]
    );
    assert_eq!(
        result.identity_uris,
        [
            "file:///workspace/Barrel.ets",
            "file:///workspace/Consumer.ets",
            "file:///workspace/Target.ets",
        ]
    );
    assert_eq!(result.bindings.len(), 2);
    assert_eq!(result.bindings[0].kind, ReferenceBindingKind::ReExport);
    assert_eq!(result.bindings[0].source_specifier, "./Target");
    assert_eq!(
        result.bindings[0].source_resolution,
        ReferenceBindingResolution::Unique
    );
    assert_eq!(
        result.bindings[0].resolved_source_uri.as_deref(),
        Some("file:///workspace/Target.ets")
    );
    assert_eq!(result.bindings[1].kind, ReferenceBindingKind::Import);
    assert_eq!(result.bindings[1].source_specifier, "./Barrel");
    assert_eq!(
        result.bindings[1].source_resolution,
        ReferenceBindingResolution::Unique
    );
    assert_eq!(
        result.bindings[1].resolved_source_uri.as_deref(),
        Some("file:///workspace/Barrel.ets")
    );
}

#[test]
fn version_four_database_migrates_in_place_before_binding_data_is_refreshed() {
    let temp = TestDir::new("v4-reference-binding-migration");
    let database = temp.path().join("symbols-v4.sqlite3");
    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open");
    WorkspaceIndex::with_store(store)
        .refresh(
            1,
            [Document::new(
                "file:///workspace/Existing.ets",
                "export class Existing {}\n",
            )],
            &[],
        )
        .expect("generation one should commit");

    let legacy = Connection::open(&database).expect("database should open directly");
    legacy
        .execute_batch(
            "DROP TABLE reference_bindings; \
             DROP TABLE reference_occurrence_identities; \
             DROP INDEX IF EXISTS reference_occurrences_name; \
             ALTER TABLE reference_occurrences DROP COLUMN qualified; \
             CREATE INDEX reference_occurrences_name ON reference_occurrences(name); \
             PRAGMA user_version = 4;",
        )
        .expect("test fixture should emulate schema version four");
    drop(legacy);

    let store = SqliteStore::open(&database, "file:///workspace")
        .expect("version four database should migrate in place");
    let mut index = WorkspaceIndex::with_store(store);
    assert_eq!(
        index
            .search("Existing", 20)
            .expect("existing symbols should survive migration")
            .items
            .len(),
        1
    );
    index
        .refresh(
            2,
            [Document::new(
                "file:///workspace/Consumer.ets",
                "import { Existing as Alias } from './Existing'\nconst value: Alias = new Alias()\n",
            )],
            &[],
        )
        .expect("migrated database should accept binding data");
    let result = index
        .search_reference_candidates(ReferenceCandidateQuery {
            declaration_uri: "file:///workspace/Existing.ets".to_owned(),
            declaration_position: Position::new(0, 14),
            limit: 20,
        })
        .expect("binding data should be queryable after refresh");
    assert_eq!(result.bindings.len(), 1);
    assert_eq!(result.bindings[0].local_name, "Alias");
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
fn version_five_occurrence_qualification_stays_unknown_until_refresh() {
    let temp = TestDir::new("v5-reference-occurrence-migration");
    let database = temp.path().join("symbols-v5.sqlite3");
    let documents = [
        Document::new("file:///workspace/Target.ets", "export class Thing {}\n"),
        Document::new(
            "file:///workspace/SameName.ets",
            "export class Thing {}\nconst unrelated = new Thing()\n",
        ),
    ];
    WorkspaceIndex::with_store(
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open"),
    )
    .refresh(1, documents.clone(), &[])
    .expect("generation one should commit");

    let legacy = Connection::open(&database).expect("database should open directly");
    legacy
        .execute_batch(
            "DROP TABLE reference_occurrence_identities; \
             DROP INDEX IF EXISTS reference_occurrences_name; \
             ALTER TABLE reference_occurrences DROP COLUMN qualified; \
             CREATE INDEX reference_occurrences_name ON reference_occurrences(name); \
             PRAGMA user_version = 5;",
        )
        .expect("test fixture should emulate schema version five");
    drop(legacy);

    let mut index = WorkspaceIndex::with_store(
        SqliteStore::open(&database, "file:///workspace")
            .expect("version five database should migrate in place"),
    );
    let migrated = index
        .search_reference_candidates_with_scope(
            ReferenceCandidateQuery {
                declaration_uri: "file:///workspace/Target.ets".to_owned(),
                declaration_position: Position::new(0, 14),
                limit: 20,
            },
            &[],
            &["file:///workspace".to_owned()],
        )
        .expect("migrated candidates should remain searchable");
    assert!(!migrated.identity_complete);
    assert!(migrated.identity_uris.is_empty());

    index
        .refresh(2, documents, &[])
        .expect("refresh should populate occurrence qualification");
    let refreshed = index
        .search_reference_candidates_with_scope(
            ReferenceCandidateQuery {
                declaration_uri: "file:///workspace/Target.ets".to_owned(),
                declaration_position: Position::new(0, 14),
                limit: 20,
            },
            &[],
            &["file:///workspace".to_owned()],
        )
        .expect("refreshed candidates should be searchable");
    assert!(refreshed.identity_complete);
    assert_eq!(refreshed.identity_uris, ["file:///workspace/Target.ets"]);
}

#[test]
fn version_six_database_migrates_to_the_covering_occurrence_identity_index() {
    let temp = TestDir::new("v6-reference-occurrence-index-migration");
    let database = temp.path().join("symbols-v6.sqlite3");
    let documents = [
        Document::new("file:///workspace/Target.ets", "export class Thing {}\n"),
        Document::new(
            "file:///workspace/Consumer.ets",
            "import { Thing } from './Target'\nconst first = new Thing()\nconst second = new Thing()\n",
        ),
    ];
    WorkspaceIndex::with_store(
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open"),
    )
    .refresh(1, documents, &[])
    .expect("generation one should commit");

    let legacy = Connection::open(&database).expect("database should open directly");
    legacy
        .execute_batch(
            "DROP TABLE reference_occurrence_identities; \
             CREATE INDEX reference_occurrences_name ON reference_occurrences(name); \
             PRAGMA user_version = 6;",
        )
        .expect("test fixture should emulate schema version six");
    drop(legacy);

    let store = SqliteStore::open(&database, "file:///workspace")
        .expect("version six database should migrate in place");
    let result = WorkspaceIndex::with_store(store)
        .search_reference_candidates(ReferenceCandidateQuery {
            declaration_uri: "file:///workspace/Target.ets".to_owned(),
            declaration_position: Position::new(0, 14),
            limit: 20,
        })
        .expect("migrated reference candidates should remain searchable");
    assert!(result.identity_complete);
    assert_eq!(
        result.identity_uris,
        [
            "file:///workspace/Consumer.ets",
            "file:///workspace/Target.ets",
        ]
    );

    let migrated = Connection::open(&database).expect("migrated database should reopen");
    let columns: Vec<String> = migrated
        .prepare("PRAGMA index_info(reference_occurrence_identities_name)")
        .expect("covering index metadata should prepare")
        .query_map([], |row| row.get(2))
        .expect("covering index metadata should query")
        .collect::<Result<_, _>>()
        .expect("covering index metadata should decode");
    assert_eq!(columns, ["name", "document_uri", "qualification"]);
}

#[test]
fn export_discovery_persists_a_candidate_beyond_the_old_completion_scan_bound() {
    const FILLER_EXPORTS: usize = 4_999;
    let temp = TestDir::new("exports-over-4096");
    let database = temp.path().join("symbols.sqlite3");
    let mut source = String::new();
    for ordinal in 0..FILLER_EXPORTS {
        writeln!(&mut source, "export class FillerExport{ordinal:04} {{}}")
            .expect("writing to String should succeed");
    }
    source.push_str("export class ExactNeedleExport {}\n");

    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open");
    WorkspaceIndex::with_store(store)
        .refresh(
            1,
            [Document::new("file:///workspace/Exports.ets", source)],
            &[],
        )
        .expect("large export generation should commit");

    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should reopen");
    let result = WorkspaceIndex::with_store(store)
        .search_exports("ExactNeedle", 20)
        .expect("persisted export should be discoverable");
    assert_eq!(result.served_generation, 1);
    assert_eq!(result.items.len(), 1);
    assert_eq!(result.items[0].exported_name, "ExactNeedleExport");
    assert_eq!(result.items[0].uri, "file:///workspace/Exports.ets");
    assert_eq!(result.items[0].ordinal, FILLER_EXPORTS as u32);
}

#[test]
fn reference_candidates_do_not_scan_irrelevant_occurrences_in_uri_order() {
    const IRRELEVANT_OCCURRENCES: usize = 500_000;
    let temp = TestDir::new("reference-name-index");
    let database = temp.path().join("symbols.sqlite3");
    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open");
    WorkspaceIndex::with_store(store)
        .refresh(
            1,
            [
                Document::new(
                    "file:///workspace/ZTarget.ets",
                    "export class FastNeedle {}\n",
                ),
                Document::new(
                    "file:///workspace/ZConsumer.ets",
                    "const value: FastNeedle = new FastNeedle()\n",
                ),
            ],
            &[],
        )
        .expect("reference generation should commit");

    let mut connection = Connection::open(&database).expect("database should open directly");
    let transaction = connection
        .transaction()
        .expect("filler transaction should begin");
    transaction
        .execute(
            "INSERT INTO documents(uri, generation) VALUES (?1, 1)",
            ["file:///workspace/AFiller.ets"],
        )
        .expect("filler document should insert");
    {
        let mut insert = transaction
            .prepare(
                "INSERT INTO reference_occurrences(\
                    document_uri, ordinal, name, start_line, start_character, end_line, end_character\
                 ) VALUES (?1, ?2, 'IrrelevantName', 0, 0, 0, 1)",
            )
            .expect("filler insert should prepare");
        for ordinal in 0..IRRELEVANT_OCCURRENCES {
            insert
                .execute(("file:///workspace/AFiller.ets", ordinal as i64))
                .expect("filler occurrence should insert");
        }
    }
    transaction
        .commit()
        .expect("filler transaction should commit");
    drop(connection);

    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should reopen");
    let index = WorkspaceIndex::with_store(store);
    let result = index
        .search_reference_candidates(ReferenceCandidateQuery {
            declaration_uri: "file:///workspace/ZTarget.ets".to_owned(),
            declaration_position: Position::new(0, 13),
            limit: 20,
        })
        .expect("reference candidates should use the name index");
    assert!(result.supported);
    assert!(result.complete);
    assert_eq!(
        result.uris,
        [
            "file:///workspace/ZConsumer.ets",
            "file:///workspace/ZTarget.ets",
        ]
    );
}

#[test]
fn version_two_database_migrates_in_place_without_losing_committed_symbols() {
    let temp = TestDir::new("v2-migration");
    let database = temp.path().join("symbols-v2.sqlite3");
    let store =
        SqliteStore::open(&database, "file:///workspace").expect("SQLite store should open");
    WorkspaceIndex::with_store(store)
        .refresh(
            1,
            [Document::new(
                "file:///workspace/Existing.ets",
                "class ExistingSymbol {}\n",
            )],
            &[],
        )
        .expect("generation one should commit");

    let legacy = Connection::open(&database).expect("database should open directly");
    legacy
        .execute_batch(
            "DROP TABLE reference_bindings; \
             DROP TABLE reference_occurrence_identities; \
             DROP TABLE reference_aliases; \
             DROP TABLE reference_occurrences; \
             DROP TABLE exports; \
             PRAGMA user_version = 2;",
        )
        .expect("test fixture should emulate the previous schema");
    drop(legacy);

    let store = SqliteStore::open(&database, "file:///workspace")
        .expect("version two database should migrate in place");
    let mut index = WorkspaceIndex::with_store(store);
    assert_eq!(
        index
            .search("ExistingSymbol", 20)
            .expect("existing symbols should survive migration")
            .items
            .len(),
        1
    );
    index
        .refresh(
            2,
            [Document::new(
                "file:///workspace/NewExport.ets",
                "export class NewExport {}\n",
            )],
            &[],
        )
        .expect("migrated database should accept exports");
    assert_eq!(
        index
            .search_exports("NewExport", 20)
            .expect("new export should be searchable")
            .items
            .len(),
        1
    );

    let migrated = Connection::open(&database).expect("migrated database should reopen");
    let version: i64 = migrated
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .expect("schema version should be readable");
    assert_eq!(version, 7);
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
