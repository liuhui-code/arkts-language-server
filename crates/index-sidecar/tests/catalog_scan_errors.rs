use std::{ffi::OsStr, fs};
#[expect(dead_code, reason = "shared hash-first fixtures")]
#[path = "support/hash_first.rs"]
mod hash_first;
#[expect(dead_code, reason = "shared public protocol fixture")]
#[path = "support/sidecar_process.rs"]
mod sidecar_process;
use hash_first::{count, create, parsed, seed, start, stored, terminal};
use sidecar_process::{SidecarProcess, TestDir, initialize};

#[test]
fn each_scan_io_error_explicitly_withholds_qualified_reuse() {
    for kind in [
        "ignore",
        "directory",
        "entry",
        "file-type",
        "source-metadata",
        "source-read",
        "root-directory",
    ] {
        let temp = TestDir::new(kind);
        let workspace = temp.path().join("workspace");
        let cache = temp.path().join("cache");
        let trace = temp.path().join("trace.jsonl");
        create(&workspace, 8);
        let nested = workspace.join("nested");
        fs::create_dir(&nested).unwrap();
        fs::write(nested.join("Nested.ets"), "class Nested {}").unwrap();
        seed(&workspace, &cache);
        let before = stored(&cache);
        let target = match kind {
            "ignore" => workspace.join(".gitignore"),
            "directory" | "entry" => nested,
            "root-directory" => workspace.clone(),
            _ => workspace.join("0000.ets"),
        };
        let injected_kind = if kind == "root-directory" {
            "directory"
        } else {
            kind
        };
        let mut process = SidecarProcess::spawn_with_environment(&[
            ("ARKTS_INDEX_TEST_STREAM_TRACE", trace.as_os_str()),
            (
                "ARKTS_INDEX_TEST_SCAN_ERROR_KIND",
                OsStr::new(injected_kind),
            ),
            ("ARKTS_INDEX_TEST_SCAN_ERROR_PATH", target.as_os_str()),
        ]);
        assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
        start(&mut process, 2);
        let (status, stages) = terminal(&mut process);
        assert_eq!(status["phase"], "degraded", "kind={kind}: {status}");
        assert!(!stages.iter().any(|stage| stage == "reusing"));
        assert_eq!(count(&trace, "scan_error"), 1);
        if kind == "root-directory" {
            assert_eq!(status["committedGeneration"], 1);
            assert_eq!(stored(&cache), before);
            assert_eq!(parsed(&trace), 0);
        } else {
            assert_eq!(status["committedGeneration"], 2);
            assert_eq!(status["rejected"], 1);
            assert_eq!(parsed(&trace), if kind == "ignore" { 9 } else { 8 });
            let after = stored(&cache);
            assert_ne!(after.0, before.0);
            assert!(
                after.1.is_none(),
                "scan error {kind} cannot issue complete-scan identity"
            );
            assert_eq!(
                status["rejectedCount"],
                if matches!(kind, "source-metadata" | "source-read") {
                    1
                } else {
                    0
                }
            );
        }
        process.shutdown(3);
    }
}
