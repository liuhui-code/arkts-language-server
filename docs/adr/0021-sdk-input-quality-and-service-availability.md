# ADR 0021: Separate SDK input quality from language-service availability

Date: 2026-10-24–25. Accepted by the user's explicit instruction; implemented and validated in the working tree; not merged.

The selected SDK may be incomplete or require an explicit type patch/update.
An unknown SDK API must not turn a usable compiler/Worker into a failed service,
disable unrelated editor queries or spend recovery/rebuild budget.

1. Load runtime globals from the selected SDK's official ambient runtime declarations.
   Its exported `api/@internal/full/global.d.ts` is not itself an ambient script.
   Do not import browser/Node globals or invent signatures to make errors disappear.
2. Prefer the selected SDK's loader compiler options. When only declaration metadata
   is available, any fallback must derive names from that same SDK and retain its input witnesses.
3. Add `semanticState: partial` for unknown SDK inputs with ordinary queries available. Report
   SDK `inputIssues` and locally `availableCapabilities`; normal LSP capabilities
   and unrelated queries remain available. This is not a Worker fault or restart trigger.
4. Keep complete-project `ready` qualification separate. `partial` has no complete
   input identity/generation, no complete-project `readyCapabilities`, and cannot
   satisfy the existing full reference/rename proof or disk-cache admission checks.
   Unknown SDK types are not treated as proven types or globally patched to `any`.
   Unproven SDK identity/ambient coverage stops complete qualification before new
   complete-root Program work; partial is not itself a prepared-Program proof.
5. Explicit project declaration patches and SDK updates must be observed by the normal
   input lifecycle. Re-evaluation and healthy queries use the same LSP session;
   pressure, freshness, identity, cancellation and failure-recovery budgets remain intact.
6. Compiler construction/resource/ownership failures remain genuine failures. Missing
   local project inputs retain their own qualification reasons, separate from SDK issues.
7. A missing SDK triple-slash declaration may be hidden by `skipLibCheck`. Check
   explicit declaration directives against the already built Program. Record an SDK
   issue without manufacturing a compiler diagnostic; ordinary missing project
   imports keep their own classification. Input issues are a bounded first witness,
   not an exhaustive inventory or proof that every SDK API is correct.
8. Loading runtime globals alone does not establish full SDK ambient coverage.
   Complete qualification still requires a selected component declaration entry.
   A runtime-only SDK remains partial while its available global types work.

`partial` has the exact six locally available capabilities (definition,
typeDefinition, hover, signatureHelp, completion, completionResolve), no complete
proof fields, and `sdk-inputs-incomplete`. Other methods retain their normal
compiler verification/fallback routes; this list is not a global method denylist.
The internal Worker protocol validates partial issues and rejects forged complete
proofs. SDK patches use existing file/configuration synchronization, not a new
watcher or automatic network download. Same-path SDK replacement requires its
ordinary configuration refresh; explicit readiness preparation requalifies inputs.
Required nested compiler option records use neutral empty defaults even in a
partial loader config; SDK-provided feature names are retained. Unsupported SDK
extensions may leave local compiler diagnostics, rather than throwing because an
option record is absent.

Public framed-stdio regressions must cover timer/console types and navigation,
an unknown SDK module with unaffected queries, explicit repair in the same session,
bad SDK-derived types remaining diagnosed, and complete-proof rejection for partial reports.
Real SDK/Photos validation records remaining SDK issues rather than requiring a
complete system SDK as a prerequisite for ordinary editor functionality.

Evidence: `.bench/sdk-semantics-20261024/`; implementation and validation details
are in [the SDK separation report](../reports/2026-10-25-sdk-input-quality-and-availability.md).
Final validation: full `pnpm check:fast` 2,028/2,028; Windows SDK public regressions
10/10; Mac actual-SDK acceptance 11/11. Real Photos tests preserve partial SDK issues
while validating component/runtime queries; initialization and some diagnostics
remain above 500 ms. No daily Zed installation, merge or release was performed.

This updates the interpretation of root readiness in ADRs 0007/0018/0019 for SDK
input gaps. It does not change the reference-result freshness contract, advertise
new LSP methods, resume the cache optimization TODO or authorize a merge/release.
