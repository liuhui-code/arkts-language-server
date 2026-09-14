# References exported-value candidate gate

## Outcome

The Rust workspace index now assigns a stable declaration identity to a
top-level named `export const` value. Plain values are exposed as `variable`;
exported arrow functions remain `function`. The index still only recalls
candidate files and the compiler remains the final authority for every returned
Location.

The fixed OpenHarmony Photos replay used the real `BUNDLE_NAMES` value. Fresh
legacy and indexed-batched processes returned the same 14 normalized Locations,
the same Location hash, and six normal diagnostics.

| Strategy | Request | Product-tree peak RSS | Candidate files | Batches | Max project files |
|---|---:|---:|---:|---:|---:|
| legacy | 10.624 s | 798,949,376 B | full membership | 0 | 1,246 membership |
| indexed-batched | 21.121 s | 584,744,960 B | 7 | 3 | 346 |

The indexed run reduced the single-run peak by 26.81%, with no fallback. Its
latency was 1.99x legacy, only narrowly inside the prototype's `legacy × 2`
limit. This is one paired-shape replay, not enough to change the default strategy.
`indexed-batched`, the `common` verifier SDK profile, and the two-root test limit
remain opt-in.

## TDD and protocol evidence

Parent revision: `50c8b1fa47e08885cf4dc7f830875351e71a1ee6`.

The index-core RED changed the existing semicolonless exported-value case from
unsupported to searchable. Before implementation it failed at
`assert!(result.supported)`. The implementation then:

- records only a top-level exported `const` with an immediate identifier;
- gives plain values the persisted `variable` kind;
- preserves `function` for the already-supported arrow-function form;
- keeps destructuring and non-exported locals outside this new declaration path;
- leaves candidate Locations subject to compiler verification.

Memory and SQLite store contracts verify candidate equality and SQLite reopen.
The sidecar NDJSON protocol verifies both `references/candidates` and the public
`variable` symbol-kind payload.

## Fixed replay

```text
workspace: /private/tmp/applications_photos-6.1-lts
commit:    98ea1d9cd6a363c576e2c6ff17844e51723baec5
SDK:       /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony
API:       24 / 6.1.1.125
Node:      v26.3.0
target:    tools/src/main/utils/Bundle.ets
symbol:    BUNDLE_NAMES
position:  22:14 (zero-based UTF-16)
request:   textDocument/references, includeDeclaration=true
```

Reproduction command:

```bash
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/applications_photos-6.1-lts \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file tools/src/main/utils/Bundle.ets \
  --symbol BUNDLE_NAMES \
  --line 22 \
  --character 14 \
  --oracle /private/tmp/photos-bundle-names-legacy-pass.json \
  --out /private/tmp/photos-bundle-names-indexed.json \
  --mode A \
  --strategy indexed-batched \
  --sdk-profile common \
  --batch-roots 2 \
  --trace \
  --idle-ms 1000
```

Two attempted indexed reports failed to write because the Mac data volume was
full. They are excluded and are not counted as semantic failures or successful
reproductions. The final run started with 2.2 GiB available and completed with a
persisted PASS report.

Machine-readable summary:
[`evidence/2026-09-14-references-exported-value-candidates.json`](evidence/2026-09-14-references-exported-value-candidates.json).

## Validation

- `cargo test --locked -p arkts-index-core`: 21 passed.
- `cargo test --locked -p arkts-index-sqlite`: 23 passed across unit and contract tests.
- `cargo test --locked -p arkts-index-sidecar --test ndjson_protocol`: 25 passed, one
  pre-existing real-fixture release test ignored outside its explicit environment.
- `pnpm check:fast`: 923 passed, zero failed/skipped/todo.

The first two full JavaScript runs each exposed one separate host-SDK leak in a
basic fixture timeout. The logging and basic transcript fixtures now explicitly
select a missing SDK, rather than accidentally loading the Mac's DevEco SDK.
Their focused tests pass 3/3 and 9/9, and the final complete run is green. No
production timeout or SDK selection behavior changed.
