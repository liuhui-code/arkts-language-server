use serde_json::json;
use std::fs;
#[expect(dead_code, reason = "shared public child-process session helpers")]
#[path = "support/maintenance_session.rs"]
mod session;
use session::{SidecarProcess, TestDir, init, start, terminal};

#[test]
fn an_attested_peer_cache_is_excluded_and_old_scope_cannot_serve_during_requalification() {
    let temp = TestDir::new("managed-peer-scope");
    let a = temp.path().join("a");
    let b = temp.path().join("b");
    fs::create_dir(&a).unwrap();
    fs::create_dir(&b).unwrap();
    fs::write(a.join("Real.ets"), "export class Real {}\n").unwrap();
    fs::write(b.join("Other.ets"), "export class Other {}\n").unwrap();
    let cache = a.join("Cache");
    let mut peer = SidecarProcess::spawn();
    let opened = peer.request(json!({"protocol":1,"id":1,"method":"initialize","params":{
        "workspaceRoot":b,"cacheDirectory":cache,"capabilities":["versioned-file-maintenance-v1"]}}));
    assert_eq!(opened["ok"], true, "{opened}");
    let proof = opened["result"]["managedCache"].clone();
    let leaf = std::path::Path::new(proof["directory"].as_str().unwrap());
    fs::write(leaf.join("Generated.ets"), "export class Generated {}\n").unwrap();
    let mut owner = SidecarProcess::spawn();
    init(&mut owner, &a, &cache);
    start(&mut owner, 2, 1);
    assert_eq!(terminal(&mut owner)["indexedDocuments"], 2);
    let invalid_null = owner.request(
        json!({"protocol":1,"id":29,"method":"maintenance/changes","params":{
        "input":{"issuer":"window","revision":2},"changes":[],"uncertainty":["namespace"],
        "managedCacheNamespaces":null}}),
    );
    assert_eq!(
        invalid_null["error"]["code"], "invalid_params",
        "null is not an explicit policy revocation: {invalid_null}"
    );
    let mut bad = proof.clone();
    bad["objectId"] = json!("wrong-object");
    let invalid = owner.request(
        json!({"protocol":1,"id":30,"method":"maintenance/changes","params":{
        "input":{"issuer":"window","revision":2},"changes":[],"uncertainty":["namespace"],
        "managedCacheNamespaces":[bad]}}),
    );
    assert_eq!(
        invalid["error"]["code"], "cache_namespace_changed",
        "{invalid}"
    );
    let unchanged =
        owner.request(json!({"protocol":1,"id":31,"method":"maintenance/status","params":{}}));
    assert_eq!(unchanged["result"]["observedInput"]["revision"], 1);
    let assigned = owner.request(
        json!({"protocol":1,"id":3,"method":"maintenance/changes","params":{
        "input":{"issuer":"window","revision":2},"changes":[],"uncertainty":["namespace"],
        "managedCacheNamespaces":[proof]}}),
    );
    assert_eq!(assigned["ok"], true, "{assigned}");
    let old = owner.request(
        json!({"protocol":1,"id":4,"method":"search","params":{"query":"Generated","limit":10}}),
    );
    assert_eq!(old["error"]["code"], "source_scope_unqualified", "{old}");
    start(&mut owner, 5, 2);
    let qualified = terminal(&mut owner);
    assert_eq!(qualified["outcome"], "qualified", "{qualified}");
    assert_eq!(qualified["indexedDocuments"], 1, "{qualified}");
    assert_eq!(
        qualified["writtenDocuments"], 0,
        "scope removal must reuse unchanged real file facts: {qualified}"
    );
    if let Some(directory) = std::env::var_os("ARKTS_TEST_EVIDENCE_DIR") {
        let directory = std::path::PathBuf::from(directory);
        fs::create_dir_all(&directory).unwrap();
        fs::write(
            directory.join("managed-peer-qualified.json"),
            serde_json::to_vec_pretty(&qualified).unwrap(),
        )
        .unwrap();
    }
    let found = owner.request(
        json!({"protocol":1,"id":6,"method":"search","params":{"query":"Generated","limit":10}}),
    );
    assert_eq!(found["ok"], true, "{found}");
    assert!(found["result"]["items"].as_array().unwrap().is_empty());
    fs::write(a.join("Real.ets"), "export class Updated {}\n").unwrap();
    let point = session::changes(
        &mut owner,
        20,
        3,
        &arkts_index_sqlite::path_to_file_uri(&a.join("Real.ets")),
    );
    assert_eq!(point["ok"], true, "{point}");
    assert_eq!(terminal(&mut owner)["outcome"], "data-updated");
    let stale = owner.request(
        json!({"protocol":1,"id":21,"method":"search","params":{"query":"Updated","limit":10}}),
    );
    assert_eq!(
        stale["ok"], true,
        "a qualified policy must not permanently disable ordinary discovery: {stale}"
    );
    assert_eq!(stale["result"]["items"].as_array().unwrap().len(), 1);
    let cleared = owner.request(
        json!({"protocol":1,"id":7,"method":"maintenance/changes","params":{
        "input":{"issuer":"window","revision":4},"changes":[],"uncertainty":["namespace"],
        "managedCacheNamespaces":[]}}),
    );
    assert_eq!(cleared["ok"], true, "{cleared}");
    start(&mut owner, 8, 4);
    assert_eq!(terminal(&mut owner)["indexedDocuments"], 2);
    let restored = owner.request(
        json!({"protocol":1,"id":9,"method":"search","params":{"query":"Generated","limit":10}}),
    );
    assert_eq!(restored["result"]["items"].as_array().unwrap().len(), 1);
    owner.shutdown(10);
    peer.shutdown(2);
}

