# IX-03：目录输入类别、删除传播与对账准入（2026-11-05）

状态：实现与验证中，ADR0043仍Proposed；未提交、发布、部署或合并。
父版本298d65f5d7f796c347fe8be5c739e428066489d8；独立next副本
`/private/tmp/arkts-index-input-save-next-20261105`，集成副本另存。
证据根为原仓库 `.bench/index-versioned-maintenance-20261104/`。
所有测试都是隔离夹具/协议驱动，不是真实Zed点击或30K耐久。

## INPUT-011：目录生命周期被文件名分类截断

公开framed stdio LSP，真实Native和安装编译器，两源码Main/Unopened、符号Thing：
初始3个引用；新增目录及其中Late.ets后应5个；删除整个目录后应回3个。
仅发目录URI事件，使用同一查询位置和同一会话，避免换位置绕答案缓存。

原始 `ix03-directory-kind-probe.log`、正式 `ix03-directory-kind-formal-red.log`：
opaque.module成功；source.ets创建成功、删除后-32803；.gitignore创建后错误返回3个而非5个。
每阶段Native资格中indexedDocuments为3/2，说明Native已对账，不能把失败误归为SQLite未更新。
`ix03-directory-kind-*-results.json/events.json`保留实际请求和阶段时间。

调用链：didChangeWatchedFiles → WorkspaceFileChangeCoordinator.acceptOne/drain →
deliverWorkspaceFileInputs（Native先撤销证明）→ semantic workspaceFilesChanged →
SemanticDocumentStore.workspaceFilesChanged → classifyWatchedSourceChanges →
引用准入/完整性检查或答案缓存。两个独立缺口：

- 规则文件判断早于文件类型，.gitignore目录被当规则-only；Worker未收mutation，答案缓存未撤销。
- source.ets已删除无现存类型，按精确文件删除；已知子文件仍留在Worker成员列表；
  Native正确移除目录内容不自动改变另一个所有者的成员缓存，最终完整性保护拒绝。

实现边界：现存目录优先按实际lstat和物理包含处理，不猜测源码URI；不明目录只使根namespace不确定，
Native完整reconcile仍只写facts差异。已知删除前缀在Worker的排序成员目录内二分定位并展开后代，
继续走现有逐文件移除/closure/namespace失效；普通单文件仍为局部delta，不为它全根重置。
partial成员列表不会被展开操作升级为complete；未加载的成员从成员目录获得而非从AST缓存猜测。
删除的规则路径无法证明过去是文件，明确传configuration+namespace不确定性；
这不设置SDK configurationChanged，也不是把所有普通ignore变更升级成SDK重载。
已知工作区外symlink仍拒绝；根别名只在当前物理身份匹配时接纳，不全路径转小写。

后继6场景覆盖opaque.module/source.ets/.gitignore × 运行中创建/初始化前已存在。
`ix03-directory-kind-green.log`为先前9个场景；最终组合
`ix03-directory-final-v2.log`为68PASS/0FAIL/0skip，24.65s，类型检查通过。
前一组合67/68阴性保留：规则删除新增namespace后，原测试只期望configuration，
已改成精确双原因而非减少完整性断言。

同片对DocumentStore关闭overlay后的成员恢复责任做行为保持提取，
先 `ix03-membership-characterization.log` 50PASS，再组合检查。
DocumentStore1683→1661行，仍为历史债；新责任留在watched-source-notifications（134行）。

## INPUT-010：完全无事件的新增文件（开放，和已送达目录提示区分）

`ix03-missed-watch-probe.log`及`ix03-missed-watch-uncached-probe.log`均失败：
静默创建Late.ets，重复同目标缓存命中只返回3个；换光标绕缓存仍只返回3个。
所以不是单纯答案缓存问题。没有新Native input、Q或Worker成员更新，不能由旧资格推导磁盘永久不变。

有明确目录不确定提示的恢复已RED→GREEN：`ix03-directory-recovery-{red,green}.log`；
即先静默写，再发根目录通知，触发实际完整对账并同会话返回5个。
计划IX-03“无通知后对账”有此成功证据；完全无事件且未发生后继reconcile前的检测仍开放。
不据此偷偷使用0039拒绝的目录元数据代替完整源码证明、不清全部缓存/省最终fence。
须继续核对overflow/重连/显式恢复入口和公开完整查询合同；固定298d安装七份哈希核验后补相同夹具/位置/两种查询对照：
`ix03-baseline-missed-watch-controls.log` 0PASS/2FAIL，初始均3引用，静默新增后仍3引用，
实际请求/响应见ix03-baseline-missed-watch[-uncached]-responses.json。故已证明旧基线同样存在，
本候选也未消除，不能称新回归、也不能据旧版同错宣称正确。用户缓存持续写入源码树的漂移也保持开放。

