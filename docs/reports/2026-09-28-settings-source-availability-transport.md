# Source-availability transport: public admission and Settings replay

Status: **five actual public REDs; Node transport/admission GREEN; strict Rust
protocol 13/13 and final combined public 98/98 GREEN; Settings 267 exact PASS;
fresh controlled whole-fast 1,081/1,081 GREEN; post-gate preflight PASS**.
This report records
[the transport/admission TDD slice](../tdd/references-source-availability-transport.md)
after [captured open-source presence](2026-09-28-settings-open-source-presence.md).

Parent `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`; inherited work is preserved. No reset,
commit, push or merge. No production references consumer, constructor candidate
exclusion, default/SDK/dependency policy, Worker lifecycle, memory budget or
diagnostic capability changes.

## Transport and admission boundary

The public Node `resolveClassBaseBinding` query gains optional
`sourceAvailability: { uri, state: "present" | "absent" | "unknown" }[]`.
Node captures/rebases the values before asynchronous discovery. The caller
owns source evidence and workspace/configuration/document freshness fences.
Transport admission does not probe disk, establish physical identity or verify
whether an asserted absence is true.

Omitted, empty and partial evidence supplies no absence for missing entries.
Missing, legacy and rejected index facts remain unknown. Unknown entries,
including those overlapping open overlays, are preserved. Explicit absent
evidence overlapping an overlay is contradictory and rejected. Evidence must
be a dense array of objects with strict string states, unique canonical URIs,
requested membership and at most the existing 128-document bound.

Invalid Node input produces zero discovery IO and leaves the session usable.
The real Rust NDJSON endpoint rejects malformed admission before snapshot/store
access. Existing workspace identity, generation/readiness, URI and overlay byte
bounds remain. The Rust resolver does not receive this new field; valid values
do not change its existing semantics or persist any availability.
An admitted absent entry without a supplied overlay can still return the
existing persisted explicit binding, which does not certify current presence.
Only absent evidence conflicting with a supplied overlay is rejected.

The extensionless fixture covers `Child.ets → ./Base` and all eight candidates:
`Base.ets`, `Base.ts`, `Base.d.ets`, `Base.d.ts`, `Base/index.ets`,
`Base/index.ts`, `Base/index.d.ets`, `Base/index.d.ts`. Even a complete supplied
array with one diskless open base and all alternatives marked absent remains
unknown. This slice admits evidence; resolution and compiler-backed constructor
coverage require later independent proof.

## Actual public RED evidence

Raw directory: `.bench/anchor-reuse-2026-09-28/`. Node exercises the real public
adapter through an external NDJSON audit. Rust tests spawn the real endpoint;
these are public protocol tests, not private-helper or framed-LSP certification.

| Raw log | Reproduced failure | Terminal result / duration |
| --- | --- | --- |
| `source-availability-port-red.log` | Outgoing availability is undefined, expected nine rebased entries | 0/1 PASS, exit 1; test 2,140.546689 ms / total 2,327.629101 ms |
| `source-availability-admission-red.log` | String state `missing` accepted, public rejection absent | 0/1 PASS, exit 1; test 1,338.430704 ms / total 1,532.393691 ms |
| `source-availability-rust-red.log` | Absent/open-overlay conflict returns successful unknown | 0/1 PASS, exit 101; test 0.82 s / wall 5.62 s |
| `source-availability-rust-enum-red.log` | Object state `{present:null}` returns resolved | 0/1 PASS, exit 101; test 0.61 s / wall 6.18 s |
| `source-availability-rust-entry-shape-red.log` | Positional `[uri,"present"]` entry returns resolved | 0/1 PASS, exit 101; test 0.60 s / wall 5.35 s |

Node terminal aggregates have zero cancellations/skips/todos. Rust REDs have
zero ignored tests; filtered counts reflect one focused test. Whole-test and
wall durations are not references RPC latency or a 500 ms product result.
These reproduce transport/admission failures, not missing final references,
a Windows path-case defect or a quantitative 5 GB memory cause.

Historical Node REDs use `node --test --test-concurrency=1` against
`tests/index-class-binding-discovery.test.mjs`, filtered to
`transports captured availability` and `rejects invalid source availability`.
The TDD record retains the guarded commands. Rust RED commands are:

