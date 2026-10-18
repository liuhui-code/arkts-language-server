# Generated reports

This directory owns machine-readable spike and benchmark reports referenced by
the official semantic-backend execution plan. Reports must record their exact
backend revision, SDK digest, command, and environment identity. Do not commit
upstream checkouts, caches, or unbounded raw logs here.

## Query performance comparisons

- [OP04 warm-overlay reference comparison (2026-10-13)](2026-10-13-op04-warm-overlay-reference-comparison.md)
  — same-build trace-off Settings/API24 OFF/ON and reverse controls:24 exact
  requests,16 full diagnostics. Edited references5.56–5.97s→2.12–2.25s;
  observed peak RSS decreases but idle RSS rises. The explicit experiment stays
  default-off. Subsequent400 edits/416 exact requests/408 diagnostics do not
  sustain that gain; the original RSS clock-order failure is retained. A separate
  bounded trace witnesses L2/L3 loss of warm eligibility; future monotonic RSS
  capture passes public regressions. Adoption, resource/recovery calibration,
  fresh whole and L08 remain open.
- [OP02 request-local input hash reuse comparison (2026-10-12)](2026-10-12-op02-input-hash-reuse-comparison.md)
  — frozen source `3d6cc93f…`; six diagnostic owner/twelve normal LSP sessions,
  90 exact requests. Native hash calls1031→255, fresh disk guards unchanged;
  timing improves in five of six new-target pairs but RSS has no consistent gain.
  Raw DEGRADED/FAIL and original measurement identity are preserved. Pure-hash
  slice adoption closed on2026-10-15 with current direct SDK/nested-overlay guards
  and84 related passes; module/directory combination and new tool-head whole remain open.
- [OP01 resident-first routing comparison (2026-10-12)](2026-10-12-op01-resident-first-comparison.md)
  — current source `7816d51d…`; 12 timing/four independent trace sessions, 80 exact
  requests. Five of six new-target pairs improve, one reverses; edited queries
  remain seconds and RSS has no consistent gain. Raw readiness remains DEGRADED/FAIL;
  routing-slice adoption closed on2026-10-15 after unchanged protection files and
  frozen production1757/1757 were audited. New tool-head whole and final L08 remain separate.

## Archived research

- [ArkTS query-performance deep research (2026-10-11)](2026-10-11-arkts-query-performance-deep-research.md)
  — user-provided `deep-research-report.md`; content preserved, with only a final
  newline added. The code findings and future work are reviewed in the
  [query-performance follow-up plan](../plans/2026-10-11-query-performance-follow-up-plan.md).
  Illustrative figures remain examples; the archive does not supersede existing
  ADRs or the agreed L08 550 ms acceptance threshold.
