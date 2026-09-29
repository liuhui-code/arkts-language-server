# Direct-import reference anchors: compiler agreement before narrowing

Parent HEAD: `9f91122ac504365c57473a430094da09baac9309`, on
`codex/references-f2-fixed-benchmark`, with the existing dirty implementation
and user edits preserved. This is not a pristine-main benchmark.

## RED → GREEN

Extend the existing real child-process constructor transcript with
`import { Thing as Maker } from "./Target"; new Maker()`. The fixture already
contains explicit `super()`, two implicit inheritance levels, an aliased
`new Leaf()` with no base-class lexeme, re-export and an independent same-name
class. Query the direct-import construction as well as the local class and
construction; compare each query against its own legacy Location set.

```sh
node --test --test-name-pattern='explicit constructor references' \
  tests/semantic/references-anchor-reuse.test.mjs
```

RED twice, exit 1: 15,927 / 16,521 ms. The second failure identifies
`indexed-batched/Direct.ets: inherited constructor alias calls have no
base-class lexeme`. The public definition points to the same constructor as
the legacy/local construction; legacy includes `AliasConstruct.ets`, while
the direct indexed path drops it. This distinguishes candidate admission from
compiler alias resolution or an overlay-membership failure.

Minimal fix GREEN: 1/1, 42,882 ms. The direct-import type-alias fast-path
characterization passes before changes (1/1, 7,882 ms). After adding required
export metadata to its protocol fixture and extracting helpers, both tests
pass together (2/2, 43,190 ms). No constructor/class identity normalization.

## Ownership and safe fallback

An accepted direct candidate must have complete identity/support proof and
matching ready export metadata. Match the opaque declaration identity and URI;
do not parse identity strings or infer symbol equality from names. Metadata
lookup is bounded (64 names; 128 exports per lookup; reject saturated, stale,
ambiguous or different-generation results). Missing proof uses compiler-anchor
or complete-scope fallback, never a lexically narrowed final answer.

The declaration position crosses the existing immutable Worker contract.
Every final compiler batch resolves the original cursor and compares its
definition with that exact path/start. A constructor/class mismatch discards
the attempted result before retry without the seed. Only complete compiler
results enter the exact cache; no new persistent Program or Worker reuse.

## Metadata lookup race

Extend the existing framed LSP state-race transcript: candidates initially
ready; export lookup returns metadata then sidecar enters warming, retaining
the old committed generation. Its narrowed list omits known `Use.ets`.

```sh
node --test --test-name-pattern='references export anchor' \
  tests/semantic/references-index-state-race.test.mjs
```

RED: exit 1, 3,474 ms, missing the real file omitted by stale candidates.
Fix: recheck the existing freshness gate after metadata lookup, before
acceptance. Equal committed generation while warming is not sufficient.
The three direct/definition/export race transcripts are GREEN.

## Verification and size

The expanded constructor test also runs with tracing off; exactness must not
depend on observation. Both declaration policies and all four profiles agree.
Anchor/seed/overlay/cancellation/index-race/transport/inventory suite:
35/35 PASS, zero skips/failures, 109,923 ms. Independent resync/coalescing
suite: 2/2 PASS, 4,158 ms. See the [real Settings report](../reports/2026-09-27-settings-direct-import-anchor-proof.md)
for the final broader gate and same-build replay evidence.

Extract candidate support/proof formatting from the oversized proxy, retaining
its public fast-path characterization. Proxy shrinks 852→822 physical lines;
remaining over-limit migration debt is explicit. Other changed handwritten
files are below 500: seed helper 41, proof helper 45, constructor test 438,
race fixture 93, race test 72. The scripted sidecar's export response ownership
is extracted (510→451 lines; export helper 80). Its two staging tests must bundle
the modular fixture, not copy only its entry file; otherwise the child cannot
load the helper. The pre-existing catalog transcripts expose that packaging
regression; their assertions/timeouts are not weakened. The corrected catalog
and production-index staging transcripts pass 9/9, 8,143 ms. No Rust behavior or
schema changes, no commit/push/merge, no default experiment promotion.

The full gate also exposes two initial-catalog fixture assertions after direct
acceptance starts requiring export metadata. These fixtures previously served
only candidates/status; unsupported export requests correctly forced complete
fallback, preserving Locations but losing the asserted indexed path. Supply
matching ready `target-thing` metadata at class position 0:13, not fabricated
constructor proof or weakened assertions. All six wait/cancel/expiry/pre-open
transcripts pass, 7,560 ms. The three external-memory replay tests blocked by
sandbox process access pass unchanged under authorization, 3/3, 7,658 ms.
An authorized full `pnpm check:fast` rerun is then started against final files;
it completes with exit 0: **993/993 PASS**, zero failures/cancellations/skips/todos,
880,927.574 ms. This is a fresh whole-suite result, not inferred from focused
passes. Nested skip/todo cases intentionally test rejection by the runtime gate.
