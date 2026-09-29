# ADR 0006: Interactive/global semantic scheduling

Status: **Accepted and implemented for references; broader global operations remain deferred**.

## Context and proposed decision

The persistent semantic Worker serializes messages with one Promise queue and
awaits each request. A long reference verifier can therefore block a later
definition/hover even when the heavy compiler work runs in another Worker.
Introduce an interactive lane for current-document navigation/completion and a
single global lane for references and other proven global operations. Background
diagnostics/indexing remain lower priority.

References now retain their revision-bound request and cancellation cell while
their verification runs outside the persistent Worker's serial queue. The
supervisor permits only classified interactive methods to run beside that one
detached request; diagnostics and other global operations remain serialized.
Any mutation advances the revision and marks the detached request
ContentModified, so its eventual response cannot publish stale or partial
Locations. Global verifier concurrency remains one.

The cancellation bridge uses request-local async context so overlapping
interactive and references work observe their own cancellation cells through
the stable TypeScript host token. Opt-in trace events identify interactive
methods admitted during references and report their queue wait. This decision
does not yet generalize the detached lane to implementations, rename or call
hierarchy.

The [candidate-stage snapshot regression](../tdd/references-candidate-snapshot.md)
extends freshness to asynchronous index/status work outside the persistent
Worker's queue. Cancellation is checked before document synchronization; an
old operation must never enqueue its version-1 buffer after version 2.
Managed input/configuration revisions fence semantic admission and completion,
including canonical aliases and overlapping workspace roots. A semantic
`content-modified` failure follows the runner's stale path even if only a
nested workspace's LSP freshness lane was directly aborted. The references
adapter emits ContentModified (-32801), not InternalError (-32603), with no
partial Locations. Existing first-cause client cancellation retains priority.

The [pre-F6b Settings/API-24 benchmark](../reports/2026-09-21-settings-api24-benchmark.md)
exposed a second scheduling boundary: the LSP references handler waited for
an already-started automatic diagnostic to quiesce **before** entering the
complete-result cache. Three of 27 cached repeats waited 1.96–1.99 seconds
despite about 1 ms of eventual server-side cache work. F6b keeps normal
diagnostics and moves only a proven complete cache hit ahead of that wait.
Cache misses still quiesce diagnostics before compiler work, preventing an
unbudgeted second heavy Program; the request runner still checks freshness
and cancellation before responding. A [framed-LSP RED/GREEN test](../tdd/references-diagnostic-cache.md)
proves a cached response completes before a held diagnostic settles and that
versioned diagnostics still publish. In three fresh-process
[Settings/API-24 runs](../reports/2026-09-21-settings-api24-diagnostic-cache.md),
27 cached requests had 67 ms median, 96 ms observed nearest-rank P95 and
100 ms maximum, with exact 248-Location responses. These smoke results do
not claim cold/miss navigation under 500 ms or graduate the release gate.

## Gate

Document close is a lifecycle barrier, not a replaceable full-text snapshot.
Queued `close → open` must reach the semantic Worker in that order, even if
the reopened document restarts at the same or a lower version. Coalescing may
still replace ordinary text changes, but must not erase either side of close.
The [public reopen regression](../tdd/references-reopen-mutations.md) proves
exact references and isolated anchor fallback without relaxing document truth.

A framed LSP interference test uses a default-off verifier delay, launches
references, then sends definition, hover and a document edit. Definition and
hover complete before references with queue waits below 250 ms; the edit makes
the old references request fail ContentModified, and a new definition sees the
new document revision. Direct supervisor coverage also proves out-of-order
response routing and first-cause cancellation. See
[the TDD evidence](../tdd/references-scheduling.md).

The active-lane audit applies only while references is still running. An
interactive request sent after awaiting the terminal references response is
not required to produce `references.interactive.start`; it retains the normal
public response and `request.completed` contracts. The 2026-09-28 test repair
checks the two bypassing requests before the edit and separately audits the
fresh definition after cancellation. Three independent runs and the 51-test
focus pass with unchanged deadlines and no production change; the broader
whole-fast gate remains open due to independently retained timeouts.

R-10's opt-in validated-definition route preserves the same request contracts.
Two additional [public characterization transcripts](../tdd/references-anchor-reuse.md)
cancel or edit after the reused anchor enters a transient batch. Neither old
request returns partial Locations; same-process recovery proves the complete
result, including the added unsaved reference. This does not claim real-project
cancellation latency or change the production scheduler.
