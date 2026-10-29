# Index cache lifecycle TDD

Parent: `9d47e550ee7c0a3ba9e0e889f62e04bb9fd4a78a`.
Branch: `feat/index-cache-lifecycle-20261029`.
Evidence: `.bench/index-cache-lifecycle-20261029/`.
Decision: [ADR0028](../adr/0028-index-cache-lifecycle.md), Proposed; implementation authorized.

## Slice 1: stop test pollution

RED: `node --test tests/lsp-cache-isolation.test.mjs`, exit1, no private index cache in a standalone LSP test.
Raw: `isolation-red.log`.
GREEN: same test plus `tests/lsp-process.test.mjs`, 21/21, exit0, `isolation-green.log`.
The public child sends framed stdio evidence of its actual environment, and the owned cache disappears after close.
Explicit fixture roots remain caller-owned. Further runner/abnormal termination coverage follows.

Runner RED: direct-spawn child inherited a caller cache; `runner-red-corrected.log`.
The earlier `runner-red.log` exercised a nested Node-test context instead of the intended seam;
it is retained, not claimed as proof. GREEN: `runner-green.log`, then final reporter/isolation
31 tests in `runner-url-green.log`. Two invalid `ARKTS_LSP_CACHE_DIR` uses were corrected.

## Slices 2–4: preview, leases and retirement

Commands use the actual native binary through CLI/framed sidecar stdio:

```sh
cargo test --locked -p arkts-index-sidecar --test cache_gc --test cache_gc_safety --test cache_gc_policy -- --nocapture
node --test --test-concurrency=1 tests/index-cache-cli.test.mjs tests/lsp-cache-isolation.test.mjs
```

| First failing behavior | RED | GREEN |
| --- | --- | --- |
| Read-only legacy identity and unsupported layout protection | `cache-preview-red.log` | `cache-preview-green.log` |
| Missing observation, active lease, whole-directory retirement | `cache-apply-red.log` | `cache-apply-green.log` |
| Automatic policy, cursor and cooldown | `cache-auto-red.log` | `cache-auto-green.log` |
| Public server administration command | `public-cli-red.log` | `public-cli-green.log` |
| Real LSP background maintenance and active symbols | `lsp-auto-red.log` | `lsp-auto-proof-green.log` |
| WAL modification must revoke old missing proof | `wal-observation-red.log` | `wal-observation-green.log` |
| Legacy identity committed only in WAL | `wal-identity-red.log` | `wal-identity-green.log` |
| Explicit legacy enrollment completes later in auto mode | `legacy-adoption-red.log` | `legacy-adoption-green.log` |
| Active observation survives abnormal exit for idle retention | `active-use-red.log` | `cache-final-v2-focused.log` |
| Report-write failure preserves actual removal results | `report-failure-red.log` | `report-failure-green.log` |
| Dangling cache-root symlink is rejected | `dangling-root-red.log` | `dangling-root-green.log` |

`lsp-auto-green.log` first exposed a real new-DB identity-in-WAL case; the final proof checks the
live use lease before inspecting legacy main-file metadata. It is not hidden as a successful run.
The Unix denied-deletion test accepts the actual platform stage: macOS may deny the initial
rename, while Linux may deny unlink after rename. It requires a durable intent and intact data,
then validates retry. A separate known intent fixture models interruption after rename.

## Windows characterization and correction

Initial actual Windows run: native 6/13 pass, 7 fail; Node 4/5 pass, 1 fail.
Raw `windows-initial/`, `windows-minimal.stdout`, and `windows-sharing-probe.stdout`.
The shared/range-locked/exclusive-handle probes all reproduce ERROR_ACCESS_DENIED5 for directory
rename while the collector's own DB handle remains open. The fix preserves management leases,
releases that handle immediately before the atomic Windows rename, and verifies the entire group
afterward. A competing legacy open makes rename fail; changed input is retained in trash.
Unix keeps its SQLite byte guard. The runner reporter path now uses a file URL on Windows.

Final Windows candidate `candidate-v2.zip`, SHA256
`948e0679b2ffa85c77a5284989952ce38645859757df5063c9d02c251ba3f58c`:
23/23 focused native (includes the helper process entry), 5/5 Node/LSP,
path-identity and store-identity contracts, native release build and Node bundle all pass.
Raw `windows-final/`; stage times/hashes `windows-final/results-v2.json`.
This is native Windows testing through SSH, not Zed UI acceptance.

## Complete checks and real historical data

