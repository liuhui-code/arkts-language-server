# References identity binding-chain slice

Date: 2026-09-16

## Outcome

Completed the alias/re-export safety slice for multi-batch identity-bounded
references. The production default is unchanged (`legacy` strategy and
`closure` dependency profile).

## Reproduction and fix

The public LSP RED fixture models:

```text
Target.ets  -- declares Thing
Barrel.ets  -- export { Thing as PublicThing } from "./Target"
Query.ets   -- import { PublicThing } from "./Barrel"
Use.ets     -- import/use the aliased symbol from "./Barrel"
```

With `batchRoots=1`, declaration-anchor pinning alone completed but omitted the
three `Use.ets` references. The GREEN adds `candidateSupportUris` to the worker
protocol and pins every uniquely resolved re-export barrel/source URI into each
identity batch. The support list is bounded at 64 URIs and is validated against
the complete candidate set. Any incomplete proof falls back to conservative
closure verification.

## Verification

```text
Focused protocol + public LSP tests: 4/4 passed
Full tests/semantic/references-batching.test.mjs: 11/11 passed
```

The GREEN assertions require exact Location equality with closure verification,
more than one identity batch, two support files, and a smaller compiler
project-file set than full membership.

## Real-project status

A Photos 6.1 replay was attempted with the previously documented workspace,
SDK API 24, `EditorController` at zero-based UTF-16 position `(133, 14)`, and
the legacy oracle. The run was environment-blocked before startup because the
workspace path `/private/tmp/applications_photos-6.1-lts` no longer exists
(`ENOENT`). No RSS, latency, or reference result from this attempt is treated
as evidence.
