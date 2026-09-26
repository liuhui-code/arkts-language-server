# SQLite catalog activation trace

Parent revision: `1071efd089f353a5e03f056e263e4d682281d93e`.
The existing user-owned `AGENTS.md` change was left untouched.

This is an observation-only vertical slice. The public
`WorkspaceIndex<SqliteStore>::activate_catalog` contract remains a single
atomic replacement transaction. The old `replace_all` body was extracted
from the already-over-limit `lib.rs` to a cohesive sub-500-line module; the
parent file shrank from 2,449 to 2,393 lines. No schema, durability or
query-planning setting changed.

## RED → GREEN

The new integration test spawns its own test executable as a child so the
trace environment variable is process-local. It activates two generations,
reopens after each, verifies public reference candidates and committed
generation, then rejects a repeated generation. Default-off leaves no trace;
opt-in produces exactly two ordered numeric-only NDJSON records. An invalid
trace path cannot fail a catalog commit.

At the parent revision, this command failed because the opt-in trace file did
not exist:

```sh
cargo test -p arkts-index-sqlite --test catalog_activation_trace -- --nocapture
```

After the observer was added:

```text
cargo test -p arkts-index-sqlite: 29/29 passed
cargo test -p arkts-index-sidecar: 27 passed, 1 pre-existing ignored
cargo fmt --all -- --check: passed
cargo build -p arkts-index-sidecar --release: passed
```

The earlier, also new
[`reference_batch_contract.rs`](../../crates/index-sqlite/tests/reference_batch_contract.rs)
characterizes 120 parsed documents, aliases/re-exports, qualified references,
generation replacement, reopen and exact SQLite/MemoryStore parity. It was
GREEN on the parent before the rejected insertion experiment, and remains
GREEN after that experiment was removed.

The [real Settings stage profile](../reports/2026-09-22-settings-sqlite-stage-profile.md)
contains three trace-on and three trace-off complete LSP replays. This is
diagnostic attribution, not evidence that the 500 ms navigation or final
memory release gate has passed.
