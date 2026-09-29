use arkts_index_core::{
    Document, MAX_CLASS_BINDING_SNAPSHOT_DOCUMENTS, StoreErrorKind, WorkspaceIndex,
};

#[test]
fn unsupported_source_never_exposes_lossy_legacy_bindings_as_validated() {
    for source in [
        "import type { Base } from './Base'\nclass Child extends Base {}",
        "import lazy { Base } from './Base'\nclass Child extends Base {}",
        "import { Base 123 as Alias } from './Base'\nclass Child extends Alias {}",
        "import { Base } from './Base'\nconst Base = 1\nclass Child extends Base {}",
        "export lazy { Base } from './Base'\n",
        "class Child extends ns.Base {}",
    ] {
        let mut index = WorkspaceIndex::in_memory();
        index
            .refresh(1, [Document::new("file:///Child.ets", source)], &[])
            .unwrap();
        let snapshot = index
            .class_binding_snapshot(&["file:///Child.ets".into()])
            .unwrap();
        let document = &snapshot.documents[0];
        assert!(
            !document
                .binding_provenance
                .as_ref()
                .unwrap()
                .source_supported,
            "{source}"
        );
        assert!(
            document
                .binding_provenance
                .as_ref()
                .unwrap()
                .direct_exports
                .is_empty()
        );
        assert!(
            document.bindings.is_empty(),
            "lossy bindings leaked: {source}"
        );
    }
}

#[test]
fn snapshot_inputs_are_bounded_unique_and_nonempty_but_allow_an_empty_read() {
    let index = WorkspaceIndex::in_memory();
    let empty = index.class_binding_snapshot(&[]).unwrap();
    assert!(empty.documents.is_empty());
    assert_eq!(empty.served_generation, 0);
    for invalid in [
        vec!["".into()],
        vec!["file:///A.ets".into(), "file:///A.ets".into()],
        (0..=MAX_CLASS_BINDING_SNAPSHOT_DOCUMENTS)
            .map(|n| format!("file:///{n}.ets"))
            .collect(),
    ] {
        assert_eq!(
            index.class_binding_snapshot(&invalid).unwrap_err().kind(),
            StoreErrorKind::InvalidData
        );
    }
    let maximum: Vec<_> = (0..MAX_CLASS_BINDING_SNAPSHOT_DOCUMENTS)
        .map(|n| format!("file:///{n}.ets"))
        .collect();
    assert_eq!(
        index
            .class_binding_snapshot(&maximum)
            .unwrap()
            .documents
            .len(),
        maximum.len()
    );
}
