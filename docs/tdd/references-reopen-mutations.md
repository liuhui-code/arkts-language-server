# References after a dependency closes and reopens

Parent revision: `9f91122ac504365c57473a430094da09baac9309`, with the
uncommitted R-10 definition-to-anchor experiment. This is a correctness slice,
not another latency or memory experiment.

## Public RED

The real child-process/Content-Length transcript in
`tests/semantic/references-anchor-reuse.test.mjs` opens Query and its Barrel
dependency at version 1, warms an exact definition, closes Barrel, reopens it
at version 1 with a new unsaved comment, and requests references from Query.
The expected six exact alias/re-export Locations exclude an unrelated
same-name declaration. Normal automatic diagnostics remain enabled.

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test \
  --test-name-pattern='reopened at the same version' \
  tests/semantic/references-anchor-reuse.test.mjs
```

Two independent runs fail at the unchanged 30-second references deadline
(33.06 and 31.50 seconds including setup). Both record:

```text
semantic worker fatal: Semantic document version 1 changed content for .../Barrel.ets
```

This is a worker failure followed by a timeout, not proof of slow compiler
work, an SDK mismatch, or the original >3 GB pressure case.

## Hypotheses and minimal correction

The ranked hypotheses were a late old diagnostic snapshot, lost close/open
mutation ordering, and an old references overlay. Inspection shows the
supervisor coalesces pending mutations by URI: a queued close is overwritten
by the following open. The worker therefore never ends the previous document
lifetime and rejects the reopened version-1 text.

Changing only coalescing across close boundaries makes the same public
replay pass in 2.81 seconds. Keep close as a mutation barrier in both
directions; never relax the DocumentAuthority same-version/content invariant.
Ordinary full-text change/change and open/change coalescing remain supported.
Queue record/text limits, cancellation, revision acknowledgements, diagnostics,
Worker count, result completeness and default feature flags are unchanged.

Three existing coalescing characterization tests pass before the correction.
After GREEN, the cohesive document-coalescing policy is extracted into
`src/semantic/semantic-worker-mutation-coalescing.ts` (36 lines), reducing the
existing supervisor from 955 to 925 lines. The remaining over-limit supervisor
is explicit migration debt; this change does not grow it.

## GREEN and verification

After extraction, type checking and runtime build pass. This command passes
**54/54**, with no skips, cancellations, deadline changes or forced GC:

The repaired `dist/server.cjs` SHA-256 is
`93e3c903f71f8c1eb2dad96f982a52297ee2d99b8eae8fe13dbbaeebcd5b7759`.
The semantic Worker and final verifier hashes remain unchanged from the
overlay-snapshot build; this repair is in the parent mutation supervisor.

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test --test-concurrency=1 \
  tests/semantic/references-anchor-reuse.test.mjs \
  tests/semantic-worker-supervisor.test.mjs \
  tests/semantic-worker-supervisor-lanes.test.mjs \
  tests/lsp-document-lifecycle.test.mjs \
  tests/lsp-diagnostics.test.mjs
```

This includes all eight anchor transcripts and protects existing mutation
bounds/coalescing, cancellation/freshness, detached reference scheduling,
document lifecycle and normal diagnostic publication. The reopened dependency
must use isolated anchor verification rather than the old memo.

The initial sandboxed full `check:fast` run also encountered external sampling
and replay failures and was interrupted after the build changed during
diagnosis; it is **not** a passing final-build gate. A fresh fixed-build full
run with external process-sampling permission passes **966/966** in
1,035,138 ms, with zero failures, skips, cancellations or todos. Its command is
`PATH=/Users/liuhui/.nvm/versions/node/v26.3.0/bin:$PATH pnpm check:fast`.
The complete local output is `/private/tmp/arkts-check-fast-reopen-20260926.log`
(SHA-256 `d5b8ca3d03e0904d650cf1cdec543ea65c109ce73374afdeb649ba1b966017b2`).
The formerly failing external-RSS/replay cases pass in that fresh run. No
timeout or test policy was relaxed, and no Windows-native semantic-performance
claim is inferred from the Mac-hosted installer tests.

No new Settings performance claim is made by this regression. The earlier
Settings measurements retain their original artifact hashes. R-10 stays
default-off; cold navigation under 500 ms, memory/no-regression, original
>3 GB reproduction, native Windows and release gates remain open.
