# P1 bounded completion list: TDD evidence

Scope: make completion publication compatible with the bounded 512-entry
resolution registry, then establish one explicit completion-list contract from
the semantic port to LSP. This is the safety and contract foundation for the
provider/Registry completeness work; it does not yet make Legacy's
`isIncomplete` value authoritative.

## S0: protect completion resolution from same-response eviction

Parent revision: `31ae797`

RED command:

```sh
node --test --test-concurrency=1 \
  --test-name-pattern "bounded incomplete completion list" \
  tests/lsp-reliability.test.mjs
```

Observed RED: a scripted semantic engine returned 513 items. Mapping all of
them through the 512-entry resolution registry evicted the first UUID while the
same response was still being built, so resolving the first returned item
failed with JSON-RPC `-32602` (`unknown or stale completion item`).

Minimal GREEN (`e860cfa`): cap the LSP publication at 256 items before mapping
or inserting any resolution record. The response is marked incomplete when the
adapter cap truncates it. The real stdio test resolves both `bulk-000` and
`bulk-255`; exact 256/257 boundary cases protect the cap and flag.

This is an adapter safety fence, not the final allocation strategy: providers
can still build oversized arrays before reaching it.

## S1: one semantic completion-list contract

Parent revision: `e860cfa`

RED command:

```sh
node --test --test-concurrency=1 \
  --test-name-pattern "runs injected|treats 256|propagates an incomplete" \
  tests/lsp-reliability.test.mjs
```

Observed RED: 3/3 selected cases failed. A normal small completion response was
still an array, while exact-boundary and provider-incomplete list fixtures
reached the old adapter's `result.slice` and failed with an internal error.

Minimal GREEN: `SemanticEnginePort.complete` now returns a
`SemanticCompletionList`; normal, empty, stale, superseded and capped paths all
publish an LSP `CompletionList`. The adapter ORs the provider flag with its own
defensive truncation and still slices before `completionResolutions.remember`.
The lifecycle suite was migrated from the obsolete post-close `[]` assertion.

Focused and adjacent GREEN:

```sh
pnpm check
# PASS

node --test --test-concurrency=1 tests/lsp-reliability.test.mjs
# 15/15 passed; 0 failed/skipped/todo/cancelled

node --test --test-concurrency=1 tests/lsp-document-lifecycle.test.mjs
# 3/3 passed; 0 failed/skipped/todo/cancelled
```

Independent review found no production P0/P1 after the lifecycle migration.

## Explicitly open work

- TypeScript must propagate native `CompletionInfo.isIncomplete` and report
  whether its 128-item accepted-prefix quota truncated remaining raw entries.
- ArkUI must stop at a bounded prefix probe instead of materializing up to
  10,000 resources, and must report partial/unavailable index state.
- Registry arbitration must cap providers independently, preserve ArkUI-first
  and TypeScript source identity semantics, and OR every incomplete reason.
- Legacy currently wraps the old core array with `isIncomplete: false`; this is
  a contract migration only and cannot be claimed as completeness.
- The resolution registry remains count-bounded rather than byte-bounded, and
  concurrent response headroom still needs an explicit policy and test.
- Completion range mapping still needs a snapshot-owned line-start index;
  production worker composition and real cancellation remain separate T5/T6
  checklist items.
