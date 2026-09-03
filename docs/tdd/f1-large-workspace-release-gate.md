# F1 pinned large-workspace release gate: TDD evidence

- Fixture: `netease-kit/nim-uikit-harmony`
- Pinned revision: `585feb45114a128a0d2a23947c83faf338e758f7`
- Expected ArkTS/TypeScript sources: 455
- Public boundary: release LSP process over framed stdio, backed by the release
  index sidecar

## RED: incomplete catalog was previously accepted

```text
ARKTS_LARGE_FIXTURE=... node --test tests/release/large-workspace.acceptance.mjs
```

At parent revision `5c7e964`, the catalog ended `degraded`: 455 files were
discovered, only 448 were indexed, and 7 were rejected. The rejected sources
contained regular-expression literals whose brackets and parentheses were
incorrectly counted as ArkTS syntax delimiters.

The corresponding direct-sidecar gate was also strengthened so absence of the
pinned fixture is a failure, not a silent skip, and only `ready` with 455/455
indexed and zero rejected files is accepted.

## GREEN: complete catalog, deterministic jumps, and warm latency

The lexer now skips JavaScript/ArkTS regular-expression literals while retaining
division, comments, postfix assertions, and ordinary punctuation. The release
LSP gate verifies:

- a truthful `Indexed 455/455 files` terminal;
- exact class and method definitions, ranges, kinds, and duplicate locations;
- exact-name definitions rank before fuzzy workspace-symbol matches;
- a first warm-cache query below 400 ms;
- 30 repeated warm queries with P95 below 100 ms.

Observed on the GREEN run: cold catalog 314.68 ms, warm first query 3.52 ms,
and repeated-query P95 3.25 ms.
