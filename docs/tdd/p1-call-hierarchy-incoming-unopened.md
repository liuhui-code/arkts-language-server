# P1 Call Hierarchy CH2: Incoming and Unopened Sources TDD Evidence

Date: 2026-09-06

## Scope

This vertical slice adds the real production-bundle stdio path for
`callHierarchy/incomingCalls` and hardens all three Call Hierarchy requests
against stale, unavailable, oversized, or physically out-of-workspace sources.

At this slice's parent revision the feature deliberately remained undiscoverable.
`callHierarchyProvider` was advertised only after Call-Hierarchy-specific
cancellation/reliability evidence, the capability contract, and installed-artifact
acceptance became executable. Full semantic-worker migration remains a subsequent
responsiveness/scale gate, not an absolute prerequisite for exposing the
correctness-complete Legacy path.

## Parent revision

The first incoming RED was observed from:

```text
3b12000db1bcba84165cdca573bce888a55d63c4
```

Other agents subsequently advanced the shared branch. This slice preserved
their files and was rebased only through the shared working tree.

## RED -> GREEN cycles

### 1. Production incoming tracer

The production `Content-Length` stdio request initially failed with:

```text
code: -32601
message: Unhandled method callHierarchy/incomingCalls
```

GREEN opens only `IncomingTarget.ets`; `IncomingSource.ets` remains unopened.
The response contains one exact caller, aggregates and deduplicates two call
sites, and proves UTF-16 columns with an emoji before each call.

### 2. ArkTS struct source mapping

The production prepare request for a real ArkTS `struct Profile` initially
returned `Class` and collapsed `range` to `selectionRange`. GREEN separates
declaration-boundary round-trip mapping from exact source-content identity:
the item is `Struct`, its range is the complete declaration, and its non-empty
selection is contained by that range. Selection and call-site spans still
require exact generated/source content identity.

### 3. Stateless unopened follow-up

Calling outgoing on CH1's unopened target initially returned `-32801` because
the generic semantic runner accepted only open documents. GREEN carries only
bounded routing data in the public item:

```text
data.arktsCallHierarchy = { protocol: 1, rootUri }
```

There is no item or old-text cache. Each follow-up resolves the current open
overlay first, otherwise reads a new bounded disk snapshot. A changed
declaration is re-located against current truth and returns `ContentModified`
when its name/kind/selection identity no longer matches.

### 4. Physical source authority and exact result identity

RED cases admitted a workspace symlink escaping the root and accepted an old
result when the target changed after semantic execution. GREEN requires:

- canonical file URIs and configured roots;
- `.ets`/`.ts`, regular files, fatal UTF-8, and a 4 MiB per-file limit;
- pre/read/post file identity and post-execution identity validation;
- physical realpath containment with deepest-root ownership;
- fail-closed ambiguity when configured roots share a physical realpath;
- an internal SHA-256 fingerprint tying every result item to the exact bytes
  used by the type engine (never serialized to LSP);
- a 16 MiB aggregate result-source validation budget without retaining all
  source texts.

Cross-root targets/callers, nested-root aliases, invalid UTF-8, directories
named `*.ts`, changed bytes, and symlink swaps fail the entire request.

### 5. Complete and coherent incoming membership

RED showed both a newly added caller and an existing caller changed from
no-call to call being silently omitted when no watched-file event arrived.
GREEN correctness-first behavior refreshes membership before every incoming
query, records per-path stat identity, and invalidates only confirmed changed
or removed paths. A partial candidate never treats omitted paths as deletions,
and any partial membership produces fixed `RequestFailed` with
`project-membership-incomplete` rather than an empty/partial answer.

The initial correct implementation reset every disk source and dependency
closure on every query. A focused RED measured six closure scans for two
changed sources across three unaffected closures. GREEN batches invalidation:
each dependency closure is scanned once, unchanged refreshes preserve cache and
generation state, and only confirmed deltas advance content state.

### 6. Bounded raw work and I/O

RED cases showed duplicate provider calls/spans could perform work before
unique-output limits, and TypeScript could read oversized/nonregular paths
before cache budgeting. GREEN applies limits before mapping or filesystem
result validation at both core and adapter boundaries:

- 16 prepare items;
- 256 raw/normalized edges;
- 64 raw/normalized ranges per edge;
- 2,048 raw/normalized total ranges;
- 64 KiB prepare and 256 KiB call wire payloads;
- 4 MiB per source and 16 MiB aggregate result-source bytes.

Any overflow returns `RequestFailed/result-limit-exceeded`; results are never
truncated. File reads use regular-file preflight, nonblocking descriptors,
bounded allocation, stable pre/post stat identity, and fatal UTF-8 decoding.

## Original slice focused evidence (`f064358`)

```sh
pnpm check
# tsc --noEmit -p tsconfig.json: PASS

pnpm build
# production bundle: PASS

node --test tests/project-file-set-cache.test.mjs
# tests 22, pass 22, fail 0

node --test tests/lsp-call-hierarchy.test.mjs
# tests 32, pass 32, fail 0
```

Current-HEAD post-hardening re-run:

```sh
node --test tests/project-file-set-cache.test.mjs tests/lsp-call-hierarchy.test.mjs
# tests 76, pass 76, fail 0, skipped 0, todo 0
```

Production behavior is additionally covered for strict input parsing,
locale-independent ordinal sorting, exact/deduplicated ranges, overlay
freshness, source mutation, physical ownership, and atomic failure.

## Advertisement gates and remaining QoS work

- Cancellation/freshness/shutdown protocol evidence (`8f8caa1`), capability and
  immutable installed-artifact acceptance (`8dd2667`), unique test-layer registration
  (`650681f`), and three production-registration stdio guard tracers (`532811f`) are
  complete. The latter prove raw-work preflight, physical result-source authority,
  and the exact 16 MiB aggregate boundary instead of relabeling private-module tests.
- The strict semantic-worker Call Hierarchy codecs and method-aware supervisor
  validation are complete (`1ef51ef`, `2c690c3`). The later
  responsiveness/scale phase must still connect the dispatcher, endpoint, and
  production proxy for prepare, outgoing, and incoming. Avoid a long-lived
  CH-only hybrid worker that duplicates the main-thread TypeScript Program;
  switch semantic ownership coherently when that integration is ready.
- Replace the correctness-first per-incoming O(project paths) stat
  reconciliation with an authoritative watcher/worker-owned project snapshot;
  no large-project latency claim is made for the interim path.
- T4c now keeps cache/membership refresh and watched-removal consumption transactional
  through the final cancellation checkpoint (`990b5aa`, `90e871e`, `8ed16a3`). If the
  TypeEngine becomes cancellable after DocumentStore prepare, delta delivery must move
  to revisioned peek/ack rather than extending this transaction across another owner.
- Raw/physical watched invalidation and lexical engine ownership now use a durable
  canonical owner/reset epoch plus a conservative disk-revision fence (`ea023c6`,
  `0b4c18a`), so one lexical alias cannot consume the only invalidation and leave a
  second call-hierarchy Program stale.
- Measure large-project p95 latency and peak RSS after the watcher/worker path
  replaces the interim reconciliation scan.
