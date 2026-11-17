use arkts_index_sqlite::{ManifestEntry, ManifestLog};
#[path = "support/temp_dir.rs"]
mod temp_dir;
fn stage(log: &mut ManifestLog, group: &str, entries: &[ManifestEntry]) {
    log.stage(group, entries).unwrap();
    log.seal(group).unwrap();
}
#[test]
fn independent_existing_file_edits_rebase_but_same_file_aba_is_rejected() {
    let temp = temp_dir::TestDir::new("manifest-read-set");
    let path = temp.path().join("manifest.sqlite3");
    let mut a = ManifestLog::create(&path, "workspace", "store", "domain").unwrap();
    let mut b = ManifestLog::open_existing(&path, "workspace", "store", "domain").unwrap();
    stage(
        &mut a,
        "initial",
        &[
            ManifestEntry::accepted("a.ets", "a1"),
            ManifestEntry::accepted("b.ets", "b1"),
        ],
    );
    a.publish("initial", 0).unwrap();
    let read_a = a.observe_read_set(&["a.ets".into()]).unwrap();
    let read_b = b.observe_read_set(&["b.ets".into()]).unwrap();
    stage(&mut a, "edit-a", &[ManifestEntry::accepted("a.ets", "a2")]);
    stage(&mut b, "edit-b", &[ManifestEntry::accepted("b.ets", "b2")]);
    assert_eq!(a.publish_checked("edit-a", &read_a).unwrap(), 2);
    assert_eq!(b.publish_checked("edit-b", &read_b).unwrap(), 3);
    let observed = a.observe_read_set(&["a.ets".into()]).unwrap();
    stage(&mut a, "stale", &[ManifestEntry::accepted("a.ets", "a3")]);
    stage(&mut b, "undo-a", &[ManifestEntry::accepted("a.ets", "a1")]);
    b.publish("undo-a", 3).unwrap();
    stage(&mut b, "redo-a", &[ManifestEntry::accepted("a.ets", "a2")]);
    b.publish("redo-a", 4).unwrap();
    assert!(a.publish_checked("stale", &observed).is_err());
    assert_eq!(a.snapshot().unwrap().head, 5);
}

#[test]
fn absence_aba_and_unobserved_writes_cannot_bypass_the_read_set() {
    let temp = temp_dir::TestDir::new("manifest-absence-aba");
    let path = temp.path().join("manifest.sqlite3");
    let mut a = ManifestLog::create(&path, "workspace", "store", "domain").unwrap();
    let absent = a.observe_read_set(&["new.ets".into()]).unwrap();
    stage(
        &mut a,
        "pending",
        &[ManifestEntry::accepted("new.ets", "pending")],
    );
    let mut b = ManifestLog::open_existing(&path, "workspace", "store", "domain").unwrap();
    stage(
        &mut b,
        "created",
        &[ManifestEntry::accepted("new.ets", "one")],
    );
    b.publish("created", 0).unwrap();
    stage(&mut b, "removed", &[ManifestEntry::removed("new.ets")]);
    b.publish("removed", 1).unwrap();
    assert!(a.publish_checked("pending", &absent).is_err());
    let fresh = a.observe_read_set(&["new.ets".into()]).unwrap();
    assert_eq!(a.publish_checked("pending", &fresh).unwrap(), 3);
    assert_eq!(a.publish_checked("pending", &absent).unwrap(), 3);
    stage(
        &mut a,
        "foreign-write",
        &[ManifestEntry::accepted("other.ets", "x")],
    );
    assert!(a.publish_checked("foreign-write", &fresh).is_err());
    let other_path = temp.path().join("other.sqlite3");
    let mut other = ManifestLog::create(&other_path, "workspace", "other-store", "domain").unwrap();
    stage(
        &mut other,
        "pending",
        &[ManifestEntry::accepted("new.ets", "x")],
    );
    assert!(other.publish_checked("pending", &fresh).is_err());
    assert_eq!(other.snapshot().unwrap().head, 0);
}
