# Open-source presence: public RED/GREEN and Settings replay

Status: **diskless source-presence RED twice; first repair 12/12 and 94/94 GREEN;
later physical-identity-drift RED reproduced; final public 13/13 GREEN;
final focused 95/95 GREEN; Settings 267 exact PASS;
fresh controlled whole-fast 1,062/1,062 GREEN**.
This report records
[the source-presence TDD slice](../tdd/references-open-source-presence.md) after
[project configuration ownership](2026-09-28-settings-project-configuration-ownership.md).

Parent `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`; inherited edits remain preserved.
No reset, commit, push or merge. Production semantic defaults,
SDK/dependency profiles, Worker count/lifetime, memory budgets and normal
diagnostics are unchanged.

## What was reproduced

The existing public `SemanticWorkerEngine` test now adds a target source that
exists only in the managed open-document overlay. It creates tablet's parent
directory, does not write `Target.ets`, asserts disk absence and calls
`engine.sync(target)`. Main Query/Use import `Thing` from `snapshot/Target`.
The selected project remains product default/module alpha/target tablet.

The actual semantic Worker definition correctly resolves the open tablet
declaration at UTF-16 `0:12–0:17`. References from Query `1:18`, declaration
included, complete at documentVersion 1 with the same five exact individual
URI/range tuples. Before repair, Node's external candidate request nevertheless
has **zero source-resolution retries, expected one**. It cannot resolve the
open self-package target because its candidate-stage resolver sees only disk.

Both production REDs preserve the correct final references through conservative
compiler verification. This is a lost eligible source-proof/fallback-cost
defect, **not** a missing-reference reproduction or quantitative memory cause.
The port test uses a real Worker/compiler and external NDJSON fixture, not
framed-LSP certification or real Rust declaration-identity/completeness proof.

| Expected complete result | Zero-based UTF-16 ranges |
| --- | --- |
| tablet `Target.ets` | `0:12–0:17` |
| main `Query.ets` | `0:9–0:14`, `1:18–1:23` |
| main `Use.ets` | `0:9–0:14`, `1:16–1:21` |

Expected source retry is exactly `{bindingUri: Query.uri,
sourceSpecifier: "snapshot/Target", resolvedSourceUri: Target.uri}`;
no `externalTerminalIdentity`. The fixture deliberately uses an unavailable
SDK, so these failures do not demonstrate full-SDK or large-project memory
cost. No files are duplicated to manufacture scale.

## Terminal RED evidence

Raw directory: `.bench/anchor-reuse-2026-09-28/`.

| Log | Terminal verdict | Duration ms |
| --- | --- | ---: |
| `reference-overlay-source-red-1.log` | 0/1 PASS, 1 FAIL | test 3,042.252732; total 3,325.623683 |
| `reference-overlay-source-controls-red-2.log` | 2/3 PASS, diskless case FAIL | total 4,506.184574 |

Second-run controls: disk target 1,567.978970 ms PASS; caller project mutation
1,086.871270 ms PASS; diskless target 1,580.176487 ms FAIL. Both terminal logs
have zero cancellations/skips/todos. Whole-test durations are not navigation
RPC measurements and cannot certify the 500 ms target.

| Raw log | SHA256 |
| --- | --- |
| First diskless RED | `7d69d3deeaf4dfbd1eb14904c9ffcdab71f17086296312529e6512ea4a0756ae` |
| Independent controls/diskless RED | `691d9f933d825b6d5fabb6a06af4c000cb14c26692349d44928cc247dbb45ff9` |
| Initial 12-case GREEN | `1af9389f5b4d8cfb330e1ece814f4bbed1c436298a21919acd7eb9d6dc1bc988` |
| First 94-case focus, before safety repair | `a680a40450c6919ab4dc115020be4690a08dc199064f967a735c428ddecc2335` |
| Additional physical-identity-drift RED | `4641270def1ef3ca8da06d27dd057d8fe0b620e506d8d55e0179b07b7d5954ce` |
| Final public characterization, 13/13 GREEN | `095376add107b721215d19fbddf317737b165bba205d000c850f171a44015ca2` |
| Final 11-file focus, 95/95 GREEN | `d5664d786a829430a1c327010c6ce7f3fb631379b89b1153fa2f4338737035e5` |

Exact historical RED commands use unused-output guards. They ran before the
fix; current evidence files intentionally prevent reexecution/overwrite:

```sh
test ! -e .bench/anchor-reuse-2026-09-28/reference-overlay-source-red-1.log && \
node --test --test-concurrency=1 \
  --test-name-pattern 'unsaved project target absent on disk' \
  tests/semantic-worker-project-snapshot.test.mjs \
  > .bench/anchor-reuse-2026-09-28/reference-overlay-source-red-1.log 2>&1

test ! -e .bench/anchor-reuse-2026-09-28/reference-overlay-source-controls-red-2.log && \
node --test --test-concurrency=1 tests/semantic-worker-project-snapshot.test.mjs \
  > .bench/anchor-reuse-2026-09-28/reference-overlay-source-controls-red-2.log 2>&1
```

