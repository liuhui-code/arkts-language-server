# Project configuration ownership: public RED/GREEN

Status: **project-source control GREEN; actual ownership RED reproduced twice;
minimal repair 11/11 GREEN; final focus 61/61 GREEN; Settings 267 exact PASS;
new-source controlled whole-fast 1,060/1,060 GREEN**.
This report follows the restored
[controlled regression gate](2026-09-28-regression-gate-recovery.md) and records
the separate [project ownership TDD](../tdd/references-project-configuration-ownership.md).
The real replay and fresh final-source controlled regression gate complete.

Parent `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`; inherited work remains preserved.
No reset, commit, push or merge. The source fix is limited to capturing
caller-owned project selection; production semantic defaults, SDK/dependency
profiles, Worker lifetime/count, memory budgets and diagnostics stay unchanged.

## What was reproduced

The new public-port test uses an actual semantic Worker/compiler with a
separate NDJSON index fixture. Configure module alpha's tablet target, verify
the Worker resolves the tablet declaration, start references, hold candidate
status, then mutate only the caller's nested selection to desktop. There is
no reconfiguration, source edit or version advance.

Before the fix, Node's subsequent self-package source-proof retry points to
`module/src/desktop/Target.ets`; the Worker still uses
`module/src/tablet/Target.ets`. Both independent actual RED runs fail the exact
proof-URI assertion. Both nevertheless return the correct five exact Locations
through conservative compiler verification. This is split ownership/fallback
cost, **not evidence of missing references or a 5 GB cause**.

Query: main `Query.ets`, zero-based UTF-16 **1:18**, includeDeclaration=true,
documentVersion 1. Expected source proof is `snapshot/Target`→tablet; the
definition and five individual URI/range tuples are asserted, not counts only.
Canonical filesystem URIs use `realpath`, not blanket lowercasing.

The initial fixture-capability RED lacks a source-proof retry because the
fixture did not yet expose the binding. It is preserved as tooling evidence,
not counted as the production defect. The optional external fixture now
accepts only correct tablet proof and withholds support for desktop mismatch;
it is not a real Rust declaration-identity/semantic completeness proof.

## Actual evidence

Raw files are under `.bench/anchor-reuse-2026-09-28/`; test/total durations are
not navigation latency. All terminal runs below have zero cancellations,
skips and todos.

| Raw log | Verdict | Test / total ms |
| --- | --- | ---: |
| `project-source-proof-fixture-red.log` | 0/1 PASS: fixture capability | 2,719.386924 / 2,985.435533 |
| `project-source-proof-control-green.log` | 1/1 PASS: caller unchanged | 1,803.177329 / 2,071.141095 |
| `project-configuration-owner-red.log` | 0/1 PASS: desktop proof mismatch | 2,352.298536 / 2,633.685588 |
| `project-configuration-owner-red-repeat.log` | 0/1 PASS: independent mismatch | 1,957.012100 / 2,229.766845 |
| `project-configuration-owner-green-pre-extraction.log` | 11/11 PASS | total 16,171.029650 |

SHA256:

| Raw log | SHA256 |
| --- | --- |
| Fixture RED | `4246591d7076102290496b3e89821152193a36bc5da079bf93e34af606f07ee9` |
| Control GREEN | `d62c0c9a25cc2b08628cf9219dc643d0b35fedcf8cf63f695c3d4b5342a5d1b8` |
| Actual RED | `9d26b8512685c79fb2e028ab6576231bc443ed6d1604feb83f52e7933f767033` |
| Independent actual RED | `5887f2be97e2ef6024e3802adbe5f00ec61b3ffee97d7f469e28c9342b253c1a` |
| Pre-extraction GREEN | `cc1e0556e9b4134f8331f4a8ecbe9dbf5c17cd6d55f78722f5e6d61f70aa8b9e` |
| Unclassified test-layer RED | `f919d05eeb2f64a96ea9efa61f184338b91cc8628fb19f695550b494a70da211` |
| First focus, 60/61 | `0f71070af654982cb53b8db04865770555e5de8f1151d3fc8f679e6ffbd64f92` |
| Focus recheck, 61/61 | `df171e538e52e56ffcc4a8baae1a7ba64dace58368bf704a353d9bcd036b3f55` |

## Minimal repair / scope

`configureProject` captures `structuredClone(selection)` before changing
revision/cache, then stores, resolves and sends the same owned value. Ordinary
JSON-shaped selection remains distinct from omitted/null/invalid values;
no parsing normalization or catch-to-fallback is introduced. Arbitrary JS
prototypes, getters, nonenumerable fields or non-cloneable inputs are not
compatibility-certified. Clone-failure atomic ordering is visible in code,
not backed by a new public atomic RED in this slice.

