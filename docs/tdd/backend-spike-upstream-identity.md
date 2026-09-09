# Backend Spike S1 — Pinned upstream identity

Parent revision: `93f2a95121c5a1cb4330dc5d475b5cc49abb7662` (PR #9 merge).
Branch: `codex/backend-spike-upstream-identity`.

## RED → GREEN

`node --test tests/upstream-identity.test.mjs tests/test-layer-manifest.test.mjs`
was RED at the parent because `record-upstream-identity.mjs` did not exist and
`.cache/upstream/` was not ignored. The failing assertions covered:

- exact checkout revision equality with the toolchain lock;
- no lock/report/license mutation on revision or ETS API failure;
- a loadable compiler API with `ScriptKind.ETS`, `createLanguageService`,
  and `createDocumentRegistry`;
- exclusion of the upstream checkout from version control.

The same focused command is GREEN at 8/8 after adding the bounded identity
recorder, cache exclusion, and committed identity cross-check.

## Locked evidence

The upstream repository was sparse-checked out at the exact lock revision.
Only the root files plus `src/`, `scripts/`, and `lib/` are materialized;
the upstream test corpus is not needed to establish this identity and is not
copied into the project.

`record-upstream-identity.mjs` validates every input before writing evidence,
loads the package's declared compiler entry point, and atomically writes each
bounded output. It produced:

- `docs/toolchains/arkts-toolchain.lock.json`: package
  `ohos-typescript@4.9.5-r4`;
- `docs/toolchains/ohos-typescript-license.sha256`: the locked LICENSE digest;
- `docs/reports/ohos-typescript-upstream.json`: checkout, SDK, package, build,
  and compiler API identity.

The selected compiler-only build entry is the package's own
`build:compiler = hereby local`, not the broader `build` script that also
builds upstream tests. The checked-in `lib/typescript.js` at the locked
revision is already loadable and reports compiler `4.9.5` and
`ScriptKind.ETS = 8`.

No production code imports or instantiates `ohos-typescript` in S1.

## Final verification

- `node --test tests/upstream-identity.test.mjs tests/test-layer-manifest.test.mjs`:
  8/8 passed with no failures, cancellations, skips, or todos.
- `pnpm check:fast`: 843/843 passed with no failures, cancellations, skips, or
  todos (`duration_ms 465049.874195`).
- `git diff --check`: passed.
- `ohos-typescript` remains absent from `src/lsp` and `src/composition`.
