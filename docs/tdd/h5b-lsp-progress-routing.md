# H5b token-aware LSP progress routing TDD evidence

- Parent revision: `d37c03e2e19fe8c9b895306ccdf8929becc479c6`
- Scope: route `$/progress` notifications by progress token before applying an
  optional value predicate, and migrate real-process callers
- Excluded: automatic progress-token creation replies, progress aggregation,
  cancellation policy, and production language-server behavior

The fixture child queues four valid `$/progress` notifications with `alpha`
and `beta` tokens interleaved, then emits a ready notification. The ready frame
is an event barrier, so the test uses no scheduling sleep. It queries the queued
messages in an order different from arrival and combines token-only and
token-plus-kind selectors. Each message must remain available to the matching
token consumer.

## RED

Command:

```sh
node --test tests/lsp-process.test.mjs
```

Result: H1 through H5a passed, while the new tracer failed through the public
driver API:

```text
lsp.progress is not a function
```

The focused RED run completed in about 1.24 seconds.

## GREEN

`progress(token, predicate?, timeoutMs?)` now selects only notification-shaped
messages whose method is `$/progress` and whose `params.token` exactly matches
the requested token. The optional predicate runs only after those structural
and token checks. Queued and future messages use the same matcher.

Command:

```sh
node --test tests/lsp-process.test.mjs
```

Result: `7/7` passing. H5b completed in about 119 ms and the focused run in
about 1.26 seconds.

## Real-process caller migration

Every existing test-side `$/progress` wait now uses `progress()` with the token
returned by its corresponding `window/workDoneProgress/create` server request:

- workspace-symbol begin/report/end;
- production-index begin/end;
- local-delivery cold ready/end and warm catalog activity;
- large-workspace begin/activity/terminal/end, with the token explicitly
  threaded through its helper functions.

The large-workspace helper also routes progress-token creation through
`serverRequest()` so it can obtain that token without relying on the retired
notification-shape bug.

Verification:

```sh
node --test tests/lsp-workspace-symbol.test.mjs tests/lsp-production-index.test.mjs
node --test tests/release/local-delivery.acceptance.mjs
node --check tests/release/local-delivery.acceptance.mjs
node --check tests/release/large-workspace.acceptance.mjs
```

The two fast real-process suites passed `5/5` in about 3.46 seconds. Both release
acceptance files passed Node syntax validation. The full local-delivery
acceptance also passed `1/1` in about 8.15 seconds, exercising installed cold and
warm server processes. A repository-wide search leaves `$/progress` only in the
driver implementation and its dedicated H5b fixture.
