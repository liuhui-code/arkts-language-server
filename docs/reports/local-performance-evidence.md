# Local performance evidence and public review scope

This PR publishes optimization code, synthetic regression tests, ADRs, TDD records,
sanitized reports and a [numeric summary](evidence/stable-program-public/summary.json).
The summary retains all three timing samples, medians, maxima and measured Program scopes
for the seven scaling levels and two compared versions. It contains no project source,
query payload, edit body, protocol response, private path or raw archive.

Original reports, full raw runs, fixtures, snapshots, per-operation payloads and sealed
archives remain byte-preserved in the original local workspace and its original local
optimization branch. They are excluded from this public branch, including its ancestry.
Raw-evidence links in these review copies lead here to avoid implying public availability.
The accompanying analysis script needs those local inputs; this public numeric summary
does not replace inspection of the original protocol transcripts.

The original raw-evidence push was rejected by automatic approval review because it could
publish internal real-project data. This public subset removes that payload while retaining
the already-authorized code/PR merge workflow. No original local evidence was deleted.

Known limits remain: 9 of 546 latest normal operations exceed 500ms; scaling costs are
not resolved; initialization was degraded 2307; READY, larger-scale dependency growth and
long-running soak remain unqualified. Windows results are separate from Mac results.
