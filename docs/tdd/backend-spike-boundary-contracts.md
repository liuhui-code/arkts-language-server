# Backend Spike S2d — Ownership-boundary contracts

Parent revision: a9d2019eaab64512cbbf23057690d41a81364e08 (PR #13 merge).
Branch: codex/backend-spike-boundary-contracts.

## RED → GREEN

The first focused test was RED because the direct scenario module did not
export `BOUNDARY_POLICY_SCENARIO_IDS`. After registering all 13 remaining
mandatory cases, the committed report remained RED because those cases were
still deferred.

The first complete official-backend run reached 33/34 but failed:

```text
OHOS_TYPESCRIPT_SPIKE=FAIL
EXECUTED=33 DEFERRED=0 FAILED=1
project-boundary.watcher-freshness: delete is invisible
```

The raw definition API retains the local unresolved import alias after its
target is deleted. That alias is not the deleted declaration identity. The
contract was corrected to reject definitions resolving to the deleted target
file and to require backend diagnostic 2307 in the same hot context. Unique
fixture names prevent unrelated library globals from satisfying the check.

The next run closed the semantic gate without a compiler workaround:

```text
OHOS_TYPESCRIPT_SPIKE=PASS
EXECUTED=34 DEFERRED=0 FAILED=0
```

## Ownership evidence

Boundary scenarios call the official backend while retaining the single-owner
model:

- SDK/file selection, target membership, catalog identity: ProjectGraph;
- overlay text/version: DocumentAuthority;
- partial membership decisions: SemanticCoordinator;
- completion result cap and configuration diagnostic mapping: LSP/project policy;
- syntax, types, candidates, definitions, references and diagnostics: official backend.

## Verification

- Report size: 20,651 bytes, below the 64 KiB contract.
- Focused spike and manifest tests: 12/12 passed.
- Direct runner without `--allow-incomplete`: exit 0 and status PASS.
- Full `pnpm check:fast`: 850/850 passed, 0 fail/cancel/skip/todo
  (464,824.67 ms).
- Production `ohos-typescript` import gate: passed.
- `git diff --check`: passed.
