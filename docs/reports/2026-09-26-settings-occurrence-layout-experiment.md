# Settings occurrence layout experiment

Status: **experimental fresh-cache candidate; not production/default promotion**.

## Question and frozen input

The preceding [read-only profile](2026-09-26-settings-catalog-storage-profile.md)
found a 102,957,056-byte occurrence primary-key B-tree alongside the
105,140,224-byte occurrence table. Test whether removing this duplicate storage
improves catalog activation without losing any indexed facts or references.

Use fixed official Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9`, clean
checkout `/private/tmp/arkts-settings-row-counts.BPJdST/project`, Node v26.3.0,
SDK API 24 `6.1.1.125` (accepted compatibility configuration for compile API 23;
not exact SDK equivalence), declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
All server/semantic-worker/verifier/library digests and the nine-Location oracle
are unchanged. Parent server HEAD is `e0131f9`; manifests/raw runs record dirty
source state. Compare [same-source default control](../../bench/references/manifests/settings-occurrence-rowid-control-api24.json)
with [experimental binary](../../bench/references/manifests/settings-occurrence-without-rowid-api24.json).

Target: `common/src/main/ets/sendable/HomeInitData.ets`, `HomeInitData`,
zero-based UTF-16 `28:30`, `includeDeclaration=false`.
Only `textDocument/references` is the explicit semantic request; automatic
diagnostics remain enabled. This is process/index-cold but catalog-ready before
query, **not** an immediate first-click or edit-warm benchmark.
Strategy remains `indexed-batched + closure + full SDK`, batch roots 64,
global verifier concurrency one; no GC, heap snapshot or semantic tuning.

## One-variable storage candidate and rollback boundary

[SQLite WITHOUT ROWID](https://sqlite.org/withoutrowid.html) clusters data by
the composite primary key instead of storing a separate rowid table and unique
primary-key B-tree. It can reduce duplicate key storage, but larger records can
hurt B-tree fan-out; disk savings are not a promise of runtime improvement.

The Cargo feature `experimental-occurrence-without-rowid` affects only fresh
`reference_occurrences` creation. It retains every column, range, qualification,
ordinal and foreign-key cascade. Identity covering indexes, aliases, bindings,
symbol FTS rowid triggers, INSERTs, transactions, WAL/checkpoint policy,
durability and cache budgets remain unchanged.

Experimental schema **109** accepts only a fresh cache or its own schema.
It rejects existing production schemas instead of converting them. Default
builds stay schema **9**, retain historical migrations and reject schema 109.
Rollback means select the default binary and its separate production cache;
there is no reverse data migration, forced cache deletion or silent fallback.
`target/release/arkts-index-sidecar` was rebuilt without the experimental feature
after saving the experimental binary separately under `.bench/`.
Production adoption still requires its own migration and rollback work.

## Storage and row-preservation observation

One experimental read-only SQL/DBSTAT run passed exact 9/9 Locations, no missing
or extra ranges, zero target-file diagnostics and clean shutdown. It retained
637,203 occurrences, 175,120 per-document distinct identities, 3,662 aliases
and 20,516 bindings: **836,501 reference rows**, identical to the prior control.

| B-tree group | Prior schema 9 | Experimental schema 109 |
| --- | ---: | ---: |
| Occurrence table | 105,140,224 B | 113,246,208 B |
| Separate occurrence primary-key B-tree | 102,957,056 B | 0 B |
| All remaining B-trees | 112,472,064 B | 112,472,064 B |
| Total | 320,569,344 B | 225,718,272 B |

Allocation falls **29.59%** (94,851,072 B); the clustered table itself grows.
Page size stays 4,096 B, page count is 55,107, freelist zero. After commit,
physical DB/WAL sizes are 225,718,272 / 227,164,472 B. WAL length is neither
cumulative I/O nor live frames. These disk bytes are not compiler/SQLite RSS.
The 1,636 ms read-only observer delays readiness and is excluded from timing
comparison; no trace-on latency is eligible for graduation.

An initial sandboxed attempt failed before LSP initialize because external
`ps` sampling returned `spawn EPERM`. It is recorded as environment-blocked,
not an empty references result. The authorized external-sampler rerun succeeded.

## Trace-off comparison

Same-source binaries differ by the experimental compile feature. Fresh processes
and caches run in A-B-B-A order followed by A-B, with SQL/DBSTAT/reference phase
tracing disabled. Lightweight catalog phase events remain enabled in both.
CPU/OS cache and thermal history are not controlled; this is a small local
experiment, not P95 or a statistical release gate. Earlier old-parent binary
comparison artifacts are exploratory and are not this causal table.

All runs require exact nine URI/range tuples, legal positions, no extra results,
zero target-file diagnostics and a normal shutdown. External samples count
Node once plus sidecar; harness/sampler RSS is separate. Requested interval
50 ms is not the achieved gap; measured gaps are reported below.

| Run order | Layout | Activating → ready | References | Observed product RSS peak | Sample gap median / max |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | Control 1 | 6,410 ms | 6,966 ms | 498,626,560 B | 95 / 166 ms |
| 2 | Experimental 1 | 5,071 ms | 6,554 ms | 579,403,776 B | 92 / 103 ms |
| 3 | Experimental 2 | 4,725 ms | 6,689 ms | 574,623,744 B | 94 / 112 ms |
| 4 | Control 2 | 6,282 ms | 7,299 ms | 548,401,152 B | 96 / 212 ms |
| 5 | Control 3 | 6,723 ms | 6,807 ms | 572,489,728 B | 95 / 126 ms |
| 6 | Experimental 3 | 4,917 ms | 6,756 ms | 574,410,752 B | 94 / 211 ms |

All six pass exact 9/9, normal diagnostics and clean shutdown. Activation
median is 6,410 versus 4,917 ms (23.29% lower in this small experiment).
References median is 6,966 versus 6,689 ms: still seconds, not 500 ms.
Product RSS median is 548,401,152 versus 574,623,744 B (4.78% higher), **not
a memory win**. Per-role maxima are not added together: peaks need not coincide.
For the first four runs, sidecar peaks stay about 219–222 MB in both layouts;
Node peaks vary about 458–535 MB. This suggests disk allocation does not bound
resident parser/compiler state, but does not establish the cause of RSS drift.
No PSS or true 50 ms peak guarantee is inferred from these sparse samples.

Decision: retain the candidate only as an experiment. It provides a measurable
catalog/disk signal, not a remedy for compiler preparation or navigation latency.
Do not relax memory or latency gates or enable it by default.

## Verification, reproduction and remaining gates

[TDD evidence](../tdd/occurrence-without-rowid-experiment.md): public observer
RED to GREEN; default SQLite 34 tests including five historical migrations;
experimental SQLite 29 tests (five non-applicable production migrations explicitly
filtered); experimental sidecar 27 passed/one pre-existing ignored; default
and feature-enabled Clippy with warnings denied, formatting and release builds
passed. A fresh Node v26.3.0 `pnpm check:fast` passed type checking/build and
many production transcripts, including the earlier logging and call-hierarchy
timeouts, but `cancelling batched references stops the active verifier without
poisoning recovery` failed after 33,641 ms. At 19:10:45 +08 macOS reported CPU
speed limit 22%, scheduler 87%, 12 available CPUs. This point observation does
not prove the cause of the failure or describe every benchmark run. After the
confirmed failure, only validated test root PID 65424 and its descendants were
terminated with SIGTERM. Exit 143 is an **incomplete failed attempt**, not a
finished 958-test count or GREEN. No timeout or completeness gate was weakened;
the underlying failure and separate facade memory gate remain open.
An isolated rerun using Node v26.3.0 and the exact test-name filter also failed:
one test/one failure, exit 1, 39,164 ms test duration. The error is `Timed out
waiting for LSP response 2`, at `tests/support/lsp-process.mjs:341`.
The first cancellation response assertion had passed; it is the subsequent
recovery query's unchanged 30,000 ms response deadline that failed. Trace
shows reference session 2 completed batch index 7 of 21 and began index 8;
one completed batch took 3,898 ms, with 55 Program SourceFiles (3 project,
0 SDK, 52 other), 1,381 ms createProgram and 321 ms query. This distinguishes
acknowledged cancellation from a slow resumed verification, without claiming
that all recovered references completed or that the cause is proved. The
counterexample also cautions against attributing all cold cost to SDK size.
Recheck with:

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test \
  --test-name-pattern='^cancelling batched references stops the active verifier without poisoning recovery$' \
  tests/semantic/references-batching.test.mjs
```

