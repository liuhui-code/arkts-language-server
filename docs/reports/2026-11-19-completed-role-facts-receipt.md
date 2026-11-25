# Completed role-facts receipt (M1/M4 continuation)

2026-11-19. Approved A-plan implementation slice, not overall acceptance.
Parent main1e3886df; isolated worktree `/private/tmp/arkts-repeat-query-20261117`.
Frozen Worker `be97cff21fa6137d41eaedd8be09a11f050b4769c0ee6165e1d454d58ebe3178`.
Node20.19.5/x64; unchanged Native800e6628. E means main repository
`.bench/repeated-query-proof-plan-20261117/implementation-20261118`.

## Verified producer semantics

`refreshMembershipSnapshot` in core/workspace/project-membership-refresh.ts compares
both ordered paths/status and every disk admission identity. A changed identity
advances the catalog revision even with unchanged names. `scanProjectMembership`
only reuses the previous native entry after its complete proof succeeds; that proof
independently reads all file identities and directory/configuration guards.
`publicProjectMembership` returns a frozen projection, but a number alone is not
sufficient authority: replacement objects can have the same numeric revision.

The scope nevertheless polled every token and overlay, constructed full temporary
maps/sets and compared source fact keys on every unchanged query. Public RED:
400 repeated role token lookups versus expected0. This was not symbol lookup cost.

## Change and invariants

`project-membership-access.ts` privately records its immutable projections in a
WeakSet. This proves producer/immutability, **never current filesystem validity**.
Foreign/frozen clones are not promoted; the set retains no history strongly.

`ProjectOperationScopes.ensure` first performs the original current complete-member
and configuration checks. It can skip only its completed syntax-facts pass when:

- the actual current Store catalog is the exact owned projection that covered the
  successful previous pass, not merely equal revision;
- ordered view paths, aliases, resolution generation and Store overlay lifecycle
  still match, without pending role dirtiness;
- any new pass revokes the old completion receipt before writes;
- the final current member check still succeeds, the actual producer remains the
  same object across the pass, generation is unchanged and overlay capture current.

The old loop was extracted into updateFacts, not removed. Unknown producers and
missing/stale receipts take that loop. Dependency lookup proofs/graph.update still
run; actual compiler source versions and the independent final member/configuration/
directory/overlay fences remain. This does not certify READY or a cached result.
Only one current receipt is retained; no second input database or AST/text cache.

## TDD and tests

- `m4-completed-facts-red.log`: public repeated query still polls400 tokens.
- Characterization records: frozen unowned clones retain400; an unnotified global
  declaration with the same byte size/mtime must reject old inputs (-32803), then
  return the precise new class in the same session. The first timestamp setup lost
  sub-millisecond precision through Date; the fixture was fixed to start with an
  exact integer timestamp, not a relaxed assertion.
- `m4-completed-facts-green.log`: **10/10 PASS**, zero skip/cancel. Owned unchanged
  inputs poll0, unowned frozen clones400. Each normal repeated query still has2000
  noise-file leaf observations and1 final Native member pass, with no source reads.
- TSC/build passed. The independent observer calibration1/1 passed: initial actual
  updateFacts is observed, hot updateFacts absent, exact results and final pass remain.

Source changes: core/workspace/project-membership-access.ts and
core/types/project-operation-scopes.ts. No Rust/configuration/deadline/RSS change.
Final expanded `m4-completed-facts-expanded.log`: **70/70 PASS**, zero skip/cancel,
including original namespace/SDK/identity/final races and both cancellation cases.
Paired ordinary30K timing has completed. The same closed warm56 Native cache,
original Photos30K input and SDK were used serially, with process-cold sessions.
This is NOT a fresh cold index, real Zed UI or endurance result.

| Ordinary runtime | Initialization ms | First definition ms | Three hot definitions ms |
| --- | ---: | ---: | --- |
| Node/topology control `2c00fff5` | 71022 | 5370.29 | 2742.73 / 2727.35 / 2752.78 |
| Completed facts `be97cff2` | 70682 | 5425.65 | 2404.27 / 2404.91 / 2399.30 |

Observed hot median decreased2742.73→2404.27ms (~12.3%) in this one
session/version comparison; first and initialization did not materially improve.
Exact queries and owned process closure passed in both sessions, but the control
run is an overall FAIL: data DB integrity inspection exceeded the existing60s
postflight observation deadline (ETIMEDOUT; no corruption conclusion). Candidate
SQLite postflight passed. The SDK remains partial; these exact definition checks
do not prove complete references/rename availability.

The independent instrumented candidate took89040ms initialization,6144.09ms first
and hot3203.28/3584.54/3388.22ms. These disturbed measurements are separate from
ordinary timing and cannot be attributed as fixed product cost. Its SQLite and
owned-process postflights passed. Original per-run statuses are retained in
`m4-completed-facts-series.json`; no three-run all-PASS claim is made.
Reproducer/controller and identities are E/m4-completed-facts-* and
runtime-m4-completed-facts-identity.json.

Rollback the completed receipt gate and keep updateFacts unconditional; producer
branding can independently remain inert. This slice does not finish true delta
dispatch/reverse effects, M5, scale/edit matrix, full check or UI/endurance.
