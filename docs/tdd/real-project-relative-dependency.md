# Real-project bare relative dependency: TDD evidence

Parent revision: `e30b182df558dc0f4e7b631c51f5fd33ae10a8ca`.

Real fixture: `netease-kit/nim-uikit-harmony` at
`585feb45114a128a0d2a23947c83faf338e758f7` (455 ArkTS/TypeScript sources).

## Original real-project failure

The existing release large-workspace gate reached `455/455` and returned exact workspace symbols, but
its contract did not open a real source file for semantic member queries. A production stdio probe on
`teamkit_ui/src/main/ets/pages/TeamAvatarPage.ets` exposed the missing semantic link:

```text
TeamRepo. completion: []
TeamRepo.teamDefaultIcons hover: any
definition: []
references: []
workspace symbol TeamRepo: exact declaration found
```

The consumer declares `"@nimkit/chatkit": "../chatkit"`. `LocalPackageResolver` recognized only
`file:../chatkit` as a local dependency and incorrectly attempted `oh_modules` lookup for the bare
relative form.

## RED

The regression uses the release LSP bundle over Content-Length framed stdio and declares the synthetic
dependency in the same form as the real project:

```text
pnpm build && node --test \
  --test-name-pattern='resolves a local Harmony dependency declared by a bare relative path' \
  tests/semantic/local-package-resolution.test.mjs
```

It failed because definition returned the unresolved import span in the consumer instead of the
unopened dependency declaration.

## GREEN

The resolver now treats dependency values beginning with `./` or `../` as local paths, then sends them
through the existing canonical-root, realpath, workspace-containment, package-entry, file-type, size,
and overlay checks. Installed versions, undeclared imports, absolute paths, symlinks, and workspace
escapes keep their existing behavior.

Verification on `5ee0ce7b9458c2d2b1bd883b7e1fb13ee82a3f84`:

- focused public stdio regression: PASS;
- package resolver and semantic package suite: 39/39 PASS;
- `pnpm check:fast`: 878/878 PASS;
- API 24 real SDK: 10/10 PASS;
- pinned real project: 455/455 indexed; cold 194.48 ms, warm first query 4.93 ms, repeated P95
  2.81 ms over 30 samples;
- real source completion, cross-module definition, references, prepareRename, and transactional rename:
  PASS. Rename produced four edits across two files and was not applied to disk.

Machine-readable results are in
[`docs/reports/macos-real-project-semantic-e2e.json`](../reports/macos-real-project-semantic-e2e.json).
