# S3 LSP edit application TDD evidence

- Parent revision: `d4fbf6b1980ad41dfb3b280600c470e9e9e9799b`
- Scope: strict test-side application of LSP `TextEdit[]`

## RED → GREEN slices

Each slice used:

```sh
node --test tests/lsp-edits.test.mjs
```

1. **UTF-16 position after emoji**
   - RED: `tests/support/lsp-edits.mjs` did not exist (`ERR_MODULE_NOT_FOUND`).
   - GREEN: a range starting after `😀` replaced the intended text exactly.
2. **Multiple non-overlapping edits**
   - RED: only the first edit was applied (`1 two three` instead of `1 two 3`).
   - GREEN: all offsets are calculated from the original source and edits are
     applied in descending source order.
3. **Character out of bounds**
   - RED: character `6` on a five-unit line was silently treated as an insert.
   - GREEN: positions past their UTF-16 line length throw `RangeError`.
4. **Negative position**
   - RED: line `-1` was silently treated as line zero.
   - GREEN: line and character must be non-negative integers.
5. **Invalid range direction**
   - RED: a start after its end duplicated source text.
   - GREEN: reversed ranges are rejected before any edit is applied.
6. **Overlapping edits**
   - RED: overlapping ranges produced corrupted text without an error.
   - GREEN: overlap is detected against original offsets and rejects the
     complete edit set before mutation.

## Final verification

```sh
node --test tests/lsp-edits.test.mjs
```

Result: `6/6` passed, `0` failed, `0` skipped.

This is deliberately a test helper, not a production `WorkspaceEdit` codec.
`WorkspaceEdit.changes` was not added because no S3 scenario requires it yet.
