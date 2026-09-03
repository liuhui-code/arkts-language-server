# H6c local LSP failure evidence TDD record

- Parent revision: `d06477e82102213eb2c0bc9ac1fa32a10a19ef3a`
- Public boundary: `LspProcess.writeFailureEvidence(evidenceDirectory, { name })`
  composed through the existing `withTestEvidence({ captureFailure }, run)` hook
- Scope: local failure artifacts only; no CI/workflow or upload behavior changed

## Slice 1: bounded, redacted evidence from a real failed child

The fixture is a real Node child. After a stdin trigger it writes a large stderr
payload through a write callback, then emits two valid framed JSON-RPC messages
followed by an invalid `Content-Length` header. The test registers the child
`close` event before triggering it, so stderr drain and termination are
event-synchronised rather than guarded by a sleep.

RED command:

```sh
node --test tests/lsp-process.test.mjs
```

Result: `18/19` passed. `withTestEvidence` retained only `failure.json`; the
expected `lsp-failure.process.json`, `lsp-failure.transcript.ndjson`, and
`lsp-failure.stderr.log` files were absent.

GREEN added `writeFailureEvidence(...)`. It takes one immutable diagnostic
snapshot and writes these fixed artifacts through parallel temporary-file
writes followed by parallel renames:

- `*.process.json`: schema/version, PID, terminal state, pending descriptions,
  parser state, and stderr byte counters
- `*.transcript.ndjson`: only the existing redacted direction/sequence/kind/
  method/id/byte-size envelopes
- `*.stderr.log`: only the existing bounded head-and-tail stderr text

The test verifies exact filenames and schema, bounded file sizes, stderr byte
accounting, and both send/receive transcript entries. Canary values placed in
request params, response result, notification params, and the discarded middle
of stderr do not occur in any retained process artifact. The keys `params`,
`result`, and `source` are also absent.

Focused GREEN result: `19/19` passed, `0` failed.

## Slice 2: evidence names cannot escape their case directory

RED command:

```sh
node --test tests/lsp-process.test.mjs
```

Result: `19/20` passed. `name: "../escaped"` was accepted and the writer
resolved instead of rejecting (`Missing expected rejection`).

GREEN restricts names to a 1-64 character identifier that begins with an ASCII
letter or digit and otherwise contains only ASCII letters, digits, `.`, `_`, or
`-`. Validation happens before taking the snapshot or creating temporary files;
the traversal attempt now rejects with `TypeError`, and the evidence root still
contains only the intended case directory.

## Final verification

```sh
node --test tests/lsp-process.test.mjs
```

Result: `20/20` passed, `0` failed, `0` skipped (about 3.2 seconds).

The existing `withTestEvidence` success lifecycle remains covered by its own
tests and its helper was not changed in this slice.
