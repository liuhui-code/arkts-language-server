use arkts_index_core::{
    ClassBaseBinding, Document, Position, TextRange, WorkspaceIndex,
    resolve_class_base_binding_snapshot,
};
use arkts_index_sqlite::SqliteStore;

#[path = "support/temp_dir.rs"]
mod temp_dir;
use temp_dir::TestDir;

const ROOT: &str = "file:///binding-overlay";
const BASE: &str = "file:///binding-overlay/Base.ets";
const BARREL: &str = "file:///binding-overlay/Barrel.ets";
const CHILD: &str = "file:///binding-overlay/Child.ets";
const OTHER: &str = "file:///binding-overlay/Other.ets";
const GENERATION: u64 = 7;

fn persisted_sources() -> [Document; 4] {
    [
        Document::new(BASE, "export class Base {}\n"),
        Document::new(OTHER, "/* 🦀 */ export class Other {}\n"),
        Document::new(BARREL, "export { Base as Public } from './Base.ets'\n"),
        Document::new(
            CHILD,
            "import { Public as Alias } from './Barrel.ets'\nclass Child extends Alias {}\n",
        ),
    ]
}

fn reopened_index(temp: &TestDir, sources: impl IntoIterator<Item = Document>) -> WorkspaceIndex {
    let database = temp.path().join("index.sqlite3");
    let mut index = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    index.refresh(GENERATION, sources, &[]).unwrap();
    drop(index);
    WorkspaceIndex::with_store(SqliteStore::open(database, ROOT).unwrap())
}

fn base_binding() -> ClassBaseBinding {
    ClassBaseBinding::Resolved {
        declaration_uri: BASE.into(),
        name: "Base".into(),
        name_range: TextRange::new(Position::new(0, 13), Position::new(0, 17)),
        support_uris: vec![BARREL.into(), BASE.into(), CHILD.into()],
    }
}

#[test]
fn explicit_extension_import_and_reexport_aliases_resolve_after_sqlite_reopen() {
    let temp = TestDir::new("class-binding-overlay-reopen");
    let sources = persisted_sources();
    let uris: Vec<_> = sources.iter().map(|source| source.uri.clone()).collect();
    let index = reopened_index(&temp, sources);
    let snapshot = index.class_binding_snapshot(&uris).unwrap();
    assert_eq!(snapshot.served_generation, GENERATION);
    assert_eq!(
        resolve_class_base_binding_snapshot(&snapshot, GENERATION, &[], CHILD, Position::new(1, 7)),
        base_binding()
    );
}

#[test]
fn unsaved_child_and_barrel_redirect_the_base_without_persisting_overlay_facts() {
    let temp = TestDir::new("class-binding-overlay-unsaved");
    let sources = persisted_sources();
    let uris: Vec<_> = sources.iter().map(|source| source.uri.clone()).collect();
    let index = reopened_index(&temp, sources);
    let snapshot = index.class_binding_snapshot(&uris).unwrap();
    let before = snapshot.clone();
    let overlays = [
        Document::new(
            CHILD,
            "import { Current as Fresh } from './Barrel.ets'\r\n/* 🦀 */ class Child extends Fresh {}\r\n",
        ),
        Document::new(BARREL, "export { Other as Current } from './Other.ets'\n"),
    ];
    assert_eq!(
        resolve_class_base_binding_snapshot(
            &snapshot,
            GENERATION,
            &overlays,
            CHILD,
            Position::new(1, 16),
        ),
        ClassBaseBinding::Resolved {
            declaration_uri: OTHER.into(),
            name: "Other".into(),
            name_range: TextRange::new(Position::new(0, 22), Position::new(0, 27)),
            support_uris: vec![BARREL.into(), CHILD.into(), OTHER.into()],
        }
    );
    assert_eq!(snapshot, before);
    assert_eq!(index.class_binding_snapshot(&uris).unwrap(), before);
    drop(index);
    let reopened = WorkspaceIndex::with_store(
        SqliteStore::open(temp.path().join("index.sqlite3"), ROOT).unwrap(),
    );
    let persisted = reopened.class_binding_snapshot(&uris).unwrap();
    assert_eq!(persisted, before);
    assert_eq!(
        resolve_class_base_binding_snapshot(
            &persisted,
            GENERATION,
            &[],
            CHILD,
            Position::new(1, 7),
        ),
        base_binding()
    );
}

