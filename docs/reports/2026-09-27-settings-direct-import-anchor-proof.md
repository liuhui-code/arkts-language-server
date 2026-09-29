# Settings direct-import anchor agreement

Status: **correctness repair; real-project smoke PASS; cold/edit latency gate
still FAIL**. This does not complete constructor candidate modeling or the
original >3 GB reproduction / 50% memory gate.

## Finding and repair

The public [RED/GREEN transcript](../tdd/references-direct-import-anchor-proof.md)
finds a real false negative in the current dirty implementation: direct import
candidate discovery identifies an exported class at `new Maker()`, but the
compiler's actual definition is its constructor. Class-name candidates omit
an indirectly inherited constructor call spelled `new Leaf()`.

Direct candidates now carry a declaration position from matching, ready export
metadata. Every final compiler batch proves that the original cursor resolves
to that position. Mismatch discards partial work and retries complete semantics.
This is a mandatory safety check, not enabling the experimental local-export
seed, constructor/class normalization, an occurrence-only final answer or
`identity` dependency profile. Metadata lookup rechecks ready generation;
an index returning to warming cannot narrow from its old committed generation.

## Frozen real project

- Server HEAD `9f91122ac504365c57473a430094da09baac9309`, existing dirty tree;
  branch `codex/references-f2-fixed-benchmark`. No user edits overwritten.
- Settings clean SHA `ecc550dfaed880e04e38a2477eb7235cd50475b9`, checkout
  `/private/tmp/arkts-settings-row-counts.BPJdST/project`.
- Node v26.3.0, pinned `ohos-typescript` 4.9.5-r10, macOS Darwin 25.6 x64.
- SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`,
  ETS API24 / 6.1.1.125, digest
  `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
  Project declarations stay 23/20/20; explicit API24 compatibility experiment,
  not exact DevEco/API23 equality.
- Query `common/src/main/ets/externalmenu/ExternalMenuController.ets`,
  inherited `MenuController`, zero-based UTF-16 **40:45**,
  `includeDeclaration=false`. It resolves to the class, not a constructor.
- Same-position fresh legacy validates the existing complete 247-location class
  oracle; no constructor oracle substitution. The new [manifest](../../bench/references/manifests/settings-menucontroller-direct-import-proof-api24.json)
  freezes the query and all runtime assets; previous manifests are untouched.
- `indexed-batched`, closure, full SDK, 64 roots; anchor memo, experimental local
  export seed and conservative grouping all explicitly 0. No forced GC,
  truncation, source-boundary or diagnostic changes.

Read-only `pmset -g therm` at 2026-09-27 01:10:32 +0800 reports
CPU_Scheduler_Limit=100, CPU_Available_CPUs=12, CPU_Speed_Limit=100. Earlier
35/28 observations are not comparable performance runs. This snapshot does
not prove a constant clock throughout either run; no thermal settings changed.
No focused tests ran concurrently with these real replays.

## Results

| Same build | References ms | Exact Locations | Normal diagnostics | Entire replay tree/Node peak RSS bytes |
|---|---|---|---|---|
| legacy, fresh A | 8,969 | 247 | v1, 5 | 753,733,632 / 710,799,360 |
| indexed, C first | 5,556 | 247 | C ends with v2, 5 | 864,759,808 / 824,156,160 (whole C) |
| indexed, nine cache hits | 89, 51, 48, 54, 48, 54, 83, 74, 66 | 247 each | unchanged | same C run |
| indexed, unsaved comment edit | 5,175 | 247 | v2, 5 | same C run |

All **12** responses pass exact URI+range equality and legal UTF-16 validation;
exit 0, no OOM, timeout or partial success. The transcript explicitly sends
`textDocument/references`, not workspace/document symbol requests. C records
nine hits and two misses; each miss has one transient compiler batch, all with
`anchorVerified=true`, 322 project SourceFiles, 60 candidates out of 1,496
members. No standalone anchor Worker. Snapshot edit invalidates the old cache.

External sampler targets the server Node PID and process tree separately,
50 ms requested interval (actual collection intervals may vary), 146/162
samples. Worker-thread RSS is not summed again; sampler/harness memory remains
separate in raw JSON. Matched first-reference intervals have observed tree
peaks 745,664,512→644,128,768 and Node peaks 702,730,240→603,471,872 bytes.
Do not compare the entire 11-request C peak against a one-request A peak as a
memory regression/improvement. Neither is a release distribution or a
comparison against the pre-fix default binary.

Cached median is 54 ms in this burst. First/edit remain **5.556/5.175 seconds**:
the user's 500 ms target is not achieved. Constructor discovery itself is still
unsupported; the real Settings probe here is a positive class/import safety
control, while the public inheritance fixture proves the constructor fix.

## Raw evidence and replay

Raw files under `.bench/anchor-reuse-2026-09-27/`, including RSS samples,
request/diagnostic timelines, exact results, effective environment and logs:

- `menu-import-proof-legacy-A-1.json` SHA256
  `77cede05924cfe84dc3d49b579c0fb9fc5f077a9c543e57c9374c1867311dad7`.
- `menu-import-proof-indexed-C-1.json` SHA256
  `0533decfcf726f72fe3ab61a90a805fdeaefa284f6f70af7e2bddd4cc5df60f1`.

```sh
ARKTS_REFERENCES_ANCHOR_REUSE=0 \
ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=0 \
ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=0 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/externalmenu/ExternalMenuController.ets \
  --symbol MenuController --line 40 --character 45 --exclude-declaration \
  --oracle bench/references/oracles/settings-menucontroller-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-menucontroller-direct-import-proof-api24.json \
  --out .bench/anchor-reuse-2026-09-27/menu-import-proof-indexed-C-new.json \
  --mode C --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

Manifest rejects changed binaries; build changes require a new manifest rather
than overwriting this run's pins. No commit, push, merge or default promotion.

## Final verification

Authorized `pnpm check:fast` against the final implementation: **993/993 PASS**,
zero failures, cancellations, skips or todos; exit 0, 880,927.574 ms.
The nested SKIP/TODO transcripts are deliberate negative tests of the test gate,
not skipped acceptance cases. `pnpm check` and a fresh runtime build are included.

The first full run was RED: splitting the scripted sidecar required its two
staging tests to bundle the helper; initial-catalog fixtures needed matching
ready export metadata; sandbox process restrictions blocked three external-RSS
replay tests. Fixes preserve assertions and timeouts. Focused staging 9/9,
initial-catalog 6/6 and unchanged authorized replay 3/3 passed before the final
whole-suite rerun. No Rust/schema changes or native Windows performance claims.

`git diff --check` passes. The touched proxy shrinks 852→822 physical lines but
remains explicit migration debt; its cohesive candidate-proof helper is 45
lines. The scripted sidecar shrinks 510→451 lines, with an 80-line export helper.
Other source/test/script files changed in this repair stay at or below 500 lines.
Cold/edit 500 ms, constructor-specific candidate modeling, the original >3 GB
reproducer and final memory-release gates remain open.
