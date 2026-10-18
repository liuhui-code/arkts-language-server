# ADR 0016: Retain the current SDK syntax trees in one reference verifier Worker

- Status: Accepted by explicit maintainer instruction on 2026-10-18; implemented and verified (Node 20, `pnpm check:fast`: 1,869/1,869 PASS).
- Follow-up: [ADR 0018](0018-semantic-groups-and-initial-preparation.md) authorizes initialization-time SDK preparation and retained project contexts. Its explicit lifecycle replaces mandatory per-job disposal for migrated retained contexts; unmigrated complete fallback retains its existing behavior. Historical measurements below remain unchanged.
- Supersedes: ADR 0003's requirement to terminate the physical verifier Worker after every batch, and its prohibition on retaining SDK SourceFiles between batches. Its serial execution, complete scope, freshness and project-state disposal requirements remain.
- Performance requirement clarified by the maintainer: every complete reference response must arrive within **500 ms**. The original 20-second test timeout is only a hang guard. This implementation currently **FAILS** that latency requirement; correctness/regression verification is not performance acceptance. See [post-cache attribution](../tdd/op00-reference-sdk-cache-attribution.md).

## Evidence and problem

The unchanged 403-file, full-SDK public references transcript intermittently exceeds its original 20-second deadline. Seven serial batches repeatedly construct the same SDK closure: 255 declaration files and 10,741,499 UTF-16 code units. Actual failed-query measurements attribute about 16.6–16.8 seconds to Program readiness, versus about 137 milliseconds to reference queries. Worker CPU is active for 96–99% of these windows. Repeated SDK parsing is a demonstrated cost; adding parallel verifiers would multiply live compiler memory.

A separate Node 20 retained-object experiment measures approximately 107 MiB of heap for this SDK's text and parsed SourceFiles, and 118 MiB when retaining SDK SourceFiles after binding and dropping the Program/Checker. These are measurements of this closure, not a universal SDK limit. Keeping an entire SDK Program/Checker costs approximately 164 MiB. Evidence, inputs, caveats and raw artifact hashes are in [OP00](../tdd/op00-query-layer-attribution.md).

## Decision

One reference verifier Worker belongs to the semantic engine registry and handles anchor and final reference jobs through one serial queue, including concurrent requests from different workspace roots. Cancelling a queued job replies promptly and does not terminate another root's active job. It keeps one current SDK DocumentRegistry cache for its lifetime. Each job still constructs a fresh project LanguageService, Program and Checker, checks current disk/overlay/configuration inputs, disposes its LanguageService **before publishing** its result, and retains no project-file Registry leases. The cache stores no project Program, checker or result and does not copy project Symbols between jobs. SDK SourceFiles may retain objects reachable after binding.

Use the official compiler DocumentRegistry acquisition/release mechanism to pin SDK SourceFiles. Share only inside the same Worker/isolate and compatible compiler parsing settings. Keep full SDK ambient declarations, all candidate batches and existing closure verification. Do not introduce parallel verification, a generic LRU, cache budgets, project incremental updates or a full resident LS as prerequisites for avoiding identical SDK parsing.

The SDK cache validates freshly read snapshot bytes. The current host reports version `0` for SDK files; that value alone is **not** a valid cache freshness key. A changed SDK file must be reparsed even at the same path and with the same reported host version. Parsing-setting changes replace incompatible cache entries. SDK/project configuration replacement, cancellation, Worker errors, shutdown and existing L3 pressure recovery release the cached Worker; a later job rebuilds lazily. This uses existing lifecycle and pressure signals, without adding an eviction policy.

Normal owner shutdown and replacement wait for nested verifier exit before stopping the owner; a bounded fallback still terminates an unresponsive owner.

Worker metrics count the physically retained SDK Worker separately from active transient verifiers, including while idle. Separate anchor/reference job activity counters preserve pressure/cancellation observations without counting the cached Worker twice. Trace labels describe its actual lifecycle. Registry observations distinguish intentionally pinned SDK syntax from project leases and verify per-job disposal before publication.

## Consequences and verification

The first job still parses the SDK; later compatible jobs reuse its SourceFiles and still bind/check their own fresh project Programs. Persistent ASTs may retain compiler objects reachable after binding; the measured retained graph is the relevant memory cost. They cannot be shared across isolates by passing JavaScript objects.

Start with a real framed-stdio LSP test that counts genuine compiler parse calls across multiple batches and checks the complete Location set. Demonstrate RED before implementation. Add SDK-byte replacement, configuration replacement, overlays, cancellation/recovery and disposal checks. Preserve original 403-file Location oracles, full SDK and 20-second deadline. Report timings and retained memory separately; passing this change does not declare the 500 ms SLO or broader product memory gates satisfied.

Implementation and final evidence: [OP00 SDK cache verification](../tdd/op00-reference-sdk-cache.md). The unchanged 403-file transcript passes its original 20-second deadlines; all 255 SDK files are parsed once across 14 jobs.

Follow-up attribution isolates SDK relative-import path/freshness checks as the largest remaining cost, with repeated standard-library parsing and SDK text reads also observed. Warm SDK binding is already cheap. The 403-file transcript still performs two complete seven-batch searches and exceeds 500 ms; [the measured breakdown](../tdd/op00-reference-sdk-cache-attribution.md) records both the default index-cache permission failure and the writable-cache control, which still falls back to complete search.
