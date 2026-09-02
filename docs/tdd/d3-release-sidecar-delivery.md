# D3 release sidecar delivery: TDD evidence

- Parent revision: `c274319`
- Public boundary: `scripts/install-local.sh`
- Command: `node --test tests/release/local-delivery.acceptance.mjs`

RED: the one-command installer returned success but the production executable
expected by `resolveIndexSidecarPath` did not exist at
`target/release/arkts-index-sidecar`.

GREEN: the installer performs a locked release build of the root workspace's
`arkts-index-sidecar` package into the project-local target directory. The
acceptance test verifies that the artifact is non-empty and executable, then
repeats installation to retain the existing idempotency guarantee. The full
acceptance completed 1/1.
