# Call Hierarchy post-review P1 hardening

Date: 2026-09-06

Parent revision: `707b6af`

Scope: close two correctness and availability gaps found by the post-commit
Call Hierarchy review. This slice does not advertise the Call Hierarchy
capability and does not change its protocol data.

## Slice 1: non-regular follow-up sources cannot block stdio

Public behavior: following a syntactically valid Call Hierarchy item whose
workspace source is a FIFO must finish within the bounded test deadline and
return the fixed `RequestFailed` / `source-unavailable` response.

The regression uses the production stdio server and a real `Pipe.ts` FIFO. Its
response wait is capped at 750 ms and test cleanup terminates the child, so the
known bug cannot hang the suite.

RED:

```text
pnpm build
node --test --test-name-pattern="fails a FIFO call hierarchy follow-up" tests/lsp-call-hierarchy.test.mjs

tests 33; pass 0; fail 1; skipped 32
Timed out waiting for LSP response 164.
```

Root cause: source authority called `open(path, "r")` before checking the open
descriptor. A FIFO therefore blocked indefinitely and the existing post-open
`fstat` guard was never reached.

GREEN:

- Stat the resolved candidate and reject non-regular or oversized sources
  before opening it.
- Always open with `O_RDONLY | O_NONBLOCK`.
- Retain descriptor `fstat`, bounded read, before/after identity checks,
  physical-root ownership, and symlink-race validation as the final authority.

```text
pnpm build
node --test --test-name-pattern="fails a FIFO call hierarchy follow-up" tests/lsp-call-hierarchy.test.mjs

tests 33; pass 1; fail 0; skipped 32
```

## Slice 2: watched creates invalidate module-resolution truth

Public behavior: with `Main.ets` importing `./Target`, an initially warm
language service resolves `Target.ts`. After `Target.ets` is created and a
`workspace/didChangeWatchedFiles(created)` notification is received, the next
outgoing-call request must resolve `Target.ets`, exactly like a fresh language
service over the same workspace.

RED:

```text
node --test --test-name-pattern="a watched higher-priority source" tests/lsp-call-hierarchy.test.mjs

tests 34; pass 0; fail 1; skipped 33
expected: .../Target.ets
actual:   .../Target.ts
```

Root cause: exact invalidation of the newly created path could not invalidate a
warm dependency closure that did not yet contain that path. The old closure and
TypeScript module-resolution state therefore continued selecting `Target.ts`.

GREEN correctness policy:

- A watched source `created` event clears dependency closures whose owners are
  inside that canonical workspace only.
- It advances that workspace's content revision and requests a one-shot reset
  of only that workspace's type engine.
- A normal `changed` event retains exact path invalidation and does not reset a
  type engine.

```text
pnpm build
node --test --test-name-pattern="a watched higher-priority source" tests/lsp-call-hierarchy.test.mjs

tests 34; pass 1; fail 0; skipped 33

node --test --test-name-pattern="watched source (creation|change)" tests/project-file-set-cache.test.mjs

tests 24; pass 2; fail 0; skipped 22
```

The lower-level characterization additionally proves that another warm root
keeps its dependency closure, content revision, and `resetTypeEngine: false`.

## Regression gates

```text
node --test tests/lsp-call-hierarchy.test.mjs tests/project-file-set-cache.test.mjs tests/document-store-cancellation.test.mjs

tests 61; pass 61; fail 0; skipped 0

pnpm check
# tsc --noEmit -p tsconfig.json: PASS

pnpm build
# dist/server.cjs: PASS
```

The cancellation regression protects the transactional membership work added
in `990b5aa`; this change does not weaken its checkpoint or publish semantics.

## Deliberate follow-up

The created-source repair is correctness-first and scans the bounded in-memory
dependency-closure cache for owners in one workspace. A directory/module-key
reverse-dependency index can later reduce that cost for very large projects,
but it must preserve module-resolution candidate priority, rename batches,
canonical-root isolation, and the same stdio E2E contract before replacing this
fallback.
