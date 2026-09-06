# W2 workspace-symbol kind fidelity

Date: 2026-09-03

Parent revision: `fbe3d6f35f415da89641938f0d711acbfc78455e`

## Scope

This tracer exercises the production `workspace/symbol` adapter over a real
Content-Length framed stdio process. It verifies the complete kind vocabulary
that can reach the workspace-symbol service today:

- the Rust persisted index emits `class`, `struct`, `function`, and `method`;
- open-document overlays flatten the semantic document-symbol contract, which
  additionally emits `interface`, `enum`, `enumMember`, `property`,
  `constructor`, `module`, `type`, and `variable`.

An unrecognized future index kind must degrade explicitly to LSP
`SymbolKind.Variable`, so the server returns a valid conservative symbol rather
than inventing a more specific classification or failing the complete query.

## RED

The new protocol test passed for the four persisted-index kinds and for the
unknown-kind fallback. The other eight valid overlay kinds were all collapsed
to `SymbolKind.Variable` (`13`):

```text
constructor: expected 9, actual 13
enum: expected 10, actual 13
enumMember: expected 22, actual 13
interface: expected 11, actual 13
module: expected 2, actual 13
property: expected 7, actual 13
type: expected 26, actual 13
```

The `variable` kind correctly remained `13`.

Focused command:

```text
node --test --test-name-pattern="maps every workspace symbol contract kind" \
  tests/lsp-workspace-symbol.test.mjs
# 1 failed, 4 skipped
```

The first sandboxed attempt was unable to overwrite the generated
`dist/scripted-semantic-server.cjs`. Re-running the same command with explicit
fixture-write permission produced the product RED above.

## GREEN

The minimum production change extends the existing LSP adapter switch with the
eight missing semantic kinds. It retains the existing four index mappings and
the explicit unknown-to-variable fallback. No indexing, ranking, filtering,
capability, or semantic-discovery behavior changed.

Verification:

```text
node --test --test-name-pattern="maps every workspace symbol contract kind" \
  tests/lsp-workspace-symbol.test.mjs
# 1/1 selected passed, 4 skipped

node --test tests/lsp-workspace-symbol.test.mjs
# 5/5 passed, 0 skipped

pnpm check
# GREEN, no TypeScript errors
```
