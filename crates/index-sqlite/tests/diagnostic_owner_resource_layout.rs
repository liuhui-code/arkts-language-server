use arkts_index_sqlite::VersionedFacts;
#[path = "support/previous_owner_fixture.rs"]
mod previous_owner_fixture;
#[test]
fn previous_slot_schema_cannot_be_retagged_current_before_owner_registration() {
    for slots in [false, true] {
        let (temp, record) = if slots {
            previous_owner_fixture::fixture_slots()
        } else {
            previous_owner_fixture::fixture()
        };
        let path = temp.path().join(record["store"].as_str().unwrap());
        let db = rusqlite::Connection::open(&path).unwrap();
        let format = if cfg!(feature = "experimental-occurrence-without-rowid") {
            110
        } else {
            10
        };
        db.execute_batch(&format!("PRAGMA ignore_check_constraints=ON; UPDATE file_facts_format SET version={format}; PRAGMA ignore_check_constraints=OFF;")).unwrap();
        let before: i64 = db
            .query_row("SELECT count(*) FROM manifest_owners", [], |r| r.get(0))
            .unwrap();
        let revision = slots.then(|| {
            db.query_row("SELECT owner_revision FROM manifest_identity", [], |r| {
                r.get::<_, i64>(0)
            })
            .unwrap()
        });
        drop(db);
        let error = VersionedFacts::open_existing(
            &path,
            record["workspace"].as_str().unwrap(),
            record["store"].as_str().unwrap(),
            record["domain"].as_str().unwrap(),
        )
        .err()
        .expect("tag cannot bypass missing resource layout");
        assert!(
            error.to_string().contains("owner layout mismatch"),
            "{error}"
        );
        let db = rusqlite::Connection::open(&path).unwrap();
        assert_eq!(
            db.query_row("SELECT count(*) FROM manifest_owners", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            before
        );
        if let Some(revision) = revision {
            assert_eq!(
                db.query_row("SELECT owner_revision FROM manifest_identity", [], |r| r
                    .get::<_, i64>(0))
                    .unwrap(),
                revision
            );
        } else {
            assert_eq!(db.query_row("SELECT count(*) FROM pragma_table_info('manifest_identity') WHERE name='owner_revision'",[],|r|r.get::<_,i64>(0)).unwrap(),0);
        }
        let name = format!("{}.owners", path.file_name().unwrap().to_str().unwrap());
        assert!(
            !path.with_file_name(name).exists(),
            "rejected layout must not allocate an owner slot"
        );
    }
}
