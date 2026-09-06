# P1 semantic-worker Call Hierarchy supervisor validation TDD evidence

- Date: 2026-09-06
- Parent revision: `650681fcdfa58fb2f6d6e7043590cecc431dcd63`
- Scope: correlate an active request's trusted method with its worker response
- Out of scope: worker dispatcher, LSP adapter, capability advertisement

## Defect

The protocol exposed a strict method-aware response decoder, but
`RootSemanticWorkerSupervisor` still decoded every terminal response through
the generic JSON envelope. Consequently a Call Hierarchy result could settle a
request despite missing its worker-owned source fingerprint, exceeding the
16-item prepare cap, or carrying invalid method-specific ranges.

The request method is already immutable supervisor-owned state in
`active.wire`. It is the authority used to select the response schema; no method
field from the response is accepted or trusted.

## RED -> GREEN

Focused command:

```sh
node --test \
  --test-name-pattern='source proof|dispatched method schema' \
  tests/semantic-worker-supervisor.test.mjs
```

At the parent revision, a prepare result without `sourceFingerprint` resolved
successfully. The regression failed with `Missing expected rejection`.

The supervisor now requires an active wire request and calls
`decodeSemanticWorkerResponseForMethod(active.wire.method, message)` before
checking identity or settling the request. Missing proofs, 17 prepare items, and
an incoming selection range outside its declaration range all produce the
existing root-level protocol fault: the active request rejects with
`worker-unavailable`, the endpoint terminates exactly once, and later requests
remain fenced. Existing generic behavior for the other 18 methods is unchanged.

## GREEN evidence

```sh
node --test \
  tests/semantic-worker-call-hierarchy-protocol.test.mjs \
  tests/semantic-worker-protocol.test.mjs \
  tests/semantic-worker-supervisor.test.mjs
# tests 75, pass 75, fail 0

pnpm check
# tsc --noEmit -p tsconfig.json: PASS

pnpm build
# production bundle: PASS
```
