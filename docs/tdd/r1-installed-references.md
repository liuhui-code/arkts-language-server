# R1 installed references evidence

## Parent revision

`c2d0a30 feat(references): return complete source-mapped results`

## Contract

The immutable installed command advertises `referencesProvider` and, with only
the consumer document open, returns deterministic exact UTF-16 locations for
the unopened barrel and origin. `includeDeclaration: false` excludes only the
canonical origin; `includeDeclaration: true` adds it without duplicates.

## RED

Command:

```sh
node --test --test-name-pattern='installs one verified artifact without source dependencies or a rebuild' tests/release/portable-install.acceptance.mjs
```

Observed on the parent revision plus a temporary test-only expectation: `0`
passed, `1` failed, `3` skipped. The immutable artifact smoke returned no
verified `references` transcript. Once the real protocol assertions were in
place, the temporary helper-result sentinel was removed.

## GREEN

Commands:

```sh
node --test tests/conformance-corpus.test.mjs
node --test --test-name-pattern='installs one verified artifact without source dependencies or a rebuild' tests/release/portable-install.acceptance.mjs
node --test tests/lsp-feature-matrix.test.mjs
```

The conformance corpus passes `10/10`. The focused immutable install acceptance
passes `1/1` with the other three cases intentionally filtered, and verifies:

- `referencesProvider: true` from installed bytes;
- only the consumer is opened;
- `includeDeclaration: false` returns the unopened barrel plus the consumer
  import and query ranges;
- `includeDeclaration: true` adds exactly the unopened canonical origin range;
- every expected location is marker-derived UTF-16 data.

The feature matrix now records immutable artifact evidence and has no
`references` artifact gap. The complete portable install file also passes
`4/4`; the matrix passes `10/10`.