After 11-case GREEN, three stateless identity helpers are extracted without
policy changes: helper 31 lines, proxy **658→631** (remaining migration debt),
new project test 178 lines, external fixture 96 lines. No second TypeChecker,
index trust expansion or candidate exclusion is introduced.

## Final focused source verification

`pnpm check` and runtime build pass. New server SHA256:
`4180d15ffa30fd438ca6b85c8c340eebaf7214832d33254ee5ff7fd8e90f65f6`.
Worker/verifier/standard-library/sidecar assets remain unchanged from the
preceding frozen configuration. The old whole-fast recovery artifact is a
prior-source control, not final verification of this new source.

The first post-extraction focus is **60/61 PASS**, despite its
`project-configuration-owner-focused-green.log` name. Its only failure is the
stale inventory expected count (unit-contract 58 versus registered 59), total
57,807.370324 ms.
The new test's separate unclassified-inventory RED is also preserved.
The classification is unit-contract, total entry paths 121; correcting the
exact expected count is not a skipped or weakened semantic test. The identical
61-case rerun completes **61/61 PASS**, zero failures/cancellations/skips/todos,
exit 0, **61,125.749454 ms**. Raw `project-configuration-owner-focused-recheck.log`.
Fresh final-source whole-fast also passes below, separately from the preceding
1,058-case recovery.

Exact focused command:

```sh
test ! -e /private/tmp/arkts-fast-sdk-control-missing-20260927 && \
ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927 \
node --test --test-concurrency=1 \
  tests/semantic-worker-project-snapshot.test.mjs \
  tests/semantic-worker-reference-snapshot.test.mjs \
  tests/semantic/project-sdk-selection.test.mjs tests/semantic/project-module-resources.test.mjs \
  tests/semantic/project-target-membership.test.mjs tests/lsp-production-semantic-worker.test.mjs \
  tests/semantic/references-context-retention.test.mjs tests/semantic/references-candidate-snapshot.test.mjs \
  tests/test-layer-manifest.test.mjs \
  > .bench/anchor-reuse-2026-09-28/project-configuration-owner-focused-recheck.log 2>&1
```

## Fixed Settings/API24: exact PASS, performance still open

The real project stays Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9`,
clean checkout `/private/tmp/arkts-settings-row-counts.BPJdST/project`, selected
API24/6.1.1.125. No API23 prerequisite or silent SDK replacement is added.
The constructor oracle remains 267 individual exact Locations; no new
source-complete admission or narrower constructor coverage is claimed.
The [new manifest](../../bench/references/manifests/settings-menucontroller-project-configuration-ownership-api24.json)
pins server/Worker/verifier/standard-library/sidecar, SDK digest and exact
constructor oracle. Manifest SHA256:
`38c5370fa81b2d8b17570eb6cff58473cfb0cb5ab60ee5a22ed32126c7b0e829`.

The new process replay is **PASS, runner exit 0**, validation.pass=true,
**267 expected / 267 observed exact Locations**, errors=[], RPC error null,
documentVersion 1. The protocol transcript confirms `textDocument/references`;
no `workspace/symbol` or `textDocument/documentSymbol` request was sent.
The original **180,000 ms** deadline is unchanged.

| Observation | Actual completed replay |
| --- | --- |
| Harness request start→response | **58,636 ms** |
| Server request.completed | 58,506.83 ms, successful |
| Index candidate attempt | 60 candidates, committed generation 1; 56 source resolutions |
| Constructor seed | Rejected: compiler-anchor-mismatch, then complete-scope fallback |
| Complete search | 1,496 conservative candidates, **14 completed batches** |
| Total batch starts | 15: one rejected seed plus 14 complete batches |
| Merge | 768 raw→267 unique exact Locations |
| Normal diagnostic | Version 1, TS2307 `@ohos.systemparameter`, observed 2,112 ms after response |
| Sampled target Node PID 80361 max RSS | **752,300,032 bytes** |
| Sampled server process-tree max RSS | 755,515,392 bytes |
| Sampler max RSS, separate | 115,482,624 bytes |
| Harness max at timeline observations | 69,976,064 bytes, not continuous peak sampling |
| External sampling | 487 samples, 404 inside request; nominal 50 ms; actual gap min 123 / median 141 / P95 165 / max 222 ms |
| Shutdown | Normal exit 0 |

Trace is on, SDK profile full, dependency profile closure, batch roots 64.
Experimental flags remain `ARKTS_REFERENCES_ANCHOR_REUSE=0`,
`ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=1`, and
`ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=1`.
The rejected seed does not graduate constructor
identity/narrowing or promote experimental flags to production defaults.
Normal automatic diagnostics are preserved, not suppressed. The unresolved
SDK diagnostic remains compatibility evidence, not API23 or DevEco parity.

[Raw completed replay](../../.bench/anchor-reuse-2026-09-28/menu-project-configuration-owner-A-1.json),
SHA256 `29c868d57aa651af918acdf23fa2bbcc4f92f473fb9cf2c0c766dacca9279b39`;
[raw run log](../../.bench/anchor-reuse-2026-09-28/menu-project-configuration-owner-A-1.log),
SHA256 `dd6a93209283433f16bf99e4bfdfc288af6c7829f74fa1334e0d29e4369db2f3`.
The SDK digest remains
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`;
oracle SHA256 remains
`72980d7c79e3baf44ebba8a30094484225aebe08aefd2077cda45cbdc5e90ab3`.

