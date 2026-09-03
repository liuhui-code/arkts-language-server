# H1b document-highlight core provider

Date: 2026-09-03

RED parent revision: `00fea12da330c9c886ca60db45f6c159dc0d4074`

## Core contract

`SemanticTypeEngineRegistry.prepare()` exposes a document-highlight query for
the current source document. It uses the resident changed overlay, returns
1-based semantic UTF-16 ranges, maps TypeScript `writtenReference` to `write`
and `reference` to `read`, removes duplicate ranges, and sorts by source range.

The TypeScript request receives only the current file in `filesToSearch`; it is
not a reduced or repackaged cross-file references query. Any unexpected target
file, unknown highlight kind, non-round-trippable query offset, or highlight
span that does not exactly preserve source text makes the whole result fail
closed as `[]` rather than leaking a partial response.

## RED

```text
node --test tests/semantic/document-highlight-core.test.mjs
# 0 passed, 1 failed
# TypeError: context.documentHighlights is not a function
```

The core test includes the current overlay plus another project document that
imports the same symbol. Its expected response contains only the overlay's four
ordered occurrences and calls the query twice to protect deterministic output.

## Minimal GREEN

- `src/core/protocol.ts` defines the internal `text | read | write` highlight
  vocabulary and range result.
- `SemanticTypeQueryContext` delegates the query to its workspace-owned
  TypeScript engine.
- `TypeScriptLanguageServiceEngine` calls
  `getDocumentHighlights(file, offset, [file])`, exact-maps every returned span,
  deduplicates ranges, and sorts the result.

Verification:

```text
node --test tests/semantic/document-highlight-core.test.mjs
# 1 passed, 0 failed

node --test \
  tests/semantic/document-highlight-core.test.mjs \
  tests/semantic/project-membership-language-service.test.mjs \
  tests/workspace-file-change-coordinator.test.mjs
# 19 passed, 0 failed

pnpm check
# passed
```

This slice deliberately stops before semantic-port, protocol adapter, LSP
registration, capability advertisement, cancellation, or stale-result wiring.
The production public RED remains RED until those boundaries are integrated.
