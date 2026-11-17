use serde_json::json;
use std::fs;

#[expect(dead_code, reason = "shared fixture also exposes catalog timing gates")]
#[path = "support/sidecar_process.rs"]
mod sidecar_process;
use sidecar_process::{SidecarProcess, TestDir, initialize};

#[test]
fn legacy_managed_namespace_proof_tracks_the_open_object() {
    assert_opened_namespace(false);
}

#[test]
fn versioned_namespace_proof_allows_cache_root_equal_to_source_root() {
    assert_opened_namespace(true);
}

fn assert_opened_namespace(versioned: bool) {
    let temp = TestDir::new("managed-namespace-proof");
    let workspace = temp.path().join("workspace");
    fs::create_dir(&workspace).unwrap();
    let cache = if versioned {
        workspace.clone()
    } else {
        workspace.join("Cache")
    };
    let mut process = SidecarProcess::spawn();
    let unopened =
        process.request(json!({"protocol":1,"id":90,"method":"cache/namespace","params":{}}));
    assert_eq!(unopened["error"]["code"], "uninitialized");
    let initialized = if versioned {
        process.request(json!({"protocol":1,"id":1,"method":"initialize","params":{
            "workspaceRoot":workspace,"cacheDirectory":cache,"capabilities":["versioned-file-maintenance-v1"]
        }}))
    } else {
        initialize(&mut process, &workspace, &cache, 1)
    };
    assert_eq!(initialized["ok"], true, "{initialized}");
    let proof = initialized["result"]["managedCache"].clone();
    let location = arkts_index_sqlite::workspace_cache_location(&cache, &workspace).unwrap();
    let directory = location.database_path.parent().unwrap();
    assert_eq!(proof["directory"], directory.to_str().unwrap());
    assert_eq!(proof["workspaceIdentity"], location.workspace_identity);
    assert!(!proof["objectId"].as_str().unwrap().is_empty());
    let current =
        process.request(json!({"protocol":1,"id":2,"method":"cache/namespace","params":{}}));
    assert_eq!(current["ok"], true, "{current}");
    assert_eq!(current["result"], proof);
    fs::write(
        directory.join("ordinary-state.tmp"),
        "changed internal content",
    )
    .unwrap();
    let unchanged =
        process.request(json!({"protocol":1,"id":3,"method":"cache/namespace","params":{}}));
    assert_eq!(
        unchanged["result"], proof,
        "cache content changes do not change its directory object"
    );

    // Windows directory rename while SQLite is open depends on sharing flags;
    // the portable proof above runs there, this replacement control is Unix-only.
    #[cfg(unix)]
    {
        let retired = directory.with_extension("retired");
        fs::rename(directory, &retired).unwrap();
        fs::create_dir(directory).unwrap();
        fs::copy(
            retired.join("cache-use.json"),
            directory.join("cache-use.json"),
        )
        .unwrap();
        let before = fs::read(directory.join("cache-use.json")).unwrap();
        let replaced =
            process.request(json!({"protocol":1,"id":4,"method":"cache/namespace","params":{}}));
        assert_eq!(replaced["ok"], false, "{replaced}");
        assert_eq!(replaced["error"]["code"], "cache_namespace_changed");
        process.shutdown(5);
        assert_eq!(
            fs::read(directory.join("cache-use.json")).unwrap(),
            before,
            "closing an old owner must not stamp a replacement directory"
        );
    }
    #[cfg(not(unix))]
    process.shutdown(5);
}