#[test]
fn a_read_captured_before_peer_admission_has_no_late_success() {
    use std::{
        ffi::OsStr,
        time::{Duration, Instant},
    };
    let temp = TestDir::new("managed-peer-held-read");
    let a = temp.path().join("a");
    let b = temp.path().join("b");
    fs::create_dir(&a).unwrap();
    fs::create_dir(&b).unwrap();
    fs::write(a.join("Real.ets"), "export class Real {}\n").unwrap();
    let cache = a.join("Cache");
    let mut peer = SidecarProcess::spawn();
    let opened = peer.request(json!({"protocol":1,"id":1,"method":"initialize","params":{
        "workspaceRoot":b,"cacheDirectory":cache,"capabilities":["versioned-file-maintenance-v1"]}}));
    let proof = opened["result"]["managedCache"].clone();
    fs::write(
        std::path::Path::new(proof["directory"].as_str().unwrap()).join("Generated.ets"),
        "export class Generated {}\n",
    )
    .unwrap();
    let gate = temp.path().join("read-gate");
    let mut owner = SidecarProcess::spawn_with_environment(&[
        ("ARKTS_INDEX_TEST_READ_GATE", gate.as_os_str()),
        ("ARKTS_INDEX_TEST_READ_GATE_ID", OsStr::new("50")),
    ]);
    init(&mut owner, &a, &cache);
    start(&mut owner, 2, 1);
    terminal(&mut owner);
    owner.send(
        json!({"protocol":1,"id":50,"method":"search","params":{"query":"Generated","limit":10}}),
    );
    let deadline = Instant::now() + Duration::from_secs(10);
    while !gate.with_extension("started").exists() {
        assert!(
            Instant::now() < deadline,
            "held read must enter a real SQLite snapshot"
        );
        std::thread::sleep(Duration::from_millis(5));
    }
    let changed = owner.request(
        json!({"protocol":1,"id":3,"method":"maintenance/changes","params":{
        "input":{"issuer":"window","revision":2},"changes":[],"uncertainty":["namespace"],
        "managedCacheNamespaces":[proof]}}),
    );
    assert_eq!(changed["ok"], true, "{changed}");
    fs::write(&gate, "release").unwrap();
    let late = owner.response();
    assert_eq!(late["id"], 50);
    assert_eq!(late["ok"], false, "{late}");
    // Runtime's existing input observer cancels reads before acknowledging the new input.
    assert_eq!(late["error"]["code"], "cancelled", "{late}");
    start(&mut owner, 4, 2);
    let current = terminal(&mut owner);
    assert_eq!(current["indexedDocuments"], 1);
    assert_eq!(current["currentInput"], true);
    owner.shutdown(5);
    peer.shutdown(2);
}
