# C3 Node workspace-index sidecar adapter: TDD evidence

Parent revision: `e5697ca82c5423ab135773899a492c66d033f9bc`

## Delivered boundary

`SidecarWorkspaceIndex` implements the editor-neutral `WorkspaceIndexPort` and
is not wired into the LSP composition root in this slice. Each open workspace
owns one child-process session. Requests use protocol version 1 and a
session-local, monotonically increasing numeric ID; child processes are spawned
directly with `shell: false`.

The adapter canonicalizes file workspace roots and cache directories before
`initialize`. It maps `refresh`, `search`, `status`, and `shutdown` to the Rust
NDJSON contract, validates returned symbol/range fields, and normalizes Rust's
`containerName: null` to the optional TypeScript field. An id-less
`{ protocol, event, params }` envelope has a separate optional hook so future
catalog progress events do not consume or corrupt request IDs.

stderr is continuously drained to prevent pipe backpressure, but its content
is never retained or copied into public errors/status. Unexpected exit rejects
every pending request and leaves the last committed generation queryable as a
local `degraded` status. AbortSignal rejection does not kill the process: the
cancelled ID remains reserved until its late response is safely drained.

Binary resolution precedence is constructor option,
`ARKTS_INDEX_SIDECAR_PATH`, then `ARKTS_LSP_HOME`/project root under
`target/release`. Cache resolution supports `ARKTS_INDEX_CACHE_DIR` and native
macOS, XDG/Linux, and Windows defaults.

## RED/GREEN vertical slices

### 1. Public process tracer

```text
node --test tests/index-adapter.test.mjs
```

RED: esbuild could not resolve `src/index/sidecar-workspace-index.js`.
GREEN: a scripted executable sidecar observed protocol-1 IDs 1 through 5 for
initialize, refresh, search, status, and shutdown; canonical aliases and the
exact refresh payload were verified through the child-process boundary.

### 2. Prompt cancellation with late-response drain

```text
node --test --test-name-pattern='aborted request' tests/index-adapter.test.mjs
```

RED: the delayed search fulfilled instead of rejecting. GREEN: abort returned
`AbortError` immediately, an unrelated status request completed, the late
cancelled response was drained, and a later search remained healthy.

### 3. Exit isolation and source-free failure

```text
node --test --test-name-pattern='reports degraded' tests/index-adapter.test.mjs
```

RED: status after exit failed with `index sidecar session is closed`. GREEN:
exit code 17 rejected concurrent pending work and subsequent status returned
`degraded` at generation 0. A 294 KiB stderr payload containing a sentinel
source string was drained without the sentinel appearing in errors or status.

### 4. Strict response protocol

```text
node --test --test-name-pattern='strict sidecar protocol error' tests/index-adapter.test.mjs
```

RED: malformed JSON, protocol mismatch, and unknown response IDs produced
generic `Error` objects. GREEN: all three produce `SidecarProtocolError` and
degrade the session while sidecar business errors retain their separate typed
error.

```text
node --test --test-name-pattern='blank-protocol-line' tests/index-adapter.test.mjs
```

RED: an empty stdout line was ignored and the search succeeded. GREEN: empty
lines are protocol corruption and reject pending work.

### 5. Portable path and cache resolution

```text
node --test --test-name-pattern='portable sidecar paths' tests/index-adapter.test.mjs
```

RED: `src/index/cache-directory.js` did not exist. GREEN: explicit/env/project
binary paths and macOS, XDG, Windows, and override cache paths matched the
public table.

### 6. Exact workspace-symbol contract

```text
node --test --test-name-pattern='maps one workspace session' tests/index-adapter.test.mjs
```

RED: a top-level function returned `containerName: null`, violating the
optional TypeScript contract. GREEN: symbols and non-negative positions are
validated field by field and null containers are omitted.

### 7. Future-compatible event lane

```text
node --test --test-name-pattern='id-less sidecar event' tests/index-adapter.test.mjs
```

RED: a valid catalog progress event was rejected as an invalid response.
GREEN: the event reached the optional hook and the pending search response
completed independently.

## Real Rust transcript

```text
cargo build -p arkts-index-sidecar
ARKTS_INDEX_REAL_SIDECAR=target/debug/arkts-index-sidecar \
  node --test --test-name-pattern='real Rust sidecar' tests/index-adapter.test.mjs
```

The real binary initialized generation 0, persisted an ArkTS class at
generation 1, found it by acronym, shut down, and restored it from SQLite in a
new process as generation-1 `stale` data. Result: 1 passed, 0 failed.

The real-binary test skips during frontend-only runs when neither the default
debug binary nor `ARKTS_INDEX_REAL_SIDECAR` exists; the explicit command above
is the non-skipping integration gate.