## INPUT-012：完整任务准入等待全局排空（验证中）

MaintenanceInputs.flush循环等待整个delivery链；VersionedMaintenance.begin原来在其后才检查
input是否过期/调用者是否取消。共享ACK被占住时，旧完整任务无法独立结束，后继事件延长等待。
正式适配器公开驱动 `ix03-full-admission-red.log` 新增两场景均超时：
同一共享changes ACK仍被门闩保持时，分别替换input/取消完整请求。

后继改为精确input的准入等待：已有changes必须有自己的ACK，bootstrap/reconcile-only token由start观察；
替换或取消只结清该订阅，不取消共享mutation，不发送未accepted任务的Native cancel。
已取消不掩盖协议/I/O失败；当前任务实际accepted后仍遵守原终态/取消deadline。
不增加超时，不宣称持续真实变化时能获得完整稳定Q；稳定文件的URI任务进展与全对账资格是不同验收项。
最终结果另追加，不用尚在执行的局部验证宣称通过。

## 前两轮全检与测试oracle更正

旧完整检查 `ix03-integrated-approved-checks.json` 已结束：Node2360/2365失败；Rust/Clippy等通过。
32个实现/测试及3个oracle文件已按显式清单集成，非“仍next-only”。
后继 `ix03-final-assembled-checks.json` 在Native release成功后，Node全检中断130：
测试rendezvous发布了空JSON marker。停止的是独占测试进程组，保留inventory/receipt，未触用户进程。
marker改为写临时文件后原子rename；完整readiness+recovery26PASS/0skip，91.13s，非最终全量。

context5≠6已在独立bundle插桩定位实际same-content-promotion分支；
这是相同内容磁盘通知的既有L02优化，不应与S05会话复用计数混在一个对照中。
仅该复用比较的两个policy都关闭sameContentPromotion，保持3/6计数/实际诊断/Locations断言；
产品及其他测试默认1不改，完整相关29PASS。更早哪个读取者预先载入字节未被完整归因。

取消回归在实际安装编译器token callback内受控等待原token被取消、随后委托原token抛实际取消异常；
这证明同步检查阶段取消/资源合同，不是原自然竞态的同一现场。
Context7 TypeScript/Rust文档请求失败；实际安装ohos-typescript4.9.5-r10源码/哈希及既有官方资料为API核验，
不伪称Context7成功。所有旧阴性原样保留。

最终整体仍IN_PROGRESS。100K、各规模/两种增长因素、原30K2h、真实UI/Windows及完整资格/迁移等
按原计划继续；500ms软目标、无默认RSS预算和455冷目录3s授权例外不变。

### 后继冻结验证启动

`ix03-full-admission-green.log`为37项通过的中间片；收紧仅将明确AbortError/失效input归为取消后，
重新完整运行8文件 `ix03-namespace-admission-final.log`：105PASS/0FAIL/0skip，44.00s。
未改变源码后才采集集成清单 `ix03-namespace-admission-integrated-files.json`，14明确文件已集成。
集成W启动新的 `ix03-namespace-assembled-checks.json` 完整检查收据；旧失败/中断收据不覆盖。
DocumentStore仍1661行历史债，未新增超过500行文件。全量尚待结束，不预报通过。

### 规模/耐久驱动前置验证（不是规模测试结果）

保留mixed-03原harness/source/seed及全部动作，复制到证据根final-acceptance，不修改旧失败证据。
先前11/13因沙箱ps EPERM及未使用正式SOAK_NO_GC_OBSERVER环境失败；原样源码在正式环境
与正常只读进程采样下13/13通过（ix08-harness-characterization-authorized.log），未放宽断言。
新增两类可控规模生成器与精确Location/rename oracle、progress report/end分离有7项驱动测试通过。
oracle首片错误把import路径字符串里的Counter算作第四个标识，阴性保留，修为三个精确语法位置。
基线298d65f安装的launcher/server/两Worker/native/扩展/grammar七份哈希仍匹配原收据；
见final-acceptance/baseline-identity.json。这些准备不计为新128/2048/20K/30K或UI/2h执行。
原工作树其他40文件逐哈希一致（ix03-namespace-original-preserved.json）。

### Later namespace boundary, archive environment and actual old binary

