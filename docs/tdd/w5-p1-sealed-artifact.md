# Wave 5 P1 sealed artifact: TDD evidence

Parent revision: `6a6e2aefa012d4168a45a0df3cadf8765d085ab9`

Public boundary: `pnpm build:artifact -- --source-root <clean-worktree> --output <new-directory>`
and `ARKTS_SEALED_ARTIFACT_DIR=<directory> pnpm test:e2e:artifact:sealed`.

Assumption: a releasable artifact must be built from one clean committed tree, bind the real
Git object id, become immutable after sealing, and be accepted without invoking any build tool.

RED command:

```sh
node --test tests/release-artifact-topology.test.mjs
```

RED observed failure: the public `scripts/build-portable-artifact.mjs` entry did not exist, so
the first topology case failed before producing an artifact. The consume-only slice then failed
because `tests/release/sealed-portable-artifact.acceptance.mjs` did not exist. A later
output-inside-source case exposed a `/var` versus `/private/var` canonical-path escape and stayed
RED until the missing output path was canonicalized through its nearest existing ancestor.

Minimal GREEN change: archive the exact HEAD into one temporary staging tree; run frozen install,
one JavaScript build and one sidecar release build there; invoke the single-source portable
builder; then emit a deterministic ustar archive, its manifest and `SHA256SUMS` into a read-only
directory. The acceptance process extracts and installs only those bytes while `pnpm`, `cargo`,
`esbuild`, `npm`, `npx`, and `rustc` are poison executables.

GREEN focused commands:

```sh
node --test tests/release-artifact-topology.test.mjs
node --test tests/portable-artifact-builder.test.mjs tests/artifact-manifest.test.mjs
```

Observed result: topology 6/6 and existing portable/manifest regression 7/7, with no skipped or
todo tests. Two independent builds of the fixture commit produced byte-identical archive,
manifest, and checksum files.

Artifact digest: generated per invocation in `SHA256SUMS`; the focused fixture output is removed
after the test and is not a promotable release artifact.

Remaining risks: CI upload/download and cross-job digest handoff are not connected; GitHub Release
promotion remains forbidden until the repository's `UNLICENSED` public-distribution policy is
resolved. The current builder targets the Node bundle and native sidecar; Zed WASM validation and
the platform matrix remain separate Wave 5 work.
