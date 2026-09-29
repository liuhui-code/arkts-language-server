# Default-off local-export anchor discovery seed

Parent `9f91122ac504365c57473a430094da09baac9309` plus preceding dirty
anchor/candidate-phase slices; user-owned `AGENTS.md` edits preserved.

## RED → GREEN

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test \
  --test-name-pattern='opt-in cold local-export references' \
  tests/semantic/references-anchor-reuse.test.mjs
```

Before implementation this exits 1: actual `compiler-definition-identity`
instead of `indexed-local-export-seed`. The exact seven alias/re-export
Locations already pass. This is missing optimization, not a semantic failure.
The same transcript passes after implementation and records no standalone
anchor Worker/Program, with `anchorVerified=true` in every completed batch.

`ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=1` enables **discovery only**: obtain a
Unicode identifier at the UTF-16 cursor, then a unique same-file exported class
from a ready, bounded export query. Require complete binding/support identity
proof and matching export/reference committed generations before planning.
No lexical result becomes a final Location. Each transient final compiler
batch resolves the original query again, requiring exactly the seed's file and
declaration start. A mismatch discards all work and retries the established
compiler-anchor route, with seeding disabled for that retry.

Real framed-LSP transcripts cover default off, same-name parameter rejection,
cancel/no partial result and exact recovery, edit/ContentModified plus a new
unsaved reference, and pre-query comment edits. The shadow test's initial
expected range was corrected from 41:46 to the source's literal 42:47; no
production semantic change was needed for it.

The transport test rejects missing/incomplete/unadmitted anchors, malformed
positions, unknown keys and executable getters, and proves immutable cloning.
The test-inventory command first fails with the unassigned new transport test;
adding its explicit unit-contract entry restores GREEN (115 entries).

Before the feature RED, existing real-LSP SDK/package binding characterization
tests pass (2/2) around extraction of source-resolution ownership. Existing
worker-protocol cases protect extraction of strict own-data-record validation;
required keys, node limit, prototype/accessor rejection remain unchanged.
Public reference result mapping is extracted without changing URI/range
conversion. Legacy engine 1,080 → 1,075 lines; worker protocol 2,108 → 2,073;
proxy 975 → 855. These remain migration debt, not newly accepted size limits.
New helpers and transcripts remain below 500 physical lines.

No default, SDK profile, closure admission, Worker residency, memory budget,
diagnostic capability or result-completeness policy is changed. No commit,
push or merge. Real Settings A/B and final focused totals are reported in the
[execution report](../reports/2026-09-26-settings-local-export-anchor-seed.md).

Check/build pass. The initial anchor/protocol focused command passes **43/43**;
the two additional seeded edit transcripts pass **2/2**; transport/inventory
passes **5/5**. The full fast command is run separately, not inferred from
these focused counts.

Three existing external-sampler tests fail inside the Codex filesystem/process
sandbox before producing RSS samples, including a fixture that never loads
the changed server bundle. Same-code authorized process-sampling replay passes
all **3/3** in 9,433 ms, with no changed assertion/deadline:

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test --test-concurrency=1 \
  --test-name-pattern='declaration façade A/B runner records external RSS|immediate replay requests exact references|references replay cannot pass when automatic diagnostics' \
  tests/ohos-typescript-spike.test.mjs \
  tests/references-replay-catalog-state.test.mjs tests/references-replay-cli.test.mjs
```

The isolated immediate-catalog test fails twice under sandbox sampling, then
passes unchanged with permission (2,725 ms). Diagnosis changes environment,
not production code or test gates. Preserve the full-run failure status; do
not call that original command GREEN merely because authorized probes pass.
Direct sandbox probe `/bin/ps -o pid=,rss= -p $$` exits 127 with
`operation not permitted: /bin/ps`, confirming the process-sampling restriction.

The completed current-build `pnpm check:fast` command exits 1 after
**981 tests: 978 pass, 3 fail, 0 cancelled/skipped/todo**, 955,287 ms. Its only
failures are the three external-sampler cases above, all reproduced and then
passed unchanged with permission. Full log:
`/private/tmp/arkts-local-export-seed-check-fast-20260926.log`.
All 22 anchor transcripts, reference batching/scheduling/freshness and strict
worker-boundary cases pass in that run. No blanket full-command GREEN or
release-graduation claim; three authorized probes are separate evidence.

## Multi-batch characterization follow-up

At the same parent and unchanged production build, two public framed-LSP
characterization tests force `ARKTS_REFERENCES_BATCH_ROOTS=1`. The first
requires more than one completed batch and `anchorVerified=true` in each,
with no standalone compiler anchor. Both compare complete URI/range sets;
the second includes the declaration. No behavior change or new RED is claimed:
existing implementation passes both (2/2, 4,046 ms). The full anchor file plus
transport boundary test passes **25/25** (56,736 ms):

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test --test-concurrency=1 \
  tests/semantic/references-anchor-reuse.test.mjs \
  tests/semantic-worker-anchor-seed.test.mjs
```

The transcript file is 313 physical lines. Production source and bundle hashes
are unchanged; the preceding full fast command's sandbox failure remains
recorded above and is not relabeled GREEN by this focused follow-up.
