use arkts_index_sqlite::{ManifestEntry, ManifestLog};
#[path = "support/temp_dir.rs"]
mod temp_dir;

#[test]
fn staged_mappings_remain_hidden_until_the_entire_group_is_published() {
    let temp = temp_dir::TestDir::new("file-version-publication");
    let mut log = ManifestLog::create(
        &temp.path().join("manifest.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    log.stage("initial", &[ManifestEntry::accepted("a.ets", "a1")])
        .unwrap();
    log.seal("initial").unwrap();
    assert_eq!(log.snapshot().unwrap().head, 0);
    assert_eq!(log.publish("initial", 0).unwrap(), 1);
    log.stage(
        "edited",
        &[
            ManifestEntry::accepted("a.ets", "a2"),
            ManifestEntry::accepted("b.ets", "b1"),
        ],
    )
    .unwrap();
    log.seal("edited").unwrap();
    let before = log.snapshot().unwrap();
    assert_eq!(before.head, 1);
    assert_eq!(before.entries, vec![ManifestEntry::accepted("a.ets", "a1")]);
    assert_eq!(log.publish("edited", 1).unwrap(), 2);
    let after = log.snapshot().unwrap();
    assert_eq!(after.head, 2);
    assert_eq!(
        after.entries,
        vec![
            ManifestEntry::accepted("a.ets", "a2"),
            ManifestEntry::accepted("b.ets", "b1")
        ]
    );
}

#[test]
fn independent_connection_and_reopen_observe_only_committed_manifest() {
    let temp = temp_dir::TestDir::new("manifest-reopen");
    let path = temp.path().join("manifest.sqlite3");
    let mut writer = ManifestLog::create(&path, "workspace", "store", "domain").unwrap();
    let reader = ManifestLog::open_existing(&path, "workspace", "store", "domain").unwrap();
    writer
        .stage("first", &[ManifestEntry::accepted("a.ets", "a1")])
        .unwrap();
    writer.seal("first").unwrap();
    assert!(reader.snapshot().unwrap().entries.is_empty());
    writer.publish("first", 0).unwrap();
    assert_eq!(
        reader.snapshot().unwrap().entries,
        vec![ManifestEntry::accepted("a.ets", "a1")]
    );
    drop(reader);
    drop(writer);
    let reopened = ManifestLog::open_existing(&path, "workspace", "store", "domain").unwrap();
    assert_eq!(reopened.snapshot().unwrap().head, 1);
    assert!(ManifestLog::open_existing(&path, "other", "store", "domain").is_err());
    assert!(ManifestLog::open_existing(&path, "workspace", "other", "domain").is_err());
    assert!(ManifestLog::open_existing(&path, "workspace", "store", "other").is_err());
    assert!(
        ManifestLog::open_existing(&temp.path().join("missing"), "workspace", "store", "domain")
            .is_err()
    );
    assert!(!temp.path().join("missing").exists());
}

#[test]
fn stale_publish_and_sealed_mutation_cannot_overwrite_the_latest_group() {
    let temp = temp_dir::TestDir::new("manifest-cas");
    let path = temp.path().join("manifest.sqlite3");
    let mut first = ManifestLog::create(&path, "workspace", "store", "domain").unwrap();
    let mut second = ManifestLog::open_existing(&path, "workspace", "store", "domain").unwrap();
    first
        .stage("stale", &[ManifestEntry::accepted("a.ets", "old")])
        .unwrap();
    first.seal("stale").unwrap();
    second
        .stage("current", &[ManifestEntry::accepted("a.ets", "current")])
        .unwrap();
    second.seal("current").unwrap();
    assert_eq!(second.publish("current", 0).unwrap(), 1);
    assert!(first.publish("stale", 0).is_err());
    assert!(
        first
            .stage("stale", &[ManifestEntry::accepted("b.ets", "late")])
            .is_err()
    );
    assert_eq!(
        first.snapshot().unwrap().entries,
        vec![ManifestEntry::accepted("a.ets", "current")]
    );
    assert_eq!(second.publish("current", 0).unwrap(), 1);
    first
        .stage("delete", &[ManifestEntry::removed("a.ets")])
        .unwrap();
    first.seal("delete").unwrap();
    assert_eq!(first.publish("delete", 1).unwrap(), 2);
    assert!(second.snapshot().unwrap().entries.is_empty());
}

#[test]
fn rejected_replacement_is_unknown_not_deleted_and_cannot_resurrect_old_facts() {
    let temp = temp_dir::TestDir::new("manifest-rejection");
    let mut log = ManifestLog::create(
        &temp.path().join("data.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    log.stage("old", &[ManifestEntry::accepted("a.ets", "a1")])
        .unwrap();
    log.seal("old").unwrap();
    log.publish("old", 0).unwrap();
    log.stage("invalid", &[ManifestEntry::rejected("a.ets", "read-error")])
        .unwrap();
    log.seal("invalid").unwrap();
    log.publish("invalid", 1).unwrap();
    assert_eq!(
        log.snapshot().unwrap().entries,
        vec![ManifestEntry::rejected("a.ets", "read-error")]
    );
    log.stage("removed", &[ManifestEntry::removed("a.ets")])
        .unwrap();
    log.seal("removed").unwrap();
    log.publish("removed", 2).unwrap();
    assert!(log.snapshot().unwrap().entries.is_empty());
}

#[test]
fn point_observation_preserves_entry_identity_and_sees_tombstones() {
    let temp = temp_dir::TestDir::new("manifest-observation");
    let mut log = ManifestLog::create(
        &temp.path().join("data.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    assert_eq!(log.lookup("a.ets").unwrap(), None);
    log.stage("one", &[ManifestEntry::accepted("a.ets", "v1")])
        .unwrap();
    log.seal("one").unwrap();
    log.publish("one", 0).unwrap();
    log.stage("two", &[ManifestEntry::accepted("a.ets", "hidden")])
        .unwrap();
    assert_eq!(log.lookup("a.ets").unwrap().unwrap().group_id, "one");
    log.seal("two").unwrap();
    log.publish("two", 1).unwrap();
    let observation = log.lookup("a.ets").unwrap().unwrap();
    assert_eq!(observation.group_id, "two");
    assert_eq!(
        observation.entry,
        ManifestEntry::accepted("a.ets", "hidden")
    );
    log.stage("three", &[ManifestEntry::removed("a.ets")])
        .unwrap();
    log.seal("three").unwrap();
    log.publish("three", 2).unwrap();
    assert_eq!(
        log.lookup("a.ets").unwrap().unwrap().entry,
        ManifestEntry::removed("a.ets")
    );
}
