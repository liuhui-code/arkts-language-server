# Unchanged-source regression gate recovery

Status: **original timeout boundaries 6/6 PASS; controlled whole-fast gate
restored: 1,058/1,058 PASS, exit 0**.
This is chronological unchanged-source revalidation, not an implemented timeout
fix or performance graduation. The preceding completed whole gate was
**1,015/1,058 PASS, 43 FAIL**; its later interrupted attempt is not a completed
gate verdict. Both histories remain preserved in the
[timeout revalidation](2026-09-27-settings-timeout-revalidation.md) and
[boundary controls](2026-09-27-settings-timeout-boundary-controls.md) reports.

Parent `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`. Existing changes remain preserved.
This segment makes no source or test changes, raises no deadline, weakens no
assertion and changes no SDK policy, diagnostic capability, memory budget,
Worker count or Worker lifecycle. CPU-heavy verification runs serially;
report preparation is read-only except this report. No reset, commit, push or
merge is performed.

## Frozen runtime

| Asset | SHA256 |
| --- | --- |
| Server | `0b9deae87bbea11a53716cbd03493b9fa985b938c0c87a30be0c4668ded69d7a` |
| Semantic Worker | `6e236373d7693cd92f1ead0e2436f3125b83dbcf3b276497ef25109c3b742504` |
| Reference verifier Worker | `8cbf70973d55c294371dfbd0ddc0a9ea9771a975c7a86037728dc9faa1edceee` |
| Sidecar | `f2c967a36ff3918a12357928c497aa006cc31e80a0f515d17b458cf3c832850d` |

The controlled fixture environment and original test deadlines are retained.
`ARKLINE_HARMONY_SDK_PATH` points to the same verified-absent
`/private/tmp/arkts-fast-sdk-control-missing-20260927` path as yesterday.
Both commands use authorized normal test-process/cache permissions; this does
not change production capabilities or defaults.
This is not the default-host SDK integration gate. Settings remains the fixed
real-project target with the user-approved API24 compatibility configuration;
no API23 prerequisite is added.

## Original failing-boundary control

The six-test control passes **6/6**, zero failures/cancellations/skips/todos,
exit 0, **5,986.007729 ms** total. It retains the original production bundle
and repository CLI conformance, non-LSP log-path command, exact-range TS2552
diagnostic and held-status catalog budget tests.

```sh
test ! -e /private/tmp/arkts-fast-sdk-control-missing-20260927 && \
ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927 \
node --test --test-concurrency=1 \
  --test-name-pattern 'prints the absolute language-server log path without starting LSP|runs one production semantic scenario through either repository target|publishes TS2552 for a misspelled ArkUI decorator at its exact UTF-16 range|initial catalog wait budget bounds a held status request' \
  tests/logging.test.mjs tests/conformance-scenario.test.mjs \
  tests/semantic/arkui-diagnostics-depth.test.mjs \
  tests/semantic/references-initial-catalog.test.mjs \
  > .bench/anchor-reuse-2026-09-28/timeout-boundaries-original-1.log 2>&1
```

| Test | Whole-test duration |
| --- | ---: |
| Repository bundle completion transcript | 1,607.927164 ms |
| Repository CLI from external working directory | 1,341.226537 ms |
| Conformance parent | 2,955.558195 ms |
| Non-LSP `--print-log-path` | 142.746700 ms |
| Exact UTF-16 TS2552 diagnostic | 1,217.082847 ms |
| Held-status catalog budget | 1,158.999379 ms |

The conformance parent is part of the count, not an additional independent
protocol transcript. The conformance scenario still sends cold
`textDocument/completion` after `didOpen` at UTF-16 **4:9** for `this.`, then
requires `title` and `save` and normal exit. Its original response waiter is
5,000 ms. The CLI log-path test keeps its original 2,000 ms `spawnSync` budget,
exact absolute stdout and empty stderr assertion.

