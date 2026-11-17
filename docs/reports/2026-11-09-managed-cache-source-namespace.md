# 受管缓存源码命名空间：Native 所有权证明第一片

状态更新：单工作区的语义/Native/事件排除已接通并定向 GREEN；完整生命周期/多根及最终验收未完。
以下先保留 Native 第一片时的范围，接线后继与未完成项见文末。
Node/Worker 扫描、watcher 和 Native walker 的排除尚未接通，原公开引用预期 5 / 实际 7 的 RED 保留。
这属于 IX-03 原“受管缓存入源码树排除合同”，不是新的无关缓存治理或缓存清理授权。

## 身份及失败证据

实现副本 `/private/tmp/arkts-index-versioned-maintenance-20261104`，父提交
`298d65f5d7f796c347fe8be5c739e428066489d8`，包含本轮未提交改动。
证据根 `.bench/index-versioned-maintenance-20261104/namespace-final-20261109/`。
Native 公开回归命令：

```sh
cargo test -p arkts-index-sidecar --test managed_cache_namespace --locked
```

`native-owned-namespace-red.log` 实测初始化结果没有 `managedCache`，目录断言失败。
`native-owned-namespace-green.log` 首片 1 PASS；后继增加 legacy / versioned 两种布局，
包含缓存根等于源码根；`native-namespace-lease-final-tests.log` 为最终相关六文件的结果。
这里的 Rust 实际 sidecar 协议不是公开 LSP；上层原 RED 是真实 framed-stdio LSP。

## 已实现的调用链及边界

1. `cache_gc/lease.rs:82`：实际 CacheLease 获取共享使用锁、检查受管布局后捕获目录证明。
   证明来自 `cache_gc/namespace.rs`，保留实际目录句柄（Arc 克隆共享同一对象），不是只缓存数值 inode。
   文件内容/目录 mtime 不参与此所有权证明；SQL、WAL、普通内部文件写入不会使目录对象失效。
2. `CatalogStore::managed_namespace` 经 Control 的实际 lease 获取证明；非受管布局不凭空生成证明。
3. `workspace_runtime::initialize_workspace:42` 在 Store 已打开后取得证明，Store 移入实际
   legacy index 或 versioned reader，原租约生命周期仍由 Store/Control 持有。
   初始化结果增加可选 `managedCache`：`directory`、`workspaceIdentity`、不透明 `objectId`。
4. Native `cache/namespace` 仅接受空参数，核验同一目录对象后返回该 owner 的证明。
   未初始化返回 `uninitialized`；目录替换返回 `cache_namespace_changed`，不让调用者选择证明路径。
   字段证明仅说明缓存归属，不说明源码新鲜度、SQLite 当前资格或目录内容没变。
5. `CacheLease::record_use` 在写前、以及取得可能等待的 use 锁后核验同一目录对象；
   目标使用捕获的规范物理目录。已替换路径不会被旧 owner 在关闭时重新打上 last_used。
   原 GC/输入/发布锁、DB/WAL 整组生命周期与 source/config/SDK 最终 fence 未移除。

目录身份使用已有 Unix dev:ino / Windows file-id 实现及已有 no-reparse 校验。
新持有句柄使旧目录在证明有效期内仍是实际对象，避免只靠数值 inode 的复用窗口。
这不是将目录元数据变成源码内容缓存，也不改变 ADR0039 的 Rejected 决策。
ADR0043/0044 仍 Proposed，不新增虚构审核或追认记录。

## 验证内容和未覆盖

公开 Native 用例验证 legacy 嵌套缓存、versioned 缓存根等于源码根、初始化前拒绝、
参数不可注入路径、正常内部写入证明不变。Unix 控制在 SQLite 仍打开时将叶目录移动并用
同名新目录替换，还复制旧 cache-use.json：证明必须拒绝，关闭后替换目录的 metadata 字节不变。
真实 Mac 执行；Windows 分支仅复用已有平台实现，Windows 实机及占用/目录替换尚未执行。
持句柄后真实 GC/并发 use-load/缓存打开相关回归参与，不能等同所有崩溃及并发窗口均已穷举。

