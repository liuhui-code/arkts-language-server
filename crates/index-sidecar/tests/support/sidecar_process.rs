use std::{
    collections::VecDeque,
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{self, Child, ChildStdin, ChildStdout, Command, Stdio},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde_json::{Value, json};

pub(crate) struct TestDir(PathBuf);

impl TestDir {
    pub(crate) fn new(name: &str) -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after epoch")
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("arkts-sidecar-{name}-{}-{nonce}", process::id()));
        fs::create_dir_all(&path).expect("test directory should be created");
        Self(path)
    }

    pub(crate) fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

pub(crate) struct SidecarProcess {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    events: VecDeque<Value>,
    finished: bool,
}

impl SidecarProcess {
    pub(crate) fn spawn() -> Self {
        Self::spawn_with_test_gates(None, None, None)
    }

    pub(crate) fn spawn_with_catalog_gate(delay: Duration) -> Self {
        Self::spawn_with_test_gates(Some(delay), None, None)
    }

    pub(crate) fn spawn_with_activation_gate(delay: Duration) -> Self {
        Self::spawn_with_test_gates(None, Some(delay), None)
    }

    pub(crate) fn spawn_with_entry_delay(delay: Duration) -> Self {
        Self::spawn_with_test_gates(None, None, Some(delay))
    }

    fn spawn_with_test_gates(
        catalog_delay: Option<Duration>,
        activation_delay: Option<Duration>,
        entry_delay: Option<Duration>,
    ) -> Self {
        let mut command = Command::new(env!("CARGO_BIN_EXE_arkts-index-sidecar"));
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(delay) = catalog_delay {
            command.env(
                "ARKTS_INDEX_TEST_CATALOG_GATE_MS",
                delay.as_millis().to_string(),
            );
        }
        if let Some(delay) = activation_delay {
            command.env(
                "ARKTS_INDEX_TEST_ACTIVATION_GATE_MS",
                delay.as_millis().to_string(),
            );
        }
        if let Some(delay) = entry_delay {
            command.env(
                "ARKTS_INDEX_TEST_ENTRY_DELAY_MS",
                delay.as_millis().to_string(),
            );
        }
        let mut child = command.spawn().expect("sidecar should spawn");
        let stdin = child.stdin.take().expect("sidecar stdin should be piped");
        let stdout = child.stdout.take().expect("sidecar stdout should be piped");
        Self {
            child,
            stdin: Some(stdin),
            stdout: BufReader::new(stdout),
            events: VecDeque::new(),
            finished: false,
        }
    }

    pub(crate) fn request(&mut self, request: Value) -> Value {
        let expected_id = request["id"].clone();
        let stdin = self.stdin.as_mut().expect("sidecar stdin should be open");
        serde_json::to_writer(&mut *stdin, &request).expect("request should serialize");
        stdin.write_all(b"\n").expect("request should be written");
        stdin.flush().expect("request should be flushed");

        loop {
            let message = self.read_message();
            if message.get("event").is_some() {
                self.events.push_back(message);
                continue;
            }
            assert_eq!(
                message["id"], expected_id,
                "sidecar responses must preserve request ordering in this harness"
            );
            return message;
        }
    }

    pub(crate) fn read_event(&mut self) -> Value {
        if let Some(event) = self.events.pop_front() {
            return event;
        }
        let message = self.read_message();
        if message.get("event").is_some() {
            return message;
        }
        panic!("received an unexpected response while waiting for event: {message}");
    }

    fn read_message(&mut self) -> Value {
        let mut line = String::new();
        self.stdout
            .read_line(&mut line)
            .expect("sidecar response should be readable");
        assert!(!line.is_empty(), "sidecar exited before responding");
        serde_json::from_str(&line).expect("every stdout line must be JSON protocol")
    }

    pub(crate) fn shutdown(mut self, id: u64) {
        let response = self.request(json!({
            "protocol": 1,
            "id": id,
            "method": "shutdown",
            "params": {}
        }));
        assert_eq!(response["ok"], true);
        drop(self.stdin.take());
        let status = self.child.wait().expect("sidecar should exit");
        assert!(status.success(), "sidecar should exit successfully");
        let mut trailing_stdout = String::new();
        self.stdout
            .read_to_string(&mut trailing_stdout)
            .expect("remaining stdout should be readable");
        assert!(
            trailing_stdout.is_empty(),
            "stdout must contain protocol responses only: {trailing_stdout:?}"
        );
        self.finished = true;
    }
}

impl Drop for SidecarProcess {
    fn drop(&mut self) {
        if !self.finished {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }
}

pub(crate) fn initialize(
    process: &mut SidecarProcess,
    root: &Path,
    cache: &Path,
    id: u64,
) -> Value {
    process.request(json!({
        "protocol": 1,
        "id": id,
        "method": "initialize",
        "params": {
            "workspaceRoot": root,
            "cacheDirectory": cache
        }
    }))
}
