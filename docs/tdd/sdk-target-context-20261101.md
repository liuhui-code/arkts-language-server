# SDK target context: project-model slice

Parent: `2972148759194fb12b9c2c05b49fa3801ccde203` plus the SDK environment
working snapshot. Worktree: `.bench/sdk-target-context-20261101` on
`feat/sdk-target-context-20261101` during implementation. This slice is now
integrated into `feat/sdk-environment-20261101` in the root worktree.

RED: `node --test tests/project-sdk-target.test.mjs` failed because
`HarmonyProjectModel.sdkTarget` did not exist.

GREEN: the selected product exposes immutable compile/compatible/target SDK
versions and runtimeOS. No version is borrowed from another product. Missing,
ambiguous or structurally invalid selected products remain unavailable. The
cached target owns the original profile load witness until ordinary project
invalidation, and enabling witnesses after an unobserved target load cannot
manufacture complete proof.

Validation:

- `node --test tests/project-sdk-target.test.mjs`: 3/3 PASS.
- Original `tests/harmony-project-model.test.mjs`: 27/27 PASS.
- `pnpm check`: PASS.

The initial freshness assertion expected only `false`; the existing public
freshness API also rejects admission by returning no closure. The final test
requires that no successful freshness proof survives, preserving that contract.

## SDK adapter and public LSP integration

The next RED was a real framed-stdio transcript: an otherwise valid selected
product required API99 while the SDK metadata identified API24, but no
`arkts.sdk.target` diagnostic was published. Command:
`pnpm build && node --test --test-name-pattern='compile SDK mismatch' tests/semantic/hms-kit-resolution.test.mjs`.

The adapter now binds the selected product context to the same SDK selection
used for compiler inputs and candidate SDK reference terminals. Numeric API
levels are checked against metadata. Release aliases are resolved only through
the selected component's bounded, witnessed `sdkApiVersionMap.json`; its digest
participates in target qualification. No API level is guessed from a version
major. Unknown aliases and runtime OS values remain unverified.

Explicit compile mismatch and invalid compatible/target/compile ranges produce
a public SDK diagnostic and cannot qualify complete readiness. Healthy queries
remain available. Compatible SDK options reach the compiler only after target
qualification. OpenHarmony views exclude the sibling HMS extension. Ordinary
configuration refresh clears repaired target diagnostics and reloads the model.

Validation before the final compatible-option guard:

- SDK selection/runtime/HMS suite: 42/42 PASS.
- HMS plus reference SDK cache suite: 19/19 PASS.
- Expanded HMS/target suite: 15/15 PASS, covering aliases, unknown alias and OS,
  invalid range, OpenHarmony isolation and same-session repair.
- Type check: PASS. Final focused rerun after the compatible-option guard:
  15/15 PASS (`/tmp/sdk-target-qualified-20261101.log`). Windows properties paths
  are escaped in the new fixture; this host run does not certify Windows.

Integrated verification: type check/build and the combined HMS, SDK discovery,
target-model, transport and manifest suite passed 41/41. Export-index work is
also integrated. The previous full gate had three failures, now repaired; the
fresh final gate is tracked in [SDK evidence](sdk-environment-20261101.md).
The installed Hvigor project schema confirms that all three SDK version fields
belong to `app.products.items.properties`; no app-level inheritance is omitted.

Official evidence:

- https://developer.huawei.com/consumer/en/doc/harmonyos-releases/deveco-studio-new-features-602
  distinguishes compile, compatible and target SDK versions.
- https://developer.huawei.com/consumer/cn/doc/harmonyos-references/errorcode-sdk-compile
  describes version aliases and `sdkApiVersionMap.json`. The installed API24
  map associates `6.1.1(24)` with API24. A release-version major component is
  not a general API-level conversion.
