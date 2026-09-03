# U1b — Type-preserving ArkUI builder-tail lowering

Date: 2026-09-03

Parent RED revision: `51c93bc053050f0fd2deb0bdcc23dd861322106a`

## Public contract

Nested ArkUI builder syntax must retain the return type of the outer component
call when an attribute follows its block:

```arkts
Column() {
  Column() {
    Text(this.title)
  }
}.width("100%")
```

Through the real `dist/server.cjs --stdio` interface this requires:

- zero false diagnostics;
- `width` Method completion with the exact source replacement range;
- hover identifying `ArkUICommonAttribute.width` returning
  `ArkUIColumnAttribute`, at the exact source range;
- definition to the exact `width` name range in the configured ArkUI SDK.

TS1128/TS2304 must not be filtered: real non-builder syntax/name errors remain
protected by `arkui-diagnostics-depth.test.mjs`.

## RED

The committed public RED deterministically exposed the old statement lowering:

```text
Column();{
  Column();{
    Text(...)
  }
}.width(...)
```

It discarded the outer `Column()` receiver. The LSP published TS1128 for the
dot and TS2304 for `width`, so the test failed before hover, definition, and
completion.

A closer virtual-document contract was then added before production changes.
It required a type-preserving nested expression and failed with the exact old
`Column();{` / `Row();{` generated text.

## Minimal GREEN

Each syntax-aware `CallExpression` plus adjacent builder `Block` is lowered to
an expression without introducing a generated identifier:

```ts
([Column(),()=>{
  ([Column(),()=>{
    Text(this.title)
  }] as const)[0]
}] as const)[0].width("100%")
```

The tuple's element zero retains the component call's type, while the arrow
keeps the builder body parseable and preserves lexical `this`. No callback is
invoked or emitted; this representation exists only in the no-emit semantic
language-service document. Avoiding a synthetic variable also avoids global
or local naming collisions.

The rewrite is three bounded segments per builder:

| Segment | Generated text | Source-map behavior |
| --- | --- | --- |
| before call | `([` | generated prefix maps to the call-start insertion boundary |
| call/block gap | `,()=>` | synthetic arrow maps to the original gap/open-brace boundary |
| after block | `] as const)[0]` | generated suffix maps to the block-end/tail boundary |

Real component, nested body, tail attribute, and later diagnostic tokens retain
exact source→generated→source round trips. Ordinary `if` blocks, function
declarations, and lowercase call/block pairs remain unchanged.

## Bounded fail-safe behavior

Two limits prevent pathological expansion in large or generated files:

- at most 512 recognized builder transforms per document;
- at most 8 KiB of cumulative positive generated expansion.

Both limits were introduced test-first. At exactly 512 transforms lowering is
complete. At 513, or when expansion exceeds 8 KiB, all builder rewrites are
discarded rather than returning a partially transformed semantic document.
The independent `struct`→`class` normalization remains; original builder syntax
is left visible to TypeScript, so real parse failures are not silently hidden.

## Verification

Focused source-level RED→GREEN:

```text
node --test --test-name-pattern="type-preserving expressions" \
  tests/semantic/arkui-builder-tail.test.mjs
# RED: old Column();{ output
# GREEN: 1 passed

node --test --test-name-pattern="transform limit" \
  tests/semantic/arkui-builder-tail.test.mjs
# RED before bound; GREEN: 1 passed

node --test --test-name-pattern="expansion exceeds" \
  tests/semantic/arkui-builder-tail.test.mjs
# RED before budget; GREEN: 1 passed
```

The complete server was bundled once to an isolated temporary path; shared
`dist` was not changed. The real stdio test was pointed at that bundle:

```text
env ARKTS_BUILDER_TAIL_SERVER_PATH=/private/tmp/.../server.cjs \
  node --test tests/semantic/arkui-builder-tail.test.mjs
# 4 passed, 0 failed, 0 skipped
```

Existing virtualizer characterization:

```text
node --test --test-name-pattern="rewrites only ArkUI builder blocks" \
  tests/semantic/arkui-language-features.test.mjs
# 1 passed
```

Type safety after the concurrently owned resource lane reached a stable
interface:

```text
pnpm check
# passed
```

## Deliberate remaining boundaries

- Multiline call-to-block gaps and comment-bearing gaps are not newly claimed.
- The existing UpperCamel component-call heuristic remains unchanged; a future
  SDK-driven component classifier needs its own public RED.
- Runtime code generation is out of scope: the virtual document is a semantic,
  no-emit representation.
- Full shared-bundle and repository gates remain for the coordinating task so
  parallel lanes do not race on `dist/server.cjs`.
