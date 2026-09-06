# A1 artifact manifest contract: TDD evidence

- Parent revision: `134e8ba8ad7b3b4783c83d6b7bb44ba78ed20159`
- Public boundary: `createArtifactManifest({ root, version, commit, platform, toolchains })`
- Focused command: `node --test tests/artifact-manifest.test.mjs`

## Contract

The helper reads a staging directory and returns a JSON-serializable manifest.
It does not write, package, install, or publish artifacts.

The manifest records schema name/version, release version, commit, platform,
sorted toolchain metadata, and one record per regular file. File records use a
relative POSIX path and contain byte size, four-digit permission mode, and a
lowercase SHA-256 digest. Records are sorted by path so traversal order cannot
change the manifest.

Symbolic links are not artifact files. The helper rejects both a symbolic-link
staging root and every symbolic link encountered below the root. This prevents
an artifact manifest from following a link outside the staging tree.

## RED -> GREEN cycles

1. **Manifest identity**
   - RED: module import failed with `ERR_MODULE_NOT_FOUND` because the public
     helper did not exist.
   - GREEN: metadata plus two nested file records matched exact paths, sizes,
     modes, digests, and stable order.
2. **Nested symbolic-link escape**
   - RED: the helper resolved successfully instead of rejecting the external
     directory link (`Missing expected rejection`).
   - GREEN: traversal rejects the link and reports its relative artifact path.
3. **Symbolic-link staging root**
   - RED: the helper followed the linked root (`Missing expected rejection`).
   - GREEN: the root is checked without following it and rejected.

Final focused result: 3 tests passed, 0 failed, 0 skipped.
