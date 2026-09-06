# M1 LSP capability contract: TDD evidence

- Parent revision: `c757f2c3686397e0de2dd7e96aca8dd29a0528dc`
- Public boundary: production `initialize` over Content-Length framed stdio
- Focused build: `pnpm build`
- Focused test: `node --test tests/lsp-capability-contract.test.mjs`

## Contract

`CURRENT_LSP_CAPABILITY_CONTRACT` is machine-readable and path based. It
requires the current production bundle to advertise:

- UTF-16 positions;
- open/close plus incremental text synchronization;
- completion triggered by `.`;
- definition, hover, and document symbols;
- signature help triggered by `(` and `,`;
- workspace symbols from production composition.

It also requires `completionProvider.resolveProvider`, references, rename, and
code actions to be absent until their public transcripts are GREEN. The
contract lists allowed top-level capability keys, so an unrelated accidental
advertisement is reported as drift. This is intentionally not a snapshot of the
whole initialize response.

The assertion reports only changed capability paths with expected and received
values. Missing, mismatched, and unexpected paths are distinguished, and a path
is emitted at most once.

## RED -> GREEN cycles

1. **Production advertisement contract**
   - RED: `ERR_MODULE_NOT_FOUND` because the capability contract helper did not
     exist.
   - GREEN: a freshly built production `dist/server.cjs` returned the exact
     required and absent capabilities over a real child-process transcript.
2. **Concise drift diagnostics**
   - RED: an unexpected `renameProvider` was reported twice by the absent-path
     and unknown-top-level checks.
   - GREEN: the assertion emitted one line for the hover mismatch and one line
     for the unexpected rename capability.

Final focused result: 2 tests passed, 0 failed, 0 skipped.
