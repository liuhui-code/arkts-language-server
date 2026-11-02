use std::fs;
#[expect(dead_code, reason = "shared hash-first fixtures")]
#[path = "support/hash_first.rs"]
mod hash_first;
#[expect(dead_code, reason = "shared public protocol fixture")]
#[path = "support/sidecar_process.rs"]
mod sidecar_process;
use hash_first::{count, create, parsed, seed, start, stored, terminal};
use sidecar_process::{SidecarProcess, TestDir, initialize};

#[test]
fn deliberate_exclusions_and_policy_skips_do_not_disable_hot_reuse() {
    let temp = TestDir::new("hash-normal-exclusions");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    let trace = temp.path().join("trace.jsonl");
    create(&workspace, 8);
    seed(&workspace, &cache);
    let before = stored(&cache);
    fs::write(workspace.join(".gitignore"), "Ignored.ets\n").unwrap();
    fs::write(workspace.join("Ignored.ets"), "class Excluded {}").unwrap();
    fs::write(workspace.join("Readme.txt"), "class Unsupported {}").unwrap();
    fs::create_dir(workspace.join("node_modules")).unwrap();
    fs::write(
        workspace.join("node_modules/Excluded.ets"),
        "class Dependency {}",
    )
    .unwrap();
    fs::write(workspace.join("Large.ets"), "x".repeat(2 * 1024 * 1024 + 1)).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(workspace.join("0000.ets"), workspace.join("Linked.ets")).unwrap();
    let mut process = SidecarProcess::spawn_with_environment(&[(
        "ARKTS_INDEX_TEST_STREAM_TRACE",
        trace.as_os_str(),
    )]);
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    start(&mut process, 2);
    let (status, stages) = terminal(&mut process);
    assert_eq!(status["phase"], "partial");
    assert_eq!(status["indexed"], 8);
    assert_eq!(status["rejected"], 0);
    assert_eq!(status["policySkipped"], 1);
    assert!(status["ignored"].as_u64().unwrap() >= 2);
    assert!(stages.iter().any(|stage| stage == "reusing"));
    assert_eq!(parsed(&trace), 0);
    assert_eq!(count(&trace, "hash_read"), 8);
    assert_eq!(stored(&cache), before);
    process.shutdown(3);
}

#[test]
fn invalid_ignore_rules_or_utf8_disable_reuse_and_do_not_persist_qualification() {
    for issue in ["ignore", "utf8"] {
        let temp = TestDir::new(issue);
        let workspace = temp.path().join("workspace");
        let cache = temp.path().join("cache");
        let trace = temp.path().join("trace.jsonl");
        create(&workspace, 8);
        seed(&workspace, &cache);
        let before = stored(&cache);
        if issue == "ignore" {
            fs::write(workspace.join(".gitignore"), "bad\\\n").unwrap();
        } else {
            fs::write(workspace.join("0000.ets"), [0xff, 0xfe, 0xff]).unwrap();
        }
        let mut process = SidecarProcess::spawn_with_environment(&[(
            "ARKTS_INDEX_TEST_STREAM_TRACE",
            trace.as_os_str(),
        )]);
        assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
        start(&mut process, 2);
        let (status, stages) = terminal(&mut process);
        assert_eq!(status["phase"], "degraded", "{status}");
        assert_eq!(status["committedGeneration"], 2);
        assert_eq!(status["rejected"], 1);
        assert!(!stages.iter().any(|stage| stage == "reusing"));
        assert_eq!(parsed(&trace), if issue == "ignore" { 8 } else { 7 });
        let after = stored(&cache);
        assert_ne!(after.0, before.0);
        assert!(
            after.1.is_none(),
            "an incomplete scan must never acquire a hot-reuse key"
        );
        if issue == "ignore" {
            fs::remove_file(workspace.join(".gitignore")).unwrap();
        } else {
            fs::write(workspace.join("0000.ets"), "export class HashFirst0 {}").unwrap();
        }
        fs::write(&trace, "").unwrap();
        start(&mut process, 3);
        assert_eq!(terminal(&mut process).0["phase"], "ready");
        assert_eq!(parsed(&trace), 8);
        assert_eq!(
            count(&trace, "hash_read"),
            0,
            "unqualified prior result uses cold single-pass route"
        );
        assert!(
            stored(&cache)
                .1
                .unwrap()
                .starts_with("arkts-complete-scan-v2:")
        );
        process.shutdown(4);
    }
}

#[test]
fn added_deleted_or_renamed_admitted_uris_miss_once_then_reuse() {
    for change in ["add", "delete", "rename"] {
        let temp = TestDir::new(change);
        let workspace = temp.path().join("workspace");
        let cache = temp.path().join("cache");
        let trace = temp.path().join("trace.jsonl");
        create(&workspace, 8);
        seed(&workspace, &cache);
        let before = stored(&cache);
        let expected = match change {
            "add" => {
                fs::write(workspace.join("0008.ets"), "export class Added {}").unwrap();
                9
            }
            "delete" => {
                fs::remove_file(workspace.join("0000.ets")).unwrap();
                7
            }
            "rename" => {
                fs::rename(workspace.join("0000.ets"), workspace.join("Renamed.ets")).unwrap();
                8
            }
            _ => unreachable!(),
        };
        let mut process = SidecarProcess::spawn_with_environment(&[(
            "ARKTS_INDEX_TEST_STREAM_TRACE",
            trace.as_os_str(),
        )]);
        assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
        start(&mut process, 2);
        let (status, stages) = terminal(&mut process);
        assert_eq!(status["phase"], "ready");
        assert_eq!(status["indexed"], expected);
        assert_eq!(parsed(&trace), expected as usize);
        assert_eq!(count(&trace, "hash_read"), expected as usize);
        assert_eq!(count(&trace, "parse_read"), expected as usize);
        assert!(!stages.iter().any(|stage| stage == "reusing"));
        let after = stored(&cache);
        assert_ne!(after.0, before.0);
        assert_ne!(after.1, before.1, "URI membership participates in the key");
        fs::write(&trace, "").unwrap();
        start(&mut process, 3);
        let (status, stages) = terminal(&mut process);
        assert_eq!(status["phase"], "ready");
        assert_eq!(status["indexed"], expected);
        assert_eq!(parsed(&trace), 0);
        assert_eq!(count(&trace, "parse_read"), 0);
        assert!(stages.iter().any(|stage| stage == "reusing"));
        assert_eq!(stored(&cache), after);
        process.shutdown(4);
    }
}
