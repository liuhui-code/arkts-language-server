# P1 watcher invalidation through an open overlay identity

Parent revision: `a0355fa`.

## Regression

When `Target.ets` had an open overlay, a watched change for that exact path was dropped before physical identity matching. A disk-backed `Alias.ets` symlink to Target therefore retained stale bytes, including when the disk rewrite preserved size and mtime.

## RED/GREEN

```text
node --test --test-name-pattern "watched overlay path" tests/project-file-set-cache.test.mjs
```

RED kept Alias's old string. GREEN reloads Alias from current disk truth while Target's unsaved overlay remains byte-for-byte authoritative.

## Rule

Watcher inputs always contribute raw and physical identities. Overlay protection applies per cached document and per closure entry during invalidation, not to the event itself. Non-overlay aliases receive their original lexical changed path, owner revision, and conservative reset without overwriting the overlay.

The neighboring external-delete test exposed a second edge: the protected overlay itself must not be published as removed/changed or deleted from project membership merely because its disk path emitted an event. Only matched non-overlay aliases contribute deltas; an overlay with no aliases preserves the earlier no-op watcher behavior.