```sh
cargo test -p arkts-index-sidecar --test class_binding_protocol \
  an_overlay_reported_absent_by_source_availability_is_rejected \
  -- --exact --test-threads=1

cargo test -p arkts-index-sidecar --test class_binding_protocol \
  malformed_duplicate_or_foreign_source_availability_is_rejected \
  -- --exact --test-threads=1
```

Rust commands are timed with `/usr/bin/time -p` and run before their repairs.
Historical output guards preserve the retained evidence files; current raw
paths must not be reused or overwritten.

## Incremental GREEN and controls

| Raw log | Terminal checkpoint | Duration |
| --- | --- | --- |
| `source-availability-port-first-green.log` | Minimal Node field transfer 1/1 PASS | total 1,859.080612 ms |
| `source-availability-admission-first-green.log` | Node transport plus initial strict admission 2/2 PASS | total 3,101.961599 ms |
| `source-availability-port-controls-green.log` | Public adapter characterization 63/63 PASS | total 21,846.404379 ms |
| `source-availability-boundary-characterization.log` | 128-entry/caller-mutation characterization 1/1 PASS, exit 0 | test 1,975.401336 ms / total 2,147.056982 ms |
| `source-availability-rust-first-green.log` | Initial absent-overlay admission repair 1/1 PASS | test 1.09 s / wall 5.66 s |
| `source-availability-rust-final-green.log` | Intermediate protocol 13/13 PASS, before shape REDs | test 1.67 s / wall 6.11 s |
| `source-availability-rust-strict-final-green.log` | Strict object/string protocol checkpoint 13/13 PASS | test 2.36 s / wall 6.29 s |
| `source-availability-typecheck.log` | `pnpm check` GREEN | no test or RPC duration claimed |

The 63-case Node characterization uses the preceding release binary and
precedes the final Rust decoder/release rebuild. Its diskless/unknown/unindexed
controls cannot certify new Rust admission. The maximum-boundary test then
captures 128 entries before the caller mutates the first state, array and
requested set; the wire still receives the original complete bounded input.

Final Node source adds object-state and missing-state negative controls.
The strict Rust protocol checkpoint validates object entries and string states
after reproducing Serde's permissive enum and sequence representations. It
retains explicit-extension binding, optional/empty/partial/unknown evidence,
unknown-overlay behavior and conservative extensionless results. A valid
request after invalid inputs proves that the protocol session remains usable.

The initial typecheck exposes object-property enum widening. An explicit
callback result type preserves already-validated values without a cast or
behavior change. The failed typecheck exists only in terminal tool output;
no persisted failure-log path is invented.

At the Node freeze, contract/helper/public test are **49/154/393** physical
lines; final Rust discovery/protocol files are **188/449**. All are below 500;
no oversized parent is touched here.

## Retained evidence hashes

SHA256 values below were read from the completed retained logs. A filename
containing `final` does not by itself certify the final source or combined gate.

| Raw log | SHA256 |
| --- | --- |
| `source-availability-port-red.log` | `8a0a23d402408799b9f080c30aadf4363dd3d4f58f6a972904ffbc762b506e6e` |
| `source-availability-admission-red.log` | `9ed512c0e3ba46be6f7f002995f098a68c6a5f1b1f985f6de88313795a662c28` |
| `source-availability-rust-red.log` | `7f63a71330fbe1958c2cb5e32dd3fad74e257e8f87bff03a1aab99b090836bb4` |
| `source-availability-rust-enum-red.log` | `11f45cbb59aed534c3ed51cf5a19af11018d75da092ef596ccc7843044ac0b32` |
| `source-availability-rust-entry-shape-red.log` | `08c939aee45e262496e5bf4cf901057f54c451d797e96bc4ef398972fca76198` |
| `source-availability-port-first-green.log` | `b1df6d9b02351fff8990627bb335df554b1086f2a6a566c9590e42efa6da7cde` |
| `source-availability-admission-first-green.log` | `00541588cb862c64114046ca8e67716e298d8bfaccc999d1397092e0a3538b39` |
| `source-availability-port-controls-green.log` | `5ad058b96ad885763bb1a5bed16a383f4aad015b32f1e5c62337d150a09007c9` |
| `source-availability-boundary-characterization.log` | `106948b1e850bda432d3083ffdce77df334107303d51776e4bfa1d30e3db3a56` |
| `source-availability-rust-first-green.log` | `b2c0bb0b3d17292e3a70e379765ccb7100e215dd0a2871c1ef25aae058bbe21a` |
| `source-availability-rust-final-green.log` | `269f55f446e6d10b20dce99dfd5b78ba18def2c1ce5c704ac9db067963e5b2f6` |
| `source-availability-rust-strict-final-green.log` | `271e9638932d74b57dd82ca1de8c642023e4612ed489cbf376a0b5405c1966fd` |
| `source-availability-typecheck.log` | `0f33afb9bc55ff3407f23f9a2f9066c6c884865b57432d5b37169f680102fae8` |
| `source-availability-rust-workspace.log` | `9001781665148257e582126e947283f8e31d8294829168455ff824bfabfbcd0f` |
| `source-availability-release-build.log` | `ffe18bd85483a45827800d6f958a6601787d1d45ba9648dbc4bc7012f8e59946` |
| `source-availability-runtime-build.log` | `2c50d348fda9d12e58236f2c97b35395ed26c0d2530db5b203ec109fb626d594` |
| `source-availability-final-focused.log` | `c8eafac09b232fb273b447eacc18cd6884f8ee0d0173b3fd671af3f09849e297` |
| `source-availability-check-fast.log` | `525c5f863649a8e6e4b4002399b65849e0f179279bc397a97247684ea345c6bc` |

