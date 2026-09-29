use arkts_index_core::{
    Document, MemoryStore, ReferenceBindingResolution, RefreshBatch, StoreErrorKind, SymbolStore,
    WorkspaceIndex, parse_document_symbols,
};
use arkts_index_sqlite::SqliteStore;

#[path = "support/temp_dir.rs"]
mod temp_dir;
use temp_dir::TestDir;

const ROOT: &str = "file:///binding-snapshot";

#[test]
fn memory_and_sqlite_reopen_the_same_validated_binding_and_heritage_generation() {
    let temp = TestDir::new("class-binding-reopen");
    let database = temp.path().join("index.sqlite3");
    let sources = [
        Document::new(
            "file:///binding-snapshot/Base.ets",
            "/* 🦀 */ export class Base {}\n",
        ),
        Document::new(
            "file:///binding-snapshot/Barrel.ets",
            "export { Base as Public } from './Base'\n",
        ),
        Document::new(
            "file:///binding-snapshot/Child.ets",
            "import { Public as Alias } from './Barrel'\nclass Child extends Alias {}\n",
        ),
    ];
    let uris: Vec<_> = sources
        .iter()
        .map(|document| document.uri.clone())
        .chain(["file:///binding-snapshot/Missing.ets".into()])
        .collect();
    let mut memory = WorkspaceIndex::with_store(MemoryStore::default());
    let mut sqlite = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    for index in [&mut memory, &mut sqlite] {
        index.refresh(4, sources.clone(), &[]).unwrap();
        let snapshot = index.class_binding_snapshot(&uris).unwrap();
        assert_eq!(snapshot.served_generation, 4);
        assert_eq!(snapshot.documents.len(), 4);
        for (observed, source) in snapshot.documents.iter().zip(&sources) {
            let expected = parse_document_symbols(source).unwrap();
            assert_eq!(observed.uri, source.uri);
            assert_eq!(observed.heritage, expected.class_heritage);
            assert_eq!(observed.bindings, expected.bindings);
            assert!(
                observed
                    .binding_provenance
                    .as_ref()
                    .unwrap()
                    .source_supported
            );
        }
        let exported = &snapshot.documents[0];
        assert_eq!(
            exported.binding_provenance.as_ref().unwrap().direct_exports,
            vec![exported.heritage.as_ref().unwrap().classes[0].name_range]
        );
        assert!(
            snapshot.documents[2]
                .binding_provenance
                .as_ref()
                .unwrap()
                .direct_exports
                .is_empty()
        );
        let missing = &snapshot.documents[3];
        assert!(missing.heritage.is_none() && missing.binding_provenance.is_none());
        assert!(missing.bindings.is_empty());
    }
    drop(sqlite);
    let reopened = WorkspaceIndex::with_store(SqliteStore::open(database, ROOT).unwrap());
    assert_eq!(
        reopened.class_binding_snapshot(&uris).unwrap(),
        memory.class_binding_snapshot(&uris).unwrap()
    );
}

#[test]
fn snapshots_expose_lexical_bindings_not_unpersisted_resolution_state() {
    let temp = TestDir::new("class-binding-lexical-only");
    let source = Document::new(
        "file:///binding-snapshot/Child.ets",
        "import { Base } from './Base'\nclass Child extends Base {}\n",
    );
    let mut document = parse_document_symbols(&source).unwrap();
    document.bindings[0].source_resolution = ReferenceBindingResolution::Unique;
    document.bindings[0].resolved_source_uri = Some("file:///binding-snapshot/Base.ets".into());
    document.bindings[0].external_terminal_identity = Some("transient-proof".into());
    let mut memory = WorkspaceIndex::with_store(MemoryStore::default());
    let mut sqlite = WorkspaceIndex::with_store(
        SqliteStore::open(temp.path().join("index.sqlite3"), ROOT).unwrap(),
    );
    for index in [&mut memory, &mut sqlite] {
        index
            .activate_catalog(1, vec![document.clone()], vec![])
            .unwrap();
        let snapshot = index
            .class_binding_snapshot(std::slice::from_ref(&source.uri))
            .unwrap();
        assert_eq!(
            snapshot.documents[0].bindings,
            parse_document_symbols(&source).unwrap().bindings
        );
    }
}

