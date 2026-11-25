# NAV-FRESH-002: Complete-SDK group queries omitted membership freshness

Status: implemented slice; public regression GREEN. Full performance plan remains IN_PROGRESS.
Worktree `/private/tmp/arkts-repeat-query-20261117`, parent
`1e3886df3c4d27755a53c073462f1456b0a3de7e`; no merge, deployment or user-source changes.
Evidence I = main repository `.bench/repeated-query-proof-plan-20261117/implementation-20261118`.

## Discovery and direct cause

Numeric API24 minimal SDK proves READY. A module contains400 unrelated exported source
files. Main uses an initially absent global class. After a warm typeDefinition returns[],
rewrite Unused350.ts from an export module to a global class, preserving exact size and
mtime but changing ctime. Send no watcher event. Previously the next query succeeded
with stale[]. Both frozen parent main d39a901d and pre-fix candidate b0d57d20 fail the
same public stdio regression. This is a pre-existing correctness defect, not a measured
performance regression introduced by role-facts reuse.

`prepareInitialSemanticContexts` uses whole semantic groups when SDK coverage is complete.
The SDK-partial route installs `ProjectOperationScopes`; its `sameMembership` observes
current whole-project membership. Whole groups have no such owner. Ordinary closure
queries skip readiness catalog preparation when groups exist, while
`DocumentStore.prepare{,DiskSnapshot}` only refreshes an *already invalidated* proof.
`membershipFor` returns cached metadata. Thus unnotified outside-read-set changes were
never discovered and no member proof entered the final request union. An unchanged Host
version/Program did not prove the project namespace was still valid.

Independent host-phase diagnostic confirms full-SDK hot command3 observed only about37
project lstat calls, with zero membership-kind validators; it did not prove strict whole
membership freshness. Those fast full-SDK timing cells remain raw observations, not
correctness-qualified acceptance. Prior SDK-partial fixed-P16 comparisons have independent
membership proofs and are a separate route.

## Implemented boundary

`prepareReadinessCatalog` now asks the existing DocumentStore owner to validate membership
when semantic groups exist without projected operation scopes. Both open and disk input
routes call it before capturing the query snapshot. Projected scopes keep their original
admission/recovery order and do not gain another physical scan.

`validateCachedMembershipBeforeCapture` in project-membership-access performs the existing
original `CompleteMembershipProof.current`, which registers its original owner/revision
with the preparation-to-query final union. A newly discovered change rejects that request
with-32803; it does not authorize old inputs using a replacement proof. An already revoked
proof is reconciled on the next request before its replacement proof is registered.
Independent final physical membership/configuration/source guards remain. No watcher-only
contract, result truncation, SDK downgrade, timeout change or unconditional Program rebuild.
Missing/non-native proof adapters retain existing conservative paths; cache-eviction and
broader full-check cases remain required acceptance, not proven by this slice alone.

The store delegates the cohesive membership admission to its existing access module;
DocumentStore is1520 lines, equal to parent1520 and still migration debt. New/other edited
files are below500 lines. Existing overlay-map extraction remains in this change.

## TDD and evidence

- `full-sdk-unnotified-global-characterization.log`: candidate public RED, stale[].
- `full-sdk-unnotified-global-parent-main.log`: frozen parent public RED, same result.
- `full-sdk-final-race-red.log`: controlled filesystem mutation at actual final boundary;
  both source-change and new-file cases failed-32803 expectations on b0d57d20. Fault
  injection proves this boundary, not a naturally reproduced editor timing window.
- `full-sdk-member-fence-expanded01.log`:68PASS/1FAIL. Unconditional early reconciliation
  made partial queries silently accept changed inputs. Rejected approach, assertion kept.
- `full-sdk-member-fence-expanded02.log`: final created-race recovery failure after applying
  the guard to all routes. Rejected approach; partial lifecycle left unchanged instead.
- `full-sdk-member-fence-expanded03.log`: full-group final-race retry needed an extra rejection
  because early refresh rejected an already-revoked generation twice. Corrected ownership
  and retry order rather than adding retries/loosening tests.
- `full-sdk-member-fence-expanded04.log`:71/71PASS, zero skips/cancellations.
- `full-sdk-member-fence-final-expanded.log`:82/82PASS, zero skips/cancellations; includes
  disk/open current-change detection, final source/created races and same-session recovery,
  projected final SDK/directory/source races, exact declaration positions, one Worker,
  overlay delta, source-origin and retained dependency-node regression.

Every behavior uses a real stdio child LSP; assertions verify exact destinations and no
stale successful response. Final-race fixture changes real private input files after the
compiler result is computed and before the actual final validators, leaving all production
fences present. Original failure logs are preserved.

Frozen candidate Worker `0a8898a0791a592168d50e0f4640fc3b2c618b5b71241258f799f64d7f6db321`,
I/runtime-m4-full-sdk-member-fence and its identity JSON contain source/runtime hashes.
Native remains800e6628, Node20.19.5, compiler4.9.5-r10. No Rust change/build.

## Performance and remaining work

Do not use the previous READY128/2048/8192 hot timings as the speed of a correct strict
freshness path. Re-measure the frozen corrected candidate serially, separately from tests,
with unchanged input/SDK/query and report the extra necessary current/final work. Parent
comparison must disclose the missing check, rather than call it an optimization regression.
No timing improvement is claimed by this correctness slice.

Full check:fast, cache absence/eviction and broader recovery, actual Photos latest-candidate
cold/hot, effective-dependency/fanout/depth/size controls, M4 reverse influence/M5 and
Windows/UI/endurance remain open. Original Photos SDKpartial complete references/rename
limits are not resolved by this minimal numericAPI24 fixture.
