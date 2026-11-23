# Independent dependency-axis fixtures for final performance validation

Status: generator/variable controls verified, actual performance NOT RUN. This is
preparation for A-plan V03, not final-scale or UI/endurance acceptance. E denotes
primary `.bench/repeated-query-proof-plan-20261117/implementation-20261118/`.
Product code/artifacts remain unchanged; old whole check still collects failures.

## Why the earlier fixed-closure matrix is insufficient

Increasing unrelated modules with requested/observed Program16 measures residual
membership/role/configuration costs. It does not establish cost when genuine
compiler dependencies grow, or independently vary fanout/depth. A balanced-tree
fanout change alone normally also changes depth, and increasing closure normally
changes total source bytes. Those variables must not be silently conflated.

## Generator and public CLI RED/GREEN

E`scale-controls/generate-dependency-axis.mjs` reuses the original isolated
project/SDK generator and only changes generated relative-import trees. It never
rewrites real Photos or existing fixture outputs. Target/Main declaration and
query positions are preserved. Every output recomputes complete source hash/bytes
and graph reachability from actual emitted imports. That is a generator graph,
NOT an observed compiler Program count. Later real LSP trace must supply actual P.

The CLI tests independently read generated source imports and verify graphs:

- Depth RED: original generator ignores the extra depth request; actual depth4
  instead of8. GREEN:128files/128reachable/127edges/fanout8, depth4 and8, same bytes.
- Fanout RED: new axis unsupported. GREEN:128files/128reachable/127edges/depth4,
  fanout8/16/32, same total bytes.
- Closure RED: growing import count changes source byte volume. Then a shape
  control RED exposed depth changing with closure. GREEN:total128, reachable16/64/
  128, fanout8/depth5 fixed, each source512bytes. Padding is trailing comments;
  real import/AST counts remain different and intentionally observable.

Each cycle keeps failed log and parent tool identity. After GREEN, the now-dead
balanced-only branch was removed under the three existing characterizations;
`dependency-axis-tools-green-final01.log`:3/3PASS,0skip/cancel. All scripts<500lines.
No product fixture/setup failure is relabeled a semantic regression.

## Planned real process controls

E`dependency-axis-experiment-plan.json` freezes generator/test hashes and12points:

| Axis | Total source N | Requested imports | Controlled values |
| --- | ---: | ---: | --- |
| Genuine closure | 2048 |16/128/512/2048 | depth5,fanout8,512bytes/source fixed |
| Fanout |2048|128|8/16/32/64; depth4,node/edge count,total bytes fixed |
| Depth |2048|128|4/8/16/32; fanout8,node/edge count,total bytes fixed |

Three serial cold Node processes/version/point are planned: parent frozen
runtime-main d39a901d and current7b7b8584,72sessions. This count is PLANNED, not
executed. Existing run.mjs/exact query-oracles.mjs will measure initialization,
first/fivehot definitions, dependency save/inferred type/undo, unrelated save,
unsaved edit/undo/close/reopen, exact references and local-alias rename. Native
cache new at first round then closed-cache reused, OS pages not flushed. Original
resource/SQLite/postflight/source-restore protections stay in force.

No queue starts these performance sessions while the old full check is live.
Reconcile unexpected old failures and current targeted controls first; execute
remaining diagnostics before final whole rerun, never pretend that a failed old
whole is a new full PASS. Captured failures/functional gaps stay in the denominator
and cannot be filtered into a clean success claim.

## Limits

Generated graph reachability and physical N do not prove actual P or graph stages
inside the language server. SDK is intentionally partial/minimal; real Photos API20
versus installedSDK24/full-reference/rename issues remain separate. Closure padding
fixes raw volume, not AST/import-node count; filename distribution varies with
closure. Fanout/depth redistribute imports between files. These tests can show
observed trends with code basis, not independently prove O(N)/O(N²). Per-operation
error/timeout, actual Program/build/candidate/batch counts and resources remain to
be measured. Single-file volume, reference density and SCC/cycle axes are separate
remaining work, not implied by these three generator checks.