## Frozen final-source Rust and runtime build

`cargo test --workspace` completes exit 0: **159 PASS, 0 FAIL, 1 existing
ignored**, zero measured/filtered, summed across 24 terminal summaries. The
real protocol suite is included. `cargo build --release -p arkts-index-sidecar`
passes in **4.96 s** and `pnpm build` passes. These runs use separate retained
logs. The rebuilt release then participates in the final combined public gate.

The [current manifest](../../bench/references/manifests/settings-menucontroller-source-availability-transport-api24.json)
pins this transport source rather than the preceding presence repair. SHA256:
`ffb89b80bdfaa8c876a5326ed956d755e0641bffe1530dcd16431e036e02e3ba`.

| Artifact | Frozen SHA256 |
| --- | --- |
| `dist/server.cjs` | `ee48f7715981feb4ae1d769221a212286eca6010deecc7d9fdd51119696ae605` |
| `dist/semantic-worker.cjs` | `6e236373d7693cd92f1ead0e2436f3125b83dbcf3b276497ef25109c3b742504` |
| `dist/reference-verifier-worker.cjs` | `8cbf70973d55c294371dfbd0ddc0a9ea9771a975c7a86037728dc9faa1edceee` |
| Standard-library aggregate | `ea78beea2aa84f93fe66645465c37eb916028b79cd9fe898d469bdf54efbf97d` |
| `target/release/arkts-index-sidecar` | `136d363f517baaa82c31336f63fb33d728bd261f90e78e553d54bb8752787255` |
| `pnpm-lock.yaml` | `ece84ab0afea7a411c453aac7371f0e47381455c5e3cc03f639adff9d2bf1131` |

The manifest keeps SDK declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`
and exact oracle SHA256
`72980d7c79e3baf44ebba8a30094484225aebe08aefd2077cda45cbdc5e90ab3`.
The fresh replay below uses this manifest. Post-gate public input revalidation
passes and confirms these frozen inputs, including the full standard-library
aggregate and SDK declaration digest.

## Final combined public Node regression: 98/98 GREEN

The four-file final-source run completes **98/98 PASS**, zero failures/
cancellations/skips/todos, exit 0, **57,079.720068 ms** total. Its discovery
file contributes **66 cases**, now including both strict-state negatives and
the maximum-boundary/caller-mutation control. It uses the newly built release
sidecar rather than the earlier binary, so the real Node-to-Rust boundary is
protected alongside persisted/overlay/generation/session behavior.

Executed argv is `node --test --test-concurrency=1` with the four files below,
writing the retained `source-availability-final-focused.log`. The copyable
rerun chooses a new guarded output name:

```sh
test ! -e .bench/anchor-reuse-2026-09-28/source-availability-final-focused-recheck-1.log && \
node --test --test-concurrency=1 \
  tests/index-adapter.test.mjs tests/index-catalog-adapter.test.mjs \
  tests/index-class-binding-discovery.test.mjs tests/test-layer-manifest.test.mjs \
  > .bench/anchor-reuse-2026-09-28/source-availability-final-focused-recheck-1.log 2>&1
