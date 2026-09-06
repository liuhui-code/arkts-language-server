# H3c LSP framing failure TDD evidence

- Parent revision: `f85af75b624257877275cd9281cef1ff787758a0`
- Scope: strict Content-Length parsing, bounded input buffering, structured EOF
  truncation, and sticky terminal transport failures in the real child-process
  LSP driver
- Excluded: transcript helpers, stderr retention, spawn failures, and production
  language-server behavior

Every fixture is causally synchronized. The test registers its public waiter,
sends an stdin trigger, and the child either writes a deterministic byte stream
or calls `stdout.end()`. No H3c fixture uses a scheduling sleep.

## H3c1: strict Content-Length

The child emitted a valid JSON response behind
`Content-Length: <length>garbage`.

RED:

```sh
node --test tests/lsp-process.test.mjs
```

The prefix regex accepted the numeric portion and returned the response, so the
test failed with `Missing expected rejection` (`7/8` passing, about 1.43 s).

GREEN: Content-Length is now discovered as exactly one header field and parsed
with an anchored whole-line expression. Trailing text, duplicates, missing
values, and unsafe integers enter the common terminal failure path as
`LSP_INVALID_HEADER`. The suite passed `8/8` in about 1.40 s.

## H3c2: bounded headers

The child emitted a header without its terminator. The cases cover an injected
64-byte limit and the safe default of 8 KiB.

RED: the first case waited for the outer guard and had no structured error code
(`8/9` passing, about 2.39 s).

GREEN: `maxHeaderBytes` is configurable and defaults to 8192. The driver checks
both an unterminated buffer and the located first-header length, then reports
`LSP_HEADER_TOO_LARGE` with `limit` and `received`. Both cases passed; the suite
passed `9/9` in about 1.62 s.

## H3c3: bounded frames

The child emitted only a valid header declaring a body beyond the configured
limit. Cases cover 129 bytes against an injected 128-byte limit and one byte
beyond the safe default of 16 MiB.

RED: the driver accepted the declaration and waited for a body until the outer
guard fired (`9/10` passing, about 2.61 s).

GREEN: `maxFrameBytes` is configurable and defaults to 16 MiB. A declared body
over that limit fails before body buffering as `LSP_FRAME_TOO_LARGE`, including
`limit` and declared `received` bytes. The suite passed `10/10` in about 1.85 s.

## H3c4: structured stdout truncation

One child ended stdout after a valid header and 13 body bytes; another ended in
the middle of a header. Each child remained otherwise alive so EOF, rather than
process exit or timing, was the trigger.

RED: the driver ignored stdout EOF with buffered bytes and the half-body case
reached the outer guard without `LSP_TRUNCATED_FRAME` (`10/11` passing, about
2.87 s).

GREEN: the stdout end handler ignores a clean empty buffer, but terminally
rejects residual framing state with:

- `code: LSP_TRUNCATED_FRAME`;
- `phase: body`, numeric declared `expected`, and numeric body `received`; or
- `phase: header`, the expected header terminator, and numeric buffered
  `received` bytes.

The strict Content-Length parser is shared by normal acceptance and EOF
diagnostics. Both EOF cases passed; the suite passed `11/11` in about 2.10 s.

## H3c5: sticky terminal failure

Two waiters were pending when an invalid header arrived, followed by a new
response waiter after the terminal error was observed.

RED: the existing waiters received the same `LSP_INVALID_HEADER`, but the new
waiter raced with child shutdown and received a different `SIGTERM` exit error
(`11/12` passing, about 2.21 s).

GREEN: `waitFor()` now checks the recorded terminal transport failure before
allocating a timeout or mutating the waiter list. Existing and future waiters
receive the exact same Error instance immediately. Final focused verification:

```sh
node --test tests/lsp-process.test.mjs
```

Result: `12/12` passing in about 2.23 seconds.
