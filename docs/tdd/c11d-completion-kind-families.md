# C11d completion kind families: TDD evidence

Scope: preserve object-property, enum, enum-member, and module completion kinds
from TypeScript through the public semantic contract and Legacy adapter to LSP,
without regressing class fields or adding a linear AST walk to the completion
hot path.

## TDD exception for this evidence file

- Reason: this file records already completed RED/GREEN behavior slices and
  changes no runtime behavior.
- Scope: this file only.
- Owner: ArkTS Language Server maintainers.
- Expiry: 2026-09-13.

Initial parent revision: `5a7ca04`

## D1 — object literal property context

RED command:

```sh
pnpm build
node --test --test-concurrency=1 \
  --test-name-pattern "completes contextual object properties without a prefix" \
  tests/semantic/semantic-characterization.test.mjs
```

Observed REDs:

- typed `Options` keys were Field(5), not Property(10);
- a first contextual implementation incorrectly changed `[receiver.fi]` from
  Field to Property;
- a 10,000-declaration structural test observed 160 cancellation checkpoints,
  proving that context lookup linearly walked preceding syntax;
- `{ ti|` at EOF remained Field because the recovery AST ended at the cursor.

GREEN (`444d12f`): reuse the LanguageService Program AST and generated offset,
find the touching syntax node by binary descent, then walk parents by depth and
binary-search the object property array. Only direct non-computed property-name
slots are Property. A real `CloseBraceToken`, rather than source characters,
distinguishes a closed object from an unfinished EOF object. Every comparison
and parent step retains cooperative cancellation checkpoints.

## D2–D4 — closed kind pipeline

One real stdio assertion was added and observed RED before each corresponding
production mapping:

| Slice | TypeScript raw kind | RED LSP kind | GREEN LSP kind | Commit |
| --- | --- | --- | --- | --- |
| D2 | `enum` | Property(10) | Enum(13) | `d33b3c6` |
| D3 | `enum member` | Property(10) | EnumMember(20) | `3b7cb4a` |
| D4 | `module` | Property(10) | Module(9) | `5e84851` |
| D5 | `external module name` | Property(10) | Module(9) | `774cd0f` |

Each slice expands the editor-neutral completion-kind union and the core,
Legacy, and LSP mappings only for that kind. Existing field/method assertions
remain the class-member regression contract.

GREEN:

```sh
node --test --test-concurrency=1 tests/semantic/semantic-characterization.test.mjs
# 16/16 passed

node --test --test-concurrency=1 \
  tests/semantic/typescript-cooperative-cancellation.test.mjs
# 16/16 passed after D1

pnpm check
# PASS after every slice
```

Independent D1 review found and drove both correctness edge cases and the
linear-cost regression before reporting no remaining P0/P1. A later full-kind
review found the separate module-specifier raw kind; an ambient-module stdio
RED closed it without changing the already complete public/LSP module path.
