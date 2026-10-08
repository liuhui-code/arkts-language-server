# L01 repeated-pressure resource replay TDD

Parent revision: `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86` (dirty
worktree preserved). Scope: benchmark-only generated 100-edit Settings replay,
same-snapshot repeated L3 control, and bounded post-query idle sample. No
production semantic behavior change.

RED:

- `node --test tests/prepared-suite-l3-cli.test.mjs` failed with
  `PREPARED_SUITE_INVALID=SCENARIO_TARGET` for the second L3 recovery.
- `node --test tests/l01-soak-suite-generator-cli.test.mjs` failed because the
  generator CLI did not exist.
- `node --test tests/test-layer-manifest.test.mjs` rejected the new test's
  missing explicit layer assignment.

GREEN:

- The first L3 test needed macOS `ps` sampling permission; sandbox-only run
  failed `external RSS sampler did not produce its first sample`, not a semantic
  assertion. With that permission, real child-process LSP L3 repeat passed.
- `node --test tests/prepared-suite-cli.test.mjs
  tests/prepared-suite-l3-cli.test.mjs
  tests/l01-soak-suite-generator-cli.test.mjs`: 26/26 PASS.
- `node --test tests/test-layer-manifest.test.mjs`: 4/4 PASS.
- `pnpm check`: PASS; `git diff --check`: PASS. Changed handwritten files stay
  below 500 physical lines.

The real Settings three-run result is in
[the resource report](../reports/2026-10-07-resident-l01-resource-soak.md).
Its exactness result is not a readiness, memory-release or 500 ms gate pass.

## Short pressure attribution loop

Parent revision remains `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`;
the previous dirty worktree was preserved. This slice only extends the
benchmark generator's public CLI. Production semantic behavior and the
100-edit default validation remain unchanged.

RED → GREEN, one CLI behavior at a time:

1. `node --test tests/l01-soak-suite-generator-cli.test.mjs` failed with
   `L01_SOAK_INVALID=OPTIONS` for `--cycles 20 --mode diagnostic`.
   The minimal implementation permits short even cycles only when explicitly
   marked diagnostic and labels the output benchmark ID accordingly. The same
   command then passed.
2. The same test failed with `L01_SOAK_INVALID=OPTIONS` for diagnostic
   `--trace 1 --pressure-every 0`. The minimal implementation decoupled trace
   observation from explicit L3 controls; the test then passed and confirmed
   no pressure scenarios/control flag.
3. The same test failed with `L01_SOAK_INVALID=OPTIONS` for diagnostic
   `--metrics-out`. The minimal implementation passed an absolute, default-off
   `ARKTS_MEMORY_METRICS_FILE` to the existing worker sampler. The test then
   passed. No GC or heap snapshot was added.

Both real 20-edit Settings child-process LSP replays are documented in the
[pressure attribution report](../reports/2026-10-07-resident-l01-pressure-attribution.md).
They demonstrate an automatic high-RSS eviction loop but do not identify a
strongly retained compiler/registry object or pass L01 resource admission.

Verification:

- `cmp .bench/l01-soak/recheck-default-100-manifest.json
  .bench/l01-soak/trace-off-barrier-manifest.json`: identical; the original
  100-edit generated input is unchanged.
- A sandbox-restricted `pnpm check:fast` was interrupted after external-`ps`
  dependent prepared-suite tests timed out; it is **not** counted as GREEN.
  With macOS process-sampling permission,
  `node --test tests/l01-soak-suite-generator-cli.test.mjs
  tests/prepared-suite-cli.test.mjs
  tests/index-class-binding-discovery.test.mjs` passed 91/91, including the
  earlier stale-generation failure.
- The full `pnpm check:fast` with the same permission passed **1306/1306**;
  `pnpm check` and the release runtime build completed inside it.
- `git diff --check` passed. The changed handwritten generator and test are
  84 and 81 physical lines respectively, below the 500-line limit.

## Same-input production strategy comparator

Parent revision remained `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`;
the extensive pre-existing dirty worktree was preserved. This slice changes
only the public benchmark generator CLI, not server runtime behavior.

RED: `node --test tests/l01-soak-suite-generator-cli.test.mjs` failed with
`L01_SOAK_INVALID=OPTIONS` when the diagnostic invocation supplied
`--strategy indexed-batched`. The public test requires the same scenarios,
full SDK, and trace setting as the legacy manifest, with only the strategy
changed and a distinct benchmark ID.

GREEN: the generator accepts this override only in diagnostic mode, preserving
the legacy default and rejecting an indexed 100-edit soak invocation. The same
test passed 1/1; the focused generator/prepared-suite/layer suite passed 29/29
with macOS external-sampling permission; `pnpm check` and `git diff --check`
passed. Changed handwritten generator and test are 88 and 102 physical lines.
The real child-process Settings replay and
its exact cross-report Location comparison are recorded in the
[comparator report](../reports/2026-10-07-resident-l01-production-comparator.md).
That replay has 22/22 exact results and normal diagnostics on both paths, but
does not pass semantic readiness, resource admission, or the 500 ms gate.

## Default-off Registry ownership probe

Parent revision remained `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`;
the dirty worktree was preserved. This slice adds only an opt-in benchmark
probe around the official compiler lifecycle and a diagnostic CLI flag. It
does not change production trim/dispose behavior, memory thresholds, routing,
diagnostics, or the 100-edit default soak.

RED: `node --test tests/l01-soak-suite-generator-cli.test.mjs` rejected
`--registry-probe-out` with `L01_SOAK_INVALID=OPTIONS`. The public child-LSP
L3 test also failed `ENOENT` when it expected a probe trace. GREEN: the flag
is diagnostic-only, produces an absolute probe file path and sets the existing
benchmark-control guard; the default generator is unchanged. The backend
wrapper captures aggregate registry refcounts before/after trim and disposal
without changing the called compiler methods. `pnpm check`, `pnpm build`,
the focused public L3 test, and the generator test passed; the L3 test needed
macOS external-`ps` permission. Changed handwritten files remain at or below
500 lines; the existing oversized TypeScript LS file did not grow.

