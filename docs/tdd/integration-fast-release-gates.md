# Fast and release gate separation evidence

- Parent revision: `035750f`
- Scope: public `pnpm check:fast` and `pnpm check:release` contracts

## RED

After one-command delivery joined the default test glob, `pnpm check:fast` ran
two full pnpm/Cargo/WASM installer builds concurrently with the LSP transcript
suites. One delivery case took 46.8 seconds, the older duplicate installer case
took 41.6 seconds, and an otherwise healthy standalone initialize transcript
hit its 2-second timeout. The gate ended `28/29` despite all feature-focused
tests being GREEN.

## GREEN design

- `check:fast` runs deterministic typecheck, bundle, LSP, semantic and adapter
  suites only.
- `check:release` runs `check:fast` first, then the clean build/install/WASM
  acceptance test serially.
- The older adapter installer test was removed because the release acceptance
  test strictly supersedes it: build, atomic WASM publication, safe idempotent
  symlink installation, repository-external cwd and real initialize are all
  covered in one place.

The acceptance filename deliberately does not match the fast `.test.mjs` glob.

