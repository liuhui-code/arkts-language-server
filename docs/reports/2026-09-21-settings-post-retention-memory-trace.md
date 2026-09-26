# Settings references: memory after context-disposal decision

Status: **exploratory phase attribution, not a retention-policy or release
gate**. This extends the [fixed Settings matrix](2026-09-21-settings-api24-reference-matrix.md)
and [ADR 0002](../adr/0002-hot-semantic-context-lifecycle.md). The production
`dispose` profile remained selected throughout.

## Fixed workload and limits

The real, clean Settings checkout was
`ecc550dfaed880e04e38a2477eb7235cd50475b9`. The project declares
compile API 23; this Mac selected DevEco ETS API 24 (`6.1.1.125`) at
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`. The prior
pinned matrix records SDK declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`;
these exploratory replays recorded the same SDK path/version but did **not**
repeat manifest/digest preflight. Node was `v26.3.0` on macOS Darwin 25.6.0.
The repo HEAD was `f454723`, with the memory trace/test uncommitted and a
separate user-owned `AGENTS.md` modification. Entry server SHA-256 was
`ec52e7fb552fb2bef239b996d3261d0b2e5f6f5017e8383861404d1d40849b2e`;
the newly built semantic Worker was
`842291ecfe0a7fd7cb147af0abd6dfa16f2b0bc8e9001b0dd466ce63838a09de`.
This differs from the Worker pinned in the earlier matrix, so these are **not**
same-artifact release comparisons with that matrix.

The target was `HomeInitData` in
`common/src/main/ets/sendable/HomeInitData.ets`, zero-based UTF-16 `16:13`,
`includeDeclaration=false`, using the [nine-location oracle](../../bench/references/oracles/settings-homeinitdata-api24-no-declaration.json).
Each run used a new process and private index, `indexed-batched + closure +
full SDK`, 64 batch roots, normal automatic diagnostics and no forced GC or
heap snapshot. External sampling measured server-plus-sidecar RSS, counting
Worker threads only once inside the Node PID; harness memory was separate.
`batch.start.rssBytes` is that same whole Node-process RSS; its
`heapUsedBytes` is only the semantic Worker isolate's V8 heap, **not** an
aggregate process heap. The nominal sampling interval was 50 ms but actual
intervals varied.

| Run | LSP sequence | Trace | Retention event | Node RSS at `batch.start` | Semantic Worker heap used there | External product RSS peak | Result |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| [A raw](/private/tmp/settings-homeinitdata-post-retention-mode-a-trace-on-20260921.json) | open → references | on | 0→0, `removed=false` | 160,030,720 B | 29,614,544 B | 548,155,392 B | 9/9 exact; diagnostics `[]` |
| [B raw, trace on](/private/tmp/settings-homeinitdata-post-retention-trace-on-20260921.json) | open → completion → definition → references | on | 1→0, `removed=true` | 733,794,304 B | 539,898,920 B | 1,062,969,344 B | 9/9 exact; diagnostics `[]` |
| [B raw, trace off](/private/tmp/settings-homeinitdata-post-retention-trace-off-20260921.json) | same warm sequence | off | 1→0, `removed=true` | not emitted | not emitted | 1,132,949,504 B | 9/9 exact; diagnostics `[]` |

The trace-on B process reported **730,607,616 B Node RSS at definition
completion**, before references. Its `dispose` event then changed the logical
resident count from 1 to 0; immediately afterward, before the transient
verifier batch began, Node RSS was still **733,794,304 B** and semantic Worker
V8 heap used was **539,898,920 B**. The completed references request reported 985,784,320 B
Node RSS; the independently sampled server-plus-sidecar product peak was
1,062,969,344 B. The raw batch event also reported 613 Program SourceFiles,
including 151 project and 410 SDK SourceFiles, and 9 result Locations. All
three runs passed the same normalized URI/range oracle.

This establishes a narrower conclusion than “two live Programs caused the
peak”: a large warmed memory baseline was present **before** verifier
admission despite logical disposal. `disposeResidentContext` need not return
RSS immediately; these measurements cannot distinguish V8 objects awaiting
GC, compiler/registry retention or allocator behavior. The trace-off B run
also peaked near 1.13 GB, but one trace-on/off pair with independent process
timelines cannot quantify tracing overhead or a memory-policy win. The
configured 1,024 MiB semantic budget is a pressure policy, not a hard
process limit. These API-24 compatibility runs do not establish API-23 or
DevEco equivalence.

To replay the warmed trace from this checkout after `pnpm build`:

```sh
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 16 --character 13 \
  --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --out /private/tmp/settings-post-retention-replay.json \
  --mode B --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 0 --trace
```

This exploratory command does not pass the older artifact manifest: the
semantic Worker digest changed with the observation-only trace edit. Verify
the repo/SDK/artifact identities in the output before comparing runs.

Next causal measurement: with the same warmed workload and build, sample a
short **idle period without forced GC** after context disposal and before a
verifier starts, then compare trace-off external RSS over independent runs.
Only if that separates pre-verifier residency from verifier growth should a
policy change be considered. Post-eviction PSS, the original >3 GB reproducer,
the final 50% memory gate and cold ≤500 ms navigation target remain open.
