# C3 workspace-symbol exclusion contract: TDD evidence

Parent revision: `cb69598`

The existing `WorkspaceIndexPort.searchSymbols` call shape remains compatible:
an optional fifth `excludedUris` argument follows the existing AbortSignal.
The Node sidecar adapter sends the list in every search request so the Rust
index can exclude authoritative open-document overlays server-side.

```text
node --test --test-name-pattern='maps one workspace session' tests/index-adapter.test.mjs
```

RED: the public child-process audit received only `{ query, limit }`. GREEN:
it received the exact query, limit, and excluded file URI while all existing
four-argument callers continued to type-check.
