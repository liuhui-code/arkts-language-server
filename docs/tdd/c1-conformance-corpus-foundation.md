# C1 conformance corpus foundation

Date: 2026-09-03  
Parent revision: `134e8ba8ad7b3b4783c83d6b7bb44ba78ed20159`  
Branch: `plan/lsp-completeness-e2e`

## Contract

The versioned conformance corpus can be copied into an isolated temporary
workspace. `/*@case.<id>*/` records a point, while matching
`/*@case.<id>.start*/` and `/*@case.<id>.end*/` markers record a range. Marker
comments are absent from materialized source files, and returned LSP positions
are measured in JavaScript UTF-16 code units.

This slice deliberately contains one `Home.ets` case with an emoji before the
markers. Harmony manifests, deterministic SDK stubs, and corpus schema
validation remain separate C3-C5 slices.

## RED

Command:

```sh
node --test tests/conformance-corpus.test.mjs
```

Observed result: exit code 1. The real test entry point failed with
`ERR_MODULE_NOT_FOUND` because
`tests/support/materialize-conformance-workspace.mjs` did not exist.

## GREEN

Command:

```sh
node --test tests/conformance-corpus.test.mjs
```

Observed result: exit code 0; 1 test passed, 0 failed, 0 skipped. The assertion
also proves that the emoji contributes two UTF-16 code units rather than one
Unicode code point.

## Files in this slice

- `fixtures/conformance/v1/workspace/entry/src/main/ets/pages/Home.ets`
- `tests/conformance-corpus.test.mjs`
- `tests/support/materialize-conformance-workspace.mjs`
- `docs/tdd/c1-conformance-corpus-foundation.md`
