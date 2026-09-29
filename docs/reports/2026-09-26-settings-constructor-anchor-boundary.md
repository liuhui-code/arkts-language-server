# Settings: constructor usage exposes a conservative-search boundary

Status: **negative probe; latency/diagnostic gate FAIL; seed stays off**.

Same production artifacts, Settings revision, Node and API24 SDK as the
[local-export seed report](2026-09-26-settings-local-export-anchor-seed.md).
No production changes, project copies, boundary changes, forced GC or disabled
diagnostics. New query: `common/src/main/ets/core/controller/MenuController.ets`,
zero-based UTF-16 **90:17**, `new MenuController(menu)`, declaration excluded.
The existing declaration-position oracle contains 247 Locations. It is **not**
a validated constructor-position oracle; the new
[manifest](../../bench/references/manifests/settings-menucontroller-api24-local-export-seed.json)
is now explicitly unverified, preventing graduation/reuse as a passing matrix.
Raw runs retain the original passed preflight and failed oracle comparison.

## Actual replay

| Probe | First request ms | Post-edit ms | Product-tree peak RSS bytes |
| --- | ---: | ---: | ---: |
| indexed-batched, seed on, mode C | 138,794 | 146,414 | 730,402,816 |
| legacy, seed off, mode A | 10,723 | not run | 700,502,016 |

Every one of the 11 mode-C responses and the fresh legacy response contains
**267 Locations**, with exact normalized URI/range equality across strategies.
Against the unrelated declaration-position oracle there are 245 missing and
265 extra tuples, not merely twenty extras. Do not replace that oracle or
call these locations wrong solely from the count difference: compiler query
identity depends on the constructor position. This is same-position
differential evidence, not an independent proof of every constructor reference.
Both runner commands exit 1 because their oracle check fails; preserve FAIL.

The mode-C run additionally records an automatic diagnostic wait timeout at
the unchanged 180-second deadline. It executes two 23-batch conservative
sessions, **46 completed batches**, nine cache hits (53–57 ms wire durations),
and normal server exit 0. The legacy control publishes version-1 diagnostics
(one diagnostic) and exits 0. Neither run crashes/OOMs; no timeout or partial
result is relabeled success. Automatic diagnostics remained enabled.

Seed discovery never becomes `references.anchor.seed.accepted`. The query
ultimately uses standalone compiler anchors (2,543/3,775 ms), whose definition
points to constructor position **84:2**. At that position the ready-generation-1
index result is `supported=false`, `complete=false`, without declaration
identity, producing `candidate-ineligible` fallback and all 1,466 membership
files as candidates. The logs show two declaration queries per miss, consistent
with an attempted seed then the established anchor path. They do not expose
which earlier seed-proof predicate failed; that cause is still unproven.

The first ~57 seconds overlap the focused test command; therefore this is a
boundary/diagnostic probe, **not a controlled latency A/B or release P95**.
The later legacy control runs after tests finish. Large regression and timeout
justify investigation, not a numeric speedup claim or changing default policy.
RSS is external Node+sidecar process-tree sampling; worker-thread RSS is not
added twice. Raw samples and harness accounting remain in the output JSON.

## Next bounded implementation gate

1. Characterize class versus constructor anchors through public LSP, including
   inheritance, `super`, aliases and re-exports; retain same-position legacy
   differential and independently known reference checks.
2. Identify the precise seed/index-proof rejection before adding any identity
   normalization. Do not equate a constructor and class by lexeme/span alone.
3. Add RED for the proven unsupported path and preserve compiler authority,
   snapshot/cancellation and diagnostics. No automatic promotion of seed,
   worker residency or `identity` dependency profile.
4. Rerun this query in independent processes without competing tests. Require
   exact results and versioned diagnostics, not faster timeout or partial work.

## Reproduction and provenance

Use the existing `scripts/bench/replay-references.mjs` with the fixed workspace
and SDK from the preceding report, file above, `--symbol MenuController --line
90 --character 17 --exclude-declaration`, `--mode C --strategy indexed-batched
--sdk-profile full --dependency-profile closure --batch-roots 64 --idle-ms 1000
--trace`, seed env 1 and anchor memo env 0. Use the original 247-location oracle
to reproduce the **negative** check, with a fresh `--out` and **no manifest**:
the new manifest intentionally rejects until its query oracle is validated.
Legacy control uses the same query with seed env 0, `--mode A --strategy legacy`.
Do not silently overwrite either oracle or prior result.

Raw files under `.bench/anchor-reuse-2026-09-26/`, SHA-256:

- `menu-local-seed-C-on-1.json`: `3bb71fa306a4b03ab4000978544f8a39a28d0cba8d25a1d3eb1ed2c44ab78352`
- `menu-local-seed-legacy-A-control.json`: `969231c3d19ae72238e99c539319574c5c3fc04f9110747c6c2fed572da6c087`

Multi-batch seed/declaration-policy characterization and transport regression:
**25/25 pass**, `pnpm check` pass, `git diff --check` pass. Test file 313 lines;
production artifacts unchanged. The earlier full fast command's three sandbox
sampler failures remain distinct. No commit, push, merge or release claim.
