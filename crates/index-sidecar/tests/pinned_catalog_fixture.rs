use serde_json::json;
use std::{
    path::PathBuf,
    process::Command,
    time::{Duration, Instant},
};
#[expect(dead_code, reason = "shared public protocol fixture")]
#[path = "support/sidecar_process.rs"]
mod sidecar_process;
use sidecar_process::{SidecarProcess, TestDir, initialize};

#[test]
#[ignore = "release gate: set ARKTS_INDEX_REAL_FIXTURE to the pinned 455-file checkout"]
fn pinned_large_arkts_fixture_meets_cold_catalog_and_deterministic_query_gates() {
    let workspace = PathBuf::from(
        std::env::var_os("ARKTS_INDEX_REAL_FIXTURE")
            .expect("ARKTS_INDEX_REAL_FIXTURE must name the pinned 455-file checkout"),
    );
    assert!(
        workspace.is_dir(),
        "large ArkTS fixture must be a directory"
    );
    let revision = Command::new("git")
        .args([
            "-C",
            workspace.to_str().expect("fixture path must be UTF-8"),
            "rev-parse",
            "HEAD",
        ])
        .output()
        .expect("git must inspect the pinned fixture");
    assert!(revision.status.success(), "fixture must be a Git checkout");
    assert_eq!(
        String::from_utf8(revision.stdout)
            .expect("fixture revision must be UTF-8")
            .trim(),
        "585feb45114a128a0d2a23947c83faf338e758f7",
        "large ArkTS fixture revision drifted"
    );

    let temp = TestDir::new("real-catalog");
    let cache = temp.path().join("cache");
    let mut process = SidecarProcess::spawn();
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);

    let cold_started_at = Instant::now();
    assert_eq!(
        process.request(json!({
            "protocol": 1,
            "id": 2,
            "method": "catalog/start",
            "params": {"reason": "real-fixture-gate", "force": true}
        }))["result"]["accepted"],
        true
    );
    let terminal = loop {
        let event = process.read_event();
        if matches!(
            event["params"]["status"]["phase"].as_str(),
            Some("ready" | "partial" | "degraded" | "cancelled")
        ) {
            break event;
        }
    };
    let cold_elapsed = cold_started_at.elapsed();
    enforce_cold_catalog_gate(
        cold_elapsed,
        std::env::var("ARKTS_TEST_455_COLD_CATALOG_POLICY")
            .ok()
            .as_deref(),
    );
    let status = &terminal["params"]["status"];
    assert_eq!(status["phase"], "ready", "unexpected terminal: {status:#?}");
    assert_eq!(status["state"], "ready");
    assert_eq!(status["completeness"], "ready");
    assert_eq!(status["discovered"], 455);
    assert_eq!(status["indexed"], 455);
    assert_eq!(status["rejected"], 0);
    assert_eq!(status["totalFiles"], 455);
    assert_eq!(status["committedGeneration"], 1);

    for (id, query, expected) in [
        (3, "ChatBaseViewModel", "ChatBaseViewModel"),
        (4, "CBVM", "ChatBaseViewModel"),
        (5, "ChatP2PPage", "ChatP2PPage"),
        (6, "BuildProfile", "BuildProfile"),
    ] {
        let result = process.request(json!({
            "protocol": 1,
            "id": id,
            "method": "search",
            "params": {"query": query, "limit": 20}
        }));
        assert_eq!(result["ok"], true, "query {query} should succeed");
        assert_eq!(result["result"]["servedGeneration"], 1);
        assert_eq!(
            result["result"]["items"][0]["name"], expected,
            "query {query} must return the pinned deterministic first match"
        );
    }

    for (id, query, expected_count, expected_locations) in [
        (
            7,
            "TeamRepo",
            1,
            vec![("chatkit/src/main/ets/repo/TeamRepo.ets", 96)],
        ),
        (
            8,
            "sendMessage",
            4,
            vec![
                ("chatkit/src/main/ets/repo/ChatRepo.ets", 261),
                ("chatkit_ui/src/main/ets/view/MultiLineInputView.ets", 463),
                (
                    "chatkit_ui/src/main/ets/viewmodel/ChatBaseViewModel.ets",
                    1044,
                ),
                (
                    "chatkit_ui/src/main/ets/viewmodel/ChatBotSubSessionViewModel.ets",
                    284,
                ),
            ],
        ),
        (
            9,
            "BuildProfile",
            7,
            vec![
                ("chatkit/BuildProfile.ets", 11),
                ("chatkit_ui/BuildProfile.ets", 11),
                ("common/BuildProfile.ets", 11),
                ("contactkit_ui/BuildProfile.ets", 11),
                ("conversationkit_ui/BuildProfile.ets", 11),
                ("corekit/BuildProfile.ets", 11),
                ("teamkit_ui/BuildProfile.ets", 11),
            ],
        ),
    ] {
        let result = process.request(json!({
            "protocol": 1,
            "id": id,
            "method": "search",
            // Workspace-symbol search is intentionally fuzzy. Limiting the
            // response to the number of exact definitions proves exact-name
            // matches rank ahead of prefix and substring matches.
            "params": {"query": query, "limit": expected_count}
        }));
        let items = result["result"]["items"]
            .as_array()
            .expect("search items must be an array");
        assert_eq!(
            items.len(),
            expected_count,
            "unexpected {query} matches: {items:#?}"
        );
        let mut actual = items
            .iter()
            .map(|item| {
                let uri = item["uri"].as_str().expect("symbol URI must be a string");
                let relative = uri
                    .split("/nim-uikit-harmony/")
                    .nth(1)
                    .expect("symbol URI must be inside the pinned fixture");
                (
                    relative.to_owned(),
                    item["range"]["start"]["line"]
                        .as_u64()
                        .expect("symbol line must be an integer"),
                )
            })
            .collect::<Vec<_>>();
        actual.sort();
        let mut expected = expected_locations
            .into_iter()
            .map(|(uri, line)| (uri.to_owned(), line))
            .collect::<Vec<_>>();
        expected.sort();
        assert_eq!(
            actual, expected,
            "{query} must jump to every exact definition"
        );
    }
    process.shutdown(10);
}

fn enforce_cold_catalog_gate(cold_elapsed: Duration, policy: Option<&str>) {
    match policy {
        None => assert!(
            cold_elapsed <= Duration::from_secs(3),
            "455-file cold catalog must finish within 3s; took {cold_elapsed:?}"
        ),
        Some("waive-3s-user-authorized") => eprintln!(
            "{}",
            json!({
                "event": "test.performance.waiver", "gate": "455-file-cold-catalog-3s",
                "measuredMs": cold_elapsed.as_secs_f64() * 1000.0, "targetMs": 3000,
                "withinTarget": cold_elapsed <= Duration::from_secs(3), "authority": "user"
            })
        ),
        Some(_) => panic!("unsupported cold catalog timing policy"),
    }
}

#[test]
fn direct_fixture_calls_still_enforce_the_original_cold_target() {
    enforce_cold_catalog_gate(Duration::from_secs(2), None);
    assert!(
        std::panic::catch_unwind(|| enforce_cold_catalog_gate(Duration::from_secs(4), None))
            .is_err()
    );
}

#[test]
fn explicit_user_policy_waives_the_timing_target() {
    enforce_cold_catalog_gate(Duration::from_secs(4), Some("waive-3s-user-authorized"));
}

#[test]
fn unknown_policy_cannot_silently_waive_the_target() {
    assert!(
        std::panic::catch_unwind(|| enforce_cold_catalog_gate(
            Duration::from_secs(1),
            Some("true")
        ))
        .is_err()
    );
}
