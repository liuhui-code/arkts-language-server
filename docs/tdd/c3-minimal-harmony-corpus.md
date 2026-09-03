# C3 minimal deterministic Harmony corpus

Date: 2026-09-03  
Parent revision: `720c2027b2654fb7018caf3c6b92e342edf5211d`  
Branch: `plan/lsp-completeness-e2e`

## Contract

The conformance fixture contains a minimal deterministic Harmony workspace:
five project manifests, the existing open-document candidate `Home.ets`, and
four semantic files intended to remain unopened during the first E2E tracer.
Those files provide a profile declaration, a barrel export, a documented
auto-import target, a real profile reference, and a same-name unrelated symbol
as a negative sample.

Materialization must preserve every non-ETS manifest byte-for-byte. Every ETS
file must be copied without marker comments, while the recorded marker cases
continue to identify the materialized file URI and exact source range. The test
sets HOME and `DEVECO_SDK_HOME` to nonexistent paths before materialization.

ArkUI sources, SDK stubs, and corpus schema validation are intentionally left
for C4 and C5.

## RED

Command:

```sh
node --test tests/conformance-corpus.test.mjs
```

Observed result: exit code 1; C1 passed and the new C3 test failed with ENOENT
for `fixtures/conformance/v1/workspace/build-profile.json5`.

## GREEN

Command:

```sh
node --test tests/conformance-corpus.test.mjs
```

Observed result: exit code 0; 2 tests passed, 0 failed, 0 skipped.

## Files added in this slice

- `fixtures/conformance/v1/workspace/build-profile.json5`
- `fixtures/conformance/v1/workspace/oh-package.json5`
- `fixtures/conformance/v1/workspace/entry/build-profile.json5`
- `fixtures/conformance/v1/workspace/entry/oh-package.json5`
- `fixtures/conformance/v1/workspace/entry/src/main/module.json5`
- `fixtures/conformance/v1/workspace/entry/src/main/ets/model/Profile.ets`
- `fixtures/conformance/v1/workspace/entry/src/main/ets/model/index.ets`
- `fixtures/conformance/v1/workspace/entry/src/main/ets/services/Greeter.ets`
- `fixtures/conformance/v1/workspace/entry/src/main/ets/pages/OtherConsumer.ets`
- `tests/conformance-corpus.test.mjs`