The [two fresh Settings probe replays](../reports/2026-10-07-resident-l01-registry-ownership.md)
are 22/22 exact each, with diagnostics PASS and a reproducible
`trim 2261→2261` then `dispose 4522→2261` refcount pattern. The current
L3 test only checks **direct** disposal reaches zero; it does not cover
trim→rebuild→dispose. That missing public-LSP regression is the RED test for
the next behavior-fix slice. No byte-sized leak or release-gate pass is
claimed from this probe.

## L2 trim ownership regression and backend recycle

Parent revision is still `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`;
the previous dirty worktree remains intact. A new real child-process LSP test
uses normal v1 diagnostics, exact references and definition, benchmark-only
L2 then L3 controls, and the opt-in registry refcount probe. This is a
behavior fix limited to the backend L2 lifecycle, not a route, budget, worker,
or diagnostics change.

RED: `node --test tests/semantic/semantic-registry-trim.test.mjs` first failed
with `-32602` because the public benchmark control accepted only L3. After
the guarded level2 control was connected through the worker, the same test
failed with `-32603 Semantic worker request failed` on the first
post-trim `textDocument/references`. The real Settings probe separately
showed that trim retained one ref per sampled SourceFile path. The RED
failure preceded the final zero-refcount assertion and demonstrated that
the old LS could not reliably answer after L2.

GREEN: L2 now disposes its Program-owning LS and creates a new empty LS with
the same host and SDK-keyed registry. The public test then passed exact
references/definition and normal diagnostics; after L2 and after L3, the
sampled registry refcounts were both zero. `pnpm check`, `pnpm build`, and
`node --test tests/semantic/semantic-registry-trim.test.mjs
tests/test-layer-manifest.test.mjs` passed 5/5. The existing >500-line
TypeScript LS file shrank from 3611 to 3599 physical lines by extracting its
cohesive script-cache limits; the other changed handwritten files are below
500 lines. Real-project RSS/latency and release resource gates are verified
separately, not inferred from this synthetic regression.

## Re-arm L2 only after semantic work

Parent revision remains `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`;
all pre-existing worktree edits were preserved. The previous public LSP test
covered one L2 followed by L3 but not a rebuilt Program under a second L2.

RED: `node --test tests/semantic/semantic-registry-trim.test.mjs` failed
`each rebuilt Program must be released by its own L2 trim: 1 !== 2` after
the transcript performed exact references/definition between two guarded L2
controls and then an L3. This also matched the earlier independent small
fixture replay, where both L2 controls acknowledged success but only one
actual registry probe pair was emitted.

GREEN: the coordinator now re-arms a previously trimmed context only after a
compiler-backed query attempt, not merely when acquiring a lease or updating
the host snapshot. Its `trimCompletion` path is explicitly excluded. The
same real child-process LSP test passed with two Program-owning L2 probes,
each releasing sampled registry references to zero, and exact results and
normal diagnostics intact. A further consecutive L2 control without a query
did not add a third trim. `node --test
tests/semantic/semantic-registry-trim.test.mjs
tests/semantic/semantic-coordinator.test.mjs` passed 8/8. The fixed Settings
resource and latency comparison remains a separate gate, not implied by this
fixture GREEN.

## L2 re-arm is benchmark-only until resource admission

Parent revision remains `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`;
the pre-existing dirty worktree was preserved. The initial re-arm change was
functionally correct on the small fixture, but under sustained RSS pressure it
could trim a rebuilt Program after each semantic request. This slice adds a
default-off boundary without changing the production references route or
memory thresholds.

RED: `node --test tests/semantic/semantic-registry-trim.test.mjs` ran two
real child-process LSP transcripts. The default transcript failed
`only the explicit experiment re-arms L2 after a rebuilt query: 2 !== 1`;
the experimental transcript passed. Both exercised normal diagnostics, exact
references/definition, L2 controls, a repeated L2 with no intervening query,
and L3 disposal. GREEN: the re-arm call is enabled only when both
`ARKTS_BENCHMARK_CONTROL=1` and `ARKTS_L01_REARM_TRIM=1` are present. The
same public tests plus the coordinator tests passed 9/9 after `pnpm check`
and `pnpm build`. `git diff --check` passed. Changed handwritten source and
test files remain at or below 500 lines; `type-engine.ts` is 499 lines.
The broader `pnpm check:fast` attempt was not GREEN: a fixed-timeout
repository bundle case failed during cold setup, and the run was interrupted
after that failure. It is not counted as a full-suite pass.

The flag does **not** admit L01 to production. A semantic call in `finally`
means a cancelled or failed call may re-arm even when a new Program has not
been proven; the experimental path still needs a Program-generation witness,
pressure hysteresis/cost evaluation and a real Settings resource gate. One
20-edit Settings run completed 22/22 exact requests and diagnostics but
showed repeated L2/L3 pressure and a 2.22 GB sampled Node RSS peak. A second
run's 22 Location sets were also exact, but its top-level integrity gate
failed because a rebuild changed the server binary during the run; it is
exploratory only. The independent
[fixed-build opt-in replay](../reports/2026-10-07-resident-l01-l2-rearm.md)
has `inputUnchanged=true`, 22/22 exact Locations and diagnostics PASS, but
four automatic L3 evictions, seven edited responses over 20 s and a sampled
Node RSS peak of at least 1,969,491,968 B. It fails L01 resource/latency
admission, so the default-off boundary remains necessary.
