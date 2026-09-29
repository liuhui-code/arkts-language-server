# Settings catalog recovery and identity SQL baseline

The unchanged-artifact recovery replay is **PASS**: catalog readiness completes,
all 11 constructor-reference responses match the 267-location oracle, and normal
version-2 diagnostics arrive. First/edit requests remain 67.053/77.261 seconds.
This establishes a usable baseline before the identity SQL reuse slice below;
it is not a performance or whole-suite graduation.

Parent `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`. Inherited edits are preserved. The recovery
replay changes no source/runtime artifact, SQL, schema/layout, durability, SDK,
semantic scope/default, Worker policy, cache budget, diagnostics or deadline.
The later implementation is recorded separately below. No commit, push or merge
is requested.

## Restored fixed input

The previous temporary Settings checkout disappeared before the prior report's
handoff. Settings is restored at the same clean revision
`ecc550dfaed880e04e38a2477eb7235cd50475b9`, now under
`/Users/liuhui/Documents/code/arkts-language-server/.bench/real-projects/settings-ecc550`.
The replay records an empty checkout status; read-only postflight also confirms
the clean revision. Its absolute URI prefix differs from the lost
`/private/tmp/arkts-settings-row-counts.BPJdST/project` prefix. This is a restored
input location, not a same-path replay; oracle comparison uses workspace-relative
file/range tuples. No code or runtime rebuild precedes this recovery run.

SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony` is API24,
version 6.1.1.125, declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
Settings declares compile23/target20/compatible20. This is the approved API24
compatibility track, not API23 equivalence.

The query is `common/src/main/ets/core/controller/MenuController.ets`, symbol
`MenuController`, zero-based UTF-16 `(90,17)`, includeDeclaration=false.
The constructor oracle remains 267 tuples, SHA256
`72980d7c79e3baf44ebba8a30094484225aebe08aefd2077cda45cbdc5e90ab3`.
It is distinct from the class-declaration oracle.

| Pinned artifact | SHA256 |
| --- | --- |
| `dist/server.cjs` | `ebac64e22a90a8ab0d1171f9b50c9a11272fc705569058dce64abc16515aac36` |
| `dist/semantic-worker.cjs` | `6e236373d7693cd92f1ead0e2436f3125b83dbcf3b276497ef25109c3b742504` |
| `dist/reference-verifier-worker.cjs` | `8cbf70973d55c294371dfbd0ddc0a9ea9771a975c7a86037728dc9faa1edceee` |
| Default-feature native sidecar | `1cd57b7a063354215d14599ee52ffa5b6a7ef7d3b2aeb14267b49124b653af2e` |
| Adjacent standard library | `ea78beea2aa84f93fe66645465c37eb916028b79cd9fe898d469bdf54efbf97d` |
| [API24 insertion-progress manifest](../../bench/references/manifests/settings-menucontroller-catalog-insert-progress-api24.json) | `c6371907d5efb0170231797bdf14281bbede9d198de69df83c049f101aa01dd0` |

These runtime pins match the [prior insertion-progress run](2026-09-28-settings-catalog-insert-progress.md).
The observation-only native rebuild already existed before recovery; its hash
must not be attributed to a later identity SQL change.

## Replay and correctness evidence

Existing real-child Content-Length framed stdio runner; Node v26.3.0,
Darwin25.6.0 x64, 16GiB/12 logical CPUs. Mode C makes ten same-snapshot
references requests and a final request after an unsaved appended comment.
Profiles remain indexed-batched/full SDK/closure, roots64, retention=dispose,
budget1024MiB, anchor reuse0/local-export seed1/conservative units1, compile
cache disabled. Fresh private index/log directories are owned by the runner.
Catalog/request/diagnostic deadlines remain180000ms, requested RSS interval50ms,
idle1000ms. Catalog, SQL, live-stage and insertion-progress observations are on.

| Public observation | Actual result |
| --- | --- |
| Catalog terminal/state | ready/complete; 1846/1846 files, 1 skipped entry |
| initialize response → catalog complete | 9638ms |
| First response, document version1 | 67053ms; 267 exact tuples |
| Iterations2–10, document version1 | 34,33,35,60,34,35,34,35,31ms; all 267 exact |
| Unsaved-comment retry, version2 | 77261ms; 267 exact tuples |
| Repeated result set / validation | identical; 11/11 PASS, no errors |
| Normal diagnostic | version2, code2307, `@ohos.systemparameter` module missing |
| Diagnostic after final reference response | 3036ms |
| Shutdown / owned server exit | result=null / code0, signal=null |

The diagnostic is preserved compiler output, not an empty-diagnostics claim.
The transcript retains all100 entries with0 drops: actual requests include
11 `textDocument/references`, didOpen and didChange, with no forbidden symbol
requests. The intended workload label alone is not the evidence.

Two cold operations each record a cache miss, constructor seed rejection
(`compiler-anchor-mismatch`), complete-scope fallback and a new cache store.
Each fallback finishes14 batches, indexes0–13, over all1496 membership/candidate
files and32 project-graph semantic units. The rejected60-file seed contributes
no accepted partial result. All compiler batches remain transient Workers.
No constructor narrowing or class/constructor identity substitution is admitted.

The nine same-snapshot operations each record `references.cache.hit`. Across
their nine measured request windows there are0 `references.batch.start`,
0 new `semantic.worker.started`, and0 batch-complete/rejected-seed Program
observations. Thus these hits have no new verifier batch/Program work in the
captured trace, not an inference from equal Locations alone. The edit clears
the cache (`cacheEntries=0` at its miss), repeats compiler verification and stores
the newly version-bound complete answer. Each store retains66655 reported bytes.

## Completed SQL baseline

The after-commit SQL record exists and reports generation1/documents1846.
All eight coarse boundaries are present through `commit.end` and
`replace.complete`; first→last monotonic span is8579.396399ms. SQL `totalMs`
includes preflight and is8600.959ms. These are observer wall times, not SQLite
CPU time or a trace-off A/B. The later ready event independently confirms
sidecar/LSP readiness; insertion completion alone cannot do so.

| Successful SQL component | Wall ms / rows |
| --- | ---: |
| Preflight | 21.279ms |
| Documents / symbols / exports insertion | 11.292 / 514.048 / 85.311ms |
| Reference insertion aggregate | 5461.278ms |
| Occurrences | 3365.955ms / 637203 rows |
| Identity dedup/value preparation/batch execution | 1696.733ms / 175120 rows |
| Aliases | 64.531ms / 3662 rows |
| Bindings | 329.990ms / 20516 rows |
| Index recreation / commit | 572.169 / 1932.641ms |
| Full after-commit total | 8600.959ms |

The four interleaved insertion subphases do not represent four global stages.
Identity timing includes dedup, value preparation and existing batch SQL;
it does not isolate allocation cost. The occurrence/alias/binding input counts
match prior captured counts, without proving byte-identical row contents or
equal machine/storage work.

There are124 bounded progress records. At the final document,175104 identity
rows have executed and16 remain buffered. The tail then executes those16,
ending at175120 with0 buffered rows. `insert.complete` reports1846 completed
documents and the same final counters as the committed SQL record.
All progress records still say `uncommitted=true`: only the independent
commit/after-commit/ready records establish successful activation. These
counters count successful statement returns, not a separate COUNT audit.

## Host and memory interpretation

Read-only host points before/after report CPU speed limit100→55%, scheduler
limit100→100%, available CPUs12→12, swap used0→0MiB on16GiB. Wired pages are
756855→763279 at4096 bytes/page; compressor pages402327→432581. These snapshots
support a recovered usable environment but do not prove host pressure was the
sole cause of earlier failures. Paths, run timing and observation IO remain
comparison limits; this is not a matched controlled speedup experiment.

The external process-tree RSS sampler records1088 samples. Its1087 actual
timestamp gaps have min120ms, median139ms, nearest-rank P95 173ms and max268ms,
despite the requested50ms cadence. The sampled product peak is
**1072066560 bytes** at epoch1790605093883: Node1022570496 plus native49496064
bytes in that same sample. This is a lower bound on the actual transient peak.

The separate native peak250634240 bytes occurs at another time and must not be
added to Node's peak. Sampler peak126578688 bytes, harness and host-wrapper
observations are excluded from the product total. Worker threads count once
inside Node RSS. This is one sampled RSS replay, not PSS or a memory release
gate. Cold/edit500ms, original/final memory acceptance, DevEco/PSS and native
Windows acceptance remain open; hot cache responses do not close cold latency.

## Retained engine invocation

The archived invocation records `removedNames=[]` and normal OS environment
retained, plus the explicit environment below. Use a new unused stem; never
overwrite the recorded baseline. From the repository root, an equivalent
rerun explicitly selects the retained old native after the later rebuild:

```sh
replay_stem=/Users/liuhui/Documents/code/arkts-language-server/.bench/anchor-reuse-2026-09-28/menu-catalog-recovered-C-new
env NODE_DISABLE_COMPILE_CACHE=1 \
  ARKTS_REFERENCES_ANCHOR_REUSE=0 ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=1 \
  ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=1 \
  ARKTS_REFERENCES_CONTEXT_RETENTION=dispose ARKTS_MEMORY_BUDGET_MB=1024 \
  ARKTS_INDEX_CATALOG_TRACE=1 \
  ARKTS_INDEX_CATALOG_SQL_TRACE_FILE="${replay_stem}.sql.ndjson" \
  ARKTS_INDEX_CATALOG_STAGE_TRACE_FILE="${replay_stem}.stages.ndjson" \
  ARKTS_INDEX_REFERENCE_INSERT_TRACE_FILE="${replay_stem}.progress.ndjson" \
  /Users/liuhui/.nvm/versions/node/v26.3.0/bin/node \
  scripts/bench/replay-references.mjs \
  --workspace /Users/liuhui/Documents/code/arkts-language-server/.bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 90 --character 17 --exclude-declaration \
  --oracle bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-menucontroller-catalog-insert-progress-api24.json \
  --sidecar /Users/liuhui/Documents/code/arkts-language-server/.bench/anchor-reuse-2026-09-28/arkts-index-sidecar-before-identity-sql \
  --out "${replay_stem}.json" --mode C --strategy indexed-batched \
  --sdk-profile full --dependency-profile closure --batch-roots 64 \
  --sample-interval-ms 50 --timeout-ms 180000 \
  --diagnostic-timeout-ms 180000 --idle-ms 1000 --trace
