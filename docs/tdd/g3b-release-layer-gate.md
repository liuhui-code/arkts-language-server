# G3b release layer gate integration: TDD evidence

- Parent revision: `f85af75b624257877275cd9281cef1ff787758a0`
- Public boundary: `scripts/check-release.sh`
- Focused command: `node --test tests/local-delivery-config.test.mjs`

## Contract

The serialized release driver performs its existing fast, Rust, sidecar, query,
and Zed build gates first. Only after those builds finish does it run:

```text
pnpm test:e2e:artifact
pnpm test:e2e:large
```

Each command appears exactly once and artifact precedes large. The release
driver no longer contains `node --test`, an acceptance-file path, or a glob, so
release selection cannot bypass the G1 manifest and G2 runner.

The driver still invokes `pnpm check:fast` exactly once and adds no direct
`pnpm build`. Together with the G3 package-script contract, where both release
layer commands are pure runner selections, this change does not introduce a
second Node build.

## RED -> GREEN

- RED: the ordered release contract failed at
  `pnpm test:e2e:artifact must follow the preceding release gate`; the driver
  still ended with `tests/release/*.acceptance.mjs`.
- GREEN: the direct glob was replaced by the two explicit layer commands while
  every preceding build/check retained its order.

Final focused result: 5 tests passed, 0 failed, 0 skipped. Artifact and large
acceptance layers were intentionally not executed.
