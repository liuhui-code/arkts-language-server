use arkts_index_core::{Document, SymbolQuery, WorkspaceIndex};
#[test]
fn borrowed_read_port_preserves_the_existing_query_and_metadata_contract() {
    let mut index = WorkspaceIndex::in_memory();
    index
        .refresh(
            1,
            [Document::new("file:///a.ets", "export class Visible {}")],
            &[],
        )
        .unwrap();
    let port = index.read_store();
    assert_eq!(port.metadata().unwrap().committed_generation, 1);
    assert_eq!(
        port.search(&SymbolQuery::new("Visible", 10)).unwrap(),
        index.search("Visible", 10).unwrap()
    );
    assert!(
        port.search(&SymbolQuery::new("Visible", 10).excluding_uris(["file:///a.ets".into()]))
            .unwrap()
            .items
            .is_empty()
    );
}
