# Unchanged-source timeout boundary controls

Status: **isolated conformance 3/3 PASS; bounded boundary control 5/5 PASS;
fresh whole-fast gate INTERRUPTED / not PASS; independent CLI boundary RED**.
These are independent unchanged-source
rechecks, not a performance fix or graduation. The preceding whole gate
remains RED (1,015/1,058 PASS, 43 failures), and its bounded recheck remains
RED (1/6 PASS, five failures including a failed parent). See the preserved
[timeout revalidation report](2026-09-27-settings-timeout-revalidation.md).

Parent `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`; inherited changes remain preserved.
This investigation changes no source, test, deadline, assertion, diagnostic
capability, SDK-selection policy, Worker lifetime/count or memory budget.
No reset, commit, push or merge. CPU-heavy runs are sequential, without
concurrent builds or tests.

## Frozen runtime and environment

| Asset | SHA256 |
| --- | --- |
| Server | `0b9deae87bbea11a53716cbd03493b9fa985b938c0c87a30be0c4668ded69d7a` |
| Semantic Worker | `6e236373d7693cd92f1ead0e2436f3125b83dbcf3b276497ef25109c3b742504` |
| Reference verifier Worker | `8cbf70973d55c294371dfbd0ddc0a9ea9771a975c7a86037728dc9faa1edceee` |
| Sidecar | `f2c967a36ff3918a12357928c497aa006cc31e80a0f515d17b458cf3c832850d` |

Node v26.3.0, Darwin 25.6.0 x64. Both controls use the same fixture
environment, after verifying that the explicit path does not exist:

```sh
test ! -e /private/tmp/arkts-fast-sdk-control-missing-20260927
export ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927
```

This is a controlled existing test environment, not a change to the default
SDK policy or evidence that the default-host integration gate is GREEN.
The real Settings benchmark continues to use its fixed clean checkout and
user-approved API24 SDK; no API23 prerequisite is introduced here.

The read-only 20:42:41 host observation reports `CPU_Speed_Limit=33`,
`CPU_Available_CPUs=12`, `CPU_Scheduler_Limit=100`, with no thermal/performance
warning. Physical RAM is 17,179,869,184 bytes; used swap 5,151.25 MiB of
6,144 MiB. Earlier load readings changed from 11.58/9.03/12.65 to
4.30/7.09/11.17. This establishes observed limiting/host variation, not its
cause, constant speed throughout a run, or a sole explanation of the failures.
No power settings, user processes or app state are changed.

Later persisted probes are separate timestamps, not substituted for that
20:42 observation: [thermal](../../.bench/anchor-reuse-2026-09-27/timeout-current-thermal.txt)
at 20:46:54 reports speed limit **26** (scheduler 100, available CPUs 12), and
[environment](../../.bench/anchor-reuse-2026-09-27/timeout-current-environment.json)
at 20:47:06 reports load 5.90/6.44/10.21. The separate
[memory probe](../../.bench/anchor-reuse-2026-09-27/timeout-current-memory.txt)
reports used swap 5,383 MiB of 6,144 MiB. These are snapshots, not continuous
measurements. Low-power mode was observed disabled for battery and AC;
no cause is assigned to the speed limits.

## Minimum protocol boundary

The conformance failure was response ID **1000**, not a references result:
the public [scenario](../../tests/support/conformance-scenario.mjs) sends
`textDocument/didOpen`, then cold `textDocument/completion` for `this.` at
zero-based UTF-16 **4:9**. It asserts `title` and `save`, then normal exit0.
The original [response waiter](../../tests/support/lsp-process.mjs:295) is
5,000 ms. The basic fixture's discovered membership contains 16 files (a
source/fixture finding, not traced Program cardinality). This
[member-completion path](../../src/semantic/completion-discovery.ts:16)
bypasses export discovery; the observed failure had SDK null/environment/ready:false while
the index was already ready. Full SDK preparation or index-not-ready is
therefore not established as the explanation for this particular failure.

The serial semantic queue and compiler completion remain possible cost
boundaries; default closure/member preparation admits membership. The normal
[diagnostic debounce](../../src/lsp/document-diagnostics.ts:8) is 75 ms.
Neither queue contention nor diagnostics-before-completion is established
by this trace; no response completion event was recorded in the failed cases.

The tests expose their overall durations, not the completion RPC's isolated
latency. Passing in 3–4 s overall does not establish ≤500 ms completion.
The normal diagnostic capability remains enabled.

## Isolated conformance recheck

Command, following the absent-path assertion above:

```sh
node --test --test-concurrency=1 tests/conformance-scenario.test.mjs \
  > .bench/anchor-reuse-2026-09-27/timeout-conformance-isolated-1.log 2>&1
```

Result: **3/3 PASS**, zero failures/cancellations/skips/todos, exit0,
**7,767.185683 ms** total. Counts include the passing parent and two children.

