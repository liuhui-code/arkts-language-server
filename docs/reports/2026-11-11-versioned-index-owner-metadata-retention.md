# IDX-V1-GC-006: closed owner metadata retention

Status: **confirmed; first isolated successor slice, not integrated or fully fixed**. Part of the existing ADR0043 IX-05 incomplete
metadata lifecycle, not a newly accepted architecture or a reason to delete real
cache files. Frozen candidate source68aa4629 remains unchanged. Parent298d65f;
the Windows test is an additive diagnostic variant, not part of the old full gate.

## Evidence that separates retained metadata from live resources

Completed Photos32 normal shutdown left3855owner lock paths. Read-only closed DB
inspection found3855owners (3851dead/4SQL-live),606groups,60pins,30030sealed versions.
All6previously sampled owned PIDs had closed; SQL-live does not prove an OS lock
remains held after the collector stops. This observation alone did not prove
which rows were unreferenced or a handle/Worker/AST leak.

A smaller Windows public-storage control removes those ambiguities:

1. Create a new empty `VersionedFacts` database, retaining the collector.
2. Keep one additional connection open.
3. Open and drop64more connections, serially; peak concurrent leases is3.
4. Execute256bounded `collect_garbage(4)` calls.
5. Read counts through a separate read-only SQLite connection, then successfully
   query the still-held public storage connection.

Actual: **66owner rows,2live,0groups,0versions,66lock paths**, held readPASS.
The new retention assertion fails66!=2; Cargo exit101,1failed/0ignored. Compilation
succeeded (8.66s); actual test1.19s. No failure was injected into product code.
No published receipt, creator FK or file version accounts for this history.
The lock-count assertion is after the first failing assertion and was not reached;
66paths are an explicit observation printed before the failure, not a passed
bounded-retention assertion. This is not a Windows-exclusive defect claim.

Command on the isolated Windows source:

```sh
cargo test --locked -p arkts-index-sqlite \
  --test diagnostic_owner_metadata_retention -- --nocapture
```

Test and raw evidence:

- `.bench/index-versioned-maintenance-20261104/namespace-final-20261109/owner-retention-control/diagnostic_owner_metadata_retention.rs`
- `windows-ix20-20261110/owner-retention-red-qualified-summary.json`
- `windows-ix20-20261110/owner-retention-red-evidence.tar`
- `namespace-final-20261109/photos32-closed-owner-metadata-counts.json`

All relative evidence paths above use the existing bench root. The receipt pins
test/log SHA and exact execution times. A first local invocation used an invalid
Python encoding name and stopped before SSH; the corrected command is the actual
recorded run. A pre-existing Windows `unused_mut` warning is separate from the
assertion failure; Windows strict-Clippy remains unverified, not silently waived.

## Direct cause and safety boundaries

`crates/index-sqlite/src/manifest_log.rs::open_checked` acquires a new owner for
every new storage connection. `manifest_owner.rs::OwnerLease::acquire` creates
a unique zero-byte lock object, locks it, and inserts a live owner row.
Dropping the connection releases the File/OS lock through RAII; it neither removes
the path nor deletes the SQL row. `versioned_gc.rs::collect_garbage` proves death
with a nonblocking OS lock and transitions live→dead, then reclaims dead pins,
retired entries and unreferenced facts. It has no owner-row/path deletion phase.
Thus even fully empty serial connections permanently grow this metadata today.

This is distinct from the already-fixed collector-per-quantum ownership problem:
the collector now retains its connection. Maintenance tasks still legitimately
open new connections; exact attribution of every Photos32owner remains unmeasured.

ADR0043 §8 allows removal of unreferenced history but explicitly protects stable
lock objects, active references and committed-ACK replay. Its later IX-05
implementation clarification already records header/owner/lock retention as
unfinished. The current code implements that conservative boundary, not complete
bounded metadata reclamation. ADR0028 whole-cache retirement is a different
operation and cannot justify deleting objects inside an active database.

Do not fix this by unlinking a lock after a PID/TTL test or by dropping all owner
rows. Other processes may have opened that inode; path reuse and stale proof can
create an ABA safety hole. Nor is deleting only SQL rows sufficient to bound the
filesystem namespace. Historical published group headers additionally implement
idempotent `ManifestLog::publish` replay; dropping them needs an explicit replay
lifetime/fence contract, not just a no-entries query. Active facts retain creator
FKs, so this empty-store case must not be generalized to all Photos32rows.