Parent `e0131f9` passed Linux validate/Windows install CI in
[run 36235963930](https://github.com/liuhui-code/arkts-language-server/actions/runs/36235963930).

Reproduce the experimental measurement using the pinned saved binary:

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --manifest bench/references/manifests/settings-occurrence-without-rowid-api24.json \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --sidecar .bench/occurrence-layout-2026-09-26/sidecar-without-rowid \
  --file common/src/main/ets/sendable/HomeInitData.ets --symbol HomeInitData \
  --line 28 --character 30 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --out .bench/occurrence-layout-next.json --mode A --catalog-state ready \
  --strategy indexed-batched --sdk-profile full --dependency-profile closure \
  --batch-roots 64 --idle-ms 0 --timeout-ms 120000
```

Remove SQL/DBSTAT/reference trace environment overrides for timing; set
`ARKTS_INDEX_CATALOG_TRACE=1` in both variants for catalog monotonic timestamps.
To build the candidate explicitly:

```sh
cargo build --release -p arkts-index-sidecar \
  --features experimental-occurrence-without-rowid
```

Preserve it under a distinct path and rebuild the default before normal
development. Never point an
experimental binary at an existing production cache. Manifests pin binary
hashes and will block a different build until explicitly refrozen.

Raw evidence is under `.bench/occurrence-layout-2026-09-26/`: production and
experimental binaries, `experimental-observed.json` (sampler-blocked),
`experimental-storage.json`, `sql-experimental.ndjson`,
`storage-experimental.ndjson`, `control-{1,2,3}.json`,
`experimental-{1,2,3}.json`; each JSON includes memory samples, request transcript,
timeline, normalized references, environment and diagnostics.

Do not promote this layout based on storage alone. Adoption would require production
migration/rollback and unknown-profile handling, broader symbols/projects,
independent repeated-generation churn, completed RSS/PSS no-regression and
first-click responsiveness. Cold references, the 500 ms experience requirement,
original >3 GB reproduction and final 50% memory/DevEco gates remain open.
Keep the storage candidate parked rather than treating a migration as the
next latency fix. Return to the plan's R-10 anchor-reuse/fusion and R-03
compiler-preparation evidence: catalog speedup alone has not delivered the
required cold navigation response.
