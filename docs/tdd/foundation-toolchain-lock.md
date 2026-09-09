# Foundation F2 — Toolchain lock

Parent revision: `07786a8` (PR #7 merge).
Branch: `codex/foundation-toolchain-lock`.

## Contract

`scripts/semantic/lock-toolchain.mjs` writes one deterministic JSON identity for
the official semantic backend and the SDK declaration inputs. The SDK path must
be absolute and contain real `ets` and `toolchains` directories. The digest is
SHA-256 over ordinal-sorted, slash-normalized relative paths, content lengths,
and bytes for `.d.ts`, `.d.ets`, and `.json5` inputs.

An explicit revision must be a lowercase 40-character SHA. Without one, a valid
existing lock supplies the revision, preventing a floating upstream lookup on
later runs. Only the first run without either source executes bounded
`git ls-remote <repo> HEAD`. Output is written through a same-directory temporary
regular file and atomic rename.

Declaration symlinks, non-regular inputs, empty input sets, oversized files,
aggregate bytes, and file counts fail closed. Unrelated toolchain symlinks are
not followed and cannot enter the digest; this is required by the installed
DevEco SDK, whose `native/llvm/bin/clang` is a legitimate link. Existing lock
symlinks are never followed.

## RED → GREEN evidence

1. `node --test tests/toolchain-lock.test.mjs` was RED because the CLI did not
   exist. The explicit-revision lock contract failed with `MODULE_NOT_FOUND`.
   The minimal deterministic CLI made it GREEN.
2. Re-running without `--revision` was RED with the fixed revision-validation
   error. Bounded validation of an existing lock now reuses its exact SHA and
   avoids a network lookup (GREEN).
3. The first real installed-SDK run failed closed on
   `native/llvm/bin/clang`. A dedicated regression was RED for the same reason.
   Traversal now skips unrelated links while still rejecting declaration-input
   links; all fixture tests and the real SDK lock are GREEN.
4. Reusing a symlinked existing lock was RED because the reader followed it and
   exited successfully. `O_NOFOLLOW`, regular-file checks, and a 64 KiB read
   budget made it GREEN without changing the symlink target.

The path/content digest, fake-upstream first resolution, empty SDK, declaration
symlink, and committed-lock schema checks passed directly; no separate RED is
claimed for behavior already covered by the preceding implementation slices.

## Locked identity

- Backend repository: `openharmony/third_party_typescript`
- Revision: `9cc62fe98f47c0bf113676e3fb33fe932b493052`
- SDK: OpenHarmony API 24, ETS component `6.1.1.125`
- SDK declaration digest:
  `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`

## Verification

- `node --test tests/toolchain-lock.test.mjs tests/test-layer-manifest.test.mjs`:
  11/11 passed, with no failures, cancellations, skips, or todos.
- `pnpm check`: passed.
- `pnpm check:fast`: 838/838 passed, with no failures, cancellations, skips,
  or todos (464.0 seconds).
- `git diff --check`: passed.
