#[allow(dead_code)]
#[path = "support/sidecar_process.rs"]
mod sidecar_process;

use std::fs;

use serde_json::{Value, json};
use sidecar_process::{SidecarProcess, TestDir, initialize};

#[test]
fn resolves_committed_explicit_base_spelling_through_the_real_protocol() {
    let directory = TestDir::new("class-binding-protocol");
    let root = directory.path().join("workspace");
    fs::create_dir_all(&root).unwrap();
    let mut process = SidecarProcess::spawn();
    let initialized = initialize(&mut process, &root, &directory.path().join("cache"), 1);
    let identity = initialized["result"]["workspaceIdentity"].as_str().unwrap();
    let child = format!("{identity}/Child.ets");
    let base = format!("{identity}/Base.ets");
    let refreshed = process.request(json!({
        "protocol": 1, "id": 2, "method": "refresh",
        "params": { "generation": 7, "changed": [
            { "uri": child, "text": "import { Base } from './Base.ets'\nclass Child extends Base {}\n" },
            { "uri": base, "text": "export class Base {}\n" }
        ] }
    }));
    assert_eq!(refreshed["ok"], true);
    let response = process.request(request(
        3,
        json!({
            "workspaceIdentity": identity, "expectedGeneration": 7,
            "documentUris": [child, base], "overlays": [],
            "documentUri": child, "classNamePosition": { "line": 1, "character": 7 }
        }),
    ));
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(
        response["result"],
        json!({
            "workspaceIdentity": identity, "servedGeneration": 7, "completeness": "ready",
            "binding": { "kind": "resolved", "declarationUri": base, "name": "Base",
                "nameRange": { "start": { "line": 0, "character": 13 },
                    "end": { "line": 0, "character": 17 } },
                "supportUris": [base, child] }
        })
    );
    process.shutdown(4);
}

fn request(id: u64, params: Value) -> Value {
    json!({ "protocol": 1, "id": id, "method": "class-bindings/resolve", "params": params })
}

#[test]
fn a_reopened_unvalidated_session_cannot_resolve_from_its_old_committed_rows() {
    let (directory, mut process, params) = ready_fixture("class-binding-reopen");
    assert_eq!(
        process.request(request(3, params.clone()))["result"]["binding"]["kind"],
        "resolved"
    );
    process.shutdown(4);
    let mut reopened = SidecarProcess::spawn();
    let initialized = initialize(
        &mut reopened,
        &directory.path().join("workspace"),
        &directory.path().join("cache"),
        1,
    );
    assert_eq!(initialized["result"]["status"]["completeness"], "stale");
    let response = reopened.request(request(2, params));
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["servedGeneration"], 7);
    assert_eq!(response["result"]["binding"], json!({ "kind": "unknown" }));
    reopened.shutdown(3);
}

fn ready_fixture(name: &str) -> (TestDir, SidecarProcess, Value) {
    let directory = TestDir::new(name);
    let root = directory.path().join("workspace");
    fs::create_dir_all(&root).unwrap();
    let mut process = SidecarProcess::spawn();
    let initialized = initialize(&mut process, &root, &directory.path().join("cache"), 1);
    let identity = initialized["result"]["workspaceIdentity"].as_str().unwrap();
    let child = format!("{identity}/Child.ets");
    let base = format!("{identity}/Base.ets");
    assert_eq!(process.request(json!({
        "protocol": 1, "id": 2, "method": "refresh", "params": {
            "generation": 7, "changed": [
                { "uri": child, "text": "import { Base } from './Base.ets'\nclass Child extends Base {}\n" },
                { "uri": base, "text": "export class Base {}\n" }
            ] }
    }))["ok"], true);
    let params = json!({ "workspaceIdentity": identity, "expectedGeneration": 7,
        "documentUris": [child, base], "overlays": [], "documentUri": child,
        "classNamePosition": { "line": 1, "character": 7 } });
    (directory, process, params)
}

#[test]
fn a_foreign_workspace_identity_is_rejected_without_poisoning_the_session() {
    let (_directory, mut process, params) = ready_fixture("class-binding-identity");
    let mut foreign = params.clone();
    foreign["workspaceIdentity"] = json!("file:///another-workspace");
    let rejected = process.request(request(3, foreign));
    assert_eq!(
        rejected["error"]["code"], "workspace_mismatch",
        "{rejected}"
    );
    let valid = process.request(request(4, params));
    assert_eq!(valid["result"]["binding"]["kind"], "resolved");
    process.shutdown(5);
}

