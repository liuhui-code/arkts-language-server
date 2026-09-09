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

Production worker dispatcher/proxy, periodic sampling, JSONL output, and artifact wiring remain open in
this phase.

## Reproduction

```bash
node --test tests/semantic/semantic-coordinator.test.mjs
pnpm check:fast
git diff --check
```
