# References default-export candidate gate

## Outcome

The Rust workspace index now distinguishes a declaration's local name from its
module export slot. A named `export default class/function/struct/interface`
therefore keeps its declaration identity while imports and explicit re-exports
follow the `default` slot. The compiler remains the final authority for every
returned Location.

The proof is source-aware. A normal import records occurrences in the importing
file but does not make that file re-export the target. Only an explicit
re-export propagates an export name. An unresolved default package import stays
in the conservative set, while unrelated named package imports do not become
possible default-export edges merely because the global alias graph contains
the word `default`.

The fixed OpenHarmony Photos replay used the real default-exported `ExifUtil`
class. Four independent indexed-batched processes returned the same 30
normalized Locations and Location hash as legacy, retained 70 diagnostics, and
used exactly three candidate files in one verifier batch.

| Run | Request | Product-tree peak RSS | Candidates | Batches | Max Program files |
|---|---:|---:|---:|---:|---:|
| indexed 1 | 10.895 s | 629,567,488 B | 3 | 1 | 658 (287 project) |
| indexed 2 | 10.613 s | 577,175,552 B | 3 | 1 | 658 (287 project) |
| indexed 3 | 11.078 s | 578,961,408 B | 3 | 1 | 658 (287 project) |
| final artifact | 8.619 s | 643,448,832 B | 3 | 1 | 658 (287 project) |

The four-run indexed median is 10.754 s and 604,264,448 bytes. The validated
legacy request took 9.012 s, so indexed latency is about 1.19x and passes the
existing `<= 2x` prototype gate.

This slice does **not** pass a memory release gate. Two otherwise valid legacy
observations ranged from 367,546,368 to 799,596,544 bytes on this Mac, while the
indexed runs ranged from 577,175,552 to 643,448,832 bytes. That variance does not
support a directional memory claim. The default remains `legacy`; the real
user-reported >3 GB reproducer and final 50% peak-reduction gate remain open.

## TDD and data contract

Parent revision: `273fb9ff87a3ceaad7fd3cc81f0298a8e3a813d3`.

The public sidecar RED changed a default-export fixture from unsupported to an
exact source-isolated candidate set. Before implementation,
`references/candidates` returned `supported=false`. The completed slice adds:

- `reference_export_name`, separate from the declaration name;
- SQLite schema v9 with an in-place v8 migration and named-export backfill;
- direct default-import anchor resolution;
- exact default import and explicit re-export alias chains;
- a regression proving that importing a target does not re-export it through
  the importing module's unrelated default declaration;
- conservative retention for an unresolved default package import;
- source-resolution counts under the existing default-off references trace,
  without recording source text or full candidate paths.

## Fixed replay

```text
workspace: /private/tmp/applications_photos-6.1-lts
commit:    98ea1d9cd6a363c576e2c6ff17844e51723baec5
SDK:       /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony
API:       24 / 6.1.1.125
Node:      v26.3.0
target:    imageEditor/common/src/main/ets/common/util/ExifUtil.ets
symbol:    ExifUtil
position:  34:22 (zero-based UTF-16)
request:   textDocument/references, includeDeclaration=true
```

Reproduction command:

```bash
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/applications_photos-6.1-lts \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file imageEditor/common/src/main/ets/common/util/ExifUtil.ets \
  --symbol ExifUtil \
  --line 34 \
  --character 22 \
  --oracle /private/tmp/photos-default-exif-legacy-pass.json \
  --out /private/tmp/photos-default-exif-indexed.json \
  --mode A \
  --strategy indexed-batched \
  --sdk-profile common \
  --batch-roots 2 \
  --trace \
  --idle-ms 0 \
  --timeout-ms 30000
```

The three candidate files are the declaration plus the real consumers
`MediaSaveManager.ets` and `BaseEditor.ets`. Their merged result hash is
`15fe1bfe6fecc16b5c76e7e1e0f2fe137f8a2be3a386468f3efea383f1779cf6`.

Early attempts are excluded from the successful statistics: one sampler was
blocked by the sandbox, one SQLite activation ran out of disk, broader
505/103-candidate versions timed out, and a correct 37-candidate version took
about 120 seconds. A later 113-candidate probe also timed out after preserving
the existing unresolved-SDK contract. These failures drove the source-aware
default-slot proof; none is reported as a successful reproduction.

Machine-readable summary:
[`evidence/2026-09-14-references-default-export-candidates.json`](evidence/2026-09-14-references-default-export-candidates.json).

## Validation

- `cargo test -p arkts-index-core`: 25 passed.
- `cargo test -p arkts-index-sqlite`: 25 passed across unit and contract tests.
- `cargo test -p arkts-index-sidecar --test ndjson_protocol`: 25 passed, one
  explicit real-fixture release test ignored outside its pinned environment.
- `cargo fmt --all --check` and release-equivalent workspace Clippy with
  warnings denied: PASS.
- Four independent real-project indexed replays: 4/4 PASS, 30 exact Locations,
  one batch, no fallback.
- `pnpm check:fast`: PASS — 923 tests, 923 passed, 0 failed, 0 cancelled,
  0 skipped, 0 todo.