#[test]
fn invalid_current_overlays_shadow_a_successful_reopened_binding_chain() {
    let temp = TestDir::new("class-binding-overlay-invalid");
    let sources = persisted_sources();
    let uris: Vec<_> = sources.iter().map(|source| source.uri.clone()).collect();
    let index = reopened_index(&temp, sources);
    let snapshot = index.class_binding_snapshot(&uris).unwrap();
    assert_eq!(
        resolve_class_base_binding_snapshot(&snapshot, GENERATION, &[], CHILD, Position::new(1, 7)),
        base_binding()
    );
    for overlay in [
        Document::new(
            CHILD,
            "import { Public as Alias } from './Barrel.ets'\nclass Child extends Alias {",
        ),
        Document::new(BARREL, "export { Base as Public } from './Base.ets'\n/*"),
        Document::new(BARREL, "export * from './Base.ets'\n"),
        Document::new(BASE, "export default class Base {}\n"),
    ] {
        assert_eq!(
            resolve_class_base_binding_snapshot(
                &snapshot,
                GENERATION,
                std::slice::from_ref(&overlay),
                CHILD,
                Position::new(1, 7),
            ),
            ClassBaseBinding::Unknown,
            "invalid current source at {} must not revive disk bindings",
            overlay.uri
        );
    }
    assert_eq!(index.class_binding_snapshot(&uris).unwrap(), snapshot);
}

#[test]
fn valid_overlay_can_supply_a_requested_base_missing_from_the_reopened_store() {
    let temp = TestDir::new("class-binding-overlay-missing");
    let uris = vec![CHILD.into(), BASE.into()];
    let index = reopened_index(
        &temp,
        [Document::new(
            CHILD,
            "import { Base } from './Base.ets'\nclass Child extends Base {}\n",
        )],
    );
    let snapshot = index.class_binding_snapshot(&uris).unwrap();
    let missing = &snapshot.documents[1];
    assert_eq!(missing.uri, BASE);
    assert!(missing.heritage.is_none() && missing.binding_provenance.is_none());
    assert!(missing.bindings.is_empty());
    assert_eq!(
        resolve_class_base_binding_snapshot(&snapshot, GENERATION, &[], CHILD, Position::new(1, 7)),
        ClassBaseBinding::Unknown
    );
    assert_eq!(
        resolve_class_base_binding_snapshot(
            &snapshot,
            GENERATION,
            &[Document::new(BASE, "/* 🦀 */ export class Base {}\n")],
            CHILD,
            Position::new(1, 7),
        ),
        ClassBaseBinding::Resolved {
            declaration_uri: BASE.into(),
            name: "Base".into(),
            name_range: TextRange::new(Position::new(0, 22), Position::new(0, 26)),
            support_uris: vec![BASE.into(), CHILD.into()],
        }
    );
    assert_eq!(index.class_binding_snapshot(&uris).unwrap(), snapshot);
}

#[test]
fn old_generation_is_unknown_even_when_current_overlay_source_is_valid() {
    let temp = TestDir::new("class-binding-overlay-generation");
    let sources = persisted_sources();
    let uris: Vec<_> = sources.iter().map(|source| source.uri.clone()).collect();
    let mut index = reopened_index(&temp, sources.clone());
    let old = index.class_binding_snapshot(&uris).unwrap();
    index.refresh(GENERATION + 1, sources, &[]).unwrap();
    let current = index.class_binding_snapshot(&uris).unwrap();
    let overlays = [Document::new(
        CHILD,
        "import { Public as Current } from './Barrel.ets'\nclass Child extends Current {}\n",
    )];
    assert_eq!(old.served_generation, GENERATION);
    assert_eq!(current.served_generation, GENERATION + 1);
    assert_eq!(
        resolve_class_base_binding_snapshot(
            &current,
            GENERATION + 1,
            &overlays,
            CHILD,
            Position::new(1, 7),
        ),
        base_binding()
    );
    assert_eq!(
        resolve_class_base_binding_snapshot(
            &old,
            GENERATION + 1,
            &overlays,
            CHILD,
            Position::new(1, 7),
        ),
        ClassBaseBinding::Unknown
    );
}
