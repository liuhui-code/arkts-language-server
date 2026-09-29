use arkts_index_core::{
    Document, MemoryStore, Position, RefreshBatch, StoreErrorKind, SymbolStore, WorkspaceIndex,
    parse_document_class_heritage, parse_document_symbols,
};
use arkts_index_sqlite::SqliteStore;

const ROOT: &str = "file:///heritage-workspace";
const CHILD: &str = "file:///heritage-workspace/Child.ets";

#[path = "support/temp_dir.rs"]
mod temp_dir;
use temp_dir::TestDir;

#[test]
fn memory_and_sqlite_preserve_class_heritage_spelling_and_utf16_ranges_on_reopen() {
    let temp = TestDir::new("heritage-reopen");
    let database = temp.path().join("index.sqlite3");
    let document = Document::new(
        CHILD,
        "// 🦀\nimport { Original as Alias } from './Base'\nexport class Child extends Alias {}\nclass Leaf extends Child {}\n",
    );
    let expected = parse_document_class_heritage(&document).unwrap();
    let mut memory = WorkspaceIndex::with_store(MemoryStore::default());
    let mut sqlite = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    for index in [&mut memory, &mut sqlite] {
        index.refresh(1, [document.clone()], &[]).unwrap();
        let found = index.class_heritage(CHILD).unwrap();
        assert_eq!(found.served_generation, 1);
        assert_eq!(found.facts, Some(expected.clone()));
        assert_eq!(
            index.class_heritage("file:///absent.ets").unwrap().facts,
            None
        );
    }
    drop(sqlite);
    let reopened = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    assert_eq!(
        reopened.class_heritage(CHILD).unwrap(),
        memory.class_heritage(CHILD).unwrap()
    );
}

#[test]
fn partial_and_known_empty_facts_are_not_conflated_with_unknown_documents() {
    let temp = TestDir::new("heritage-state");
    let database = temp.path().join("index.sqlite3");
    let partial = Document::new(
        CHILD,
        "class Base {}\nconst hidden = `${class Hidden extends Base {}}`;\n",
    );
    let empty_uri = "file:///heritage-workspace/Empty.ets";
    let empty = Document::new(empty_uri, "export const value = 1\n");
    let mut memory = WorkspaceIndex::with_store(MemoryStore::default());
    let mut sqlite = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    for index in [&mut memory, &mut sqlite] {
        index
            .refresh(1, [partial.clone(), empty.clone()], &[])
            .unwrap();
        let facts = index.class_heritage(CHILD).unwrap().facts.unwrap();
        assert!(!facts.lexically_complete);
        assert_eq!(facts.classes.len(), 1);
        let empty_facts = index.class_heritage(empty_uri).unwrap().facts.unwrap();
        assert!(empty_facts.lexically_complete);
        assert!(empty_facts.classes.is_empty());
        assert!(
            index
                .class_heritage("file:///missing.ets")
                .unwrap()
                .facts
                .is_none()
        );
    }
    drop(sqlite);
    let reopened = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    for uri in [CHILD, empty_uri, "file:///missing.ets"] {
        assert_eq!(
            reopened.class_heritage(uri).unwrap(),
            memory.class_heritage(uri).unwrap()
        );
    }
}

#[test]
fn invalid_heritage_ranges_cannot_activate_a_generation_or_replace_good_facts() {
    let temp = TestDir::new("heritage-invalid-range");
    let mut memory = WorkspaceIndex::with_store(MemoryStore::default());
    let mut sqlite = WorkspaceIndex::with_store(
        SqliteStore::open(temp.path().join("index.sqlite3"), ROOT).unwrap(),
    );
    let source = Document::new(CHILD, "export class Child extends Base {}\n");
    let expected = parse_document_class_heritage(&source).unwrap();
    let mut invalid = parse_document_symbols(&source).unwrap();
    invalid.class_heritage.as_mut().unwrap().classes[0]
        .name_range
        .end = Position::new(5, 0);
    for index in [&mut memory, &mut sqlite] {
        index.refresh(1, [source.clone()], &[]).unwrap();
        let error = index
            .activate_catalog(2, vec![invalid.clone()], vec![])
            .expect_err("class name range outside its declaration must not commit");
        assert_eq!(error.kind(), StoreErrorKind::InvalidData);
        assert_eq!(index.metadata().unwrap().committed_generation, 1);
        assert_eq!(
            index.class_heritage(CHILD).unwrap().facts,
            Some(expected.clone())
        );
    }
}

#[test]
fn refresh_replacement_rejection_and_removal_never_leave_stale_class_facts() {
    let temp = TestDir::new("heritage-mutations");
    let database = temp.path().join("index.sqlite3");
    let mut memory = WorkspaceIndex::with_store(MemoryStore::default());
    let mut sqlite = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    for index in [&mut memory, &mut sqlite] {
        index
            .refresh(
                1,
                [Document::new(
                    CHILD,
                    "class Old extends Base {}\nclass Leaf extends Old {}",
                )],
                &[],
            )
            .unwrap();
        index
            .refresh(2, [Document::new(CHILD, "export const inert = 1")], &[])
            .unwrap();
        let empty = index.class_heritage(CHILD).unwrap();
        assert_eq!(empty.served_generation, 2);
        assert!(empty.facts.unwrap().classes.is_empty());
        let rejected = index
            .refresh(3, [Document::new(CHILD, "class Broken {")], &[])
            .unwrap();
        assert_eq!(rejected.rejected_documents, [CHILD]);
        assert!(index.class_heritage(CHILD).unwrap().facts.is_none());
        index
            .refresh(
                4,
                [Document::new(CHILD, "class Fresh extends Base {}")],
                &[],
            )
            .unwrap();
        assert_eq!(
            index.class_heritage(CHILD).unwrap().facts.unwrap().classes[0].name,
            "Fresh"
        );
        index.refresh(5, [], &[CHILD]).unwrap();
        let removed = index.class_heritage(CHILD).unwrap();
        assert_eq!(removed.served_generation, 5);
        assert!(removed.facts.is_none());
    }
    drop(sqlite);
    let reopened = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    assert_eq!(
        reopened.class_heritage(CHILD).unwrap(),
        memory.class_heritage(CHILD).unwrap()
    );
}

