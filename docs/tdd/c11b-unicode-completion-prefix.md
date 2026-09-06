# C11b Unicode completion prefix: TDD evidence

Scope: recognize ArkTS/TypeScript Unicode identifiers before completion
filtering and provider quotas, preserve UTF-16 replacement coordinates, and
count code points rather than UTF-16 code units for the two-character
module-export threshold.

## TDD exception for this evidence file

- Reason: this file records an already completed RED/GREEN behavior slice and
  changes no runtime behavior.
- Scope: this file only.
- Owner: ArkTS Language Server maintainers.
- Expiry: 2026-09-13.

Parent revision: `62d19d0`

RED setup:

```sh
pnpm build
```

RED command:

```sh
node --test --test-concurrency=1 \
  --test-name-pattern "filters a Unicode ArkTS identifier before the provider quota" \
  tests/semantic/semantic-characterization.test.mjs
```

Observed RED: a production stdio fixture declared 180 ASCII distractors before
`中文组件`, then requested completion for `中` after an emoji. The ASCII-only
prefix extractor treated the query as empty, published the first 128 unrelated
items, marked the list incomplete, and omitted the requested class.

Minimal GREEN (`d569c33`): scan backward by Unicode code point with the locked
TypeScript 5.9.2 `isIdentifierPart`/`isIdentifierStart` predicates. Filtering
therefore happens before the accepted-item quota, while the returned string
length remains UTF-16 units for source offsets and TextEdit ranges. The module
export threshold uses an allocation-free early-exit code-point count so one
astral identifier character is not mistaken for two typed characters.

The real E2E now returns only `中文组件`, complete, with an exact TextEdit that
replaces `中`. A controlled core test captures the actual options passed to
`getCompletionsAtPosition`: `𐐀` keeps module exports disabled and `𐐀R` enables
them. An initial remote-auto-import negative assertion was deliberately removed
after mutation testing proved it insensitive. Replacing the correct threshold
with UTF-16 `.length` makes the controlled test RED (`true !== false`), while
the two-code-point case also protects the surrogate-pair scan from deletion.

GREEN:

```sh
node --test --test-concurrency=1 tests/semantic/semantic-characterization.test.mjs
# 14/14 passed

node --test --test-concurrency=1 \
  tests/semantic/typescript-cooperative-cancellation.test.mjs
# 15/15 passed

pnpm check
# PASS
```

Independent review found no P0/P1 after the mutation-sensitive core contract
replaced the ineffective assertion.
