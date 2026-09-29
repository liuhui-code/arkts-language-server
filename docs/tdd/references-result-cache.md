# Exact references result cache v1

Parent revision: `001a44be589348712bf3ac242b1739575432dffe`.
Public boundary: a real `dist/server.cjs --stdio` LSP session.

## RED

`tests/semantic/references-result-cache.test.mjs` first sent the same complete
`textDocument/references` request twice, then appended an unsaved comment and
sent it again. Before the cache existed, the test observed no cache hit. After
the first implementation, a stronger assertion still failed because all three
requests ran `references.candidate-selection.complete`: the cache lived after
the Rust/index lookup rather than at the intended semantic-proxy boundary.

Commands:

```text
node --test tests/semantic/references-result-cache.test.mjs
```

The second RED was `3 !== 2` candidate-selection events.

## GREEN

The bounded cache now owns only complete compiler-verified outcomes and is
consulted before candidate selection. An open/change/close, project or SDK
configuration change, memory pressure, disposal, or workspace file event
invalidates it. Workspace events clear all v1 entries because a nested-root
change can invalidate an outer dependency closure.

The real-LSP test proves two misses/stores, one hit, two candidate selections,
two verifier batches and exact URI/range equality before and after the overlay
edit. The existing root-dirty cross-workspace test caught the initially too
narrow invalidation and is GREEN after adopting conservative clear-all.

```text
pnpm build
node --test tests/semantic/references-result-cache.test.mjs
node --test tests/lsp-workspace-file-changes.test.mjs tests/test-layer-manifest.test.mjs
```

Settings/API-24 mode C then returned the exact 248-Location set on all eleven
requests. Hot requests 2–10 had a 65 ms end-to-end median, and each server-side
cache hit took 0.60–0.90 ms with no candidate or verifier work. One 1.94 s
queue-wait outlier remains evidence for the separate scheduler slice.