INPUT-011: a directory named resources/base/element/string.json containing Late.ets
qualified3/returned5 references after creation, but deletion was filtered as
resource-only: no new Native input/Q within10s. Probe and per-stage evidence:
ix03-resource-named-directory-probe.log and ix03-directory-edge-resource_named_directory-*.json.
Formal8 cases first6PASS/2FAIL (ix03-resource-directory-formal-red.log).
A removed non-source entry has no surviving kind proof, so next uses the existing
namespace uncertainty fallback instead of guessing resource-file kind. No fake
source URI or SDK configurationChanged. Existing regular resource edits remain
resource-only. Related4 files23PASS/0skip,46.53s (ix03-resource-directory-green.log).
This two-file successor is next-only; frozen W is unchanged. Conservative semantic
rootDirty cost on resource deletion is not yet measured. Direct directory/file
replacement without an intermediate delete notification remains untested.

ENV-001: frozen W checkfast has3 archive/consumer failures and one test-file Node
heap OOM. This is NOT an LSP/Worker OOM. Preserve original full log and all exits.
Actual git ls-files inventory includes2599 target-experimental files with
477877756 logical bytes; other source is about20MB. Base64 JSONL exceeds the
Node0x1fffffe8 string limit:2 ERR_STRING_TOO_LONG, consumer REGRESSION_ARCHIVE_INVALID,
and semantic-release-regression-cli test process OOM. Further negatives require
individual analysis, not automatic attribution to this cause.
ix07-collector-source-inventory.json records actual names/stat totals, not physical IO.
N privately excludes target-experimental in .git/info/exclude; W does not.
Repair the test driver isolation by retaining our build outputs under ignored
target/ after the current frozen run ends, and use that conventional location
for future experimental builds. Do not drop source from collector, change its
assertions, increase V8/string limits, delete evidence or real caches. Then rerun
the same collector CLI and complete checks. Failed gate cannot start scale/soak.

IX-05 actual binary cross-check: fixed298d Native and current Native share one
isolated cache, new-first and old-first; ix05-actual-binary-compatibility-probe.log
2PASS. Old-first genuinely builds ready before candidate migration. Afterward old
catalog explicitly rejects unsupported index database application/schema version
1095912265/12; new-first old open likewise refuses. Candidate Q/store/head and
exact CompatibilityTarget search remain unchanged. Every response/timing and both
binary hashes: binary-compat-*/evidence.json. This proves safe refusal, not that
old binaries support new format, nor Windows/large-project migration acceptance.

### INPUT-014: directory replaced by regular file, one changed notification

Public LSP diagnostic and formal RED both reproduced two independent failures:
source.ets replacement kept ghost descendants and returned persistent-32803;
.gitignore replacement qualified Native2 files but returned5 stale references.
ix03-directory-kind-transition-probe.log and ix03-kind-transition-formal-red.log
retain both negatives. Both are input propagation/membership lifecycle issues,
not evidence that SQLite must bulk-write or the SDK must globally reset.

Next-only correction preserves rule URIs as distinct catalog-rules pending entries,
with existing queue bounds/overflow. Native still sees configuration uncertainty,
never metadata as source facts. Semantic delivery carries the URI through its
existing generic workspace mutation. DocumentStore derives source descendants
from its sorted known membership, removes only affected descendants and admits
an actual regular source replacement as created. Regular rule content updates
have no source descendants: no source content-version change or SDK configure.
Reference freshness observes rule inputs too, requiring the real post-input Q;
diagnostics refresh follows possible namespace changes, without SDK reload.
No new Worker wire field, unbounded directory history, fabricated file kind,
all-cache reset on every edit, identity-fence deletion or timeout increase.

The first combined probe52 tests had both LSP cases pass but failed the existing
realpath characterization:5 calls versus required3. Preserved in
ix03-kind-transition-green.log. Same-delivery classification now shares each
physical path observation within that phase; final same-content/identity fence
explicitly observes again. Original3-call assertion restored,50/50 membership
characterization passes (ix03-kind-transition-canonicalization-green.log).

Final9-file run ix03-kind-final-regressions.log:93PASS/0FAIL/0skip,57.63s.
Includes both direct replacements,8 directory creation/deletion scenarios,
normal rule create/change No-op(0 facts writes, exact definition, same SDK owner
count and1 Worker), Native128 composite, watcher/source contracts and manifest.
Exact reference Locations after replacement equal the pre-directory baseline.
New entry count313/bundle162 reflects actual manifest; no test was removed.
These changes are not yet integrated W; frozen old full gate still running
negative from archive build-output inclusion. Non-rule opaque/resource direct
kind replacement without delete notifications remains untested, not covered
by these two successful cases or the prior8 delete scenarios.

### Source namespace domain and build identity closure (2026-11-08 update)

