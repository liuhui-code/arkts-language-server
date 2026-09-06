# H6c failure evidence provider TDD evidence

- Parent revision: `f85af75b624257877275cd9281cef1ff787758a0`
- Scope: compose real-process evidence capture with the existing failure directory lifecycle
- Public API: `withTestEvidence({ ..., captureFailure }, run)`

## Slice 1: capture only failed cases

RED command:

```sh
node --test tests/test-evidence.test.mjs
```

The new test ran one successful and one failed case with the same provider. The
successful directory was cleaned and the provider was not called, but the
failed case also skipped it:

```text
Expected: captureCount 1
Actual:   captureCount 0
```

GREEN: the failed path now awaits
`captureFailure({ evidenceDirectory })` before writing `failure.json`. The
provider wrote `process.json` and `transcript.ndjson`, both remained in the
retained unique evidence directory, the success path still did not call the
provider, and the original test error was rethrown.

## Slice 2: provider failure cannot replace test failure

RED: a provider wrote one partial process file and then threw a `TypeError`
whose message and extra fields contained long secret/source markers. That
provider error replaced the original semantic assertion and no `failure.json`
was written.

GREEN: provider failure is contained. `failure.json` records only this fixed,
bounded summary:

```json
{
  "name": "TypeError",
  "message": "Failure evidence provider did not complete"
}
```

Only a small allowlist of standard error names is retained; the provider's
message, code, source, environment, and arbitrary fields are discarded. The
partial process file stays available and the exact original test error object
is rethrown.

## Final verification

```sh
node --test tests/test-evidence.test.mjs
```

Result: `4/4` passed, `0` failed, `0` skipped.

This slice adds the composable failure hook only. It does not modify
`LspProcess`, test-layer discovery, CI upload, or workflow configuration.
