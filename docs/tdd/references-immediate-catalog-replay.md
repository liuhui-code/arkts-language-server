# Immediate-catalog references replay

Parent revision: `da8f7c0`. This slice changes only the benchmark runner and
its protocol fixtures. The production server, index policy, compiler working
set, diagnostics and memory budget are unchanged. The user-owned `AGENTS.md`
edit was not touched.

## RED and environment

The runner previously always awaited catalog completion before `didOpen`, so
its mode A could not replay a real first references click during indexing.
The first attempted public test run was blocked by the macOS sandbox denying
the external `ps` RSS probe; that is **not** counted as a behavior RED. After
running with RSS sampling permission, the new delayed-catalog framed-stdio
fixture verified that the `ready` arm cannot send references before catalog
completion. A second behavioral RED for an immediate query whose catalog
never ends produced `catalogState: complete` rather than the required
`not-observed` classification.
An additional protocol RED found that the report omitted the *requested*
catalog mode even though it recorded the observed catalog outcome; the report
now records both independently.

## GREEN

`--catalog-state ready|immediate` defaults to the old `ready` behavior.
`immediate` still responds to `window/workDoneProgress/create` and observes
progress, but does not wait for the end event before sending `didOpen` and
`textDocument/references`. Reports record the selected mode and distinguish
`complete`, `error`, and `not-observed` catalog outcomes. A catalog observer
that ends because the session closes is not called an indexing failure.

The public child-process test now proves:

- In immediate mode, an exact reference response and normal versioned
  diagnostics arrive before a deliberately delayed catalog end.
- The same fixture in ready mode never sends references before that end.
- A complete exact references response can pass when catalog readiness is
  never observed; the report labels that state `not-observed`.

`node --test tests/references-replay-catalog-state.test.mjs` passed with the
external sampler permitted. The unchanged replay CLI suite passed 10/10 under
the same permission. The [real Settings result](../reports/2026-09-21-settings-immediate-catalog-replay.md)
is a newly reproducible performance failure, not a claim that startup latency
was fixed.
