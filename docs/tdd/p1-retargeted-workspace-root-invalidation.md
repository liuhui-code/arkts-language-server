# P1 retargeted workspace-root invalidation

Parent revision: `a41f490`.

## Regression

A workspace root symlink initially targeted physical root A. After the symlink was retargeted to B, a root-dirty notification canonicalized only to B. Cached documents, closures, and membership keyed by A survived. With equal file size and mtime, the next prepare reused A's old bytes through the lexical alias.

## RED/GREEN

```text
node --test --test-name-pattern "retargeted workspace symlink" tests/project-file-set-cache.test.mjs
```

RED returned the old string through the retargeted alias. GREEN returns B's bytes, advances/resets the current root, invalidates and resets A's old canonical membership, and leaves an unrelated warm root untouched.

## Bound

Root-dirty invalidation now matches both the current physical root and the lexical root against cached raw paths. It scans only already bounded project memberships, documents, and dependency closures. The neighboring root-dirty test proves recovery performs zero per-source `stat` calls and one root `realpath` call.

## Membership-only ancestor propagation

A follow-up RED covered a Main file with no imports whose outer, symlink-root project view received `nested/Target.ets` only through `includeWorkspaceFiles`. Because hydrated project files are intentionally absent from the dependency-closure cache, nested root-dirty previously reloaded Target but did not reset or revise the outer type engine.

Cached project roots are already canonical and capped at four. Root-dirty now treats physical ancestor/descendant project roots as affected, invalidates their membership, and advances/resets each once. An unrelated sibling stays warm, and the zero-stat/one-realpath recovery invariant remains GREEN.