#[test]
fn invalid_bounded_inputs_are_errors_not_truncated_or_ignored() {
    let (_directory, mut process, params) = ready_fixture("class-binding-admission");
    let child = params["documentUri"].as_str().unwrap();
    let identity = params["workspaceIdentity"].as_str().unwrap();
    let mut invalid = Vec::new();
    for uris in [
        vec![child.to_owned(), child.to_owned()],
        vec![String::new()],
        (0..129).map(|i| format!("{identity}/{i}.ets")).collect(),
        vec![child.to_owned(), "x".repeat(4097)],
        (0..20)
            .map(|i| format!("{identity}/{i}{}", "x".repeat(3500)))
            .collect(),
    ] {
        let mut query = params.clone();
        query["documentUris"] = json!(uris);
        invalid.push(query);
    }
    let mut outside = params.clone();
    outside["documentUri"] = json!(format!("{identity}/Outside.ets"));
    invalid.push(outside);
    for overlays in [
        json!([{ "uri": format!("{identity}/Other.ets"), "text": "class Other {}" }]),
        json!([{ "uri": child, "text": "class Child {}" }, { "uri": child, "text": "" }]),
        json!([{ "uri": child, "text": "x".repeat(2 * 1024 * 1024 + 1) }]),
    ] {
        let mut query = params.clone();
        query["overlays"] = overlays;
        invalid.push(query);
    }
    let mut large_total = params.clone();
    let uris: Vec<_> = (0..5).map(|i| format!("{identity}/{i}.ets")).collect();
    large_total["documentUris"] = json!(uris);
    large_total["documentUri"] = json!(uris[0]);
    large_total["overlays"] = json!(
        uris.iter()
            .map(|uri| json!({ "uri": uri, "text": "x".repeat(2 * 1024 * 1024) }))
            .collect::<Vec<_>>()
    );
    invalid.push(large_total);
    for (i, query) in invalid.into_iter().enumerate() {
        let rejected = process.request(request(10 + i as u64, query));
        assert_eq!(
            rejected["error"]["code"], "invalid_params",
            "case {i}: {rejected}"
        );
    }
    assert_eq!(
        process.request(request(100, params))["result"]["binding"]["kind"],
        "resolved"
    );
    process.shutdown(101);
}

#[test]
fn an_unsaved_overlay_redirects_the_base_without_persisting_and_uses_utf16_ranges() {
    let (_directory, mut process, mut params) = ready_fixture("class-binding-overlay");
    let identity = params["workspaceIdentity"].as_str().unwrap().to_owned();
    let other = format!("{identity}/Other.ets");
    let refreshed = process.request(json!({ "protocol": 1, "id": 3, "method": "refresh",
        "params": { "generation": 8, "changed": [{ "uri": other,
            "text": "/* 😀 */ export class Other {}\n" }] } }));
    assert_eq!(refreshed["ok"], true);
    params["expectedGeneration"] = json!(8);
    params["documentUris"]
        .as_array_mut()
        .unwrap()
        .push(json!(other));
    let before = process.request(request(4, params.clone()));
    assert_eq!(before["result"]["binding"]["name"], "Base");
    params["overlays"] = json!([{ "uri": params["documentUri"],
        "text": "import { Other as Current } from './Other.ets'\nclass Child extends Current {}\n" }]);
    let current = process.request(request(5, params.clone()));
    assert_eq!(current["result"]["binding"]["declarationUri"], other);
    assert_eq!(
        current["result"]["binding"]["nameRange"],
        json!({
            "start": { "line": 0, "character": 22 }, "end": { "line": 0, "character": 27 }
        })
    );
    params["overlays"] = json!([]);
    assert_eq!(
        process.request(request(6, params))["result"],
        before["result"]
    );
    process.shutdown(7);
}

#[test]
fn an_invalid_traversed_overlay_shadows_persisted_success() {
    let (_directory, mut process, mut params) = ready_fixture("class-binding-invalid-overlay");
    params["overlays"] = json!([{ "uri": params["documentUri"], "text": "class Child extends" }]);
    let response = process.request(request(3, params.clone()));
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["binding"], json!({ "kind": "unknown" }));
    params["overlays"] = json!([]);
    assert_eq!(
        process.request(request(4, params))["result"]["binding"]["kind"],
        "resolved"
    );
    process.shutdown(5);
}

#[test]
fn expected_generation_mismatch_reports_actual_generation_but_no_binding() {
    let (_directory, mut process, mut params) = ready_fixture("class-binding-generation");
    for generation in [6, 8] {
        params["expectedGeneration"] = json!(generation);
        let response = process.request(request(generation + 3, params.clone()));
        assert_eq!(response["ok"], true);
        assert_eq!(response["result"]["servedGeneration"], 7);
        assert_eq!(response["result"]["binding"], json!({ "kind": "unknown" }));
    }
    process.shutdown(12);
}

