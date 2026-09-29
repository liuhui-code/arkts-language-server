# Caller-owned source-availability capture: public boundary and Settings replay

Status: **managed-root ownership, producer, unwatched change and alias public
RED/GREEN recorded; final public 95/95 and framed-LSP 17/17 GREEN; Settings
267 exact PASS; fresh controlled whole-fast 1,092/1,092 GREEN; post-gate
preflight PASS**. This is the companion to
[the capture TDD slice](../tdd/references-source-availability-capture.md), after
[source-availability transport](2026-09-28-settings-source-availability-transport.md).
Parent revision: `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`; inherited work is preserved. No
prior-source result is relabelled as current.

## Authorized change and ownership

The caller/semantic layer, not the workspace index adapter, owns query input
capture: project/SDK selections, open source overlays and managed revisions.
`ReferenceInputState.captureClassBindingInput` creates frozen owned workspace,
query, inputs and `assertCurrent`. It copies caller-supplied requested URIs,
cursor/generation, relevant supplied overlays and project/SDK configuration;
it does not enumerate complete dependencies/ProjectGraph/open-buffer scope.
The existing index port remains responsible for URI rebasing, bounded request
admission, ready/generation checks and protocol validation. Call
`assertCurrent` before IO and before acceptance; its managed/physical checks
are not index-generation admission. Public tests compose independent capture
with that existing NDJSON boundary; there is no new references request/RPC.

Physical source evidence is explicit present/absent/unknown. Missing, legacy,
rejected or absent index metadata cannot prove physical absence. Unknown or
conflicting physical identity must remain fail-conservative. The initial strict
parent policy keeps `Base/index.*` unknown when the `Base` directory is missing;
the test must not manufacture that directory to obtain completeness.

This slice does not let the Rust resolver consume availability, exclude
constructor candidates or change default semantics. Existing SDK profile,
membership, dependency policy, Worker lifecycle, memory budget, diagnostic
capability and complete reference results remain in scope for regression,
not modification. No reset, commit, push or merge is planned.

## Actual first public RED and fixture attempts

Independent caller `ReferenceInputState.capture` records the queried parent
`workspace.rootUri`; a real external NDJSON status response is held. Invoke
`state.changed(nestedRoot)`, release status, then require the captured snapshot
to be stale. Actual `isCurrent(snapshot)` is true, expected false. The queried
root was not registered for nested-root mutation ownership by capture.

The normal terminal first RED is
`availability-capture-root-owner-red.log` under
`.bench/anchor-reuse-2026-09-28/`: **0/1 PASS**, exit 1, test
**1,078.700272 ms**, total **1,218.147332 ms**. This demonstrates a managed
freshness defect, not a missing reference, 5 GB memory reproduction or normal
navigation latency. Its complete historical argv is not retained here;
copyable same-test reruns below are not claimed byte-identical historical argv.

Earlier retained attempts are distinct:

| Log | Actual result and interpretation |
| --- | --- |
| `availability-capture-root-red.log` | Fixture lacks its audit environment; sidecar exit 1 is setup failure, not the semantic RED |
| `availability-capture-root-reproduced-red.log` | Ownership assertion is reproduced, but fixture cleanup hangs; precise SIGTERM of this attempt's child PID 19325 allows exit 1 at 66,825.830426 ms total; not a normal terminal performance sample |

The fixture repair defines esbuild paths and releases/closes the held session
before deleting its directory. The minimal source change registers the first
captured root at revision 0 without calling `changed(root)`.
`availability-capture-root-green.log` completes **1/1 PASS**, exit 0,
**1,112.447462 ms** total. This root repair is not complete source admission.

## Further public producer/physical-change evidence

All logs below are in `.bench/anchor-reuse-2026-09-28/`; their actual retained
hashes are recorded below.