```

The engine command does not create the wrapper's host snapshots. Preserve the
archived invocation/host artifacts for the observed before/after context;
the command specifies the same180s gates and semantic workload, not a new result.

## Retained recovery artifacts

Prefix `.bench/anchor-reuse-2026-09-28/menu-catalog-recovered-C-1`:

| Suffix | SHA256 |
| --- | --- |
| [.json](../../.bench/anchor-reuse-2026-09-28/menu-catalog-recovered-C-1.json) | `3f9996f55e56674743b2e2adab80e338e81501cbdb2a0d7de187d5c68ec09196` |
| [.invocation.json](../../.bench/anchor-reuse-2026-09-28/menu-catalog-recovered-C-1.invocation.json) | `16a0ac3c064dc9af03835d414c56753e62a0fee10f90a555ec20c42ae5cd8bfd` |
| [.log](../../.bench/anchor-reuse-2026-09-28/menu-catalog-recovered-C-1.log) | `f7a4d64fbffe573fe644b2c32057362e611721318817dd96cf31fe2056d16c83` |
| [.sql.ndjson](../../.bench/anchor-reuse-2026-09-28/menu-catalog-recovered-C-1.sql.ndjson) | `f5ae2c15f0aa19c737d17d331ca860aa626fa9fe7eb6dc84eafcf46dc59d0521` |
| [.progress.ndjson](../../.bench/anchor-reuse-2026-09-28/menu-catalog-recovered-C-1.progress.ndjson) | `ddc7bf9e27ae40994dad264ab1f55e70f00792aa004448f6970019e54e8116da` |
| [.stages.ndjson](../../.bench/anchor-reuse-2026-09-28/menu-catalog-recovered-C-1.stages.ndjson) | `3622fcfd1c1e1676203f700c97616d22ce480f9f4a1207f712e1969bb7afc1fc` |
| [.host.ndjson](../../.bench/anchor-reuse-2026-09-28/menu-catalog-recovered-C-1.host.ndjson) | `6f03b8e7a850d3ceeecc4028adc4984fb1bf51a770cb01d121fa15615ff987f8` |

## Later identity SQL reuse and constructor regression

After the recovered baseline, `reference_insert.rs` now lazily reuses one
operation-local full256-row SQL string. The string is dropped when insertion
returns; different-size tails retain their existing construction. This is SQL
text reuse, not a new statement or AST pool. Shape/parameters/order, batching,
cross-document buffering, row counts, schema and durability are unchanged.
The recovered real-project run above still uses the old native artifact.

[Public RED/GREEN contract](../tdd/references-identity-sql-reuse.md):

```sh
cargo test -p arkts-index-sqlite --test reference_identity_allocations -- --nocapture
```

The35-document fixture measures only current-thread Rust allocation requests
during public catalog activation; parsing, opening, parity queries and reopen
are outside that region. RED is5341 requests against the unchanged4598 budget,
exit101, after exact public parity/reopen assertions already succeed. Minimal
GREEN is4289 requests with the same budget and assertions,1 PASS/exit0:
1052 fewer requests, approximately19.697%. This does not measure C/SQLite
allocations, allocated bytes, other threads, RSS or elapsed time.

At the initial implementation checkpoint, Rust workspace validation is182
PASS/0 FAIL/1 existing ignored, exit0; default-feature release succeeds in7.54s.
That intermediate native SHA256 is
`fccf5755337931a5e6907620e690db32a5116b52ab7ab491e786ffcb236bfc5a`.
The old1cd57b artifact is retained as `arkts-index-sidecar-before-identity-sql`.
No new-native replay had run at that checkpoint. The final build/replay below
supersedes that pending status, without claiming allocation-to-latency savings.

The original public constructor transcript also recovers unchanged: exact test
`explicit constructor references preserve their own identity across aliases and inheritance`
in `tests/semantic/references-anchor-reuse.test.mjs` is1/1 PASS/exit0 under its
original30s per-RPC deadlines. The whole test takes112567.943927ms across its
profiles; whole Node duration112705.428897ms is not one request's latency.

| Later evidence, under `.bench/anchor-reuse-2026-09-28/` | SHA256 |
| --- | --- |
| [constructor-recovered-1.log](../../.bench/anchor-reuse-2026-09-28/constructor-recovered-1.log) | `f3490d7570558ca1214e525964afc13576387af7f8c3887d8c7425416510f924` |
| [identity-sql-allocation-red-1.log](../../.bench/anchor-reuse-2026-09-28/identity-sql-allocation-red-1.log) | `e6d8388a844d35be01bfc0f464cd055be863e25fdd42a3dcf17cd1b6e4fb4880` |
| [identity-sql-allocation-green-1.log](../../.bench/anchor-reuse-2026-09-28/identity-sql-allocation-green-1.log) | `3139e5b9ef8357acf2977344faac6fb6354c7acfc2cb47bcdbb19a1770b44c5c` |
| [identity-sql-rust-workspace.log](../../.bench/anchor-reuse-2026-09-28/identity-sql-rust-workspace.log) | `2cc747f62e6d261f1793ff3a9e1b3d0bf14a0e069d75b662fa4c8a67ef6b520d` |
| [identity-sql-release.log](../../.bench/anchor-reuse-2026-09-28/identity-sql-release.log) | `da306ea83bf43aabb3e29dc051f841e952b36dabaaec341c6c86706110dd0ea3` |

## Final Rust verification

Strict Clippy first exposed inherited dirty-source lint violations. Preserve
the behavior already characterized by public tests: collapse one equivalent
header condition, remove redundant connection borrows/one-element clones, and
retain the observer's every-64-document condition with `is_multiple_of(64)`.
No warning suppression, test weakening, schema/SQL change or semantic admission
is introduced. All changed handwritten Rust files stay below 500 physical lines.

Final `cargo clippy --workspace --all-targets -- -D warnings` is exit 0;
`cargo test --workspace -- --test-threads=1` is **182 PASS/0 FAIL/1 existing
ignored**, exit 0. Default-feature release succeeds in **6.34 s**, on rustc/cargo
1.95.0. Final native SHA256 is
`f8b9e0c7d0632fe87a6edd4858bc2e23b0a2a20d3f21db965e51a1ee87122070`;
the three JS bundle pins above remain unchanged. The initial `fccf5755…` build
is not the final native used by the new replay.

| Final verification log | SHA256 |
| --- | --- |
| [identity-sql-clippy-verified.log](../../.bench/anchor-reuse-2026-09-28/identity-sql-clippy-verified.log) | `896277b8d2e2862bb4d1b96d2415c150f6199981cefa6976ecb4cada82eb4842` |
| [identity-sql-rust-verified.log](../../.bench/anchor-reuse-2026-09-28/identity-sql-rust-verified.log) | `948d9b5063cced1212ed0567afcfff59732e63fe73c222f3e89bb6c1caf23ab1` |
| [identity-sql-release-verified.log](../../.bench/anchor-reuse-2026-09-28/identity-sql-release-verified.log) | `dc0a0159fa3cc762fde8dbcf39aa1a268eec8356542e93c968cd0d5d1681bb6a` |

## Final native Settings replay

The [new pinned manifest](../../bench/references/manifests/settings-menucontroller-identity-sql-reuse-api24.json)
has SHA256 `90c3d25b129f5510273b05dd2e49348421dab18b12d1b0fd467b085351a6b74d`.
Run `menu-identity-sql-reuse-C-1` uses the final `f8b9e0c7…` native with the same
JS/standard library/clean persistent checkout/SDK/query/oracle and 180 s gates.
No overlap with compilation or other test workloads is introduced. It is one
sequential comparison, not a randomized performance sample or trace-off A/B.

| Public result | New native |
| --- | ---: |
| Replay / process exit | PASS / 0, no signal |
| Complete, valid, exact responses | 11 × 267; no validation errors |
| initialize response → ready catalog | 11,497 ms; 1846/1846, skipped 1 |
| First references | 65,491 ms |
| Iterations 2–10 | 37,38,37,31,35,41,35,31,33 ms |
| Unsaved-comment references, version 2 | 79,556 ms |
| Normal version-2 diagnostics | same code 2307; not suppressed |
| SQL committed insertion total | 8,150.949 ms |
| Occurrences / identity / aliases / bindings | 3116.047 / 1525.705 / 60.694 / 305.749 ms |
| SQL index recreation / commit | 559.094 / 1973.048 ms |

Executed occurrence/identity/alias/binding counters are unchanged:
637203/175120/3662/20516. Both misses still reject the constructor seed and
finish 14 complete-scope batches; nine result-cache hits avoid those batches.
There are 2 cache misses/stores, 9 hits and 2 `sdk.selected` events, not one SDK
selection per request. These observations preserve correctness/lifecycle, but
do not admit constructor narrowing or establish a cold navigation improvement.
Independent audit checks all 2,937 UTF-16 ranges across 127 current files, with
no invalid/foreign paths. The nine hot request windows contain no recorded
batch/Program observation or new persistent semantic Worker. Across the two
misses there are 30 verifier Program observations (2 rejected seeds plus 28
completed batches), not proof of exactly 30 compiler creations. Largest
completed coverage is 1,348 project files / 2,110 total SourceFiles; the relevant
membership is 1,496 files. Large semantic closures remain despite bounded roots.
Readiness is slower than the preceding single baseline despite a smaller
measured SQL total; first/edit requests remain far above the 500 ms target.

The 1,096 external samples have 1,095 timestamp gaps: min 118 ms, median 141 ms,
nearest-rank P95 165 ms, max 306 ms; requested cadence is still 50 ms. Same-sample
product peak **1,225,367,552 bytes** at epoch 1790606662601 is Node
1,175,760,896 plus native 49,606,656 bytes. Worker threads count only inside
Node; harness/sampler are excluded. This observed product peak is **14.3% higher**
than the preceding sampled 1,072,066,560-byte baseline. Unequal host conditions
and nonrandomized one-run sampling cannot establish a causal RSS regression,
but this is explicitly **not a memory improvement or no-regression gate PASS**.
Host points are CPU speed 100→57%, scheduler 100%, swap zero, versus 100→55%
in the baseline. Endpoints do not establish continuously equal host conditions.
The separate native peak 248,242,176 bytes and sampler peak 126,976,000 bytes
are not added to the product peak. Normal diagnostics arrive 2,751 ms after the
last response. The actual wire metadata contains 98 entries, no drops,
11 references requests and no workspace/document-symbol requests.

| New run artifact | SHA256 |
| --- | --- |
| [.json](../../.bench/anchor-reuse-2026-09-28/menu-identity-sql-reuse-C-1.json) | `c6371f69dc9ca99d4eae90672d515e84e85c68798f6040932a9b6deac72b3d78` |
| [.invocation.json](../../.bench/anchor-reuse-2026-09-28/menu-identity-sql-reuse-C-1.invocation.json) | `90494b9d0b2ad0c425a37046ae9cf540b0e558ed6a1b661f9c4d9ffe8143957e` |
| [.log](../../.bench/anchor-reuse-2026-09-28/menu-identity-sql-reuse-C-1.log) | `82123968e5c8e8e810e3a16a1e67a49f5713f5bc096bd0fdc50a9795b98ea40c` |
| [.sql.ndjson](../../.bench/anchor-reuse-2026-09-28/menu-identity-sql-reuse-C-1.sql.ndjson) | `8d89f75d60ebf6a28b560008b154ef8566929a0dc8509766ac62cb3219fc37b3` |
| [.progress.ndjson](../../.bench/anchor-reuse-2026-09-28/menu-identity-sql-reuse-C-1.progress.ndjson) | `0588013ff404e24feb5c9b43f1215a99981600256c1372d36e0d7747cffafc82` |
| [.stages.ndjson](../../.bench/anchor-reuse-2026-09-28/menu-identity-sql-reuse-C-1.stages.ndjson) | `2e4e917bd9c37b5693e2b0a4978d0a751967e671581a37619d06a6d39e9cf585` |
| [.host.ndjson](../../.bench/anchor-reuse-2026-09-28/menu-identity-sql-reuse-C-1.host.ndjson) | `b832ce71de7f4e11398f596ce0651bc8d3f19f41ba366cc0b4b9e5bf5bf7bca3` |

For a new-native replay, use the retained engine command above with this new
manifest, `--sidecar /Users/liuhui/Documents/code/arkts-language-server/target/release/arkts-index-sidecar`,
and a new unused output/trace stem. The matching native pin is required;
neither command promises the previous observations.

## Original whole-fast gate and isolated rechecks

The full `pnpm check:fast` retains the original negative-SDK control
`ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927`,
normal diagnostics, assertions and deadlines. Typecheck/build pass; the Node
gate is **FAIL: 1,090/1,093 PASS, 3 FAIL, exit 1**, zero cancelled/skipped/todo,
duration 2,539,744.050641 ms. Deliberately failing skip/todo child transcripts
inside runner-policy tests are not skipped/todo cases in this final count.
The original constructor characterization passes (331,203.869887 ms across
four profiles); its individual references deadline stays 30 s.

| Failed public case | Recorded exception | Meaning / limit |
| --- | --- | --- |
| Nested workspace watched create | response 2 timeout, original 5 s | Definition wait; both the first warm and the fresh process use ID 2, so the failure cannot establish which one timed out or that mutation was never executed. Post-create warm definition uses ID 3. |
| Lockfile retarget with unsaved consumer | response 2 timeout, original 5 s | Same warm/fresh ID ambiguity; post-mutation warm definition uses ID 3. No stale-definition assertion diff is recorded. |
| Batched cancellation and recovery | response 2 timeout, original 30 s | Cancellation ID 100 and its no-partial assertions pass; recovered request 2 completes 17/21 batches and starts batch index 17 before the deadline. Recovery completeness remains unverified. |

The recovery trace reports 55 SourceFiles (3 project, 52 other,
0 SDK) in the last completed batch. It is not a 503-file SDK or a demonstrated
retention failure. Its worker-startup receipt field includes scheduling/loading,
not pure thread-creation CPU. The timeout is not an exact-reference diff PASS.

At 23:20:09 +0800 a read-only `pmset -g therm` observation reports CPU speed
limit 28%, scheduler 100%, 12 available CPUs; the preserved later point at
23:27:49 repeats those values. These are sparse observations, not a continuous
control, and do not prove thermal restriction is the exclusive failure cause.
No power setting, unrelated application, timeout or semantic policy is changed.

| Gate artifact | SHA256 |
| --- | --- |
| [Full original gate](../../.bench/anchor-reuse-2026-09-28/identity-sql-check-fast.log) | `6b1581a21f3fbbc852efe592c786e9a0adf89dee81a336bebded19905e1e4e75` |
| [Preserved thermal point](../../.bench/anchor-reuse-2026-09-28/identity-sql-check-fast-thermal.log) | `7ebd33eb777ee0e7ea0c8b905472a5391299f9d63f00c5c1d33fa6afb7962c0b` |

Isolated rechecks are sequential, use the same artifacts/environment and
unchanged tests/deadlines, and are recorded separately below. No merge
readiness, constructor admission, SDK/default promotion or final latency/memory
graduation follows from the allocation test, replay or focused recoveries.

Original-deadline isolated rechecks, after the full gate has terminated and
without concurrent builds/benchmarks:

| Public case | Result / whole-case duration | Artifact SHA256 |
| --- | --- | --- |
| Nested watched create | 1 PASS, exit 0; 5,446.278801 ms | [log](../../.bench/anchor-reuse-2026-09-28/identity-sql-nested-create-recheck-1.log): `a73ab12d47527c91777afbed8dbd1e95ee3cd9cdc0e86cc13d65fda4e38c31d0` |
| Lockfile retarget / unsaved consumer | 1 PASS, exit 0; 5,102.441764 ms | [log](../../.bench/anchor-reuse-2026-09-28/identity-sql-lockfile-recheck-1.log): `8f34111e3c1381fa5f9e466690d892a5535c97e2f10267b914ac146f117d6ce1` |
| Batched cancel / recovery | 1 FAIL, exit 1; 33,610.475182 ms | [log](../../.bench/anchor-reuse-2026-09-28/identity-sql-batch-cancel-recheck-1.log): `ab1eac84658bce2a8326076c1f8919d23a098b374c737fdf5978180f09b919f8` |

The isolated recovery repeats response-2 timeout after cancellation passes:
17/21 batches complete, batch index 17 starts at elapsed 29,321.66 ms. Last
completed batch has the same 55/3/0 total/project/SDK file census, worker-startup
receipt 903.360 ms, Program-ready 768.826 ms, query 97.399 ms, duration 1,796.53 ms.
These last-batch fields do not decompose every attempt or prove one exclusive
cause. The unchanged tiny recovery case now has repeatable timeout evidence;
it does not establish missing references or a SDK-loading failure.

The exact-name commands use the installed Node with `--test --test-concurrency=1`
and `--test-name-pattern` against the original respective test files, retaining
the same negative-SDK control. No requests, assertions, fixture membership or
per-request timeouts are rewritten to recover these cases. Focus is **2 PASS /
1 FAIL**, not whole-fast GREEN.

The subsequent sequential control points `ARKTS_INDEX_SIDECAR_PATH` at the
archived old native `1cd57b…`, without overwriting the active `f8b9e0…` release.
It also fails response 2 at the original 30 s deadline after successful
cancellation: whole-case 33,759.754586 ms, exit 1, zero cancelled/skipped/todo.
Recovery completes 19/21 batches and starts index 19 at elapsed 29,730.56 ms;
the last completed batch again has 55/3/0 total/project/SDK files. Its receipt /
Program-ready / query fields are 768.392 / 635.327 / 83.339 ms. This requested
old-native control reproduces the same failure class without replacing the
production binary; it is not a randomized latency comparison or a no-regression
certificate. Catalog generation/coverage is not certified by its truncated
stderr. The failed recovery still has no completed 43-Location assertion.

[Old-native control log](../../.bench/anchor-reuse-2026-09-28/identity-sql-batch-cancel-old-native-control-1.log)
SHA256: `f329b344a453fca9f63b4988997b7738d5e2bd77947983975b0c6d9baa3fb95f`.

Original-case replay command for the active native (after the documented build,
with no timeout/fixture/assertion changes):

```sh
cd /Users/liuhui/Documents/code/arkts-language-server
env ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927 \
  ARKTS_INDEX_SIDECAR_PATH=/Users/liuhui/Documents/code/arkts-language-server/target/release/arkts-index-sidecar \
  /Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test --test-concurrency=1 \
  --test-name-pattern='^cancelling batched references stops the active verifier without poisoning recovery$' \
  tests/semantic/references-batching.test.mjs
```

For the old-native control, replace only the sidecar path with
`/Users/liuhui/Documents/code/arkts-language-server/.bench/anchor-reuse-2026-09-28/arkts-index-sidecar-before-identity-sql`.
Neither command promises a particular result under different host conditions.
Regression recovery remains the next gate, before any constructor admission or
candidate exclusion. No forced GC, larger deadline, disabled diagnostic,
resident verifier, scope change, commit, push or merge is performed.
