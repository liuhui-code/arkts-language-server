# References replay private-cache cleanup TDD record

Parent revision: `b6f40ef2d7b8bccdc643a462a6dfe0d54bf04abc`.

During the fixed Photos verifier-SDK comparison, the replay command left a
private SQLite index cache (about 425 MiB for this checkout) after each run.
Ten directories created during this investigation consumed several GiB; a
subsequent report write failed with `ENOSPC`. Saved reports were outside those
temporary directories and remained intact.

RED command:

```bash
node --test tests/references-replay-cli.test.mjs
```

The public CLI test starts a silent LSP child through the real replay command,
isolates `TMPDIR`, and checks its contents after the command records a failed
request. Before the fix it failed because one
`arkts-references-replay-G6A1U9` directory remained (`3/4` passing).

GREEN: `replay()` now owns its private directory through a `finally` around
the whole request, report construction, and report write. The same focused
test passed `4/4`. A successful real Photos replay with an isolated `TMPDIR`
also returned three exact Locations, passed the diagnostic differential, and
left that directory empty. This does not change the LSP server or the
externally sampled request interval.