| Log | Actual terminal result | Interpretation |
| --- | --- | --- |
| `availability-capture-producer-red.log` | 0/1 PASS, exit 1; total 1,541.289826 ms | New public capture API is missing |
| `availability-capture-producer-green.log` | Exit 1, not GREEN | Fixture canonical path expectation is wrong (`/var` versus native `/private/var`); no production repair inferred |
| `availability-capture-producer-canonical-green.log` | 1/1 PASS, exit 0; total 1,418.588499 ms | Test expectation corrected through `fs.realpathSync.native`, with unchanged production source for that correction |
| `availability-capture-unwatched-red.log` | 0/1 PASS, exit 1; total 1,657.738335 ms | Required rejection of an unwatched physical change is missing |
| `availability-capture-unwatched-green.log` | 1/1 PASS, exit 0; total 1,138.261634 ms | Capture interface adds default-path physical stat witness revalidation |

The new default-path check applies to the capture API, not to production
references/planner policy. Managed revisions plus best-effort stat witness
revalidation do not constitute an atomic or content-hash filesystem snapshot.
`present` certifies only captured regular-file physical existence or admitted
authoritative overlay presence, not readability, content fingerprint or
semantic validity. Final focused/Settings/whole gates are recorded below.
Rust does not consume the availability field.

The stat witness fences observations only from capture onward. A disk change
before capture but before watcher/index refresh can leave stale SQLite source
metadata at the same numeric generation. Physical `present` plus generation
equality is not current-content admission. A future resolver consumer still
needs independent current-source/index-content validation; unknown or missing
evidence cannot exclude candidates. Supplied open text is owned, but this API
does not read/hash all current on-disk content or certify old persisted facts.

The physical-alias/diskless overlay control adds its own actual RED/GREEN:

| Log | Actual terminal result | Interpretation |
| --- | --- | --- |
| `availability-capture-alias-red.log` | 0/1 PASS, exit 1; total 1,365.388540 ms | Canonical diskless overlay candidate is incorrectly marked absent |
| `availability-capture-alias-green.log` | 1/1 PASS, exit 0; total 1,732.232421 ms | Safe physical candidate/overlay association preserves original overlay URI witness |

Foreign-owner input and duplicate physical overlays are rejected, not silently
selected. The missing parent fixture remains missing; no directory is created
to manufacture complete evidence. The first characterization and corrected
rerun are recorded below.

Test registration has a separate actual RED:
`availability-capture-manifest-red.log`, **0/1 PASS**, exit 1,
**277.661273 ms** total, because the discovered new test has no layer. Its
registration is repaired to `unit-contract`: 122 total entries/60 unit-contract
entries. The first `availability-capture-contracts-green.log` is actually
**14/15 PASS**, total **9,357.887226 ms**: an unrelated sibling fixture omitted
its directory, and existing fail-conservative physical-root policy correctly
rejects that unknown identity as potentially overlapping. Create the real
disjoint sibling control, without changing production root admission.
`availability-capture-contracts-canonical-green.log` then completes **15/15
PASS**, exit 0, **8,892.072497 ms** total (11 capture/four manifest tests).

This 15-case characterization precedes a final cross-host test expectation
update, not a production change. The permission control now prints the actual
`lstat` probe code: EACCES is asserted unknown; ENOENT on a privileged/Windows
host is asserted absent. It does not skip or claim that EACCES was actually
triggered when the host observed ENOENT. The final fresh six-file focus actually
reports EACCES: the denied-access unknown branch is exercised here.

Frozen helper/state/public test/support/external fixture physical line counts
are **147/128/178/73/36**; manifest/manifest test are **246/286**. All changed
source/test files remain below 500. Existing proxy 614-line migration debt is
not changed. The standalone API has no production references/Rust/planner or
new configuration connection.

Frozen touched-file SHA256 values, read without running tests or builds:

| Source/test path | Lines | SHA256 |
| --- | ---: | --- |
| `src/semantic/references/class-binding-input-snapshot.ts` | 147 | `f3bbad8fec31b30a637d7320f292b4fd9c9abb8d46b1775532c432e185afbe3d` |
| `src/semantic/references/reference-input-snapshot.ts` | 128 | `30b399e43a77c350dde16763df2e46ac7f01206bf3faadbd451d4984bf7c613f` |
| `tests/class-binding-input-snapshot.test.mjs` | 178 | `f468eb4ddbfa0afaecbcceab8e3dbaca9e3cc84985dfa4c32ee9ec3d9e2319c5` |
| `tests/support/class-binding-input-fixture.mjs` | 73 | `c2a886f58a456629212bced0d0e211b792a8a6fb2dca74ac7878e036146bf320` |
| `tests/fixtures/index/class-binding-held-status.mjs` | 36 | `89a07cfc02c073f7d447095233de14b5934a6b75829926f519d21df5bc923329` |
| `tests/support/test-layer-manifest.mjs` | 246 | `5a80cd5d5924cef09b9320dd837695cd5ae98d4232b059408ff6bdc00856080a` |
| `tests/test-layer-manifest.test.mjs` | 286 | `837de01d74fec9af8eb47a10cb056b9ada0308765acd852820ebe3209dab46ac` |

## Final public focus, framed LSP and source build

`availability-capture-focus.log` completes **95 tests / 95 PASS / 0 FAIL**,
zero cancellations/skips/todos, exit 0, **50,691.527083 ms** total. This fresh
six-file run includes caller capture, strict existing NDJSON admission,
semantic Worker characterization and test registration. Eleven capture cases
protect caller copies, all eight file/index candidates, diskless canonical
overlays, foreign/duplicate owners, managed nested/configuration changes,
unwatched modification/creation/deletion/root-alias retargeting, unknown object/
parent/permission states and composition with the existing public port.

The separate final-source framed-LSP focus completes **17/17 PASS**, exit 0,
zero failures/cancellations/skips/todos, **18,983.779389 ms** total in
`availability-capture-lsp-focus.log`. It protects global freshness, candidate
snapshots and completed compiler search coverage; it does not add a new LSP
capability or certify capture's production integration.

`pnpm check` and `pnpm build` pass exit 0 in separate current-run logs. No
Rust source is edited here; no new Rust workspace/release-build result is
claimed. The unchanged release sidecar is pinned by the new replay manifest.

Executed focused argv is `node --test --test-concurrency=1` followed by the
six files below; framed-LSP uses the same options with the three files below.
Copyable same-input reruns use fresh guarded outputs rather than overwrite
the retained terminal logs:

```sh
test ! -e .bench/anchor-reuse-2026-09-28/availability-capture-focus-recheck-1.log && \
node --test --test-concurrency=1 \
  tests/class-binding-input-snapshot.test.mjs \
  tests/index-class-binding-discovery.test.mjs \
  tests/semantic-worker-project-snapshot.test.mjs \
  tests/semantic-worker-reference-snapshot.test.mjs \
  tests/semantic-worker-anchor-seed.test.mjs \
  tests/test-layer-manifest.test.mjs \
  > .bench/anchor-reuse-2026-09-28/availability-capture-focus-recheck-1.log 2>&1

test ! -e .bench/anchor-reuse-2026-09-28/availability-capture-lsp-focus-recheck-1.log && \
node --test --test-concurrency=1 \
  tests/lsp-workspace-global-freshness.test.mjs \
  tests/semantic/references-candidate-snapshot.test.mjs \
  tests/semantic/references-batch-search-coverage.test.mjs \
  > .bench/anchor-reuse-2026-09-28/availability-capture-lsp-focus-recheck-1.log 2>&1
```

The actual filtered REDs use the new capture file and patterns `captures
physical availability`, `unwatched source modification` and `canonical
diskless overlay`, with `node --test --test-concurrency=1 --test-name-pattern`.
The registration RED uses `node --test --test-name-pattern 'classifies every
executable' tests/test-layer-manifest.test.mjs`, without the concurrency option.
The first root RED's full historical argv cannot be checked here; the retained
normal-termination assertion log is its evidence. A same-test rerun is:

