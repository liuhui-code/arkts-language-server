use arkts_index_sqlite::{ReadCancellation, VersionedFacts};
#[path = "support/temp_dir.rs"]
mod temp_dir;
#[test]
fn cancelled_read_does_not_enter_the_callback_or_poison_the_next_snapshot() {
    let temp = temp_dir::TestDir::new("cancelled-read-snapshot");
    let facts = VersionedFacts::create(
        &temp.path().join("data.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let cancel = ReadCancellation::default();
    cancel.cancel();
    let err = facts
        .read_snapshot::<()>(None, &cancel, |_, _, _| {
            panic!("cancelled request entered its read callback")
        })
        .unwrap_err();
    assert_eq!(err.kind(), arkts_index_core::StoreErrorKind::Cancelled);
    let next = facts
        .read_snapshot(None, &ReadCancellation::default(), |read, head, q| {
            assert_eq!(head, 0);
            assert!(q.is_none());
            Ok(read.metadata()?.committed_generation)
        })
        .unwrap();
    assert_eq!(next.value, 0);
    assert_eq!(next.head, 0);
    cancel.cancel();
    assert_eq!(
        facts
            .read_snapshot(None, &ReadCancellation::default(), |_, head, _| Ok(head))
            .unwrap()
            .value,
        0,
        "late old cancellation must not interrupt the reused connection"
    );
}

#[test]
fn a_legacy_discovery_read_can_cancel_without_inventing_versioned_proof() {
    let temp = temp_dir::TestDir::new("cancelled-legacy-read");
    let store =
        arkts_index_sqlite::CatalogStore::open(temp.path().join("symbols-v2.sqlite3"), "workspace")
            .unwrap();
    let cancel = ReadCancellation::default();
    cancel.cancel();
    assert_eq!(
        store
            .discovery_read::<()>(&cancel, |_| panic!("cancelled legacy callback ran"))
            .unwrap_err()
            .kind(),
        arkts_index_core::StoreErrorKind::Cancelled
    );
    assert_eq!(
        store
            .discovery_read(&ReadCancellation::default(), |s| Ok(s
                .metadata()?
                .committed_generation))
            .unwrap(),
        0
    );
}

#[test]
fn one_cancel_owner_cannot_silently_replace_another_active_connection_binding() {
    let temp = temp_dir::TestDir::new("exclusive-read-cancel-binding");
    let path = temp.path().join("data.sqlite3");
    let first = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let second = VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap();
    let cancel = ReadCancellation::default();
    first
        .read_snapshot(None, &cancel, |_, _, _| {
            let competing = second.read_snapshot(None, &cancel, |_, _, _| Ok(()));
            assert_eq!(
                competing.unwrap_err().kind(),
                arkts_index_core::StoreErrorKind::Busy
            );
            Ok(())
        })
        .unwrap();
    second
        .read_snapshot(None, &cancel, |_, _, _| Ok(()))
        .unwrap();
}

#[test]
fn rejected_nested_snapshot_does_not_remove_the_outer_queries_sql_cancellation() {
    use arkts_index_core::{Document, SymbolQuery, parse_document_symbols};
    use sha2::{Digest, Sha256};
    let temp = temp_dir::TestDir::new("nested-read-cancel-binding");
    let mut facts = VersionedFacts::create(
        &temp.path().join("data.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let text = (0..300)
        .map(|i| format!("export class Match{i} {{}}\n"))
        .collect::<String>();
    let uri = "file:///workspace/A.ets";
    let doc = parse_document_symbols(&Document::new(uri, &text)).unwrap();
    facts
        .write_version(
            "v1",
            &format!("{:x}", Sha256::digest(text.as_bytes())),
            &doc,
        )
        .unwrap();
    facts
        .stage_group("g1", &[(uri.into(), "v1".into())])
        .unwrap();
    facts.publish_group("g1", 0).unwrap();
    let cancel = ReadCancellation::default();
    let result = facts.read_snapshot(None, &cancel, |read, _, _| {
        let nested = facts.read_snapshot(None, &ReadCancellation::default(), |_, _, _| Ok(()));
        assert_eq!(
            nested.unwrap_err().kind(),
            arkts_index_core::StoreErrorKind::Busy
        );
        // No SQL is running at this instant, so sqlite3_interrupt alone is a
        // no-op. The outer progress handler must still observe this flag.
        cancel.cancel();
        let interrupted = read.search(&SymbolQuery::new("Match", 1000));
        assert_eq!(
            interrupted.err().map(|error| error.kind()),
            Some(arkts_index_core::StoreErrorKind::Cancelled)
        );
        Ok(())
    });
    assert_eq!(
        result.unwrap_err().kind(),
        arkts_index_core::StoreErrorKind::Cancelled
    );
}
