# R-10: Reuse a compiler-validated usage-site anchor

Parent revision: `9f91122ac504365c57473a430094da09baac9309`.
The user-owned `AGENTS.md` edit is not part of this slice.

## Characterization and RED

A real child-process, Content-Length-framed LSP transcript first characterized
the unchanged default: definition at a usage position, then references through
an alias/re-export chain, returns six exact Locations and creates a standalone
transient anchor Worker. It passed before and after extracting the registry's
public types and isolated-anchor responsibility.

The next public test enabled `ARKTS_REFERENCES_ANCHOR_REUSE=1` and required
reuse of that already compiler-validated definition, with no anchor Worker or
Program construction. On the parent behavior, the command exited 1:

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test \
  --test-name-pattern='^opt-in usage-site anchor' \
  tests/semantic/references-anchor-reuse.test.mjs
```

The six exact Locations already passed; the failing assertion was
`transient-worker` versus expected `validated-definition`. This is a structural
RED, not an assertion that a small fixture reproduced the 5 GB problem.

## GREEN

The experiment remembers at most one unique compiler definition per resident
context, with snapshot key, definition and prepared-source fingerprint metadata
bounded together to 16,384 serialized code units. No text, AST, Symbol or
TypeChecker is copied or retained by the memo. The capture happens after a
successful compiler definition query, not from Rust candidates or ArkUI result
merging. A same-position hit binds canonical root, reset epoch, workspace
content revision, document generation/version, position and the complete sorted
set of active open-overlay paths/versions. Configuration
changes, context trim/eviction and an incompatible SDK ambient profile prevent
reuse; incomplete membership and pending changed/removed paths also reject it.

It does not call `prepare(full membership)` on the resident compiler, create a
new hot context, reuse a verifier Worker or answer references from an index.
Final reference verification remains sequential transient batches. The
production default is unchanged: absent `ARKTS_REFERENCES_ANCHOR_REUSE=1`, the
original isolated anchor path runs.

The first public transcript suite passes all five cases: default isolation,
opt-in same-snapshot reuse, unsaved edit fallback, no prior definition fallback,
and mismatched SDK ambient profile fallback. Every case checks the exact six
Locations, including re-export aliases and exclusion of a same-name symbol.
The hit trace records `anchorWorkerStarts=0` and `anchorProgramBuilds=0`;
batch traces retain `verifierIsolation=transient-worker`.

The existing context retention and registry pressure tests also pass. Adding
the transcript file exposed the test-layer inventory's old 113/44 counts;
updating them to 114 total/45 bundle entries restored its four passing checks.

## Second RED: another open dependency

Broader public-LSP coverage exposed a real invalidation omission after the
first five cases were GREEN. Opening an edited `Barrel.ets` dependency left the
current document's version and the available root content counter unchanged;
the initial memo incorrectly reported `validated-definition`. The focused
14-case run exited 1 (13 passed). The exact six Locations happened to remain
unchanged because that edit appended only a comment; this does not make reuse
of an old overlay snapshot acceptable.

The minimal correction includes every active open overlay's path/version in
the key using ordinal path order. An unknown overlay version refuses reuse.
No source text is cached and DocumentAuthority remains the source of versions.
An additional case confirms a definition at the import position cannot be
reused at the constructor usage position. The default test now removes the
flag entirely rather than setting it to zero.

The initial real Settings six-run matrix precedes this hardening. Its binary
pins and raw data remain archived and are not relabeled as the later build's
performance results. A distinct post-hardening manifest/replay checks the
latest implementation without pooling measurements across builds.

After the correction, `pnpm check`, `pnpm build` and the following focused
command pass **14/14**, without changing any response deadlines:

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test --test-concurrency=1 \
  tests/semantic/references-anchor-reuse.test.mjs \
  tests/semantic/references-context-retention.test.mjs \
  tests/semantic/type-engine-context-runtime.test.mjs \
  tests/semantic/references-result-cache.test.mjs \
  tests/test-layer-manifest.test.mjs
```

Seven cases belong to the new public anchor transcript; the rest protect
retention, pressure, exact-result reuse and test inventory. Full `check:fast`
is not replaced by this focused command and has not been rerun for this slice.

The final oracle normalizes explicit URI/start/end tuples rather than relying
on object property order. The seven public anchor tests were rerun after that
test-only change: **7/7 PASS**, without skips, cancellations or deadline changes.

## Scope and remaining gates

