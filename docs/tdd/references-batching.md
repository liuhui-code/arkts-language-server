# References compiler-root batching TDD record

Parent revision: `b70367964bf7b32e66524b08b4aeb1acde6bd8ff`

## RED

Command:

```bash
node --test tests/semantic/references-batching.test.mjs
```

The public child-process LSP test failed before implementation because the server ignored
`ARKTS_REFERENCES_STRATEGY=batched`; it emitted no `references.batch.complete` events:

```text
AssertionError: both requests must cross multiple batches
```

The test drives Content-Length-framed `textDocument/references` requests through `dist/server.cjs`
and compares normalized legacy/batched Location sets, including an unsaved overlay, import alias,
re-export, unopened files, same-name negative control and both declaration policies.

## GREEN

Focused command:

```bash
pnpm build && node --test tests/semantic/references-batching.test.mjs
```

Result: 1 test passed. The trace confirmed multiple bounded compiler-root batches for both requests,
while the legacy path emitted no batching events.

Forced-batched regression command:

```bash
ARKTS_REFERENCES_STRATEGY=batched ARKTS_REFERENCES_BATCH_ROOTS=16 \
  node --test \
  tests/semantic/references-completeness.test.mjs \
  tests/semantic/references-depth.test.mjs \
  tests/semantic/typescript-cancellation-bridge.test.mjs
```

The first run exposed an ordering mismatch caused by using ordinal path order instead of the
existing `localeCompare` contract. After switching the merged output to the existing ordering,
the focused overlay-authority regression passed.

Real-project testing then showed that disposing LanguageService instances inside the same V8
isolate did not bound retained heap. The public contract was tightened to require
`verifierIsolation: "transient-worker"`; each batch now runs in a disposable worker isolate.
The final fixture test and default-path `check:fast` remain the merge gates. The product benchmark
did not meet the memory/latency release thresholds, so the feature remains opt-in.

Final verification after transporting immutable disk-admission identities into each verifier:

```text
pnpm check:fast
879 tests, 879 passed, 0 failed
```

A final public cancellation regression waits until one real batch has completed, sends
`$/cancelRequest`, asserts `RequestCancelled` with no result, and then runs a complete recovery
request in the same process. Focused result: 2 tests passed (exact differential + active-verifier
cancellation/recovery); TypeScript checking remained green.

The final RemoteDesk cold replay, explicitly using `batched`, 64 roots and trace, returned the same
71 validated locations in 13 batches. Peak process RSS was 848,941,056 bytes and elapsed time was
51.607 seconds, confirming the correctness path while still failing the product performance gate.
