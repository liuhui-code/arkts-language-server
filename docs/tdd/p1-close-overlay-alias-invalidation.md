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

## Retargeted overlay symlink

A follow-up RED retargeted the open overlay's lexical symlink from First to Second before close. An Alias of Second retained equal-size/equal-mtime stale bytes because the captured identity named only First.

Close now submits raw, captured physical, and close-time physical identities together to one invalidation batch. The closure set is still scanned once, matching roots advance once, and both the original close regression and the retargeted case remain GREEN:

```text
node --test --test-name-pattern "closing a retargeted overlay symlink|closing an overlay invalidates disk aliases|restores disk truth" tests/project-file-set-cache.test.mjs
```