The second file then held three cases. The wrapper retained the exit status
while printing the terminal log. Initial 12-case and final 13-case public
characterization use `node --test --test-concurrency=1` with the project file
then `tests/semantic-worker-reference-snapshot.test.mjs`, and their respective
raw output paths above. No success is inferred from a log filename, correct
final count or running gate's interim passing lines.

## Repair boundary

The references operation captures managed open-source presence before its
first candidate await and passes that immutable presence mapping through the
existing local-package resolver callbacks. Physical identity uses realpath;
a genuinely missing source requires lstat ENOENT plus a resolvable parent.
Dangling links/unknown mappings and competing physical aliases fail
conservative for new source proof. Map order is not evidence of effective
alias ownership.

This supplies presence, not all-source absence, semantic declaration identity,
complete overlay/source availability or constructor search coverage. Existing
root/configuration freshness and cancellation barriers remain. No second
parser, index schema, compiler owner or candidate-exclusion policy is added.

Initial public characterization passes **12/12**, total **18,206.324625 ms**,
in `reference-overlay-source-green-pre-extraction.log`. Cohesive extraction
under GREEN moves revision/captured-input ownership into `ReferenceInputState`;
the proxy shrinks **631→614**, remaining migration debt. Snapshot helper
121 lines and project test 219 lines are below the handwritten-file limit.

The first 11-file focus passes **94/94**, total **104,666.430454 ms**, in
`reference-overlay-source-focused.log`. This protects the extraction and
existing package/SDK/target/alias/framed-LSP behavior, but precedes the next
safety repair. The existing diskless relative-import LSP case gains an exact
three-reference assertion without increasing case count. Neither passing run
is final verification of the subsequent source.

## Additional safety RED and repair

The real Worker first resolves an opened `tablet/Alias.ets` symlink to tablet.
During held candidate status, the test retargets the symlink to desktop with
no managed revision event. Expected source-proof retry count is zero. Actual
count is one: the generic package resolver catches the overlay identity
exception, resolves disk fallback and allows indexed acceptance. Compiler
anchor mismatch then protects the final result via conservative verification
with five Locations. Correct final output does not make this proof safe.

`reference-overlay-identity-drift-red.log`: **0/1 PASS**, test 2,117.846303 ms,
total 2,390.786179 ms, zero cancellations/skips/todos. Historical command:

```sh
test ! -e .bench/anchor-reuse-2026-09-28/reference-overlay-identity-drift-red.log && \
node --test --test-concurrency=1 \
  --test-name-pattern 'overlay alias retargeted during candidate selection' \
  tests/semantic-worker-project-snapshot.test.mjs \
  > .bench/anchor-reuse-2026-09-28/reference-overlay-identity-drift-red.log 2>&1
```

The final repair keeps an observed identity-change flag sticky and checks it
after `packageResolver.resolve`, outside its generic catch block. No generic
resolver policy changes. The public test requires zero proof retry plus an
explicit `references.index.fallback`/`index-error` identifying physical drift.
It does not certify every unmanaged filesystem mutation, competing-source
absence, immutable disk contents or complete semantic snapshot admission.

The final public characterization completes **13/13 PASS**, zero
failures/cancellations/skips/todos, exit 0, **22,307.437880 ms** total in
`reference-overlay-source-final-public-green.log`. It includes drift rejection
and the prior project/SDK/query/root/alias revision controls. `pnpm check` and
runtime build pass. These terminal results do not replace broader regression.

The final 11-file focused rerun completes **95/95 PASS**, zero
failures/cancellations/skips/todos, exit 0, **108,196.166700 ms** total in
`reference-overlay-source-final-focused.log`. Unlike the earlier 94-case run,
it verifies the source after the sticky identity guard. The controlled
environment and original test deadlines/assertions are unchanged.

Executed argv below; the historical guarded output was
`reference-overlay-source-final-focused.log`. This copyable rerun chooses a
new log and protects it before executing/redirection:

```sh
test ! -e .bench/anchor-reuse-2026-09-28/reference-overlay-source-final-focused-recheck-1.log && \
test ! -e /private/tmp/arkts-fast-sdk-control-missing-20260927 && \
ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927 \
node --test --test-concurrency=1 \
  tests/semantic-worker-project-snapshot.test.mjs tests/semantic-worker-reference-snapshot.test.mjs \
  tests/semantic/project-sdk-selection.test.mjs tests/semantic/project-module-resources.test.mjs \
  tests/semantic/project-target-membership.test.mjs tests/lsp-production-semantic-worker.test.mjs \
  tests/semantic/references-context-retention.test.mjs tests/semantic/references-candidate-snapshot.test.mjs \
  tests/semantic/references-depth.test.mjs tests/semantic/local-package-resolution.test.mjs \
  tests/test-layer-manifest.test.mjs \
  > .bench/anchor-reuse-2026-09-28/reference-overlay-source-final-focused-recheck-1.log 2>&1
```

