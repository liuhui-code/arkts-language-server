# C11a mid-token completion replacement: TDD evidence

Scope: preserve TypeScript's list-level replacement span so accepting a
completion in the middle of an identifier replaces the whole token instead of
duplicating its suffix.

## TDD exception for this evidence file

- Reason: this file records an already completed RED/GREEN behavior slice and
  changes no runtime behavior.
- Scope: this file only.
- Owner: ArkTS Language Server maintainers.
- Expiry: 2026-09-13.

Parent revision: `1455890`

RED setup:

```sh
pnpm build
```

RED command:

```sh
node --test --test-concurrency=1 \
  --test-name-pattern "replaces the complete identifier when completion is accepted mid-token" \
  tests/semantic/semantic-characterization.test.mjs
```

Observed RED: at `this.meth|od`, the production server returned a TextEdit
ending immediately after `meth`. Accepting `method` therefore produced
`this.methodod`. The locked TypeScript 5.9.2 provider returned the complete
token span through `CompletionInfo.optionalReplacementSpan`, which the core
discarded.

Minimal GREEN (`5765345`): replacement range precedence is now
`CompletionEntry.replacementSpan`, then `CompletionInfo.optionalReplacementSpan`,
then the local typed-prefix fallback. Both TypeScript spans remain generated
coordinates and pass through the ArkTS virtual-document source mapper. The
shared list range and fallback are mapped once per request outside the item
loop; entry-specific spans still override them.

The real stdio regression places an emoji before the member access, checks the
full UTF-16 TextEdit range, applies the edit to prove the source stays exactly
`this.method`, then resolves the same item and requires the main edit to remain
unchanged.

GREEN:

```sh
node --test --test-concurrency=1 tests/semantic/semantic-characterization.test.mjs
# 13/13 passed

node --test --test-concurrency=1 \
  tests/semantic/typescript-cooperative-cancellation.test.mjs
# 14/14 passed

pnpm check
# PASS
```

Independent review found no P0/P1. InsertReplaceEdit capability negotiation,
commit characters and snippets remain separate contracts.
