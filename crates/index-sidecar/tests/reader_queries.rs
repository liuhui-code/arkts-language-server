//! Public transcript characterization: the executor cannot alter query semantics.
use serde_json::json;
use std::fs;
#[allow(dead_code)]
#[path = "support/maintenance_session.rs"]
mod session;
use session::{SidecarProcess, TestDir, init, start, terminal};
#[test]
fn every_snapshot_query_preserves_the_legacy_payload_and_has_one_authoritative_envelope() {
    let temp = TestDir::new("reader-query-oracles");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    let documents = [
        ("Base.ets", "export class Base {}\n"),
        (
            "Child.ets",
            "import { Base } from './Base.ets'\nexport class Child extends Base {}\n",
        ),
    ];
    let mut changed = Vec::new();
    for (name, text) in documents {
        let path = root.join(name);
        fs::write(&path, text).unwrap();
        changed.push(json!({"uri":arkts_index_sqlite::path_to_file_uri(&path),"text":text}));
    }
    let mut modern = SidecarProcess::spawn();
    init(&mut modern, &root, &temp.path().join("modern"));
    start(&mut modern, 2, 1);
    let complete = terminal(&mut modern);
    assert_eq!(complete["outcome"], "qualified");
    let identity = complete["qualification"]["workspaceIdentity"].clone();
    let base = changed[0]["uri"].clone();
    let child = changed[1]["uri"].clone();
    let mut legacy = SidecarProcess::spawn();
    let initialized=legacy.request(json!({"protocol":1,"id":1,"method":"initialize","params":{"workspaceRoot":root,"cacheDirectory":temp.path().join("legacy")}}));
    assert_eq!(initialized["result"]["workspaceIdentity"], identity);
    assert_eq!(legacy.request(json!({"protocol":1,"id":2,"method":"refresh","params":{"generation":1,"changed":changed}}))["ok"], true);
    let queries = [
        ("search", json!({"query":"Base","limit":10})),
        (
            "search",
            json!({"query":"Base","limit":10,"excludedUris":[base]}),
        ),
        ("exports/search", json!({"query":"Base","limit":10})),
        (
            "references/candidates",
            json!({"declarationUri":base,"declarationPosition":{"line":0,"character":13},"limit":100,"sourceResolutions":[{"bindingUri":child,"sourceSpecifier":"./Base.ets","resolvedSourceUri":base}]}),
        ),
        (
            "class-bindings/resolve",
            json!({"workspaceIdentity":identity,"expectedGeneration":1,"documentUris":[base,child],"overlays":[],"documentUri":child,"classNamePosition":{"line":1,"character":14}}),
        ),
        ("search", json!({"query":"Base","limit":0})),
        (
            "references/candidates",
            json!({"declarationUri":base,"declarationPosition":{"line":0,"character":13},"limit":0}),
        ),
    ];
    for (i, (method, params)) in queries.into_iter().enumerate() {
        let id = 10 + i as u64;
        let request = json!({"protocol":1,"id":id,"method":method,"params":params});
        let old = legacy.request(request.clone());
        let mut new = modern.request(request);
        assert_eq!(new["ok"], old["ok"], "{method}: {new}");
        if old["ok"] == false {
            assert_eq!(new["error"], old["error"], "{method}");
            continue;
        }
        assert_eq!(new["result"]["qualification"], complete["qualification"]);
        assert_eq!(
            new["result"]["snapshot"]["head"],
            new["result"]["servedGeneration"]
        );
        assert_eq!(
            new["result"]["snapshot"]["storeId"],
            complete["qualification"]["storeId"]
        );
        for extra in ["snapshot", "qualification", "format"] {
            new["result"].as_object_mut().unwrap().remove(extra);
        }
        assert_eq!(new["result"], old["result"], "{method}: payload changed");
        if method == "class-bindings/resolve" {
            assert_eq!(new["result"]["binding"]["kind"], "resolved");
            assert_eq!(new["result"]["binding"]["declarationUri"], base);
        }
    }
    modern.shutdown(30);
    legacy.shutdown(30);
}

#[test]
fn fatal_readers_retire_without_restart_loops_and_explicit_reinitialize_has_a_new_epoch() {
    use std::ffi::OsStr;
    let temp = TestDir::new("reader-fatal-retirement");
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("A.ets"), "export class Visible {}\n").unwrap();
    let cache = temp.path().join("cache");
    let mut p = SidecarProcess::spawn_with_environment(&[(
        "ARKTS_INDEX_TEST_READER_FATAL_IDS",
        OsStr::new("50,51"),
    )]);
    init(&mut p, &root, &cache);
    start(&mut p, 2, 1);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    let original =
        p.request(json!({"protocol":1,"id":3,"method":"index/reader-status","params":{}}));
    let epoch = original["result"]["readerEpoch"].clone();
    for id in [50, 51] {
        let failed = p.request(json!({"protocol":1,"id":id,"method":"search","params":{"query":"Visible","limit":10,"requestToken":format!("fatal-{id}")}}));
        assert_eq!(failed["error"]["code"], "reader_unavailable", "{failed}");
    }
    let status =
        p.request(json!({"protocol":1,"id":52,"method":"index/reader-status","params":{}}));
    assert_eq!(status["result"]["activeReaderTasks"], 0);
    assert_eq!(status["result"]["retiredReaders"], 2);
    assert_eq!(status["result"]["readerThreadsCreated"], 2);
    let unavailable = p.request(
        json!({"protocol":1,"id":53,"method":"search","params":{"query":"Visible","limit":10}}),
    );
    assert_eq!(unavailable["error"]["code"], "reader_unavailable");
    let reinit=p.request(json!({"protocol":1,"id":54,"method":"initialize","params":{"workspaceRoot":root,"cacheDirectory":cache,"capabilities":["versioned-file-maintenance-v1"]}}));
    assert_eq!(reinit["ok"], true, "{reinit}");
    assert_ne!(reinit["result"]["readerEpoch"], epoch);
    let late=p.request(json!({"protocol":1,"id":55,"method":"index/cancel","params":{"readerEpoch":epoch,"requestId":50,"requestToken":"fatal-50"}}));
    assert_eq!(late["result"]["accepted"], false);
    start(&mut p, 56, 1);
    assert_eq!(terminal(&mut p)["outcome"], "qualified");
    let recovered = p.request(
        json!({"protocol":1,"id":57,"method":"search","params":{"query":"Visible","limit":10}}),
    );
    assert_eq!(recovered["result"]["items"].as_array().unwrap().len(), 1);
    assert_eq!(recovered["result"]["completeness"], "ready");
    p.shutdown(58);
}
