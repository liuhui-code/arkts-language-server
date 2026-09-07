# P1 active-target source membership

Parent revision: `ed069cf5075992b7afd8821ffd12328a9a4fd7ea`, with the current
uncommitted P1 project-model, shared resolver and SDK work as the parent
implementation. Changes are limited to DocumentStore source membership and its
target regression suite. Workspace identity remains the workspace; this slice
does not create per-module TypeScript engines or replace dependency resolution.

## Observed RED → GREEN slices

Real protocol command:

```sh
pnpm build
node --test tests/semantic/project-target-membership.test.mjs
```

1. A root profile declares `features/alpha`, and its default product selects a
   tablet target with `sourceRoots: ['./src/tablet']`. Completion in `src/main`
   incorrectly returned `InactiveOnly` from `src/desktop`. Default source discovery
   now prunes inactive source-set directories before opening them.
2. The first pruning implementation also hid `TabletOnly`: the positive selected
   target test observed RED because a module-parent relative path was treated as
   inside `src`. Membership uses an explicit exact-`..` boundary check, retaining
   module-root entry points and selected target globals.
3. Opening and querying an inactive overlay reintroduced `InactiveOnly`. Opened
   membership and overlay merging now apply the same admission decision. Excluded
   overlays are removed from resident language-service roots through the existing
   removed-path mechanism unless they belong to the explicit dependency closure.
4. A watched-created file under `src/desktop` rejoined an already warm project.
   Watched-created membership insertion now uses the same target admission.
5. Ambiguous target selection still merged target globals because the unavailable
   scope lost its known module identity. The project-model owner preserved
   `moduleRoot` for known but unavailable module scopes; DocumentStore then closes
   that module's `src` source sets without disabling unrelated root files.

## Protection and final evidence

The new suite has eight real child-process stdio tests and one public DocumentStore
filesystem-boundary test. It additionally verifies:

- selected target globals and auto-import candidates remain available;
- watched target switching removes old roots and gives the same completion fields
  as a fresh session (ignoring request-version metadata);
- inactive directories receive no directory enumeration or source-content reads;
- a module-root `Index.ets` and installed `oh_modules` dependency entry still resolve
  through explicit imports.

Final command:

```sh
pnpm build
node --test tests/semantic/project-target-membership.test.mjs tests/semantic/project-membership-language-service.test.mjs
pnpm check
```

Result: **14/14 passed**, zero failed/skipped/todo; TypeScript checking passed.
The five existing membership tests still cover unopened members beyond the resident
256-file window, lazy snapshot bounds, membership replacement/removal and partial
membership handling. The full project gate remains the root agent's responsibility.

## Deliberate boundaries

- No profile keeps legacy behavior. Files outside a known module's `src` source
  spaces remain eligible; explicit dependency closures are not a source-directory
  denylist. Invalid scopes without known module identity are not used to guess and
  reject unrelated root files.
- The shared project model determines source roots. Standard-library and SDK setup
  are unchanged; no TypeScript service file was changed by this slice.
- Existing path-count/byte, resident-document and closure budgets remain. No new
  per-file cache was introduced. Scope admission retains physical-path checks and
  still has filesystem cost; this is not a p95/p99 or RSS benchmark result.
- Pruning proves inactive-directory isolation. It does not establish a total
  directory-entry budget for arbitrary contents inside selected source roots.
