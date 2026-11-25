# M4: maintain reverse adjacency with node commits

Status: implemented slice; full objective IN_PROGRESS. No merge, release or Zed
deployment. Parent1e3886df. Prior frozen Worker0d609a5d; new frozen Worker
c63ffd202fad16bd59352d451229b61682ff982d69e5616894b6ed99e866a44f.
Native unchanged800e6628. Evidence under main repository
`.bench/repeated-query-proof-plan-20261117/implementation-20261118/`.

## Confirmed redundant work and public RED

`ScopeDependencyGraph.update -> effects` rebuilt reverse adjacency from all nodes
and outgoing edges whenever any topology changed. Body-only reuse already avoids
effects; that earlier fix did not remove this real topology-change cost.

New public Content-Length child LSP regression builds a400-file import ring,
warms a negative typeDefinition, changes Unused350.ts from an exported module to
a global class, validates the exact new declaration, then restores the module.
The original implementation returns the correct declaration but fails the cost
regression: one complete node iteration to rebuild adjacency, expected zero.
Command: Node20 `--test --test-concurrency=1 --test-name-pattern='topology changes
maintain reverse edges' tests/semantic/navigation-dependency-node-retention.test.mjs`.
Raw RED: `reverse-edge-maintenance-red.log`;1FAIL/3not-selected. This is a cost
regression through real requests plus exact result oracles, not a stale-result bug.

## Implementation and lifecycle

`src/core/types/scope-dependency-graph.ts` owns reverseEdges/globalSeeds/nativeSeeds
with its existing node owner. `replaceNode` normalizes old/new outgoing targets
with cancellation checkpoints before mutation, updates only differences, maintains
seeds and commits the node. No cancellation checkpoint splits the synchronous
adjacency/seeds/node commit. Existing topologyDirty is set before mutation;
interruption before publication remains pending and existing rebuilding guards
prevent consumption. Existing real cancellation after node commit remains GREEN.

Duplicate outgoing references use set semantics: propagation already deduplicates
visited nodes, so multiplicity has no semantic effect. Empty incoming sets are
removed; incoming edges to absent targets remain while importers own them, and
are removed when those importers change/disappear. Deleted nodes lose outgoing
edges and seed membership. Whole owner retirement releases these structures;
no historical edge versions, ASTs or source texts are retained.

`effects` consumes the retained adjacency and seed sets; opaque nodes remain
global even if independent, matching the original branch. Cyclic propagation
still uses the original visited set. This does not implement an SCC/type engine
or prune propagation on guessed semantic signature equality. Completion's
star-export-specific reverse graph remains separate because its edge semantics
differ. Input/source/config/SDK checks and final union are unchanged.

## GREEN and scope

First file4/4PASS,0skip/cancel. Expanded55/55PASS,0skip/cancel in
`reverse-edge-maintenance-expanded01.log` covers navigation-dependency-node-retention,
scope-dependency-lifecycle, semantic-group-planning, navigation-group-membership-reuse,
navigation-final-member-fence, local-file-dependency-alias. Expanded new case also
creates the global again, deletes its file and restores the module, validating
negative/positive definitions each time and zero full adjacency rebuild scans.
Typecheck/build PASS before expanded tests. Graph remains below500 physical lines.
No Rust change. No final whole check on this identity yet.

Adjacency maintenance now scales with edges of replaced/removed nodes instead
of rebuilding all N/E for each effects call. Reachability still depends on real
seeds and affected edges; update still has full catalog/visited/proof work. Extra
resident metadata is O(N+E), owned by the existing graph. No assertion that all
editing or hot navigation becomes O(changed files), or that this alone fixes
Photos2.6s hot navigation / queued10s tails. Ordinary paired timing remains open.

## Separate Photos verification, prior frozen0d609 identity

`m4-capsule-photos-ordinary01-summary.json` preserves a complete protocol session
on the original isolated Photos30K input, not UI. Initialization72371ms, first
definition5435.78ms, hot2614.25/2613.58/2659.95ms. All17 definition responses have
exact target checks; edit/undo/close/reopen/cross-module checks ran. One unchanged
post-undo definition10491.39ms; member completion10105.64ms; completion details
7812.48ms in server log. These are open performance defects, not acceptable proof
of completion simply because results were correct.

Log epoch1/thread1, define Worker10 queued at01:58:08.723Z, send01:58:16.188Z:
supervisor admission-to-send7465.21ms; Worker receive-to-dispatch0.365ms. Diagnose9
started01:58:08.721Z. Completion Worker19 admission-to-send7427.35ms while diagnose18
started01:58:33.072Z. This proves substantial pre-Worker waiting; finer scheduling
causality and full diagnostic duration require further evidence, not a claim that
all10s is symbol lookup or that priority can interrupt a running checker.

Native indexed30000 READY. SDK24/project20 remains semantic partial29995 members;
full references/rename are not qualified. Node RSS sampled peak2205.73MiB (Worker
threads counted once), Native142.59MiB, tree2348.05MiB, no guard/OOM incident; owned
processes CLOSED. Whole session FAIL: original60s SQLite integrity check timeout
on1.83GB catalog, not demonstrated corruption and not waived. Control DB passes.
Raw logs, resource samples and failure retained. This Photos run predates the
reverse-index product change and cannot validate or time that new implementation.
