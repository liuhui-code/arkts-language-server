# Conservative reference-candidate narrowing on Photos 6.1

Status: correctness and latency gates pass on the fixed Photos workload. Peak RSS improves materially,
but the final 50% memory target remains open. The default references strategy remains `legacy`.

## Fixed environment

- implementation parent: `ef869d2e54146a221ca84a6f4445f49cf2310be9`
- workspace: OpenHarmony `applications_photos`, commit
  `98ea1d9cd6a363c576e2c6ff17844e51723baec5`
- SDK: `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, API 24,
  declaration digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`
- semantic backend: `ohos-typescript@4.9.5-r4`, revision
  `9cc62fe98f47c0bf113676e3fb33fe932b493052`
- Node: `v26.3.0`; pnpm: `8.3.1`
- target: `common/src/main/ets/default/view/browserOperation/RecoverMenuOperation.ets`
- symbol: `PhotoAsset`; zero-based UTF-16 position `82:26`; `includeDeclaration=true`
- process model: a fresh server process for every run, external 50 ms process-tree RSS sampling,
  normal automatic diagnostics preserved

The normalized legacy oracle contains nine valid locations. The historical replay file also carries four
stale expected locations from a different fixture in its generic validation block; those entries are not part
of the Photos oracle. Every comparison below uses the normalized nine-location set.

## Failure mechanism and safe change

The 124-file candidate set remained incomplete for two independent reasons:

1. qualified occurrences such as `photoAccessHelper.PhotoAsset` did not retain the qualifier name, so the
   index could not prove that the qualifier was an SDK default import;
2. relative resolution constructed an unescaped URI while the catalog correctly encoded `@` as `%40`, so
   two copied SDK declaration bindings failed to match their catalog target.

The index now persists the qualifier in the proof-only occurrence projection, parses ArkTS/TypeScript default
imports, and resolves relative sources using the catalog's URI encoding. SQLite schema v8 migrates v7 rows
with an empty qualifier; those old rows remain unknown until normal catalog refresh and therefore cannot cause
aggressive exclusion.

This slice does not require complete identity proof before reducing a batch. It returns a separate
`narrowedUris` set containing:

```text
proven target occurrences + all unknown occurrences
```

Only occurrences proven to belong to an independent declaration chain or to a locked external SDK qualifier
are removed. Unknown, ambiguous, stale, unqualified namespace, and unsupported forms remain compiler inputs.
The `ohos-typescript` verifier still proves every retained candidate and remains the final semantic owner.

## TDD evidence

The first RED showed that a qualified SDK default import kept identity proof incomplete:

```text
cargo test -p arkts-index-sqlite \
  memory_and_sqlite_classify_locked_sdk_modules_as_external_terminals \
  -- --exact --nocapture
```

The second RED showed that a catalog URI containing `%40` did not match a relative source containing `@`:

```text
cargo test -p arkts-index-core \
  relative_binding_resolution_matches_percent_encoded_file_uris \
  -- --exact --nocapture
```

The public LSP RED required the real child-process transcript to select
`compiler-definition-conservative`, reduce five conservative candidates to four, and return the exact same
locations. Focused Rust, sidecar protocol, SQLite restart/migration, and public LSP tests are GREEN.

## Real-project results

| Run | Locations | Exact oracle | Candidates | Batches | Program project / SDK files | Request | Peak product RSS |
|---|---:|---|---:|---:|---:|---:|---:|
| 1 | 9 | yes | 8 / 124 | 1 | 36 / 351 | 4.281 s | 560,824,320 B |
| 2 | 9 | yes | 8 / 124 | 1 | 36 / 351 | 3.953 s | 554,364,928 B |
| 3 | 9 | yes | 8 / 124 | 1 | 36 / 351 | 3.981 s | 555,728,896 B |

Median request time is 3.981 s and median peak RSS is 555,728,896 bytes. Against the fixed legacy run
(7.996 s, 768,888,832 bytes), this is 0.50x latency and 27.7% lower peak RSS. Against the previous direct-import
slice (11.760 s, 724,774,912 bytes), it is 66.1% faster and 23.3% lower peak RSS.

A separate root-cap experiment using `ARKTS_REFERENCES_BATCH_ROOTS=32` kept all 124 candidates. It required
four batches, took 15.399 s, and peaked at 703,180,800 bytes. That is only about 3% below the previous indexed
median while being 31% slower, so further root-cap tuning is a stopped path.

## Interpretation and next boundary

The working-set hypothesis is now causally supported on this workload: safely reducing candidate roots from
124 to 8 reduced the compiler from as many as 288 project files across three batches to 36 project files in one
batch, while preserving all nine references.

The remaining Program still contains 351 SDK declarations and about 15.4 million SDK UTF-16 code units versus
about 1.86 million project code units. Therefore candidate-root tuning is no longer the next bottleneck. The
next experiment must measure and safely reduce the SDK declaration closure or establish the irreducible
compiler/runtime floor. It must retain exact references and diagnostics; no SDK profile may be adopted from
this report alone.

Release status:

- normalized reference correctness: PASS
- public LSP and migration contracts: PASS
- current `<=2x` latency gate: PASS
- pinned 455-file cold catalog gate at commit `585feb45114a128a0d2a23947c83faf338e758f7`: PASS
- final peak target `<=50%` of legacy: OPEN (`72.3%` observed)
- default strategy switch: NOT AUTHORIZED; remains `legacy`
