#[allow(dead_code)]
#[path = "support/sidecar_process.rs"]
mod sidecar_process;

use std::fs;

use serde_json::{Value, json};
use sidecar_process::{SidecarProcess, TestDir, initialize};

const CHILD: &str = "import { Base } from './Base.ets'\nclass Child extends Base {}\n";
const BASE: &str = "export class Base {}\n";

fn fixture(name: &str) -> (TestDir, SidecarProcess, Value) {
    let directory = TestDir::new(name);
    let root = directory.path().join("workspace");
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("Child.ets"), CHILD).unwrap();
    fs::write(root.join("Base.ets"), BASE).unwrap();
    let mut process = SidecarProcess::spawn();
    let initialized = initialize(&mut process, &root, &directory.path().join("cache"), 1);
    let identity = initialized["result"]["workspaceIdentity"].as_str().unwrap();
    let child = format!("{identity}/Child.ets");
    let base = format!("{identity}/Base.ets");
    assert_eq!(
        process.request(json!({ "protocol": 1, "id": 2, "method": "refresh",
        "params": { "generation": 7, "changed": [
            { "uri": child, "text": CHILD }, { "uri": base, "text": BASE }
        ] } }))["ok"],
        true
    );
    let query = json!({ "workspaceIdentity": identity, "expectedGeneration": 7,
        "documentUris": [child, base], "overlays": [], "documentUri": child,
        "classNamePosition": { "line": 1, "character": 7 } });
    (directory, process, query)
}

fn request(process: &mut SidecarProcess, id: u64, params: Value) -> Value {
    process.request(json!({ "protocol": 1, "id": id,
        "method": "class-bindings/resolve", "params": params }))
}

fn mark_present(query: &mut Value) {
    query["sourceAvailability"] = json!(
        query["documentUris"]
            .as_array()
            .unwrap()
            .iter()
            .map(|uri| json!({ "uri": uri, "state": "present" }))
            .collect::<Vec<_>>()
    );
}

#[test]
fn captured_absence_cannot_resolve_a_deleted_source_from_committed_rows() {
    let (directory, mut process, mut query) = fixture("availability-deleted");
    assert_eq!(
        request(&mut process, 3, query.clone())["result"]["binding"]["kind"],
        "resolved"
    );
    fs::remove_file(directory.path().join("workspace/Base.ets")).unwrap();
    query["sourceAvailability"] = json!([
        { "uri": query["documentUri"], "state": "present" },
        { "uri": query["documentUris"][1], "state": "absent" }
    ]);
    let response = request(&mut process, 4, query);
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["servedGeneration"], 7);
    assert_eq!(
        response["result"]["binding"],
        json!({ "kind": "unknown" }),
        "{response}"
    );
    process.shutdown(5);
}

#[test]
fn current_disk_source_replaces_stale_metadata_at_the_same_generation() {
    let (directory, mut process, mut query) = fixture("availability-current-text");
    fs::write(
        directory.path().join("workspace/Base.ets"),
        "/* 😀 */ export class Base {}\n",
    )
    .unwrap();
    query["sourceAvailability"] = json!(
        query["documentUris"]
            .as_array()
            .unwrap()
            .iter()
            .map(|uri| json!({ "uri": uri, "state": "present" }))
            .collect::<Vec<_>>()
    );
    let response = request(&mut process, 3, query.clone());
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["servedGeneration"], 7);
    assert_eq!(
        response["result"]["binding"]["kind"], "resolved",
        "{response}"
    );
    assert_eq!(
        response["result"]["binding"]["nameRange"],
        json!({
            "start": { "line": 0, "character": 22 }, "end": { "line": 0, "character": 26 }
        })
    );
    query.as_object_mut().unwrap().remove("sourceAvailability");
    let persisted = request(&mut process, 4, query);
    assert_eq!(
        persisted["result"]["binding"]["nameRange"]["start"]["character"],
        13
    );
    process.shutdown(5);
}

