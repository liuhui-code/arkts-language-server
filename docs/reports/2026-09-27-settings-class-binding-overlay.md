# Settings captured binding snapshot/source-overlay prerequisite

Status: **standalone adapter/correctness regression PASS; production admission,
constructor narrowing, ≤500 ms and memory graduation remain open**.

## Implementation and verification

[TDD evidence](../tdd/references-class-binding-overlay.md) records five actual
public RED commands at HEAD `9f91122ac504365c57473a430094da09baac9309` and
their minimal GREEN implementations. The new Rust adapter consumes validated
same-generation metadata plus unique requested-URI current source overlays.
Invalid traversed source shadows old facts; valid buffers can fill requested
unknown rows; no overlay is persisted. Transient resolution is recomputed.

One kernel now serves both the old fresh-source contract and the new snapshot
API. The latter rejects extensionless hops because omitted/unknown competitors
cannot certify absence. Caller-fenced workspace/config/index/document revision
and every relevant active overlay remain necessary. Generation equality alone
cannot establish freshness or detect omitted buffers.

There is **no new sidecar endpoint, production DocumentAuthority/planner
consumer or constructor exclusion**. Discovery is not compiler identity/search
coverage. Schema, SDK/defaults, Worker and memory policy are unchanged.

- `cargo test --workspace`: **146 PASS / 1 existing ignored release fixture**.
- Core snapshot/overlay tests **13/13**; SQLite public reopen/overlay **5/5**.
- Experimental snapshot/overlay/heritage/migrations/layout **24/24 PASS**.
- Release sidecar, `pnpm check` / `pnpm build`, scoped format and diff: PASS.
- Real child-process framed stdio **9/9 PASS**, 51,333.981 ms suite duration.
- GREEN extractions preserved the original 49-test core behavior; later shared-
  kernel refactor preserved all 59 core tests present before the last guards.
- Touched oversized core lib **1,603→1,557** remains debt; new metadata module
  55, shared resolver255, overlay core test478, SQLite test220 physical lines.
  Fresh-source entry shrinks167→44; no new handwritten file exceeds500.
- No new whole-fast-suite gate, commit/push/merge. Existing dirty edits preserved.

## Frozen real project and replay

Server HEAD above, dirty branch `codex/references-f2-fixed-benchmark`. Clean
Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-row-counts.BPJdST/project`; declared SDK23/20/20
unchanged. User-approved API24 /6.1.1.125 at
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, declaration
digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
Node v26.3.0 / ohos-typescript4.9.5-r10 / pnpm8.3.1 / Darwin25.6.0 x64.
This is not an API23/DevEco diagnostic-equivalence claim.

[Manifest](../../bench/references/manifests/settings-menucontroller-binding-overlay-api24.json)
pins unchanged TS server/Worker/stdlib artifacts and rebuilt release sidecar
`51a8e5f9eb1594c1eb098ced176102490acbf674b8a58da2ac194673b645794e`.
Launch: pinned Node, `dist/server.cjs --stdio`, target Node PID77520.
Query `common/src/main/ets/core/controller/MenuController.ets`,
`MenuController`, zero-based UTF-16 **90:17**, `includeDeclaration=false`,
against the **267-location constructor** oracle (not class-export identity).

One fresh process/index-cold A run waits for ready catalog, opens the file and
first requests `textDocument/references`; no workspace/symbol or documentSymbol.
Normal automatic diagnostics remain enabled. External sampling uses its own
process; no overlapping build/tests, forced GC or heap snapshot. Experimental
flags below are explicit, not a default promotion.

| Observation | Value |
| --- | ---: |
| Request→response | **53,310 ms** |
| Exact/legal Locations | **267**, no error/missing/extra |
| Catalog | 1,846/1,846 indexed; 1 entry skipped |
| Rejected/completed verifier attempts | **1/14** |
| Membership/max Program project files | **1,496/1,348** |
| Full-search early-completion proofs | **0** |
| Program readiness sum | **44,508.39 ms (~83.5%)** |
| createProgram/query/startup sums | **37,353.28/1,820.07/3,858.61 ms** |
| External target Node peak RSS | **795,295,744 bytes (~758 MiB)** |
| External product-tree peak RSS | **798,543,872 bytes** |
| External samples/actual spacing | **592 /97–178 ms** |
| Sampler peak/harness timeline peak RSS | **116,834,304/71,335,936 bytes** |

RSS requested interval50ms, actual gaps are disclosed. Worker threads share
the Node PID and are not summed again. Sampler/harness are excluded from product
memory. Sampled peaks may miss between-sample maxima; no PSS/retention claim.
Phase sums are descriptive, not mutually exclusive ownership estimates.

Normal version1 TS2307 for `@ohos.systemparameter` arrives1,993ms after the
references response. Graceful exit0; no timeout/OOM/partial success. Cold≤500ms
is **FAIL**. One rejected seed plus all14 conservative batches still execute.
The new discovery API is not a production references consumer; no speedup is
claimed. Latency is effectively unchanged from the prior53.336s smoke.

The Node peak is5.4% below the prior840,290,304-byte snapshot smoke, but15.0%
above the earlier691,609,600-byte base-discovery smoke. These single samples
neither establish a cause nor pass memory no-regression/reduction/P95 gates.
Original >3GB reproduction and final pressure/memory graduation remain open.

Raw memory curve, request transcript, phase events and exact results:
[menu-binding-overlay-A-1.json](../../.bench/anchor-reuse-2026-09-27/menu-binding-overlay-A-1.json).
SHA256 `e235a635f78018ae02f784c890caf9eb0533c92d296565be902d77fbe0776bd5`.

Replay with a fresh output filename:

```sh
ARKTS_REFERENCES_ANCHOR_REUSE=0 \
ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=1 \
ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=1 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 90 --character 17 --exclude-declaration \
  --oracle bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-menucontroller-binding-overlay-api24.json \
  --out .bench/anchor-reuse-2026-09-27/menu-binding-overlay-A-2.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

Next: production captured-snapshot admission and authoritative extensionless
source availability, then compiler-backed inherited/factory/own-constructor
coverage and exact public differential before any candidate exclusion.
