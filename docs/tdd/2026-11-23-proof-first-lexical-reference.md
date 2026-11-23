# Proof-first lexical reference verification

Status: implementation in isolated worktree, final qualification pending.
Base: `1e3886df3c4d27755a53c073462f1456b0a3de7e` plus inherited W5 changes;
not a clean-main or committed release. Worktree:
`/private/tmp/arkts-lexical-reference-probe-20261123`.
Evidence: `.bench/hot-query-20261122` (all earlier failures retained).

- RED90: real child framed-stdio LSP, default batching, 100-file SDK-partial
  fixture, exact three references succeed but no bounded lexical proof attempt.
  Command: Node20 `--test --test-name-pattern='default batching proves'
  tests/semantic/references-query-cache-proof.test.mjs`.
- GREEN92: same command and oracle, actual one-root verifier proof before
  unrelated batches; selected four tests are name-filter skips, not full coverage.
- focused94: original complete file5/5 PASS, zero skipped. Silent bytes/config
  invalidation, declaration policy, exact Locations and repeated actual cache
  hits preserved; shorthand proof refusal and cross-file-class fallback tested.
- RED98: same public cancellation/overlay transcript against frozen W5 server;
  no lexical attempt reached, bounded failure. This establishes branch coverage
  difference, not a pre-existing client-cancellation failure.
- RED99: invalid function-body `export let` returned exact Locations but wrongly
  produced lexical qualification. Compiler parser emits no parse diagnostics.
  Rejecting modified local variable statements fixes eligibility, not a proven
  wrong-location incident. GREEN100 passed unchanged result/refusal oracles.
- Alias control101 passed before any alias-specific implementation: existing
  producer already refuses that input. Its historical filename contains `red`;
  do not report it as a reproduced alias defect or add speculative alias code.
- focused95 is developmental, not frozen final acceptance: source/test additions
  and one runtime rebuild occurred during the serial suite. Later final frozen
  regressions/full check must replace it as candidate certification.

Implementation keeps1024 soft batch roots, SDK/full dependency policy, disk
and final freshness, cancellation and existing verifier budgets. A syntax hint
can only trigger one attempt; actual lexical proof and coverage must agree.
Unproved attempt Locations are discarded before conservative fallback. No new
product memory/deadline/scale policy. Finite lexical coverage does not certify
arbitrary class/property/import/rename coverage or globally READY SDK state.

Final qualification must include the new cancellation/overlay transcript,
actual default-policy Photos local references and repeated result-cache hits,
then frozen `pnpm check:fast`. Original Photos45s failure and limited Native
index qualification remain preserved, not relabelled as successes.


Continuation: focused95 ended96/96 PASS but mixed development identity is not
final certification. Type102 PASS; combined102/104 exposed the test-manifest's
expected379 entries/198 bundle entries after adding one public test. Registry
expectations are now380/199 and explicitly include the lifetime test;
manifest1064PASS, combined10712PASS, zero skips/cancellations. Both failed
registration records remain. Photos103/105 ran zero queries because their
prerequisites refused; those are not product Photos failures. Default-policy
Photos108 is now executing, frozen final109 captures1068 inputs and waits for
Photos completion before focused110 and actual full111. No further source or
runtime mutation is permitted under that freeze; docs remain updateable.


W7: public property-access counterexample118 proved an extra doomed probe;
permanent role tests121:1positivePASS/2negativeFAIL. Full111 intentionally
stopped/superseded (not product failure); exact frozen source/runtime119 kept,
owned11process closure audit126. Type122 blocked build;124 used prior runtime
and remained2FAIL, so is not a candidate GREEN. Corrected type/build125 and
combined12517/17PASS zero skips. New controls include both property roles,
positive object binding, actual cancellation/stale/fresh cache, invalid export,
and computed-key/Symbol escape parity with old complete-Program control120.
Current freeze134, Photos126, focused135/full136, scale137, overlay138 pending.
No source changes permitted under134; driver-only date errors archived133,
idle127stopped before checks and replaced without modifying the candidate.


Final W7: focused135120PASS and actual full1362801PASS,0fail/skip/cancel/todo.
Extra all-dist134 guardFAILED on a stale copied sdk-discovery-driver test fixture
rebuilt by tests/sdk-discovery.test.mjs:12–21. Sole byte change is the already
frozen modifier guard; independent originalSDK12tests rebuild same d39fa831
hash. Source1068, four production bundles/stdlib/Native unchanged; explicit
adjudication145, original failure not rewritten. No product/test changes.
Scale1469PASS/72exactqueries/27hits, actualprojectProgram16 each; Photos126
3PASS/12queries/9hits, actualProgram87project+282SDK+113other. Overlay147 one
8-querysession PASS3→4→3, twohits; lifecycle first4.6–4.8s still slow. Full
input inventory149 and selectedSDK hashes unchanged, process close/SQL pass.
Archive148 all frozen inputs/runtime/native and task patch24files max472lines
preserved; apply-check inheritedQ4PASS, not a clean-main patch. Final report
2026-11-23 records all numbers, state boundaries and unclosed performance/UI/
Windows/endurance/global-query limits. No merge or deployment.
