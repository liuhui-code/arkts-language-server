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
