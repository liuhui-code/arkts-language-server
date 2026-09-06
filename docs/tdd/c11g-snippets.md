# C11g snippets: TDD evidence

Scope: request TypeScript completion snippets only for clients advertising
`snippetSupport`, preserve snippet metadata through the semantic and Legacy
layers, and never expose snippet placeholders as plain text.

## TDD exception for this evidence file

- Reason: this file records completed RED/GREEN behavior slices and changes no runtime behavior.
- Scope: this file only.
- Owner: ArkTS Language Server maintainers.
- Expiry: 2026-09-13.

Initial parent revision: `eaaf8e7`

## RED

The real stdio fixture `class Circle implements Shape { ar| }` advertised
`snippetSupport` and expected the TypeScript class-member snippet for `area`.
Before the change, the item had no `insertTextFormat` and no `$0` placeholder.

```sh
pnpm build
node --test --test-concurrency=1 \
  tests/semantic/semantic-characterization.test.mjs \
  --test-name-pattern "publishes method snippets only to snippet-capable clients"
# FAIL: undefined !== 2
```

## GREEN

The LSP capability profile now carries `snippets` into completion queries.
TypeScript enables its class-member/object-literal snippet preferences only in
that mode; `isSnippet` is preserved through core, public, and Legacy contracts.
The LSP adapter emits `InsertTextFormat.Snippet` for capable clients and strips
placeholder syntax defensively when a non-capable client receives a snippet
from a custom semantic provider.

List and resolve both return the snippet format and `$0` placeholder:

```sh
pnpm check
# PASS
node --test --test-concurrency=1 \
  tests/semantic/semantic-characterization.test.mjs \
  --test-name-pattern "publishes method snippets"
# PASS
```
