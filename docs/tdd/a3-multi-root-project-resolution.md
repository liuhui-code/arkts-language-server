# A3 multi-root project resolution: TDD evidence

- Parent revision: `4c1bdfa`
- Public boundary: `ProjectResolverPort.projectFor`
- Command: `node --test tests/project-resolver.test.mjs`

RED: after configuring three workspace folders, the existing resolver mapped a
document in the second root and a document in a nested root to the first root.

GREEN: the resolver retains every unique file workspace and selects the
longest containing path using directory-boundary-aware relative paths. A path
that merely shares a string prefix is not treated as a child; documents outside
all roots retain the deterministic first-root fallback.
