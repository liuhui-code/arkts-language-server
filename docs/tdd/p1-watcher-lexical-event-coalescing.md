# P1 lexical watched-event coalescing

Parent revision: `046afdd`.

## Regression

The watcher coordinator keyed pending events by canonical physical path. Two newly created lexical symlinks such as `First.ets` and `Second.ets` pointing to one target collapsed into one event, so one missing module candidate could remain warm forever.

## RED/GREEN

```text
node --test --test-name-pattern "distinct lexical create events" tests/workspace-file-change-coordinator.test.mjs
```

RED drained only `Second.ets`. GREEN drains both lexical URIs in arrival order, while the neighboring tests retain last-event-wins for one lexical path and the 1,024-entry/root-dirty cap.

## Rule

Physical canonical identity remains responsible for safe workspace-root routing. Pending-event coalescing uses the resolved lexical path, because DocumentStore—not the coordinator—owns physical alias matching.
