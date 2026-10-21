# Local performance evidence and public review scope

This PR publishes optimization code, synthetic regression tests, ADRs, TDD records,
sanitized reports and a [numeric summary](evidence/stable-program-public/summary.json).
That checkpoint-23 summary retains all three timing samples, medians, maxima and measured
Program scopes for the seven scaling levels and two compared versions. It contains no project source,
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

The subsequent Mac 2048/20000-file incremental-input comparison is documented in the
[2026-10-21 report](2026-10-21-incremental-input-optimization.md) and its
[public numeric evidence](evidence/2026-10-21-incremental-input-public/summary.json).
The two preceding 20000-file reports are public review copies under the same policy.
Original raw files, archive hashes and per-operation transcripts remain in the local
workspace; public summaries are not substitutes for those source records. All local
work was committed before preparing this isolated public branch. Private local commits
and their raw-data ancestry are not included in the published branch.

Known limits remain: checkpoint-23 had 9 of 546 normal operations above 500ms; the newer
candidate still has slow rename/references and a 510ms reopen completion. Scale growth
costs are unresolved; scale-test initialization was degraded 2307; READY, larger shared
dependencies and long-running soak remain unqualified. The existing unnotified ambient
edit correctness gap is documented, not fixed by this change. Windows results remain
separate from Mac results. Full checks for this merge candidate are recorded in the PR
and CI independently from the historical local qualification.

The merge also includes focused cross-platform correctness fixes recorded in the three
2026-10-21 recovery TDD documents. The numeric performance evidence predates those fixes;
its timings are not presented as a rerun of the final merge candidate. The initial PR's
Linux failure and the interrupted local run remain retained alongside the subsequent
qualification records; only the final candidate's complete PR/CI checks qualify the merge.