#[test]
fn complete_caller_evidence_resolves_an_extensionless_diskless_overlay() {
    let (directory, mut process, mut query) = fixture("availability-extensionless");
    let identity = query["workspaceIdentity"].as_str().unwrap();
    let child = query["documentUri"].as_str().unwrap().to_owned();
    let base = format!("{identity}/Base.ets");
    let candidates = [
        ".ets",
        ".ts",
        ".d.ets",
        ".d.ts",
        "/index.ets",
        "/index.ts",
        "/index.d.ets",
        "/index.d.ts",
    ]
    .map(|suffix| format!("{identity}/Base{suffix}"));
    let mut uris = vec![child.clone()];
    uris.extend(candidates);
    fs::remove_file(directory.path().join("workspace/Base.ets")).unwrap();
    assert!(!directory.path().join("workspace/Base").exists());
    query["documentUris"] = json!(uris);
    query["overlays"] = json!([
        { "uri": child, "text": "import { Base } from './Base'\nclass Child extends Base {}\n" },
        { "uri": base, "text": BASE }
    ]);
    query["sourceAvailability"] = json!(
        uris.iter()
            .map(|uri| json!({ "uri": uri,
                "state": if uri == &child || uri == &base { "present" } else { "absent" }
            }))
            .collect::<Vec<_>>()
    );
    let response = request(&mut process, 3, query.clone());
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(
        response["result"]["binding"]["kind"], "resolved",
        "{response}"
    );
    assert_eq!(response["result"]["binding"]["declarationUri"], base);
    assert_eq!(
        response["result"]["binding"]["supportUris"],
        json!([base, child])
    );
    query["sourceAvailability"][8]["state"] = json!("unknown");
    assert_eq!(
        request(&mut process, 4, query)["result"]["binding"]["kind"],
        "unknown"
    );
    process.shutdown(5);
}

#[test]
fn an_unwatched_anchor_edit_is_read_without_reviving_old_heritage() {
    let (directory, mut process, mut query) = fixture("availability-anchor-edit");
    fs::write(
        directory.path().join("workspace/Child.ets"),
        "\nclass Child {}\n",
    )
    .unwrap();
    mark_present(&mut query);
    let response = request(&mut process, 3, query);
    assert_eq!(
        response["result"]["binding"],
        json!({ "kind": "no-base" }),
        "{response}"
    );
    process.shutdown(4);
}

#[test]
fn empty_partial_unknown_and_missing_current_evidence_never_reuse_old_facts() {
    let (_directory, mut process, query) = fixture("availability-incomplete");
    let child = query["documentUri"].clone();
    let base = query["documentUris"][1].clone();
    for (i, availability) in [
        json!([]),
        json!([{ "uri": child, "state": "present" }]),
        json!([{ "uri": base, "state": "present" }]),
        json!([{ "uri": child, "state": "present" }, { "uri": base, "state": "unknown" }]),
        json!([{ "uri": child, "state": "unknown" }, { "uri": base, "state": "present" }]),
    ]
    .into_iter()
    .enumerate()
    {
        let mut current = query.clone();
        current["sourceAvailability"] = availability;
        current["overlays"] = json!([{ "uri": child, "text": CHILD }]);
        let response = request(&mut process, 10 + i as u64, current);
        assert_eq!(response["ok"], true, "{response}");
        assert_eq!(
            response["result"]["binding"],
            json!({ "kind": "unknown" }),
            "case {i}"
        );
    }
    assert_eq!(
        request(&mut process, 20, query)["result"]["binding"]["kind"],
        "resolved"
    );
    process.shutdown(21);
}