#[test]
fn requested_missing_rows_can_use_current_source_but_cannot_certify_extensionless_imports() {
    let (_directory, mut process, mut params) = ready_fixture("class-binding-missing");
    let identity = params["workspaceIdentity"].as_str().unwrap();
    let missing = format!("{identity}/Current.ets");
    params["documentUris"]
        .as_array_mut()
        .unwrap()
        .push(json!(missing));
    params["documentUri"] = json!(missing);
    params["classNamePosition"] = json!({ "line": 0, "character": 7 });
    assert_eq!(
        process.request(request(3, params.clone()))["result"]["binding"]["kind"],
        "unknown"
    );
    params["overlays"] = json!([{ "uri": missing, "text": "class Current {}" }]);
    assert_eq!(
        process.request(request(4, params.clone()))["result"]["binding"]["kind"],
        "no-base"
    );
    params["classNamePosition"] = json!({ "line": 1, "character": 7 });
    params["overlays"] = json!([{ "uri": missing,
        "text": "import { Base } from './Base'\nclass Current extends Base {}" }]);
    assert_eq!(
        process.request(request(5, params))["result"]["binding"]["kind"],
        "unknown"
    );
    process.shutdown(6);
}

#[test]
fn an_uninitialized_session_cannot_answer_a_discovery_request() {
    let mut process = SidecarProcess::spawn();
    let response = process.request(request(1, json!({
        "workspaceIdentity": "file:///workspace", "expectedGeneration": 0,
        "documentUris": ["file:///workspace/Child.ets"], "overlays": [],
        "documentUri": "file:///workspace/Child.ets", "classNamePosition": { "line": 0, "character": 7 }
    })));
    assert_eq!(response["error"]["code"], "not_initialized");
    process.shutdown(2);
}

#[test]
fn an_overlay_reported_absent_by_source_availability_is_rejected() {
    let (_directory, mut process, mut params) = ready_fixture("class-binding-absent-overlay");
    params["overlays"] = json!([{ "uri": params["documentUri"], "text": "class Child {}" }]);
    params["sourceAvailability"] = json!([{ "uri": params["documentUri"], "state": "absent" }]);
    let response = process.request(request(3, params));
    assert_eq!(response["error"]["code"], "invalid_params", "{response}");
    process.shutdown(4);
}

#[test]
fn malformed_duplicate_or_foreign_source_availability_is_rejected() {
    let (_directory, mut process, params) = ready_fixture("class-binding-availability-invalid");
    let child = params["documentUri"].as_str().unwrap();
    let invalid = [
        json!(null),
        json!({}),
        json!("present"),
        json!([null]),
        json!([[]]),
        json!([[child, "present"]]),
        json!(["present"]),
        json!([{}]),
        json!([{ "uri": child }]),
        json!([{ "state": "present" }]),
        json!([{ "uri": null, "state": "present" }]),
        json!([{ "uri": 1, "state": "present" }]),
        json!([{ "uri": child, "state": null }]),
        json!([{ "uri": child, "state": 1 }]),
        json!([{ "uri": child, "state": { "present": null } }]),
        json!([{ "uri": child, "state": "Present" }]),
        json!([{ "uri": child, "state": "missing" }]),
        json!([{ "uri": "", "state": "present" }]),
        json!([{ "uri": "file:///another-workspace/Base.ets", "state": "present" }]),
        json!([{ "uri": format!("{child}.other"), "state": "unknown" }]),
        json!([{ "uri": child, "state": "present" }, { "uri": child, "state": "unknown" }]),
        json!(
            (0..129)
                .map(|_| json!({ "uri": child, "state": "unknown" }))
                .collect::<Vec<_>>()
        ),
    ];
    for (i, source_availability) in invalid.into_iter().enumerate() {
        let mut query = params.clone();
        query["sourceAvailability"] = source_availability;
        let response = process.request(request(10 + i as u64, query));
        assert_eq!(
            response["error"]["code"], "invalid_params",
            "case {i}: {response}"
        );
    }
    let valid = process.request(request(100, params));
    assert_eq!(valid["ok"], true, "{valid}");
    assert_eq!(valid["result"]["binding"]["kind"], "resolved");
    process.shutdown(101);
}

