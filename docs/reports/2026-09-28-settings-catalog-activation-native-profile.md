# Settings catalog activation: phase and native-stack diagnosis

Status: **two new FAILs / exit1 before didOpen or references**. The original
180 s catalog-ready gate is unchanged. This diagnoses the blocking stage;
it is not a references result, optimization, 500 ms pass or restored whole-fast.
The [previous two mode-C failures](2026-09-28-settings-mode-c-catalog-blocked.md)
remain separate evidence. Their exact native substage is not retroactively known.

## Fixed input and scope

Parent `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`. All inherited changes are preserved.
No production source, assertions, build, deadline, diagnostics, semantic scope,
SDK/default/cache/Worker policy, commit, push or merge changes are made.
Two ignored local wrappers delegate the existing `replay-references.mjs`,
LspSession and independent process-tree RSS sampler; they are 50/192 lines.

Settings remains clean at `ecc550dfaed880e04e38a2477eb7235cd50475b9`, in
`/private/tmp/arkts-settings-row-counts.BPJdST/project`. Selected SDK is
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`,
API24/6.1.1.125, digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`:
approved compatibility track, not API23 equivalence. The query remains
`MenuController.ets` constructor, zero-based UTF-16 **90:17**, declaration off.
[Manifest](../../bench/references/manifests/settings-menucontroller-source-availability-consumer-api24.json)
and 267-tuple oracle retain their prior hashes. Node v26.3.0; mode C;
indexed-batched/closure/full SDK, roots64, anchor reuse0/local-export seed1/
conservative units1, retention `dispose`, budget1,024 MiB, trace1, compile
cache disabled. Request/diagnostic/ready deadlines180,000 ms and idle1,000 ms.

Only existing opt-in `ARKTS_INDEX_CATALOG_TRACE=1` and
`ARKTS_INDEX_CATALOG_SQL_TRACE_FILE=<fresh file>` are added. The first run has
phase/after-commit trace only. The second additionally uses a private TMPDIR
for ownership, reads DB/WAL sizes without opening SQLite, and samples the
validated owned Rust sidecar once. No forced GC, heap snapshot or user app
termination. Observation and TMPDIR placement prevent performance A/B claims.

## Actual outcomes

| Observation | Phase-only C-1 | Native-observed C-1 |
| --- | ---: | ---: |
| Server / sidecar PID | 6732 / from raw RSS | 9380 / 9385 |
| discovering → activating | 3,423.508251 ms | 5,231.054170 ms |
| activating counts | discovered/indexed/total1846 | discovered/indexed/total1846 |
| Building / committed generation | 1 / 0 | 1 / 0 |
| initialize complete → catalog failure | 180,637 ms | 180,919 ms |
| Ready / terminal observed | Neither | Neither |
| References responses / diagnostic | 0 / null, not reached | 0 / null, not reached |
| Server shutdown / exit | null / exit0, no signal | null / exit0, no signal |

Phase times are **Node receipt-callback monotonic intervals**, not Rust CPU,
pure parse time or SQL durations. The native stage transition establishes
that directory discovery, source reads and parsing have finished before
activation. `activating` itself precedes opening another SQLite connection,
validation, inserts, index recreation, metadata and final commit. It does not
by itself establish entry into a transaction or `COMMIT`.

Both runs throw at the existing ready gate, before diagnostic subscription,
didOpen and the references loop. They did not evaluate 267 Locations, cache
hits/edit invalidation, normal diagnostics or binding consumption. The log's
fixed `REQUEST=textDocument/references` label is intention, not a sent request.
Neither run writes an SQL trace. That observer writes only after successful
commit and ignores IO errors; absence is **not** proof of commit deadlock.

## Native attribution: insertion, not a sampled commit

Ownership is independently checked by `ps` immediately before sampling:
replay Node9285 → server Node9380 (`dist/server.cjs --stdio`) → exact release
sidecar9385. Only that sidecar is sampled, once, for nominal2 s at5 ms.
The sample command completes successfully in9,579.665 ms including startup/
symbol processing. The independent15 s wall watchdog and16 s hard stop did
not fire; they can terminate only the spawned sampler, never the server.

The retained `arkts-catalog-1` thread has329 sampled ticks, all below:

```text
catalog::scan_workspace
  → WorkspaceIndex::activate_catalog
  → catalog_replace::replace_all
  → reference_insert::insert_reference_documents
```

The sample establishes **reference-index insertion during this short window**.
Named occurrence-identity insertion accounts for90 retained ticks:87 SQL
execute and3 join/free/bind ticks. Other generic Statement execution frames
cannot identify a particular table just by release offsets. Five ticks enter
Rust unstable quicksort, so not all329 are SQL execution. The main protocol
thread's `recv_timeout` plus heartbeat is consistent with a separate active
catalog thread, not proof that the catalog is only resending notifications.

There are185 catalog-thread `pwrite` leaf hits. Many caller chains include
`pagerStress → pagerWalFrames → unixWrite → pwrite`: transaction cache spill,
not final commit. There is no sampled `Transaction::commit` caller. Do not
sum these ancestor/leaf counts, call them CPU percentages or extrapolate this
window into the entire180 s wait. A later commit/checkpoint could still be
expensive; it is not sampled by this one-window observation.

