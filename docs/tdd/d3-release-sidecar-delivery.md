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

## Installed production chain

The gate now runs the installed command from outside the checkout with no
`ARKTS_LSP_HOME` and with sidecar auto-discovery. It creates a real workspace,
requires the catalog to finish exactly `Indexed 1/1 files; skipped 0 entries`,
and verifies class and method names, LSP kinds, ranges, and method container.

After a clean shutdown it starts a second installed process over the same
cache. The cached symbol must remain queryable during the new background scan
and the first warm query must complete within 400 ms. This prevents release
packaging from passing on mere `initialize` while production indexing is
missing, stale, or coupled to the source checkout.
