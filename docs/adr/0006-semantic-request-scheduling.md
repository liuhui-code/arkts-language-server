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

## Gate

A framed LSP interference test uses a default-off verifier delay, launches
references, then sends definition, hover and a document edit. Definition and
hover complete before references with queue waits below 250 ms; the edit makes
the old references request fail ContentModified, and a new definition sees the
new document revision. Direct supervisor coverage also proves out-of-order
response routing and first-cause cancellation. See
[the TDD evidence](../tdd/references-scheduling.md).
