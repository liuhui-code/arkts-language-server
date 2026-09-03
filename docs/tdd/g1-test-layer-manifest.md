# G1 explicit test layer manifest: TDD evidence

- Parent revision: `8452e0e9afdb6e133958d27f1a03263467b680ac`
- Public boundary: `validateTestLayerManifest({ root, manifest })`
- Focused command: `node --test tests/test-layer-manifest.test.mjs`

## Contract

`TEST_LAYER_MANIFEST` is a machine-readable inventory with five explicit
layers:

| Layer | Fast | Current entries | Boundary |
|---|---:|---:|---|
| `unit-contract` | yes | 15 | pure helpers, adapters, metadata and tooling contracts |
| `protocol` | yes | 5 | transport/session behavior with controlled backends |
| `bundle-e2e` | yes | 9 | real production bundle semantic transcripts |
| `artifact-e2e` | no | 2 | installer and portable artifact acceptance |
| `large` | no | 1 | large-workspace release acceptance |

The validator discovers every `tests/**/*.test.mjs` and every direct
`tests/release/*.acceptance.mjs` entry from the filesystem. It then rejects:

- discovered tests missing from the manifest;
- entries assigned to more than one layer;
- manifest paths that do not exist or are not executable test entries;
- release acceptance entries assigned to a fast layer.

The manifest's own `tests/test-layer-manifest.test.mjs` entry is explicitly in
`unit-contract`, preventing the guard from silently excluding itself. G1 only
defines and validates the inventory; selecting layers in a runner is G2.

## RED -> GREEN

- RED: the focused test failed with `ERR_MODULE_NOT_FOUND` because the layer
  manifest/helper did not exist.
- GREEN: all 32 discovered entry points were assigned exactly once, all paths
  existed, layer counts matched the explicit inventory, and every release
  acceptance remained outside fast layers.

Final focused result: 1 test passed, 0 failed, 0 skipped.