```

## Fresh final-source gates: completed

| Gate | Current status |
| --- | --- |
| Final Rust workspace regression | 159 PASS, 1 existing ignored, exit 0 |
| Final release sidecar and runtime build | PASS; frozen above |
| Combined public Node regression against the final release sidecar | 98/98 PASS, exit 0 |
| Frozen runtime and current Settings manifest hashes | Recorded above; post-gate revalidation PASS |
| Fresh fixed Settings/API24 constructor replay | 267/267 exact PASS, exit 0; latency target still RED |
| Fresh controlled `pnpm check:fast` | 1,081/1,081 PASS, exit 0 |
| Post-gate frozen-input revalidation | PASS, exit 0; no server/output created |

Whole-fast is certified by its separate terminal aggregate below, followed by
the public preflight. No verdict is inferred from earlier focused passing lines.

The preceding open-source-presence slice's **1,062/1,062 whole-fast** and
**267 exact Settings Locations in 60.696 s** remain prior-source history.
They are not current transport-slice measurements, a paired improvement or
substitutes for the current-source gates.

## Fresh Settings/API24 replay: 267 exact PASS, slow

The replay uses `scripts/bench/replay-references.mjs`. Settings remains clean
`ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-row-counts.BPJdST/project`. SDK selection stays
API24/6.1.1.125; the project declares compile 23, target/compatible 20. This is
not relabelled as API23/DevEco parity.

Query is `common/src/main/ets/core/controller/MenuController.ets`,
`MenuController` constructor, zero-based UTF-16 **90:17**, declaration excluded,
documentVersion 1. The new process runs mode A, indexed-batched/full SDK/closure/
64 roots, trace on, idle 1,000 ms and original **180,000 ms** deadline.
Experimental flags remain anchor reuse 0, local-export anchor 1, conservative
semantic units 1; no production default is promoted.

Terminal **PASS**, runner exit 0: **267 expected/observed individual exact
Locations**, independently compared to the full oracle tuples; errors=[],
references RPC error null and validation pass true. Requests/notifications are
initialize, initialized, didOpen, references, shutdown and exit. No
workspace/symbol or documentSymbol query substitutes for references.

| Observation | Completed current-source run |
| --- | --- |
| Harness request start→response | **58,759 ms** |
| Server request.completed | 58,631.19 ms, successful |
| Catalog | 1,846/1,846 files; 1 entry skipped; complete generation 1 |
| Constructor seed | Rejected: compiler-anchor-mismatch; 60 candidates / 1 indexed attempt |
| Complete fallback | 1,496 candidates; 14 completed conservative batches |
| Total terminal attempts / merge | 15 (1 rejected seed + 14 complete); 768 raw→267 unique |
| Automatic diagnostic | Version 1 TS2307 `@ohos.systemparameter`, 2,302 ms after response |
| Sampled Node PID 7579 max RSS | **738,242,560 bytes** |
| Sampled server process-tree max RSS | 741,486,592 bytes; not Zed/product PSS |
| Sampler PID 7580 max RSS, separate | 116,363,264 bytes |
| Harness max at observations | 70,443,008 bytes; not continuous peak |
| Sampling | 472 samples, 387 in RPC; nominal 50 ms, actual min/median/P95/max gaps 128/148/176/295 ms |
| Shutdown | Exit 0; null signal and failure |

Normal diagnostics are preserved. The unresolved API24 import diagnostic
does not certify API23/DevEco diagnostic parity. Worker-thread RSS is not
summed with the Node PID; no forced GC or heap snapshot is used. This single
trace-on replay is compatibility evidence, not a paired speedup, causal
transport-cost measurement or memory no-regression/500 ms/original >3 GB gate.

Inclusive sums over the 15 terminal verifier attempts, milliseconds:

| Field | Sum |
| --- | ---: |
| durationMs | 56,378.370000 |
| workerStartupMs | 4,179.009708 |
| workerProgramReadyMs / workerGetProgramMs | 49,332.996757 / 49,190.898078 |
| workerCreateProgramMs | 41,200.815195 |
| workerGetTypeCheckerMs accessor / workerQueryMs | 0.386215 / 1,938.304591 |

Program-ready/getProgram/createProgram are nested and cannot be added. The
checker accessor does not measure full type-state cost; query is not pure
findReferences and startup includes loading/scheduling/readiness. Maximum
observed Program has 2,049 SourceFiles (1,348 project, 649 SDK, 52 other).
Repeated Program preparation remains the dominant measured verifier interval;
64 roots is a packing parameter, not a strict closure-file cap.

[Raw replay JSON](../../.bench/anchor-reuse-2026-09-28/menu-source-availability-transport-A-1.json),
SHA256 `7a64fb66e4dc73b05495fd1b58aa9c1074f6aa2e9471641af423786333b29854`;
[raw replay log](../../.bench/anchor-reuse-2026-09-28/menu-source-availability-transport-A-1.log),
SHA256 `ad086545e817732c4e58977ded4839b7235fa97fa9cc3692d3b1cd35cf1da2fd`.

Executed output used A-1 above. Copyable same-input replay uses guarded A-2
names; if either exists, choose two fresh names before running. These guards
prevent both replay and right-hand log redirection from overwriting evidence.

```sh
test ! -e .bench/anchor-reuse-2026-09-28/menu-source-availability-transport-A-2.json && \
test ! -e .bench/anchor-reuse-2026-09-28/menu-source-availability-transport-A-2.log && \
ARKTS_REFERENCES_ANCHOR_REUSE=0 \
ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=1 \
ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=1 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 90 --character 17 --exclude-declaration \
  --oracle bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-menucontroller-source-availability-transport-api24.json \
  --out .bench/anchor-reuse-2026-09-28/menu-source-availability-transport-A-2.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace \
  > .bench/anchor-reuse-2026-09-28/menu-source-availability-transport-A-2.log 2>&1