The catalog test still requires a complete references response and five exact
Locations before asserting the **entire references RPC** is `<2,500 ms`.
The passing 1,158.999379 ms above is the whole test (including setup/teardown),
not a printed isolated RPC latency or a measurement of the 250 ms initial
index wait. Normal automatic diagnostics remain enabled.

[Raw six-test control](../../.bench/anchor-reuse-2026-09-28/timeout-boundaries-original-1.log),
SHA256 `00c6ec98b5573ff610e4de8ada095201a5a0361610b70ba28db31d0aa49f4369`.
This recovers these selected original public boundaries with unchanged inputs;
it does not retroactively relabel yesterday's CLI, diagnostic or catalog
failures, nor replace the whole regression gate.

## Read-only early-run host snapshots

The `*-before-whole` filenames are artifact labels, not strict chronology:
these persisted probes ran immediately **after launching** the whole gate.
An earlier 08:18:11 tool-return-only observation reported CPU speed limit 100
and used swap 5,313.25 MiB; no persisted raw artifact is claimed for it.

At **2026-09-28 08:23:26 +0800**, the
[thermal observation](../../.bench/anchor-reuse-2026-09-28/thermal-before-whole.txt)
reports no recorded thermal/performance warning, `CPU_Scheduler_Limit=100`,
`CPU_Available_CPUs=12`, and **`CPU_Speed_Limit=100`**. This differs from
yesterday's observed limits of 22–33, but is not continuous instrumentation,
does not prove a constant run speed and cannot establish a sole cause.

The [memory snapshot](../../.bench/anchor-reuse-2026-09-28/memory-before-whole.txt)
reports physical RAM **17,179,869,184 bytes**, swap total 6,144 MiB / used
**5,509.50 MiB**. Swap is still materially occupied; CPU100 does not imply all
host constraints disappeared.

The [environment record](../../.bench/anchor-reuse-2026-09-28/environment-before-whole.json)
at `2026-09-28T00:23:26.833Z` identifies Node v26.3.0, Darwin 25.6.0 x64,
Intel Core i7-9750H, 12 logical CPUs, with load **3.67/3.15/2.82**.
No power configuration or user/app process state is changed.

## Fresh whole-fast gate

```sh
test ! -e /private/tmp/arkts-fast-sdk-control-missing-20260927 && \
ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927 \
pnpm check:fast \
  > .bench/anchor-reuse-2026-09-28/check-fast-original-1.log 2>&1
```

The unchanged-source original `pnpm check:fast` gate completed normally:
**1,058 tests, 1,058 PASS, 0 FAIL**, zero cancellations/skips/todos, exit 0.
Node test duration is **849,236.790463 ms** (about 14.15 minutes). The rebuild
preserves every runtime asset hash in the table above. Original thresholds,
assertions and source remain unchanged throughout this recovery segment;
there were no concurrent CPU-heavy tests or builds.

[Whole-gate raw log](../../.bench/anchor-reuse-2026-09-28/check-fast-original-1.log),
SHA256 `c052fde99cc04cb88476a20f447789a37be90cab6080a240ff531dc650610bda`.
This restores the **controlled fast regression gate**, not default-host SDK
integration or a product performance gate. It allows the next separate public
RED/GREEN slice to begin, but does not itself implement project configuration
ownership, constructor/source admission or candidate narrowing. This report
ends at gate recovery and contains no future slice's repair evidence.

## Gate boundaries

| Gate | Evidence in this segment |
| --- | --- |
| Selected original timeout boundaries | GREEN: 6/6, original deadlines/assertions |
| Controlled whole-fast regression | GREEN: 1,058/1,058, unchanged source and runtime hashes |
| Default-host SDK integration | Not revalidated by the controlled fixture environment |
| Settings ≤500 ms / original >3 GB / release memory | Not graduated; no new Settings replay in this segment |
| Native Windows end-to-end | Not performed |

Whole-test durations are not navigation latency samples. Passing these small
fixtures does not prove Settings completion/references ≤500 ms, a memory
no-regression comparison, resolution of the observed 5 GB issue or native
Windows behavior. No newly implemented fix or sole-cause conclusion follows
from host recovery observations.
