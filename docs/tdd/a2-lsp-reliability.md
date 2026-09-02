# A2 LSP reliability TDD evidence

- Parent revision: `548e649369ce421b2c4bfb3ec75cbd617a3ec263`
- Scope: request freshness, client cancellation, shutdown, and exit lifecycle
- Excluded: diagnostics, semantic/core behavior, index, and Zed

All behavior tests communicate with a real child process using Content-Length
framed stdio. A scripted `SemanticEnginePort` is injected only in the test
server so slow and cancellation-resistant providers are deterministic.

## A2-0 composition and notification seam

Existing transcripts were GREEN before and after the refactor. The new public
fixture transcript initially started the production server because the harness
could not select an injected entry point:

```text
Cannot read properties of undefined (reading 'label')
```

After adding service injection, alternate child-process entry selection, and a
framed notification waiter, the transcript returned `fixture-v3` and observed
the server's `window/logMessage` notification.

## F1 latest wins

The first completion was scripted to settle only when its semantic abort signal
fired. Sending a second completion in the same URI/method lane produced RED:

```text
Timed out waiting for LSP response 10
```

Starting the newer request now aborts the previous lane. The latest result is
returned and the superseded request completes with an empty result.

## F2 stale document version

A version 1 provider deliberately ignored cancellation and completed after a
`didChange` advanced the document to version 2. RED returned `stale-v1`.
The runtime now returns a result only when the captured snapshot version,
provider result version, and current open-document version all match.
The follow-up signal assertion was also RED with an empty stderr marker; the
document lifecycle now aborts its active request lanes before syncing or
closing, while the version comparison remains the final defense for providers
that ignore that signal.

## C1 client cancellation

Before the LSP cancellation token was bridged, `$/cancelRequest` left request
30 pending until the test timed out. The handler now forwards cancellation as
an `AbortSignal`, responds with LSP `RequestCancelled` (`-32800`), disposes the
token subscription, and continues serving later requests.

## L1 shutdown

After `shutdown`, the server previously served another completion successfully,
so the expected `InvalidRequest` error was absent. The runtime now enters a
shutdown state, cancels request lanes, disposes semantic services once, rejects
later semantic requests with `-32600`, and waits for `exit`.

## L2 exit characterization

The final transcript confirms that `exit` without prior `shutdown` disposes the
semantic service once and exits with code 1. The existing transcript continues
to protect `shutdown` followed by `exit` with code 0.

## Commands

Each RED/GREEN cycle used:

```sh
pnpm build && node --test tests/lsp-reliability.test.mjs
```

Final verification:

```sh
pnpm check:fast
```
