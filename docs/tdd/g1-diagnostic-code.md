# G1 diagnostic code fidelity

Date: 2026-09-03

Parent revision: `9fc8d2217f88cf72976fa75b7b1feeaa16f4013d`

## Scope

This slice preserves the numeric TypeScript diagnostic code through the
existing diagnostic pipeline:

```text
TypeScript diagnostic
  -> core semantic protocol
  -> public semantic-engine port
  -> LSP publishDiagnostics
```

It does not implement or advertise code actions, and it adds no diagnostic
`data`, tags, or related information.

## Real stdio RED to GREEN

The public characterization uses the committed `quickfix.greeting` conformance
case, materializes its marker-free workspace, opens the document at version 1,
and waits for the matching `textDocument/publishDiagnostics` notification from
the real `dist/server.cjs --stdio` process.

Command:

```text
node --test tests/semantic/diagnostic-code-characterization.test.mjs
```

Initial RED was stable and isolated to the missing field:

```text
expected code: 2552
actual code: undefined
```

The already-correct values remained exact in RED: the marker range was
`3:19-3:26` in UTF-16 coordinates, severity was LSP Error (`1`), and source was
`arkts`. The minimal GREEN adds numeric `code` to the core and public semantic
diagnostic contracts and copies it through the TypeScript mapper, legacy
adapter, and LSP diagnostic conversion. No message-text matching is used to
select the diagnostic.

## Deduplication RED to GREEN

After the stdio tracer was GREEN, a second test exercised the exported
TypeScript diagnostic mapper with four diagnostics sharing the same message and
start coordinate:

- one code `1001`, one-character range;
- one code `1002`, the same range;
- one code `1001`, a two-character range;
- an exact duplicate of the first diagnostic.

RED retained only one item because the old key used start plus message. GREEN
retains the first three and removes only the exact duplicate. The key now
contains numeric code, category, all four mapped range coordinates, and the
flattened message, so different codes or different range ends cannot be merged.

Focused result: `2/2` passed, `0` failed, `0` skipped.

## Test-layer registration

The manifest test first failed because
`tests/semantic/diagnostic-code-characterization.test.mjs` was unassigned. It
is now classified as `bundle-e2e`; the manifest reports 39 total entries and 11
bundle E2E entries.

Command and result:

```text
node --test tests/test-layer-manifest.test.mjs
```

Result: `2/2` passed, `0` failed, `0` skipped.

## Exit criteria

- Published code is the numeric TypeScript value `2552`, not a parsed message
  or a string surrogate.
- UTF-16 range, severity, source, and versioned publication behavior remain
  unchanged.
- Diagnostic deduplication includes code and the complete mapped range.
- No code-action capability or implementation is included in G1.

Final verification:

```text
pnpm build
pnpm check
node --test --test-concurrency=1 \
  tests/semantic/diagnostic-code-characterization.test.mjs \
  tests/lsp-diagnostics.test.mjs \
  tests/test-layer-manifest.test.mjs
pnpm check:fast
```

Results: build and TypeScript check passed; focused diagnostics/manifest passed
`7/7` with no skips; the complete fast gate passed `220/220`, with 0 failed,
0 cancelled, 0 skipped, and 0 todo. The first sandboxed fast-gate attempt was
denied permission to overwrite generated `dist/server.cjs`; rerunning the same
command with the required artifact-write permission completed successfully.
