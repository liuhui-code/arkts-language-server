# References interactive scheduling

Parent revision: `26cbeac`. This slice implements F6 / R-06 for references
without increasing global verifier concurrency or changing reference results.

## RED

A real Content-Length framed LSP transcript added a default-off delay inside
the transient reference verifier, started references, then requested a
definition. The definition did not return until references had settled:

```text
node --test tests/semantic/references-scheduling.test.mjs
AssertionError: definition completed only after references settled
```

The failure proved that moving compiler work to a transient Worker had not
released the persistent semantic Worker's single Promise queue.

## GREEN

The supervisor now owns one detached references slot in addition to its normal
active command. While that slot is occupied it dispatches only explicitly
classified interactive requests. Mutations retain priority, advance the
ordered revision, and cancel the detached snapshot as ContentModified. Worker
responses are correlated by request ID so the interactive response may arrive
before the references response.

The runtime no longer awaits references in its serial queue. Request-local
`AsyncLocalStorage` isolates cancellation cells and trace correlation for
concurrent work. An opt-in trace records each admitted interactive method and
its queue wait; the artificial verifier delay remains test-only and disabled
by default.

The public transcript proves:

```text
delayed references starts
→ definition returns before references
→ hover returns before references
→ didChange cancels old references as ContentModified
→ new definition observes the changed document
```

Focused verification:

```text
pnpm check
pnpm build
node --test tests/semantic-worker-supervisor-lanes.test.mjs \
  tests/semantic-worker-supervisor.test.mjs \
  tests/semantic-cancellation-scope.test.mjs \
  tests/semantic/references-scheduling.test.mjs \
  tests/test-layer-manifest.test.mjs
```

All 51 focused tests passed. The broader references/workspace regression run
passed 56 of 57 tests in parallel; the sole existing overload test exceeded
its five-second response deadline under contention, then passed all three
cases when rerun alone. No handwritten source or test added by this slice
exceeds 500 lines. The pre-existing `semantic-worker-supervisor.ts` debt was
reduced from 998 to 953 lines by extracting the command codec; it did not grow.
