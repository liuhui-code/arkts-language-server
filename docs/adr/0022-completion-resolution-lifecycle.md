# ADR 0022: Completion details outlive their compiler context

Date: 2026-10-25. Status: accepted and implemented for ZUI-01; verification is
recorded in the [implementation report](../reports/2026-10-25-completion-resolve-lifecycle.md).
This changes the stale-completion error contract described in ADR 0006's
closed-source completion section. Its source identity, cancellation, request
freshness and compiler authority requirements remain.

## Problem and evidence

Zed retains a completion list while asynchronously resolving its visible items.
Closing a popup/document does not guarantee that every details request has
already stopped. The captured Windows UI had 41 invalid-params responses:
29 after close, 3 during target close and 9 with mutations elsewhere. Both
Mac and Windows public stdio reproductions demonstrate the two server paths:

1. `forgetDocument` deletes the context; preflight reports InvalidParams.
2. An unrelated root mutation cancels an in-flight request; the request runner
   correctly returns its null fallback, but the completion adapter incorrectly
   converts that normal loss of freshness into InvalidParams.

Zed logs those RPC errors. They do not establish a compiler failure, SDK failure,
Worker restart or Windows path failure. The [prior audit](../reports/2026-10-24-zed-cross-platform-causes-and-coverage.md)
separates the original UI observations from the instrumented reproductions.

## Decision

Treat the original list item and the semantic context for enriching it as
different lifetimes. Details are optional; a successful fallback does not grant
authority to publish newly calculated edits.

| Condition | Public result | Context / edits |
| --- | --- | --- |
| Current context and successful semantic resolution | Original item plus detail, documentation and validated additional edits | Keep original list fields; require existing version, URI and freshness guards |
| Target edited, closed or closed/reopened at the same numeric version | Original server-owned list item | Release the semantic context; no new documentation, commands or additional edits |
| Unrelated mutation or supersession discards an in-flight result | Original server-owned list item | Keep the context unless its own lifetime ended; a subsequent healthy request may enrich it |
| Context evicted from the bounded store | Authenticated original immutable fields | No semantic query or additional edits; optional detail/documentation are omitted |
| Actual client cancellation | RequestCancelled (-32800) | One terminal response |
| Unknown, malformed, altered or foreign-session handle | InvalidParams (-32602) | Never accept client-supplied edits as server authority |
| Unproven workspace inputs, backend fault, invalid backend edit or shutdown | Existing explicit error | Do not disguise genuine failures as benign expiration |

The store retains at most 512 entries, including expired entries' small original
list payloads. A document event drops the store's reference to its
`SemanticCompletion` record immediately. An already in-flight handler may retain
its local snapshot until the request settles; this does not preempt compiler
execution or force immediate garbage collection. Eviction/dispose invalidate
that handler's record-identity fence too. The post-await check fences close/reopen
even when the client restarts its version at zero. Late requests retain only
the original list payload, not a Program/AST or an unbounded context history.

To distinguish an evicted issued item from an unknown/forged item without an
unbounded tombstone history, each opaque `arktsCompletionId` is a session-local
authenticated UUIDv8. Its application bits hold a 32-bit issuance counter and
90 bits of HMAC-SHA256 over the counter and canonical immutable list fields.
The key rotates on clear/dispose; counters never wrap. JSON property order is
irrelevant. This is an authenticated fallback ticket, **not** a semantic cache,
source identity certificate or permission to execute an edit.

Only fields currently authored in our list mapper are eligible for that ticket:
label/kind, insertion/filter/sort text, commit characters, insert-text format and
main text edit. Details, documentation, commands and additional edits are never
recovered from an evicted client's payload. Extending the list mapper with a new
immutable field requires extending this projection and its public regression.

Fresh resolution decorates the stored original item. It does not regenerate
`textEdit`, insertion, filtering or ordering from a later backend response.
Additional edits still require the originating URI and document version; all
existing input proofs and request freshness checks remain in effect.

## Industry references and limits

- [LSP 3.17 completion](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/language/completion.md)
  defines lazy detail/documentation and requires the original list's other fields
  to remain stable unless separately negotiated. Resolve returns a CompletionItem.
- [rust-analyzer's handler](https://github.com/rust-lang/rust-analyzer/blob/master/crates/rust-analyzer/src/handlers/request.rs)
  returns the original item for stale offsets, missing completion candidates or
  mismatched completion hashes; genuine invalid edit data remains an error.
  The applicable pattern is benign obsolescence plus validation, not its Rust
  snapshot representation or completion cache implementation.
- [Zed 1.25.3's fixed source](https://github.com/zed-industries/zed/blob/8dd255c3eafb5231056fe4e6f601cedd011f1c93/crates/project/src/lsp_store.rs#L7582)
  explains why details can outlive a popup/buffer and why errors reach the log.
- [Node 20 crypto](https://nodejs.org/docs/latest-v20.x/api/crypto.html) supplies
  HMAC/randomness/constant-time comparison; [RFC 9562 section 5.8](https://www.rfc-editor.org/rfc/rfc9562.html#section-5.8)
  defines UUIDv8's application bits. The particular ticket layout is our bounded
  adapter solution; these language servers do not mandate that wire layout.

Context7 resolution was attempted but its transport was unavailable; primary
protocol/source documentation and the installed library were used instead.

## Boundaries and rollback

No Worker recovery policy, SDK qualification, result-cache invalidation policy,
index route, timeout, feature negotiation or performance parameter changes.
The paused cache TODO and the user-excluded 455-file/3-second gate remain separate.

Keep the list/resolve adapter, store, ticket projection and mapper as one rollback
unit together with their public transcripts and evidence mapping. Reverting only
the store or only the fallback would reintroduce the invalid-params path or break
the forged-item contract. Protocol and real-Worker tests cover expiration,
interleavings, cancellation, bounded eviction, forged fields, old enriched items,
disk input identity, genuine backend faults and applied auto-import correctness.
