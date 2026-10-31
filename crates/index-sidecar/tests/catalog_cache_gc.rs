use arkts_index_sqlite::workspace_cache_location;
use serde_json::{Value, json};
use std::{fs, path::Path, process::Command};

#[expect(dead_code, reason = "shared process fixture also exposes timing gates")]
#[path = "support/sidecar_process.rs"]
mod sidecar_process;
use sidecar_process::{SidecarProcess, TestDir, initialize};

fn gc(cache: &Path) -> Value {
    let output = Command::new(env!("CARGO_BIN_EXE_arkts-index-sidecar"))
        .args(["--cache-gc", "--cache-dir"])
        .arg(cache)
        .args(["--apply", "--idle-ms", "0", "--max-bytes", "0"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn gc_protects_a_published_catalog_and_external_sqlite_readers_then_retires_the_whole_group() {
    let temp = TestDir::new("catalog-generation-gc");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir(&workspace).unwrap();
    fs::write(workspace.join("Catalog.ets"), "export class Catalog {}").unwrap();
    let mut process = SidecarProcess::spawn();
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    assert_eq!(process.request(json!({"protocol":1,"id":2,"method":"catalog/start","params":{"reason":"cache-gc","force":true}}))["ok"], true);
    loop {
        let event = process.read_event();
        let phase = event["params"]["status"]["phase"].as_str().unwrap();
        if phase == "ready" {
            break;
        }
        assert!(!matches!(phase, "cancelled" | "degraded"));
    }
    assert_eq!(gc(&cache)["entries"][0]["reason"], "active-workspace");
    let location = workspace_cache_location(&cache, &workspace).unwrap();
    let directory = location.database_path.parent().unwrap();
    let active: String = {
        let control = rusqlite::Connection::open(directory.join("catalog-state.sqlite3")).unwrap();
        control
            .query_row(
                "SELECT database_name FROM catalog_state WHERE id=1",
                [],
                |r| r.get(0),
            )
            .unwrap()
    };
    process.shutdown(3);
    // This connection deliberately bypasses namespace leases. GC runs in a
    // different process, so its VFS locks must independently protect this reader.
    let external = rusqlite::Connection::open(directory.join(&active)).unwrap();
    external
        .execute_batch("BEGIN; SELECT committed_generation FROM metadata;")
        .unwrap();
    let protected = gc(&cache);
    assert!(
        protected["entries"][0]["reason"]
            .as_str()
            .unwrap()
            .contains("sqlite-in-use"),
        "{protected}"
    );
    assert!(directory.join(&active).exists());
    drop(external);
    let removed = gc(&cache);
    assert_eq!(removed["entries"][0]["outcome"], "removed", "{removed}");
    assert!(!directory.exists());
    assert!(workspace.join("Catalog.ets").is_file());
}
