# L01 experimental L3 multi-batch admission guard

Date: 2026-10-07. Parent revision: `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`.
This changes only the existing double-gated benchmark experiment
(`ARKTS_BENCHMARK_CONTROL=1` and `ARKTS_L01_PRESSURE_ADMISSION=1`). The
worktree already contained uncommitted L01 work; no reset was used.

## Public RED and minimal GREEN

`node --test tests/semantic/semantic-l3-reference-admission.test.mjs`
starts a real Content-Length LSP child with automatic diagnostics. Its new
three-source fixture uses a 1 MiB *test stimulus* so the observed process RSS
latches L3, then plans conservative references with one root per batch. Before
the guard, it returned a complete two-Location array instead of refusing a
multi-batch search under that artificial budget. The RED run had 1 pass and
1 failure: `a rejected plan must not return Locations` received those two
locations. This was not a false reference result; the test deliberately asks
for an admission refusal before expensive verifier work.

The minimal change lets the L3-only route pass a one-batch admission limit to
the existing planner. After `references.plan.complete`, a plan exceeding that
limit returns typed `resource-budget-exceeded` **before** resident disposal or
any verifier batch. The limit propagates through all executor re-plans. The
proxy does not retry that typed resource failure through an anchor-seed
fallback. LSP reports `RequestFailed` (`-32803`) with a distinct memory-budget
message, never a partial Location array. The existing one-batch exact LSP
fixture stays unchanged, including its unsaved overlay and normal diagnostics.

After `pnpm build`, the same public test passed 2/2. This is an experimental
fail-closed boundary for the observed 24-batch/180-second L3 failure, **not**
a hard RSS bound: one batch can still exceed the soft budget, and an early
whole-scope proof could make a multi-batch plan cheaper than predicted. No
Settings performance or product graduation is claimed by this fixture.

The broader concurrent regression run completed 30 tests successfully but
hit the existing 30-second deadline in one cancellation/batching test while a
large constructor matrix occupied the host; it was interrupted before the
remaining anchor tests completed. The timed-out cancellation case passed in
isolation (32.6 seconds). Do not report the concurrent run as a green full
gate. `pnpm check` passed; `pnpm check:fast` was not completed in this slice.

The matched-build Settings strategy comparison is in
[the A/B report](../reports/2026-10-07-resident-l01-matched-strategy-ab.md).
The subsequent [pinned real Settings/API24 replay](../reports/2026-10-07-resident-l01-pressure-guard-settings.md)
returned four exact results and two explicit `-32803` L3 refusals in 84.5
and 96.9 ms before verifier work. The six-request suite therefore remained
FAIL; L01 resource admission remains BLOCKED and L02 remains unadmitted.
