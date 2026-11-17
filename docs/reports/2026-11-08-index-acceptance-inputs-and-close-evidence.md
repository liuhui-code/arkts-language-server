# Acceptance input and shutdown evidence audit

Date:2026-11-08. Scope: test drivers only. Product candidate and its ongoing whole check are unchanged. No deployment/merge/publication.

## IDX-V1-OBS-007: omitted static30K target input

Generation09 copied source scripts and baseline identity but omitted `harness/catalog.json`, consumed by the original mixed runner. This was found while the controller was still WAITING with zero load; it is not an observed two-hour run failure. The target generator was executed against the preserved original isolated Photos input through a read-only source symlink; outputs were written only in a new evidence directory. Generated catalog exactly matches generation08 and all30060 file hashes match the preserved input manifest. Sources30000,173645330 bytes,44 target symbols. Catalog SHA256 `609fb35cf928d43ff09e4b7ba64cbf84eead31283f65f570c2191e0b053eb7e0`.

Evidence `.bench/index-versioned-maintenance-20261104/soak-input-audit-20261108/receipt.json`, generator outputs and source manifest. Generation09 catalog was supplied before load, with a separate hash receipt and no script edits. The later lifetime audit stopped generation09 before load as well.

Generation10 contains the catalog and pins its bytes plus `baseline-identity.json` at controller startup, before waiting on the product gate. Missing, symlinked, malformed or incomplete required inputs stop before any runtime copy/load. `qualified.json` is intentionally not copied: this candidate's calibration must regenerate qualifications. A real controller child-process test proves missing catalog produces STOPPED_FOR_DIAGNOSIS with no runs/runtime/fixture directory. Three input-helper tests cover pinning and negative cases. Pin verification repeats immediately after the full gate, alongside driver code hashes.

## IDX-V1-OBS-008: cleanup is not proof of normal shutdown

The old client used its existing3s shutdown-response/5s exit/300ms escalation observation windows but returned only the observed code/signal. It did not record protective interventions. Some wrappers recorded close/restore errors without changing COMPLETED, and all wrappers could accept processes as CLOSED after `Resources.cleanup` had terminated leftovers. Consequently zero exit code plus post-cleanup absence/DB integrity could hide a lifetime failure. This is a test-certification gap, not evidence that the product currently has such a shutdown defect.

A real framed child fixture acknowledges shutdown, deliberately ignores LSP exit, then handles protective SIGTERM by exiting0. Old close returned code0 and lacked intervention/ack evidence (RED). The fixture proves why exit0 alone is insufficient; no product failure is injected or inferred.

The revised client retains shutdown terminal evidence, whether actual process exit was observed, and every close protection signal/reason. Existing observation windows and signal behavior are unchanged. Common `closureEvidence` requires all of:

- observed exit0 with no signal;
- a successful framed shutdown result;
- zero client-close interventions;
- zero recorded owned-process cleanup interventions and readable cleanup evidence.

Generated scale, persisted-save, density and original Photos mixed sessions all apply this same policy after protective cleanup and DB postflight, so evidence is retained even on failure. Mixed runner restore/close exceptions set FAILED. Protection remains enabled; successful cleanup cannot convert a failed lifetime into functional success.

Known baseline capacity refusals remain FAIL, with later operations UNMEASURED. The narrowly scoped comparison-continuation policy also requires the new normal-closure evidence and refuses protected code0 exits, unacknowledged shutdown, missing/inconsistent closure receipts or cleanup interventions. This prevents a known query refusal from authorizing continuation after an unrelated lifecycle failure.

This concerns the existing test-side deadline, not the language server's request deadlines, Worker supervision, V8 limits, memory policy or the500ms experience target. No product source changed for OBS-007/008; no new ADR decision is needed. It enforces the evidence distinction already required by ADR0043's lifetime/validation contract.

## Tests and current scope

Generation10:21 Python controls PASS,32 Node controls PASS,2 driver-path controls PASS. Actual framed close fixtures and missing-input controller execution are included. Test logs and source hashes: `.bench/index-versioned-maintenance-20261104/final-acceptance-10/driver-validation-receipt.json` and adjacent RED/GREEN logs.

Preserved non-green evidence:

- initial full driver controls30/32: sandbox ps EPERM and absent formal SOAK environment; same assertions pass32/32 with approved sampling and the recorded formal environment;
- one patch-script indentation error prevented applying the intended protocol update; resulting test failure is retained as `close-evidence-patch-script-failure.log`, not called GREEN;
- original close metadata2FAIL; closure/input helper module-missing RED; baseline positive new-evidence compatibility RED before strict policy update.

Product checkfast is still running on frozen2384 inputs. Fresh Rust416PASS/1existing ignored, release/style and all three supplements passed earlier. Generation10 main and density controllers wait for full gate/main acceptance respectively. No scale matrix, formal2h or UI completion follows from these driver controls.

The prior repaired20K/30K diagnostic retains its symbol/write/input/integrity observations and reported process exits. It predates this explicit protection metadata contract and is not relabeled a pass of the new strict closure contract. Generation10 reruns persisted calibration and scale before any original30K long session. Raw earlier receipts remain unchanged.
