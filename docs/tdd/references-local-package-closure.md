# Local package metadata closure without invented modules

Parent `9f91122ac504365c57473a430094da09baac9309` plus preceding dirty slices.
User `AGENTS.md` changes preserved. No project profile edits/default promotion.

## Distinct failures and RED → GREEN

The first fixture routes real references through a package outside declared
modules. Legacy itself returns -32803 (incomplete workspace snapshot), so that
failure cannot be fixed by declaring the graph complete. It is retained as a
public fail-closed characterization, not relabelled a supported case.

The actual Settings suggestion package has an empty source entry. A second
fixture preserves direct alias references and adds that metadata-only package
dependency, with a transitive edge back to a declared module. Command:

```sh
node --test --test-name-pattern='local package dependencies preserve' \
  tests/semantic/references-conservative-semantic-units.test.mjs
```

RED: exact locations already match legacy, but graph remains incomplete and
grouping does not activate (10,304 ms). After minimal closure implementation,
GREEN (9,763 ms): all candidates retained, exact results for both declaration
policies, unsaved alias/super/same-name checks and project-graph batches.

Before extracting graph construction, the existing model suite passes 26/26
(687 ms). After the cohesive extraction, the same 26 pass (820 ms). This
protects existing target/product/boundary/ambiguous/dynamic/versioned-package
behavior; extraction is not mechanical line splitting. Model source shrinks
494→391; graph builder is 172 lines. The bounded profile reader remains owned
by the model and is passed to graph construction; no second parser/cache.

One initial typecheck fails on a possibly empty string in the stat expression;
using an explicit undefined branch restores check/build GREEN. A public model
case verifies transitive/reverse module edges and separate package roots,
without creating another unit or opening package module scope. Wrong name,
missing/escaped entry, dynamic and missing local dependency remain incomplete.
The expanded model suite passes 27/27 (706 ms).

## Safety and limits

Only declared units get unit identities. A local package must have a matching
name, bounded readable manifest, relative supported entry, existing regular
bounded entry and lexical/physical containment in the workspace/package.
Local metadata traversal is cycle-safe and bounded. Unknown/missing/unsafe
metadata remains incomplete; versioned dependencies do not become project
edges by name. Nested packages already owned by a module retain existing
characterized behavior. Package roots are included in discovery admission,
so completing the graph cannot silently exclude their occurrences.

No AST/TypeChecker/Program/Worker lifecycle, SDK profile, compiler authority,
memory budget, diagnostic capability or result-completeness policy changes.
Real package-source references outside declared scope are still unsupported:
legacy and experiment must both fail, never return a partial successful set.
Graph completeness is metadata proof, not final semantic success.

The real unchanged Settings graph is now ready/complete, still 32 units,
with suggestion under phone.packageRoots and its declared-module dependencies
recorded. Membership remains 1,496. A new manifest pins changed runtime assets;
old manifests/negative evidence are retained. Final focused tests and real
replay results are recorded in the
[execution report](../reports/2026-09-27-settings-local-package-closure.md).

Final expanded model/public protocol regression: **68/68 PASS**, zero skipped,
113,927 ms. This includes all four full-scope unit fixtures and preserves
-32803 for actual unsupported package references across legacy/default/opt-in
and both declaration policies. It also characterizes anchor reuse, index
state/resync, overlay/cancellation, scheduling/coalescing and test inventory.
Same-build real flag-off first request is 104,540 ms; opt-in grouping is
50,991 ms but raises equivalent first-request tree peak by 24.1%. This does
not graduate the default-off experiment or pass the 500 ms/memory gates.

Separate references-batching and bounded-profile/resource suite: **21/21
PASS**, zero skips, 95,015 ms. The target-membership path was initially
mistyped in that command; it is corrected to
`tests/semantic/project-target-membership.test.mjs` and run separately before
claiming its coverage: corrected run **10/10 PASS**, zero skips, 6,796 ms.
Total focused verification is 99 passing tests. `pnpm check` and
`git diff --check` pass; all three
measured runtime asset hashes still match the frozen manifest. No new full
check:fast/release PASS, commit, push or merge is claimed.