## Required next slice

Keep the current timed candidate frozen until its serial controls finish. Then
establish a lifecycle design that bounds unused owner/lock metadata while retaining
OS object identity, independent concurrent leases, crash proof, and old-reader
protection. Compare safe stable-slot/incarnation reuse with coordinated retirement;
neither is yet an accepted decision or implemented fix. Explicitly settle committed
receipt/retry scope before collecting published headers. Preserve existing ACK-lost,
ABA, live-borrower, cross-process and Windows occupied-file regressions; add failure
between each SQL/OS transition and interrupted-cleanup retry. The new empty-store
RED is the first acceptance case, not a replacement for those correctness gates.

No user cache, active lock inode or original project was deleted. No product
changes, release rebuilds, installations, merge or deployment were performed for this probe;
Cargo compiled only the additive test against the existing isolated source.

## First successor and mandatory artifact-identity correction

An independent `source-owner-next` was extracted from the pinned Windows archive;
local changes are preserved in `owner-retention-control/next-overlay/` under the
existing evidence root. The frozen Mac IX20 source and running artifacts are
unchanged. First implementation separates stable immutable OS lock slots from
new SQL owner incarnations allocated by a transactional per-store sequence;
GC deletes only unreferenced dead logical owner rows within its work quantum.
New-format9/109 schema is isolated; previous8/108 upgrade is **not yet implemented**.

The first empty-store control passed with2live logical owners/3lock paths. Fifteen
existing protection cases also returnedPASS. However a subsequent baseline→next
replay test exposed an invalid shared-build assumption: the two source copies
shared `CARGO_TARGET_DIR`. After the baseline compiled, next's test ran with the
old library: next source declares9/109 (actual remote file SHA
`bd8e0f74d6779d5628e0477735207a7a9dad2debd21ea9e2ea0b5304ab030239`),
but its actual new database reported **format8**,17lock paths. This is not a
qualified failure of the new slot algorithm. Exact Cargo fingerprint/mtime
mechanism remains unmeasured; source/runtime mismatch itself is confirmed.

The build-directory sharing was this investigation's error. Both failures and
dependency records remain preserved; none are overwritten. A fresh, previously
absent target is now used exclusively for next:
`C:/Users/liu xun yuan/AppData/Local/Temp/arkts-owner-slots-next-20261111-target`.
All17focused cases are rerunning there, with executable hashes and actual data
format recorded. Earlier localGREENs do not substitute for this qualification.

The additional public replay control on the baseline passed latest-head/current
facts, old facts collection and lost-ACK replay assertions, then failed because
16publications retained17lock paths. It intentionally retains16group receipts;
the new design must bound lock objects without erasing those receipts or moving
old facts' creator/pins to a new incarnation. Its first next-source execution was
the contaminated-format8 result above, **not** a verified new-code regression.

Evidence: `first-slice-qualified-summary.json`, `next-preparation.json` under
`namespace-final-20261109/owner-retention-control/`; Windows logs
`owner-slot-replay-red.log`, `owner-slot-replay-green-attempt1.log`,
`owner-slot-shared-target-observation.log`,
`owner-slot-shared-target-source-observation.json`. The fresh target execution
remainsRUNNING at this checkpoint; no full/regression/production completion claim.


### Fresh-target terminal qualification

Dedicated target completed17/17PASS across7binaries,0failed/ignored/filtered,
2026-11-10T18:33:30.1859771Z–18:34:04.8880792Z. Actual data format9;
empty-store2live owners/3slots;16published groups/2slots, old facts collected,
original committed replay1 and current head16 preserved. Receipt with raw log SHA
and each executable hash: `owner-retention-control/fresh-target-qualified-summary.json`
under namespace-final-20261109. This supersedes the earlier RUNNING checkpoint,
not the retained shared-target failure. The exact new format and executable
identity are measured rather than inferred from source pathname or basename.

A previous-format fixture producer initially used an invalid base filename
`symbols.sqlite3`; the existing API correctly refused it before building a store.
That is a diagnostic setup error, not migration failure. The failed output
directory is preserved; the fixture now uses the required `symbols-v2.sqlite3`
and a new output directory. Actual8→9 migration RED/GREEN is still pending.
The existing protection log also contains a deferred-retirement os3 message;
a same-suite baseline comparison and lifecycle interpretation remain pending.
No assertion was suppressed because of that log.

