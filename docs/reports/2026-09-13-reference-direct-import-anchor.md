# Direct import reference anchor

## Scope

This slice starts from merged parent
`0bd3ef0b814c3c2cdeeb341d135b738e89b5b32b`. It removes the separate compiler
anchor only when the committed index can prove that the queried unqualified
identifier is a named import whose source resolves uniquely to exactly one
reference-searchable export. Ambiguous sources, multiple matching imports,
re-export-only targets, default exports, namespace access and unknown shapes
remain unsupported and retain the compiler-anchor fallback.

The final `ohos-typescript` verifier still receives the original query document
and UTF-16 position and remains the authority for every returned Location.

## TDD evidence

The first RED used the public in-memory index interface at an imported usage
position:

```text
cargo test -p arkts-index-core \
  direct_named_import_usage_resolves_the_reference_declaration \
  -- --exact --nocapture
```

It failed because the result was `supported=false`. The SQLite parity RED then
failed through the same `WorkspaceIndex` interface:

```text
cargo test -p arkts-index-sqlite \
  memory_and_sqlite_resolve_direct_named_import_usages \
  -- --exact --nocapture
```

The child-process LSP RED returned the correct Locations but logged
`compiler-definition-identity` and `references.anchor.complete`. It is now GREEN
with one candidate request, `indexed-declaration-identity`, no compiler anchor,
and exact equality with conservative batching. A separate regression keeps an
ambiguous `Target.ets` versus `Target/index.ets` import unsupported. A shared
Memory/SQLite contract also keeps a uniquely resolved target unsupported when
it falls outside the explicit admitted project roots.

## Fixed Photos replay

Environment and target:

- workspace: `/private/tmp/applications_photos-6.1-lts`
- workspace commit: `98ea1d9cd6a363c576e2c6ff17844e51723baec5`
- SDK: DevEco OpenHarmony API 24 selected through LSP initialization options
- target: `common/src/main/ets/default/view/browserOperation/RecoverMenuOperation.ets`
- symbol and zero-based UTF-16 position: `PhotoAsset`, `82:26`
- request: `textDocument/references`, `includeDeclaration=true`
- batch root limit: 64

The usage is a direct named import from `../dialog/MoveDialog`. Three independent
new-process runs all skipped the compiler anchor, kept the same three verifier
batches (288, 110 and 61 project SourceFiles), and returned the locked legacy
oracle's nine normalized Locations exactly:

| Run | Request time | Peak product RSS | Anchor mode |
|---:|---:|---:|---|
| 1 | 11.784 s | 730,099,712 bytes | indexed-declaration |
| 2 | 11.760 s | 645,652,480 bytes | indexed-declaration |
| 3 | 11.553 s | 724,774,912 bytes | indexed-declaration |

Median request time is 11.760 seconds: 16.5% below the previous 14.085-second
indexed-batched median and 1.47x the locked 7.996-second legacy request. Median
peak is 724,774,912 bytes. The result improves latency without increasing the
bounded compiler working set, but it does not satisfy the final 50% peak-memory
target or an acceptable absolute interactive latency.

A one-variable diagnostic run with all 124 candidates in one batch completed in
9.297 seconds but peaked at 775,344,128 bytes, slightly above the legacy peak.
That confirms increasing the batch size merely exchanges memory for latency and
is not adopted.

Raw local reports:

```text
/private/tmp/arkts-photoasset-direct-import-anchor-run1.json
/private/tmp/arkts-photoasset-direct-import-anchor-run2.json
/private/tmp/arkts-photoasset-direct-import-anchor-run3.json
/private/tmp/arkts-photoasset-batch128-run1.json
```

Status: **direct-import anchor correctness GREEN; Photos latency improved;
absolute latency and final memory gates remain OPEN; default remains `legacy`.**

## Validation status

The focused Rust suites, strict Clippy, release sidecar build, runtime build,
eight public references-batching transcripts and the real Photos replay are
GREEN. The 914-test fast gate had 913 passes in the sandbox; its sole failure
was the macOS external-process RSS sampler (`spawn EPERM`), which passed when
rerun outside the sandbox.

The pinned 455-file cold-catalog performance gate passed earlier in this slice,
but final reruns under current host load took 3.415-5.865 seconds against its
hard 3-second threshold. An isolated build of the unchanged parent revision
failed the same gate at 5.404 seconds in the same window, while Spotlight and
WindowServer were consuming material CPU. This is recorded as a host-performance
blocker, not treated as a product regression and not waived by changing the
threshold. The branch must obtain a fresh GREEN run before merge.
