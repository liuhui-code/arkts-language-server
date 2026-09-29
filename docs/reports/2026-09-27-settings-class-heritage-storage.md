# Settings class-heritage storage prerequisite

Status: **storage/generation/reopen PASS; fixed references exactness PASS;
cold ≤500 ms FAIL**. No constructor candidate narrowing or speedup claimed.

## Implemented and verified

[TDD evidence](../tdd/references-class-heritage-storage.md): optional lexical
facts now persist through the existing MemoryStore/SQLite transactions and
public read API. Production schema 9→10, experimental 109→110. Old facts stay
unknown until refresh; unknown/partial/known-empty are distinct. Reopen,
ordered UTF-16 ranges, replacement/rejection/deletion, invalid input, rollback
and concurrent migrations are covered. The migration's duplicate-column race
was reproduced before moving the marker/version check under the write lock.
No sidecar protocol/planner/semantic/default/SDK/Worker/memory-policy change.

- Rust workspace: **105 PASS**, **1 existing ignored release fixture**, 0 fail.
- Experimental metadata/migration/profile suites: **10/10 PASS**, 0 fail.
- Existing store characterization: **24/24 PASS** after cohesive extraction.
- Release sidecar, Node v26.3.0 `pnpm check` / `pnpm build`: PASS.
- Actual child-process framed stdio (production index, completed search scope,
  conservative semantic units): **9/9 PASS**, 51,655.721 ms, zero skips/failures.
- Format and diff checks: PASS. No new whole `pnpm check:fast` result claimed;
  prior 1,000-test GREEN is the preceding coverage slice, not this build.

New source/test modules ≤500 physical lines. Existing migration debt shrinks:
core lib 1,973→1,683; SQLite lib 2,140→1,856; old store test 1,671→1,647.
No reset/commit/push/merge; other uncommitted changes preserved.

## Frozen environment

Server parent HEAD `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`; built artifacts pinned in the
[new manifest](../../bench/references/manifests/settings-menucontroller-heritage-storage-api24.json).
TypeScript server/Worker artifacts are unchanged from the coverage build;
sidecar SHA256 is
`370bc2e323daf85ca3e7d924fd171e9577816f2dbeb0aedfbb064985bdb334e5`.

Clean Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-row-counts.BPJdST/project`. Project's declared
SDK 23/20/20 unchanged. Selected SDK
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`,
API24 / 6.1.1.125, digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
This is the user-approved compatible API24 comparison, not API23/DevEco
diagnostic equivalence. Node v26.3.0, ohos-typescript 4.9.5-r10, Intel Mac.

Query: `common/src/main/ets/core/controller/MenuController.ets`, MenuController
constructor at zero-based UTF-16 **90:17**, `includeDeclaration=false`.
The distinct 267-location oracle remains unchanged; not the 247 class oracle.

## Same-build real replay

One new process/index-cold A run with normal automatic diagnostics, external
RSS sampling, no overlapping tests/build, no forced GC or heap snapshot, no
project boundary edits. Experimental anchor/grouping flags remain opt-in.

| Observation | Value |
| --- | ---: |
| LSP method | `textDocument/references` |
| Request → response | **56,953 ms** |
| Exact/legal Locations | **267**, no missing/extra/error |
| Catalog | 1,846/1,846 indexed; 1 entry skipped |
| Rejected / completed verifier batches | 1 / 14 |
| Original membership / max Program project files | 1,496 / 1,348 |
| Early full-search completion | 0; all conservative batches run |
| All attempts' Program readiness | 47,451.11 ms (~83.3% of request) |
| All attempts' createProgram / query / startup | 39,314.11 / 1,932.25 / 4,036.45 ms |
| Target Node PID peak sampled RSS | **748,716,032 bytes** (~714 MiB) |
| Product process-tree peak sampled RSS | **795,115,520 bytes** |
| External samples / actual spacing | 341 / 168–491 ms |
| Sampler peak / harness timeline max RSS | 113,991,680 / 73,908,224 bytes |

Requested sampler period is 50 ms; external `ps` overhead produced the actual
spacing above, so peaks between samples may be missed. Worker RSS is not
summed twice. Harness/sampler memory is separate from product memory; phase
sums are descriptive and not assumed mutually exclusive.

Normal version-1 diagnostics publish 2,051 ms after the response: the existing
TS2307 unresolved `@ohos.systemparameter` diagnostic. Graceful server exit 0;
no timeout/OOM/partial response. One sample cannot establish P95, retention,
memory no-regression or attribute any difference to this storage change.

Raw curve/timeline/Locations:
[menu-heritage-storage-A-1.json](../../.bench/anchor-reuse-2026-09-27/menu-heritage-storage-A-1.json),
SHA256 `3facdc76362d7ab80917247858cd07d06077810a56502d3bf74e5f22af5b3725`.
Historical manifests/runs were not overwritten.

Re-run with a fresh output filename (the tool refuses overwriting evidence):

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
  --manifest bench/references/manifests/settings-menucontroller-heritage-storage-api24.json \
  --out .bench/anchor-reuse-2026-09-27/menu-heritage-storage-A-2.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

## Next gate

Persisted spelling is not inheritance identity or constructor completeness.
Next: unique base bindings/aliases/re-exports, then compiler-backed proof for
inherited `super`, transitive `new Leaf`, static `new this()` and explicit
constructor barriers. Unknown/unsupported facts keep complete scope.
Cold/edit ≤500 ms, original >3 GB reproducer and final memory gates remain open.
