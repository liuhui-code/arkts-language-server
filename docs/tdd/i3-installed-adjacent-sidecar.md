# I3 — Installed adjacent sidecar gate

## Scope

This test-only slice proves that a portable installation resolves the real Rust
index sidecar relative to the immutable installed release. It changes no
production code, shared manifest, or release plan.

The parent revision at the start of the slice was
`93f9aecc04d1cdc67836da3541ebef618c4f0c03`.

## Deterministic RED

The first tracer temporarily moved the installed release's adjacent sidecar
away while leaving the repository release sidecar present and executable. It
then required the installed server to reach catalog ready:

```sh
node --test --test-name-pattern="installs one verified artifact" \
  tests/release/portable-install.acceptance.mjs
```

It failed in about three seconds with:

```text
catalog did not use the installed adjacent sidecar:
Indexing degraded after 0 files; skipped 0 entries
```

This is the intended sensitivity check. A server that incorrectly fell back to
the still-present repository sidecar would have reached ready and made this RED
probe incorrectly pass.

## Final gate

The retained test now performs both halves without sleeps:

1. Install and byte-verify the immutable artifact.
2. Run from a separate cwd and isolated HOME with
   `ARKTS_INDEX_SIDECAR_PATH` and `ARKTS_LSP_HOME` omitted from the child
   environment.
3. Temporarily withhold only the installed adjacent sidecar while the repository
   sidecar remains executable; require deterministic degraded progress and an
   empty exact-symbol result.
4. Restore the original installed bytes.
5. Start a fresh workspace/cache and require
   `Indexed 1/1 files; skipped 0 entries` plus the exact class symbol URI and
   range.
6. Continue the existing installed semantic smoke and confirm no forbidden
   `pnpm`, `cargo`, or `esbuild` stub was invoked.

All protocol transitions use bounded LSP responses, work-done progress, and
`shutdown` then `exit` as barriers.
