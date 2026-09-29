# Original constructor replay after a CPU100 preflight

Status: **FAIL at the unchanged 30,000ms deadline**, 2026-09-28.
Parent `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`; inherited edits are preserved.
Follows the [OS-wait controls](2026-09-28-constructor-worker-os-wait-control.md).
This is a diagnostic replay, not a source fix, Settings benchmark or gate pass.

## Frozen workload and observation

The original framed-LSP constructor test still has all16 legal files, five
cursors, both declaration policies, four profiles and normal diagnostics.
The actual runtime is Node26.3.0. Batch roots remain1; SDK is explicitly absent
as in this existing fixture. No candidate exclusion, budget, Worker lifetime,
cache/default, diagnostic or request-deadline change is made. The runner only
opens existing logs read-only every250ms so cleanup cannot erase captured FDs.
It enables no preloader, native sampler, RSS sampler, forced GC or heap snapshot.
Bytecode caching is explicitly disabled; inherited diagnostic/cache settings
are rejected. No runtime rebuild occurs.

The [runner](../../.bench/anchor-reuse-2026-09-28/constructor-cpu100-observer.mjs)
uses a new private temporary root and unused artifact directory. Its duration
includes observation/cleanup and is not one LSP request. The environment keeps
the exact original test command and pins; output directories must not be reused.

## Terminal result and client/server distinction

- Start **08:53:54.861UTC**, finish **08:55:45.000UTC**.
- Test **108,755.724499ms**, suite **109,490.652552ms**, wrapper
  **110,107.793113ms**.
- **0 PASS / 1 FAIL**, exit1, zero cancellation/skip/todo.
- Client fails waiting for **response9**, indexed-batched `Direct.ets`,
  public zero-based UTF-16 **1:27**, `includeDeclaration=false`.
- Server PID **94061**, failed-request trace
  `3aa6f00c-8787-4f88-983b-2b6a3c6e3a8b`.

Legacy completes all10 reference requests. Indexed completes its class requests
at **8,225.67 / 5,133.46ms**, then Target constructor requests at
**25,861.58 / 26,466.32ms**. Their original known-reference assertions execute;
this is not the final cross-profile exact set comparison. Direct's definition
also passes the existing same-constructor assertion before the failed request.
Conservative and trace-off profiles, all remaining cursors/policies and final
cross-profile equality are not reached. No deadline is increased to finish them.

The retained FD log extends beyond the client's bounded timeout diagnostic:
all14 retry batches and merge are present, with **10 Locations** and
`request.completed outcome=ok` at **30,155.29ms**. The last retry ends at
**28,729.56ms**, merge at **28,737.64ms** relative to the retry session.
The client still times out at its original30s limit; server completion and
cache-store do not certify client receipt or normalized URI/range equality.
Do not count this as a fifth accepted indexed response or a semantic-diff PASS.
The transport's local timeout removes its waiter; it does not itself send
`$/cancelRequest`. This late completion is not evidence of failed cancellation.

## Phase evidence, not a new root-cause verdict

Catalog is ready16/16. Compiler rejects the proposed class seed and the request
retries the complete16-member legal scope in14 batches after two open documents
are pinned. Completed retry Programs contain **3–6 project files**, **52 standard
library files** and **zero SDK declarations**. This is not stale-index legacy
fallback or a missing catalog.

Across those14 completed retry attempts, reported startup-receipt wall fields
sum to **18,265.31ms**, Program readiness **8,424.94ms** and query fields
**1,086.67ms**. The rejected attempt separately records **1,266.41ms** lifetime,
**849.85ms** startup receipt and **376.65ms** Program readiness. These fields
are overlapping wall observations, not disjoint CPU allocations or pure
`findReferences` measurements. No external RSS/PSS curve was collected and
no memory/speedup claim follows from this one partial run.

The [host snapshots](../../.bench/anchor-reuse-2026-09-28/constructor-cpu100-off-gate-1/host-snapshots.json)
observe CPU speed limit **100%** before the test, **62%** after; swap used
**8,151.00→8,337.25MiB**, on16GiB RAM. Wired pages are
3,599,857→3,611,388 at4KiB. The larger pre/post window is not continuous
sampling and cannot locate the limit change in a specific request. Starting
at100% did not produce a passing run, but does not establish constant CPU100
or exclude host memory/scheduling effects. No user application/helper was
closed and no power/cache setting changed. Do not infer a sole cause.

## Evidence and next gate

- [Environment](../../.bench/anchor-reuse-2026-09-28/constructor-cpu100-off-gate-1/environment.json)
- [Terminal summary](../../.bench/anchor-reuse-2026-09-28/constructor-cpu100-off-gate-1/summary.json)
- [Test output](../../.bench/anchor-reuse-2026-09-28/constructor-cpu100-off-gate-1/test.log)
- [Legacy server log](../../.bench/anchor-reuse-2026-09-28/constructor-cpu100-off-gate-1/legacy.server.log)
- [Indexed server log](../../.bench/anchor-reuse-2026-09-28/constructor-cpu100-off-gate-1/indexed-batched.server.log)

| Artifact | SHA256 |
| --- | --- |
| runner | `e502039d52e6823b164140e6b743b13e6735eeae554941524f91271119c66ae8` |
| environment | `1153dead0bae25a8e639b1fd32aca55bdf0f4091b7007e48758d5b3f3ef3e589` |
| summary | `ef4e338760d7319eafe9d4f66f11fb3593c3513378413ca4b567ee1b0262aae0` |
| test output | `cd23fc64d3988b19606a09fd16cb3f83dc9438609436d5552604ec8a31fa3d3e` |
| legacy log | `3c2b0ea46a91c97aa55e3095eeae8cf880abc09784f80d12ebd34e37aba30655` |
| indexed log | `fea94e4c305774088e2f3713cc4efd3c883a790774de40dc4443f04ba0586074` |

All six original runtime/test pins still match the preceding preflight record.
The original regression and fresh whole-fast remain open. No source patch,
whole-fast/build, commit, push, merge, constructor exclusion or default promotion
is made. A reliable lower-pressure execution environment or a separately proven
source defect is still needed before the next admission slice. Neither a brief
CPU100 reading nor late server success replaces this exit condition. Cold/edit
500ms, original>3GB, final memory/PSS and native Windows remain independent gates.