The corrected previous producer subsequently passed, creating a real format8
selected catalog/head1 in `owner-format8-fixture-02`. The current next consumer's
public `CatalogMigration::begin` then failed with **Incompatible: unsupported file
facts format** at the parent-pin assertion. Raw `owner-format8-parent-red.log`
is a genuine upgrade-path RED, distinct from the earlier fixture naming error.
Normal new-format creation is therefore insufficient for integration. The next
slice must provide an explicit known-previous-layout migration parent, retain old
reader/owner ABI and final parent-head fences, and continue rejecting unknown
formats/current queries before owner registration. Implementation is still pending;
no in-place schema relaxation or deletion of the old store was used.


### 2026-11-11: private previous-layout upgrade and style evidence

The isolated successor now accepts only the matching known previous8/108 layout
as a private migration parent, using the old unique-lock lease ABI. Ordinary
VersionedFacts opens remain strict9/109. A same-domain previous layout is still
MigrationRequired: identical domain text cannot make incompatible facts current.
The initial parent-open RED and the later same-domain migration-gate RED are
preserved. After the two fixes, the gate passed2/2; a separate real8→9 private
publication passed, including new qualification and an old held reader's old
snapshot. No in-place schema migration or real-cache deletion occurred.

Native cache retirement initially passed3 and failed1 because the management
format allowlist did not recognize9. The exact known-format allowlist now covers
8/9 and108/109 with the existing physical-layout checks; all4 cases passed.
Twenty-four public cache safety cases also passed as characterization. Windows
strict Clippy initially rejected a pre-existing cfg-dependent unused_mut; moving
the mutation into the Unix-only branch preserves policy without suppressing
warnings. cargo fmt --all -- --check and cargo clippy --workspace --all-targets
-- -D warnings subsequently exited0. Raw logs and the formatted source were
retrieved in owner-next-formatted-source-and-v8-fixture.tar, SHA256
92db274d993124f85d4752878cd69417a88ae98f52b18e5527063d1a947b0fcc.

These are separate focused runs on the successor, not new full Rust/Node checks,
release builds, UI tests or a long soak. Real previous-format fixtures are being
converted to per-test copies before integration; the experimental108 producer
has passed and was verified to emit108. Published receipt/header retention remains
unfinished. The frozen Mac IX20 source and runtime have not been changed.


### Windows full native gate and isolated Mac integration (2026-11-11)

The isolated successor completed cargo test --workspace:423PASS,0FAIL,1existing
ignored pinned455 release-fixture case,0filtered. The ignored case is not waived
for correctness; it must run separately with its pinned input. Relevant release
build exited0; Windows Native SHA256 e9b797567c841c981e811cb9190f7f8caf569a733f64547e2e46ebb3fc92b232.
Full raw log SHA2563d0a7d751f71562f3f7910c747e683484626734a96d2fd11b198a9d7d855b1a2.
Receipt: owner-retention-control/portable-and-workspace-qualified-summary.json.

After verifying all2441previous W inputs byte-identical,27coherent source/test/
compatibility-fixture/provenance files were copied into the isolated Mac worktree.
Previous files are backed up and frozen IX20 test/runtime evidence remains intact.
The new Mac candidate now requires fresh validation; old2463PASS/Photos32 does not
validate it. A separate focused Mac check is running. No original-root product
files, daily runtime or user cache was modified. Published receipt retention is
still open. No merge, publication or full acceptance claim.


#### Cross-profile migration evidence (2026-11-11)

Self-contained per-test copies of actual previous-producer8/108 data/control
fixtures now pass default8→9 and experimental108→109 public migration tests,
including failed source/admission followed by successful retry and old-reader
snapshot preservation. Windows successor workspace423PASS/1existing455fixture
ignored; relevant release buildPASS. The455correctness contract is not waived.
Mac isolated integration followed a2441-input drift check and backups; focused
20casesPASS actualformat9, strictfmt/ClippyPASS. The current Mac full gates are
still running, so this does not close final acceptance or change Proposed status.

