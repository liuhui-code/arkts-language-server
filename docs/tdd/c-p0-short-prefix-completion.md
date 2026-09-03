# C-P0 short-prefix completion TDD evidence

- Parent revision: `34d0c5536278988a92ca33c6870faf07c2cc0cbc`
- Public boundary: a real materialized workspace through `dist/server.cjs --stdio`
- Scope: one-character non-member local completion and two-character unopened
  workspace auto-import completion

## C-P0a: one-character local completion

The test opens an isolated `ShortPrefix.ets` overlay containing an in-scope
`genuineLocal` and an out-of-scope `ghostMember`, then requests completion after
the single character `g`. It requires exactly one `genuineLocal`, forbids
`ghostMember` and the unopened workspace export `Greeter`, and verifies that the
LSP text edit replaces exactly that one character.

RED command:

```sh
pnpm build
node --test --test-concurrency=1 \
  --test-name-pattern='completes a one-character non-member local with an exact replacement' \
  tests/semantic/semantic-characterization.test.mjs
```

Observed: 0 passed, 1 failed, with `Expected genuineLocal in []`. The
non-member prefix guard rejected identifiers shorter than three characters
before calling TypeScript.

GREEN changed only that invocation guard to accept a one-character identifier.
The separate module-export policy remained disabled for this prefix, so the
slice did not enable one-character workspace auto-import scanning.

Observed with the same focused command: 1 passed, 0 failed.

## C-P0b: two-character unopened auto-import

The second test reuses the corpus-owned `completion.unicode` range, replaces
its `Gree` text with `Gr`, and opens only `Home.ets`. It requires exactly one
unopened `Greeter` class and an exact two-character replacement edit. The
position and expected range remain derived from the UTF-16-aware corpus marker.

RED command:

```sh
node --test --test-concurrency=1 \
  --test-name-pattern='completes an unopened class from a two-character prefix' \
  tests/semantic/semantic-characterization.test.mjs
```

Observed after C-P0a was GREEN: 0 passed, 1 failed, with `Expected one Greeter
in []`. TypeScript was now invoked, but module-export completion still required
three characters.

GREEN introduced the explicit policy
`MIN_MODULE_EXPORT_PREFIX_LENGTH = 2` and used it for TypeScript module-export
completion. No fuzzy filtering, ranking, completion-list, or protocol contract
behavior changed.

Observed with the same focused command: 1 passed, 0 failed.

## Regression verification

```sh
pnpm build
node --test --test-concurrency=1 tests/semantic/semantic-characterization.test.mjs
```

Result: 7 passed, 0 failed, 0 skipped. This includes the existing four-character
completion resolve, exact auto-import application, version-2 diagnostics, and
definition recheck tracer.

No conformance schema or fixture changes were required: the local case uses a
temporary materialized workspace file, while the auto-import case derives its
shorter source and range from the existing corpus marker.