#[test]
fn unsupported_and_legacy_metadata_never_publish_validated_bindings() {
    let temp = TestDir::new("class-binding-unknown");
    let database = temp.path().join("index.sqlite3");
    let source = Document::new(
        "file:///binding-snapshot/Child.ets",
        "import type { Base } from './Base'\nclass Child extends Base {}\n",
    );
    let mut legacy = parse_document_symbols(&Document::new(
        "file:///binding-snapshot/Legacy.ets",
        "import { Base } from './Base'\nexport class Legacy extends Base {}\n",
    ))
    .unwrap();
    assert_eq!(legacy.bindings.len(), 1);
    legacy.class_binding_provenance = None;
    let uris = vec![source.uri.clone(), legacy.uri.clone()];
    let mut memory = WorkspaceIndex::with_store(MemoryStore::default());
    let mut sqlite = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    for index in [&mut memory, &mut sqlite] {
        index
            .activate_catalog(
                1,
                vec![parse_document_symbols(&source).unwrap(), legacy.clone()],
                vec![],
            )
            .unwrap();
        let snapshot = index.class_binding_snapshot(&uris).unwrap();
        assert!(
            !snapshot.documents[0]
                .binding_provenance
                .as_ref()
                .unwrap()
                .source_supported
        );
        assert!(snapshot.documents[1].binding_provenance.is_none());
        assert!(
            snapshot
                .documents
                .iter()
                .all(|document| document.bindings.is_empty())
        );
        assert!(
            snapshot
                .documents
                .iter()
                .all(|document| document.heritage.is_some())
        );
    }
    drop(sqlite);
    let reopened = WorkspaceIndex::with_store(SqliteStore::open(database, ROOT).unwrap());
    assert_eq!(
        reopened.class_binding_snapshot(&uris).unwrap(),
        memory.class_binding_snapshot(&uris).unwrap()
    );
}

#[test]
fn noncanonical_or_ambiguous_export_provenance_cannot_commit() {
    let temp = TestDir::new("class-binding-invalid-order");
    let source = Document::new(
        "file:///binding-snapshot/Base.ets",
        "export class Base {}\nexport class Other {}\n",
    );
    let mut reversed = parse_document_symbols(&source).unwrap();
    reversed
        .class_binding_provenance
        .as_mut()
        .unwrap()
        .direct_exports
        .reverse();
    let mut duplicate_class = parse_document_symbols(&source).unwrap();
    let first = duplicate_class.class_heritage.as_ref().unwrap().classes[0].clone();
    duplicate_class
        .class_heritage
        .as_mut()
        .unwrap()
        .classes
        .push(first);
    let mut memory = WorkspaceIndex::with_store(MemoryStore::default());
    let mut sqlite = WorkspaceIndex::with_store(
        SqliteStore::open(temp.path().join("index.sqlite3"), ROOT).unwrap(),
    );
    for index in [&mut memory, &mut sqlite] {
        index.refresh(1, [source.clone()], &[]).unwrap();
        let before = index
            .class_binding_snapshot(std::slice::from_ref(&source.uri))
            .unwrap();
        for invalid in [&reversed, &duplicate_class] {
            let error = index
                .activate_catalog(2, vec![invalid.clone()], vec![])
                .expect_err("noncanonical or ambiguous provenance must fail before commit");
            assert_eq!(error.kind(), StoreErrorKind::InvalidData);
            assert_eq!(
                index
                    .class_binding_snapshot(std::slice::from_ref(&source.uri))
                    .unwrap(),
                before
            );
        }
    }
}

#[test]
fn concurrent_commit_cannot_mix_new_bindings_or_heritage_with_an_old_generation() {
    use std::{
        sync::{Arc, Barrier},
        thread,
    };
    let temp = TestDir::new("class-binding-wal-snapshot");
    let database = temp.path().join("index.sqlite3");
    let uri = "file:///binding-snapshot/Child.ets";
    let uris = vec![uri.into()];
    let mut writer = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    writer
        .refresh(
            1,
            [Document::new(
                uri,
                "import { Base as Old } from './Base'\nexport class Child extends Old {}\n",
            )],
            &[],
        )
        .unwrap();
    let old = writer.class_binding_snapshot(&uris).unwrap();
    let mut reader = SqliteStore::open(&database, ROOT).unwrap();
    let captured = Arc::new(Barrier::new(2));
    let resume = Arc::new(Barrier::new(2));
    reader.pause_after_class_binding_snapshot_once(captured.clone(), resume.clone());
    let read_uris = uris.clone();
    let pending = thread::spawn(move || reader.class_binding_snapshot(&read_uris));
    captured.wait();
    let commit = writer.refresh(
        2,
        [Document::new(
            uri,
            "import { NewBase as Fresh } from './NewBase'\nclass Child extends Fresh {}\n",
        )],
        &[],
    );
    resume.wait();
    commit.unwrap();
    assert_eq!(pending.join().unwrap().unwrap(), old);
    let current = writer.class_binding_snapshot(&uris).unwrap();
    assert_eq!(current.served_generation, 2);
    assert_eq!(current.documents[0].bindings[0].local_name, "Fresh");
    assert_eq!(
        current.documents[0].heritage.as_ref().unwrap().classes[0]
            .base
            .as_ref()
            .unwrap()
            .name,
        "Fresh"
    );
    assert!(
        current.documents[0]
            .binding_provenance
            .as_ref()
            .unwrap()
            .direct_exports
            .is_empty()
    );
}

