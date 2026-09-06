# G1b diagnostic lifecycle regression gate

Date: 2026-09-03

Parent revision at slice start: `0ecc33798e7cf69a795c670522bf6ffbdb395b39`

## Scope

This slice adds a deterministic, real-process regression gate for the push
diagnostic lifecycle:

- a rapid version 1 to version 2 change may publish only version 2;
- closing a document cancels a pending version 3 diagnostic and publishes one
  unversioned empty diagnostic set;
- neither superseded version may be published after the close.

It does not change diagnostic scheduling, semantic behavior, protocol
capabilities, or the test-layer manifest.

## Characterization result

Command:

```text
node --test tests/semantic/diagnostic-code-characterization.test.mjs
```

The new lifecycle transcript was GREEN on its first run (`3/3` for the complete
file, `0` failed, `0` skipped). This is intentionally recorded as
characterization coverage, not as a defect-fix RED/GREEN claim.

The production behavior was already introduced by revision `a0a7e74`:

- each URI has a replaceable `AbortController` and debounce task;
- a newer update cancels and removes the older task;
- publication checks task identity, the live document version, and the
  semantic result version;
- close cancels the pending task and sends an empty diagnostic set.

Because the requested contract already held, no production change was made and
no artificial failure was manufactured.

## Deterministic transcript

The test launches the real bundled `dist/server.cjs --stdio` server with
`publishDiagnostics.versionSupport`, then sends events without sleeps:

```text
didOpen v1 (misspelled)
  -> didChange v2 (correct)
  -> observe publishDiagnostics v2 []
  -> didChange v3 (misspelled)
  -> didClose
  -> observe publishDiagnostics without version []
  -> graceful shutdown/exit barrier
  -> both v1 and v3 notification waiters reject on process exit
```

The process-exit barrier proves that no obsolete publication remained queued;
it replaces the fixed-delay negative assertions used by the older lifecycle
tests. The version 3 phase specifically exercises close while a diagnostic is
pending.

## Exit criteria

- Real `Content-Length` stdio transport is used.
- The current version publishes before close.
- Close produces an unversioned empty diagnostic set.
- Superseded and close-cancelled versions never publish.
- There are no sleeps or timing-window assertions.
- Existing production code and manifest remain unchanged.

Final verification:

```text
pnpm build
node --test tests/semantic/diagnostic-code-characterization.test.mjs
pnpm check
```

Results: the bundle built successfully; the complete characterization file
passed `3/3` with `0` failures and `0` skips; TypeScript checking passed.