| Test | Whole-test duration |
| --- | ---: |
| Repository bundle | 3,903.618211 ms |
| Repository CLI from external working directory | 3,471.117159 ms |
| Parent | 7,385.940487 ms |

[Raw isolated control](../../.bench/anchor-reuse-2026-09-27/timeout-conformance-isolated-1.log),
SHA256 `61b6fbfd85753b5227319ab78abd4101c091656edb7fa0439757011217a1261f`.
Both original response waiters pass with unchanged source and deadlines;
the preceding failures remain evidence of intermittent behavior.

## Bounded failing-boundary control

The subsequent bounded control retains conformance, exact TS2552 diagnostics
and the held-status catalog budget test. Result: **5/5 PASS**, zero
failures/cancellations/skips/todos, exit0, **11,086.424309 ms** total.

```sh
test ! -e /private/tmp/arkts-fast-sdk-control-missing-20260927 && \
ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927 \
node --test --test-concurrency=1 \
  --test-name-pattern 'runs one production semantic scenario through either repository target|publishes TS2552 for a misspelled ArkUI decorator at its exact UTF-16 range|initial catalog wait budget bounds a held status request' \
  tests/conformance-scenario.test.mjs \
  tests/semantic/arkui-diagnostics-depth.test.mjs \
  tests/semantic/references-initial-catalog.test.mjs \
  > .bench/anchor-reuse-2026-09-27/timeout-boundaries-current-1.log 2>&1
```

| Test | Whole-test duration |
| --- | ---: |
| Repository bundle | 3,003.000905 ms |
| Repository CLI from external working directory | 2,673.470536 ms |
| Conformance parent | 5,685.613159 ms |
| Exact UTF-16 TS2552 diagnostic | 2,397.888594 ms |
| Held-status catalog budget | 2,228.958618 ms |

[Raw bounded control](../../.bench/anchor-reuse-2026-09-27/timeout-boundaries-current-1.log),
SHA256 `f54c07e59f585679323d4ff5369969ed30b5fa8d684526d9168c392bf798687c`.
The parent count is not an additional independent production transcript.

The [catalog test](../../tests/semantic/references-initial-catalog.test.mjs:352)
first verifies a complete references response and **five exact Locations**,
then asserts the entire references RPC is `<2,500 ms`. Its initial catalog
wait setting is 250 ms while the external fixture holds status for 3,000 ms.
Its passing **2,228.958618 ms is whole-test duration**, including setup and
teardown; isolated RPC elapsed time is not printed by this successful test.
Do not label it navigation latency or a 250 ms index-wait measurement.
The earlier 4,653.1/6,309.0 ms failing RPCs already returned five exact
Locations; those were wall-budget failures, not missing-reference evidence.

## Fresh whole-fast gate

The unchanged-source fresh whole gate uses the same verified-absent fixture
environment and runs alone:

```sh
ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927 \
  pnpm check:fast \
  > .bench/anchor-reuse-2026-09-27/timeout-check-fast-current-2.log 2>&1
```

The driver exits 1 after the operator interrupts the verified task-owned test
runner PID 49733 (driver parent 49732), after observing failures. The raw log
ends `Interrupted while running tests/lsp-call-hierarchy.test.mjs`.
No user/app processes are stopped. It records `--print-log-path` timeout,
structured logging/unusable-log-directory failures and call-hierarchy waiters
before interruption. There is **no completed 1,058-test verdict or terminal
summary**, so it is INTERRUPTED / not PASS, not a new whole-gate failure count.

[Raw interrupted whole-fast run](../../.bench/anchor-reuse-2026-09-27/timeout-check-fast-current-2.log),
SHA256 `c262163d4268d7e267c3516471b6d6f7fcd63ef91d5c4b9b09dc43a38521a987`.
Focused passes do not replace the earlier completed RED whole gate. No source
change or dependent implementation phase is promoted on these controls.

## Independent non-LSP CLI boundary

The original [public test](../../tests/logging.test.mjs:12) runs the repository
CLI with `--print-log-path` from the temporary directory, with a **2,000 ms**
`spawnSync` timeout. It asserts exit 0, empty stderr and the exact absolute log
path. It starts neither an LSP session nor a references query.

The independent unchanged-source recheck is **0/1 PASS, one FAIL**, exit 1,
**4,265.276174 ms** total. The failing test duration is 2,178.739148 ms;
`spawnSync ... ETIMEDOUT` yields status null instead of 0. This is an original
deadline violation, not a symbol-resolution/reference result. The deadline
and expected output were not changed.

[Raw isolated CLI test](../../.bench/anchor-reuse-2026-09-27/timeout-cli-print-isolated-1.log),
SHA256 `ae686ed169c6a55471c439788131d4e9ad763e0ad50993c308f439a3169decb9`.
The static entry imports initialize JSON5/LSP/production bootstrap before
checking this flag. The 817,838-byte server bundle does not contain the compiler;
the compiler lives in separate Worker bundles and this flag creates no Worker.
Unnecessary bootstrap evaluation is not evidence that it caused this timeout.
No lazy-bootstrap change or sole-cause conclusion is claimed.

