# Reference binding name narrowing

## Scope

This slice follows the merged occurrence-proof query work at parent
`a2619c0a2eabae53ae7a225af8b8f195c7ea5362`. It does not classify files by an
SDK-looking path. Investigation of the two remaining `./@ohos.base` edges showed
that they entered the `PhotoAsset` proof only because the catalog treated every
syntactic `identifier as identifier` expression as a cross-file alias.

Only named import and named re-export bindings can change the lexeme used for a
cross-file symbol identity. Type assertions such as `Thing as BusinessError` do
not. Memory and SQLite stores now expand reference names from their persisted
`ReferenceBinding` pairs. The broader `reference_aliases` data remains persisted
for compatibility but is no longer an authority for candidate-name expansion.

## TDD evidence

The RED command against the parent behavior was:

```text
cargo test -p arkts-index-core \
  type_assertions_do_not_widen_cross_file_reference_names -- --exact --nocapture
```

It failed with:

```text
left:  ["BusinessError", "Thing"]
right: ["Thing"]
```

The regression is covered through both the in-memory and SQLite public index
interfaces. Existing alias/re-export binding-chain tests remain GREEN.

## Fixed Photos replay

Environment and target are unchanged from the occurrence-proof report:

- workspace: `/private/tmp/applications_photos-6.1-lts`
- workspace commit: `98ea1d9cd6a363c576e2c6ff17844e51723baec5`
- SDK: DevEco OpenHarmony API 24 selected through LSP initialization options
- target: `common/src/main/ets/default/view/browserOperation/RecoverMenuOperation.ets`
- symbol and UTF-16 position: `PhotoAsset`, zero-based `82:26`
- request: `textDocument/references`, `includeDeclaration=true`

The direct candidate query changed as follows:

```text
candidate names:       203 -> 1
candidate bindings:    824 -> 87 before Node source resolution
candidate files:     1,154 -> 124
cold candidate query: 0.864 s -> 0.042 s
remaining relative edges in this identity graph: 2 -> 0
```

Three independent new-process LSP runs all returned the same nine normalized
locations as the locked legacy oracle:

| Run | Request time | Peak product RSS | Batches | Program project files |
|---:|---:|---:|---:|---:|
| 1 | 14.492 s | 736,722,944 bytes | 3 | 61..288 |
| 2 | 14.085 s | 748,146,688 bytes | 3 | 61..288 |
| 3 | 13.668 s | 745,648,128 bytes | 3 | 61..288 |

Median request time was 14.085 seconds. The locked legacy run took 7.996 seconds,
so the median ratio is about 1.76x and passes the current `<=2x` production
latency gate. The earlier conservative 11-batch run took 201.304 seconds, so this
slice removes about 93% of that request time without changing the result set.

Peak RSS remains close to the legacy run's 768,888,832 bytes because this fixture
is SDK-dominated; this result is not evidence of a large-project memory ratio.
It does prove that compiler working sets stay bounded while restoring acceptable
latency on this real project.

Raw local reports:

```text
/private/tmp/arkts-photoasset-binding-names.json
/private/tmp/arkts-photoasset-binding-names-run2.json
/private/tmp/arkts-photoasset-binding-names-run3.json
```

Status: **real-project correctness GREEN; bounded batching GREEN; Photos latency
gate GREEN; default strategy remains `legacy` pending broader real-project gates.**
