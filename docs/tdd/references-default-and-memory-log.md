# Default indexed references and request memory log

Parent revision: `6678b97d19a08ec53a3925e0e48e4a577c5e73fb`.

Public interface: a real child-process, Content-Length framed LSP session in
`tests/semantic/references-batching.test.mjs`, with reference strategy and
dependency profile unset.

RED command:

```sh
pnpm build && node --test --test-name-pattern='indexed batching narrows' tests/semantic/references-batching.test.mjs
```

RED result: the default session returned the same Locations but emitted no
`references.index.accepted` event, confirming that it still used `legacy`.
The contract also checks conservative `closure` batches and numeric `rssBytes` and
`heapUsedBytes` on the completed references request.

GREEN: use `indexed-batched` / `closure` as defaults, retain `full` SDK and
explicit `legacy` override, and add process-memory fields to existing
`request.completed` logs without changing the response or stdout protocol.

The first `check:fast` run exposed a real identity-only false negative in the
SDK-import fixture and stale index results after a watched source creation.
Identity remains opt-in; a changed workspace uses the complete legacy
query for the rest of that server session instead of trusting stale index data.
