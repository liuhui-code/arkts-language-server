# WUI-003: bound automatic context request production

This patch changes the **Zed client**. A server, Worker or extension launcher
update cannot apply it. No daily editor has been installed or restarted.

Pinned upstream: `zed-industries/zed@8dd255c3eafb5231056fe4e6f601cedd011f1c93`
(the original Windows1.25.3 evidence). Relevant original files are Git-blob
identical to the saved official tree. Other editor versions need separate
verification. Upstream source retains its GPL-3.0-or-later license.

The automatic edit-prediction context eagerly creates32 identifier lookups,
each issuing definition and typeDefinition. Start each Project Task lazily
behind one identifier instead. Both methods, all32 identifiers, cache hits,
ranking and debounce remain. This bounds this producer to one request pair per
participating server; manual requests and other producers are independent.
This producer-wide policy also affects other languages. Highly parallel backends
or high-RTT remote sessions may take longer to finish automatic context;
their throughput has not been validated by this ArkTS-focused candidate.

Bind deferred work to the source version and refresh identity. New input stops
unissued old work and prevents partial old cache commits. Identical refreshes
keep the active work alive. Every started live refresh ends with a completed
or explicitly superseded outcome. Disposed contexts issue no further requests.
Existing completed-cache semantics are retained; this patch does not establish
stronger cross-dependency validity guarantees for that upstream client cache.

## Apply and verify

Use an isolated checkout of the pinned Zed revision. The patch includes the
upstream-required manual README review marker. Preserve that marker throughout
local work; the agent does not remove it or claim human review.

```sh
git apply --check /path/to/WUI-003-context-backpressure.patch
git apply /path/to/WUI-003-context-backpressure.patch
cargo test --locked -p edit_prediction_context --lib
ITERATIONS=20 cargo test --locked -p edit_prediction_context --lib context_backpressure_tests
cargo test --locked -p edit_prediction --lib
cargo build --locked --release -p edit_prediction_context -p edit_prediction
```

If the checkout already carries that README marker (including WUI-009), use
`git apply --exclude='*README.md'` for both check and application. The Rust paths
of the two patches are disjoint. Their combined physical UI behavior still
needs validation. The local roundtrip used the marked baseline and checked
every Rust file byte-for-byte against the compiled candidate.

The reproducible baseline RED is
[fixtures/context-backpressure-red.rs](fixtures/context-backpressure-red.rs).
On a separate unpatched checkout with the review marker added first, copy it
to `crates/edit_prediction_context/src/context_backpressure_tests.rs`, declare
that test module in `edit_prediction_context.rs`, and run the targeted crate
tests. The production Project/context API sends64 requests before any response;
the assertions require only the first pair. This is an in-process framed fake
LSP client test, not a physical UI test or a server-child acceptance transcript.

New pipeline/test/debug files stay within500 physical lines. The main context
file shrinks771→437; `edit_prediction.rs` remains migration debt3684→3625,
with its debug-event responsibility extracted coherently.

Current validation receipts and deployment limits are maintained in
[ADR0040](../../../docs/adr/0040-client-context-request-backpressure.md) and the
[WUI-003 report](../../../docs/reports/2026-11-02-wui003-burst-root-cause-and-fix.md).
Protocol producer experiments do not certify Windows, physical Zed UI or a
continuous endurance session. The stock client remains unchanged until a
containing Zed build is installed.
