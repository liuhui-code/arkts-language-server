# Rule Gap — single-owner capability matrix

Parent revision: `38f65e3` (Rust Discovery, PR #18 merge).
Branch: `codex/rule-gap`.

## RED — no machine-readable semantic ownership

The repository documented semantic ownership in prose but did not expose a checked, machine-readable
capability matrix. The first contract required the exact planned capabilities and one string owner for
each. It failed before implementation because the matrix did not exist:

```text
node --test tests/semantic-capability-matrix.test.mjs
Error: ENOENT: no such file or directory, open 'docs/semantic-capability-matrix.json'
```

The companion architecture contract already passed on the clean parent: production dependencies and
semantic sources contained neither `ets2panda` nor ACE rule providers; the normal semantic runtime had
one `createLanguageService()` site and no `createProgram()` site; the project resource provider did not
create a compiler service, Program, or registry.

## GREEN — gaps stay unassigned until proven

`docs/semantic-capability-matrix.json` now makes the current boundary executable:

- syntax, types, completion, definition, references, and rename: `ohos-typescript`;
- project resource existence: `project-resource-provider`;
- ArkTS restrictions and ArkUI structural rules: `unassigned`.

An array or object cannot represent an owner, so a capability cannot silently gain multiple active
owners. No optional rule provider was added because the locked semantic contracts and target SDK
goldens do not currently prove either gap. Future ownership changes must begin with a failing target-SDK
golden and must keep the normal editing runtime at one semantic Program.

Focused and repository evidence:

```text
semantic-capability-matrix: 2/2 passed
test-layer-manifest: 4/4 passed
pnpm check:fast: 869/869 passed, 0 fail/cancel/skip/todo
```

## Reproduction

```bash
node --test tests/semantic-capability-matrix.test.mjs
pnpm check:fast
```