This is **warm definition reuse**, not cold anchor/first-batch fusion. Completion
or diagnostics alone do not populate the memo. A different position or changed
snapshot may still pay the isolated anchor cost. Real Settings/API-24 same-build
control/reuse replay, external RSS and correctness evidence are recorded in
the [experiment report](../reports/2026-09-26-settings-anchor-reuse-experiment.md).
No 500 ms, final memory, original >3 GB, DevEco or Windows gate is graduated.

The touched handwritten registry shrinks from 632 to 499 physical lines; its
contract and anchor modules remain independently below 500. Other oversized
legacy files remain migration debt and were not changed.

## Third RED: an unopened dependency changes before watcher delivery

On parent `9f91122` plus the preceding uncommitted slices, a public transcript
warms definition, writes a comment to unopened `Target.ets` on disk without a
file notification, then requests references. This command exited 1:

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test \
  --test-name-pattern='unopened dependency changes on disk' \
  tests/semantic/references-anchor-reuse.test.mjs
```

The exact six Locations passed, but the old memo incorrectly emitted
`validated-definition` instead of the required `transient-worker` fallback.
The correction stores only path/SHA-256 pairs for prepared source documents.
Lookup compares them with current prepared text and rejects absent or changed
sources. It neither reads files independently nor retains text/compiler objects.
The existing single-entry serialized cap now includes the hash metadata.

An additional public transcript moves the declaration by adding a leading
comment, still without a watcher notification, and requests
`includeDeclaration=true`. It requires all seven exact Locations, including
the declaration's new line, and isolated anchor proof. Broader dependencies
outside the prepared view remain an open coverage gate; this change does not
graduate R-10. The prior **966/966** full suite belongs to the earlier lifecycle
build, not this source-fingerprint change.

The source-fingerprint build passes `pnpm check`, `pnpm build` and **63/63**
focused cases, without skips, cancellations or changed deadlines. The command
uses the five-file focused command above plus
`tests/semantic-worker-supervisor.test.mjs`,
`tests/semantic-worker-supervisor-lanes.test.mjs`,
`tests/lsp-document-lifecycle.test.mjs` and `tests/lsp-diagnostics.test.mjs`.
Ten cases are the public anchor transcripts. This is not a replacement for a
fresh full `check:fast` before requesting merge.

## Cancellation and in-flight mutation characterization

Parent remains `9f91122` plus the uncommitted source-fingerprint slice. Two
additional framed-LSP cases explicitly warm definition, confirm reused-anchor
verification has entered a transient batch, then interrupt that request. The
existing default-off verifier delay makes the boundary deterministic; normal
automatic diagnostics remain enabled.

- Client cancellation returns `-32800`, with no result/partial Locations.
  Retrying in the same server reconstructs the isolated anchor and returns the
  exact original six alias/re-export Locations.
- An unsaved edit adds a seventh reference while the batch is active. The old
  request returns `-32801` and no result. Retry proves the new reference at its
  precise URI/range together with the original six.

Each individual test passes on its first execution. These are characterization
checks of existing cancellation/freshness contracts, **not fabricated REDs or
new production behavior**. No production code, cancellation limits, diagnostic
policy or verifier residency changed in this follow-up. Commands:

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test \
  --test-name-pattern='cancelling references after anchor reuse' \
  tests/semantic/references-anchor-reuse.test.mjs
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test \
  --test-name-pattern='editing during reused-anchor verification' \
  tests/semantic/references-anchor-reuse.test.mjs
```

The test file now contains twelve public transcripts and remains below 500
physical lines. These small fixtures prove error/result semantics and recovery,
not real Settings cancellation latency, complete ambient dependency coverage,
or the 500 ms requirement.

## Current full verification

After both interruption cases, the complete current worktree passes:

```sh
PATH=/Users/liuhui/.nvm/versions/node/v26.3.0/bin:$PATH pnpm check:fast
```

**970/970 PASS**, zero failures/cancellations/skips/todos; duration
913,596.8 ms. This command includes type checking and a fresh runtime build.
External process tests run with macOS sampling permission. Raw log:
`/private/tmp/arkts-check-fast-anchor-freshness-20260926.log`, SHA-256
`900b72c07a76a53145f56a1d3b5a4c3176760d3b9d3d33b1b545ac7003869b5f`.

The rebuilt server/semantic/verifier digests still match the source-snapshot
Settings manifest. This closes the local full-suite gap for the current
source-fingerprint build, not R-10 graduation, native Windows acceptance,
memory/no-regression or 500 ms latency. No commit, push or merge was performed.
The previously changed supervisor is 925 lines (down from 955), still migration
debt; the new anchor transcript is 206 lines and type-engine registry 499.
