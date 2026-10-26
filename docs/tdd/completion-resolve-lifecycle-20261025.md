# ZUI-01 completion details TDD record

Parent: `e35459131366a32c48c10d1d74adef74357cd3dc`, dirty branch
`fix/windows-path-identity-20261022`. Inherited SDK/path/recovery changes were
preserved. Before-state: `.bench/completion-resolve-20261025/before-*` and
`before-inputs.json`; the parent revision alone does not identify that candidate.

All LSP behavior tests launch a real child and use Content-Length framed stdio.
The lifecycle suite uses the production Worker/compiler and captured Zed 1.25.3
capabilities. The separate adapter contract fixture deliberately controls backend
faults and changed fields; it does not establish natural compiler failures.

| Slice | RED / characterization | GREEN |
| --- | --- | --- |
| Extract completion registration from the 596-line server | `01-characterization-before.tap`, 32/32 | `03-characterization-after.tap`, 32/32; server becomes 500 lines |
| Closed document, late details request | `04-close-red.tap`: real production server returns -32602 | `07-close-green.tap`: original item, no new edits |
| Bounded eviction | `10-eviction-red-corrected.tap`: 768 issued items evict the first, late resolve returns -32602 | `11-eviction-green.tap`: authenticated immutable fallback |
| Preserve original main edits and genuine faults | `15-immutable-red.tap`: controlled backend changes label from member to changed-by-backend | `16-immutable-green.tap`: original fields, enriched detail/import edit; genuine faults still errors |
| Production interleavings | Prior Mac/Windows ordinary and probe reproductions in `.bench/windows-ui-cause-20261024/` | `13-lifecycle.tap`, 5/5 production tests |
| Related semantic correctness | Existing member, auto-import, cancellation and unnotified-package cases | `18-regression.tap`, 60/60 |
| Ticket validation boundaries | Public eviction, changed nested edit, JSON key reorder and enriched-item replay | `19-ticket-boundaries.tap`, 7/7 |
| Evidence-path migration | Initial full check detects moved exact test references | `25-matrix-green-before-test-extraction.tap`, 15/15; `26-matrix-and-manifest-green.tap`, 19/19 |

Commands, using Node 20.19.5:

```sh
node --test --test-concurrency=1 tests/semantic/completion-resolve-lifecycle.test.mjs
node --test --test-concurrency=1 tests/lsp-completion-resolution.test.mjs
node --test --test-concurrency=1 tests/lsp-feature-matrix.test.mjs \
  tests/lsp-feature-matrix-validation.test.mjs tests/test-layer-manifest.test.mjs
pnpm check:fast
```

The first eviction attempt (`08`, `09`) omitted the scripted child's `--stdio`
argument and failed at transport startup; it is **not** counted as behavior RED.
After correcting the harness, the pre-ticket implementation was restored for
`10` to observe the actual -32602, and the ticket candidate was reapplied for `11`.
The first evidence migration changed a code-action reference unintentionally and
left two expected error paths outdated (`23`/`24`); these were corrected before
the GREEN characterization and test extraction. No assertion was removed.

Intentional contract migrations: edited-target and changed-disk resolve tests
now require the original item with no additional edits, instead of -32602.
Forged/foreign-session handles, actual cancellation, shutdown, unnotified input
failure and applied auto-import correctness remain tested.

Final `pnpm check:fast`: exit 0, 2,035/2,035 PASS; zero failures, cancellations,
skips or TODOs; Node duration 3,334,512ms. The first restricted run was stopped
after process-sampling EPERM and stale evidence paths; the latter were corrected
and the complete run repeated with the required process-read permissions.
Product inputs stayed fixed. One extra EOF blank line in the extracted matrix
test was removed without changing statements; final matrix/manifest check is
19/19 (`28-final-matrix-and-manifest.tap`). The final input manifest and exact
adjustment are retained. The 455-file cold-directory 3-second gate remains
separately excluded by the user's earlier instruction; no correctness gate was removed.

Full validation, Windows UI attempts and their limitations are in the
[implementation report](../reports/2026-10-25-completion-resolve-lifecycle.md).
Subsequent [actual Windows foreground acceptance](../reports/2026-10-25-windows-zed-foreground-acceptance.md)
completed 243 detail responses with no detail errors, six edited completion
acceptances and exact definition jumps, and unrelated-document interleavings.
The product inputs remained unchanged. Latency and teardown log limitations are
retained separately; this is targeted UI acceptance, not all-feature graduation.
