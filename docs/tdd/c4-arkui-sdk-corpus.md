# C4 isolated ArkUI and SDK corpus assets

Date: 2026-09-03  
Parent revision: `d4fbf6b1980ad41dfb3b280600c470e9e9e9799b`  
Branch: `plan/lsp-completeness-e2e`

## Contract

The versioned conformance corpus includes an isolated ArkUI page with markers
for `@Entry`, `@Component`, `@State`, `Column`, `Text`, and the `width`
attribute. Materialization removes those markers and retains exact URI/range
addresses for every token.

The corpus also includes a minimal deterministic OpenHarmony SDK root with an
`ets` declaration, SDK metadata, and a `toolchains` directory marker. The test
compares every copied SDK file byte-for-byte with its versioned fixture while
HOME and `DEVECO_SDK_HOME` point to nonexistent paths.

This slice only establishes test assets. It does not connect production SDK
discovery, claim that ArkUI semantics work, or implement C5 schema validation.

## RED

Command:

```sh
node --test tests/conformance-corpus.test.mjs
```

Observed result: exit code 1. C1 and C3 passed; C4 failed with ENOENT for the
materialized `ArkuiPage.ets`.

## GREEN

Command:

```sh
node --test tests/conformance-corpus.test.mjs
```

Observed result: exit code 0; 3 tests passed, 0 failed, 0 skipped.

## Files added in this slice

- `fixtures/conformance/v1/workspace/entry/src/main/ets/pages/ArkuiPage.ets`
- `fixtures/conformance/v1/sdk/openharmony/sdk-pkg.json`
- `fixtures/conformance/v1/sdk/openharmony/ets/component/arkui.d.ts`
- `fixtures/conformance/v1/sdk/openharmony/toolchains/arkts-lsp-fixture.json`
- `tests/conformance-corpus.test.mjs`
