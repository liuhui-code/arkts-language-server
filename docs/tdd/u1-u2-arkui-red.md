# U1/U2 — ArkUI resource semantics and DSL diagnostic RED

Date: 2026-09-03

Parent revision: `061a46a20f36b0d26000cb2adb0f013b6c40ed74`

## Scope and public boundary

This test-only slice starts the production `dist/server.cjs --stdio` process
and uses LSP 3.17 `textDocument/completion`, `textDocument/definition`, and
versioned `textDocument/publishDiagnostics`. It does not call the TypeScript
language service or an internal semantic port.

The isolated fixture supplies:

- a minimal SDK selected explicitly through `ARKLINE_HARMONY_SDK_PATH`;
- ambient declarations for `$r`, ArkUI decorators, components, and attributes;
- `resources/base/element/string.json` with one `title` resource;
- an ArkTS resource consumer whose query follows a non-BMP emoji;
- a valid ArkUI component builder and an independently malformed ArkTS file.

The SDK declarations prevent missing-global noise from being mistaken for an
ArkUI parser or resource-provider defect. The test does not use the host
DevEco SDK, user HOME, an index cache, or a semantic mock.

## U1 resource completion and definition RED

The first request completes the `ti` suffix in `$r("app.string.ti")`. The
contract requires exactly one `title` item whose `textEdit` replaces only that
two-code-unit suffix. A separate definition request on
`$r("app.string.title")` must return the exact `title` name range in
`string.json`.

Observed stable response:

```text
completionError: null
titleItems: []
definitionError: null
definitionLocations: []
```

The expected completion range is line 2, UTF-16 columns 43–45. The expected
resource definition range is line 2, columns 15–20. Transport, initialization,
fixture lookup, and UTF-16 preconditions all succeed; the missing results are
the intended production RED.

## U2 valid component DSL RED

The valid page uses the declared `@Entry`, `@Component`, `@State`, `Column`,
`Text`, `$r`, and `.width` APIs. The SDK is demonstrably active: the final run
contains no TS2304 missing-name diagnostics. Production still publishes this
false syntax error for the valid ArkUI component builder block:

```text
code: 1005
severity: 1
source: arkts
range: line 6, columns 13–14
message: ';' expected.
```

The range selects the `{` in `Column() {`. A correct implementation must map
ArkUI builder syntax into a TypeScript-valid virtual form while retaining exact
source coordinates; globally suppressing TS1005 would hide real user errors.

## Numeric syntax diagnostic guard

`SyntaxBroken.ets` contains the real error `[1 2]` after an emoji. The focused
characterization is GREEN and locks a genuine TS1005 diagnostic with numeric
code, severity `1`, source `arkts`, and the exact UTF-16 range selecting `2`.
This guard requires the future DSL fix to be syntax-aware rather than disabling
parser diagnostics.

## Evidence

Initial resource run:

```text
node --test tests/semantic/arkui-language-features.test.mjs
# 0 passed, 1 failed
# titleItems=[], definitionLocations=[]
```

After adding the independent diagnostic fixtures, the final focused run is:

```text
node --test tests/semantic/arkui-language-features.test.mjs
# 1 passed, 2 failed, 0 skipped
```

The two failures are the intended U1/U2 product REDs. The numeric syntax guard
passes. No production, feature-matrix, layer-manifest, or package file is
changed by this commit.

## Minimal GREEN order for the production owner

1. Add a workspace-scoped ArkUI resource catalog and route `$r` string-context
   completion/definition through it, preserving exact UTF-16 source ranges.
2. Extend the ArkTS virtual-document transform for component builder blocks
   and source-map the generated representation back to the original `{`/body.
3. Re-run the numeric TS1005 guard to prove real syntax errors remain visible.
4. Only after bundle GREEN, add immutable installed-artifact scenarios and
   ArkUI-specific evidence claims.
