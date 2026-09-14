# References top-level export-modifier gate

## Outcome

The workspace reference index now recognizes supported top-level declaration
modifiers between `export` and a declaration keyword. The change covers the
real Photos forms `export abstract class`, `export async function`, and
`export declare interface`, plus `export default abstract class`. Nested
declarations remain outside this top-level identity rule, and the compiler
remains authoritative for every returned Location.

The fixed OpenHarmony Photos replay uses the real `LogExtender` abstract class.
Three independent legacy processes and three independent indexed-batched
processes returned the same three normalized Locations and the same Location
hash. The indexed path selected only the declaration and its real consumer and
ran one verifier batch.

| Strategy/run | Request | Product-tree peak RSS | Candidates | Max Program files |
|---|---:|---:|---:|---:|
| legacy 1 | 9.065 s | 804,696,064 B | full membership | full context |
| legacy 2 | 9.737 s | 798,138,368 B | full membership | full context |
| legacy 3 | 12.162 s | 771,129,344 B | full membership | full context |
| indexed 1 | 7.365 s | 578,387,968 B | 2 | 565 (206 project) |
| indexed 2 | 7.331 s | 576,307,200 B | 2 | 565 (206 project) |
| indexed 3 | 7.066 s | 565,047,296 B | 2 | 565 (206 project) |

The medians are 9.737 seconds / 798,138,368 bytes for legacy and 7.331
seconds / 576,307,200 bytes for indexed batching. On this symbol, indexed
latency is 0.75x and peak RSS is 0.72x legacy, a 27.8% reduction.

This slice passes correctness and prototype latency, but it does **not** pass
the final memory release gate. The reduction is below the planned 50% target,
the sample remains far below the user-reported 3 GB case, and only three runs
per strategy exist. Production therefore remains `legacy`.

## TDD boundary

Parent revision: `957fab81dad61e281b53f0daca00403c1421ef60`.

The public sidecar RED refreshed four declarations and then requested
`references/candidates` for each. Before implementation, the first
`export abstract class` query returned `supported=false`. The completed test
proves exact declaration identities and source-isolated candidate sets for:

- `export abstract class LogExtender`;
- `export async function updatePhotoNoteAsync`;
- `export declare interface TextCustomMenu`;
- `export default abstract class DefaultBase`.

The implementation scans only a fixed declaration-specific modifier allowlist
and still requires a top-level `export` prefix. It does not treat arbitrary
tokens as modifiers and does not make namespace members globally searchable.

## Fixed replay

```text
workspace: /private/tmp/applications_photos-6.1-lts
commit:    98ea1d9cd6a363c576e2c6ff17844e51723baec5
SDK:       /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony
API:       24 / 6.1.1.125
Node:      v26.3.0
target:    tools/src/main/utils/LogExtender.ets
symbol:    LogExtender
position:  21:24 (zero-based UTF-16)
request:   textDocument/references, includeDeclaration=true
```

Reproduction command:

```bash
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/applications_photos-6.1-lts \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file tools/src/main/utils/LogExtender.ets \
  --symbol LogExtender \
  --line 21 \
  --character 24 \
  --oracle /private/tmp/photos-logextender-legacy-pass.json \
  --out /private/tmp/photos-logextender-indexed.json \
  --mode A \
  --strategy indexed-batched \
  --sdk-profile common \
  --batch-roots 2 \
  --trace \
  --idle-ms 0 \
  --timeout-ms 30000
```

The exact Locations are the declaration, the import, and the subclass `extends`
usage. Their normalized hash is
`d00f2b3770f1ff697b3df076a86e2484584075ca4df769d16cba23424c950330`.
The target document produced zero diagnostics in all six validated runs.

The index returned two candidate files. The verifier then performed one
source-unavailable semantic-unit expansion, admitting 841 project files, but
the actual Program retained 206 project SourceFiles plus 359 SDK SourceFiles,
well below the 1,246-file project membership. This identifies closure expansion
and the remaining SDK profile—not candidate-name recall—as the next working-set
boundary for this case.

Machine-readable summary:
[`evidence/2026-09-14-references-export-modifiers.json`](evidence/2026-09-14-references-export-modifiers.json).

## Validation

- public sidecar RED reproduced at parent revision and GREEN after the minimal
  parser change;
- `cargo test --locked -p arkts-index-core`: 25 passed;
- `cargo test --locked -p arkts-index-sqlite`: 25 passed across unit and
  contract tests;
- `cargo test --locked -p arkts-index-sidecar --test ndjson_protocol`: 26
  passed, one explicit pinned real-fixture test ignored outside its release
  environment;
- `cargo fmt --all --check` and release-equivalent workspace Clippy with
  warnings denied: PASS;
- `pnpm check:fast`: 923 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo;
- six independent real-project replays: 6/6 validated requests PASS with exact
  three-Location equality.