#[test]
fn full_catalog_replacement_preserves_order_optional_bases_and_unknown_facts() {
    let temp = TestDir::new("heritage-full-catalog");
    let database = temp.path().join("index.sqlite3");
    let mut memory = WorkspaceIndex::with_store(MemoryStore::default());
    let mut sqlite = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    let source = (0..120)
        .map(|number| {
            if number % 2 == 0 {
                format!("class C{number} extends Base {{}}\n")
            } else {
                format!("class C{number} {{}}\n")
            }
        })
        .collect::<String>();
    let document = Document::new(CHILD, source);
    let expected = parse_document_class_heritage(&document).unwrap();
    let mut unknown =
        parse_document_symbols(&Document::new("file:///unknown.ets", "class Unknown {}")).unwrap();
    unknown.class_heritage = None;
    // Emulate a legacy document with neither source-validated metadata field.
    unknown.class_binding_provenance = None;
    for index in [&mut memory, &mut sqlite] {
        index
            .refresh(1, [Document::new("file:///old.ets", "class Old {}")], &[])
            .unwrap();
        index
            .activate_catalog(
                2,
                vec![parse_document_symbols(&document).unwrap(), unknown.clone()],
                vec![],
            )
            .unwrap();
        assert_eq!(
            index.class_heritage(CHILD).unwrap().facts,
            Some(expected.clone())
        );
        assert_eq!(index.class_heritage(CHILD).unwrap().served_generation, 2);
        assert!(
            index
                .class_heritage("file:///old.ets")
                .unwrap()
                .facts
                .is_none()
        );
        assert!(
            index
                .class_heritage("file:///unknown.ets")
                .unwrap()
                .facts
                .is_none()
        );
    }
    drop(sqlite);
    let reopened = WorkspaceIndex::with_store(SqliteStore::open(database, ROOT).unwrap());
    assert_eq!(
        reopened.class_heritage(CHILD).unwrap(),
        memory.class_heritage(CHILD).unwrap()
    );
}

#[test]
fn failed_incremental_commit_rolls_back_heritage_facts_and_generation_together() {
    let temp = TestDir::new("heritage-rollback");
    let database = temp.path().join("index.sqlite3");
    let mut store = SqliteStore::open(&database, ROOT).unwrap();
    let batch = |generation, name: &str| RefreshBatch {
        generation,
        replacements: vec![
            parse_document_symbols(&Document::new(
                CHILD,
                format!("class {name} extends Base {{}}"),
            ))
            .unwrap(),
        ],
        removed_uris: vec![],
        rejected_uris: vec![],
    };
    store.apply_batch(batch(1, "Old")).unwrap();
    let before = store.class_heritage(CHILD).unwrap();
    store.fail_before_commit_once();
    assert!(store.apply_batch(batch(2, "New")).is_err());
    assert_eq!(store.class_heritage(CHILD).unwrap(), before);
    drop(store);
    let mut reopened = SqliteStore::open(&database, ROOT).unwrap();
    assert_eq!(reopened.class_heritage(CHILD).unwrap(), before);
    reopened.apply_batch(batch(2, "New")).unwrap();
    let committed = reopened.class_heritage(CHILD).unwrap();
    assert_eq!(committed.served_generation, 2);
    assert_eq!(committed.facts.unwrap().classes[0].name, "New");
}

#[test]
fn unavailable_heritage_does_not_reject_a_document_accepted_by_symbol_discovery() {
    let temp = TestDir::new("heritage-independent-discovery");
    // Legacy symbol discovery balances each delimiter kind independently.
    // The stricter heritage scanner must not redefine that existing contract.
    let source = Document::new(CHILD, "class Child { [ } ]");
    let symbols = parse_document_symbols(&source).unwrap();
    assert!(parse_document_class_heritage(&source).is_err());
    assert!(symbols.class_heritage.is_none());
    let mut memory = WorkspaceIndex::with_store(MemoryStore::default());
    let mut sqlite = WorkspaceIndex::with_store(
        SqliteStore::open(temp.path().join("index.sqlite3"), ROOT).unwrap(),
    );
    for index in [&mut memory, &mut sqlite] {
        let report = index.refresh(1, [source.clone()], &[]).unwrap();
        assert!(report.rejected_documents.is_empty());
        let found = index.search("Child", 10).unwrap();
        assert_eq!(found.items.len(), 1);
        assert_eq!(found.items[0].name, "Child");
        let heritage = index.class_heritage(CHILD).unwrap();
        assert_eq!(heritage.served_generation, 1);
        assert!(heritage.facts.is_none());
    }
}