The private WAL physically grows through the activation interval; its maximum
observed length is **294,073,272 bytes** before shutdown. This independently
shows continuing database work, not committed generation readiness or total
bytes written/write amplification. No query, checkpoint, PRAGMA or durability
setting is changed. Database files disappearing at cleanup is not a memory
eviction benefit or a certified cancellation of an activating transaction.

## Memory and host limitations

| Observed sampled peak / gap | Phase-only | Native-observed |
| --- | ---: | ---: |
| Node RSS | 25,935,872 B | 27,947,008 B |
| Sidecar RSS | 147,959,808 B | 90,701,824 B |
| Product tree RSS | 159,887,360 B | 99,880,960 B |
| RSS sampler, excluded | 62,939,136 B | 61,259,776 B |
| Harness timeline max, not continuous | 11,669,504 B | 12,034,048 B |
| Additional observer max, excluded | Not sampled separately | 66,670,592 B |
| Samples / actual median gap | 517 / 321.5 ms | 209 / 663 ms |
| Actual gap P95 / max | 598 / 1,112 ms | 2,290 / 4,351 ms |

Nominal50 ms sampling is sparse in practice; short peaks may be missed.
Separate PID peaks cannot be added. Node Worker RSS is counted once. Native
sample physical footprint208.5M is a different macOS metric, not another RSS
contribution. Low pre-reference RSS does not prove a references memory saving.
Bounded transcripts do not retain all progress payloads or complete history.

The second observer's non-atomic host snapshots show CPU speed limit55→46%,
swap used8,926.25→8,867.50 MiB, and wired pages3,636,448→3,623,468 of4,096 bytes
on16 GiB. Host paging, pressure and observer overhead are real confounders,
not a demonstrated sole cause or permission to stop applications. This is
not a matched lower-pressure regression benchmark.

## Verification and next boundary

Existing real child-process/framed-LSP characterization is GREEN:

```sh
NODE_DISABLE_COMPILE_CACHE=1 node --test --test-concurrency=1 \
  tests/semantic/index-catalog-phase-trace.test.mjs
```

1 PASS/0 FAIL,5,057.516253 ms; it proves opt-in/no-duplicate phases and usable
post-ready search with its scripted sidecar, **not real Settings readiness**.
Wrapper syntax checks pass. After both runs, all six runtime/test pins and
project/manifest/oracle pins match; `git diff --check` is checked separately.
No fresh whole-fast GREEN is substituted for the retained1,078/1,093 failure.

Next target is real catalog activation/reference writes, with their row
volume and storage/host contribution distinguished by the existing trace in
a lower-pressure same-input run. The native evidence does not justify a
blind commit/GC/Worker optimization or changed durability. Original readiness,
constructor30 s and whole-fast gates still precede any candidate exclusion.
No new constructor admission or default promotion follows from this diagnosis.

## Retained evidence

All below are under `.bench/anchor-reuse-2026-09-28/`; outputs are guarded.
Invocation JSON records full executable/arguments/flags; reruns must use new
unused output/SQL paths, preserve the original180 s gate and record any
observation placement. The raw JSONs hold request timeline/RSS, and native
observer NDJSON holds ownership, sample lifecycle, live WAL stats and host.

| Artifact | SHA256 |
| --- | --- |
| `menu-catalog-phase-C-1.json` | `104ed491f4bc489c718a195f252025fd46da5702cdbf15c10dfd895eb2bd9a24` |
| `menu-catalog-phase-C-1.invocation.json` | `92edb8ac23b8ca0df1e6296e755f4455e8223735dbe23cf25f4b64ee2e329207` |
| `menu-catalog-phase-C-1.log` | `9a7a23938695bf42952420e06665ba4d972782dc3c15f37a790c9548baf7a7de` |
| `menu-catalog-phase-observer.mjs` | `d348c42c5f16ee52252c845f1178c8b1162867f334a4924b813967f758f602fc` |
| `menu-catalog-native-C-1.json` | `94fc8fa6492952623916a7b22c81d4c7e81f16f0d3d218f9961ae72de4ef6c68` |
| `menu-catalog-native-C-1.invocation.json` | `e37c6b20372c31e59bdfb994bd00309d6ca734278a6273b3f8aab51cc727cf12` |
| `menu-catalog-native-C-1.log` | `692dbab0d203403ed58b48937c866cdc455d9a38bef5d04819ceb6b985c2cca4` |
| `menu-catalog-native-C-1.observer.ndjson` | `b5b45c05efab4e29e48f8c3c8e311c6417256b627474cc390e0e9092f6ded789` |
| `menu-catalog-native-C-1.sidecar.sample.txt` | `85af62d17392cb8a443192fba7619de8dad8c8336bc1abe8a87155b34ddfa90b` |
| `menu-catalog-native-C-1.server.log` | `f4afb46e7e6c249328e07b9fb68f254fb64e7dc630721599948b37f2798d93a2` |
| `menu-catalog-native-C-1.summary.json` | `0ffa187523d2b1e2555bfeb8bd5dd49a09ffd52d9521f10941751178e2cb6153` |
| `menu-catalog-native-observer.mjs` | `d65ce3c80756e37ef385f36be13626c8f67ddd111a305929fb122acce2489ae9` |
| `catalog-phase-public-characterization.log` | `96602d610a95a78f35a5eb71b997aad0ac23f08a5b1582a788388a7d90edafd4` |
