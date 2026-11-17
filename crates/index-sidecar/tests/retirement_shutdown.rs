//! Normal process exit must wait for resource retirement, not kill detached work.
#![cfg(debug_assertions)]
use serde_json::json;
use std::{
    fs,
    path::Path,
    time::{Duration, Instant},
};
#[path = "support/maintenance_session.rs"]
#[expect(dead_code, reason = "shared public protocol helpers")]
mod session;
use session::{SidecarProcess, TestDir, init, start, terminal};

fn wait_for(path: &Path) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !path.is_file() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(5));
    }
    assert!(
        path.is_file(),
        "missing gate observation: {}",
        path.display()
    );
}
#[test]
fn normal_shutdown_drains_retirement_before_exit_and_cache_collection() {
    exercise_exit(true);
}
#[test]
fn stdin_eof_drains_retirement_before_exit_and_cache_collection() {
    exercise_exit(false);
}
fn exercise_exit(shutdown: bool) {
    let temp = TestDir::new(if shutdown {
        "retirement-shutdown-rpc"
    } else {
        "retirement-shutdown-eof"
    });
    let root = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    let gate = temp.path().join("release");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("Source.ets"), "export class Source {}\n").unwrap();
    let mut process = SidecarProcess::spawn_with_environment(&[(
        "ARKTS_INDEX_TEST_RETIREMENT_GATE",
        gate.as_os_str(),
    )]);
    init(&mut process, &root, &cache);
    start(&mut process, 2, 1);
    wait_for(&gate.with_extension("started"));
    assert_eq!(terminal(&mut process)["outcome"], "qualified");
    let status = process.request(json!({"protocol":1,"id":9,"method":"status","params":{}}));
    assert_eq!(
        status["ok"], true,
        "control remains responsive during retirement"
    );
    // Shutdown may acknowledge before draining, but process exit cannot precede it.
    if shutdown {
        process.send(json!({"protocol":1,"id":3,"method":"shutdown","params":{}}));
    } else {
        process.close_input();
    }
    let deadline = Instant::now() + Duration::from_millis(400);
    while Instant::now() < deadline && !process.has_exited() {
        std::thread::sleep(Duration::from_millis(5));
    }
    let prematurely_exited = process.has_exited();
    fs::write(&gate, "release owned retirement").unwrap();
    assert!(
        !prematurely_exited,
        "normal shutdown exited with unfinished retirement"
    );
    if shutdown {
        assert_eq!(process.response()["ok"], true);
    }
    process.finish_shutdown();
    wait_for(&gate.with_extension("finished"));
    // Publicly reopen the same namespace: no cleanup or cache reset before retry.
    let mut next = SidecarProcess::spawn();
    init(&mut next, &root, &cache);
    start(&mut next, 2, 1);
    assert_eq!(terminal(&mut next)["outcome"], "qualified");
    next.shutdown(3);
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_arkts-index-sidecar"))
        .args(["--cache-gc", "--cache-dir"])
        .arg(&cache)
        .args(["--idle-ms", "0", "--apply"])
        .output()
        .unwrap();
    assert!(output.status.success());
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(report["entries"][0]["outcome"], "removed", "{report}");
}
