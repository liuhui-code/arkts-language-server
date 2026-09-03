# H6d layer runner failure evidence TDD evidence

- Parent revision: `11b52f2e8d4c09b3806813450b7e25b3fa1658dd`
- Scope: retain bounded evidence when the explicit Node test-layer runner exits
  nonzero or by signal
- Public boundary: `runNodeTestLayer({ ..., evidenceRoot })`
- Existing primitive: `withTestEvidence(...)`

## RED: failed layers left no evidence

Command:

```sh
node --test tests/test-layer-runner.test.mjs
```

The test used isolated temporary evidence roots and fake children for both a
nonzero exit and `SIGTERM` across these selectors:

- `--fast`
- `--layer artifact-e2e`
- `--layer large`

All six failure cases returned the original termination, but each evidence root
was empty:

```text
Expected values to be strictly equal:
0 !== 1
```

The success characterization already left no files behind.

## GREEN: compose runner termination with `withTestEvidence`

The runner now reads `ARKTS_TEST_EVIDENCE_ROOT` by default and accepts an
injected `evidenceRoot` for isolation. A failed child termination is converted
to an internal fixed error only while `withTestEvidence` writes the bounded
record; `runNodeTestLayer` then restores and returns the exact original
`{ code, signal }`. The unchanged CLI block therefore continues to propagate
the same exit code or signal.

Evidence identity is deterministic and bounded:

- case id: `node-test-layer/<safe-target>`
- metadata: only `{ target }`
- failure summary: the existing provider's fixed `Test case failed` message,
  plus scalar code and signal

No test entries, source text, arbitrary environment values, or secret canaries
are recorded. Unknown injected layer ids collapse to the fixed `custom` target.
Successful runs remove their transient evidence directory, and a spawn error is
still rejected as the exact same error object.

## Listener-registration regression caught during GREEN

The first composition spawned the child before the asynchronous evidence
directory setup. A fake child could emit `exit` in a microtask before
`childTermination` installed its listeners, leaving the promise pending. The
runner now creates the child and installs termination listeners together inside
the evidence callback, after the directory is ready.

Final focused command:

```sh
node --test tests/test-layer-runner.test.mjs
```

Result: `17/17` passed, `0` failed, `0` skipped.

This slice does not modify the evidence primitive, package scripts, test-layer
manifest, workflows, or production language-server code.
