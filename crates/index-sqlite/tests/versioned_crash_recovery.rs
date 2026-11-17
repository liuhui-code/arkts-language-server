use arkts_index_core::{Document, parse_document_symbols};
use arkts_index_sqlite::VersionedFacts;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::Path,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};
#[path = "support/temp_dir.rs"]
mod temp_dir;
const CHILD_PATH: &str = "ARKTS_TEST_VERSIONED_OWNER_CRASH_PATH";
const TEST: &str =
    "killed_owner_recovery_reclaims_drafts_and_partial_facts_without_touching_current_data";
struct KillOnDrop(Child);
impl Drop for KillOnDrop {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn write(facts: &mut VersionedFacts, id: &str, uri: &str, text: &str) {
    let doc = parse_document_symbols(&Document::new(uri, text)).unwrap();
    facts
        .write_version(id, &format!("{:x}", Sha256::digest(text.as_bytes())), &doc)
        .unwrap();
}
fn crash_child(path: &Path) {
    let mut facts = VersionedFacts::open_existing(path, "workspace", "store", "domain").unwrap();
    write(
        &mut facts,
        "draft",
        "file:///draft.ets",
        "export class Draft {}",
    );
    facts
        .stage_group(
            "unfinished",
            &[("file:///draft.ets".into(), "draft".into())],
        )
        .unwrap();
    // Small-file failure now rolls back its complete transaction. Force the
    // streaming route so this fixture still leaves a real committed prefix.
    let text = format!(
        "export class HalfWritten {{}}\n{}",
        "HalfWritten;\n".repeat(3000)
    );
    let mut doc = parse_document_symbols(&Document::new("file:///partial.ets", &text)).unwrap();
    let sha = format!("{:x}", Sha256::digest(text.as_bytes()));
    assert!(
        !arkts_index_sqlite::FileWriteSize::for_input(
            &arkts_index_sqlite::FileVersionWrite {
                id: "partial",
                sha: &sha,
                document: &doc
            },
            "domain"
        )
        .fits()
    );
    doc.exports.push(doc.exports[0].clone());
    assert!(facts.write_version("partial", &sha, &doc).is_err());
    let work = facts.last_file_write_work().unwrap();
    assert!(
        work.commit_callbacks >= 2 && work.rollback_callbacks >= 1,
        "fixture must include committed prefix and failed later family: {work:?}"
    );
    fs::write(
        path.with_extension("ready"),
        b"sealed draft and partial write present",
    )
    .unwrap();
    loop {
        std::thread::park_timeout(Duration::from_secs(10));
    }
}
#[test]
fn killed_owner_recovery_reclaims_drafts_and_partial_facts_without_touching_current_data() {
    if let Some(path) = std::env::var_os(CHILD_PATH) {
        crash_child(Path::new(&path));
        return;
    }
    let temp = temp_dir::TestDir::new("owner-crash-recovery");
    let path = temp.path().join("facts.sqlite3");
    let mut facts = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    write(
        &mut facts,
        "current",
        "file:///current.ets",
        "export class Current {}",
    );
    facts
        .stage_group(
            "committed",
            &[("file:///current.ets".into(), "current".into())],
        )
        .unwrap();
    facts.publish_group("committed", 0).unwrap();
    let mut child = KillOnDrop(
        Command::new(std::env::current_exe().unwrap())
            .args(["--exact", TEST, "--nocapture"])
            .env(CHILD_PATH, &path)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    );
    let started = Instant::now();
    while !path.with_extension("ready").exists() {
        assert!(
            child.0.try_wait().unwrap().is_none(),
            "child exited before fixture ready"
        );
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "child fixture did not become ready"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(facts.read_version("draft").unwrap().is_some());
    let live = facts.collect_garbage(4096).unwrap();
    assert_eq!(live.owners_recovered, 0);
    assert!(facts.read_version("draft").unwrap().is_some());
    child.0.kill().unwrap();
    let exit = child.0.wait().unwrap();
    assert!(!exit.success());
    let mut recovered = 0;
    let mut versions = 0;
    for _ in 0..16 {
        let report = facts.collect_garbage(4096).unwrap();
        recovered += report.owners_recovered;
        versions += report.versions_deleted;
    }
    assert_eq!(recovered, 1);
    assert_eq!(versions, 2);
    assert_eq!(facts.read_version("draft").unwrap(), None);
    assert_eq!(facts.read_version("partial").unwrap(), None);
    assert_eq!(facts.search("Current", 10).unwrap().items.len(), 1);
    assert!(facts.search("Draft", 10).unwrap().items.is_empty());
    assert_eq!(facts.publish_group("committed", 0).unwrap(), 1);
    println!(
        "ownerCrash: child={exit}; recovered={recovered}; versionsCollected={versions}; head=1"
    );
}