Guarded replay command, from
`/Users/liuhui/Documents/code/arkts-language-server`. The historical run used
the `A-1` JSON/log names above; this copyable command uses `A-2` and otherwise
retains the executed inputs. Both absence guards must pass before the replay
or its log redirection executes. If either output exists, choose two new names;
the runner also creates JSON exclusively.

```sh
test ! -e .bench/anchor-reuse-2026-09-28/menu-project-configuration-owner-A-2.json && \
test ! -e .bench/anchor-reuse-2026-09-28/menu-project-configuration-owner-A-2.log && \
ARKTS_REFERENCES_ANCHOR_REUSE=0 \
ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=1 \
ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=1 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 90 --character 17 --exclude-declaration \
  --oracle bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-menucontroller-project-configuration-ownership-api24.json \
  --out .bench/anchor-reuse-2026-09-28/menu-project-configuration-owner-A-2.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace \
  > .bench/anchor-reuse-2026-09-28/menu-project-configuration-owner-A-2.log 2>&1
```

58.636 s still fails the user's 500 ms target. One trace-on compatibility
replay is not a matched speedup experiment or a memory no-regression release
distribution; do not attribute elapsed-time differences from yesterday solely
to this configuration clone. Worker-thread RSS is not summed again; tree RSS
is not Zed/product PSS. No GC or heap snapshot is forced.

Cold cost remains compiler preparation. The existing trace has 15 terminal
verifier events (one rejected seed plus 14 completed batches), with these
observed wall-time sums, not an additive CPU decomposition:

| Trace field | Sum ms |
| --- | ---: |
| Verifier `durationMs` | 56,144.580000 |
| `workerStartupMs` | 4,441.778193 |
| `workerProgramReadyMs` | 48,857.803960 |
| `workerGetProgramMs` | 48,706.716222 |
| `workerCreateProgramMs` | 41,148.618602 |
| `workerGetTypeCheckerMs` | 0.328850 |
| `workerQueryMs` | 1,926.357957 |

ProgramReady/GetProgram/CreateProgram are nested measurements: **do not add
them together**. GetTypeChecker is an accessor observation, not the complete
type-checking cost; workerQuery is not pure `findReferences`. Startup includes
module loading/scheduling/ready receipt, not isolated thread-creation CPU.
The largest observed Program has **2,049 SourceFiles**: 1,348 project,
649 SDK and 52 other. Closure is not a strict file-count cap; the 64-root packing
setting cannot exclude required dependencies. The trace supports repeated
Program readiness as the main remaining cold cost, not a claim that the
configuration repair removed it or that fewer legitimate references are safe.

## Fresh controlled whole-fast: GREEN

The new-source `pnpm check:fast` completes normally: **1,060/1,060 PASS**,
zero failures/cancellations/skips/todos, exit 0, **847,100.571762 ms**. Final
aggregate counts are authoritative; nested test-runner self-test child output
and 1,064 passing log lines are not the whole-gate total. The rebuilt
server/Worker/verifier/sidecar SHA256 values match the Settings manifest.

[Actual whole-gate log](../../.bench/anchor-reuse-2026-09-28/project-configuration-owner-check-fast.log),
SHA256 `5e48c0aa9c1d0afce0afd8f68de0ca99a8fb5d0dd4270d02f2a9a8c71391c6c8`.
The original executed command retained the absent SDK-path check, same env,
`pnpm check:fast` and that log path. This guarded rerun changes only the output
name to preserve the completed evidence:

```sh
test ! -e /private/tmp/arkts-fast-sdk-control-missing-20260927 && \
test ! -e .bench/anchor-reuse-2026-09-28/project-configuration-owner-check-fast-recheck-1.log && \
ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927 \
pnpm check:fast \
  > .bench/anchor-reuse-2026-09-28/project-configuration-owner-check-fast-recheck-1.log 2>&1
```

No deadline/assertion changes or parallel heavy verification. The earlier
1,058-case recovery remains prior-source history. Original >3 GB/final memory,
default-host integration, ≤500 ms, DevEco parity and native Windows remain
independent/open; no candidate-admission or production-default promotion.
