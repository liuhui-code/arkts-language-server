# H1 document-highlight production RED

Date: 2026-09-03

Parent revision: `b9b8d4bfee78530db8940d718cee653a367ed9a9`

## Public contract

`textDocument/documentHighlight` must be advertised and return only occurrences
of the selected symbol in the requested document. For the changed overlay in
this fixture, the ordered result is:

1. initialized declaration — `DocumentHighlightKind.Write (3)`;
2. assignment target — `DocumentHighlightKind.Write (3)`;
3. assignment source — `DocumentHighlightKind.Read (2)`;
4. final value read — `DocumentHighlightKind.Read (2)`.

All four ranges exactly cover `tracked`, are unique, and are sorted by source
position. Each line has a preceding non-BMP emoji, so the asserted characters
protect 0-based UTF-16 conversion.

The on-disk `Current.ets` has only two occurrences. The opened version has four
at different positions, which makes the response depend on document version 7
rather than stale disk text. `Other.ets` imports and reads the same exported
symbol; the exact four-item result therefore also excludes cross-file hits.

## Real boundary

`tests/semantic/document-highlight-depth.test.mjs` bundles `src/server.ts` to a
temporary path, starts that production bundle, and communicates only over
framed stdio LSP. It does not call the TypeScript service or semantic engine
directly.

## Stable RED

```text
node --test tests/semantic/document-highlight-depth.test.mjs
# 0 passed, 1 failed
```

Observed response:

```text
advertised: false
error.code: -32601
error.message: Unhandled method textDocument/documentHighlight
highlights: null
```

The expected side of the same assertion contains the complete capability,
kind, range, order, and current-document contract, so a superficial method
registration cannot turn the test green.

Cancellation and stale-result behavior remain a later protocol slice. This
first tracer bullet deliberately establishes the production semantic path only.
Per task ownership, the new executable test is not yet added to the shared
test-layer manifest.

No production code, feature matrix, execution plan, or layer manifest is
changed in this RED slice.