## Fresh final-source verification: completed

| Gate | Current status |
| --- | --- |
| Diskless/physical-drift cases plus snapshot controls | 13/13 GREEN, exit 0 |
| Focused snapshot/package/target/alias/framed-LSP regression | 95/95 GREEN, exit 0 |
| Final runtime build and SHA freeze | PASS; frozen below |
| Fixed Settings/API24 constructor replay | 267/267 exact PASS; latency target still RED |
| Fresh controlled `pnpm check:fast` | 1,062/1,062 GREEN, exit 0; separate final-source run |

The preceding source's 1,060/1,060 whole-fast and 267 exact Settings result
(58.636 s, sampled Node maximum 752,300,032 bytes) are a historical baseline
only. They do not certify this new source or a paired performance improvement.
The previous report remains unchanged rather than retroactively replacing its
runtime/evidence boundary.

The final source has proxy 614 lines, captured-input helper 121, public project
test 219, module-resources test 351, source resolution 175 and candidate
selection 257. Proxy remains migration debt; no large-file exception is claimed.

The [new manifest](../../bench/references/manifests/settings-menucontroller-open-source-presence-api24.json)
pins this repair rather than the prior source. SHA256:
`9b8f3b0eb4ee5be576bc21dfdd5cfeb39988277427a03dac2bd3ad6693072a3b`.

| Runtime artifact | Final SHA256 |
| --- | --- |
| Server | `f1401251934e55605787134dc38d394d53be96ea90f98ce7a7a66bf993b5813a` |
| Semantic Worker | `6e236373d7693cd92f1ead0e2436f3125b83dbcf3b276497ef25109c3b742504` |
| Reference verifier Worker | `8cbf70973d55c294371dfbd0ddc0a9ea9771a975c7a86037728dc9faa1edceee` |
| Standard libraries | `ea78beea2aa84f93fe66645465c37eb916028b79cd9fe898d469bdf54efbf97d` |
| Rust sidecar | `f2c967a36ff3918a12357928c497aa006cc31e80a0f515d17b458cf3c832850d` |

## Fixed Settings/API24 replay: complete exact PASS, slow

The replay uses `scripts/bench/replay-references.mjs`, not another LSP runner.
Settings remains clean `ecc550dfaed880e04e38a2477eb7235cd50475b9`, checkout
`/private/tmp/arkts-settings-row-counts.BPJdST/project`. Selected SDK stays
API24/6.1.1.125, not relabelled as matched API23 or DevEco parity. Project
declared compile 23, target/compatible 20 are unchanged.

Target is `common/src/main/ets/core/controller/MenuController.ets`,
`MenuController` constructor, zero-based UTF-16 **90:17**, declaration excluded,
documentVersion 1. The new process runs mode A (references first),
indexed-batched/full SDK/closure/64 roots, trace on, original **180,000 ms**
deadline. Experimental flags are anchor reuse 0, local-export anchor 1 and
conservative semantic units 1; no production default is promoted.

Terminal **PASS**, runner exit 0; **267 expected/observed individual exact
Locations**, errors=[], RPC error null. Transcript confirms
`textDocument/references`, with no workspace/symbol or documentSymbol requests.

| Observation | Completed run |
| --- | --- |
| Harness request start→response | **60,696 ms** |
| Server request.completed | 60,585.46 ms, successful |
| Catalog | 1,846/1,846 files; skipped 1 entry |
| Constructor seed | Rejected: compiler-anchor-mismatch |
| Complete fallback | 1,496 candidates; 14 completed batches |
| Total starts / merge | 15 starts (1 rejected seed + 14 complete); 768 raw→267 unique |
| Automatic diagnostic | Version 1 TS2307 `@ohos.systemparameter`, observed 2,503 ms after response |
| Sampled Node PID 93617 max RSS | **745,988,096 bytes** |
| Sampled server process-tree max RSS | 748,888,064 bytes; not Zed/product PSS |
| Sampler max RSS, separate | 100,376,576 bytes |
| Harness max at timeline observations | 70,311,936 bytes; not continuous peak |
| Sampling | 474 samples, 393 in request; nominal 50 ms, actual min/median/P95/max gaps 127/147/186/541 ms |
| Shutdown | Normal exit 0 |

Normal diagnostics are preserved, not suppressed to improve latency. The
unresolved SDK diagnostic is not DevEco/API23 diagnostic parity. Worker-thread
RSS is not summed with the Node PID; no forced GC or heap snapshot. One
trace-on completed replay cannot certify a memory no-regression, 500 ms or
original >3 GB gate. Differences from the previous 58.636 s run are not
attributed causally to this presence/identity repair.

