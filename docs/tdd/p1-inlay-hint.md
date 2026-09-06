# P1 `textDocument/inlayHint`: TDD evidence

## Scope and parent

- Parent revision: `a21cbe1fbcc6a47e00d0f675fd3e67621318a897`
- Public boundary: a real bundled child process over Content-Length framed stdio.
- Contract: complete parameter-name and inferred-type items from the current
  ArkTS overlay, exact UTF-16 source positions, end-exclusive range filtering,
  deterministic bounded output, and fail-closed ArkTS lowering maps.

## Tracer-bullet RED

The fixed ArkTS fixture was opened through stdio before any handler or
capability existed:

```text
pnpm build && node --test \
  --test-name-pattern='returns complete parameter-name inlay hints for an ArkTS call' \
  tests/lsp-transcript.test.mjs

error: {"code":-32601,"message":"Unhandled method textDocument/inlayHint"}
```

The minimal vertical path added an editor-neutral semantic query, delegated to
TypeScript 5.9 `provideInlayHints`, and mapped only complete non-empty labels.
A generated point is accepted only when generated-to-source-to-generated
mapping returns the identical offset. This rejects hints in lowering-only
insertions.

## Incremental RED to GREEN

Separate public transcripts then drove the rest of the behavior:

- enabling inferred variable types changed the narrow UTF-16 range from `[]`
  to the exact `: string` item after an emoji;
- a hint exactly at the requested range end was initially returned and was
  then excluded;
- missing, negative, and reversed ranges initially escaped the fixed
  `InvalidParams` contract;
- 1,003 reversed/duplicated scripted items initially escaped the 1,000-item
  limit, and a second response exceeded the 256 KiB serialized-result limit;
- an unknown semantic kind was initially mislabeled as a parameter and is now
  rejected.

The LSP boundary now sorts ordinally, deduplicates exact complete items, omits
false padding fields, caps the final wire-shaped array at 1,000 items and
256 KiB of `JSON.stringify` UTF-8 bytes, and freezes item positions, items, and
the returned array.

Adding the method to the existing scripted request table characterized the
shared cancellation, stale-result, and shutdown behavior:

```text
node --test \
  --test-name-pattern='maps cancellation for every advertised semantic request|drops stale results for every advertised semantic request|rejects every advertised semantic request after shutdown' \
  tests/lsp-semantic-request-reliability.test.mjs

3 passed, 0 failed
```

## Immutable artifact before advertisement

Before advertising the provider, the portable install acceptance copied the
built artifact, removed its source/dependency inputs, installed it, and passed
exact parameter/type/range/UTF-16/overlay assertions inside an ArkUI builder
lowering:

```text
node --test \
  --test-name-pattern='installs one verified artifact without source dependencies or a rebuild' \
  tests/release/portable-install.acceptance.mjs

1 passed, 0 failed
```

## Advertisement RED to GREEN

Only after bundle, protocol, and immutable installed evidence were green did
the capability/evidence contract require the provider. The production
initialize transcript then failed for the intended missing field:

```text
LSP capability contract mismatch:
- inlayHintProvider: missing; expected true
```

Advertising `inlayHintProvider: true` (without `resolveProvider`) and binding
the exact artifact claim made the focused capability and matrix tests green.
The matrix now owns 20 required capability paths and 18 immutable artifact
claims.

Final verification passed the five focused transcript/protocol/capability/
matrix/corpus files (55/55), immutable artifact acceptance (1/1), and
`pnpm check`. The integration owner runs the repository-wide gate after the
parallel semantic-worker work settles.

## Remaining risks

- TypeScript's inlay-hint query is synchronous. Client cancellation and stale
  results are enforced at request boundaries, but a running compiler query is
  not preemptible yet.
- The wire budget bounds retained/transmitted results, not TypeScript's
  temporary array allocation before filtering.
- Hint preferences are a conservative fixed policy. Workspace configuration
  for parameter/type/property/return hints is a later product slice.
- Zero-length mapping is fail-closed, but richer left/right affinity at ArkTS
  rewrite boundaries belongs in the virtual-document abstraction eventually.
