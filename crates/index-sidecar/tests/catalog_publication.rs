use serde_json::json;
use std::{
    fs,
    time::{Duration, Instant},
};
#[expect(
    dead_code,
    reason = "shared protocol fixture exposes additional spawn modes"
)]
#[path = "support/sidecar_process.rs"]
mod sidecar_process;
use sidecar_process::{SidecarProcess, TestDir, initialize};

#[test]
fn private_activation_stays_responsive_and_cancellable_before_publication() {
    let temp = TestDir::new("catalog-nonblocking-activation");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir_all(&workspace).expect("workspace should exist");
    fs::write(
        workspace.join("Replacement.ets"),
        "class ReplacementService {}\n",
    )
    .expect("replacement source should be written");

    let mut process = SidecarProcess::spawn_with_activation_gate(Duration::from_millis(400));
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 2,
            "method": "refresh",
            "params": {
                "generation": 1,
                "changed": [{
                    "uri": "file:///workspace/Stable.ets",
                    "text": "class StableService {}\n"
                }],
                "removedUris": []
            }
        }))["ok"],
        true
    );
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 3,
            "method": "catalog/start",
            "params": {"reason": "activation-responsiveness", "force": true}
        }))["result"]["generation"],
        2
    );

    loop {
        let event = process.read_event();
        let phase = event["params"]["status"]["phase"]
            .as_str()
            .expect("phase should be a string");
        if phase == "activating" {
            break;
        }
        assert!(
            !matches!(phase, "ready" | "partial" | "degraded" | "cancelled"),
            "activation must be observable before terminal status"
        );
    }

    let status_started_at = Instant::now();
    let status = process.request(json!({
        "protocol": 1,
        "id": 4,
        "method": "status",
        "params": {}
    }));
    assert!(status_started_at.elapsed() < Duration::from_millis(200));
    assert_eq!(status["result"]["phase"], "activating");
    assert_eq!(status["result"]["committedGeneration"], 1);
    assert_eq!(status["result"]["buildingGeneration"], 2);

    let search_started_at = Instant::now();
    let old = process.request(json!({
        "protocol": 1,
        "id": 5,
        "method": "search",
        "params": {"query": "StableService", "limit": 20}
    }));
    assert!(search_started_at.elapsed() < Duration::from_millis(200));
    assert_eq!(old["result"]["servedGeneration"], 1);
    assert_eq!(old["result"]["items"][0]["name"], "StableService");

    let cancelled = process.request(json!({
        "protocol": 1,
        "id": 6,
        "method": "catalog/cancel",
        "params": {"generation": 2}
    }));
    assert_eq!(cancelled["result"]["cancelled"], true);
    assert_eq!(cancelled["result"]["status"]["phase"], "cancelling");

    loop {
        let event = process.read_event();
        if matches!(
            event["params"]["status"]["phase"].as_str(),
            Some("ready" | "partial" | "degraded" | "cancelled")
        ) {
            assert_eq!(event["params"]["status"]["phase"], "cancelled");
            break;
        }
    }
    let replacement = process.request(json!({
        "protocol": 1,
        "id": 7,
        "method": "search",
        "params": {"query": "ReplacementService", "limit": 20}
    }));
    assert_eq!(replacement["result"]["servedGeneration"], 1);
    assert!(
        replacement["result"]["items"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    process.shutdown(8);
}

#[test]
fn storage_progress_and_the_published_catalog_survive_a_sidecar_restart() {
    let temp = TestDir::new("catalog-storage-progress");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir(&workspace).unwrap();
    fs::write(workspace.join("Published.ets"), "export class Published {}").unwrap();
    let mut process = SidecarProcess::spawn();
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    assert_eq!(process.request(json!({"protocol":1,"id":2,"method":"catalog/start","params":{"reason":"storage-contract","force":true}}))["ok"], true);
    let mut stages = std::collections::BTreeSet::new();
    let mut sequence = 0;
    loop {
        let event = process.read_event();
        let status = &event["params"]["status"];
        if let Some(storage) = status.get("storage") {
            stages.insert(storage["stage"].as_str().unwrap().to_owned());
            let current = storage["activitySequence"].as_u64().unwrap();
            assert!(current >= sequence);
            sequence = current;
            assert!(storage["stageElapsedMs"].is_u64());
        }
        if status["phase"] == "ready" {
            break;
        }
        assert!(!matches!(
            status["phase"].as_str(),
            Some("degraded" | "cancelled")
        ));
    }
    for stage in [
        "writing",
        "committing",
        "checkpointing",
        "validating",
        "checking",
        "publishing",
    ] {
        assert!(stages.contains(stage), "missing stage {stage}");
    }
    process.shutdown(3);
    let mut restarted = SidecarProcess::spawn();
    assert_eq!(
        initialize(&mut restarted, &workspace, &cache, 1)["result"]["status"]["committedGeneration"],
        1
    );
    let search = restarted.request(
        json!({"protocol":1,"id":2,"method":"search","params":{"query":"Published","limit":10}}),
    );
    assert_eq!(search["result"]["items"][0]["name"], "Published");
    assert_eq!(search["result"]["servedGeneration"], 1);
    restarted.shutdown(3);
}
