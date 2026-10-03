# R-09: reuse an existing complete compiler Program

Parent `911ae43c274175614559b63f0311504747d8393d`; branch
`codex/references-resident-fast-path`. User AGENTS.md edits are preserved.
Baseline PR #91 fast suite is 1103/1103 PASS. The active slice now has its own
fresh **1116/1116 fast PASS** at the preceding checkpoint. The later R-07
cycle exposes a negative-lookup control failure; its repaired final build now
passes **1126/1126 whole-fast**. Settings remains the real-project benchmark, API24 compatibility
track, with unchanged source boundaries and constructor oracle.

## Subsequent negative-lookup recovery (2026-09-29)

The combined R-07 whole-fast is1124/1125 PASS,1 FAIL: unchanged automatic-types
control has0 rather than2 resident hits. A controlled sibling-creation transcript
repeats this twice without changing a workspace source/package: cached complete
Program admission wrongly depends on a shared absence parent's child-list times.
The [recovery record](references-constructor-empty-scope.md) preserves these REDs.
Subsequent absence freshness keeps stable parent/link/entity identity and rewalks
the exact missing chain. Direct files/enumerated directories and actual-load
before/after guards retain full stamps, including the missing owner's load
window; actual configuration changes remain fail-closed. No stale cache is
re-stamped and defaults/budget/Workers are unchanged.

The18-case resident file plus nine constructor cases/four manifest cases passes
31/31 at original deadlines. Independent source review passes. Final-artifact
Settings modeC is11×267 exact/valid at unchanged settings, with R-09 off;
it is not resident-reuse graduation. The fresh complete `pnpm check:fast` passes
**1126/1126, exit 0**, zero failures/cancellations/skips/todos, duration
1,052,240.191742 ms. The [recovery record](references-constructor-empty-scope.md)
retains both failed runs and the final whole-gate log digest; original deadlines
and source/test/build inputs remain unchanged during verification.

## Public RED and characterization

```sh
node --test --test-name-pattern='an unchanged complete resident Program' \
  tests/semantic/references-batch-search-coverage.test.mjs
```

RED: exit 1, 2,467.757 ms, expected two resident hits but observed zero.
Both declaration policies already matched fresh legacy exact Locations; the
missing behavior was reuse of a fully covering, already paid-for Program.
The existing four full-search coverage cases were GREEN before extraction.

Minimal implementation is opt-in `ARKTS_REFERENCES_RESIDENT_FAST_PATH=1`.
It peeks at an existing leased context, checks identity/content/overlay/SDK
coverage and memory pressure, and queries the original cursor in that same
Program. No compiler build or index declaration seed is allowed to fabricate
coverage. Exact compiler results alone can produce a hit. Misses preserve the
existing full verification pipeline. Tracing is not an admission input.

Basic GREEN: 1/1, case 1,433.424 ms. Indexed constructor/local-seed variants
also pass (1/1, case 2,225.030 ms), including two exact-result cache misses;
they are not result-cache hits. Four original coverage characterizations pass.
Default-off/trace-off, selective disconnected scope, unwatched source edit
and changed unsaved overlay guards pass 4/4. Existing benchmark-control LSP
`level3` disposal guard passes 1/1. It proves dispose invalidation, not a
separate deterministic L2 trim transcript.

## Actual configuration freshness RED

```sh
node --test --test-name-pattern='an unnotified package entry' \
  tests/semantic/references-batch-search-coverage.test.mjs
```

RED: 1 FAIL, exit 1, 2,400.359 ms. After implementation warmup, retarget
`shared/oh-package.json5` from A to B without a watcher event. Source bytes,
membership and overlays do not change. The old resident Program wrongly
retains two PackageConsumer Locations under both declaration policies; a
new legacy process after the mutation does not. The warmed legacy process is
not used as this oracle because it also caches old package metadata.

Two further public REDs cover creating a previously absent root package owner
and retargeting an installation link (2 FAIL, 3,780 ms). An independent
automatic `@types` package-entry retarget also produced a RED (1 FAIL,
2,216.836 ms): compiler type-directive discovery bypasses `resolveModuleNames`.

The repair witnesses actual construction/lookup-time filesystem identities,
including negative lookups, physical link owners, SDK selection and metadata,
ETS loader options, project profiles, package entry points and compiler-host
implicit types. Cached text/overlay/token branches are not re-stamped. The
optional witness is enabled before the initial project loads; late enablement,
unknown/unstable evidence or changed inputs refuse reuse. Default-off adds no
witness filesystem reads. It does not scan the workspace or replace resolver
or compiler authority.

At the preceding checkpoint, full public coverage is **17/17 PASS, exit 0, 63,218.531 ms**, with
zero failures, cancellations, skips or todos:

```sh
/usr/bin/caffeinate -i node --test --test-concurrency=1 \
  tests/semantic/references-batch-search-coverage.test.mjs
```

This includes the configuration REDs repaired to GREEN, SDK
metadata/ETS-loader/local.properties variants, automatic type-directive
metadata, both declaration policies, constructor original-cursor reuse,
default-off/trace-off, source and overlay mutation, incomplete scope, L3
disposal and cancellation/recovery. The cancellation guard also passed three
independent earlier reruns. It checks admission/request cancellation, not a
deterministic mid-mapping cancel; L2 trim is not separately public-tested.
`pnpm check` and `pnpm build` pass. Final read-only review found no remaining
concrete correctness blocker.

## Replay tooling and remaining gates

The existing runner now accepts `--mode B --warmup implementation`, with
the old completion/definition warmup still its default. The public CLI and
catalog-state runner tests pass 11/11, exit 0. This is not a second replay
protocol or a real-project latency result.

[Fixed Settings A/B](../reports/2026-09-29-settings-resident-fast-path.md):
six independent processes return 267 exact Locations with normal diagnostics
and exit 0. All enabled requests miss at L3 and still perform 24 batches;
real-workload admission is not qualified. Do not count RSS differences as a
resident-reuse gain, hide full warmup cost or raise the budget to force a hit.
At the preceding R-09 checkpoint, fresh final-source `pnpm check:fast` is
**1116/1116 PASS, exit 0**, with zero
failures/cancellations/skips/todos, Node duration **1,016,832.04149 ms**. It runs
the 17-case coverage again alongside all existing public/characterization
tests, with unchanged deadlines and no failed-case rerun. Command:

```sh
set -o pipefail
/usr/bin/caffeinate -i pnpm check:fast 2>&1 \
  | tee .bench/references-resident-fast-path-api24/check-fast.log
```

Raw log SHA256 is
`7b1379f812619d9f488a91b8c6bce74342cf0a79c5e8a5a436aa24601045d4c7`.
At that checkpoint, server/Worker/native hashes matched the six-run manifest;
Settings checkout was clean and user AGENTS.md hash unchanged. Implementation and
its regression gate are complete; **real-workload graduation is not**. R-07
constructor-specific production exclusion remains the next substantive slice.
Broader public R-09 L2/mid-mapping cancel and release distribution gates are
separate (existing shared cancellation/pressure characterizations pass). No
default promotion, persistent verifier, source-range approximation, reduced
diagnostics, higher budget, forced GC, commit, push or merge follows.

Source size at that preceding checkpoint: type-engine registry 500→486 lines; the oversized language
service 3712→3629 through cohesive reference-query/state/SDK extraction remains
migration debt. Package resolver 559→495 removes that debt. The public coverage
file is 439 lines and existing replay script is 477; new handwritten helpers
remain ≤179 lines. User AGENTS.md hash is unchanged.
