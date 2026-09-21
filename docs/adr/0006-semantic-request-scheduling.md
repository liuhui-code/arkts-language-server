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

The [Settings/API-24 real-project benchmark](../reports/2026-09-21-settings-api24-benchmark.md)
exposes a remaining boundary: the LSP references handler waits for an
already-started automatic diagnostic to quiesce **before** entering the
complete-result cache. Three of 27 cached repeats waited 1.96–1.99 seconds
despite about 1 ms of eventual server-side cache work. This does not negate
the implemented references/interactive lane separation; it adds a distinct
diagnostic-interference RED test and safe cache-hit scheduling slice. Normal
diagnostics must remain enabled, and a cache miss must not create an
unbudgeted second heavy Program alongside diagnostics.

## Gate

A framed LSP interference test uses a default-off verifier delay, launches
references, then sends definition, hover and a document edit. Definition and
hover complete before references with queue waits below 250 ms; the edit makes
the old references request fail ContentModified, and a new definition sees the
new document revision. Direct supervisor coverage also proves out-of-order
response routing and first-cause cancellation. See
[the TDD evidence](../tdd/references-scheduling.md).