INPUT-015: a resource-named directory replaced with a regular JSON file gave
correct3 references after the scoped semantic fix, but workspace/symbol still
returned the removed Late.ets symbol. The diagnostic exited0 because its first
oracle covered references only; raw ix03-resource-kind-transition-*_results.json
exposes the stale symbol and missing Q. Formal test now requires a new qualified
input and an empty removed-symbol result: ix03-resource-kind-formal-red.log3/4.
Do not count the earlier diagnostic exit0 as index correctness.

Correct input classification now asks the existing semantic project model whether
a namespace can contain sources, considering current configuration, lexical and
physical source roots, root aliases, symlinks and hardlink ambiguity. Unknown,
Legacy, overlapping or unprovable scope uses the existing namespace reconcile
fallback; only proven disjoint regular resource namespaces stay resource-only.
No directory history or new Worker wire field. This is input-domain classification,
not a replacement for qualification/final source fences. SDK metadata support is
not used as a whole-server health decision; the local module scope supplies this
classification. Default source layouts may contain resource directories; where
exclusion cannot be proved, source reconcile/semantic reset cost remains and must
be reported, not hidden as resource-only or claimed independent of file count.

Real production Stage/Native wire tests cover a disjoint custom resource root,
a physical source-root symlink overlap and a hardlink to an actual source file.
The disjoint case enqueues no source work; both aliases conservatively do so;
definitions remain exact with one Worker. The initial Stage fixture was invalid:
sourceRoots must name main siblings, not src/main/ets. An independent bundle-only
probe recorded source-root-not-main-sibling (ix03-source-domain-diagnostic.jsonl).
That negative was expected uncertainty, not a reason to loosen classification.
The corrected config uses src/main and an explicit disjoint res resource root.
No diagnostic patch is shipped; ordinary and instrumented results stay separate.

Final9-file ix03-source-domain-final.log105PASS/0FAIL/0skip,137.14s includes all
three Stage cases, resource replacement with symbol removal, source/rule kind
replacement, namespace lifetime, source/coordinator/manifest regressions.
Entry count314/bundle163. Proxy499lines, legacy engine687->686 (remaining debt);
classification stays in the small shared resource-file-identity module.

Frozen W whole run ended2026-11-05T01:44:55Z with unchanged source:
Node2370/2374 FAIL,4088.29s; default Rust retirement2FAIL; experimental retirement
2FAIL; fmt/strictClippy/release build commands exit0. Scale/soak controller stopped
for diagnosis and did not launch acceptance load. Source unchanged does NOT prove
the compiled dependency library incorporated that source.

ENV-001 resolved locally by retaining target-experimental as
 target/experimental-retained-20261105 (atomic rename, all outputs retained).
Unmodified collector+release-consumer2files24PASS (ix07-collector-after-build-isolation.log),
49.73s. No source filters/string/V8/assertion changes; real index caches untouched.

ENV-002: W Cargo reported Fresh for SQLite even though its debug binaries lacked
both the retirement test gate and the owned-executor log; N binaries had both.
W .d dependency lists did not include catalog_retirement.rs. Source mtimes preceded
cached dependency build timestamps: preserving older mtimes on source integration
can make Cargo reuse a stale library. Freshness trace and old binary/fingerprint
copies: ix05-w-cargo-freshness.log and ix05-stale-artifacts-before-rebuild/.
Clearing only this worktree's SQLite package build cache and rebuilding default
made both real shutdown/EOF gates pass2/2; a fresh experimental target also2/2.
Both rebuilt binaries contain the gate and executor markers; details in
ix05-after-fresh-build-identity.json. Markers are supporting evidence; the actual
public child-process lifecycle tests prove behavior. Old main409b Native mixed-
binary probe remains genuine runtime evidence but is not final-source acceptance.
Next assembled gate force-rebuilds all3 owned packages, keeps experimental targets
under ignored target/, and reruns whole Node/Rust checks with input/artifact hashes.
No user installation/process/cache is changed; no commits/merge/deployment.

### Final candidate integration checkpoint (2026-11-08)

The 19 INPUT-015 source/test deltas were integrated with content copying (no timestamp preservation); receipt: `.bench/index-versioned-maintenance-20261104/ix03-source-domain-integrated-files.json`. The independent candidate passed 105 focused public/characterization tests and TypeScript checking. These are not the complete assembled-candidate checks.