#[test]
fn failed_commit_and_reopen_preserve_the_entire_snapshot_until_replacement() {
    let temp = TestDir::new("class-binding-rollback");
    let database = temp.path().join("index.sqlite3");
    let uri = "file:///binding-snapshot/Child.ets";
    let uris = vec![uri.into()];
    let batch = |generation, source| RefreshBatch {
        generation,
        replacements: vec![parse_document_symbols(&Document::new(uri, source)).unwrap()],
        removed_uris: vec![],
        rejected_uris: vec![],
    };
    let mut store = SqliteStore::open(&database, ROOT).unwrap();
    store
        .apply_batch(batch(
            1,
            "import { Base as Old } from './Base'\nexport class Child extends Old {}\n",
        ))
        .unwrap();
    let old = store.class_binding_snapshot(&uris).unwrap();
    store.fail_before_commit_once();
    assert!(
        store
            .apply_batch(batch(
                2,
                "import type { Base } from './Base'\nclass Child extends Base {}\n"
            ))
            .is_err()
    );
    assert_eq!(store.class_binding_snapshot(&uris).unwrap(), old);
    drop(store);
    let mut reopened = SqliteStore::open(&database, ROOT).unwrap();
    assert_eq!(reopened.class_binding_snapshot(&uris).unwrap(), old);
    reopened
        .apply_batch(batch(
            2,
            "import type { Base } from './Base'\nclass Child extends Base {}\n",
        ))
        .unwrap();
    let unsupported = reopened.class_binding_snapshot(&uris).unwrap();
    assert_eq!(unsupported.served_generation, 2);
    assert!(
        !unsupported.documents[0]
            .binding_provenance
            .as_ref()
            .unwrap()
            .source_supported
    );
    assert!(unsupported.documents[0].bindings.is_empty());
    assert!(
        unsupported.documents[0]
            .binding_provenance
            .as_ref()
            .unwrap()
            .direct_exports
            .is_empty()
    );
    let mut index = WorkspaceIndex::with_store(reopened);
    index
        .refresh(3, [Document::new(uri, "class Broken {")], &[])
        .unwrap();
    let rejected = index.class_binding_snapshot(&uris).unwrap();
    assert_eq!(rejected.served_generation, 3);
    assert!(
        rejected.documents[0].heritage.is_none()
            && rejected.documents[0].binding_provenance.is_none()
    );
    index
        .refresh(4, [Document::new(uri, "export class Fresh {}")], &[])
        .unwrap();
    index.refresh(5, [], &[uri]).unwrap();
    let removed = index.class_binding_snapshot(&uris).unwrap();
    assert_eq!(removed.served_generation, 5);
    assert!(
        removed.documents[0].heritage.is_none()
            && removed.documents[0].binding_provenance.is_none()
    );
    assert!(removed.documents[0].bindings.is_empty());
}

#[test]
fn malformed_provenance_or_cross_document_bindings_cannot_advance_generation() {
    let temp = TestDir::new("class-binding-invalid-metadata");
    let source = Document::new(
        "file:///binding-snapshot/Child.ets",
        "import { Base } from './Base'\nexport class Child extends Base {}\n",
    );
    let parsed = parse_document_symbols(&source).unwrap();
    let mut wrong_uri = parsed.clone();
    wrong_uri.bindings[0].uri = "file:///binding-snapshot/Other.ets".into();
    let mut unsupported_export = parsed.clone();
    unsupported_export
        .class_binding_provenance
        .as_mut()
        .unwrap()
        .source_supported = false;
    let mut absent_heritage = parsed.clone();
    absent_heritage.class_heritage = None;
    let mut invalid_range = parsed.clone();
    invalid_range
        .class_binding_provenance
        .as_mut()
        .unwrap()
        .direct_exports[0]
        .start
        .character += 1;
    let mut memory = WorkspaceIndex::with_store(MemoryStore::default());
    let mut sqlite = WorkspaceIndex::with_store(
        SqliteStore::open(temp.path().join("index.sqlite3"), ROOT).unwrap(),
    );
    for index in [&mut memory, &mut sqlite] {
        index.refresh(1, [source.clone()], &[]).unwrap();
        let before = index
            .class_binding_snapshot(std::slice::from_ref(&source.uri))
            .unwrap();
        for invalid in [
            &wrong_uri,
            &unsupported_export,
            &absent_heritage,
            &invalid_range,
        ] {
            assert_eq!(
                index
                    .activate_catalog(2, vec![invalid.clone()], vec![])
                    .unwrap_err()
                    .kind(),
                StoreErrorKind::InvalidData
            );
            assert_eq!(
                index
                    .class_binding_snapshot(std::slice::from_ref(&source.uri))
                    .unwrap(),
                before
            );
        }
    }
}
