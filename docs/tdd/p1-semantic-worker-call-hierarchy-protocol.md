# P1 semantic-worker Call Hierarchy protocol TDD evidence

- Date: 2026-09-06
- Parent revision: `7a34e7b3a87273d5e02989c294b542982364b280`
- Scope: bounded request/result codecs for the three Call Hierarchy worker methods
- Production dispatcher/capability integration: deliberately excluded from this slice

## Wire contract

The semantic-worker protocol is now version 2. This is an intentional version
fence, not an additive version-1 claim: the method allowlist, follow-up document
version nullability, and method-specific result schemas all changed. A version-2
decoder rejects version-1 request and response envelopes, so a stale or mixed
worker fails closed instead of interpreting the new shapes under an old contract.

The request schemas are:

| Method | `expectedDocumentVersion` | Exact args |
| --- | --- | --- |
| `prepareCallHierarchy` | non-negative number | `{ position }` |
| `outgoingCalls` | non-negative number or `null` | `{ item, sourceFingerprint }` |
| `incomingCalls` | non-negative number or `null` | `{ item, sourceFingerprint }` |

`0` remains a valid open-document version. `null` is reserved for a bounded
disk snapshot and is rejected for prepare and every non-follow-up method.

The follow-up item is the strictly parsed client identity: URI, name, kind,
optional detail, declaration range, and contained selection range. It cannot
carry `sourceFingerprint`, LSP `data`, or any other field. The main-thread
source authority contributes its current 64-character lowercase SHA-256 proof
as the independent `args.sourceFingerprint` field.

The method-aware response decoder is reusable before a worker sends a result
and after the main thread receives its structured clone. Every returned item
requires its own exact lowercase source fingerprint. Prepare accepts only
`complete/items` or an allowlisted `incomplete/reason`; outgoing and incoming
also accept the exact `stale-item` outcome. Failure reasons are restricted to:

- `project-membership-incomplete`
- `source-outside-workspace`
- `source-unavailable`
- `source-unmappable`
- `result-limit-exceeded`

All CH objects use exact data-property schemas, canonical local file URIs,
allowlisted kinds, ordered ranges, and selection containment. Raw CH validation
runs before generic JSON canonicalization so extra `undefined` fields cannot be
laundered away and over-limit arrays fail before their elements are traversed.
Accessors are rejected from descriptors without invoking their getters.

An adversarial follow-up at parent revision
`650681fcdfa58fb2f6d6e7043590cecc431dcd63` tightened the cost of that rejection.
Each CH array now reads the intrinsic own `length` data descriptor and checks its
method limit before enumerating keys or element descriptors. Exact records check
their bounded own-key set against required and optional allowlists before reading
only those allowlisted data descriptors. A 10,000-entry items/calls/ranges array
therefore performs no key or element scan, and a result item with 70,000 unknown
properties performs no property-descriptor reads. Proxy getters are never run.

The dedicated bounds are 16 prepare items, 256 calls, 64 ranges per call, and
2,048 ranges in aggregate. The existing 256 KiB args, 8 MiB message,
depth-32, node-65,536, and 16 KiB URI budgets still apply. Validation uses
bounded iterative loops and the existing iterative wire-size scanner; it does
not recursively walk or `JSON.stringify` untrusted values.

## RED -> GREEN cycles

The focused command for every cycle was:

```sh
node --test tests/semantic-worker-call-hierarchy-protocol.test.mjs
```

Observed REDs, each made GREEN before the next behavior was introduced:

1. `prepareCallHierarchy` failed with `Invalid semantic worker request`; the
   allowlist and exact position args were added.
2. A disk outgoing request failed with `Invalid semantic worker request`; the
   exact client item, independent source proof, and nullable follow-up version
   were added.
3. `incomingCalls` failed with `Invalid semantic worker request`; it was added
   to the same strict follow-up family while preserving open version `0`.
4. The first result tracer failed because
   `decodeSemanticWorkerResponseForMethod` did not exist; the reusable
   method-aware response boundary and exact prepare result were added.
5. The incomplete tracer found no exported reason allowlist; the five fixed
   reasons and exact incomplete outcome were added.
6. A disk outgoing response failed with `Invalid semantic worker response`;
   nullable response identity and exact outgoing target/range decoding were
   added.
7. An incoming item with a 63-character proof was accepted; exact incoming
   caller decoding was added.
8. A follow-up whose envelope URI differed from its item URI was accepted;
   the two identities are now required to match.
9. Extra CH request/result fields whose value was `undefined` were silently
   omitted by generic canonicalization; raw exact-schema preflight now rejects
   them before canonicalization.
10. The version-fence tracer reported `1 !== 2`; the protocol was bumped and
    version-1 requests/responses are now rejected.
11. A 10,000-entry call collection performed 20,004 observable `length` getter
    reads before rejection; the intrinsic length preflight now rejects items,
    calls, and ranges before key or element traversal.
12. A result item with 70,000 unknown fields caused 70,007 descriptor reads;
    bounded exact-record preflight now rejects it before reading any descriptor.

The existing allowlist regression then produced a deliberate RED because it
still enumerated only 18 methods. It now covers all 21 exact argument families.

## GREEN evidence

```sh
node --test tests/semantic-worker-call-hierarchy-protocol.test.mjs
# tests 17, pass 17, fail 0

node --test \
  tests/semantic-worker-call-hierarchy-protocol.test.mjs \
  tests/semantic-worker-protocol.test.mjs \
  tests/semantic-worker-supervisor.test.mjs
# tests 75, pass 75, fail 0

pnpm check
# tsc --noEmit -p tsconfig.json: PASS

pnpm build
# production bundle: PASS

node --test tests/release-artifact-topology.test.mjs
# tests 6, pass 6, fail 0
```

The focused suite uses real `MessageChannel` structured clones at both request
and response boundaries and covers exact/next limits for 16/17 items,
256/257 calls, 64/65 ranges per call, and 2,048/2,049 total ranges.

## Deliberate follow-ups

- The supervisor now correlates a response with the trusted method stored on
  its active request and applies this method-aware decoder before settlement.
  Disk-snapshot routing and the worker dispatcher remain separate slices.
- Main-thread physical source authority, worker-owned document state,
  cancellation composition, crash restore, and the real responsiveness E2E
  remain separate slices.
- Call Hierarchy capability advertisement remains withheld until those
  integration and installed-artifact gates are GREEN.