```sh
test ! -e .bench/anchor-reuse-2026-09-28/availability-capture-root-owner-recheck-1.log && \
node --test --test-concurrency=1 \
  --test-name-pattern 'independently captured parent input' \
  tests/class-binding-input-snapshot.test.mjs \
  > .bench/anchor-reuse-2026-09-28/availability-capture-root-owner-recheck-1.log 2>&1
```

This is a current-source rerun command, not a promise to recreate RED after
the fix or recover byte-identical historical argv.

## Retained terminal log hashes

SHA256 values were read from actual completed files. Names containing `green`
do not change failed exits or certify later source.

| Raw log under `.bench/anchor-reuse-2026-09-28/` | SHA256 |
| --- | --- |
| `availability-capture-root-red.log` | `099c62127a8d100e59a5067216ec5fc832d0645a39f76d13c28ae8e61c1648b5` |
| `availability-capture-root-reproduced-red.log` | `1b242ec8fc6c1d119c0c29d779fea9c7ead9eae24bfe79171d5e1f9b43322578` |
| `availability-capture-root-owner-red.log` | `47695f7e6c5f70e305984d16f4d017f4b9f477c904910f4b9ddf4a7ba5f51ae0` |
| `availability-capture-root-green.log` | `60916bd65c8ce4924f21cba7bb47efb07a150d3fb284e3d5b5cbd52ce3df864e` |
| `availability-capture-producer-red.log` | `5a409211ec9c1522bfe9766a5e7c7f7d4a0a97a1a15c156f8662d370598738ae` |
| `availability-capture-producer-green.log` | `4c164dc6a4b26eb41f86d09f6f71d85d1dd2d88d221915bfabdae82e25222d77` |
| `availability-capture-producer-canonical-green.log` | `c6628f413fbdc7fc01dea125a71dbbb20654b9efab63b3995c46d0a152488cb0` |
| `availability-capture-unwatched-red.log` | `07755533a8152bbb7306ebde3f8599a543a14560188442891d92b034d585ee4b` |
| `availability-capture-unwatched-green.log` | `a8ea5a808b1783e86684e58b5395a275a0b106a2e75579fa8f80b3d8bf3c73f3` |
| `availability-capture-alias-red.log` | `799910d6ad869844e629f90a8e6af62d777c42466703c4d4cf87ece8f13b4ba6` |
| `availability-capture-alias-green.log` | `ae2bb51fe3ec7a8594af391d767485700bf5927b5c647b0a0deb3e173d47ff74` |
| `availability-capture-manifest-red.log` | `ac704104c0cb49cedf75fa9126f75e2b258b539bb674e824914f4d0a0f48358d` |
| `availability-capture-contracts-green.log` | `5c60350cda8274453f07e6091e667ba28451eadef453da0a2cc9135c52f96c1f` |
| `availability-capture-contracts-canonical-green.log` | `859ccf9bc346b62e704e8d3594425356ff45b5c0d281f1958e665338587bd14f` |
| `availability-capture-focus.log` | `59ba4bfdce98b632b9131841fd89a1fc51c1c7a7857c6d0e31988e185b543c6c` |
| `availability-capture-lsp-focus.log` | `1c47e05e9e92a1c1247f6be6b500fec05cce9b6ebf2d93d9e75c30ec1cca538c` |
| `availability-capture-typecheck.log` | `0f33afb9bc55ff3407f23f9a2f9066c6c884865b57432d5b37169f680102fae8` |
| `availability-capture-build.log` | `2c50d348fda9d12e58236f2c97b35395ed26c0d2530db5b203ec109fb626d594` |
| `availability-capture-check-fast.log` | `023230f20fabb46700eea6edd4619b4f5ced84d10ace112649f0af15139f160d` |
| `availability-capture-post-gate-preflight.log` | `bd4e73c4bcc77d56ebc528101803cc8f50bb6c54f122ed226f32cb33aff612de` |

