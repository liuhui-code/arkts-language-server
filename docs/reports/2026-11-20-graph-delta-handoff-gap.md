# M4 remaining gap: local node replacement still rebuilds the role directory

Status: confirmed public performance regression requirement, implementation OPEN.
Current4521source/tests unchanged while its full gate and queued validation run.
No product fix, merge/deploy, ordinary latency saving or UI acceptance claim.
Parent1e3886df; Worker4521a49c836591ba78687abbad5b07314a3bfe5dfa54bbeb683cd9100d69cd3b.
E = primary repo .bench/repeated-query-proof-plan-20261117/implementation-20261118.

## Actual reproduction and result

Reuses the existing navigation-dependency-node-retention public case:400TS source
modules in a cycle plus4fixture sources, SDKpartial, real framed stdio child.
Initialize, two exact GlobalThing type definitions, change only Unused350.ts
from '= 350' to '= 350 + 1' on actual private disk and send one type2 watched-file
notification, query GlobalThing, then hover body350. Definition remains exact;
hover reports current 'number' rather than stale literal350. Node replacements
are exactly349/350, two resolutions, topologyScans0 and influenceBuilds0.

Additional actual construction/ownership counters show404roles projected into a
new canonical lookup and402existing binding retain visits for that same query.
These are visits, not402distinct owners; the graph reports401binding catalog owners.
Warm definitions before the edit and the subsequent hover have zero projections/
retain visits. This is neither a new Program claim nor direct evidence of ms cost.
It specifically exposes work omitted by the older two-node replacement metric.

E/graph-role-projection-public-red01.log first actual RED; red02 verifies fresh
hover BEFORE its failing performance assertion; red03 adds actual retain visits.
The new contract expects unchanged role lookup not be rebuilt globally for a
body-only delta. Existing exact/2node/2resolution/0topology/0influence assertions
are unchanged. Raw projection rows in public03.ndjson. Each run uses a fresh
private100+300fixture; original project untouched. RED03 stops after the first
saved edit (before the restore iteration), so it does NOT prove undo coverage.
Small instrumentation exercises behavior/counters, not ordinary30K timing.

## Confirmed call-chain gap

- ProjectOperationScopes.ensure (~138-151) computes changedFacts for updateFacts,
  but invokes dependencies.update(workspace, full roles, overlay, origin). Its
  Graph interface carries no completed source delta. This is static API evidence;
  exact changedFacts cardinality was not instrumented in these runs.
- ScopeDependencyGraph.update (~65): currentNodes rejects an obsolete binding
  original input after actual disk change. A graph proof cannot be cached valid.
- Rebuild branch constructs scripts from all role keys, authoritative from all
  role entries, visited and a queue seeded by all roles plus SDK/global roots.
- Previously current nodes retain their exact binding owners. This avoids
  replacing those nodes but still visits their owners and builds the catalog.
  ScopeModuleBindings.begin/finish use whole-pass used/usedSdk marking, which
  explains why merely reducing the queue would incorrectly prune live owners.
- replaceNode updates actual reverse edges/input revision; topology remains
  unchanged in this body case, so full effects traversal is already avoided.

Neither result-cache invalidation nor Program construction explains the counted
404Map entries; those are direct pure graph preparation. Overall query has other
current/final proof and compiler work, separately measured in M0. Do not sum
inclusive graph/update durations or claim this projection accounts for the whole
2.7seconds. N/E amplification is structurally present; one404case alone does not
prove empirical O(N) wall time or estimate30Kbenefit.

## Required complete direction, not a one-Map patch

Preserve existing immutable role snapshots and original witnesses. Forward a
completed, owner/version-bound changed-source set from the existing fact pass;
unknown/missing/noncontiguous/config/namespace changes retain conservative full
reconciliation. Distinguish changes in role topology from actual input/provenance.

To avoid whole-pass bookkeeping, maintain declared reverse ownership between
actual binding witness inputs, binding owners and consuming nodes, alongside
existing semantic reverse edges. Local application must replace/revalidate all
actual proof consumers, not only the edited node; this ring needs its incoming
resolution consumer too. Source/negative-directory/config/SDK facts have different
invalidation domains. Unknown and opaque facts cannot authorize exclusion.

Incremental owner retention requires commit/release accounting or equivalent
explicit ownership; retaining the current begin/finish global-mark algorithm and
simply shortening queue would discard needed entries. Cancellation must leave
pending input/topology changes visible, reject old scope proofs and allow safe
retry/full fallback. Unchanged-role canonical projection can be retained as a
pure derived structure, with explicit immutable producer identity and mutable/
relative-path fallback; caching only that Map does not finish delta propagation.

Final full input validation and unnotified-change rejection stay independent.
This work is an unclosed portion of approved M4, not permission to weaken ADR0037
or introduce the unapproved observed-snapshot B consistency boundary. No new
ADR status/review is asserted. Before implementation re-read existing0019/0037/
0044/0045 ownership/freshness decisions and current dependency node report.

## Regression/acceptance additions

1. Public body save + actual type hover and exact definitions; unchanged catalog
   derivation0 (or bounded changed entries), actual owner work proportional to
   declared consumers, original final proof raw work counted apart.
2. Same controlled graph with increasing unrelated files and fixed changed-node
   proof consumers; separate truly increasing fanout/consumer sets.
3. Import/ambient/barrel/negative-creation/delete/config/SDK edits and silent
   simultaneous changes; no incomplete successful scope, conservative fallback
   must be observable. Mutable role collections must not borrow immutable proof.
4. Cancellation after owner acquisition/before node commit, after node commit/
   before topology publish, repeated failures then retry, scope disposal/close.
   Exact old-request invalidation, bounded owner counts, no lost pending work.
5. Frozen ordinary30K and fixed/growing closure comparisons, original SDKpartial
   limits separate. Run final whole check on the actual integrated candidate;
   current4521full check does not prove a future delta implementation.