This evidence narrows the previous upgrade-path uncertainty. It does not prove
old-peer8 concurrent head updates under every failure window, bounded committed
receipt history, all same-head qualification history, Windows realUI, or current
candidate2hour endurance. Those remain explicit validation/design work; no replay
expiry, identity bypass, unsafe unlink or implicit threshold was introduced.


### Retained Native reply versus persistent storage receipt boundary

Code audit of the current producer finds one retained last Start and one terminal
Value (maintenance.rs133/209–210/325 and maintenance_executor.rs125/127/219). A
new accepted change clears terminal; a completed task replaces it. Same-input
retry is refused as accepted=false and returns status, whereas older/foreign
input is invalid_generation. This is not an in-memory queue retaining all1603
terminals. Storage group headers have a different lifetime: the generic public
publish_group API can replay a committed group's original head after later heads
and old fact GC, as the16-group characterization verifies. Group owner FKs then
prevent deleting those referenced logical owner rows even after OS leases end.

Therefore bounded lock objects do not by themselves bound published group rows.
Deleting group headers because the Native terminal slot changed is not justified
by that generic storage API contract. A further repair, if implemented, needs an
explicit reclaimable-receipt lifetime and non-reuse fence for that producer,
without silently expiring existing generic committed replay. This audit establishes
the different ownership boundaries, not a new approved TTL/expiry decision or a
claim that a Native status response releases its database receipt. No such product
change was added while the current native gates are running.


#### Real previous-producer peer-head race: both profiles passed

An additional controlled Windows cross-process experiment uses a separately
compiled actual8/108 producer executable to update the selected old data while
new9/109 has already pinned it as migration parent. Old producer public facts
API publishes head1→2 and verifies the new document. The already-pinned new
candidate then reports is_current_parent=false, rejects activation with
InvalidGeneration **before** invoking the source-scan callback, and leaves the
old physical store at head2. Both profiles passed. This closes the previously
unmeasured previous-layout peer-head boundary for this controlled sequence;
it is not a claim about every OS/filesystem failure interleaving or real UI.

The two diagnostic sources and verify-real-previous-peer.ps1 are retained under
owner-retention-control; previous-peer-qualified-summary.json binds both old
executable SHA256s and raw logs. They are explicit cross-version diagnostics,
not environment-dependent tests added to the Mac full suite. No product source
was changed for this experiment. The earlier423-case Windows full check precedes
this additive diagnostic and is not relabeled as including it.


### Mac native final slice and test-observer integration checkpoint

Mac native gate completed430PASS/0FAIL/1existingignored in cargo test --workspace;
the ignored455fixture was then run explicitly and passed correctness1/1. Its cold
catalog measured3234.09ms; only the3s timing assertion uses the existing user
waiver. All455postflight source hashes match the pinned fixture. Experimental
focused15PASS, default focused20PASS, fmt/strictClippy and releasePASS. Source
inputs2459 matched after each gate. Native release SHA256
fae5cce64796177724558ed04790b493a6ef09e8cecffa05963240085378dee5.
These overlapping test sets are not summed as unique tests. Receipt:
owner-retention-control/mac-native-qualified-summary.json.

Windows new-Native protocol followup:13casesPASS,12actual Native identities all
SHAe9b797567c841c981e811cb9190f7f8caf569a733f64547e2e46ebb3fc92b232,
all12closed normally. A first13PASS was not sufficient:8directory cases' helper
hardcoded a default path, shadowing inherited candidate selection. That attempt
is retained with reduced attribution. The second run uses explicit per-fixture
selection and passive identity/exit observation. No real UI/Photos claim.
Receipt: owner-retention-control/windows-new-native-lsp-qualified-summary.json.

The shared test helper selection bug now has a real public LSP RED: requested
copied executable but observed default installation; minimal helper fix honors
ARKTS_TEST_NATIVE_BINARY, retains explicit per-test override, and chooses the
Windows.exe default. Its public identity test GREEN follows. A separate Mac
observer RED (1PASS/1FAIL missing wire file) becomes2PASS with optional passive
wire observation, preserving ownership output, split UTF8, callbacks and actual
write backpressure. Exact same oldNative5fwas used for that observer control;
it is not new-native behavior acceptance. Existing ownership fixture is extended,
not duplicated as a permanently separate portable implementation.

