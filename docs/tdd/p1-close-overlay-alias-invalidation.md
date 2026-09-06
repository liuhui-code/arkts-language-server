# P1 close-overlay physical alias invalidation

Parent revision: `9bc0356`.

## Regression

An outer closure cached disk bytes through `Alias.ets -> Target.ets`. Target was then opened as an overlay, its disk bytes changed with the same size and mtime, and the overlay closed without a watcher event. Close removed only Target's raw overlay record, leaving Alias's old disk snapshot and closure warm.

## RED/GREEN

```text
node --test --test-name-pattern "closing an overlay invalidates disk aliases" tests/project-file-set-cache.test.mjs
```

RED returned Alias's old string. GREEN reloads Alias from disk, publishes Alias as the outer owner's changed path with a root-scoped reset/revision, and restores Target's new disk truth under its own raw path.

## Rule

Close captures the overlay record's physical identity before removal, then passes raw plus captured physical identity through the same batched invalidator used by watcher events. Other open overlays remain protected per record; only disk aliases and dependent closures are cleared.
