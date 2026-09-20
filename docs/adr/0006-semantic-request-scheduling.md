# ADR 0006: Interactive/global semantic scheduling

Status: **Proposed; freshness contract precedes concurrency**.

## Context and proposed decision

The persistent semantic Worker serializes messages with one Promise queue and
awaits each request. A long reference verifier can therefore block a later
definition/hover even when the heavy compiler work runs in another Worker.
Introduce an interactive lane for current-document navigation/completion and a
single global lane for references and other proven global operations. Background
diagnostics/indexing remain lower priority.

A global request must capture an immutable, versioned input snapshot, release
the persistent mutation queue, and verify in the transient Worker. Before
publishing, compare required workspace/document revisions with current state.
Cancellation or mutation must abort or return ContentModified, never stale or
partial Locations. Do not simply reorder messages while a request already
holds the queue. Global verifier concurrency remains one; memory admission
accounts for the interactive context and verifier together.

## Gate

In a framed LSP interference test, launch long references, then unrelated
definition/hover and a document edit. Interactive requests must complete
before references while seeing the correct revision; old references must not
return success. Preserve the existing cancellation first-cause and diagnostics
contracts. Revert to the FIFO path on any snapshot race.