#[test]
fn unsupported_invalid_utf8_or_oversized_current_source_cannot_revive_disk_metadata() {
    let (directory, mut process, mut query) = fixture("availability-source-rejection");
    mark_present(&mut query);
    let base = directory.path().join("workspace/Base.ets");
    for (i, bytes) in [
        b"export class Base extends".to_vec(),
        vec![0xff],
        vec![b'x'; 2 * 1024 * 1024 + 1],
    ]
    .into_iter()
    .enumerate()
    {
        fs::write(&base, bytes).unwrap();
        let response = request(&mut process, 3 + i as u64, query.clone());
        assert_eq!(
            response["result"]["binding"],
            json!({ "kind": "unknown" }),
            "case {i}: {response}"
        );
    }
    fs::remove_file(&base).unwrap();
    assert_eq!(
        request(&mut process, 6, query.clone())["result"]["binding"]["kind"],
        "unknown"
    );
    fs::create_dir(&base).unwrap();
    assert_eq!(
        request(&mut process, 7, query)["result"]["binding"]["kind"],
        "unknown"
    );
    process.shutdown(8);
}

#[test]
fn current_overlay_wins_over_unsupported_disk_without_changing_persisted_facts() {
    let (directory, mut process, mut query) = fixture("availability-overlay-authority");
    fs::write(
        directory.path().join("workspace/Base.ets"),
        "export class Base extends",
    )
    .unwrap();
    mark_present(&mut query);
    query["overlays"] = json!([{ "uri": query["documentUris"][1],
        "text": "/* 😀 */ export class Base {}\n" }]);
    let current = request(&mut process, 3, query.clone());
    assert_eq!(
        current["result"]["binding"]["nameRange"]["start"]["character"], 22,
        "{current}"
    );
    query.as_object_mut().unwrap().remove("sourceAvailability");
    query["overlays"] = json!([]);
    let persisted = request(&mut process, 4, query);
    assert_eq!(
        persisted["result"]["binding"]["nameRange"]["start"]["character"],
        13
    );
    process.shutdown(5);
}

#[test]
fn current_reexport_support_is_loaded_even_when_new_sources_have_no_index_row() {
    let (directory, mut process, mut query) = fixture("availability-reexport-edit");
    let root = directory.path().join("workspace");
    let identity = query["workspaceIdentity"].as_str().unwrap().to_owned();
    let bridge = format!("{identity}/Bridge.ets");
    let other = format!("{identity}/Other.ets");
    fs::write(
        root.join("Child.ets"),
        "import { Base } from './Bridge.ets'\nclass Child extends Base {}\n",
    )
    .unwrap();
    fs::write(
        root.join("Bridge.ets"),
        "export { Other as Base } from './Other.ets'\n",
    )
    .unwrap();
    fs::write(root.join("Other.ets"), "export class Other {}\n").unwrap();
    query["documentUris"]
        .as_array_mut()
        .unwrap()
        .extend([json!(bridge.clone()), json!(other.clone())]);
    mark_present(&mut query);
    let current = request(&mut process, 3, query.clone());
    assert_eq!(
        current["result"]["binding"]["declarationUri"], other,
        "{current}"
    );
    assert_eq!(
        current["result"]["binding"]["supportUris"],
        json!([bridge, query["documentUri"], other])
    );
    query["sourceAvailability"][2]["state"] = json!("unknown");
    assert_eq!(
        request(&mut process, 4, query.clone())["result"]["binding"]["kind"],
        "unknown"
    );
    query["expectedGeneration"] = json!(8);
    mark_present(&mut query);
    assert_eq!(
        request(&mut process, 5, query)["result"]["binding"]["kind"],
        "unknown"
    );
    process.shutdown(6);
}

#[test]
fn current_source_uri_roundtrip_preserves_spaces_unicode_and_filename_spelling() {
    let (directory, mut process, mut query) = fixture("availability-escaped-uri");
    let root = directory.path().join("workspace");
    let target = root.join("空 白.ets");
    fs::write(&target, BASE).unwrap();
    fs::write(
        root.join("Child.ets"),
        "import { Base } from './空 白.ets'\nclass Child extends Base {}\n",
    )
    .unwrap();
    let target = arkts_index_sqlite::path_to_file_uri(&fs::canonicalize(target).unwrap());
    query["documentUris"]
        .as_array_mut()
        .unwrap()
        .push(json!(target.clone()));
    mark_present(&mut query);
    let response = request(&mut process, 3, query);
    assert_eq!(
        response["result"]["binding"]["declarationUri"], target,
        "{response}"
    );
    process.shutdown(4);
}