## Current-run public gates

| Evidence | Status |
| --- | --- |
| Parent revision and preserved dirty worktree | Recorded above |
| Actual public managed-root ownership RED | 0/1 PASS, exit 1; normal terminal evidence retained |
| Minimal root ownership GREEN | 1/1 PASS, exit 0 |
| New availability producer RED/GREEN | Missing API RED; canonical-expectation corrected GREEN 1/1 |
| Unwatched physical change RED/GREEN | Missing exception RED; stat-witness GREEN 1/1 |
| Physical alias / diskless-overlay admission | Incorrect-absent RED, minimal GREEN 1/1 |
| Public manifest registration | RED, repaired; combined characterization 15/15 PASS |
| Capture-to-existing-port composition | Included in current-source 95/95 public focus |
| Managed/unmanaged freshness controls | Included in current-source 95/95 public focus |
| Final source/test physical line counts | Recorded above; all touched source/tests below 500 |
| Typecheck/runtime build | PASS, exit 0 |
| Final focused regression | 95/95 PASS, exit 0 |
| Separate framed-LSP focus | 17/17 PASS, exit 0 |
| Fresh fixed Settings/API24 replay | 267 exact PASS, exit 0; latency target fails |
| Fresh controlled `pnpm check:fast` | 1,092/1,092 PASS, exit 0 |
| Post-gate public frozen-input preflight | PASS, exit 0; no server/output created |

Distinguish public port/NDJSON characterization from real Content-Length
framed LSP behavior. A passing transport fixture does not prove
compiler constructor coverage or a new advertised capability. Preserve actual
RED logs and parent revision before the minimal implementation. Final-source
GREEN is recorded separately from earlier characterization.

## Frozen environment and replay inputs

