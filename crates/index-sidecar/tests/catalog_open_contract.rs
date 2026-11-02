use serde_json::json;
use std::fs;

#[expect(dead_code, reason = "shared fixture also exposes catalog timing gates")]
#[path = "support/sidecar_process.rs"]
mod sidecar_process;
use sidecar_process::{SidecarProcess, TestDir, initialize};

#[test]
fn missing_committed_legacy_database_is_an_initialize_error_not_an_empty_success() {
    let temp = TestDir::new("missing-committed-legacy");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir(&workspace).unwrap();
    let mut process = SidecarProcess::spawn();
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    assert_eq!(process.request(json!({"protocol":1,"id":2,"method":"refresh","params":{
        "generation":1,"changed":[{"uri":"file:///workspace/Stable.ets","text":"export class StableService {}"}],"removedUris":[]
    }}))["ok"], true);
    let search = process.request(json!({"protocol":1,"id":3,"method":"search","params":{
        "query":"StableService","limit":10
    }}));
    assert_eq!(search["result"]["servedGeneration"], 1);
    assert_eq!(search["result"]["items"].as_array().unwrap().len(), 1);
    process.shutdown(4);
    let location = arkts_index_sqlite::workspace_cache_location(&cache, &workspace).unwrap();
    fs::remove_file(&location.database_path).unwrap();
    let mut restarted = SidecarProcess::spawn();
    let response = initialize(&mut restarted, &workspace, &cache, 1);
    assert_eq!(response["ok"], false, "{response}");
    assert_eq!(response["error"]["code"], "incompatible");
    assert!(!location.database_path.exists());
    assert!(
        location
            .database_path
            .with_file_name("catalog-state.sqlite3")
            .is_file()
    );
    restarted.shutdown(2);
    // Recovery requires an explicit complete cache reset, not an implicit partial one.
    fs::remove_dir_all(&cache).unwrap();
    let mut reset = SidecarProcess::spawn();
    let response = initialize(&mut reset, &workspace, &cache, 1);
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["status"]["committedGeneration"], 0);
    reset.shutdown(2);
}