#[test]
fn supplied_partial_and_unknown_availability_cannot_admit_persisted_binding() {
    let (_directory, mut process, params) = ready_fixture("class-binding-availability-subset");
    assert_eq!(
        process.request(request(3, params.clone()))["result"]["binding"]["kind"],
        "resolved"
    );
    let child = params["documentUri"].as_str().unwrap();
    let base = params["documentUris"][1].as_str().unwrap();
    for (i, source_availability) in [
        json!([]),
        json!([{ "uri": child, "state": "present" }]),
        json!([{ "uri": child, "state": "absent" }]),
        json!([{ "uri": base, "state": "unknown" }]),
        json!([{ "uri": child, "state": "unknown" }, { "uri": base, "state": "absent" }]),
    ]
    .into_iter()
    .enumerate()
    {
        let mut query = params.clone();
        query["sourceAvailability"] = source_availability;
        let response = process.request(request(10 + i as u64, query));
        assert_eq!(response["ok"], true, "{response}");
        assert_eq!(
            response["result"]["binding"],
            json!({ "kind": "unknown" }),
            "case {i}"
        );
    }
    let mut overlay = params.clone();
    overlay["overlays"] = json!([{ "uri": child,
        "text": "import { Base } from './Base.ets'\nclass Child extends Base {}\n" }]);
    overlay["sourceAvailability"] = json!([{ "uri": child, "state": "unknown" }]);
    let response = process.request(request(20, overlay));
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["binding"], json!({ "kind": "unknown" }));

    let mut bounded = params.clone();
    let mut uris = vec![child.to_owned()];
    uris.extend((0..127).map(|i| format!("{child}.{i}.ets")));
    bounded["documentUris"] = json!(uris);
    bounded["sourceAvailability"] = json!(
        uris.iter()
            .map(|uri| json!({ "uri": uri, "state": "unknown" }))
            .collect::<Vec<_>>()
    );
    let response = process.request(request(21, bounded));
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["binding"], json!({ "kind": "unknown" }));
    process.shutdown(22);
}

#[test]
fn availability_without_current_child_text_cannot_certify_a_diskless_base() {
    let (directory, mut process, mut params) = ready_fixture("class-binding-availability-diskless");
    let child = params["documentUri"].as_str().unwrap().to_owned();
    let identity = params["workspaceIdentity"].as_str().unwrap();
    let base = format!("{identity}/Base.ets");
    assert!(!directory.path().join("workspace/Base.ets").exists());
    let refreshed = process.request(json!({ "protocol": 1, "id": 3, "method": "refresh",
        "params": { "generation": 8, "removedUris": [base], "changed": [{ "uri": child,
            "text": "import { Base } from './Base'\nclass Child extends Base {}\n" }] } }));
    assert_eq!(refreshed["ok"], true, "{refreshed}");
    let candidates: Vec<_> = [
        ".ets",
        ".ts",
        ".d.ets",
        ".d.ts",
        "/index.ets",
        "/index.ts",
        "/index.d.ets",
        "/index.d.ts",
    ]
    .iter()
    .map(|suffix| format!("{identity}/Base{suffix}"))
    .collect();
    let mut uris = vec![child.clone()];
    uris.extend(candidates.iter().cloned());
    params["documentUris"] = json!(uris);
    params["expectedGeneration"] = json!(8);
    params["overlays"] = json!([{ "uri": base, "text": "export class Base {}\n" }]);
    let mut complete = vec![json!({ "uri": child, "state": "present" })];
    complete.extend(candidates.iter().map(|uri| {
        json!({
            "uri": uri, "state": if uri == &base { "present" } else { "absent" }
        })
    }));
    let mut unknown_overlay = complete.clone();
    unknown_overlay[1]["state"] = json!("unknown");
    for (i, availability) in [
        None,
        Some(json!([])),
        Some(json!([{ "uri": base, "state": "present" }])),
        Some(json!(complete)),
        Some(json!(unknown_overlay)),
    ]
    .into_iter()
    .enumerate()
    {
        let mut query = params.clone();
        if let Some(availability) = availability {
            query["sourceAvailability"] = availability;
        }
        let response = process.request(request(10 + i as u64, query));
        assert_eq!(response["ok"], true, "case {i}: {response}");
        assert_eq!(response["result"]["servedGeneration"], 8);
        assert_eq!(response["result"]["completeness"], "ready");
        assert_eq!(response["result"]["binding"], json!({ "kind": "unknown" }));
    }
    let mut explicit = params.clone();
    explicit["sourceAvailability"] = json!(complete);
    explicit["overlays"]
        .as_array_mut()
        .unwrap()
        .push(json!({ "uri": child,
        "text": "import { Base } from './Base.ets'\nclass Child extends Base {}\n" }));
    let response = process.request(request(20, explicit));
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["binding"]["kind"], "resolved");
    assert_eq!(response["result"]["binding"]["declarationUri"], base);
    assert_eq!(
        process.request(request(21, params))["result"]["binding"]["kind"],
        "unknown"
    );
    assert!(!directory.path().join("workspace/Base.ets").exists());
    process.shutdown(22);
}