## 下一片必须完成，不能由 Native GREEN 代替

- Node 对实际 Native 初始化路径/工作区身份严格核对，结合往返证明和自身目录对象观察建立
  可重验的 root-scoped 策略；不从配置 D 盘、猜测 key、cache-use.json 单独授权排除。
- 策略通过有序输入同步交给语义 Worker；更换策略撤销旧请求资格，恢复新 Worker 必须重放。
  不伪造 SDK/config 变化，不让客户端 progress ACK 或索引不可用阻塞 SDK 初始化。
- TS 枚举/文件事件与 Native walker 使用同一所有权边界；只排除实际证明的叶范围。
  cacheRoot 本身与 Cache/User.ets 等用户源码兄弟不得被排除。父目录不确定事件仍保守处理。
- 证明失效、物理替换、Native 退出重开、多根/多窗口、Worker 恢复、冷/暖初始化均要有对照；
  快照/最终 fence 与单一终态保留。未知目录不能通过目录名字取得永久屏蔽。
- 原公开 7→5 回归转绿且不漏真实兄弟源码后，才进入最终完整检查、规模及新候选耐久。

本片不部署日常 Zed、不删除真实缓存、不提交合并，不宣称 UI/Windows/30K 或原引用缺陷已通过。

## 最终本片验证收据

`native-namespace-lease-final-receipt.json`：最终源清单不变，六文件 Rust **29 PASS/0 FAIL/0 ignored**；
严格 Clippy 全相关 targets、fmt 与 release 构建均 exit0。新 Native SHA256：
`75ec68c9fc18ad4b115c0e2f6e93d316cdf8644543bbe456bb45530c4ce5bbe3`。
旧 `9034ad301aaca22c3cb516778c8e044fa4593be50eba674b61efc6f800732dce` 已独立保留。
`native-namespace-node-compat.log`：真实 framed LSP 版本化维护/并发多根初始化 **5/5 PASS**，12.936s，
证明加字段没有破坏这些现有客户端路径；不是 Node 已消费证明或已实施扫描排除的证据。
未封存的早期 release 在后续源改动前启动，仅标中间构建，不用其通过替代最终稳定源构建。

新 Native release 后重新执行原源码树公开用例，`managed-cache-after-native-proof-red.log` 仍是
**预期5/实际7 的真实断言失败**（0PASS/1FAIL/7filtered，1.480s），不是 SDK/启动失败；
证明第一片没有冒充整个缺陷修复。原主工作树40份其他工作哈希保持，未启动 UI/压力/用户进程。


## 后继：单工作区语义/Native/事件链已接通

本节是后继状态，不用第一片的 Native-only GREEN 代替当前链路。
原 7→5 公开回归在 `managed-integration-public-01.log` 首次定向通过（1 PASS/7filtered）。
扩大到对账后的 Native 范围又获得确定 RED：`managed-native-scope-red.log` 中语义为5，
Native `indexedDocuments` 实际4、预期3，并收录缓存内 generated 符号。
随后同源 Native 排除已实施；`managed-native-scope-green.log` 定向通过。

实际接线：

- `index/managed-cache-namespace.ts` 严格读取实际 initialize 证明，核对原 workspaceIdentity 与
  配置经过实际回退/规范化后的 cacheDirectory+v2key 叶路径；以 Node 目录对象观察包住
  Native `cache/namespace` 往返，并要求同一不透明 Native objectId。没有证明的旧测试适配器
  不获排除权；常规源码树外缓存不创建源码排除策略。
- SidecarWorkspaceIndex 在调用 owner 回调前安装已协商的 versioned 状态，避免回调读取错用
  legacy status。打开失败/进程故障/关闭撤销该 owner 的策略。
- `WorkerManagedSourceNamespaces` 单调序号阻止迟到回调恢复已经撤销的 owner；仅让已在途的
  本根初始化先结算，随后经 workspaceFilesChanged 传递 root-scoped 策略；不启动新准备、
  不发 configureProject/configureSdk，不让 SDK 等待索引 progress ACK。源码树内缓存的 Native
  start 可等待已在途的本根准备结算，这是保护该初始扫描的明确取舍；外部默认缓存没有这一步。
