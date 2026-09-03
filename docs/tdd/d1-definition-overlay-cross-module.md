# D1 definition overlay and relative cross-module evidence

- Parent revision: `0ecc33798e7cf69a795c670522bf6ffbdb395b39`
- Public boundary: materialized Harmony workspaces through the real bundled
  `dist/server.cjs --stdio`
- Scope: unopened target authority, an opened unsaved target overlay, and a
  relative source import across two declared Harmony modules

## Existing coverage audit

- D0 already opens only `OtherConsumer.ets` and proves that its definition is
  the unopened `Profile.ets` target with one complete, non-zero marker-derived
  range. The consumer marker follows an emoji and is measured in JavaScript
  UTF-16 code units.
- The separate `fixtures/semantic/alias-barrel` transcript resolves an import
  alias through a barrel to the underlying `Profile.ets` file. D1 strengthens
  it from a range-start assertion to the complete, non-zero `displayName`
  range derived from the target text, including
  `textInRange(targetSource, range) === "displayName"`.
- No previous corpus case crossed a Harmony module directory.

## Target overlay characterization

The existing D0 protocol session was extended without changing production
code. After the unopened-target assertion, it opens an unsaved overlay for the
target URI. The overlay inserts an emoji, new lines, and a preceding ArkTS
`struct` rewrite before the original declaration. The next consumer definition
request is sent immediately, with no timer or catalog wait.

Focused command after rebuilding the bundle:

```sh
pnpm build
node --test --test-concurrency=1 \
  --test-name-pattern='returns the exact unopened definition range after an emoji prefix' \
  tests/semantic/semantic-characterization.test.mjs
```

The first run was GREEN: 1 passed, 0 failed. The returned result was already
the unique target URI and the overlay's shifted complete `Profile` range. The
stronger variant with the preceding `struct` source-map rewrite was also GREEN.
This is characterization evidence, not a manufactured RED; no TypeScript
language-service change was justified.

## Relative cross-Harmony-module characterization

The deterministic corpus now declares `entry` and `shared` modules in the root
build profile. `entry` has a local-file dependency on `shared`. The semantic
fixture deliberately uses the relative source path currently supported by the
language service:

```text
entry/src/main/ets/pages/CrossModuleConsumer.ets
  -> ../../../../../shared/src/main/ets/model/SharedProfile
  -> shared/src/main/ets/model/SharedProfile.ets
```

Both reference and target ranges have corpus markers after an emoji. The real
session opens only the consumer and requires exactly one unopened target,
complete non-zero range, and exact `SharedProfile` text under JavaScript UTF-16
coordinates.

The first focused run was also GREEN:

```sh
node --test --test-concurrency=1 \
  --test-name-pattern='resolves an exact unopened definition across Harmony modules' \
  tests/semantic/semantic-characterization.test.mjs
```

Result: 1 passed, 0 failed. This records existing relative-path behavior only.
Harmony package aliases, `oh-package.json5` dependency-name resolution,
`build-profile.json5` project references, and generated module maps remain
unimplemented and unclaimed.

The strengthened alias/barrel test was also GREEN on its first focused run:

```sh
node --test --test-concurrency=1 \
  --test-name-pattern='resolves a definition through an import alias and barrel export' \
  tests/semantic/semantic-characterization.test.mjs
```

Result: 1 passed, 0 failed. It is characterization evidence and required no
production change.

## Verification

```sh
node --test --test-concurrency=1 tests/conformance-corpus.test.mjs
pnpm build
node --test --test-concurrency=1 tests/semantic/semantic-characterization.test.mjs
pnpm check
```

Results:

- conformance corpus: 10 passed, 0 failed, 0 skipped;
- semantic characterization: 8 passed, 0 failed, 0 skipped;
- bundle build: passed;
- TypeScript check: passed.

No capability, protocol contract, production TypeScript engine, or test-layer
manifest change was made.
