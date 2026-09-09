# Memory Runtime — Coordinator, memory policy, and single semantic worker

Parent revision: `3729edf56c0aa9d6ab7bb8740fa190a215454d2d` (PR #16 merge).
Branch: `codex/memory-runtime`.

## RED

The first vertical contract fixes the runtime configuration and exercises the coordinator through its
public lease, pressure, rebuild, and metrics behavior. Before implementation it fails because
`config/semantic-runtime.json` and `src/semantic/coordinator/*` do not exist.

```text
node --test tests/semantic/semantic-coordinator.test.mjs
```

Further production-worker RED/GREEN evidence is appended as each vertical slice is connected.

## GREEN

The committed runtime policy now fixes one semantic worker, at most two resident contexts, and the
initial L0-L3 thresholds. `SemanticCoordinator` owns the resident set, idempotent leases, LRU capacity,
trim/dispose decisions, aggregate context stats, and rebuild through an external document authority.

`SemanticTypeEngineRegistry` now uses that coordinator as its only context owner. Each provider call is
lease-pinned; Level 2 invokes the official Language Service `cleanupSemanticCache()` through `trim()`,
while Level 3 and LRU eviction dispose the entire engine and ArkUI provider. The old four-workspace Map
and its independent eviction path were removed.

Focused result:

```text
semantic coordinator + real type-engine runtime + adjacent official backend: 21/21 passed
pnpm check: PASS
```

The next vertical slice connected the production worker dispatcher/proxy, periodic sampling, JSONL
output, and artifact wiring.

## Production Worker RED

The second vertical contract runs the built production server over real stdio with a 1 MiB test
budget. Before the worker runtime was connected it failed because production created the official
backend in the protocol process and emitted no worker/context metrics:

```text
node --test tests/lsp-production-semantic-worker.test.mjs
```

The contract requires exactly one physical semantic worker, never more than two resident contexts,
Level 3 disposal, and completion from the latest unsaved overlay after the disposed context rebuilds.

The first full bundle run then exposed four compatibility failures: source-bundled tests without an
adjacent worker artifact, SDK selection logs trapped inside the worker, a strict transport error leaking
for an out-of-workspace rename source, and two concurrent definition requests sharing the existing
latest-wins lane. Each was reproduced by its existing public LSP test before its narrow correction.

## Production Worker GREEN

- `dist/server.cjs` and `dist/semantic-worker.cjs` are now built and shipped as one adjacent runtime;
- production creates one `SemanticWorkerEngine`; only the worker runtime creates the single official
  `OhosTypeScriptSemanticEngine`;
- all roots multiplex through one Node worker and independent revision-bound supervisors;
- document mutations are acknowledged before queries, cancellation uses the shared host token, and
  shutdown awaits semantic disposal;
- committed runtime config controls the two-context limit and L0-L3 thresholds; the environment may
  override only the memory budget with `ARKTS_MEMORY_BUDGET_MB`;
- worker metrics count process RSS once and record heap, external memory, array buffers, contexts,
  project files, open documents, and leases;
- SDK selection events are relayed to the one production logger; the worker does not own a second log;
- out-of-workspace rename sources fail closed as unavailable before entering the strict worker wire;
- source-bundled formatting evidence now builds the required adjacent worker artifact.

Verification:

```text
bundle-e2e: 271/271 passed
pnpm check:fast: 864/864 passed, 0 fail/cancel/skip/todo
pnpm check: PASS
```

The canonical release gate remains the final phase-exit check before merge.

## Reproduction

```bash
node --test tests/semantic/semantic-coordinator.test.mjs
node --test tests/lsp-production-semantic-worker.test.mjs
pnpm test:bundle-e2e
pnpm check:fast
git diff --check
```
