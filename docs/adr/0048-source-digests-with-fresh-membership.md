# ADR 0048: Retain source content digests, revalidate physical input identity

- Date: 2026-11-22
- Status: Proposed; implementation authorized, independent review pending.
- Issue: NAV-HOT-DIGEST-001 in the local feature ledger.
- Refines: ADR0044 original-load ownership and ADR0047 full namespace observation.
- Does not supersede: ADR0037 final freshness, ADR0043 index qualification,
  ADR0045 complete membership, or root-wide result invalidation.

## Evidence

ADR0047 enables query-qualified reference results but30K actual hits still cost
~8.66s. The new same-artifact2048 diagnostic places~500ms within
projectSourceNamespace on a hot request; nested spans are not additive. Public
stdio RED reproduces96 real source opens on a correct cached answer. See the
2026-11-22 hot-query source-digest report and .bench/hot-query-20261122.

## Decision

Retain the SHA256 of the exact decoded source content delivered by the existing
bounded, physical-path/descriptor/identity guarded read. Retention belongs to an
opaque Store-issued membership fact family, not a root path, result cache entry,
watch epoch or an arbitrary caller's token. Original snapshots and files are not
retained. Same-membership content deltas can share this derived data; uncertain
or changed names create a new family. This is incremental derived data, never
a cached validity result.

Before consuming a digest on every request:

1. Capture the original strong Store identity proof at the exact membership
   revision and validate it. Missing strong/issued evidence uses the raw reader;
   an actual failed proof rejects the request.
2. Require the same canonical physical path and original guarded read token
   (dev/ino/size/mtime/ctime). A fresh requestFileIdentity observation must match.
   Same-phase completed native leaf observations may lend metadata under their
   existing ownership rules; the final phase independently scans again.
3. Changed or unknown identity performs the original guarded content read and
   derives a replacement digest. Same-length/restored-mtime changes still change
   ctime. This has the existing regular-file identity trust boundary, not a new
   claim to detect privileged filesystem timestamp forgery.
4. Preserve all-member/name/configuration/SDK observations, cancellation,
   end-of-namespace membership reconciliation and original independent final
   input union. No watch notification is required to discover a change.

The full namespace still hashes the same sorted URI and content digest sequence;
all existing Native fingerprint and result-admission comparisons remain. A
binding proof may already lend original compiler-read digests as before. Open
buffers retain their separate authority; this cache contains disk digests only.
No partial answer, SDK READY or index completeness is fabricated.

## Ownership and bounds

A WeakMap is keyed by the Store-issued fact family. Its entries contain only
file strings, original tokens and32-byte digests. No AST/Program, source text,
SQLite reader, descriptor, DocumentStore or old membership snapshot is retained.
The family dies with the last issuing snapshot/active consumer. Derived metadata
has a32MiB per-family accounting bound; overflow takes raw reads, never incomplete
answers. It does not introduce a default RSS budget or pressure eviction.

## Alternatives

- Rehash every unchanged file on every request: safe but repeats the dominant
  observed work; keep it as fallback for weak/unprovable inputs.
- Watch-only revisions or directory mtime: insufficient for silent body edits.
- Cache aggregate namespace by root/revision: cannot establish current physical
  identity and is forbidden.
- New native scan/fingerprint protocol: potentially useful later, but not needed
  to remove proven duplicate content reads and would expand this change.
- Reuse only returned reference files: misses negative coverage/other inputs.

## Acceptance and limits

Public LSP tests must prove zero unchanged-noise content opens, continued fresh
physical checks, silent same-size/restored-mtime invalidation, only changed
content reread, and rejection of an edit injected during digest reuse before
publication. Existing namespace/symlink/SDK/overlay/cancellation/final-source
regressions and actual full check:fast must pass on the final candidate.

Compare frozen predecessor/candidate at2048/20K/30K with fixed P16, three serial
processes each, alternating order; separate first/hot operations and fresh/reused
Native caches. Preserve per-operation values and resource/DB closure evidence.
Instrumented costs are not ordinary timing percentages. Remaining raw all-member
metadata scans still grow with N; no claim of constant-time freshness or500ms
universal performance. Actual Photos first-query availability, initialization,
UI/Windows/endurance remain separately qualified work.

## 2026-11-23 implementation refinement: closed sources only

The first full gate exposed the active-overlay disk-read contract. The derived
cache is restricted to closed sources. Active overlays keep original guarded
disk reads on every admission; actual Native namespace hashes must equal the
independent on-disk projection and differ from the overlay projection. Original
read-count assertions remain unchanged. Six related tests PASS; the corrected
candidate repeats full performance/gates rather than borrowing old acceptance.


## Completed-observation representation refinement

An eligible closed source digest may consume the existing current-phase
completed Native numeric regular-file observation directly, checking mode,
parent/physical identity and the same five original token fields. Store parsed
numeric fields once per digest. Do not create duplicate path/JSON identity DTOs
just to compare unchanged metadata. Missing/weak/unknown/symlink/ineligible
records take existing raw identity fallback. No final producer is moved earlier,
no observation quota grows, and no earlier-phase record can authorize final.
The per-family optional metadata accounting includes numeric fields. This
refines representation only; it does not weaken ADR0044/0037 or enable
cross-request validity caching. Public count/mutation/overlay tests and frozen
same-artifact full checks remain acceptance obligations. Review remains pending.


## Original-load seeding and ownership boundary

The actual guarded admitted-source reader may seed the optional digest cache
immediately before returning its snapshot, using the native catalog's exact
Store-issued complete membership family. Require the same token, descriptor
mode, physical root/path and original source identity. A cloned/legacy catalog
cannot acquire a family by structural equality. Store derived hashes only;
seeding does not validate future disk state or promote readiness. Closed-source
admission must still recheck its fresh strong membership and physical token,
and preserve the original final independent union. Open-overlay admissions
continue their original guarded disk reads even if initialization seeded a disk
digest. Same-size restored-mtime changes must reread only changed content before
the first query; stale or unprovable records retain original raw fallback.

The common helper belongs under project/source-content-digests, shared by
workspace guarded reads and semantic admission, rather than a core-to-semantic
import. Initializing hashes at original loads can add CPU/metadata; measure
initialization as well as first/hot queries. Reuse of SourceRolePool's separate
role hash is outside this slice. Quotas, freshness, final ordering and review
status above remain unchanged.


Read-side seeding retains derived data; it does not assert a current membership
validation receipt. A weak/missing current namespace proof may leave an unused
derived digest in memory but cannot consume it. Actual descriptor/token/mode
qualification and a future strong current-phase admission remain separate.


2026-11-23 W7 validation: [final slice report](../reports/2026-11-23-hot-query-acceptance.md).
Focused120 and actual `pnpm check:fast`2801/2801,0skips. Source1068 and all
production artifacts/Native unchanged. Extra all-dist guard134 failed on an
old copied test-only SDK fixture being rebuilt; original record retained and
independent SDK12test/reproducible-hash adjudication145 explains that exception.
Final generated2048/20K/30K9sessions72exactqueries27hits(P16 in both operations),
real Photos3sessions12queries9hits plus one8-query overlay lifecycle all pass.
Real first local refs median7.97s/hot1.02s; edit/save/close/reopen first4.6–4.8s
remain slow; initialization84s, namespace-size growth, SDK partial/full-index
qualification and global references/rename/UI/endurance remain open.
These results validate the stated mechanism, not all performance targets.
Status remains Proposed pending independent review; no merge/deployment.
