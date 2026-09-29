# Native prerequisites for clean test-layer execution

Parent revision: `f812b153a507fd963e79572d4c1eb4c37e9a3aaa`.
Public boundary: `runNodeTestLayer(options)` and its existing CLI/package gates.
This is build/test integration, not a references semantic or performance change.

## Original CI failure and independent reproduction

PR #91 run [36508984775](https://github.com/liuhui-code/arkts-language-server/actions/runs/36508984775)
passed Windows installation but failed Linux `check:release` during its initial
`check:fast`: 1,075/1,093 passed, 18 failed, zero cancelled/skipped/todo.
Three class-binding tests explicitly required a missing `target/release` sidecar;
native-index anchor/coverage tests also failed their expected observation gates.
The release driver did not build the native workspace until after the fast gate.
Neither the runtime bundle builder nor the shared Node runner built that binary.

Ranked checks were missing native prerequisite, inconsistent native output path,
then Node-version/observation differences. A clean `git archive` of the parent,
with only the same Node dependencies and runtime bundle linked, reproduced:

```sh
node --test --test-name-pattern='captured current inputs compose' \
  /private/tmp/arkts-ci-native-repro.GqU4c5/tests/class-binding-input-snapshot.test.mjs
```

RED: 0/1 passed; `build the release sidecar for public composition`.
Supplying only the existing native `target` to that isolated tree then running
the original capture test and `opt-in cold local-export` transcript produced
2/2 PASS. No source, bundle, SDK, assertion or timeout was changed. This proves
the missing-prerequisite failure for these controls; the next complete CI must
still verify all 18 original failures rather than assuming their cause.

## Public RED → GREEN

Focused command:

```sh
node --test tests/test-layer-native-prerequisite.test.mjs \
  tests/test-layer-runner.test.mjs tests/test-layer-manifest.test.mjs
```

1. A selected-layer runner in an empty temporary workspace starts real Node
   tests which require the newly built artifact. Cargo is substituted only at
   the external build-tool boundary. RED: both tests fail with `ENOENT`; the
   runner starts tests without invoking the required build. GREEN: one locked
   native build completes before both selected layers execute.
2. The default manifest must explicitly identify its two consuming layers.
   RED: the prerequisite-layer list is empty. GREEN: `unit-contract` and
   `bundle-e2e` declare the requirement; other layers keep existing behavior.
3. Characterizations cover an already-present artifact still undergoing Cargo
   freshness validation, build exit/signal propagation with retained failure
   evidence, missing/non-file output rejection, list-only execution without
   spawning and pure protocol execution without a native build.
4. Independent review identified relative `cwd` being applied twice by Cargo.
   A public runner regression first fails because `--target-dir` is relative.
   GREEN resolves the target directory to an absolute path before spawning.
5. At parent `119179aa65314cb368a3ca3f80266e72b80672d7`, the unchanged sealed
   artifact metadata test exposed an unwanted `requiresReleaseSidecar: false`
   field on non-consuming layers. RED: the following original public test fails
   exact object equality. GREEN: only consuming layers expose the optional
   `true` field; other layers retain their original metadata shape.

   ```sh
   node --test --test-name-pattern='exposes build and sealed consume' \
     tests/release-artifact-topology.test.mjs
   ```

The runner builds once per selection, not once per entry, using:

```text
cargo build --locked --package arkts-index-sidecar --release --target-dir <cwd>/target
```

The platform-specific release output must be a regular executable file. Cargo
and test execution share the existing evidence owner. A build failure never
starts tests and is not converted into success. Existing artifact acceptance
and release-layer ownership, package entrypoints, runtime defaults, diagnostics,
result completeness and request deadlines remain unchanged. No test is skipped
or moved out of the fast gate. The new test is registered in the single manifest;
the inventory becomes 123 entries / 61 unit-contract entries.

## Verification

Initial focused integration is **42/42 PASS**. Including the unchanged release
artifact topology tests after the metadata correction is **49/49 PASS**, exit 0,
zero failed, cancelled, skipped or todo:

```sh
node --test tests/test-layer-native-prerequisite.test.mjs \
  tests/test-layer-runner.test.mjs tests/test-layer-manifest.test.mjs \
  tests/release-artifact-topology.test.mjs
```

Fresh full `pnpm check:fast` and Linux/Windows CI must also
pass before merge. Earlier failed CI evidence remains retained
under `.bench/merge-2026-09-29/ci-f812b15-validate.log` and on GitHub.
An intermediate whole gate was deliberately interrupted before applying the
relative-cwd correction; its log is not a completed passing or failing gate.
The final frozen-source full run uses a distinct output log.

The restricted local run was also interrupted before correcting the metadata.
Its RSS replay controls could not read the process list. The unchanged
`tests/references-replay-catalog-state.test.mjs` fails in that sandbox after
10.187 seconds but passes in 2.633 seconds with external process sampling
permission. The next full gate uses that permission; no sampling interval,
assertion, deadline or production behavior changes. Both restricted/interrupted
logs remain evidence and are not reported as completed gates.

All changed handwritten files remain <=500 lines; the pre-existing 499-line
runner test is unchanged. This prerequisite repair does not graduate the cold
500 ms, constructor candidate-admission or final memory gates.
