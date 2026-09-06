# I1 immutable artifact install foundation

- Parent revision: `0ecc33798e7cf69a795c670522bf6ffbdb395b39`
- Public boundary: `scripts/artifact/build-portable.mjs` followed by
  `scripts/install-local.sh --from-artifact ARTIFACT_DIRECTORY [BIN_DIRECTORY]`
- Assumption: the release server bundle and native sidecar were built once by
  an earlier build stage; this slice packages and installs those bytes but does
  not compile them

## RED

```sh
node --test --test-name-pattern='installs one verified artifact' \
  tests/release/portable-install.acceptance.mjs
```

The real acceptance failed with `MODULE_NOT_FOUND` for
`scripts/artifact/build-portable.mjs`. There was no public path that turned one
set of prebuilt runtime files into a manifest-backed artifact.

## Minimal GREEN

The artifact builder copies only the portable launcher, bundled server, native
sidecar, and artifact installer assets into a new directory. It reuses the A1
`createArtifactManifest` contract, preserving relative POSIX paths, byte sizes,
modes, and SHA-256 digests. Source and `node_modules` deliberately present in
the build input are not copied.

The local installer now has an explicit early `--from-artifact` branch. That
branch requires only Node, validates the schema and host platform, rejects
unsafe paths/symlinks/unlisted files, verifies every listed size, mode, and
digest, and then copies only the three runtime files into a digest-addressed
immutable release directory. The command symlink is switched only after the
copied bytes have been verified. The existing source-build path is unchanged.

The acceptance generates the artifact once, moves its build input away, and
runs installation from a random external cwd with an isolated HOME and no
artifact `src` or `node_modules`. Poison `pnpm`, `cargo`, and `esbuild`
executables fail immediately if invoked. A same-size mutation of `server.cjs`
is rejected by SHA-256 before a clean artifact is installed. The test compares
the installed launcher, server, and sidecar bytes and modes with the artifact,
then completes a real framed LSP `initialize` through the installed command.

## Evidence

Focused GREEN:

```sh
node --test --test-name-pattern='installs one verified artifact' \
  tests/release/portable-install.acceptance.mjs
```

Result: 1 passed, 0 failed; the three unrelated tests were excluded by the
name filter.

Portable installer regression:

```sh
node --test tests/release/portable-install.acceptance.mjs
```

Result: 4 passed, 0 failed, 0 skipped.

A1 manifest regression:

```sh
node --test tests/artifact-manifest.test.mjs
```

Result: 3 passed, 0 failed, 0 skipped.

Static and TypeScript checks:

```sh
node --check scripts/artifact/build-portable.mjs
node --check scripts/artifact/install-from-manifest.mjs
sh -n scripts/install-local.sh
pnpm check
```

Result: all commands exited successfully.

The test artifact digest is derived from the exact temporary manifest and is
asserted at runtime; it is intentionally not a release digest.

## Remaining boundary

This slice produces a verified directory artifact, not the final archive and
`SHA256SUMS`. It does not upload, download, sign, or promote an artifact, and it
does not modify GitHub Actions or the release driver. Toolchain metadata is
supplied by the future build stage. The native sidecar is included and byte
verified, while this minimal tracer ends after initialize; full installed
semantic/catalog coverage remains in the existing local-delivery acceptance
until the immutable artifact scenario is expanded.
