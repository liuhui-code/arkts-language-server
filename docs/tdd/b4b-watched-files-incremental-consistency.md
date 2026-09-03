# B4b watched-files incremental consistency

Date: 2026-09-03

Initial tested parent: `33b0d8ac26e55006c4eec3486e83385546d403e0`

## Scope and public boundary

This slice connects `workspace/didChangeWatchedFiles` to the existing bounded
ProjectSet and TypeScript language-service state. Its public proof is a real
bundled server over framed stdio: after the client sends a file-change
notification, the immediately following completion request must observe a
create, delete, or rename. The transcript uses no sleep or polling delay; JSON-
RPC message order is the correctness barrier.

Workspace-folder changes and catalog deltas are deliberately out of scope.

## API verification

The Context7 library resolver selected the official
`/microsoft/vscode-languageserver-node` documentation. Its current excerpts
confirmed that language-server capabilities may be registered dynamically, but
did not expose the version-specific watched-files call signature. The installed
`vscode-languageserver` 9.0.1 and protocol 3.17.5 declarations were therefore
used as the authoritative versioned contract:

- client capability:
  `workspace.didChangeWatchedFiles.dynamicRegistration === true`;
- registration:
  `connection.client.register(DidChangeWatchedFilesNotification.type, options)`;
- options: `DidChangeWatchedFilesRegistrationOptions.watchers`;
- delivery: `connection.onDidChangeWatchedFiles(handler)`;
- event types: created `1`, changed `2`, and deleted `3`.

The server registers `**/*.ets` and `**/*.ts` only for a client that advertises
dynamic-registration support. The unsupported-client transcript verifies that
no `client/registerCapability` envelope is emitted.

## RED to GREEN slices

Unit/store/type-engine command used after each local slice:

```text
node --test tests/workspace-file-change-coordinator.test.mjs
```

Stable REDs and minimal GREENs:

1. RED: the coordinator entry point did not exist (`0/2`). GREEN: accept only
   file URIs for `.ets`/`.ts` sources contained by a canonical workspace root;
   reject symlink escapes; retain the last event per canonical path.
2. RED: `SemanticDocumentStore.workspaceFilesChanged` did not exist. GREEN:
   add an in-root create to an already cached ProjectSet without rescanning.
3. RED: a changed file whose size and mtime were deliberately held constant
   returned the old source. GREEN: invalidate its disk record and dependency
   closures from the explicit event rather than trusting its fingerprint.
4. RED: rename removed the old disk file but returned no `removedPaths`.
   GREEN: delete old plus create new updates the ProjectSet and reports the old
   TypeScript script exactly once.
5. RED: overload rescanned the ProjectSet but did not invalidate a stale type
   script. GREEN: root-wide dirty invalidates the cached path set and emits a
   one-shot type-engine reset.
6. RED: an arbitrary 32-root prefix silently ignored root 33. GREEN: valid
   configured roots are not silently truncated; path-event memory remains
   independently bounded.
7. RED: deleting an open, diskless overlay removed it from the next project
   view. GREEN: open overlays remain authoritative for incremental delete and
   are merged ahead of enumerated disk paths after root-wide dirty.
8. RED: a reset view left `StaleType` in the first TypeScript engine. GREEN:
   dispose and replace only the named root engine; a second root retains its
   warm `KeptType` script.
9. RED: two pending removals exceeded an injected one-path budget without a
   reset. GREEN: only paths known to cached documents, ProjectSets, or
   dependency closures enter the removal set; the default per-root hard limit
   is 512, and overflow clears the set and escalates to a one-shot root engine
   rebuild instead of dropping an arbitrary stale path.

Final unit result: `10/10` passed, `0` failed, `0` skipped.

Real-process command:

```text
node --test tests/lsp-workspace-file-changes.test.mjs
```

The first RED returned no `CreatedType` after an adjacent create notification.
GREEN then proved, in one real process, initial cached `OldType`, immediate
visibility of `CreatedType`, immediate removal of that class after delete, and
rename from `OldType.ets` to `RenamedType.ets` with no stale old completion.
The dynamic-registration slice was separately RED by timing out while waiting
for `client/registerCapability`; GREEN returned exactly the two bounded source
watchers. A follow-up liveness RED then deliberately withheld that registration
response: `window/workDoneProgress/create` timed out because indexing was
sequenced behind the client reply. GREEN observes the registration promise and
logs rejection without awaiting it; while the registration remains pending,
workspace progress starts and completion returns the open document's `title`.
The test finally answers both server requests, so no promise is abandoned.
Final result: `2/2` passed, `0` failed, `0` skipped.

Test-layer manifest command:

```text
node --test tests/test-layer-manifest.test.mjs
```

RED reported both new entries as unassigned. GREEN assigns the coordinator
suite to `unit-contract` and the real server transcript to `bundle-e2e`.
Final result: `2/2` passed, `0` failed, `0` skipped.

## Invariants

- Filtering happens before state mutation: file URI, supported extension,
  canonical root containment, and valid LSP change type are all required.
- Pending path events are capped at 1,024 globally and use last-event-wins.
  Overflow marks only the affected root dirty and discards its granular batch.
- A root-dirty batch forces bounded re-enumeration and a one-shot engine
  rebuild, so overload cannot return a successful stale semantic answer.
- Explicit change events invalidate fingerprint caches; delete/rename propagate
  stale scripts through `removedPaths`.
- Removed-path memory is bounded. Overflow uses root-engine replacement rather
  than dropping an arbitrary removal.
- Open overlays always win over disk notifications and survive root rebuilds.
- All state transitions are synchronous in the notification handler, making
  the next semantic request the observable barrier without timing assumptions.
- Watched-files registration is best-effort and never gates workspace indexing
  or semantic requests, even when a nominally capable client does not reply.