- 新 `managedSourceNamespaces` 为内部 workspace mutation 字段：严格普通数据对象、最多一个
  该根 owner 叶、绝对非 NUL 路径和有界数字身份；空数组是显式移除，不能被合并吞掉。
  canonical/wire/queue coalescing 均保留最新策略及普通源 changes，namespace 改变必须 rootDirty，
  原传输大小约束保留。NUL 反例 `managed-wire-nul-red.log` → `managed-wire-green.log` 17/17。
- 父线程保存实际策略并写入新 Worker data；语义 Store 每引擎持有独立 registry。
  枚举只跳过仍匹配物理对象的实际叶，末尾重验使用过的排除证明；替换后不得沿历史路径永久跳过。
  尚未有新 Worker 恢复/目录替换端到端控制，不能只凭代码将它们标已验收。
- Native legacy/versioned walker、单文件 inspect、版本化发布前再次枚举，以及 legacy checking/
  publishing 边界使用初始化时持有的相同目录证明；不删除源码/SDK/配置最终 fence。
- watcher 在普通目录/资源/配置分类之前使用当前受管证明，文件/叶目录/WAL 删除提示均不会
  被转换为源码 dirty；替换后证明不匹配时仍走既有保守目录路径。

`managed-watch-and-candidates.log` 定向 **1 PASS / 7filtered**（2.511s）：精确5引用、真实
Cache/User 的两处保留、Native 对账恰好3源码、generated工作区符号为空；资格恢复后实际
`references.index.accepted` candidateFiles=3。随后发送受管 ets、目录、WAL 删除三个真实 LSP
watcher事件，相同引用仍答案缓存命中，未产生额外 namespace reconcile。不是30K性能或UI验收。
协议/队列控制 `managed-policy-wire-and-ordering.log` **21 PASS**：含原17协议和4队列用例，
证明 held mutation ACK 屏障下普通事件不会吞掉策略、显式空数组覆盖旧策略、输入对象后改不能改已排队内容。

为满足500行合同，在原行为25/25、提取后25/25 GREEN保护下提取旧路径别名候选标识、
父线程工作区输入编排；旧 workspace wire interface 收敛到其 codec，legacy 来源最终核验提到
`maintenance_source_fence.rs`。原别名探测的条件式候选键语义保留，新受管身份没有全路径小写。
目前 proxy497、runtime493、sidecar486、maintenance_engine474；document-store1626 / protocol1783
仍是缩短后的既有迁移债，不称已消除。

## 仍需完成的合同与证据

- 真实目录替换/恢复及 Native 生命周期失效的完整 LSP 对照；特别检查已在途和新打开的
  CatalogStore/维护/后台回收是否在原 owner 目录证明失效后仍会向同名替代目录创建元数据。
  这是待最小控制验证的风险，不据静态阅读宣称已发生或已修复。
- Worker 致命退出/受控重建后的策略重放、旧请求终态隔离及当前源结果。
- 多根共享缓存拓扑：目前只向 owner 本根下的实际叶建立策略。若工作区B的缓存放在A源码树内，
  A是否也排除该活跃叶尚未覆盖；跨根覆盖/并发注册/退出的设计和对照仍OPEN，不能称所有多根已支持。
- 存量非活动缓存/未知子目录不凭cache-use.json或名字排除；.leases父目录变化与真实配置/目录
  不确定性保持保守，不能将本个稳定叶用例推广为完全无目录漂移。
- 适用最终全量pnpm/Rust、最终产物规模和新的30K正式耐久尚未完成。此次无UI/Windows，
  不沿用旧候选2397/2412检查或H13两小时来证明新实现。


## Final receipt for this integration slice (not full acceptance)

- `managed-broad-receipt.json`: 14 Node files, **153/153 PASS, zero skipped,
  192.282s**. Its 1156 selected source/test/config inputs and four runtime hashes
  were unchanged. This selected manifest is not a complete fixtures/vendor freeze.
