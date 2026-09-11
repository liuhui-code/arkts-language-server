# References semantic-unit ProjectGraph TDD record

Parent revision: `b70367964bf7b32e66524b08b4aeb1acde6bd8ff`

## RED

The first model-level tracer bullet required a declared `entry` module with a local
`file:../shared` dependency to expose both `entry -> shared` and `shared <- entry` as immutable
semantic-unit edges. Before implementation the public `HarmonyProjectModel` had no
`semanticGraph()` contract:

```bash
node --test --test-name-pattern="exposes declared module dependency" \
  tests/harmony-project-model.test.mjs
```

The public child-process LSP tracer bullet then configured two declared modules, requested
`textDocument/references` through `dist/server.cjs`, and set the candidate-root limit to one.
Before planner integration the three indexed candidate files produced three flat batches:

```text
AssertionError: 3 !== 2
semanticUnitMode=conservative
```

Command:

```bash
pnpm build
node --test --test-name-pattern="keeps declared project semantic units intact" \
  tests/semantic/references-batching.test.mjs
```

The next RED required the verifier workspace to contain only the selected units and their declared
forward dependency closure. Whole-unit grouping alone still admitted every membership file, so the
public trace had no `admittedProjectFiles` reduction. After admission was added, an intentionally
under-declared `entry -> shared` fixture failed the whole LSP request with `-32803`: partial work
from the restricted verifier was not yet discarded and retried conservatively.

Finally, a model contract with non-empty `dynamicDependencies` initially reported a complete graph.
Because those edges are not yet resolved, treating the graph as complete would allow an unsafe
exclusion.

## GREEN

`HarmonyProjectModel.semanticGraph()` now returns bounded, immutable project/product/module/target
identities plus explicit local dependency and reverse-dependency edges. Only `file:` or relative
package dependencies form project edges; versioned packages remain installed-package dependencies.
Missing manifests, unresolved local paths, and non-empty dynamic dependencies mark the graph
incomplete. A local package nested inside its owning module remains part of that unit rather than
inventing a second module boundary.

When indexed candidates and a complete graph are both available, the references planner keeps all
candidate roots from one semantic unit together, packs whole units into sequential batches, and
admits only the batch units, pinned/open units, and their declared forward dependency closure. If
the graph is unavailable, incomplete, or cannot own every candidate path, it uses the existing R1
conservative planner. If a supposedly complete restricted closure still causes a source-unavailable
verification, the executor discards all partial results and retries the same indexed candidates with
the conservative planner. Cancellation is never converted into a fallback.

Focused GREEN after the closure-admission slice:

```text
Project model/budget + references batching suites: 34 passed, 0 failed
Public semantic-unit LSP case: exact Location equality; 3 flat file batches -> 2 whole-unit batches
Restricted verifier: 4 admitted project files out of 10 membership files
Under-declared dependency: restricted result discarded, conservative retry exact
```

## Real-project boundary

RemoteDesk has no active root `build-profile.json5` (only `build-profile.example.json5`), so all
three new-process replays correctly recorded `semanticUnitMode=conservative`. They returned the
same 71 locations and peaked at 656,072,704, 977,543,168, and 975,228,928 bytes. The two stable
high runs remain in the prior R2 range; no memory improvement is attributed to semantic-unit code.

Gramony is the first fixed real checkout in which this slice is active. At commit
`0a1ee4b026b6736671f0030ba9859aceaa962298`, references for `DateHelper` returned the exact eight
R1 locations in three independent new processes. The trace recorded three semantic units, two
units in the selected batch, 73 admitted membership files out of 77, and 32 project SourceFiles.
Peaks were 502,091,776, 512,905,216, and 511,356,928 bytes; request times were 3.364, 3.098, and
3.073 seconds. Against the fixed R1 peak of 580,169,728 bytes, the median reduction is only about
11.9%, below the 30% prototype gate.

OpenHarmony Settings commit `ecc550dfaed880e04e38a2477eb7235cd50475b9` is not accepted as a
correctness oracle for `LogUtil`: a fresh declaration query returned zero locations, while the
usage query returned only 14 local locations and missed known cross-module references. Its root
configuration also contains a local phone dependency on `feature/suggestion` that is not a declared
root module, so ProjectGraph correctly marks the graph incomplete instead of excluding it.

OpenHarmony Photos `OpenHarmony-v6.1-LTS` at commit
`98ea1d9cd6a363c576e2c6ff17844e51723baec5` has 1,794 ArkTS/TS files and 18 declared modules, but
the locked backend returned declaration-only results for both a cross-module and a same-module
`import lazy` class. Those runs are retained as toolchain-blocked evidence, not used as differential
goldens.

OpenHarmony FilePicker `OpenHarmony-v6.1-LTS` at commit
`d691e8ec5da1e75e25dbefc922df0ea3fe361ee5` provides an ordinary-import exact control. Three
independent indexed runs each matched all 49 normalized legacy locations. The active project graph
reduced 80 membership files to 58 admitted files and 56 project SourceFiles, but median peak RSS
regressed from 424.1 to 664.6 MiB. This negative result keeps the strategy experimental and shows
that working-set reduction must exceed the transient verifier plus SDK fixed cost.

## Root target omission compatibility (2026-09-11)

Parent revision: `0b2a321bd575a85a19c866b550563942eef69ab8`.

The Photos checkout exposed a valid DevEco configuration shape that the model rejected: root
`modules[]` entries may omit `targets`, and module `build-profile.json5` may also omit `targets` to
use the implicit `default` target. The installed DevEco project schema requires only `name` and
`srcPath` for root module entries; the module schema documents the implicit default target.

Two model-level tests were added before the implementation. The first failed because omitted root
targets returned `module-target-unavailable`; the second failed because an omitted module-profile
target list returned `module-profile-unavailable`:

```bash
node --test --test-name-pattern="an omitted root targets list uses the sole module-profile target" \
  tests/harmony-project-model.test.mjs
node --test --test-name-pattern="an omitted module-profile targets list provides the default target" \
  tests/harmony-project-model.test.mjs
```

The model now selects the sole non-test module-profile target when the root mapping is omitted and
synthesizes only the documented `default` target when the module profile omits the list. Multiple,
invalid, or test-only targets remain fail-closed. The full project-model suite passes 25/25.

This compatibility fix changes Photos from an unavailable graph to a complete 18-unit graph while
FilePicker remains complete and Settings remains unavailable for its independent configuration
problems. A real Photos ordinary-import query for `PersistInfoUtils` then returned the same five
normalized locations as legacy in one indexed semantic-unit batch. It reduced 1,246 membership
files to 716 admitted project files and the compiler Program to 78 project plus 632 SDK SourceFiles.
The result is semantically GREEN but not a memory improvement: indexed peak RSS was 842,514,432
bytes in 11.769 seconds versus legacy 728,735,744 bytes in 5.303 seconds. Trace evidence shows the
usage-site path paid for two equivalent 710-SourceFile Programs: one transient compiler anchor and
one verifier. The next slice must remove that duplicate anchor cost without weakening compiler
proof; the production default remains `legacy`.
