# D2.2: one-command Zed dev-extension installation

Parent revision: `db5d09c84e66c733b92a2fc75fa4ba2734984697`

Public command:

```text
pnpm zed:install
pnpm zed:install -- --zed-user-data-dir DIRECTORY --bin-dir DIRECTORY
```

## RED 1: no public installer

```text
node --test --test-name-pattern='one local Zed install command registers' \
  tests/local-delivery-config.test.mjs
not ok - ENOENT ... scripts/install-zed-local.mjs
```

The prior installer built the server and extension but ended by asking the user
to run `zed: install dev extension`. It did not register, refresh, or isolate a
Zed installation.

## GREEN 1: isolated, atomic registration

The public-process test uses checkout, profile, and bin paths containing spaces.
It proves that one command:

1. delegates the existing frozen server/sidecar/extension build;
2. validates both WASM artifacts and the pinned grammar lock;
3. creates a content-addressed extension snapshot;
4. creates an ordinary executable profile-local server launcher, so Zed's WASI
   work-directory preopen never has to follow a symlink outside that directory;
5. atomically updates `extensions/installed/arkts`; and
6. leaves an existing `extensions/index.json` byte-identical.

It also proves the explicit profile prevents writes through HOME or
XDG_DATA_HOME.

## RED 2: a failed update moved the old launcher

The fixture first installed `old-server`, then completed a transactional build
of `new-server` while corrupting the candidate grammar. Validation correctly
failed, but the old workdir launcher pointed at the mutable bin symlink and now
resolved to `new-server`.

```text
Expected .../old-server/arkts-language-server
Actual   .../new-server/arkts-language-server
```

## GREEN 2: immutable activation target

The workdir launcher now executes the real content-addressed server release.
Candidate build and validation happen before either Zed activation path changes.
A grammar failure leaves the prior extension link, prior server launcher, Zed
index, and installed directory unchanged.

## Further fail-closed regressions

- A clean-checkout grammar with a matching repository, revision, and SHA-256 is
  retained by `install-local.sh`; an unproven/stale grammar is invalidated.
- A dangling or foreign dev-extension link is rejected before the expensive
  build begins.
- A launcher is replaceable only when its ownership marker, complete wrapper
  template, immutable release shape, target existence, and executable bit all
  validate. Changing from bin prefix A to bin prefix B remains supported.
- The stable package command and workflow path triggers are contract-tested.
- The Rust adapter resolves `binary.path`, then the installer-managed workdir
  launcher, then PATH; its default protocol remains `--stdio`.

## Verification commands

```text
node --test tests/local-delivery-config.test.mjs tests/zed-adapter.test.mjs
cargo fmt --manifest-path editors/zed/Cargo.toml -- --check
cargo build --locked --manifest-path editors/zed/Cargo.toml --target wasm32-wasip2
pnpm test:e2e:artifact
pnpm check:fast
```

Final result on this branch:

```text
pnpm test:e2e:artifact  # 6 passed, 0 failed
pnpm check:fast         # 769 passed, 0 failed
```