Eight test/support files were integrated after native gates; no product JS or
Rust source changed. Initial focused launch used the wrong cwd and found no test;
that setup failure is preserved. Corrected run20PASS/1FAIL exposed the expected
stale inventory332versus334 after2new executable test files. Inventory was updated
to exact334 with explicit assignments; Native-backed public test belongs in the
bundle layer. This retains the completeness assertion rather than relaxing it.
Fresh focused attempt3 is running before new whole pnpmcheck:fast.


#### GC006 committed receipt / resource ownership separation (Proposed, 2026-11-11)

A public16-publication control on actual format9 preserved current data, held
reader and old committed replay, but retained18owner rows despite only2live
connections and one current fact creator. Stable lock slots alone do not clear
the ownership references held by empty historical published groups.

The next minimal slice retains each published group ID/state/commit sequence as
the durable idempotency receipt. It does not expire receipts or reuse group IDs.
Within the existing bounded GC transaction, only a published group with no
remaining manifest entries and an owner already proven dead may detach its
resource-owner FK. Unpublished/staged/live-owner references and current fact
creator/pins remain protected. Query head/namespace/qualification and publication
identity must not change. Old SQLite read transactions continue to see their
previous snapshots. Current same-head qualification receipts are intentionally
retained under the existing exact token/replay contract; no TTL or watermark
pretends failed tokens were ever qualified.

Represent the detached owner explicitly as NULL, constrained to committed
published state; this is a component-layout change, proposed10/110. It requires
private migration from known8/108 and9/109, with the correct old lease ABI for
each. Normal query opens remain strict; incompatible physical layout/tag must be
rejected before owner registration. Do not patch active9DBs in place. Cache
management must recognize the exact known layouts and still protect unknowns.

Required regression: the actual18-owner RED becomes bounded by live leases and
referenced current creators while first committed replay stays1/head16/current
facts exact; budget1 makes progress without exceeding existing logical GC budget;
live/unverifiable/replaced locks do not authorize detach; staging/cancel/crash,
old-read snapshots, group-ID reuse rejection and real old8/9 private upgrade/peer
head fences remain valid. No API-wide replay expiry or unrelated cache policy.
Implementation belongs only in receipt-owner-next while W remains frozen for
its current check. This is not an Accepted/review record or a completed fix.


### 2026-11-11：GC006 资源引用与逻辑身份分离（当前隔离候选）

本节修正前述“将 owner 置 NULL”的中间提议；该提议未成为最终实现或已接受决策。
历史成功回放与 group ID 不复用要求保留创建者身份。实际格式9对照通过身份保持测试，
中间格式10原型A却失败，因此已封存并放弃原型A。

当前原型B保留 `manifest_groups.owner` 为不可变逻辑创建者，另设可空外键
`resource_owner`。仅当组已经 published/abandoned、没有剩余 manifest entries、
资源所有者经现有租约协议证明已结束时，预算内GC才可解除这个资源引用。
仍活跃或不能证实结束的所有者、当前 facts 创建者和 reader pins 继续保护资源。
组ID、状态、提交序号、精确历史回放及同head资格合同不变；不采用TTL、删除历史回执、
复用ID或删除锁文件来换取有界资源数量。逻辑回执本身仍可增长，不宣称所有元数据有界。

这是10/110组件布局变化，支持私有迁移真实8/9及108/109输入；普通查询打开旧布局仍拒绝。
旧8与9使用各自实际租约ABI。新格式必须检查逻辑身份列与资源外键的不同角色，
不能只改格式标签接受旧结构；布局不匹配在注册owner/获取锁槽前拒绝。

截至本检查点：隔离Windows原型B的17个Rust测试目标共41项通过；默认与实验布局的
迁移/失败重试/旧快照/错误布局测试各7项通过；四组真实旧写者8、9、108、109推进后，
新候选拒绝过期父版本（每组2项通过）。预算1、活跃引用保护、SQL失败回滚后重试、
原始创建者不可变均有回归。故障注入只证明对应事务失败，不替代真实进程崩溃测试。
这些集合有重叠，不相加称唯一测试数。证据：
`.bench/index-versioned-maintenance-20261104/namespace-final-20261109/owner-retention-control/terminal-owner-split-qualified-summary.json`。

新布局尚在隔离目录，未集成到冻结的Mac格式9候选，也未部署；其全目标回归与release
构建在进行中。Mac同源2462输入的正常权限 `pnpm check:fast` 另行运行，不能用于证明
格式10已通过最终验收。最终同候选全量、规模与两小时协议验收仍待完成；真实UI未验证。


