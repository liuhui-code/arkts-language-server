# R-10 captured binding snapshot + authoritative source overlays

Parent revision: `9f91122ac504365c57473a430094da09baac9309`.
Dirty branch `codex/references-f2-fixed-benchmark`; existing edits preserved.
Follows [validated storage](references-class-binding-snapshot.md).

## Bounded public contract

`resolve_class_base_binding_snapshot(snapshot, expected_generation, overlays,
document_uri, class_name_position)` consumes one immutable storage snapshot.
Same generation, at most 128 unique nonempty snapshot URIs, valid structural
heritage/provenance/bindings, and unique already-requested overlay URIs are
required. Invalid admission yields `Unknown`, not a partial successful chain.

Every relevant active overlay must be supplied from one caller-fenced workspace,
configuration/index and open-document revision. Generation equality alone does
not prove workspace identity, current disk freshness or overlay completeness;
this API cannot detect omitted buffers. No production DocumentAuthority or
sidecar consumer is introduced by this slice.

An overlay replaces that URI's persisted facts in an operation-local copy.
Malformed/unsupported current source on the traversed chain shadows disk success
with unknown; it is never dropped to permit stale fallback. A valid overlay can
fill a requested unknown/missing row. Neither overlay facts nor transient source
resolution fields are persisted. Spelling resolution is recomputed from inputs.

Local classes and explicit-extension named import/re-export alias chains share
one kernel with the existing fresh-source API. The latter retains its caller-
supplied source universe and extensionless behavior, without eagerly parsing
unrelated sources. The bounded snapshot API rejects **every extensionless hop**:
an omitted/unknown competing row cannot certify filesystem absence. Supporting
those imports requires a separate authoritative candidate-availability proof.

The 32-step traversal guard/cycles/ambiguity withhold results. `NoBase` and
`Resolved` are lexical discovery only, never ArkTS type identity, constructor
coverage or reference-scope exclusion evidence.

## Actual RED → GREEN

At the recorded parent revision, these public commands exited 101 before their
minimal implementations:

1. `cargo test -p arkts-index-core --test class_binding_snapshot_resolution`:
   missing public API (E0432).
2. Same command with `persisted_named`: two re-export hops returned `Unknown`
   rather than the existing fresh-source contract's exact declaration/range.
3. With `bounded_snapshot`: one available extensionless candidate incorrectly
   returned `Resolved` despite missing competitor/absence evidence.
4. With `overlay_admission`: a foreign overlay was ignored and stale success
   returned; duplicate overlays were not fenced either.
5. With `public_snapshot_shape`: mismatched row heritage URI incorrectly
   returned `Resolved`; validate public shape before consuming facts.

Each implementation was checked GREEN before adding the next behavior.
Remaining tests characterize already-GREEN guards: malformed barrel/Child,
Unicode UTF-16 span, requested unknown row, transient field forgery, generation
mismatch, local/no-base parity, inner extensionless re-export, cycles/budget and
oversized/unknown rows. SQLite tests use the public API after actual close/reopen
and prove unsaved redirection does not modify the stored snapshot.

## GREEN refactoring and boundary

Before/after shared-kernel extraction, core public contracts passed (59 tests
at that point). Final focused core overlay tests: 13/13. The existing parser
assembly/URI validation was cohesively extracted under the original 49-test
characterization, reducing the touched oversized core lib 1,603→1,557 lines.
New handwritten modules/tests remain ≤500 physical lines; this parent is still
migration debt. No mechanically split test or new semantic parser is added.

No schema/protocol/planner, constructor narrowing, defaults/SDK/Worker or memory
policy change. Next: caller-fenced production snapshot admission, authoritative
extensionless source availability, then compiler-backed inherited/factory/own-
constructor coverage and exact public differential before any exclusion.

Verification and same-build Settings/API24 evidence are recorded in
[the report](../reports/2026-09-27-settings-class-binding-overlay.md). Cold/edit
≤500 ms, original >3 GB reproducer and memory graduation remain open.