## Rotated startup controls

Three sequential rounds rotate `node-only`, direct bundle and launcher order.
Each retains a 2,000 ms `spawnSync` deadline and records stdout/stderr/status.
All nine terminate normally with their exact expected stdout and empty stderr.

| Target | Round 1 | Round 2 | Round 3 |
| --- | ---: | ---: | ---: |
| Node output-only control | 996.6 ms | 814.5 ms | 747.2 ms |
| Direct bundle `--print-log-path` | 1291.2 ms | 1407.8 ms | 1506.8 ms |
| Repository launcher `--print-log-path` | 1276.8 ms | 1306.6 ms | 1709.1 ms |

[Raw controls](../../.bench/anchor-reuse-2026-09-27/timeout-cli-startup-controls.ndjson),
SHA256 `11c414ef759210ae2955553d40e86b9fb7147822afd6ddd8c5ad1dc2f3afddfe`.
The preceding original CLI test remains RED; three later successful launches
without any code change do not repair it or close the whole gate. The output-only
control involves no server/compiler/SDK. This supports investigating broad
startup overhead but does not assign all added time to the OS.
A [separate thermal snapshot](../../.bench/anchor-reuse-2026-09-27/timeout-cli-thermal.txt)
at20:57:03 reports speed limit22, scheduler74, available CPUs12; no cause inferred.

## Framed cold/warm member completion observation

The existing `LspSession` runs the same Profile source, UTF-16 position4:9 and
real stdio child, with the original 5,000 ms response deadline. Tracing is opt-in;
normal automatic diagnostics stay enabled. This is a diagnostic minimization
fixture, not a replacement for fixed Settings/API24 performance validation.

An initial unprivileged observation times out on response2 after initialize
1,527.5ms; its catalog is degraded. Shutdown marks the unresolved request
superseded. There is no successful cold response or second-query measurement:
[raw output](../../.bench/anchor-reuse-2026-09-27/timeout-member-cold-warm.ndjson),
[stderr](../../.bench/anchor-reuse-2026-09-27/timeout-member-cold-warm.stderr).
Do not call superseded-at-shutdown a completed result or lost-response proof.

The subsequent authorized observation uses a workspace-owned index cache and
returns normally (exit0). Catalog is ready16/16. Both completion responses have
the exact same ordered labels `build`, `save`, `title`, without RPC errors.

| Observation | Measured value |
| --- | ---: |
| First completion, client start to response | 4,298.088962 ms |
| Second identical completion, same process/snapshot | 39.725198 ms |
| Server completion durations | 4,248.51 /31.98 ms |
| Compiler files at both completions | 129:16 project/0 SDK/113 other |
| SDK selection events | One, null/environment/ready:false |
| Automatic diagnostics | Version1, one diagnostic observed |

The observer was prepared to keep an original deadline failure as FAIL while
briefly checking for a late response; **no late wait was needed in this run**.
Diagnostic publication occurs between the two completion events, not before the
first completion. That ordering falsifies diagnostic head-of-line blocking for
this one trace, not all failed runs. The original unprivileged failure is retained;
changed authorization/cache plus host variation prevent a paired causal claim.

[Raw completed observation](../../.bench/anchor-reuse-2026-09-27/timeout-member-late-observation.ndjson),
SHA256 `051a90bb776d60db6bf78269f21405313b638d6a9cd6a34fae99beddc0b4595b`;
[server events](../../.bench/anchor-reuse-2026-09-27/timeout-member-late-logs/server.log),
SHA256 `7c1af0a5b4e94279e40684b2e17ace92a2d47995e97705547b97fec93a920ba4`.
Completion-time Node RSS243,310,592/243,871,744 bytes is instantaneous, not peak.
The warm observation is below500ms on this small fixture only. Cold remains
above500ms; one run, trace overhead and changed cache authorization do not
graduate latency/P95/memory, SDK correctness or Settings compatibility.

## Decision boundary

The controls narrow the observation: the same public response, diagnostic and
catalog boundaries can pass without modifying code or their original budgets.
That does not establish a deterministic SDK/routing defect or eliminate
timeouts under the full workload. The independent non-LSP CLI boundary stays
RED in its preserved run despite later successful startup controls, and a sole
host-load attribution is unproven. The cold/warm trace supports state reuse,
not a new semantic fix or completed full regression gate.
The source-ownership fix from the preceding slice is not credited as the
cause of the recovery.

The fixed Settings 267-location, 98.039 s replay remains separate evidence;
none of these small fixture controls is a new Settings run, ≤500 ms proof,
Windows test, original >3 GB reproduction, or release-memory graduation.
Project configuration ownership, constructor narrowing/source admission,
latency, memory and default-host SDK integration gates remain independent.
