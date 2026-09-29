# Single completed compiler search coverage

Parent HEAD `9f91122ac504365c57473a430094da09baac9309`, existing dirty
`codex/references-f2-fixed-benchmark` preserved, including user AGENTS.md edits.
R-09/R-10 prerequisite: avoid repeated preparation only after proving that one
actual compiler query already searched the entire legal scope.

## Characterize and extract while GREEN

The existing public `cold usage-site anchor trace separates` transcript passes
before extraction (1/1, 2,106.515 ms) and after extraction (1/1, 1,844.381 ms).
Program file/text/root accounting moves to `typescript-program-stats.ts` without
changing ownership or metric meaning. A nullable SDK-root type mismatch found
by `pnpm check` is corrected; subsequent check/build pass.

## RED → GREEN

```sh
node --test tests/semantic/references-batch-search-coverage.test.mjs
```

RED: exit 1, 3,507.552 ms, assertion `4 !== 2`: legacy exact Location equality
and known references already pass, but the two declaration-policy requests
each create two redundant compiler batches instead of one. This is a behavior
test through a real child process, framed stdio and the production Rust sidecar,
not a private executor test or a latency threshold.

Minimal implementation:

- Only transient closure verifiers request search-scope evidence.
- Capture Program identity before the raw compiler definition query. Evidence
  requires exactly one raw definition, a real nonempty `findReferences` return,
  the same Program after exact source mapping, and no membership failure.
- Empty definitions, incomplete/missing/unmappable sources and cancellation
  cannot produce accepted proof. Tolerated unadmitted dependencies disable it.
- One search's exact paths must include **original membership + query + all
  open overlays**. No count comparison, case folding, indexed-candidate subset,
  loaded-file inference or union of multiple batch Programs is permitted.
- Accepted complete coverage stops subsequent batches after a checkpoint.
  Rejected anchors still discard partial Locations and discovery scope.
- Coverage is ephemeral, independent of tracing, and omitted from public
  Location results and exact-result cache. Workers remain per-batch transient.

GREEN: **4/4 PASS**, exit 0, 12,898.017 ms. Both declaration policies match
fresh legacy sets with known alias, inherited constructor, static `new this()`,
same-name isolation and unsaved overlay checks. A disconnected inherited call
prevents premature completion. Empty-definition responses do not prove search.
Seed rejection and trace-off retain exactness. Layer inventory remains explicit.

## Scope and remaining gates

This is not constructor candidate completeness, persistent verifier reuse,
identity promotion, a guaranteed Program bound or a cold 500 ms claim. The
index still lacks a proven inheritance/factory model. Settings remains the
sole real performance case, API24 explicitly pinned; its source, boundaries,
SDK and constructor oracle must not be modified to manufacture eligibility.

Source size: the oversized `typescript-language-service.ts` shrinks from
3,760 to **3,712** physical lines through a cohesive metrics extraction; it
remains explicit migration debt. New helpers are 39/17 lines, executor 377,
new public transcript below 500. No default/budget/SDK/concurrency change,
forced GC, commit, push or merge. The preceding 996-test full gate belongs to
the previous build, not this implementation.

Existing constructor/batching/phase/cancellation guards: **7/7 PASS**, exit 0,
118,634.069 ms. Inventory 4/4 PASS. The
[fixed Settings replay](../reports/2026-09-27-settings-full-search-coverage.md)
returns 267 exact Locations/normal diagnostics, 54.306 s. Coverage guard does
not fire (largest Program 1,348 of 1,496 members): no real-case speedup claimed.

## Fresh full regression gate

Authorized `pnpm check:fast` for this implementation completes exit 0:
**1,000/1,000 PASS**, zero failures/cancellations/skips/todos,
**932,570.833 ms**. This includes all four new coverage cases, existing
constructor/alias/factory barriers, cancellation/edit, membership, cache,
index-generation recovery, scheduling and delivery regressions. Log:
`/private/tmp/arkts-coverage-fast.LJHAgm/check-fast.log`.
No source/test edits after this gate. Nested skip/todo fixtures test rejection;
the final parent suite has zero runtime annotations. Full regression verifies
correctness, not Settings ≤500 ms, constructor narrowing or memory graduation.

Final-build Settings manifest preflight PASS with pinned Node v26.3.0 after
the full gate: runtime/Workers/stdlib/sidecar/project/SDK/oracle still match.
Preflight creates no replay output. Documentation links and `git diff --check`
PASS; no source/test edits, commit, push or merge after verification.