Use the existing `scripts/bench/replay-references.mjs`, not a second LSP runner.
The approved real-project track is fixed Settings with explicitly selected
API24 compatibility. Do not silently relabel it as API23/DevEco parity or
substitute another project/SDK. The new
[capture manifest](../../bench/references/manifests/settings-menucontroller-source-availability-capture-api24.json)
has SHA256 `e80ba639d97263ad15e22f4c901db4a07106533c9739338c63beff5166f61fa1`.
It identifies clean Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-row-counts.BPJdST/project`, declared compile 23/
target-compatible 20, selected API24/6.1.1.125 and Node v26.3.0. Recorded platform
is Darwin 25.6.0 x64. Launch is
`/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node dist/server.cjs --stdio`,
using the absolute repository server path in the raw environment record.

| Artifact/input | Frozen SHA256 |
| --- | --- |
| `dist/server.cjs` | `ebac64e22a90a8ab0d1171f9b50c9a11272fc705569058dce64abc16515aac36` |
| `dist/semantic-worker.cjs` | `6e236373d7693cd92f1ead0e2436f3125b83dbcf3b276497ef25109c3b742504` |
| `dist/reference-verifier-worker.cjs` | `8cbf70973d55c294371dfbd0ddc0a9ea9771a975c7a86037728dc9faa1edceee` |
| `target/release/arkts-index-sidecar` | `136d363f517baaa82c31336f63fb33d728bd261f90e78e553d54bb8752787255` |
| Standard-library aggregate | `ea78beea2aa84f93fe66645465c37eb916028b79cd9fe898d469bdf54efbf97d` |
| SDK declaration digest | `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4` |
| Exact 267-Location oracle | `72980d7c79e3baf44ebba8a30094484225aebe08aefd2077cda45cbdc5e90ab3` |
| `pnpm-lock.yaml` | `ece84ab0afea7a411c453aac7371f0e47381455c5e3cc03f639adff9d2bf1131` |

The server artifact changes; Worker/sidecar/library/lock inputs remain pinned,
not relabelled as a fresh Rust build. Post-whole public frozen-input revalidation
passes with the same pins and seven source/test fingerprints. The original
replay timeout and automatic diagnostics remain unchanged. No
forced GC or heap snapshot is used.

## Fresh Settings/API24: 267 exact PASS, slow

Query is `common/src/main/ets/core/controller/MenuController.ets`,
`MenuController` constructor at zero-based UTF-16 **90:17**, declaration
excluded, documentVersion 1. A fresh process runs mode A (references first),
indexed-batched/full SDK/closure/64 roots, trace on, idle 1,000 ms and the
original **180,000 ms** deadline. Experimental flags remain anchor reuse 0,
local-export anchor 1 and conservative semantic units 1; no default is promoted.

Runner **PASS**, exit 0: 267 expected/observed individual exact Locations,
validation pass true/errors=[], references error null, failure null. Independent
URI→workspace-relative case-preserving tuple normalization finds **0 missing,
0 extra, 0 duplicates**. The transcript method is `textDocument/references`;
methods are initialize/initialized/didOpen/references/shutdown/exit, with no
workspace/symbol or documentSymbol substitute.

| Observation | Completed current-source replay |
| --- | --- |
| Harness references start→response | **60,533 ms**, epochs 1,790,566,057,693→1,790,566,118,226 |
| Server request.completed | 60,436.27 ms, successful |
| Catalog | 1,846/1,846 files; 1 skipped entry; ready/complete generation |
| Constructor seed | Rejected compiler-anchor-mismatch; 60 candidates/1 attempt |
| Complete fallback | 1,496 candidates/14 completed conservative batches |
| Attempts/merge | 15 terminal attempts; 768 raw→267 unique Locations |
| Normal diagnostic | Version 1 TS2307 `@ohos.systemparameter`, range 19:28–19:51; 2,238 ms after response, after idle and before close |
| Target Node PID 24853 sampled max RSS | **763,441,152 bytes** |
| Server-tree sampled max RSS | 766,730,240 bytes; not Zed/product PSS |
| Sampler PID 24854 sampled max RSS, separate | 119,451,648 bytes |
| Harness maximum at timeline observations | 71,168,000 bytes; not continuous peak |
| Samples | 437 total/363 in RPC; nominal 50 ms, actual min/median/P95/max gaps 136/159/203/485 ms |
| Shutdown | Null result; exit 0, null signal/failure |

The unresolved API24 import diagnostic does not certify API23/DevEco diagnostic
parity. Worker-thread RSS is not summed again with the target Node PID. A
single trace-on compatibility replay is not paired speedup, causal capture-cost
measurement, memory no-regression/P95 or a 500 ms/original >3 GB/PSS gate.

Inclusive sums over the 15 terminal verifier attempts, milliseconds:

| Phase field | Sum |
| --- | ---: |
| durationMs | 58,179.720000 |
| workerStartupMs | 4,441.584873 |
| workerProgramReadyMs / workerGetProgramMs | 50,600.237959 / 50,435.274606 |
| workerCreateProgramMs | 42,184.504307 |
| workerGetTypeCheckerMs accessor / workerQueryMs | 0.344057 / 2,144.221301 |

Preparation intervals are nested, not additive/exclusive CPU measurements.
The checker accessor is not full type-state cost; query is not pure
findReferences; startup includes loading/scheduling/readiness. Maximum Program
is 2,049 SourceFiles (1,348 project/649 SDK/52 other), unchanged complete-scope
fallback rather than constructor narrowing. Packing 64 roots does not impose
a strict dependency-closure file cap.

[Raw replay JSON](../../.bench/anchor-reuse-2026-09-28/menu-source-availability-capture-A-1.json)
SHA256 `478041242970881effddabe14b1fa20aa8c06fe4a889d4c05a99d267f335bc8a`;
[raw replay log](../../.bench/anchor-reuse-2026-09-28/menu-source-availability-capture-A-1.log)
SHA256 `fc4b01745815fe759001675bc5af7eac7a1b15e96e110923c9e9cce3a5862e5d`.

Executed replay uses guarded A-1 outputs above with the same options. A
copyable same-input rerun chooses unused A-2 names; these guards protect both
replay output and right-hand log redirection from overwriting retained evidence:

```sh
test ! -e .bench/anchor-reuse-2026-09-28/menu-source-availability-capture-A-2.json && \
test ! -e .bench/anchor-reuse-2026-09-28/menu-source-availability-capture-A-2.log && \
ARKTS_REFERENCES_ANCHOR_REUSE=0 \
ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=1 \
ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=1 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 90 --character 17 --exclude-declaration \
  --oracle bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-menucontroller-source-availability-capture-api24.json \
  --out .bench/anchor-reuse-2026-09-28/menu-source-availability-capture-A-2.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace \
  > .bench/anchor-reuse-2026-09-28/menu-source-availability-capture-A-2.log 2>&1