### 2026-11-11 最终10布局：Windows完整Rust与公开LSP检查

修正夹具缺失后，隔离Windows `cargo test --locked --workspace --all-targets`
433PASS/0FAIL/1existing455ignored，实验布局25PASS；`cargo build --locked
--workspace --release` 退出0。276项Rust及外部夹具输入逐项后验无差异。
Native SHA256 a64504fa9edc2f5340441f73d16d046a8972995cfb5b485303e9affb01ea2832。
另外公开LSP13PASS；12实际native身份均匹配新构建，12正常exit0。
仍不是Windows真实UI、Photos混合长测或Mac最终全量验收。
收据：owner-retention-control/terminal-owner-final-native-qualified-summary.json
与 terminal-owner-windows-lsp-qualified-summary.json。原始首次缺夹具失败保留。

Mac格式9基线 `pnpm check:fast` 已完成2466PASS/0FAIL/0skip/0cancel，
3860.864秒，2462输入无变化；不将其归给格式10。随后备份并集成26文件，
当前格式10工作树2475输入，快照1a45cd7845b48eee826fcdbe28c08036a6b6dad3e58a60c688738e7cae2c54d0。
Mac新native检查正在运行，最终全量与同候选规模/两小时协议测试仍未完成。


### Mac格式10最终native终态与IX22启动（2026-11-11）

`cargo test --locked --workspace --all-targets` 440PASS/0FAIL/1existing455ignored；
该455用例另外显式运行，正确性1PASS。实验物理布局25PASS，fmt、严格Clippy、
`cargo build --locked --workspace --release` 均退出0。2475输入每阶段无变化。
Mac Native SHA256800e66281afb57afe4c129a17923b7778fbd0fbf4cf817d2f591caa4685bc07c。
证据：owner-retention-control/mac-format10-native-qualified-summary.json。

随后启动最终候选全新IX22 `pnpm check:fast`，旧格式9的2466PASS不替代它。
Photos36控制器只等待IX22完整成功、Rust输入/检查日志及79项产物精确核对后才启动
校准与7200秒单会话；当前尚未开始实际负载。控制器失败即停止，不自动换候选重试。
规模37/密度38/拓扑39驱动回归通过，实际矩阵未开始，按Photos后串行顺序执行。

工作树沿用前次格式9时已存在的4个8/108 fixture WAL/SHM旁文件，已记录在冻结输入
中；测试只include完整DB字节并物化scratch，不使用旁文件。它们不是产品输入或待提交
文件，后续整理候选时须排除；当前不在检查运行中删除导致快照漂移。新集成清单已排除
全部8个归档旁文件，原始证据保留。没有删除用户缓存或日常安装文件。


### Final format10 IX22 terminal and live endurance checkpoint (2026-11-11)

Fresh full pnpm check:fast exited0 at2026-11-10T22:59:29.788603Z:2466PASS,
0fail/skip/cancel/todo,3815.775729s; all2475source inputs unchanged. Strict combined
gate revalidates exact282-input same-candidate fresh Rust checks reused by this
Node gate, the actual Native800e binary and79complete runtime assets. Raw gate
log SHA25653c28f8c42c07d4e055f488120048f65d9624ef3cfa6dc38e02354570df0d86f.
Receipt: namespace-final-20261109/ix22-terminal-qualified-summary.json.
This is final10 verification; older9 full PASS is historical only.

Photos36 then copied verified artifacts and original isolated inputs, calibrated,
and started formal single session2026-11-10T23:06:46.905Z. At00:21:02.560Z it had
4455.655formal seconds,709formal actions/3192completed formal requests (provisional
snapshot), no failed actions or protective stop.183full-scope refusals remain
functional gaps, not successful references/rename. Current sampled peaks include
Node1164.14MiB/Native245.06MiB/tree1419.50MiB; independent peaks are not additive.
Do not infer final stability, memory leak absence or full feature completeness.
Readonly audit waits for true normal close, SQLite integrity, original restoration,
fixedSDK/actualruntime and logged sleep-free formal window. Scale37/density38/
topology39 wait for exact predecessor receipts and run serially only after review.
No matrix load yet, no realUI claim, no publication/merge/deployment.
