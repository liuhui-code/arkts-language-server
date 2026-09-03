# Fast and release gate separation evidence

- Parent revision: `035750f`
- Scope: public `pnpm check:fast` and `pnpm check:release` contracts

## RED

After one-command delivery joined the default test glob, `pnpm check:fast` ran
two full pnpm/Cargo/WASM installer builds concurrently with the LSP transcript
suites. One delivery case took 46.8 seconds, the older duplicate installer case
took 41.6 seconds, and an otherwise healthy standalone initialize transcript
hit its 2-second timeout. The gate ended `28/29` despite all feature-focused
tests being GREEN.

## GREEN design

- `check:fast` runs deterministic typecheck, bundle, LSP, semantic and adapter
  suites only.
- `check:release` runs `check:fast` first, then the clean build/install/WASM
  acceptance test serially.
- The older adapter installer test was removed because the release acceptance
  test strictly supersedes it: build, atomic WASM publication, safe idempotent
  symlink installation, repository-external cwd and real initialize are all
  covered in one place.

The acceptance filename deliberately does not match the fast `.test.mjs` glob.

## Stateful release-suite serialization regression

- Parent revision: `43dbbd9ba72b417cbb732ac27d6028942052a561`
- RED: `node --test --test-name-pattern='release gate serializes' tests/local-delivery-config.test.mjs`
- Failure: `check:release` omitted `--test-concurrency=1`, so its installer and
  clean-build acceptances could mutate shared build/install state concurrently.
- GREEN: the same focused command passes after making serialization part of the
  public package-script contract. This protects the earlier design intent from
  silently regressing again.

## Canonical release driver regression

- Parent revision: `43b3108`
- RED: the package script, GitHub workflow, and README maintained separate
  command lists; the focused delivery contract failed because
  `scripts/check-release.sh` did not exist and CI did not watch it.
- GREEN: `pnpm check:release`, CI, and the README now converge on the same
  fail-closed driver. The driver requires both fixture variables and owns the
  ordered Node, Rust, pinned-project, Zed, and serialized acceptance gates.

## Pinned real-project gate

A later RED showed that the workflow invoked `check:release` without providing
the mandatory large-project fixture, while the direct Rust 455-file test was
ignored by the ordinary workspace suite. The workflow now checks out the
public fixture at exact commit
`585feb45114a128a0d2a23947c83faf338e758f7`, exports its path to both release
gates, and explicitly runs the ignored Rust catalog test before building the
release sidecar. A 30-minute job deadline bounds infrastructure hangs.

The workflow contract is protected by:

```text
node --test --test-name-pattern="Zed workflow" tests/local-delivery-config.test.mjs
```

RED: the pinned Rust gate and fixture environment were absent. GREEN: the
workflow test requires the repository, immutable revision, checkout path, both
environment variables, and gate ordering.
