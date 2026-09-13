# Cross-project auto-import working-set gate

Date: 2026-09-13. This report validates the default-off discovery-root and pre-resolved-details
pipeline on three additional fixed real ArkTS projects. It is correctness and causal performance
evidence, not a release benchmark distribution.

## Method

Each project stayed on its existing fixed commit. A fresh server and Rust cache were used for each
workspace/discovery profile, and completion was sent only after
`index.catalog.terminal=ready`. Normal automatic diagnostics stayed enabled. The source checkout was
never modified: an in-memory overlay removed one existing real import and shortened one real use to
a completion prefix.

| Project | Commit | Real target | Symbol / UTF-16 position |
|---|---|---|---|
| Gramony | `0a1ee4b026b6736671f0030ba9859aceaa962298` | `ChatDao.ets` | `Chat`, `43:41` |
| ChatCube | `fd729d0f5c607763adc8ce054ad29171c66c78dc` | `MigrationContext.ets` | `PreferencesService`, `5:32` |
| RemoteDesk | `8edc187868e94ed41634e8a6c4c4c072e3a48679` | `TerminalCoreRegistry.ets` | `TerminalCoreBridge`, `22:76` |

For every project, workspace and discovery returned the same completion label/kind/replacement,
the same resolved class detail, the same import insertion and the same diagnostic fingerprint.
Every ready discovery resolve emitted zero compiler Program events.

## Results

| Project | Program files workspace→discovery | Project roots | Completion RSS | Completion time | Product peak | Resolve compiler events |
|---|---:|---:|---:|---:|---:|---:|
| Gramony | 701→690 | 77→13 | 418,521,088→386,351,104 B (-7.69%) | 13.519→16.956 s (+25.43%) | 434,298,880→434,761,728 B (+0.11%) | 1→0 |
| ChatCube | 940→514 | 263→2 | 525,385,728→386,461,696 B (-26.44%) | 21.363→9.752 s (-54.35%) | 544,669,696→432,099,328 B (-20.67%) | 1→0 |
| RemoteDesk | 1,557→259 | 829→2 | 796,422,144→339,283,968 B (-57.40%) | 21.592→5.005 s (-76.82%) | 843,304,960→391,634,944 B (-53.56%) | 1→0 |

The mechanism generalizes for correctness: all three projects preserve exact official completion
and resolve behavior, and none rebuilds a resolve Program. The memory result depends on candidate
width. ChatCube and RemoteDesk each had one ready matching export and two project roots. Gramony's
short `Cha` prefix produced 12 returned pre-resolved items and 13 roots; compiler-followed imports
then left its Program close to the full workspace. Its product peak did not improve and completion
became slower.

This is useful negative evidence. A profile that is safe for a single precise export is not yet a
general low-memory policy for broad prefixes. The next optimization boundary is conservative
candidate ranking/grouping and semantic-unit closure, not resolve and not a smaller arbitrary
result cap. Any narrowing must retain every matching completion and exact import source.

Normalized evidence is committed in
[`evidence/2026-09-13-cross-project-auto-import.json`](evidence/2026-09-13-cross-project-auto-import.json).
The raw report remains `/private/tmp/arkts-cross-auto-import-ab.json`.

## Decision

- Cross-project completion/resolve/diagnostic correctness: GREEN for the three fixed cases.
- Ready resolve without a second compiler Program: GREEN in all cases.
- ChatCube and RemoteDesk working-set reduction: GREEN as causal examples.
- Broad-prefix Gramony memory/latency gate: FAILED.
- Production default: remains `workspace`.
- Next RED: preserve all same-prefix completion identities while avoiding one simultaneous Program
  rooted at every discovered declaration; partition by semantic unit or verify candidates in
  bounded sequential groups.
