# U1/U2 first slice — ArkUI resource semantics and DSL diagnostic RED → GREEN

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

## GREEN implementation

GREEN work started from revision
`2b8e07859e403a52a76472b599b554833424c09b` and retained the original RED
commit as the public regression boundary.

The resource slice is implemented as two components under `src/core/arkui`:

- a workspace-owned immutable resource snapshot with deterministic traversal,
  stable ordering, and hard limits for visited paths, directory width, resource
  file count, individual/total bytes, and parsed entry count;
- a lexical `$r` provider that owns ArkUI context recognition and exact ranges.

`SemanticTypeEngineRegistry` owns one ArkUI provider beside each TypeScript
engine and merges completion and definition results. TypeScript-specific code
does not contain `$r`, resource layout, or JSON special cases. The resource
index skips symlinks and excluded dependency/generated directories, validates
canonical paths against the workspace root, and returns no partial snapshot
when a hard limit is exceeded. Invalid JSON contributes no entries. JSON key
ranges come from the parsed `string` array AST rather than a repository-wide
regular expression, preventing unrelated same-name metadata from becoming a
definition target.

The DSL slice keeps the existing `struct` source map, then parses its normalized
document. A builder rewrite is accepted only when all of these hold:

- TypeScript recovered adjacent call-expression and block statements;
- the callee's final identifier is UpperCamelCase;
- only same-line horizontal whitespace separates the call from the block; and
- horizontal whitespace can be replaced one-for-one by `;`.

This turns `Column() {` into the equal-width `Column();{`. Method/control-flow
blocks and lowercase invalid calls are unchanged. No diagnostic code is
filtered, so the independent numeric TS1005 continues to reach the client.

## GREEN evidence

```text
node --test tests/semantic/arkui-language-features.test.mjs
# 7 passed, 0 failed, 0 skipped

node --test tests/semantic/semantic-characterization.test.mjs
# 10 passed, 0 failed

node --test tests/semantic/diagnostic-code-characterization.test.mjs
# 7 passed, 0 failed

node --test tests/semantic/project-membership-language-service.test.mjs
# 5 passed, 0 failed
```

The focused unit contracts also prove one immutable scan per provider snapshot,
explicit invalidation, deterministic ordering, limit fail-closed behavior,
out-of-root query rejection, symlink-escape rejection, malformed JSON
isolation, exact JSON AST key selection, nested builder rewriting, and source
round trips after a non-BMP character.

## U1a watched-resource freshness RED → GREEN

Live resource freshness started from parent revision
`d0635827d4927143c0c70771c15dcab571bab439`. A real stdio regression first
populated the resource snapshot with `app.string.title`, rewrote the same
`resources/base/element/string.json` to contain only `subtitle`, sent
`workspace/didChangeWatchedFiles`, and immediately issued completion plus old
and new definition requests without a sleep. Before production changes it was
stable RED:

```text
node --test --test-name-pattern="refreshes a cached ArkUI resource" \
  tests/semantic/arkui-language-features.test.mjs
# 0 passed, 1 failed
# actual resource labels: ["title"]
# expected resource labels: ["subtitle"]
```

The dynamic-registration and coordinator contracts independently failed
because the server registered only source watchers and discarded resource JSON
events. GREEN adds the exact bounded watcher
`**/resources/*/element/string.json`; the shared classifier accepts only
`resources/<qualifier>/element/string.json`. Ordinary JSON, a missing or nested
qualifier, paths outside the workspace, and symlink escapes are ignored.

Accepted changes invalidate only the immutable ArkUI snapshot belonging to the
matched workspace. A resource-only batch never enters `SemanticDocumentStore`,
does not reset the TypeScript engine, and leaves its generation unchanged.
Source and resource overflow have separate dirty domains while sharing one
hard pending-path budget, so a resource burst cannot discard a pending source
change or silently consume an unbounded second queue. Registry keys normalize
workspace-root spellings with `path.resolve`, and a two-root contract proves
that invalidating one spelling refreshes only the corresponding workspace.

Focused GREEN evidence:

```text
node --test --test-name-pattern="refreshes a cached ArkUI resource" \
  tests/semantic/arkui-language-features.test.mjs
# 1 passed, 0 failed

node --test --test-name-pattern="dynamically registers bounded" \
  tests/lsp-workspace-file-changes.test.mjs
# 1 passed, 0 failed

node --test --test-name-pattern="routes only in-root ArkUI|bounds an ArkUI resource burst|invalidates only one workspace ArkUI" \
  tests/workspace-file-change-coordinator.test.mjs
# 3 passed, 0 failed
```

## Remaining risks (not claimed by U1/U2)

- A watched resource change refreshes the next completion/definition request,
  but does not proactively republish diagnostics for already-open documents.
  Missing-resource diagnostics and their watched-change publication need a
  separate RED before that U2 behavior can be claimed.
- Cold `$r` access performs one synchronous, bounded workspace traversal before
  caching its immutable snapshot. The limits prevent unbounded memory/work, but
  a large-workspace latency benchmark and background/catalog handoff are still
  required before claiming production-scale cold-start performance.
- This first builder lowering does not claim container post-block chains such
  as `Column() { ... }.width(...)`. That syntax needs its own RED and a
  type-preserving lowering rather than diagnostic suppression.

Consequently this commit closes only the two concrete RED examples above; it
does not mark the broader U1b/U2 capability complete.
