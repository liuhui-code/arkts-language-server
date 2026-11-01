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
