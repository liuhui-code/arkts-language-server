# Initial index catalog native phase trace

Parent revision: `b2cc3a9e4485783cd7922b819fe748da6a9f85d8`.
The pre-existing user-owned `AGENTS.md` edit was preserved.

This observation-only slice adds `ARKTS_INDEX_CATALOG_TRACE=1`. By default it
emits no phase events. When enabled, the production composition logs a native
sidecar phase transition once per workspace and generation, with a monotonic
timestamp, file counts, and separate raw building/committed generations. It
does not mislabel a cancelled or degraded build with the prior committed
generation, and omits workspace paths and source text. The
Language Server's public catalog-progress mapping and semantic behavior are
unchanged.

## RED → GREEN

The new test uses a real `dist/server.cjs` child, Content-Length-framed LSP,
and the existing scripted sidecar's repeated activation heartbeats. It checks
that ordinary `workspace/symbol` still succeeds and that opt-in logs preserve
`discovering → activating → ready` without duplicate heartbeat records, and
checks the initial building generation changes to a committed generation.

At the parent revision, this command failed because the opt-in run produced
no `index.catalog.phase` events:

```sh
node --test tests/semantic/index-catalog-phase-trace.test.mjs
```

After the production observer was connected and the runtime rebuilt, the test
and layer-manifest checks passed 5/5:

```sh
pnpm build
node --test tests/semantic/index-catalog-phase-trace.test.mjs \
  tests/test-layer-manifest.test.mjs
pnpm check
```

The full `pnpm check:fast` run passed 958/958. After a log-field correction,
the focused public test, layer manifest and TypeScript check were rerun and
remained green. Shutdown uses the sidecar `shutdown` protocol rather than
`catalog/cancel`, so no cancellation behavior was changed for this observer.

The [real Settings phase profile](../reports/2026-09-22-settings-catalog-phase-profile.md)
is evidence for the next performance hypothesis, not a semantic or memory
release gate. The flag remains default-off.
