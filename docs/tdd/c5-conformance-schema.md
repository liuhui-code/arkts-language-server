# C5 conformance corpus schema validation

Date: 2026-09-03  
Parent revision: `c757f2c3686397e0de2dd7e96aca8dd29a0528dc`  
Branch: `plan/lsp-completeness-e2e`

## Contract

`fixtures/conformance/v1/corpus.json` declares every current marker case with
five fields: `id`, `kind`, `role`, repository-independent `file`, and marker
`shape`. The materializer returns cases in declaration order with stable
metadata and materialized file URIs.

The materializer rejects:

- a repeated point, start, or end marker for one case;
- a marker ID not declared by `corpus.json`;
- a declared case with no markers;
- actual `point`, `range`, or `point+range` markers that do not match the
  declared shape, including incomplete ranges;
- any marker found outside its declared file, which also prevents one case
  from spanning files.

This is deliberately a small manifest contract implemented with built-in JSON
parsing. It is not a general-purpose schema framework.

## RED → GREEN slices

Every slice used:

```sh
node --test tests/conformance-corpus.test.mjs
```

Observed RED results, in order:

1. The valid-schema test failed with ENOENT because `corpus.json` did not exist.
2. The injected duplicate point marker produced `Missing expected rejection`.
3. The injected undeclared marker produced `Missing expected rejection`.
4. Removing both markers for a declared case produced `Missing expected rejection`.
5. Declaring a `range` for actual `point+range` markers produced
   `Missing expected rejection`.
6. Moving one point endpoint to another file produced
   `Missing expected rejection`.

Each RED received only its minimal validation before the same focused command
returned GREEN. C1-C4 remained green throughout.

## Final GREEN

Command:

```sh
node --test tests/conformance-corpus.test.mjs
```

Observed result: exit code 0; 9 tests passed, 0 failed, 0 skipped.

## Files in this slice

- `fixtures/conformance/v1/corpus.json`
- `tests/support/materialize-conformance-workspace.mjs`
- `tests/conformance-corpus.test.mjs`
- `docs/tdd/c5-conformance-schema.md`
