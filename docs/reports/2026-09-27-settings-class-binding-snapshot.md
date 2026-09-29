# Settings validated class-binding snapshot prerequisite

Status: **storage/correctness regression PASS; constructor narrowing, ≤500 ms
and memory no-regression graduation remain open**. No performance improvement
or completed 5 GB fix is claimed.

## Completed implementation boundary

[Public TDD contract](../tdd/references-class-binding-snapshot.md): bounded URI
inputs return source-validation provenance, heritage and lexical bindings from
one committed generation in MemoryStore and SQLite. Existing binding rows are
reused; no second binding table/DB/TypeChecker. Schema 10→11 / 110→111 retains
old search behavior but leaves legacy provenance unknown. Unsupported syntax
cannot expose lossy old bindings as validated. Same-generation reads, reopen,
rollback/rejection/removal and queued migration opens pass.

This closes storage only. There is **no new sidecar query or planner consumer**,
no overlay admission, constructor candidate exclusion, SDK/default/Worker or
memory-policy change. Persisted lexical facts still need compiler confirmation.

- Rust workspace: **128 PASS / 1 existing ignored release fixture**, zero fail.
- Experimental snapshot/heritage/migration/layout: **19/19 PASS**.
- Release sidecar, `pnpm check` / `pnpm build`, format/diff checks: PASS.
- Real child-process framed stdio: **9/9 PASS**, 51,169.541 ms suite duration.
- Introduced repeated per-class tokenization was found by the existing
  5,000-export fixture and removed under GREEN characterization. Final store
  contract 22/22 in 2.91 s; focused export test 1/1 in 0.48 s. The earlier
  introduced slowdown was 87.07 s for the store suite, not references latency.
- Remaining oversized debt: core lib 1,630→1,603, SQLite lib 1,856→1,743,
  store contract 1,647→1,524. Cohesive extractions preserved public behavior;
  all new source/test/script files ≤500 physical lines.
- No new whole-fast-suite gate, commit/push/merge; existing dirty work preserved.

## Frozen environment and real references replay

Server HEAD `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`. Clean Settings
`ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-row-counts.BPJdST/project`; declared SDK 23/20/20
unchanged. User-approved API24 / 6.1.1.125 SDK at
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
Node v26.3.0 / ohos-typescript 4.9.5-r10 / pnpm 8.3.1 / Darwin 25.6.0 x64.
This does not assert API23/DevEco diagnostic equivalence.

[Artifact manifest](../../bench/references/manifests/settings-menucontroller-binding-snapshot-api24.json)
pins unchanged TS server/Worker/stdlib assets and rebuilt sidecar
`8c0df8dd839ea037fb7d1365acdcfa1681b1275254baf4337b3df3859217a954`.
Launch is the pinned Node with `dist/server.cjs --stdio`. Query:
`common/src/main/ets/core/controller/MenuController.ets`, `MenuController`,
zero-based UTF-16 **90:17**, `includeDeclaration=false`; distinct **267-location
constructor oracle**, not the class-export oracle.

One fresh process/index-cold A replay waits for catalog ready, opens the file,
then first semantic request is `textDocument/references`. No workspace/symbol
or documentSymbol request. Normal automatic diagnostics stay enabled, with
external RSS sampling and no overlapping tests/build, forced GC or snapshot.
Experimental flags are explicit; this is not production default promotion.

| Observation | Value |
| --- | ---: |
| Request → response | **53,336 ms** |
| Exact/legal Locations | **267**, no missing/extra/error |
| Catalog | 1,846/1,846 indexed, 1 entry skipped |
| Rejected / completed verifier attempts | 1 / 14 |
| Membership / maximum Program project files | 1,496 / 1,348 |
| Full-search early-completion proof | 0; all conservative batches execute |
| Program readiness across all attempts | **44,574.31 ms (~83.6%)** |
| createProgram / query / startup sums | 37,548.05 / 1,830.80 / 3,891.34 ms |
| External Node PID peak RSS | **840,290,304 bytes** (~801 MiB) |
| External product-tree peak RSS | **883,437,568 bytes** |
| External samples / actual spacing | 596 / 95–273 ms |
| Sampler peak / harness timeline max RSS | 117,002,240 / 78,192,640 bytes |

RSS requested period is 50 ms; actual gaps are reported above. Worker threads
are part of the same Node PID, not added again. Sampler/harness are excluded
from product memory. Sampling may miss between-sample peaks; no PSS or
retention conclusion follows from this curve. Phase sums are descriptive,
not claimed mutually exclusive.

The previous base-binding smoke had sampled Node peak 691,609,600 bytes; this
single run is **21.5% higher**. The TS artifacts/strategy are unchanged, but
this does **not** establish the cause or pass a memory no-regression gate.
Likewise 53.336 s versus the previous 59.322 s is not a statistically established
latency gain. No release/default graduation is justified by one sample.

Normal version-1 TS2307 diagnostic for unresolved `@ohos.systemparameter`
arrives 1,987 ms after references response. Graceful exit 0; no timeout/OOM/
partial success. ≤500 ms is explicitly **FAIL**. The new snapshot has no
references consumer, so this is a compatibility regression smoke only.

Raw external curve, request transcript, phases and exact Locations:
[menu-binding-snapshot-A-1.json](../../.bench/anchor-reuse-2026-09-27/menu-binding-snapshot-A-1.json).
SHA256 `3663e209136d8171dbd42a22794388650fa5c05cdc4d872124da48ab03f1758c`.

Replay with a fresh output filename:

```sh
ARKTS_REFERENCES_ANCHOR_REUSE=0 \
ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=1 \
ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=1 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 90 --character 17 --exclude-declaration \
  --oracle bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-menucontroller-binding-snapshot-api24.json \
  --out .bench/anchor-reuse-2026-09-27/menu-binding-snapshot-A-2.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

Next: current-overlay admission and consuming the immutable binding snapshot,
then compiler-backed inherited/factory/own-constructor coverage before any
narrowing. Original >3 GB reproducer and final memory graduation remain open.