#[cfg(unix)]
#[test]
fn leaf_symlinks_and_escaping_parent_links_cannot_admit_current_disk_text() {
    use std::os::unix::fs::symlink;
    let (directory, mut process, mut query) = fixture("availability-links");
    let root = directory.path().join("workspace");
    let outside = directory.path().join("outside");
    fs::create_dir(&outside).unwrap();
    fs::write(outside.join("Base.ets"), BASE).unwrap();
    fs::remove_file(root.join("Base.ets")).unwrap();
    symlink(outside.join("Base.ets"), root.join("Base.ets")).unwrap();
    mark_present(&mut query);
    assert_eq!(
        request(&mut process, 3, query.clone())["result"]["binding"]["kind"],
        "unknown"
    );
    symlink(&outside, root.join("bridge")).unwrap();
    fs::write(
        root.join("Child.ets"),
        "import { Base } from './bridge/Base.ets'\nclass Child extends Base {}\n",
    )
    .unwrap();
    let identity = query["workspaceIdentity"].as_str().unwrap();
    query["documentUris"] = json!([query["documentUri"], format!("{identity}/bridge/Base.ets")]);
    mark_present(&mut query);
    assert_eq!(
        request(&mut process, 4, query)["result"]["binding"]["kind"],
        "unknown"
    );
    process.shutdown(5);
}

#[test]
fn source_budget_accepts_two_mib_and_rejects_one_extra_byte() {
    let (directory, mut process, mut query) = fixture("availability-source-budget");
    let mut text = format!(
        "/*{}*/\n{BASE}",
        "x".repeat(2 * 1024 * 1024 - BASE.len() - 5)
    );
    assert_eq!(text.len(), 2 * 1024 * 1024);
    let base = directory.path().join("workspace/Base.ets");
    fs::write(&base, &text).unwrap();
    mark_present(&mut query);
    let admitted = request(&mut process, 3, query.clone());
    assert_eq!(
        admitted["result"]["binding"]["kind"], "resolved",
        "{admitted}"
    );
    text.push(' ');
    fs::write(&base, text).unwrap();
    assert_eq!(
        request(&mut process, 4, query)["result"]["binding"]["kind"],
        "unknown"
    );
    process.shutdown(5);
}

#[test]
fn aggregate_current_text_budget_is_eight_mib_including_overlays() {
    let (directory, mut process, mut query) = fixture("availability-total-budget");
    let root = directory.path().join("workspace");
    let identity = query["workspaceIdentity"].as_str().unwrap().to_owned();
    let limit = 2 * 1024 * 1024;
    for (name, count) in [
        ("Base.ets", limit),
        ("A.ets", limit),
        ("B.ets", limit),
        ("C.ets", limit - CHILD.len()),
    ] {
        let tail = if name == "Base.ets" { BASE } else { "" };
        let text = format!("/*{}*/\n{tail}", "x".repeat(count - tail.len() - 5));
        assert_eq!(text.len(), count);
        fs::write(root.join(name), text).unwrap();
        if name != "Base.ets" {
            query["documentUris"]
                .as_array_mut()
                .unwrap()
                .push(json!(format!("{identity}/{name}")));
        }
    }
    mark_present(&mut query);
    query["overlays"] = json!([{ "uri": query["documentUri"], "text": CHILD }]);
    let admitted = request(&mut process, 3, query.clone());
    assert_eq!(
        admitted["result"]["binding"]["kind"], "resolved",
        "{admitted}"
    );
    let file = root.join("C.ets");
    let mut content = fs::read(&file).unwrap();
    content.push(b' ');
    fs::write(file, content).unwrap();
    assert_eq!(
        request(&mut process, 4, query)["result"]["binding"]["kind"],
        "unknown"
    );
    process.shutdown(5);
}
