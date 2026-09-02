# A2 semantic request reliability: TDD evidence

- Parent revision: `210e81f`
- Public boundary: Content-Length framed LSP child-process transcripts

## RED

`node --test tests/lsp-semantic-request-reliability.test.mjs`

All three transcript groups failed against the parent revision:

- client cancellation of definition never returned;
- a definition completed with a stale version-1 result after `didChange`;
- hover/signature/document-symbol handlers still answered after shutdown.

The table covers every advertised semantic request outside completion:
definition, hover, signature help, and document symbols.

## GREEN

The same command passed 3/3 after routing all five semantic request kinds
through one runner. It owns client cancellation mapping, latest-wins lanes,
document-version validation, shutdown rejection, neutral stale results, and
source-free duration/outcome logging. `pnpm check` also passed.
