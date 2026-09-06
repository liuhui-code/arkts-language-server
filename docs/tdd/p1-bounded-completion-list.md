# P1 bounded completion list: TDD evidence

Scope: make completion publication compatible with the bounded 512-entry
resolution registry, then establish one explicit completion-list contract from
the TypeScript core through the semantic port to LSP. This is the safety and
contract foundation for the remaining ArkUI/provider arbitration work.

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

## S2: TypeScript provider completeness reaches the client

Parent revision: `15fed96`

Initial core RED command, before the boundary matrix was split into individually
named cases:

```sh
node --test --test-concurrency=1 \
  --test-name-pattern "cancels completion|reports native and bounded TypeScript completion" \
  tests/semantic/typescript-cooperative-cancellation.test.mjs
```

Observed RED: 2/2 selected cases failed because the core still returned an
array. Neither the TypeScript provider's native flag nor the unscanned tail of
a locally capped result had an explicit outcome. That combined matrix case was
then split without changing its assertions. The persisted cases isolate
provider-reported incomplete, 127 raw, exact 128 raw, 129 raw with exactly 128
accepted, and 129 accepted entries. The filtered case proves the quota applies
to accepted results and that consuming all raw entries remains complete. The
129th array slot has a guarded getter, proving the core can report an unscanned
tail without reading it. The existing cancellation case continues to reject
partial publication and now requires an incomplete fresh retry.

Public RED command after rebuilding the production bundle:

```sh
node --test --test-concurrency=1 \
  --test-name-pattern "reports an incomplete ordered completion list" \
  tests/semantic/semantic-characterization.test.mjs
```

Observed RED: a real `.ets` class with 129 matching `this.mem` methods returned
the stable first 128 labels, but Registry/Legacy discarded the core flag and
published `isIncomplete: false`.

Minimal GREEN: the TypeScript core returns items plus completeness, setting the
flag when `CompletionInfo.isIncomplete === true` or when the accepted 128-item
prefix leaves raw entries unconsumed. Registry preserves ArkUI-first result
ordering and propagates the TypeScript flag; Legacy maps the items and flag to
the public list. No TypeScript continuation option/cache was enabled in this
slice.

Focused and adjacent GREEN:

```sh
node --test --test-concurrency=1 \
  tests/semantic/typescript-cooperative-cancellation.test.mjs
# 13/13 passed

node --test --test-concurrency=1 \
  --test-name-pattern "reports an incomplete ordered completion list" \
  tests/semantic/semantic-characterization.test.mjs
# 1/1 selected passed

node --test --test-concurrency=1 tests/workspace-file-change-coordinator.test.mjs
# 19/19 passed

node --test --test-concurrency=1 \
  tests/semantic/project-membership-language-service.test.mjs
# 5/5 passed

pnpm check
# PASS
```

## S3: bounded ArkUI prefix completion and truthful status

Parent revision: `5bb2033`

Index RED:

```sh
node --test --test-concurrency=1 \
  --test-name-pattern "immutable exact|bounds ordered ArkUI prefix" \
  tests/semantic/arkui-diagnostics-depth.test.mjs
```

Observed RED: 2/2 selected cases failed. A ready prefix query had no explicit
completeness flag; a 10,000-resource matching tail returned and scanned all
10,000 entries instead of the first 128. An algorithmic getter probe then made
an intermediate implementation RED because it read the 129th sentinel twice.
GREEN performs binary lower-bound lookup, consumes at most 128 matches, probes
the sentinel once, and never touches item 130. For 10,000 entries the guard
allows at most 143 reference reads: 14 binary-search probes, 128 accepted
items, and one sentinel.

Provider RED:

```sh
node --test --test-concurrency=1 \
  --test-name-pattern "deterministic ArkUI resource completion|bounds and caches|quota boundaries" \
  tests/semantic/arkui-language-features.test.mjs
```

Observed RED: 3/3 selected cases failed against the old array contract. GREEN
returns a list from the provider, marks ready exact-128 results complete,
ready 129 results incomplete, unavailable known results incomplete, partial
empty results incomplete, and non-ArkUI/ready-empty results complete. Mapping
is limited to the index's first 128 resources.

The real stdio case was mutation-checked by temporarily removing the ArkUI flag
from Registry's OR, rebuilding, and running:

```sh
pnpm build

node --test --test-concurrency=1 \
  --test-name-pattern "bounded incomplete ArkUI completion list through stdio" \
  tests/semantic/arkui-language-features.test.mjs
```

The mutation failed at `false !== true`; restoring
`arkui.isIncomplete || typescript.isIncomplete`, rebuilding, and rerunning made
the case GREEN. The client receives the ordered first 128 of 129 real resource
names. A resource beyond the completion quota still returns both exact
definition locations and does not produce a missing-resource diagnostic,
proving the shared snapshot and exact map were not truncated.

Full adjacent GREEN:

```sh
node --test --test-concurrency=1 tests/semantic/arkui-language-features.test.mjs
# 10/10 passed

node --test --test-concurrency=1 tests/semantic/arkui-diagnostics-depth.test.mjs
# 10/10 passed

node --test --test-concurrency=1 tests/workspace-file-change-coordinator.test.mjs
# 19/19 passed

pnpm check
# PASS
```

## Explicitly open work

- TypeScript's native incomplete continuation path is not enabled: the LSP
  completion context, `allowIncompleteCompletions`, and a bounded continuation
  cache need a separate version-aware contract. Local 128-item truncation is
  already truthful without it.
- Registry still needs defensive per-provider caps and dedicated mixed-provider
  evidence. ArkUI-first order and the OR of current provider flags are already
  covered; TypeScript same-label/different-source identity must remain intact.
- ArkUI warm prefix queries are bounded, but cold index construction still
  maps every resource range with repeated source scans. A 10,000-entry
  exploratory fixture remained about eight seconds cold while warm lookup fell
  below one millisecond; a line-start index needs its own deterministic RED.
- In-root resource-shaped symlinks are currently skipped while the index claims
  ready, which can cause a false missing-resource diagnostic. Symlink traversal
  and physical-cycle policy need a separate correctness slice.
- The resolution registry remains count-bounded rather than byte-bounded, and
  concurrent response headroom still needs an explicit policy and test.
- Completion range mapping still needs a snapshot-owned line-start index;
  production worker composition and real cancellation remain separate T5/T6
  checklist items.
