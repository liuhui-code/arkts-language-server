# U1b/U2 — ArkUI SDK symbols, builder tails, and diagnostic depth

Date: 2026-09-03

Parent revision: `e69d69bc6609a7b2f0b69200cd1bf016eb26fcbb`

## Scope and public boundary

These tests start the existing `dist/server.cjs --stdio` process against one
isolated ArkUI fixture and SDK stub. This slice changes no production code and
does not rebuild `dist`; its job is to characterize the working SDK-backed
language features and expose the next two production gaps through stable LSP
results.

Checklist:

- [x] Keep SDK lookup isolated through `ARKLINE_HARMONY_SDK_PATH`.
- [x] Verify `@Entry`, `@Component`, `@State`, `Column`, and `Text` completion,
  hover, and definition.
- [x] Verify ordinary `Text(...).width` in its own document/session so other
  incomplete completion prefixes cannot pollute the parser.
- [x] Require exact completion label/kind/replacement edit and exact SDK
  definition URI/name range.
- [x] Require stable hover type identity, not localized prose or a coincidental
  same-name string.
- [x] Characterize misspelled `@Componet` as TS2552 with numeric code,
  severity, source, and exact emoji-derived UTF-16 range; do not pin message.
- [x] Preserve real non-builder TS1128 and TS2304 diagnostics so an ArkUI fix
  cannot pass by broadly filtering TypeScript errors.
- [x] Expose missing `$r("app.string.missing_title")` as a stable diagnostic
  RED at the exact key range.
- [x] Expose `.width(...)` after nested builder blocks as a RED while retaining
  completion, hover, and definition assertions behind the diagnostic gate.
- [x] Classify all three entries as fast `bundle-e2e` tests with no skips.

## Characterization GREEN

The SDK-backed scenarios use the real TypeScript language service through the
production LSP adapter. The protected symbol identities are:

| Symbol | Completion kind | Hover identity | Definition |
| --- | ---: | --- | --- |
| `Entry` | Variable (6) | `(target: object) => void` | exact `arkui.d.ts` name range |
| `Component` | Variable (6) | `(target: object) => void` | exact `arkui.d.ts` name range |
| `State` | Variable (6) | `(target: object, propertyKey: string) => void` | exact `arkui.d.ts` name range |
| `Column` | Function (3) | returns `ArkUIColumnAttribute` | exact `arkui.d.ts` name range |
| `Text` | Function (3) | returns `ArkUITextAttribute` | exact `arkui.d.ts` name range |
| `width` | Method (2) | `ArkUICommonAttribute.width` returns `ArkUITextAttribute` at the use site | exact `arkui.d.ts` name range |

Commands and results against the unchanged bundle:

```text
node --test tests/semantic/arkui-sdk-symbols.test.mjs
# 2 passed, 0 failed, 0 skipped

node --test tests/semantic/arkui-diagnostics-depth.test.mjs
# @Componet TS2552: passed
# non-builder TS1128 + TS2304 guard: passed
```

## RED 1 — missing resource diagnostic

The fixture contains only `app.string.title`, then opens a document that uses
`$r("app.string.missing_title")` after a non-BMP emoji on the same line. The
contract requires this exact diagnostic projection:

```text
code: arkui.resource.not-found
severity: 1
source: arkts
range: line 4, UTF-16 characters 43..56 (missing_title only)
```

Observed twice through the real stdio process:

```text
node --test tests/semantic/arkui-diagnostics-depth.test.mjs
# 2 passed, 1 failed
# actual matching diagnostics: []
```

This is a semantic absence, not a timeout, parser failure, or message-text
difference.

## RED 2 — nested builder tail

The valid ArkUI source nests `Column() { Column() { Text(...) } }` and applies
`.width("100%")` to the outer builder. The contract requires zero diagnostics,
an exact `width` hover/definition, and Method completion for a `}.wi` overlay.

The unchanged bundle deterministically publishes two false diagnostics before
the later semantic assertions can run:

```text
TS1128 at line 10, characters 5..6   # the dot before width
TS2304 at line 10, characters 6..11  # width
```

Focused result:

```text
node --test tests/semantic/arkui-builder-tail.test.mjs
# 0 passed, 1 failed, 0 skipped
```

Combined deterministic result:

```text
node --test --test-concurrency=1 \
  tests/semantic/arkui-sdk-symbols.test.mjs \
  tests/semantic/arkui-diagnostics-depth.test.mjs \
  tests/semantic/arkui-builder-tail.test.mjs
# 4 passed, 2 failed, 0 skipped
```

## Manifest RED → GREEN

Before registration, the manifest validator reported all three new executable
entries as unclassified. Adding them to `bundle-e2e` produced:

```text
node --test tests/test-layer-manifest.test.mjs
# 2 passed, 0 failed, 0 skipped
```

The bundle-e2e layer now has 22 entries and the repository has 52 executable
test entries.

## Production follow-up boundaries

1. Missing-resource validation should be produced by the bounded workspace
   resource semantic provider from the same immutable snapshot used by
   completion/definition. It should not rescan per diagnostic request or parse
   localized TypeScript messages.
2. Builder-tail support must preserve the outer builder expression's receiver
   semantics in the virtual document. Suppressing TS1128/TS2304 by code or
   source range would make the non-builder guard fail and is not a valid fix.
3. The first GREEN implementation should target this exact nested tail shape;
   additional ArkUI attributes and control-flow DSL forms require their own
   public RED before generalization.
4. After both REDs turn GREEN, rerun the pre-existing ArkUI resource/watcher,
   diagnostics, and semantic characterization suites before updating the
   feature evidence matrix.
