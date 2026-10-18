# Architecture and ownership

The 2026-10-18 [initial preparation and semantic-group decision](adr/0018-semantic-groups-and-initial-preparation.md)
sets a configurable 4GiB runtime pressure default and exempts first project initialization from pressure admission/eviction.
Shared SDK prewarming and stable retained groups are being implemented in TDD slices; migration and validation status remain in that ADR's evidence record.

The 2026-10-11 [maintainer default-policy decision](adr/0015-default-resident-optimization-policy.md)
enables six selected resident optimizations with explicit opt-out. Earlier
default-off stage statements below are historical; normal ownership, budgets,
exact fallback and unfinished L08 gates are unchanged.

The 2026-10-18 [SDK cache decision](adr/0016-reference-verifier-sdk-cache.md)
retains current SDK syntax in one serial reference verifier Worker. Each job
still disposes its project LS before publication; full scope and freshness
guards remain required. [Implementation evidence](tdd/op00-reference-sdk-cache.md)
records public correctness, the original 403-file deadline and retained memory.

References and semantic latency decisions are indexed in
[the ADR collection](adr/README.md); stage ownership remains in
[the L01–L08 budgeted resident-session plan](plans/2026-10-06-budgeted-resident-semantic-plan.md).
The [research-reviewed OP-00–OP-06 follow-up](plans/2026-10-11-query-performance-follow-up-plan.md)
owns the remaining optimization slices and final validation inside L08, while
OP-04 carries the remaining L02 incremental contracts.
The [preceding semantic-ready S-series plan](plans/2026-09-29-semantic-ready-execution-plan.md)
and [references latency plan](plans/2026-09-20-references-latency-execution-plan.md)
retain implementation and failed-gate history. S02 compiler-derived facts
research is paused after FAIL and S03 remains BLOCKED. [ADR 0014](adr/0014-budgeted-long-lived-semantic-session.md)
records the original long-lived official-LS experiment; current selected
defaults are governed by ADR 0015. The [product contract](plans/semantic-ready/product-contract.md)
does not equate candidate-ready with semantic-ready.
Final product validation belongs to L08. L01–L07 continue through slice-level
functionality, public LSP regressions and execution protection; final memory,
latency, overall readiness and soak/portability targets guide later implementation
without blocking its sequence. The six selected defaults follow ADR 0015;
product graduation and release wait for L08.

The 2026-10-10 [L06 stage audit](reports/2026-10-10-resident-l06-completion-audit.md)
passes A–E: 19 public interactive cases, focused252, real62 and fresh whole1492,
with matching terminal input identities. Actual loaded compiler/resolver witnesses
protect current inputs; realpath/presence/content observations retain distinct
meaning and original bounds. Existing semantic owners, lanes and defaults remain;
L07 also completed its own contracts; final product gates remain at L08.

The current [L07 audit](reports/2026-10-10-resident-l07-completion-audit.md)
passes A–E:25 public edit/call cases, current real62 full payloads
and latest diagnostics equal, with actual lazy-promotion Program reuse and an
OFF rebuild counterfactual. Fresh frozen full check:fast1511/1511, root exit0,
and every terminal input identity match; L07 stage DONE. Normal budgets,
diagnostics, owners and default-off experiments remain; no product graduation.

The public process contract is `arkts-language-server --stdio`. Zed knows only
that contract; it does not depend on server internals.

## Invariants

- Contract positions are zero-based UTF-16. The extracted ArkLine core's
  one-based positions are confined to the semantic adapter and its source-position helper.
- An open `DocumentSnapshot` is authoritative over disk and persisted index
  content.
- Current-document semantic queries never wait for workspace indexing.
- stdout contains protocol frames only. Operational logs use stderr.
- An LSP capability is advertised only after its child-process transcript is
  GREEN.
- Workspace index state is one of `warming`, `ready`, or `degraded`; status is
  never rendered as a search result.

### Unopened source authority

