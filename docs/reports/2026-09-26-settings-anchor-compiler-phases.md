# Settings: independent anchor and final-batch compiler preparation

Status: **three-process phase profile exactness PASS; no fusion or latency graduation**.
This is the default references strategy with the existing opt-in phase trace,
not a performance optimization A/B.

## Fixed inputs

- Parent server source `9f91122ac504365c57473a430094da09baac9309` plus the
  uncommitted source-snapshot/lifecycle and anchor-phase observation slices.
  Raw reports retain the actual worktree status.
- Clean real Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9`,
  `/private/tmp/arkts-settings-row-counts.BPJdST/project`, 1,846 indexed files.
- Node `v26.3.0`; selected DevEco ETS API24 / `6.1.1.125` at
  `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`.
  SDK digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
  This is the accepted API24 compatibility configuration, not API23/DevEco
  equivalence.
- [Separate phase manifest](../../bench/references/manifests/settings-homeinitdata-api24-anchor-phase.json)
  pins project, SDK, oracle, entry server, both Workers, standard library and
  production schema-9 sidecar. Server SHA-256 remains
  `93e3c903f71f8c1eb2dad96f982a52297ee2d99b8eae8fe13dbbaeebcd5b7759`;
  new semantic Worker
  `5b157baa2d4b6bd1f72be617b4244ef2c269ff4811cae877ea478f8511bd8440`;
  new verifier Worker
  `17388d66dab309747c0cad4b8132472be8bc757e97663cc7d1ac9e6475ec364f`.
- `indexed-batched + closure + full SDK`, roots 64, default context disposal,
  anchor reuse disabled, `ARKTS_REFERENCES_TRACE=1`. No forced GC, heap snapshot,
  test delay, increased worker count or changed memory limits.

Each of three sequential independent processes creates a private index cache,
waits for catalog-ready, then runs mode C: ten requests, an unsaved appended
comment, and version-2 retry. There is no explicit completion/definition warmup.
The measured first query follows index readiness, not immediate index-warming.
Target is the real `HomeInitData` usage at zero-based UTF-16 **28:30** in
`common/src/main/ets/sendable/HomeInitData.ets`, `includeDeclaration=false`.

All **33/33** responses match the same nine-Location oracle. Each process
records nine complete-cache hits, two misses/stores, normal version-2 empty
target diagnostics and clean code-0 shutdown. Only actual
`textDocument/references` requests are used for navigation; the runner does
not substitute `workspace/symbol` or `documentSymbol`.

## Observed first/edit phases

Milliseconds below are diagnostic trace data, rounded to one decimal. Program
ready includes `getProgram`, the explicit checker probe and SourceFile stats;
anchor query is definition, final batch query is `findReferences`.

| Run/state | End-to-end | Anchor ready | Anchor definition | Final batch ready | findReferences | Product-tree peak RSS bytes (whole run) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 first | 7,184 | 1,714.1 | 11.7 | 2,622.8 | 54.6 | 538,513,408 |
| 1 edit | 5,406 | 1,390.4 | 12.4 | 2,658.6 | 47.9 | same whole-run peak |
| 2 first | 7,242 | 1,725.4 | 12.4 | 2,757.9 | 49.4 | 539,770,880 |
| 2 edit | 5,185 | 1,460.5 | 12.2 | 2,420.2 | 45.7 | same whole-run peak |
| 3 first | 7,184 | 1,581.5 | 12.0 | 2,616.1 | 49.5 | 524,144,640 |
| 3 edit | 5,243 | 1,446.6 | 11.9 | 2,492.0 | 49.0 | same whole-run peak |

First-query medians: anchor ready **1,714.1 ms**, final ready **2,622.8 ms**,
definition **12.0 ms**, `findReferences` **49.5 ms**. Post-edit medians are
**1,446.6 / 2,492.0 ms** preparation and **12.2 / 47.9 ms** queries.
Every first/edit request creates a separate 308-SourceFile anchor Program
(one project, 255 SDK, 52 other library files) and a 613-SourceFile final
Program (151 project, 410 SDK, 52 other files). This is observed duplicate
Program preparation, not proof that all those objects or type states are
identical/shareable across scopes.

First-query `createProgram` spans are 1,499.6/1,466.2/1,371.9 ms for anchors
and 2,219.0/2,337.4/2,212.7 ms for final batches. These are nested within
`getProgram`/ready: **do not sum nested spans**. Explicit `getTypeChecker`
calls are approximately 0.014–0.037 ms across all six requests. Because
`getProgram()` may already construct/bind checker state, that does not mean
the checker or type checking costs nothing.

There is still unassigned work. Inclusive candidate selection is
4,085.53/4,057.22/4,098.30 ms on first requests and
2,314.06/2,349.07/2,309.32 ms after editing. It contains the standalone anchor,
index queries/resolution, persistent-worker preparation/serialization and other
work; its remainder is **not a measured Rust/SQLite-only duration**. Final
queue waits are sub-millisecond/approximately 1 ms in run 1, so those values
do not explain the seconds spent preparing Programs.

## Accounting and limits

External process-tree RSS sampling is configured at 50 ms; actual timestamps
and server/sidecar roles remain in each raw file. Worker threads count once
inside Node; harness/sampler memory is separate. Completion-time log RSS is
not peak measurement. Peaks include cataloging, normal diagnostics and both
semantic misses. There is no PSS, DevEco or legacy A/B here, nor a >3 GB
reproduction. Trace collection has overhead; do not compare these numbers
causally with the earlier trace-off mode-C or warmed anchor-reuse builds.
Three cold/edit samples do not establish a stable release P95.

The existing candidate path needs a compiler-resolved anchor before querying
declaration-based candidates; final batching therefore cannot simply omit
that proof. Combining phases would require a proven scope/snapshot/identity
contract. Keeping a Worker/LanguageService alive while awaiting index work is
not implemented or justified by these samples. R-10 warm reuse remains off
because its separate A/B regressed RSS. First/edit queries still fail 500 ms.

## Replay and raw evidence

```sh
ARKTS_REFERENCES_ANCHOR_REUSE=0 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node \
  scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 28 --character 30 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-homeinitdata-api24-anchor-phase.json \
  --out /private/tmp/settings-anchor-phase-recheck.json \
  --mode C --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

Use a fresh output path and allow external macOS process sampling. The checkout
remains clean; the edit is an open overlay, never a disk write.

- [Run 1](../../.bench/anchor-reuse-2026-09-26/anchor-phase-C-1.json), SHA-256
  `e5f5ad012394a3def6696a705cb6db8a980aa53d9020483772cb20298a043d50`.
- [Run 2](../../.bench/anchor-reuse-2026-09-26/anchor-phase-C-2.json), SHA-256
  `123040d950a494008361186c497e2f58dd864366cf9d3aa49dd2e08d361be5df`.
- [Run 3](../../.bench/anchor-reuse-2026-09-26/anchor-phase-C-3.json), SHA-256
  `287fee1e2258edd89817aedd0ff7871083d2a4610e74e2af71b1b4965fe5f047`.

The [public RED/GREEN record](../tdd/references-anchor-phase-trace.md) covers
phase presence with trace on and probe absence with trace off. No commit,
push, merge, default-strategy change or gate relaxation was performed.

`pnpm check`, `pnpm build` and **43/43 focused regressions** pass on this
trace build, including fourteen anchor transcripts, batch exactness, cache,
cancellation/freshness, scheduling, diagnostics and context pressure. The
command is recorded in the linked TDD document. The preceding 970-test full
suite belongs to the prior source-snapshot build, not this observation slice.
