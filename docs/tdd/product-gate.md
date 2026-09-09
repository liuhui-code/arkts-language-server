# Product Gate — deterministic scale and fail-closed release evidence

Parent revision: `089419c` (Rule Gap, PR #19 merge).
Branch: `codex/product-gate`.

## B-A RED/GREEN — orthogonal fixture growth

RED was `MODULE_NOT_FOUND` for `scripts/bench/generate-large-fixture.mjs`. GREEN adds a no-overwrite,
strict-argument generator. Tests prove exact `.ets` counts, an independently traversed active dependency
closure, and identical full-tree SHA-256 for the same seed.

The full planned set was generated locally on 2026-09-09:

```text
unrelated: 1,000 / 10,000 / 50,000 / 100,000 workspace files; active=200
dependency: workspace=100,000; active=200 / 1,000 / 5,000 / 10,000
actual unrelated .ets files across four fixtures: 161,000
actual additional dependency .ets files across three fixtures: 300,000
```

The dependency point 200 reuses the unrelated 100,000/200 fixture instead of duplicating identical
evidence. `.bench/` is ignored and no generated workspace is committed.

## B-B RED/GREEN — Linux PSS/RSS source

RED was the absent `scripts/bench/process-memory.sh`. GREEN reads exactly one `VmRSS` value in kB from
`/proc/<pid>/status` and one `Pss` value in kB from `/proc/<pid>/smaps_rollup`, converts them to bytes,
and rejects missing, duplicate, malformed, or non-positive PID inputs. Tests inject a private proc root;
the production default remains `/proc`.

## B-C/B-D RED/GREEN — immutable workflow and release evaluator

RED was the absent evaluator and gate configuration. GREEN commits the exact product thresholds and a
machine-readable workflow with the two growth series, cold/warm/stress counts, eight common actions,
stress lifecycle, and process-role accounting.

The evaluator fails closed unless both products report complete 3/10/5 workflows with identical SDK
and fixture identities. It independently checks DevEco steady/peak PSS ratios, 10k→100k unrelated
scaling, post-eviction recovery, semantic contract failures, and warm P95 latency regression. Tests
cover a full pass plus correctness, identity, and workflow-count failures.

Focused and repository evidence:

```text
product-gate + layer-manifest: 11/11 passed
pnpm check:fast: 876/876 passed, 0 fail/cancel/skip/todo
generated fixture disk use: 1.8 GiB (development host; not a release metric)
```

## Current release evidence boundary

This development host is macOS 26.6.2 (x86_64), with Zed 1.18.0 build 20260902.164356 and DevEco
Studio 6.1.1 build DS-243.24978.46.36.611280 / JBR 21.0.8. It cannot produce the formal Linux
`smaps_rollup` PSS evidence required by the plan. No placeholder `memory-zed-arkts.json` or
`memory-deveco.json` is committed, and the Phase must remain open until a controlled Linux/cgroup run
and the first confirmed DevEco workflow produce both PASS lines.

## Reproduction

```bash
node --test tests/product-gate.test.mjs tests/test-layer-manifest.test.mjs
pnpm check:fast
```