The OP03a disk-source path admits the core definition, typeDefinition, hover,
signatureHelp, completion/resolve, references (both declaration policies),
implementation, prepareRename/rename and call-hierarchy preparation without a
preceding `didOpen`. The existing source authority resolves
canonical/physical workspace ownership and bounded current disk bytes inside the
request interval; freshness, cancellation and physical source identity are checked
again before publication. An actual open buffer remains authoritative. A
server-owned `DocumentSnapshot.source` discriminator and explicit bounded Worker
query payload carry disk text, not a synthetic open/close mutation, overlay-map
entry or input-revision advance. Client document version zero is an ordinary
open version, never a disk discriminator. Incoming/outgoing follow-ups use the
same explicit transport and retain complete source/result validation. Disk
completion handles retain one exact source SHA per bounded record, not source
text; one source hash per list is computed inside the response. Resolve rereads
the source and rejects changed bytes, even at the same size/mtime, or competing
open authority. Client-supplied item fields never replace the server-owned item.
Compiler preparation remains in the original
semantic owner with the original budgets; no second LS or retained batch owner.
Disk reference result-cache hits require the existing owner's current complete
READY generation/input proof, including the requested declaration policy. Storage
requires the same proof before and after the query; readonly status never prepares
an owner. No proof or a changed proof falls back to the original complete query,
not an empty result. Proof metadata counts toward the original128-entry/8MiB cache
bounds; no compiler objects cross the Worker boundary. The original open-buffer
cache path still avoids diagnostic quiescence without extra owner requests.
Identical overlapping disk references share the existing coalescer's bounded
operation, including source resolution. Each client retains its own cancellation
and freshness scope; the shared operation is not owned by the first client token.
A workspace mutation revokes every old participant, and physical source identity
is still checked before publication. Rename returns transactional edits with null
closed-file versions, preserves local-import aliases, and never writes the files.
Each additional direct capability requires its own complete public transcript;
basic core entry transcripts do not qualify every workload bucket or L08.
Evidence: [OP03a RED/GREEN and current related regression](tdd/op03a-completion-diagnostic-priority.md).

## Module boundaries

```text
src/lsp              LSP lifecycle, capability mapping, request freshness
src/contracts        editor-neutral snapshots and ports
src/project          workspace/project resolution
src/semantic         adapters around the extracted semantic core
src/core             extracted ArkLine implementation; no LSP imports
src/index            sidecar adapter, protocol validation, URI rebasing
src/composition      production dependency assembly and platform paths
crates/index-core    headless ArkTS symbol parser and in-memory ranking
crates/index-sqlite  private persistent schema, WAL and atomic generations
crates/index-sidecar protocol-v1 NDJSON process and streamed cataloging
editors/zed           thin local Zed adapter; stable CLI only
```

`src/server.ts` delegates production assembly to `src/composition`; tests may
inject the same editor-neutral ports. Semantic and index modules must not import
`vscode-languageserver`. Only the Rust persistence crate knows the SQLite
schema. The Zed extension must not import or encode server implementation
details beyond the stable executable name and `--stdio`.

## Runtime sequencing

1. LSP `initialize` configures all workspace roots and advertises only tested
   capabilities.
2. `initialized` opens one sidecar session per root and starts cataloging in the
   background. Existing committed generations remain searchable.
3. Open buffers shadow persisted rows; close returns authority to the index.
4. Catalog generations activate atomically. A timeout, malformed protocol, or
   child exit degrades only that session and preserves the last committed
   generation.
5. Shutdown rejects new work, cancels cataloging, disposes semantic state, and
   bounds child termination.

## Parallel ownership

| Track | Owned paths |
| --- | --- |
| LSP runtime | `src/lsp/**`, final `src/server.ts` assembly |
| ArkTS semantic | `src/semantic/**`, `src/core/types/**`, `src/core/virtual/**`, `src/core/sdk/**` |
| Persistent index | `crates/index-*/**`, `src/index/**` |
| Zed and delivery | `editors/zed/**`, `scripts/**`, CI and delivery docs |

Changes to `src/contracts/**`, root manifests, lockfiles, or shared fixtures are
owned by the integration branch and land before dependent track changes.
