# Cargo workspace boundary evidence

- Parent revision: `2b43188`
- Scope: compose the headless index workspace with the standalone Zed extension

## RED

After merging the index workspace, running
`cargo build --target wasm32-wasip2 --release` from `editors/zed` failed before
compilation: Cargo found the repository workspace but the extension was neither
a member nor explicitly excluded.

## GREEN

The root workspace explicitly excludes `editors/zed`. This preserves the
extension's independent lockfile/toolchain boundary while allowing both the
headless index workspace and the extension build to run from one checkout.

Integration hygiene also ignores the root Cargo `target/` output. The new
index crate is marked `publish = false` so its metadata matches the repository's
private, all-rights-reserved Local Beta status instead of implying an MIT
distribution grant.
