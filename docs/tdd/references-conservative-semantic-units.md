# Full-scope conservative semantic-unit batching

Parent `9f91122ac504365c57473a430094da09baac9309` plus preceding dirty slices.
No commits/default changes. User `AGENTS.md` edits preserved.

## Vertical RED → GREEN

1. `node --test --test-name-pattern='incomplete local-export proof'
   tests/semantic/references-anchor-reuse.test.mjs`: RED (1,943 ms) because
   rejection trace is absent, although seven exact locations already pass.
   Minimal trace-only implementation gives GREEN (1,545 ms). Real Rust index
   observes an unclassified occurrence and returns incomplete identity proof;
   compiler fallback remains complete. Separate trace-off transcript proves
   no rejection event without the flag. No proof predicate changes.
2. Real LSP class/constructor/alias/re-export/derived-super/same-name
   characterization covers both declaration policies. Third experimental
   profile also proves unavailable-graph fallback against each query's own
   legacy result, never against the other symbol's oracle.
3. `node --test tests/semantic/references-conservative-semantic-units.test.mjs`:
   RED before grouping (complete graph unused without index candidates).
   Exact locations already match. Minimal implementation gives GREEN;
   combined with inventory, 5/5 (9,702 ms). All six real fixture source files
   remain candidates, unsaved alias construction is found, and fewer full-unit
   batches are needed than default file chunks.
4. Inventory RED rejects unassigned new test. Explicit bundle-e2e assignment
   plus expectation update restores GREEN: 116 entries, 46 bundle-e2e.

## Ownership and verification

`ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS` defaults false. Only ready,
complete graphs supply grouping; incomplete index cannot exclude candidates.
Closure, original cursor/compiler identity, complete-result merging,
discard-on-failure, transient verifier and concurrency one remain unchanged.

Cohesive fallback/trace extraction shrinks proxy 855→852 lines (remaining
migration debt); type-engine stays 500, planner 267, new transcript 104,
anchor transcript 411. Prior legacy 1,075, protocol 2,073 and supervisor 925
remain debt, not an exemption from the 500-line rule.

Check/build GREEN. Final real-child/transport/inventory regression command:

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test --test-concurrency=1 \
  tests/semantic/references-anchor-reuse.test.mjs \
  tests/semantic/references-conservative-semantic-units.test.mjs \
  tests/semantic/references-index-state-race.test.mjs \
  tests/semantic/references-index-resync.test.mjs \
  tests/semantic/references-scheduling.test.mjs \
  tests/semantic/references-coalescing.test.mjs \
  tests/semantic-worker-anchor-seed.test.mjs tests/test-layer-manifest.test.mjs
```

**38/38 pass, zero fail/cancel/skip/todo; 85,425 ms.** This covers the final
three-profile constructor characterization. Earlier 31-case pass is not
used as a substitute. Previous full check:fast (981 tests, 978 pass, three
sandbox sampler failures) and authorized unchanged sampler reruns remain in
[seed TDD](references-local-export-anchor-seed.md); no new full-suite GREEN.

Real Settings graph is unavailable on omitted root targets with default plus
ohosTest. Experimental grouping is inactive; mode C still has 23 batches/miss
and overall diagnostic timeout FAIL despite eleven exact results. Fresh
current-build legacy passes its own constructor oracle. The
[report](../reports/2026-09-26-settings-constructor-conservative-units.md)
records hashes, memory curves and next public selection regression.

## Follow-up: implicit production target repair

The next vertical slice is executed, not just proposed:

```sh
node --test --test-name-pattern='implicit production targets' \
  tests/semantic/references-conservative-semantic-units.test.mjs
```

Before repair: **RED**, missing unsaved cross-module alias construction
(933 ms). The root profile omits targets and module profiles contain default
plus ohosTest, exactly the real native/network pattern. Minimal owner repair
filters ohosTest from implicit candidates and still requires exactly one
production target. No change to explicit root mapping/selection; multiple
production targets and test-only profiles still fail closed. A public model
characterization covers both, alongside existing explicit selection tests.
The LSP fixture also includes an inactive ohosTest source and proves exclusion.

`pnpm check` and build pass. Model, target-membership and both conservative-unit
LSP transcripts pass **38/38**, zero failures/skips/cancelled/todo (26,018 ms).
The earlier 38-case anchor/scheduler suite belongs to the pre-target-fix build;
it is not presented as a complete post-fix rerun. Model source 494 lines,
updated unit transcript 114, model test 355, all below 500.

Read-only real Settings recheck: native/network select default, graph ready
with 32 units, but **complete=false**. Its phone module declares existing
local `@ohos/settings.suggestion → file:../../feature/suggestion`, which is not
a root-declared module. The existing conservative dependency gate remains
intact. Membership is 1,496 versus 1,466 before repair; no project configuration
was edited and no scope was deleted. New-build full-scope legacy comparison is
recorded separately; the old pinned manifest still represents old artifacts.

Fresh post-fix full-scope legacy matches all 267 old oracle tuples in 9,500 ms,
publishes version-1 diagnostics (one TS2307), and exits 0. This explicit
comparison verifies this query after restored membership; it does not assume
old scope unchanged. Peak process-tree RSS is 748,560,384 bytes. New raw report
and hashes are in the linked execution report; no broader release claim.

After the target repair, the same expanded anchor/seed/units/state-race/resync/
schedule/coalescing/transport/inventory command above is rerun: **39/39 pass**,
zero fail/cancel/skip/todo, 94,228 ms. It includes the new implicit-target LSP
case, in addition to the independent 38-case model/target/unit run. Do not sum
overlapping test sets or present either as a full check:fast execution.
