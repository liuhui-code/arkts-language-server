# D2 structured logging evidence

- Parent revision: `548e649`
- Public boundaries: `arkts-language-server --print-log-path` and the real
  Content-Length framed `arkts-language-server --stdio` process

## Slice 1: discover the log path without starting LSP

RED: `node --test tests/logging.test.mjs` exited with status 1 because the
server treated `--print-log-path` as a transport invocation and threw
`Connection input stream is not set`.

GREEN: the CLI now prints an absolute `server.log` path and exits without
creating an LSP connection. `ARKTS_LSP_LOG_DIR` provides a deterministic
override; platform defaults use the macOS Logs directory, Windows local app
data, or the XDG state directory.

## Slice 2: structured stderr and file events

RED: a real initialize → completion → shutdown session completed, but no log
file existed and no lifecycle/request events were emitted.

GREEN: stderr and the file contain one NDJSON object per line with schema,
timestamp, level, event, pid, method/duration/outcome where relevant. The
transcript asserts that stdout remains exclusively Content-Length LSP frames
and that source text is absent from logs.

The logger rotates a log larger than 5 MiB once at process start and never lets
file logging failure terminate the protocol process.

## Degraded-mode characterization

The unusable-directory case was added immediately after the structured logger
slice. It was already GREEN because failure isolation was part of that minimal
implementation: the server emits `logging.degraded` to stderr, continues in
stderr-only mode, and completes initialize/shutdown successfully.

## Production catalog terminal

RED: the production LSP progress UI reached `ready`, but `server.log` contained
no durable index outcome, so an isolated Zed run could not distinguish a
successful catalog from a swallowed background failure after the UI closed.

GREEN: every aggregate terminal now emits exactly one
`index.catalog.terminal` record with phase, workspace count, discovered,
indexed, skipped, and total-file counters. The production child-process test
asserts the event for two interleaved workspaces while continuing to verify
that stdout contains only LSP frames.