The first new assembled run was explicitly interrupted, not passed: package clean without `--release` left release SHA `409b08c4...` unchanged. Its process tree was stopped before acceptance load; `ix03-release-profile-intervention.json` and interrupted logs are retained. The replacement driver explicitly cleans all three owned packages in both default and release profiles, then runs release build, full Rust workspace, format, strict Clippy, experimental lifecycle regressions and full `pnpm check:fast`. Its receipt is `ix03-source-domain-final-checks.json`. Sources remain frozen during that run. Scale/30K acceptance waits for all six checks and immutable matching artifacts; no acceptance completion is claimed at this checkpoint.

#### Correction: release-profile identity after explicit rebuild

The explicit `cargo clean --release` removed 71 owned-package outputs and the following release build compiled core, SQLite and sidecar (15.56s). It produced **the same** `409b08c4cf8096c0e91854040602269690eb98a803c14ae1d9f50567588b61ea` hash. Therefore the preceding unchanged-hash observation did **not** establish stale release code; that hypothesis is disproved by the controlled rebuild. `ARKTS_INDEX_TEST_RETIREMENT_GATE` is guarded by `#[cfg(debug_assertions)]` in `catalog_files.rs`; its absence from release is expected. The separate stale debug/experimental dependency evidence and fresh 2+2 passing lifecycle tests remain valid. The interrupted run is retained as an unnecessary identity-verification interruption, not a product failure. The final checks continue on explicitly rebuilt artifacts. Evidence: `ix05-release-profile-rebuilt-identity.json`, `ix03-source-domain-final-clean-release.log`, and `ix03-source-domain-final-native-release.log`.

### Final test ownership and actual validation boundary

File-size audit found the modified legacy coordinator test at 1105 lines (parent1104). Its existing21 tests passed before extraction. Event routing was extracted into a cohesive254-line suite with a22-line shared build fixture; the old file is now843 lines (remaining migration debt), preserving all21 test cases and assertions. The first manifest run exposed the wrong assumed layer count; actual routing belongs to unit-contract. Corrected classification yields315 entries, unit-contract129 and bundle-e2e163; all4 manifest tests passed. No product behavior changed in this extraction. Raw before/after/manifest logs and the five-file integration receipt are retained.

The final prior Rust/release/fmt/Clippy/experimental commands completed successfully before this test-only integration. The following receipt explicitly reuses those five real executions only after asserting that the complete input delta is exactly the five JS test/manifest files: `ix03-source-domain-verified-checks.json`. It runs the complete `pnpm check:fast` again on the final test layout. Reused checks are labeled with their original receipt and basis; they are not represented as rerun. Scale/endurance remains gated on final complete success.

The original 100,000-document replacement-cost regression ran unchanged within the final Rust workspace and passed. Its two-test suite took65.62s; this is suite duration, not a single operation latency. It covers two complete stored catalogs and exact query visibility, not100K LSP/Program behavior. See `ix07-original-100k-cost-result.json` and full Rust log603–610.

### Current complete-check and evidence preparation checkpoint

Final unchanged native/product inputs: complete Rust workspace410PASS/0FAIL/1existing ignored, experimental lifecycle28PASS, release/fmt/strictClippy all exit0. Full final `pnpm check:fast` remains running under receipt `ix03-source-domain-verified-checks.json`; its acceptance waiter has not started scale or soak load. The raw100K replacement-cost test passed unchanged (separate store-only scope).

A diagnostic-only result summarizer outside the frozen product/acceptance directories has4RED→4GREEN test evidence at `.bench/index-versioned-maintenance-20261104/analysis/receipt.json`. It preserves failed attempts and functional gaps, labels unmeasured durations, separates runtime/scale/factor/cold-warm/trace groups, and documents percentile and interval overlap rules. It has not produced scale conclusions before the experiments.

Windows read-only SSH preflight failed with connection timeout to192.168.31.14:22 (`ix08-windows-preflight-20261108.json`); no deployment or platform validation occurred. This does not stop executable Mac verification. Remaining over-limit modified legacy files are migration debt, all reduced from their parent: core/lib1131, SQLite/lib761, DocumentStore1661, LegacyEngine686, installed smoke2142, LSP matrix902 and coordinator test843. New routing/helper modules are254/22 lines. No product thresholds or correctness assertions were relaxed.

2026-11-08 acceptance instrumentation: [scale controls and observation evidence](2026-11-08-index-acceptance-observation-and-scale-controls.md). Final37 driver controls PASS; actual release Native init/shutdown plus2DB postflight PASS. These are not scale/endurance results. Product full checkfast remains running with frozen sources.

Final complete2393PASS and active round03 scale evidence: [2026-11-08 candidate acceptance progress](2026-11-08-versioned-index-candidate-acceptance-progress.md). Earlier failures and interrupted receipts above remain historical, not the current complete-check result.