The 15 terminal verifier events (rejected seed plus complete batches) have
these inclusive sums, milliseconds:

| Field | Sum |
| --- | ---: |
| durationMs | 58,263.660000 |
| workerStartupMs | 4,167.814370 |
| workerProgramReadyMs / workerGetProgramMs | 51,195.341339 / 51,037.770716 |
| workerCreateProgramMs | 42,274.025969 |
| workerGetTypeCheckerMs accessor / workerQueryMs | 0.324080 / 2,002.672091 |

Program-ready/getProgram/createProgram are nested and must not be added.
The checker accessor does not measure full type-state cost; query is not pure
findReferences, and startup includes loading/scheduling/readiness. The largest
observed Program has 2,049 SourceFiles (1,348 project, 649 SDK, 52 other).
Repeated Program preparation remains the dominant measured verifier interval;
64 roots is a packing parameter, not a strict closure-file cap or permission
to omit legitimate dependencies.

[Raw replay JSON](../../.bench/anchor-reuse-2026-09-28/menu-open-source-presence-A-1.json),
SHA256 `b68d30bc6027042663c21e8080086ef894a21856f9adfa19b423a7f9f36d8c31`;
[raw log](../../.bench/anchor-reuse-2026-09-28/menu-open-source-presence-A-1.log),
SHA256 `9c717ddb5897dd57b489ec7d48a16efacf54560896eb41ac6e2ba900a5792049`.
SDK digest is `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`;
oracle SHA256 is `72980d7c79e3baf44ebba8a30094484225aebe08aefd2077cda45cbdc5e90ab3`.

Guarded replay, cwd `/Users/liuhui/Documents/code/arkts-language-server`.
The executed output used A-1 above; the same-input copyable replay uses A-2.
If either output exists, choose two fresh names; guards prevent the replay and
right-hand log redirection from running against retained evidence.

```sh
test ! -e .bench/anchor-reuse-2026-09-28/menu-open-source-presence-A-2.json && \
test ! -e .bench/anchor-reuse-2026-09-28/menu-open-source-presence-A-2.log && \
ARKTS_REFERENCES_ANCHOR_REUSE=0 \
ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=1 \
ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=1 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 90 --character 17 --exclude-declaration \
  --oracle bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-menucontroller-open-source-presence-api24.json \
  --out .bench/anchor-reuse-2026-09-28/menu-open-source-presence-A-2.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace \
  > .bench/anchor-reuse-2026-09-28/menu-open-source-presence-A-2.log 2>&1
```

## Fresh controlled whole-fast: 1,062/1,062 GREEN

The final-source gate runs serially after Settings with the unchanged
controlled absent-SDK environment, original command/deadlines/assertions.
`reference-overlay-source-check-fast.log` completes **1,062 tests / 1,062 PASS /
0 FAIL**, zero cancellations/skips/todos, exit 0, **840,424.405207 ms** total.
Use the terminal aggregate, not passing-line counts or nested test-runner
self-test output. The two added public cases increase the preceding 1,060
aggregate; the strengthened existing LSP case does not add a new case.

[Raw final gate log](../../.bench/anchor-reuse-2026-09-28/reference-overlay-source-check-fast.log),
SHA256 `63e98c81db4d253481ddef879c3420421457338a5fccecf138634711961a9f7e`.
Post-gate server/semantic Worker/verifier/sidecar and lock hashes match the
frozen replay inputs. The integration owner's read-only public replay-input
preflight (`parseArguments`, `validateInputs`, `validateBenchmarkManifest`)
also rechecks the complete standard-library aggregate and SDK declaration
digest against the manifest. It passes without creating replay outputs;
this is captured terminal-tool evidence, not a new persisted raw-log path.

Historical command writes the final gate log above with absence guards.
Copyable same-input rerun uses a fresh guarded name instead:

```sh
test ! -e .bench/anchor-reuse-2026-09-28/reference-overlay-source-check-fast-recheck-1.log && \
test ! -e /private/tmp/arkts-fast-sdk-control-missing-20260927 && \
ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927 \
pnpm check:fast \
  > .bench/anchor-reuse-2026-09-28/reference-overlay-source-check-fast-recheck-1.log 2>&1
```

This controlled integration gate does not certify the independent default-host
SDK environment, all-source availability, native Windows or product performance.

## Scope still open

No 500 ms, original >3 GB/final 50% memory/PSS, native Windows or default-host
SDK graduation is claimed. Complete overlay/source availability, competing
source/alias absence, binding-RPC consumption and compiler-backed constructor
coverage still require their own proof. A successful Settings compatibility
replay alone cannot authorize narrowing or change production defaults.