```

## Fresh controlled whole-fast: 1,081/1,081 GREEN

The final-source `pnpm check:fast` runs serially after the completed Settings
replay, with controlled absent SDK path
`/private/tmp/arkts-fast-sdk-control-missing-20260927`, original assertions and
deadlines. Terminal result is **1,081 tests / 1,081 PASS / 0 FAIL**, zero
cancellations/skips/todos, exit 0, **879,285.529951 ms** total. The terminal
aggregate is authoritative; nested test-runner output and passing-line counts
are not the suite verdict.

[Raw current-source gate log](../../.bench/anchor-reuse-2026-09-28/source-availability-check-fast.log),
SHA256 `525c5f863649a8e6e4b4002399b65849e0f179279bc397a97247684ea345c6bc`.
The guarded historical command writes that retained path. Copyable same-input
rerun instead uses a fresh guarded name:

```sh
test ! -e .bench/anchor-reuse-2026-09-28/source-availability-check-fast-recheck-1.log && \
test ! -e /private/tmp/arkts-fast-sdk-control-missing-20260927 && \
ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927 \
pnpm check:fast \
  > .bench/anchor-reuse-2026-09-28/source-availability-check-fast-recheck-1.log 2>&1
```

The subsequent read-only public preflight passes `validateInputs` and awaits
`validateBenchmarkManifest` against the same fixed Settings query/manifest/SDK/
oracle, exit 0. Server, semantic Worker, verifier Worker, sidecar, standard-
library aggregate, SDK declaration digest, oracle, manifest and lock hashes
all match the frozen replay inputs above. The unused path
`.bench/anchor-reuse-2026-09-28/source-availability-postgate-preflight-unused.json`
is asserted absent and stays absent (`outputCreated=false`). No server starts
and no output is created. This is terminal-tool evidence, not a persisted
preflight log or extra replay artifact.

This controlled integration gate does not certify the independent default-host
SDK environment, native Windows, all-source availability or product performance.

## Scope still open

Caller-fenced complete source/overlay admission, physical identity and true
competing-source absence remain independent from this transport. Rust
extensionless resolution, production binding-RPC consumption and compiler-backed
constructor search coverage require their own public GREEN slices before
candidate exclusion. No 500 ms, original >3 GB/final memory/PSS, native Windows
or default-host SDK graduation is claimed.

The next slice is a public interface for caller-owned query capture and a
separate proof that its captured inputs compose with the existing discovery
port. Missing candidate parents remain unknown. The fixture must preserve
the missing parent; creating a `Base` directory to obtain completeness would
change the case being proved. No unused per-references RPC is introduced.