- Native related six files **17/17 PASS**; strict Clippy and release build passed.
- A later adapter control exposed a raw transport spelling mistake:
  `managed-transport-canonical-spelling-red.log`. It uses a real Mac directory
  and equivalent external alias with a mock Native round trip; it is explicitly
  not real Native/Windows evidence. Scope and Node observations now use the
  already verified expected leaf instead of the raw Native path spelling.
- After this three-line adapter change, controls **29/29**, real stdio LSP/Native
  **13/13**, build and TypeScript check passed. The older 153-pass receipt remains
  pinned to its own pre-change identity, not relabeled as the latest full gate.
- The public managed-cache case now independently covers nested Cache and
  cacheRoot=sourceRoot. `managed-root-placements.log`: **2 PASS / 7 filtered**,
  2.483s and 2.470s. Each preserves User sibling references, yields exact five
  locations, Native three-file qualification and no private generated symbol,
  restores three-candidate narrowing and retains an answer-cache hit after three
  cache watcher notifications. Raw per-layout evidence is separate under
  `managed-root-placements/managed-{nested,source-root}/`.
- `managed-current-receipt.json` records all current hashes and exactly three
  source/test deltas after the broad receipt (including the test parameterization).
  These separate runs are not one full check:fast, a 30K performance result or UI.

Owner directory replacement/stale Native opens, actual Worker replacement replay,
overlapping multi-root cache leaves, final whole gates and fresh scale/endurance
remain OPEN. Prior H13 and full-check evidence belongs to its older frozen build.
No commit, push, merge, deployment or real cache deletion was performed.


## 2026-11-09 owner lifetime closure: directory replacement and actual Worker replay

This section supersedes the two corresponding OPEN items above, only for the tested single-root
idle replacement and actual controlled Worker-exit scenarios. Overlapping multi-root, Native owner
failure classification, adversarial in-flight filesystem changes and final complete/scale/endurance
gates remain OPEN. ADR0043/0044 remain Proposed; no review/status change is implied.

**Actual defect (IDX-V1-CACHE-NS-001):** after a qualified Native cache leaf was moved outside the source
root and a same-name new directory with Recovered.ets was created without a watcher event, references
correctly recovered all five locations, but the retired Native owner stamped metadata into the new
source directory. Initial `managed-replacement-red.log` preserves cache-use.json, catalog-state.sqlite3,
symbols-v2.sqlite3/lease and publication-lock creation. Admission guards initially removed the larger
writes, but `managed-owner-lifecycle-final.log` caught a remaining publication-lock-only race. These
failures are retained; the first GREEN was insufficient.

- A shared `managed_cache_admission` validates the **original** held-directory identity before lazy
  reader/maintenance/catalog reopen and before publication. It does not create a new owner from a
  pathname or waive final source/content fences.
- Retirement uses `CacheLease::acquire_expected` with the original Control namespace; a mismatch
  cannot construct a new lease whose Drop would update replacement metadata. Invalid retired owners
  still drop resources, but do not reopen/prune through a replaced name.
- `Control` pins its original publication-lock file identity. Live shared/exclusive/try locking opens
  an independent descriptor with create=false, compares file identity and checks again after waiting.
  The clone is an identity pin, never the descriptor through which locks are acquired. This also avoids
  depending on unspecified repeated locking of cloned handles. Initial construction still creates its
  own lock; this is not a custom SQLite VFS or a proof against every hostile filesystem interleaving.
- Final public framed stdio lifecycle run `managed-retirement-final.log`: **2 PASS / 9 filtered**.
  Directory replacement returns exact old three + Recovered import/call two references; shutdown is
  code0, source bytes unchanged and replacement contains **only Recovered.ets**. Five additional serial
  independent sessions all exit0 (`managed-replacement-repeat/execution.json`); these are not endurance.
- Actual Worker replay: old semantic thread exits17 via the existing controlled exit-idle seam;
  one replacement serves the same five reference locations and readiness source count3, excluding
  Generated.ets while retaining real Cache/User.ets. Peak simultaneous primary Worker=1, total2,
  active after close0, no audit orphan cleanup and every response ID has one terminal. Replacement
  exit1 occurs **after shutdownComplete**, not an observed crash: raw audit send shutdown at
  1794191298274, receive shutdownComplete1794191298302, exit1794191298322; production
  `shutdownSemanticWorker` explicitly calls terminate after graceful drainage. LSP process exits0.
  The earlier test failure before cache priming never reached exit injection and is not replay evidence.

