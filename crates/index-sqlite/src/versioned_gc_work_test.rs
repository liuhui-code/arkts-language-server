//! Instrument the public collector, not a copied SQL query or wall-clock limit.
use super::VersionedFacts;
use arkts_index_core::{Document, parse_document_symbols};
use rusqlite::{Connection, ffi};
use sha2::{Digest, Sha256};
use std::{cell::Cell, ffi::c_void};
#[path = "../tests/support/temp_dir.rs"]
mod temp_dir;
struct Progress {
    handle: *mut ffi::sqlite3,
    steps: Box<Cell<u64>>,
}
impl Progress {
    fn start(connection: &Connection) -> Self {
        let probe = Self {
            // SAFETY: this test retains the connection until after the guard.
            handle: unsafe { connection.handle() },
            steps: Box::new(Cell::new(0)),
        };
        unsafe extern "C" fn tick(data: *mut c_void) -> i32 {
            // SAFETY: the guard owns this stable allocation until unregistered;
            // SQLite invokes the handler synchronously on this same thread.
            let steps = unsafe { &*(data as *const Cell<u64>) };
            steps.set(steps.get() + 1000);
            0
        }
        // SAFETY: only test instrumentation, no cancellation or SQL reentrancy.
        unsafe {
            ffi::sqlite3_progress_handler(
                probe.handle,
                1000,
                Some(tick),
                (&*probe.steps as *const Cell<u64>).cast_mut().cast(),
            )
        };
        probe
    }
}
impl Drop for Progress {
    fn drop(&mut self) {
        // SAFETY: unregister before freeing the callback allocation/connection.
        unsafe { ffi::sqlite3_progress_handler(self.handle, 0, None, std::ptr::null_mut()) };
    }
}
fn collect_steps(count: usize) -> u64 {
    let temp = temp_dir::TestDir::new("gc-published-selection-work");
    let mut facts = VersionedFacts::create(
        &temp.path().join("facts.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let mut entries = Vec::new();
    for index in 0..count {
        let uri = format!("file:///workspace/{index}.ets");
        let text = format!("export class Kept{index} {{}}\n");
        let document = parse_document_symbols(&Document::new(&uri, &text)).unwrap();
        let id = format!("version-{index}");
        facts
            .write_version(
                &id,
                &format!("{:x}", Sha256::digest(text.as_bytes())),
                &document,
            )
            .unwrap();
        entries.push((uri, id));
    }
    facts.stage_group("current", &entries).unwrap();
    facts.publish_group("current", 0).unwrap();
    let probe = Progress::start(&facts.log.connection);
    let report = facts.collect_garbage(4096).unwrap();
    let steps = probe.steps.get();
    drop(probe);
    assert_eq!(report.versions_deleted, 0);
    assert_eq!(report.entries_deleted, 0);
    assert_eq!(report.facts_deleted, 0);
    for index in [0, count / 2, count - 1] {
        assert!(
            facts
                .visible_document(&format!("file:///workspace/{index}.ets"))
                .unwrap()
                .is_some()
        );
    }
    println!(
        "sqlite={} count={count} gcVmStepsLowerBound={steps}",
        rusqlite::version()
    );
    steps
}
#[test]
fn current_manifest_collection_avoids_per_version_full_manifest_scans() {
    let small = collect_steps(512);
    let large = collect_steps(2048);
    // Fourfold input may include sorting/index work; quadratic repeated scans
    // approach 16x. Compare work rather than noisy time or a memory threshold.
    assert!(large < small * 8, "512:{small} ->2048:{large}");
}