Full Rust first run found one real regression: identity mismatch changed from WorkspaceMismatch
to Io. Typed CacheLeaseError restores the contract; `typed-lease-green.log`.
`cargo test --workspace` final `rust-workspace-v2.log`: all executed tests pass;
the existing 455-file cold performance test remains ignored under the user's explicit waiver.
`cargo build --locked -p arkts-index-sidecar --release`: `release-build-v2.log`.
Earlier bundle/isolation/portable-installed artifact: 6/6, `public-installed-v2.log`.
Pinned Node20 installed-artifact acceptance: 1/1, `installed-node20.log`.
`pnpm check:fast`: final result is recorded in the implementation report; raw `check-fast-final-node20-v4.log`.

## Full-check finding: parent termination is not native disposal

The first permitted Node20 full run found three ENOTEMPTY teardown failures in references-depth,
retained in `check-fast-node20.log`. Focused RED command:

```sh
node --test --test-concurrency=1 --test-name-pattern='does not search unopened inactive-target|uses one authoritative named-module|refreshes named references when' tests/semantic/references-depth.test.mjs
```

`teardown-repro-red.log`: 2/3 pass,1 fail with the same owned cache ENOTEMPTY.
The fixture already awaited server.close, but that API sends SIGTERM and observes only the parent Node.
The native child receives EOF and writes its closing use record afterward, racing recursive fixture removal.
GC safety is not bypassed: the manual fixture remover was not using the native lease contract.
The public LSP shutdown chain already awaits semantic/index disposal and native close.

Extracted `tests/support/production-session-lifecycle.mjs`; normal fixture teardown now sends framed
shutdown, verifies its null result, sends exit and waits for actual close before deletion. If disposal fails,
all sessions are attempted and the fixture is preserved with an error. Raw abnormal-exit tests remain intact.
The existing over-limit references-depth test shrinks815→804 lines through that cohesive extraction.
New public regression checks the real native preview is immediately idle/eligible after LSP shutdown,
then removes the fixture without retry or sleep. Focused GREEN command:

```sh
node --test --test-concurrency=1 tests/index-cache-cli.test.mjs tests/lsp-cache-isolation.test.mjs tests/semantic/references-depth.test.mjs
```

12/12 pass, `orderly-teardown-green.log`. The already-failed full run was stopped (retained receipt
`failed-node20-check-stop.json`) and the final complete Node20 check restarted in isolation.
No Rust/product runtime source changed for this correction. Final Windows test snapshot is
`candidate-v3.zip`, SHA256 `f6fcfa49f58362ccf6aec2b90eb3fe2b633401538279d82e7fa36bcba8022b23`;
the source-v2 native binary is reused with the same hash. Windows source-v3:6/6 public CLI/LSP/isolation pass,
plus2 applicable named-fixture cases pass (4 other pattern-mismatched cases not run); no timeout.
Raw `windows-v3/`; server/Worker/native hashes remain identical to source-v2. The symbolic-link overlay
case is tested on Mac, not claimed as Windows coverage. Full Node suite is executed on Mac, not Windows.

V3 complete full run finished2091 pass/1 fail/0 cancelled/skip/todo in3228s. All original teardown cases
pass; the one failure is the test-inventory snapshot264 vs actual267 after three executable entries were added.
Updated exact total and per-layer counts plus explicit assignments for all three entries; no assertion removed.
`node --test tests/test-layer-manifest.test.mjs`:4/4 GREEN, `manifest-count-green.log`.
V3 raw full failure retained; v4 complete check rerun on the final test snapshot finishes2092/2092 PASS,
exit0,0 failed/cancelled/skipped/todo,3223.885s. Product runtime/Rust and
Windows public test code remain unchanged; only the manifest test's expected inventory metadata changed.

Reproduce historical-copy validation with the saved script (it refuses any apply outside its copy):

```sh
python3 .bench/index-cache-lifecycle-20261029/verify-history.py
python3 .bench/index-cache-lifecycle-20261029/preview-real.py
```

Scripts use exclusive output directories; preserve/rename a prior output directory before rerunning.
Eight copied originals cover schemas2/4/5/6/8/9/11 and one DB/WAL/SHM group.
The test-only explicit zero grace still requires two observations: first8 observing, second8 removed,
909344 logical bytes. The production default remains24h. Seed ZIP, selection and SHA256 are retained.
Real-root first sandbox preview reported lock permission denial; its receipt is retained.
The permitted read-only preview scans12301 entries:12256 missing temporary observations,
3371206272 logical bytes potentially reclaimable after authorization/grace, 45 other legacy protected.
No actual eligible/removed original entries. Before/after full stat lists identical, selected original
content hashes identical; the 30K key remains protected. This is not a claim of full5GB content hashing.
After the final full check, `post-check.py` again verifies12301 directories,0 added/removed,
0 changed stat entries, selected original hashes unchanged. Raw `real-after-final-check-result.json`.

No user cache was deleted, no daily Zed installation updated, and no release/merge executed.
