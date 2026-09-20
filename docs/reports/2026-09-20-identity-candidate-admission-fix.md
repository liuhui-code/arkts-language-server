# Identity batch candidate admission: missing references fixed

Parent revision: `48b81d17a3c44754166d181329e3ae7c51029497`.
The production default remains `indexed-batched` + conservative `closure` +
full SDK; this change repairs the opt-in `identity` dependency profile.

## Reproduction and cause

The public LSP SDK-terminal fixture's explicit `identity` request returned five
Locations where the conservative profile returned seven. The reference index
correctly included `Target.ets`, `Barrel.ets`, `Query.ets`, and `Use.ets` as
candidates. `Use.ets` imported `Barrel.ets`, but its verifier batch admitted
only `Use`, `Query`, and `Target`. The compiler reported an attempted read of
`Barrel`; identity mode tolerated the absent dependency and returned an
apparently complete but incomplete Location set.

The verifier now retries a batch when an attempted project read names a file
in the **already complete identity candidate set**. The missing candidate is
admitted for that batch only. Unknown/repeated candidate admission fails
closed. An initial wider repair admitted *every* attempted dependency; the
existing direct-import test showed that this pulled in six unrelated `Heavy*`
files and erased the working-set benefit. The candidate-only condition keeps
that test green.

## Validation

- Real child-process LSP SDK-terminal regression: seven exact Locations,
  including both formerly missing `Use.ets` references; index acceptance and
  candidate-admission trace confirmed.
- Entire references-batching suite: 14/14 pass. The direct-import case still
  keeps unrelated dependency files out of the identity Program.
- Full `pnpm check:fast`: 928/928 pass in an allowed macOS process environment.
  The sandboxed first run passed 927/928; only the existing external sampler
  test failed there with `spawn EPERM`.
- Photos `6.1-lts` commit `98ea1d9cd6a363c576e2c6ff17844e51723baec5`,
  DevEco OpenHarmony SDK API 24 (`6.1.1.125`), Node `v26.3.0`, fresh process
  for each replay, normal automatic diagnostics and external 50 ms process-tree
  RSS sampling:

| Symbol / zero-based UTF-16 position | Exact references | Exact diagnostics | Identity peak RSS | Identity batch project files |
|---|---:|---:|---:|---:|
| `BottomToolbar.ets` `getMutuallyExclusiveDesc` 351:19 | 3 | 62 | 580,730,880 bytes | 2 |
| `EditorController.ets` `EditorController` 133:14 | 17 | 59 | 630,464,512 bytes | 7 |

Both real replays passed strict Location and diagnostic comparison to their
fixed legacy oracles. They did not need candidate expansion, so they are
non-regression controls, **not** independent real-project proof of the new
repair branch. The SDK-terminal LSP case exercises that branch directly.

The first local Photos attempt failed before any LSP request because the
sandbox denied the external sampler (`spawn EPERM`). It is recorded as an
environment-blocked attempt, not a semantic failure. The allowed rerun passed.

Raw reports outside the repository:
`/private/tmp/photos-identity-support-fix-20260920.json` (blocked),
`/private/tmp/photos-identity-support-fix-escalated-20260920.json`, and
`/private/tmp/photos-editorcontroller-identity-support-fix-20260920.json`.

Reproduce the repaired LSP regression:

```sh
pnpm build && node --test --test-name-pattern='indexed batching classifies a locked SDK module' tests/semantic/references-batching.test.mjs
```

This closes the specific SDK-terminal false negative, not the general
`identity` release gate. The original >3 GB reproducer, cross-project
identity correctness, and final 50% memory gate remain open. Do not enable
`identity` by default based on these two single-symbol real replays.
