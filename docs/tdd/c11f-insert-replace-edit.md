# C11f InsertReplaceEdit: TDD evidence

Scope: expose TypeScript's identifier replacement as an LSP `InsertReplaceEdit`
only when the client advertises `insertReplaceSupport`; preserve the complete
replacement `TextEdit` contract for older clients.

## TDD exception for this evidence file

- Reason: this file records completed RED/GREEN behavior slices and changes no runtime behavior.
- Scope: this file only.
- Owner: ArkTS Language Server maintainers.
- Expiry: 2026-09-13.

Initial parent revision: `3d9bb76`

## RED

The mid-token stdio fixture (`this.meth|od`) was extended with
`insertReplaceSupport: true` and expected an insert range ending at the cursor
plus a replace range covering the complete identifier. Before the adapter
change it returned only the legacy `range` form.

```sh
pnpm build
node --test --test-concurrency=1 \
  tests/semantic/semantic-characterization.test.mjs \
  --test-name-pattern "replaces the complete identifier when completion is accepted mid-token"
# FAIL: range TextEdit received; InsertReplaceEdit expected
```

## GREEN

The LSP adapter now captures `insertReplaceSupport` in the immutable completion
client profile. For a valid single-line cursor inside `replacementRange`, it
publishes `{ insert, replace, newText }`; otherwise it safely falls back to the
full `{ range, newText }` form. The test edit harness applies an InsertReplaceEdit
through its `replace` range, matching editor acceptance semantics.

Focused verification:

```sh
pnpm check
# PASS
node --test --test-concurrency=1 \
  tests/semantic/semantic-characterization.test.mjs \
  --test-name-pattern "replaces the complete identifier"
# PASS
```

The imported-receiver regression remains a no-capability client and continues
to assert the legacy complete replacement range.
