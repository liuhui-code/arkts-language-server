# 2026-11-02 authorized IDE follow-up

## Current status and scope

**Published index correction complete CI PASS at b129; resource work continued
in the separate continuous-review report.**
At01:04UTC the user authorized correcting two additional
findings and appending their evidence to draft PR112. This is a new bounded
follow-up, not a retroactive fifth round or rewrite of the completed second group.
Baseline commit: `a11cdbc87b5223aae806f79d624b180df8f9d3c4`;
published tree: `2dabd229a2d3ff0e2b23303085deb3548a574c00`. Existing group1/group2 failures and approval histories
remain in their reports and the single Feature Ledger.

Published-head [CI41368012421](https://github.com/liuhui-code/arkts-language-server/actions/runs/41368012421)
is now terminal SUCCESS (01:24UTC; fast2267/2267 and release/E2E/Windows checks).
Its results do not automatically qualify
unpublished follow-up changes. No merge, product graduation or new Accepted ADR.

## 1. Malformed successful index responses — local slice verified

A malformed `ok:true` search response raised a generic error while leaving the
bad sidecar session ready. The corrected mapper raises SidecarProtocolError,
triggering the existing fail-closed session degradation. A genuine business busy
response remains nonfatal; explicit close/open restores a healthy session.
This enforces the existing architecture contract: malformed protocol degrades
only that session and preserves the last committed generation.

Mapping: R-07/R-08 index trust/recovery and R-34 qualification;
[ADR0005](../adr/0005-index-proof-trust-boundary.md) and
[ADR0013](../adr/0013-evidence-and-release-gates.md). ADR0034's catalog atomic
publication is unchanged. No new recovery budget, retries or storage design.

Evidence lives locally in `../iteration-evidence/batch3-index-fix/`, not at a
published artifact URL:

- Existing characterization20/20 passed before extraction.
- New public-contract RED1/2 became GREEN2/2.
- Extracted combined coverage22/22 and Node20 typecheck passed.
- Manifest RED3/4 became GREEN4/4 with the new entry registered.
- Independent review26/26, exit0, no skips, is clean
  (`independent-review.log`). This is scoped verification, not a complete gate.
- Seven-file candidate relative to the published baseline is retained in
  `candidate-relative-a11.patch` and accompanying source hashes.

Cohesive mapper/harness extraction reduces existing source1168→1066 and old
test856→761 lines; those files remain explicit over-limit migration debt.

## 2. Semantic owner/revision churn — OPEN, design/acceptance gate

Healthy controlled observations create four contexts in each of three runs.
An unsafe fresh-view counterfactual reduces that to two but passes only16/19
cases, allowing three wrong successes; it is **REJECTED**. Reordering alone
passes17/19: source-error rejection remains, but two cases retire an owner when
the original contract expects it retained (2 versus1). That alternative is also
**REJECTED**. Neither favorable context count is a validated optimization.

A revision-advance-only trial passes19/19 but does not prove mutations during
the advance window safe, so it is **NOT ACCEPTED as a fix**. Exact refreshed-view
observation shows256 documents while omitting the original ZZModel dependency;
that view cannot simply replace the original captured input set. These findings
leave the resource issue OPEN behind a design/acceptance gate, with **no resource
production changes integrated**.

Evidence is under `../iteration-evidence/batch3-resource-review/`, including
`DESIGN-GATE.md` and the refresh-observation receipts. Before adoption, a candidate
must preserve original dependency/input scope, late-mutation rejection, original
LS-retention controls and SDK/namespace recovery through the actual advance
window. Passing existing19 cases alone is insufficient. Context4→2 counters are
limited observations, not general performance, memory or workload improvement.
The existing public assertions, source-recovery and SDK-denial controls remain;
no weakening to make owner counts look better is authorized.

Mapping: R-20/R-22/R-26/R-30/R-31; ADR0019 owner/input reuse and ADR0035 content
clocks versus document authority. ADR0025/0036 retire-first/source recovery and
ADR0038 load-owned SDK facts remain constraints. Keeping an old snapshot or
skipping its admission proof cannot be justified by a lower context count.

## Integration, validation and policy limits

The index slice's final Node20 typecheck/build and ten complete files have
terminated **123/123 PASS**, exit0, zero failed/skipped/cancelled/todo,
56958.721ms. All1403/1403 frozen inputs match. Local evidence under
`../iteration-evidence/batch3-integration/`: `focused.log`, `focused-exit.json`
and `frozen-inputs-verified.log`. This is scoped verification, not a full-suite
pass. Published a11 CI is now SUCCESS, allowing authorized follow-up publication;
fresh CI for the follow-up head remains pending. The resource
issue remains explicitly OPEN/design-gated rather than blocking publication
behind an unproven optimization. The scoped combined PASS does not imply full acceptance; no resource
ADR policy change or completed resource fix is claimed. The user was informed
of this boundary at01:17:17UTC. Published a11 CI and future
follow-up CI must be reported against their own exact heads.

ADR0007's 500ms experience target and ADR0029's null default RSS budget remain.
No performance percentage, memory reduction, complete30K scope, installed-SDK/UI,
Windows network-share or endurance qualification follows from these fixtures.
Previously failed full gates stay failed; no ADR status promotion is inferred.

## 2026-11-02 01:24 UTC — published a11 CI terminal PASS

[Run41368012421](https://github.com/liuhui-code/arkts-language-server/actions/runs/41368012421)
completed SUCCESS for exact published head
`a11cdbc87b5223aae806f79d624b180df8f9d3c4`, base `b57ad075`, with validation
checkouts on merge commit `a175ae2314973689a22fb6b029ecb025b2759305`.
Complete fast2267/2267, artifact E2E7/7 and large E2E1/1 pass with zero
failures/skips/cancellations. Rust records224 passing tests plus one explicitly
executed initially ignored fixture (225 executions). Zed query tests2/2 and
four SCM query validations, WASM release, Windows install/reinstall and framed
LSP smoke pass. Raw local receipts:
`/workspace/shared/pr112-batch2-ci-evidence/validate.log` and `windows-install.log`.

This closes the published second-group CI gate, not a real editor UI/native
Windows network-share or general resource qualification. Earlier full2260/2264
and CI2233/2234 failures remain historical failures; the original startup timeout
is still unexplained/non-reproduced, not retroactively assigned a cause.
The separately authorized unpublished index follow-up has scoped123/123 PASS;
it requires fresh CI on its own future head and cannot inherit this full PASS.

## 2026-11-02 published b129 CI terminal SUCCESS

[Run41372738816](https://github.com/liuhui-code/arkts-language-server/actions/runs/41372738816)
completed SUCCESS for exact head `b129d3e04e71a6b5fd68293d9153f6264d309c7e`:
fast2269/2269, artifact E2E7/7, large E2E1/1, Rust224 plus one explicitly
executed initially ignored fixture, query2/2/four SCM validations, WASM release
and Windows install/reinstall/LSP smoke PASS. This qualifies that published
index correction, not the newer native/resource candidates. Original earlier
FAIL receipts remain; no real UI/native network-share/endurance claim follows.
