# SDK release-gate follow-up

SDK/test parent: `3f9c28955a82955a8b3075d263d3e45918b2cee9`.
Its frozen Node26.3.0 `pnpm check:fast` completes2206/2206, exit0,
zero skipped/cancelled/todo; `/tmp/sdk-oracle-final-check-fast-20261101.log`.

## Live JSONL observer

[CI run41292204186](https://github.com/liuhui-code/arkts-language-server/actions/runs/41292204186)
passes Windows and2205/2206 Node cases. The watched-source constructor
cancellation test fails before asserting product behavior: `waitForBatch`
parses the final server-log line while its JSON record is incomplete.
Raw job log: `/tmp/sdk-ci-3f9c289-raw-job-20261101.log`.

A deterministic harness regression splits one log record across writes and
requires both live reference observers to wait for its newline. Complete
corrupt records still reject. Closed-log readers must also reject truncation.
RED: Node26.3.0 `node --test --test-name-pattern='reference batch observers' tests/semantic/references-constructor-scope-exclusion.test.mjs`,
0/1 PASS, exit1, partial-record SyntaxError;
`/tmp/sdk-reference-jsonl-red-20261101.log`.

Reuse the existing `completeLogEvents` reader only in live polling. Retain
strict parsing for post-shutdown log reads. Initial combined constructor and
reference-batch files:43/43 PASS, exit0,125188ms;
`/tmp/sdk-reference-jsonl-green-20261101.log`. A new strict closed-truncation
assertion rejects a too-broad reader replacement (missing exception):
`/tmp/sdk-reference-jsonl-closed-red-20261101.log`. Final scoped fix:
17/17 PASS, exit0,52962ms;
`/tmp/sdk-reference-jsonl-strict-green-20261101.log`. No product sources or
original cancellation/exact-reference assertions change.

## Native debug cold catalog

[Earlier CI run41288518007](https://github.com/liuhui-code/arkts-language-server/actions/runs/41288518007)
onf9c0366 passes2204/2204 Node cases, Rust fmt/Clippy/workspace tests, then
fails the original ignored455-file native cold-catalog gate at5.579067305s
against its unchanged3s budget. Raw log:
`/tmp/sdk-ci-f9c0366-raw-job-20261101.log`.

Original command (debug `CARGO_BIN_EXE`, not a release substitution):

```sh
ARKTS_INDEX_REAL_FIXTURE=.fixtures/nim-uikit-harmony \
  cargo test --locked -p arkts-index-sidecar --test ndjson_protocol \
  pinned_large_arkts_fixture_meets_cold_catalog_and_deterministic_query_gates \
  -- --ignored --exact --nocapture
```

Fixture remains the clean pinned455-source
`netease-kit/nim-uikit-harmony@585feb45114a128a0d2a23947c83faf338e758f7`.
Local original RED:8.25351935s, exit101;
`/tmp/sdk-native-cold-debug-20261101.log`. Existing SQLite public
characterization before further SQL experiments:80/80 PASS;
`/tmp/sdk-native-sqlite-characterization-20261101.log`.

macOS `sample` on the real debug sidecar attributes1738 inclusive samples
to reference insertion and1001 to transaction commit, with disk statement
journal writes visible under identity insertion. Probe:455 ready documents,
225630 actual rows,5924ms; `/tmp/sdk-native-cold-sampling-probe-20261101.log`
and `/tmp/sdk-native-cold-sample-20261101.txt`. These instrumented numbers
do not replace the trace-off gate.

Experiments are not acceptance: skipping an unused forced-build reuse hash,
a64MiB private writer cache, memory temporary journals, cached metadata
statements and bounded multirow occurrence writes have not achieved3s.
Unhelpful SQL rewrites are removed. The original debug budget, foreign keys,
indexes/FTS, NORMAL/auto-checkpoint and final FULL/TRUNCATE publication stay
required. Native investigation remains open; no release or merge is claimed.

## Fail native checks before the long Node suite

Parent: `7ac936bf1ed97282254ade3b67195e61cd99d46d`. Existing local
delivery characterization passes11/11 before extraction:
`/tmp/sdk-release-driver-characterization-20261101.log`. A public shell-driver
regression injects native exit71, verifies exact status propagation, and requires
Node commands not to start. Its success control still requires every Node,
artifact, large-project and query gate once. RED:0/1, exit1, the command log
contains `pnpm check:fast` before the failed native gate;
`/tmp/sdk-release-driver-failfast-red-20261101.log`.

Move `pnpm check:fast` after Rust fmt/Clippy/workspace tests, the unchanged
ignored debug455-file gate and the release build. All checks remain serialized
and mandatory. Extract release/toolchain/workflow contracts into
`tests/release-pipeline.test.mjs`, preserving the original assertions and
updating only their intended gate order. Local delivery test shrinks644→526
lines; its remaining over-limit size is migration debt. New release test174
lines. Explicit test manifest:284 entries,117 unit contracts. GREEN:
Node26.3.0 `node --test tests/local-delivery-config.test.mjs tests/release-pipeline.test.mjs tests/test-layer-manifest.test.mjs`,
16/16 PASS, exit0, zero skipped/cancelled/todo,18092ms;
`/tmp/sdk-release-driver-failfast-green-20261101.log`.

## Bounded private writer candidate

Skip producer/source reuse-fingerprint construction only for `force` builds,
which already discard that fingerprint. Preserve per-source length/mtime/SHA256
capture and final revalidation. Sort private documents by their unchanged URI
primary key before writing, preserving per-document ordinals. Only a new
private catalog uses16KiB pages before WAL/schema creation and a64MiB suggested
page-cache target. Normal open/reopen/incremental connections retain their
existing settings; this is not a hard RSS cap. Existing schema, foreign keys,
indexes/FTS triggers, bounded batches, per-batch PASSIVE, NORMAL/auto-checkpoint
and final FULL/TRUNCATE/directory synchronization remain intact.

Do not retain64KiB page or memory temporary-journal experiments: larger pages
amplify small-store/WAL footprint, and temporary memory storage adds an
unnecessary memory policy. Also remove single-row identity and multirow
occurrence rewrites; neither yielded useful gate improvement. Existing opt-in
WITHOUT ROWID remains unpromoted.

Final conservative candidate on this Mac still fails the strict gate at
**3.939127243s**, exit101;
`/tmp/sdk-native-cold-ordered-pages16k-disk-journal-20261101.log`. Timing asserts
first; this failed test does not certify its later ready/count/query assertions.
The original3s/debug contract is unchanged; a Linux CI result remains required.
Separately `cargo test --locked --workspace --all-targets` completes
**221 passed,0 failed,1 existing ignored** across36 suites, exit0, covering
publication, cancellation/races, force/reuse, migrations, allocation bounds,
reference identity/progress and query parity. Log:
`/tmp/sdk-native-workspace-candidate-20261101.log`. Rust inputs stayed fixed
through this complete run. `cargo fmt --all --check` passes.
`cargo clippy --locked --workspace --all-targets -- -D warnings` and
`cargo build --locked --workspace --release` both pass, exit0;
`/tmp/sdk-native-clippy-candidate-20261101.log` and
`/tmp/sdk-native-release-candidate-20261101.log`. Final CI remains pending.

## Follow-up: borrowed identity parameters and32KiB private pages

The7dbdc8f Linux CI is terminal RED:
[run41300338471](https://github.com/liuhui-code/arkts-language-server/actions/runs/41300338471).
Windows installation succeeds and fmt/Clippy/workspace tests pass; the original
strict native gate takes**3.078227705s**, exit101. Node checks intentionally
have not started under the new fail-fast order. Raw log:
`/tmp/sdk-ci-7dbdc8f-raw-job-20261101.log`. Separately the7dbdc8f release
binary plus unchanged SDK sources pass all13 installed API24 cases, exit0,
zero skipped/cancelled/todo,115531ms;
`/tmp/sdk-native-candidate-real-sdk-20261101.log`.

Parent for the next slice: `7dbdc8fafdfdc05d75eb5343f8febbb49a20b97f`.
Before editing, the public allocation/reopen/reference-parity characterization
passes with4290 Rust allocations for1362 identities;
`/tmp/sdk-native-identity-borrow-characterization-20261101.log`.
Tighten its public activation budget from3 to1 allocations per identity,
retaining the512 fixed allowance and every exact result/reopen assertion.
RED command: `cargo test --locked -p arkts-index-sqlite --test reference_identity_allocations -- --nocapture`:
4290 allocations exceed1874, exit101;
`/tmp/sdk-native-identity-borrow-red-20261101.log`.

Reuse the existing256-row identity SQL/cached statement and buffering, but bind
borrowed `ToSqlOutput::Borrowed(ValueRef)` views of the immutable document URI,
name and qualifier instead of cloning Strings. SQLite retains its normal
parameter-copy and execution behavior; no unsafe code or shared mutable owner
is introduced. Lifetimes keep original documents alive throughout buffered
execution. Ordinals, deduplication, SQL conflict policy and diagnostic executed/
buffered row checkpoints stay unchanged. GREEN with parity, actual-row-count
and progress contracts:8/8 PASS; allocation count**477**, below1874;
`/tmp/sdk-native-identity-borrow-green-20261101.log`.

The16KiB borrowed-parameter cold gate remains locally RED at4.010539213s.
A32KiB private-page candidate reports3.728532259s, still RED locally;
`/tmp/sdk-native-cold-borrowed-identities{16k,32k}-20261101.log`.
Independent fresh-cache observations report455 ready documents and225630
actual rows for each layout:

| Debug sidecar observation | Private DB bytes | Sidecar peak RSS bytes |
| --- | ---: | ---: |
|7dbdc8f16KiB |89554944 |149450752 |
| Borrowed parameters +32KiB |90079232 |153399296 |

Logs: `/tmp/sdk-native-layout{16k,32k}-20261101.log`. These are single
observations, exclude the Node/compiler process, and are not memory/latency
graduation. Both private files are sealed before publication; an old legacy
WAL can still await background retirement. The32KiB candidate keeps the same
64MiB cache target, disk statement journals, bounded batches, per-batch
checkpoint and final durability policy.

Final focused publication/parity/row/allocation/progress suite:14/14 PASS,
exit0; `/tmp/sdk-native-identity-layout32k-focused-20261101.log`.
Fresh formatting, strict workspace/all-target Clippy and release build pass,
exit0. Logs: `/tmp/sdk-native-identity-layout32k-clippy-20261101.log` and
`/tmp/sdk-native-identity-layout32k-release-20261101.log`. CI validation remains
pending; no local3s PASS is claimed.

## Completed Node follow-up and input-check optimization

The7ac936b whole CI is terminal: **2207/2207 Node cases PASS**,
zero failed/cancelled/skipped/todo,2030483.138339ms. Its later unchanged native
gate fails at5.793662179s, exit101; this is not a Node failure.
[Run41299389154](https://github.com/liuhui-code/arkts-language-server/actions/runs/41299389154),
raw log `/tmp/sdk-ci-7ac936b-raw-job-20261101.log`.

The025b4fd32KiB candidate also fails its Linux native gate at3.748835375s
after regular Rust checks pass; Windows installation passes.
[Run41301197237](https://github.com/liuhui-code/arkts-language-server/actions/runs/41301197237),
raw log `/tmp/sdk-ci-025b4fd-raw-job-20261101.log`. Its actual release sidecar
and SDK source pass all13 installed API24 cases, zero annotations, exit0,
115097.557809ms; `/tmp/sdk-native-layout32k-real-sdk-20261101.log`.
Do not infer a reliable page-size improvement from these independent hosts.
Return to the conservative16KiB setting and retain the proven borrowed-value
allocation reduction. No gate is retried to erase a failure.

Parent for this slice: `025b4fd7eca9f5c66bfaeaa9d984d388fc0f9507`.
Add a real NDJSON characterization that captures130 files, replaces source
bytes after activating while restoring exactly the old byte length and mtime,
and requires degraded status with the old generation and exact old results.
Before optimization it passes1/1;
`/tmp/sdk-native-source-hash-characterization-20261101.log`. Existing full core
characterization passes62/62, including Unicode/CRLF UTF-16 ranges;
`/tmp/sdk-native-line-index-characterization-20261101.log`.

Use the existing four-parser-worker budget for scoped source-check workers
inside each existing64-source checking chunk. Join every worker, fail closed
on read failure/panic, and keep all length/mtime/SHA256 checks, cancellation
boundaries and progress counts. No retained thread pool or new lifetime owner.
ASCII line prefixes have identical byte/UTF-16 lengths; use that direct count
and retain the existing UTF-16 iterator for non-ASCII prefixes.

Public core range, heritage, publication and NDJSON tests pass51/51,1 existing
ignored gate; `/tmp/sdk-native-input-checks-green-20261101.log`. Strict
workspace/all-target Clippy and release build pass, exit0;
`/tmp/sdk-native-input-checks-{clippy,release}-20261101.log`. The original local
strict gate remains RED at3.910756353s;
`/tmp/sdk-native-cold-parallel-checks-ascii-20261101.log`.

To decide retention, snapshot two debug binaries with identical16KiB/borrowed
SQL inputs, varying only these input-check/position changes. Alternate three
fresh-cache pairs on the same host, unchanged pinned455-file fixture, no other
build/test load. Every execution verifies ready455/455,225630 committed rows,
generation1 and all four original deterministic query results.
Observed protocol-receipt timings, not CPU measurements:

| Pair/variant | Total ms | Discover/parse ms | Checking→publishing ms |
| --- | ---: | ---: | ---: |
|1 baseline |4100.467 |914.649 |213.406 |
|1 optimized |3647.430 |598.664 |85.334 |
|2 baseline |3871.653 |709.062 |199.504 |
|2 optimized |3659.198 |613.992 |83.503 |
|3 baseline |3904.643 |729.111 |214.199 |
|3 optimized |3672.642 |607.289 |79.883 |

Log: `/tmp/sdk-native-input-paired-probe-20261101.log`, process exit0.
All six independent catalogs and24 query assertions pass. Retain the scoped
checks and ASCII fast path on this evidence; OS caches remain uncontrolled
and this is not a universal latency/memory graduation or a local3s PASS.
Final release-gate status is tracked by [PR111 checks](https://github.com/liuhui-code/arkts-language-server/pull/111/checks).