```

## Fresh controlled whole-fast: 1,092/1,092 GREEN

After Settings exits, `pnpm check:fast` runs serially with the verified absent
SDK path `/private/tmp/arkts-fast-sdk-control-missing-20260927`, unchanged
assertions and deadlines. Terminal result is **1,092 tests / 1,092 PASS / 0 FAIL**,
zero cancellations/skips/todos, exit 0, **864,280.234491 ms** total. This is the
final-source terminal aggregate, not interim lines or the preceding 1,081-case
source's gate.

[Retained whole-fast log](../../.bench/anchor-reuse-2026-09-28/availability-capture-check-fast.log),
SHA256 `023230f20fabb46700eea6edd4619b4f5ced84d10ace112649f0af15139f160d`.
Copyable same-input rerun uses a new guarded name:

```sh
test ! -e .bench/anchor-reuse-2026-09-28/availability-capture-check-fast-recheck-1.log && \
test ! -e /private/tmp/arkts-fast-sdk-control-missing-20260927 && \
ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927 \
pnpm check:fast \
  > .bench/anchor-reuse-2026-09-28/availability-capture-check-fast-recheck-1.log 2>&1
```

The controlled integration gate does **not** certify the independent
default-host SDK environment. It does not disable SDK/diagnostics in the fixed
Settings run or graduate 500 ms, Windows or release memory targets.

## Post-gate public frozen-input preflight: PASS

The read-only preflight completes exit 0 through `parseArguments`,
`validateInputs` and awaited `validateBenchmarkManifest`, plus HEAD, lock and
seven source/test fingerprint assertions. Fixed project, SDK declaration
digest, full standard-library aggregate, oracle, manifest, server, semantic
Worker, verifier Worker and release sidecar still match the frozen replay.
The retained output reports `outputExists=false` and `serverLaunched=false`;
no server starts and no unused replay output is created.

[Retained preflight log](../../.bench/anchor-reuse-2026-09-28/availability-capture-post-gate-preflight.log),
SHA256 `bd4e73c4bcc77d56ebc528101803cc8f50bb6c54f122ed226f32cb33aff612de`.
Unlike the preceding transport preflight's tool-only evidence, this run has an
actual persisted log; the path is not invented or a second replay artifact.

## Prior evidence and open gates

The previous transport source passed 1,081/1,081 controlled whole-fast and
returned 267 exact Settings Locations in 58.759 s, with sampled Node maximum
738,242,560 bytes. These remain prior-source history; they cannot certify the
new capture implementation or its runtime artifacts.

Focused, fixed replay, fresh whole-fast and post-gate frozen-input revalidation
all pass above. The
separate default-host SDK environment is not certified by a controlled absent-
SDK test suite. Caller capture does not graduate complete constructor search,
availability consumption, binding-RPC planning, 500 ms cold/edit performance,
the original >3 GB reproduction, final memory/PSS or native Windows testing.

After this slice's regression gate is terminal GREEN, a later independent
resolver-consumption slice still needs public RED/GREEN and constructor exact
compiler coverage before any candidate exclusion. Do not advance that dependent
implementation or alter correctness gates merely because capture is available.
