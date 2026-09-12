# References occurrence-proof query report

Date: 2026-09-13  
Parent revision: `0065d2ec888cc47d3fde7ecea11adf431a1ff742`  
Branch: `codex/reference-proof-query-performance`

## Outcome

The million-occurrence candidate query now completes well inside the unchanged 15-second product
timeout. The fixed Photos `PhotoAsset` LSP replay completes all 11 bounded compiler batches and
returns the exact nine-location legacy oracle. The production default remains `legacy` because the
full request still takes 201.304 seconds when identity proof must stay conservative.

This slice changes neither reference admission nor compiler verification. It stores one proof row
per distinct `(name, document URI, qualification)` class while retaining every original occurrence
and UTF-16 range in the existing table. SQLite schema v7 migrates v6 data in place and continues to
use the same database and generation lifecycle.

## Reproduction and diagnosis

Fixed environment:

```text
workspace: /private/tmp/applications_photos-6.1-lts
commit:    98ea1d9cd6a363c576e2c6ff17844e51723baec5
SDK:       /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony
API:       24
Node:      26.3.0
target:    common/src/main/ets/default/view/browserOperation/RecoverMenuOperation.ets
symbol:    PhotoAsset
position:  82:26 (zero-based UTF-16)
request:   textDocument/references, includeDeclaration=true
```

The fixed database contains 1,794 documents, 1,096,191 occurrences, 19,136 bindings, 1,352 alias
edges, and 2,634 exports. Before this slice, the same direct candidate request took 14.206 seconds
cold and 3.334 seconds immediately repeated. Default-off stage timing then isolated 15.340 seconds
of a 16.543-second cold query to occurrence loading: 95,541 admitted rows were decoded even though
identity proof only consumes name, URI, and qualification.

The first experiment merely reused the 203 already-scoped alias names for later SQL queries. It did
not improve the workload and was not accepted as the fix. A covering occurrence projection reduced
the proof input to 13,967 distinct classes. The final model stores that projection explicitly:

```text
raw reference_occurrences:       1,096,191
reference_occurrence_identities:   200,319
Photos cache size:                    448 MiB
```

On a freshly rebuilt final-schema cache, the direct request took 0.864 seconds cold and 0.270
seconds repeated. Its occurrence stage took 0.362 seconds cold and 0.063 seconds repeated. Result
shape was unchanged: 203 names, 824 admitted bindings, 1,131 conservative URIs, and
`identityComplete=false`.

The two remaining unresolved relative edges are both `BusinessError` imports of missing
`./@ohos.base` from project-contained SDK mirror declarations:

```text
common/src/main/ets/sdk/openharmony/ets/api/@ohos.power.d.ts
common/src/main/ets/sdk/openharmony/ets/api/@ohos.window.d.ts
```

They remain unresolved; this slice does not invent a project boundary or classify them by path.

## TDD and verification

The first RED was recorded against parent `0065d2e`:

```text
cargo test -p arkts-index-sqlite \
  scoped_reference_queries_reuse_the_proven_names_without_scanning_aliases
```

Hardened tests require scoped binding and occurrence queries to avoid rebuilding the global alias
graph, require the occurrence query to use the covering proof-identity index, and verify v6-to-v7
migration without changing candidate results. Memory and SQLite stores deduplicate equivalent proof
classes before the same binding-chain algorithm.

GREEN command:

```text
cargo test -p arkts-index-core -p arkts-index-sqlite -p arkts-index-sidecar
```

Result: index-core 16/16, SQLite unit 2/2, SQLite store contract 18/18, sidecar protocol 25/25;
the separately gated real-fixture test remains ignored unless explicitly configured.

## Final real LSP replay

The final schema was rebuilt from an empty per-run cache. The sidecar candidate query was accepted
without timeout or fallback. Compiler source resolution classified 466 bindings, including every
SDK edge; only the two relative edges above remained unresolved. The proof therefore correctly
used all 1,154 conservative compiler candidates and 11 sequential batches.

```text
status:                    completed
normalized legacy equality: true
references:                9
request time:              201,303.599 ms
peak product RSS:          659,488,768 bytes
batch count:               11
program project files:     32..577 per batch
unresolved SDK bindings:   0
unresolved relative:       2
```

Every batch found the same nine exact locations; final merge/deduplication matched the locked legacy
oracle by URI and UTF-16 range. The successful raw report is retained locally as
`/private/tmp/arkts-photoasset-proof-query-final.json`; no user source or temporary cache is added to
the repository.

Status: **candidate-query gate GREEN; real LSP correctness and bounded-memory replay GREEN;
production latency gate FAIL**. The next slice must address the two unresolved project-contained SDK
mirror edges or otherwise make declaration identity narrower through an authoritative boundary. It
must not increase timeouts, discard candidates, weaken compiler proof, or switch the default strategy.

## Release-gate follow-up

The first PR validation exposed a cold-catalog regression in the pinned 455-file fixture: the new
projection initially maintained both the raw occurrence name index and the identity name index row by
row, and CI measured 3.350 seconds against the unchanged 3-second gate. The failure reproduced locally
at 3.51--3.59 seconds. The final implementation batches identity rows, builds their covering index once
at the end of the same atomic full-catalog transaction, and routes name-only reference discovery through
that projection. The raw occurrence table remains the authoritative UTF-16 range store but no longer
maintains a redundant name index. The pinned fixture then passed the unchanged gate in three consecutive
local runs; migration, exact-result, rollback, and focused Rust suites remained green.
