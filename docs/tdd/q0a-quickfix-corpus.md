# Q0a spelling quick-fix conformance corpus

- Parent revision: `c8774d7a912482fdccad317e52e03f1b56d48584`
- Scope: versioned conformance fixture and corpus validation only
- Intended downstream contract: diagnostic code `2552` over `greting`, with
  the unique spelling replacement `greeting`

## RED

The corpus test first required a `quickfix.greeting` declaration using the
existing five-field schema and a deterministic materialized source/range. The
fixture and declaration did not yet exist.

```sh
node --test tests/conformance-corpus.test.mjs
```

Observed result: 9 passed, 1 failed. The new test received `undefined` instead
of the required corpus declaration.

## GREEN

`QuickFixConsumer.ets` is deliberately small:

- it uses `struct`, forcing the existing ArkTS virtual rewrite before
  TypeScript analysis;
- `greeting` is declared in the same `build` method as the misspelling;
- an emoji precedes `greting` on its source line;
- exactly one start/end marker pair encloses only `greting`.

The materialized case uses the current minimal corpus schema:

```json
{
  "id": "quickfix.greeting",
  "kind": "diagnostic",
  "role": "spelling-quickfix",
  "file": "workspace/entry/src/main/ets/pages/QuickFixConsumer.ets",
  "shape": "range"
}
```

The schema currently carries only identity, kind, role, file, and marker
shape. This slice does not introduce a general expected-result schema.
Diagnostic code `2552` and replacement `greeting` are therefore recorded as
the downstream contract here and confirmed by the read-only probe below.

The focused test proves:

- repeated materialization produces identical marker-free source and range;
- the marker URI targets the copied fixture rather than the repository source;
- the range selects exactly `greting`;
- its source offset is the actual typo offset;
- the preceding emoji contributes two UTF-16 code units;
- `greeting` and `greting` both occur inside the same `build` method, in that
  order;
- the source still contains `struct`, preserving the rewrite precondition.

```sh
node --test tests/conformance-corpus.test.mjs
```

Observed result: 10 passed, 0 failed, 0 skipped.

## Read-only TypeScript evidence

An in-memory probe used the repository's TypeScript `5.9.2` and the production
`struct` to `class` rewrite shape. It did not change production or add an
internal-API test.

Observed source mapping and result:

- generated diagnostic start: `100`;
- mapped source start: `101`, equal to the marker-derived typo offset;
- range length: `7`;
- diagnostic code: `2552`;
- message suggests `greeting`;
- exactly one code fix was returned;
- fix name: `spelling`;
- its only edit replaces the same seven source characters with `greeting`.

This is fixture-selection evidence, not a permanent assertion over unstable
TypeScript internal code-fix APIs. G1/Q1 will establish the public diagnostic
and LSP code-action contracts through production boundaries.