Current related checks: **22/22 Node, no skip** (`managed-life-related.log`); focused Native14;
`arkts-index-sqlite --all-targets --locked` **199 PASS / 0 ignored in56 suites**; strict related
all-targets Clippy and release build exit0. Node runtime hashes are unchanged from the preceding
receipt; current release Native SHA256 **be0845065bf75480e91d7ebe57934a742d8fbda070646d0374391ed5a8db5d43**.
See `managed-retirement-current-receipt.json` and raw audit under
`managed-retirement-final-audit/managed-namespace-worker-replay/` in the evidence directory stated above.
No full current check:fast or complete Rust workspace claim is made. Forty unrelated Root files
were rehashed unchanged (`root-other-work-recheck.json`).

Official API check: Context7 Rust std resolution failed at transport (mcp.context7.com); no successful
Context7 result is claimed. Installed Rust is1.95.0. Pinned [official Rust1.95 File source](https://github.com/rust-lang/rust/blob/1.95.0/library/std/src/fs.rs#L793-L805)
documents platform locking and cloned-handle caveats. Hosted1.95 docs/local rustdoc were unavailable;
local probe is retained in rust-lock-docs-local.json. Implementation uses independent lock opens,
with held File clones only for identity/lifetime. No Windows execution in this slice.


## Native failure is not a source-directory role change (second lifecycle tracer)

Public framed LSP test `tests/semantic/managed-cache-owner-lifetime.test.mjs` first returns exact3
references with the live index. After **only this fixture's actual Native child** is SIGTERM-terminated,
without changing its physical cache directory or Generated.ets, the previous code revoked its Node/
Worker source policy. A fresh cursor query returned5 including the two generated cache callers.
`native-owner-exit-red-02.log` and `native-owner-exit-red-02/native-owner-exit.json` preserve the actual
responses, source reconcile events and controlled SIGTERM receipt. The earlier RED log is retained
but its late cleanup hook did not preserve raw evidence; the second run corrects observation only.
This is a controlled child failure, not proof of a spontaneous Native crash or an OOM.

The fix is confined to the SidecarWorkspaceIndex failure callback: fail index tasks as before, but
keep the established directory role until workspace close. A directory role is not an active process
lease or a content proof. Every source scan still checks current dev/ino/birthtime/canonical path;
workspace close/failed admission still revoke. No failed index result is treated as complete.
After GREEN, a second control moves that directory and creates a same-name Recovered.ets without
watch: the same session recovers all five **real** references, not Generated.ets, and the replacement
contains no metadata. This shows retained role does not turn into permanent pathname exclusion.

The first GREEN and extended replacement GREEN are preserved separately. The final observation seam
uses a portable NODE_OPTIONS spawn observer, not an executable .mjs launcher; it does not synthesize
messages or kill anything itself. Final Mac run `native-owner-portable-audit-green.log`: **1/1 PASS,
0skip**,1.905s; Native identity count1 (no hidden restart), readiness source2, normal LSP shutdown0.
Raw child stdout/stderr, protocol responses and events are retained in the corresponding evidence
subdirectory. Windows code paths have not run, so portability is not Windows verification.
The test is registered in the existing fast bundle manifest. Current full checks are being restarted
with fresh source/runtime identity; previous 22-pass/199-pass runs precede this parent-only behavior
change. They are supporting evidence, not the new full gate. Overlapping multi-root scope and final
scale/30K endurance/UI remain unaccepted.


## Overlapping roots: confirmed counterexample, not yet repaired

The previously OPEN overlap risk is now a real public protocol counterexample, under the same current
server/Native identities as the Native-failure-role receipt. Two roots each contain Main/Unopened;
both real Native owners open the same configured cache root. After initial ready4/indexed4 and first
reference result3, the test puts Generated.ets in **B's actual opened private cache leaf** with a real
import of A's Unopened.neverQueried. This manufactured cache source tests the exclusion contract;
we do not claim that the product itself normally generates .ets files in its SQLite cache.

- External shared cache control: references **3 ->3**, PASS.
- Shared cache physically inside A/Cache: references **3 ->5**, FAIL; the extra locations are the
  generated import and call in B's private leaf. Both sessions close normally. No OOM, timeout or
  performance inference. Raw initial catalogs, inputs, source contents, public responses, complete
  captured events/messages and close receipts: `managed-multi-root-public-red/{external,inside-first-root}.json`.
- Durable public regression `tests/semantic/managed-cache-multi-root.test.mjs` (69lines), registered in
  fast manifest. Command: `ARKTS_TEST_NAMESPACE_EVIDENCE_DIR=<fresh-path> node --test --test-concurrency=1
  tests/semantic/managed-cache-multi-root.test.mjs`. Parent298d65f; exact source/runtime receipt follows.
  Earlier standalone `managed-multi-root-probe.mjs` has the same1PASS/1FAIL. These are not UI/Windows.

Direct code gaps: `readManagedCacheNamespace` lines31–32 returns no proof for B because B's leaf is
outside **B's own root**. `ManagedSourceNamespaces.view` lines48–49 selects only the queried root's
registration. `WorkerManagedSourceNamespaces.update` lines19–21 mutates/invalidates only that owner
root. Native `catalog_walk::walk` and `maintenance_file_input::inspect` accept only the local owner's
single namespace. The public semantic false callers are proved; actual Native indexing of the new
Generated file was not awaited and is **unmeasured** (trace only shows initial2-file qualifications).
Do not claim that changing the Node map alone repairs Native scope or workspace symbols.

The new complete ix11 checkpoint was stopped before product edits after this counterexample. Only
its driver and three exact descendants were SIGTERM-stopped; all were verified absent afterwards.
Native release had completed; workspace Rust was still running, remaining checks and check:fast were
not reached. `ix11-managed-owner-final-checks.json` status **STOPPED_NOT_COMPLETE**, controlled PID
receipts and all logs retained; frozen2415 inputs were hash-identical through the stop. It is neither
a full PASS nor a product test timeout. Promoting the regression later intentionally changes the test
manifest, and the next final gate must start from a new freeze.

### Next implementation slice / non-negotiable boundaries

1. Keep **owner identity** separate from **roots whose source view contains that leaf**. One
   server-owned attested set may affect multiple roots; root-view selection must use physical
   containment across that set, with per-scan object validation. Unknown historical leaves,
   `workspaces/` parents and source siblings are not excluded by names/metadata.
2. Carry the same policy into Native full walkers, point inspection and final source fences, as
   well as semantic/Worker membership. Adding/removing a relevant policy invalidates affected source
   scopes, not SDK configuration. Do not settle for Node-only correctness plus permanently mismatched
   Native fingerprints or leaked workspace symbols. Normal external cache registration must avoid
   needless invalidation/rebuilding of unrelated roots.
3. Give policy propagation an ordered revision/ack boundary. An active build/read cannot publish a
   result qualified for a previous exclusion set; reuse existing source-input and final publication
   fences. Account for roots opening concurrently/later, owner failure vs workspace close, replacement,
   recovery replay and revoke racing a delayed grant. No all-cache clear or blanket root restart.
4. Promote/extend the current RED through exact references **and** Native source count/private symbol
   exclusion; add owner removal/replacement and initialization-order controls before new full freeze.
   First inspect existing sidecar input/mutation negotiation for the smallest complete propagation;
   do not add an unversioned fire-and-forget control or treat two SQLite DBs as atomic.

These are execution constraints for completing the current feature, not an Accepted architecture
change or a delivery claim. ADR0043/0044 remain Proposed; the original final scale/formal30K gates
and known SDK/ref/rename limitations remain. No publish/merge/deploy or real cache deletion.


## 2026-11-09 cross-root implementation and current targeted closure

This section supersedes the preceding **not yet repaired** status for the tested current same-cache-pool
multi-root cases. Parent remains298d65f plus the dirty implementation; there is no new commit/deployment.
ADRs remain Proposed. This is Mac isolated framed stdio/real Native, minimal fake API24 SDK, not Photos/UI/Windows.

### Implemented ownership and scheduling contract

- `attestManagedCacheNamespace` retains both the Native owner proof and Node's independently bracketed
  physical directory proof. An owner outside its own source root can still supply the actual private
  leaf to a different containing root. No cache-use.json/name-only authority or whole-parent exclusion.
- `WorkspaceCacheNamespaces` separates owner membership from each root's physically contained leaf
  set. It sends only changed per-root sets, validates current directory identities before republishing,
  and drops stale peer roles before a later owner is admitted. Ordinary external cache layouts send
  no semantic source-policy mutation and no Native peer-policy invalidation. Process failure retains
  the workspace-owned role; workspace close removes it. Physical replacement is revalidated by scans.
- The existing ordered Worker workspace mutation now carries a complete per-source-root set, allowing
  several attested directories. It retains rootDirty, immutable descriptor validation, duplicate-path
  rejection, accessor/NUL/shape checks and the **existing total message-byte limit**; no arbitrary new
  project-file quota. SDK configuration is not marked changed. Existing per-root sequence guards drop
  delayed obsolete grants, and retained per-root sets are replayed in new Worker data.
- Native adds negotiated `managed-source-namespaces-v1` to versioned maintenance. Optional
  `managedCacheNamespaces` travels **with the existing issuer/revision changes** and namespace
  uncertainty, through the existing exact-ACK/coalesced-successor barrier. [] explicitly revokes;
  null is rejected before assigning a revision. Native validates the managed key, same configured
  cache pool, containing source root and original physical object, then holds a directory File pin;
  it does not initialize the peer or acquire/refresh its cache-use lease.
- Full discovery, point inspection and final source fences use the task's same peer view. A replaced
  peer is no longer excluded; a directory changed after being skipped fails the final check. The
  initialized **local storage owner's** admission/retirement checks remain separate and unchanged.
- A peer-policy input uses existing active-task cancellation and reader invalidation. Until the new
  scope has a complete current qualification, Native old-scope reads fail `source_scope_unqualified`;
  a separate scope epoch rejects a read crossing a policy update. Actual held-read evidence shows
  the existing Runtime invalidation produces one **cancelled** terminal; no late success. The initial
  test expected invalid_generation, but the earlier Runtime cancellation was correct; the failed
  oracle and its correction are retained, not reported as a product failure/fix.
- Initial Native catalog admission waits for other opening owners **only when the root actually
  contains an admitted private leaf**. External cache roots and later reconciliations do not wait
  for unrelated openings. Before a first catalog, policies are staged for that build without
  scheduling a duplicate full reconcile; after it starts, a relevant change schedules the existing
  merged successor. No timer delay, SDK reset, new Worker generation, budget or deadline increase.

### Actual RED/GREEN and exact verification scopes

- Original public two-root RED: external3->3, cache-inside-A3->5 WRONG. Current final public run
  `managed-multi-root-lifetime-final.log`: **4/4 PASS,0skip,10.125s**, both workspace-folder orders and
  both placements. Every first/post-artifact reference is checked against the exact three known
  locations. A real unnotified source-content edit forces Native reconciliation to two actual sources;
  generated workspace symbols stay empty. In both inside-A cases, moving/replacing B's actual cache
  makes Recovered.ets real source: exact five references, Native A qualifies three sources and returns
  the recovered workspace symbol. Full LSP shutdown0; replacement directory/source bytes unchanged,
  with **only Recovered.ets**, no cache stamping. Raw per-case inputs/responses/events/close are under
  `managed-multi-root-lifetime-final/`. The Unix live-directory move block is not Windows evidence.
- Native public `managed_source_scope` first RED unknown managedCacheNamespaces; after implementation,
  tests cover forged object-ID rejection without advancing input, explicit [] withdrawal, ordinary
  post-qualification point edit/discovery, held old snapshot invalidation, and same-owner requalification.
  Final `managed-native-null-policy-green.log`: **2 PASS /0ignored**,11.95s. The new optional-field null
  RED accepted/advanced input incorrectly; the guard now rejects it before parsing/assignment.
  `managed-peer-native-evidence-final/managed-peer-qualified.json`: indexed1, **writtenDocuments0,
  factRowsWritten0, reused1**, head2/currentInputtrue. Scope removal reuses actual unchanged facts;
  this small control is not a physical-write or scale complexity measurement.
- Current Node ownership/wire/input ordering controls `managed-peer-ordering-controls-final-02.log`:
  **42/42 PASS,0skip**. Independent REDs preserve stale-peer resend, duplicate bootstrap rescheduling
  and opening-isolation errors before their repairs. Real filesystem coordinator control proves a
  late C grant excludes retired B from both Native and semantic policy snapshots. Message coalescing
  retains immutable latest peer proof/explicit empty revocation with ordinary URI changes.
- Related public/controls earlier in this turn: **31/31 Node,0skip** and focused Native **18 PASS**;
  after the argument-only SourceView extraction,4 Native characterizations PASS. These precede later
  small fixes and are not relabeled latest full gates. Strict related Clippy passed after SourceView;
  fresh final release and TypeScript check passed. Current whole gates will be re-executed, not inferred.

### Boundaries / remaining verification

Current reader warming is confined to the optional index. It does not mark the SDK or whole semantic
server degraded or fabricate a complete partial result. If another real source prevents complete
qualification, this changed-scope index remains unavailable until inputs become provable and a later
reconcile succeeds; no automatic SDK/semantic Worker restart is used. This conservative availability
tradeoff is explicit; partial scoped index projection is not claimed implemented.

Current public composition uses one configured cache pool. Native peer admission deliberately rejects
proofs from a different pool or lacking the new capability. Old/scripted adapters without a proof
get no source exclusion authority; older proof-capable binaries may retain single-root behavior, but
cross-root scope support is not silently fabricated. Different-pool cross-root topology and actual
Windows/real-SDK-in-source-cache layouts have not been verified. Root-opening order controls are four
independent sessions, not one endurance session or a deterministic delayed-open UI trace.

Full current check:fast/Rust/workspace experimental checks, latest scale and a new actual30K formal
single-session soak remain pending. Old H13/2412 gates retain their historical build identities.
No complete-feature/UI acceptance, constant-time query, merge/publication/deployment or real cache
cleanup claim is made. Full source/receipt and pending execution are recorded below/in progress.json.


## Frozen ix12 live checkpoint / supplementary two-root Worker replay

`ix12-managed-peer-final-checks.json` now records default workspace Rust **425PASS/0FAIL/1 existing
ignored**, fmt/strictClippy/release/experimental-retirement and all six required supplemental checks
exit0 (including actual455 correctness with the standing timing-only waiver, and experimental peer
source-scope controls). `pnpm check:fast` is still RUNNING; this is **not** a complete gate PASS.
2420 frozen inputs remain unchanged at this checkpoint. Report additions here are in canonical Root
only while the separate W candidate stays frozen; documentation synchronization waits for the gate.

A separate E-only diagnostic derived from the frozen public test exercises **two source exclusions
through an actual semantic Worker replacement**. Both original and expanded transcripts are kept.
`managed-multi-root-replay-supplement-receipt.json`:1PASS/0skip,5.970s for the expanded run, controlled
old thread exit17, primary created2/physical peak1/afterclose0; same exact three references after
recovery. prepare:false honestly reports **unprepared**, not READY. Explicit prepare:true in that
same session reports **ready**, source count2 and the same exact three references, with no third
Worker. The test then retains the real peer-directory replacement/source recovery checks and normal
LSP exit0. The replacement's exit1 follows graceful shutdownComplete/termination; no OOM claim.

Reproduction scripts and all responses/events/worker audit/close evidence are under the namespace
phase as `managed-multi-root-worker-replay[-prepared]-supplement.mjs` and their respective output
folders; the expanded exact filename includes `worker-replay-prepared-supplement`. These are isolated
protocol supplements, not new CI test entries, actual UI, Windows, scale or a combined endurance
session. They do not mutate W source. Fresh full Node gate and subsequent scale/new30K soak remain.
