# WUI-003: burst navigation cost

Parent: `b57ad075a80fdc2169189ba7da17fc6bb98a0866`. Work is isolated from
the unrelated WUI-009 client patch. No deployment, merge or publishing.

## Current decision

The server-directory experiment below is **Rejected (ADR0039)**. Its source,
tests, artifacts and failed checks remain in the evidence archive; the final
server and Worker are byte-identical to main. The selected fix is the client
producer backpressure in **Proposed ADR0040**, delivered as a pinned Zed source
patch, not a server/extension update. The initial implementation slices below
are experiment history, not pending work or shipped product behavior.

- [x] Baseline source/public-component characterization and eager64→expected2 RED.
- [x] Lazy one-identifier production; manual admission, all64 and warm-cache controls.
- [x] Source/refresh/policy supersession RED/GREEN, identical-input and disposal controls.
- [x] Context31 and downstream105 tests, plus6 cases×20 scheduler seeds.
- [x] Final release libraries and rustfmt check.
- [x] Six matched30K producer experiments; foreground3557.65→174.67ms median,
  all64 retained; one pre-existing error per round remains a functional gap.
- [ ] Deployment/Windows physical UI/endurance: not performed by this local candidate.

[Final report](../reports/2026-11-02-wui003-burst-root-cause-and-fix.md) and
[client TDD](../tdd/2026-11-02-wui003-client-backpressure.md) record the actual
candidate identity and remaining acceptance scope; issue103 is not closed.

## Reproduction and hypotheses

The original Windows 21.562s automatic definition spent 21.293s waiting for
preceding independent reads. Foreground priority and exact-key sharing already
exist in main; they cannot collapse 64 different method/position keys.

The same 30K isolated Photos input and 64-key transcript on current Mac main
reproduced p50 1913ms / maximum 3680ms. A separate instrumented run found no hot
Program rebuild: raw compiler lookups were below 0.4ms, while 654 configuration
identity lookups cost approximately 37ms per request. Remaining preparation,
validation and serialization also contribute. These are measured local results,
not a direct comparison with the old Windows SDK/UI execution.

Ranked falsifiable hypotheses: repeated physical identity work; empty-definition
full-scope fallback; scheduling interference; parent transport/event-loop delay.
The first is measured; the existing witnessed capacity failure avoids its former
repeated large fallback. Keep scheduling/barrier/cancellation regressions.

## Implementation slices

1. RED public framed-child LSP: growing regular SDK siblings still requires a
   fresh check for every member, but full canonical path walks should be shared
   by common parent inside each synchronous validation phase.
2. Introduce bounded phase-owned parent observations. Exact case regular entries
   only; symbolic/unknown/absent entries use ordinary native resolution. Actual
   load guards remain direct. Close all consumed directory observations before
   the existing final fence; final scan has a new phase, inside the same lease.
3. Regress SDK mutation, symlink/directory and case changes, independent requests,
   unrelated sibling churn, cancellation, fairness and mutation barriers.
4. Compare identical 30K replay rounds, plain and separately instrumented; record
   all responses/errors, phases, canonical calls, Program/Worker counts and RSS.
5. Applicable complete checks, report limitations and remaining costs. A burst
   is not actual Zed UI acceptance or a continuous endurance session.

## Producer-side follow-up from measured residual

The final three-round server-only comparison improves the burst by about 10%,
leaving a multi-second tail. This is insufficient to close WUI-003.
Pinned Zed `8dd255c3eafb5231056fe4e6f601cedd011f1c93` has a concrete automatic
producer: RelatedExcerptStore selects 32 identifiers and eagerly starts
definition + typeDefinition for each. The original 32 pairs also match the
cursor 47:45 distance order exactly, including the three-line window and method
signature; this is strong source correspondence, not an original runtime stack.

- Establish the upstream public Project/context characterization, then a RED
  request-admission regression. Apply Zed's gpui-test guidance and preserve its
  mandatory manual-review README marker.
- Create background LSP Tasks lazily behind one identifier slot (up to two
  requests per capable server), retaining all 32 identifiers, both methods,
  cache hits and result order. Do not label or drop independent server requests.
- Test a manual Project definition while the automatic pair is held, complete
  every background request, warm-cache and context-disposal controls. Preserve
  the separate WUI-009 source/patch and original test checkout after each run.
- Deliver a separate pinned client patch: a language-server or launcher update
  cannot modify this editor-side producer. A 30K real-child replay of the two
  arrival patterns is a controlled protocol experiment, not actual Zed UI.

Evidence root: `.bench/wui003-burst-20261102/`. Existing no-budget product policy
and soft 500ms experience target remain unchanged. No stale-result shortcut,
request dropping, increased thresholds, parallel shared compiler or new Worker.
