# 完整查询的静默新增源码反例

状态：已实施名称/磁盘输入准入与 Native 范围核对候选，相关回归已转 GREEN；完整验收仍未完成。
以下初始 RED 与调用链保留；后继实现、反例及验证见文末。
这是 IX-03/计划既有 INPUT-010 的后继，不是将范围扩大成一般缓存优化。
此前全检和两小时协议耐久只证明各自冻结候选及已执行场景，不能覆盖本反例。

## 身份和执行

- 工作副本：`/private/tmp/arkts-index-versioned-maintenance-20261104`。
- 父提交：`298d65f5d7f796c347fe8be5c739e428066489d8`，包含本轮未提交候选。
- Node：20.19.5；SDK 是公开回归的隔离 API24 最小桩，不是 Photos 实际 SDK。
- 使用此前冻结候选构建，新增测试后没有重新构建产品；确切哈希见下述收据。
- 回归文件：`tests/semantic/references-silent-source-lifecycle.test.mjs`，已登记 bundle-e2e。
- 执行：`ARKTS_TEST_NAMESPACE_EVIDENCE_DIR=<证据目录> node --test --test-concurrency=1 tests/semantic/references-silent-source-lifecycle.test.mjs`。
- 两条行为回归 0 PASS / 2 FAIL；测试登记检查 4 PASS / 0 FAIL。
- 非 UI、非耐久、非 Windows 实测；未修改真实 Photos 或真实缓存。

证据目录：`.bench/index-versioned-maintenance-20261104/namespace-final-20261109/`。
`two-route-red-receipt.json` 绑定运行产物/测试哈希、逐次响应与分支；
`two-route-public-red.log`、`cached-resident-{responses,events}.json`、
`uncached-indexed-{responses,events}.json` 保留原始失败。

## 可重复步骤与实测

1. `Unopened.ets` 导出 `Thing`；`Main.ets` import 并构造它。初始化完成。
2. Main 第二行第 24 列查询引用，包含声明，精确得到 3 个位置；相同请求重复仍正确。
3. 磁盘新建 `Late.ets`，同样 import 和构造 Thing，不发送文件通知。
4. 再查 Main 的 Thing，正确完整结果应为 5 个位置。

| 独立会话 | 请求方式 | 实际响应 | 关键日志 |
|---|---|---|---|
| cached-resident | 原查询完全重复 | id=4 成功返回旧 3 个位置 | `references.cache.hit` |
| uncached-indexed | 关闭 resident fast path，字符位置 24→25，仍在同一标识符内 | id=4 成功返回旧 3 个位置 | cache miss；`indexed-declaration-identity`；candidateFiles=2；preparedDocuments=2 |

每轮前两次结果均通过完整位置断言。两轮都在成功响应遗漏新增引用处失败，不是初始化失败、超时或测试夹具异常。
测试允许短暂 -32803 后同会话重试，但不接受任何“成功且不完整”的中间结果。

## 已确认的调用链和缺口

1. `register-reference-capability.ts` 先调用 `semantic.cachedReferences`。
   `references/reference-cache-admission.ts:16` 对打开文档直接发布缓存；其 key 绑定已知
   root revision、当前文档内容/版本/位置，未通知的磁盘新增没有推进该 revision。
2. 绕开缓存后，`semantic-worker-proxy.ts` → `reference-query-router.ts` →
   `reference-candidate-selection.ts` 接受原生 `indexed-declaration-identity` 的旧候选集合。
   `index/versioned-maintenance.ts:72–89` 检验已观察 input 的 ACK 与前后相等；
   没有事件的磁盘新增不会自动成为新 input。这些检查本身没有出错，但不足以证明当前磁盘成员完整。
3. `reader_worker.rs:73–82` 用已存在的 qualification 选择读快照并标记 ready。
   此处未重新发现磁盘新增名字；数据库快照一致性不等于外部文件命名空间仍然完整。
4. Worker `reference-anchor-preparation.ts` → `workspace-membership-admission.ts:14–21`
   只在 partial/enumeration-error/source-unavailable 时重扫。先前 complete 的缓存成员集合仍为 2。
   因此不仅索引候选少了 Late，语义侧也没有重新发现它。

这是多个层次共同遗漏同一类外部变化，不是已证明的 SQLite 事务错误、Worker 换代或内存泄漏。
缓存单独清空不能解决第二条已实测失败路径；只重扫 Worker 也不足以直接授权旧索引候选完整。

## 修复必须满足的边界

- 完整查询的缓存、候选资格与语义成员准入必须绑定当前同一输入范围；失配撤销完整资格并由既有 owner 对账恢复。
- 同时覆盖第一次查询、重复缓存、未命中缓存、驻留快路开启/关闭、增删/移动恢复；终检期间发生变化不能发布完整旧结果。
- 不把“未收到通知”视为“没有变化”，也不把目录 mtime/ctime 不变视为完整名称集合证明；ADR0039 仍为 Rejected。
- fresh enumeration 的作用域、Native ignore 规则与语义项目准入需要明确对齐，不能先假定三者的路径集合相同。
- 不能每次编辑无差别清全部缓存、删除最终磁盘/符号链接核验，或把正确性反例改成预期成功。
- 若需要实际重新发现名字，其 I/O 成本必须在补测中单列；此前低延迟缓存数字不能直接沿用。

受管缓存在源码树内的排除合同仍单列 OPEN：当前枚举器固定忽略 `.arkline/.git/build/node_modules/oh_modules`，
没有通用的“当前实际受管缓存物理路径”排除合同。不能任意忽略名为 index/workspaces 的目录，
更不能配置缓存根等于源码根时排除整个项目。此项还需要真实受管目录生命周期的独立失败回归。

## ADR 与下一步

关联 [ADR0043](../adr/0043-versioned-file-index-maintenance.md) 的 input/qualification、漏 watch 恢复与 IX-03 后继，
[ADR0037](../adr/0037-navigation-work-and-input-validation.md) 的请求/最终输入核验，
[ADR0039](../adr/0039-validation-directory-observations.md) 的拒绝目录元数据内容证明。
以上保持原状态；尚未将新的候选方案记为 Accepted 或冒充已实现。

下一片先对齐完整查询的 namespace 证明与恢复所有权，再实施最小修复；随后重跑本反例及目录生命周期、
候选/缓存/驻留对照与相关完整检查。修复后的必要规模与长测使用新产物身份，不复用旧候选通过来代替。


## 实施后继：名称、磁盘输入与 Native 覆盖范围

本片已开始正式产品实现，没有修改主工作树产品文件或部署日常 Zed。候选仍在同一 W 副本。
旧 H13/完整检查的构建独立保留；本片重新构建 Node 产物，Native 未改、未重建。

实际改动：

- `project-readiness.ts` / `project-source-namespace.ts`：实际枚举当前准入成员，单独报告名称摘要；
  只有内部完整查询使用 `captureSourceInputs`，经现有 token/read 端口实际读取项目磁盘源码并核对末尾成员状态。
  不创建 Program；不将目录 metadata 未变当作内容证明。每次只保留该次摘要所需 URI/SHA 元数据，未加 AST/文本常驻缓存。
- `reference-namespace-admission.ts` / proxy：首次无法证明独立 Native 先前扫描覆盖当前输入，或实际名称变化，
  交给现有工作区单写调度器做 namespace 对账；仅磁盘字节变化则只请求对账，不伪造目录变化、不丢弃精确文件待办。
  不发送 semantic rootDirty/configuration/SDK mutation。未保存 overlay 内容继续由现有文档/Program 证明负责；
  overlay-only 成员不授权 Native 磁盘候选裁剪。关闭 owner 时解除观察摘要引用。
- `reference-cache-admission.ts` / `reference-query-entry.ts`：打开和关闭文件的答案缓存都需当前完整输入证明；
  请求结束仍读取证明，随后重新断言原请求 revision。输入变化拒绝旧结果，不能只是不存缓存后继续返回旧完整答案。
  没有源码变化时仍可实际命中缓存。新的校验成本需要实测，原 1ms 缓存值不能沿用。
- `workspace-membership-admission.ts` / `interactive-workspace.ts`：完整引用、重命名等完整范围准备重新发现成员；
  仍保留已有容量失败证明的保守语义，未上调规模、超时或内存阈值。
- `reference-candidate-selection.ts`：Native ready 只证明自己的输入范围，不等于语义范围。
  复用现有 `crates/index-sqlite/src/catalog_fingerprint.rs::CompleteScanInputs::finish` 的源集合摘要：
  按 Native URI 排序，u64 小端 URI 字节长度、URI 字节、原始 source SHA-256 字节。
  当前语义准入源码的 URI+磁盘字节集合必须与 Native qualification 的 v2 摘要完全相同，才允许候选裁剪。
  原有 store/domain/input/head、qualification 相等、绑定解析与编译器最终核验继续执行；摘要相同不能代替它们。
  额外/遗漏的源、未知摘要格式均退回完整语义搜索，不修改 SQLite、不截断结果、不把整个 index 标为坏。
- `register-reference-capability.ts`：缓存证明也已成为 Worker 工作，故与未命中搜索共用前台/后台诊断屏障；
  `finally` 恢复诊断，避免新校验又排在后台诊断后面。

### 额外反例与验证边界

| 情况 | 原始失败 | 当前证据 |
|---|---|---|
| 静默新增，缓存命中或避开缓存/驻留 | 两条成功旧3位置，应5 | 两条公开回归 GREEN；实际热缓存命中保留；Native 对账后3候选恢复 |
| 直接重命名导出类声明 | H13 原构建返回旧3编辑，应5 | 候选返回3文件5编辑；Main打开版本1，其他文件版本null |
| 已有 Dormant 文件静默加入调用点、名称不变 | Native旧2候选，成功旧3位置，应5 | GREEN；后继 Native 只写1文件、复用2文件，恢复3候选 |
| `.gitignore` 排除调用者，语义项目仍包含它 | 首次保守搜索5，Native恢复后退成3 | 新增公开 RED→GREEN；明确记录 scope-mismatch 后完整语义结果仍5 |
| 缓存校验遇正在执行的诊断 | 公共请求1815.73ms，校验先入Worker，未先过诊断屏障 | 受控1800ms诊断场景30.68ms；暂停→旧诊断终态→校验→缓存命中，Worker始终1个，当前诊断后续发布 |

以上时延是小夹具的受控诊断实验，不是 30K 性能结论。没有新增500ms硬门禁。
候选 `scope-candidate-controls-10.log` 28/28，含 Native 实际解析带空格/emoji/特殊字符文件名；
`cached-diagnostic-barrier-green.log` 完整8/8；加严必须观测“诊断尚在运行”及终态先于校验的同例另1/1，7条按名称过滤。
合并相关集 `namespace-related-11.log` 实际 57/57、0失败/0跳过（69854.95ms），不是 check:fast；
绑定 `namespace-related-57-pass-receipt.json` 的构建/源码快照，随后恢复入口修订不追认这57项已重跑。
中间39项与源码身份见 `intermediate-source-inputs-39-pass-and-scope-red.json`，不能把该39项通过追认给之后新增的 scope 回归。

Windows URI 只做了与 Rust 共用向量的模拟比较；真实 Native Unicode/百分号路径是 Mac 实测，不是 Windows 实机通过。
重命名初稿误选了导入后的局部名，返回当前文件编辑是正确行为，不能算产品失败；
`global-rename-baseline-red.log` 才是已纠正为导出声明后在保留的 H13 构建上的有效 RED。
`global-rename-oracle-05.log` 的证据目录 ENOENT、旧 scope 字段假设导致的等待失败也原样保留为测试自身错误，不算产品缺陷。

### 仍须完成

1. 重命名当前已补起始成员刷新；执行中发生静默变化的最终 namespace fence 还需公开回归及修复/核验。
2. 受管缓存入源码树的物理路径、所有权及 watcher/枚举排除合同仍 OPEN，不能忽略整个缓存根或任意 `index/workspaces` 目录。
3. 在 GREEN 下整理新增回归的共用夹具与可读性；最新候选运行适用完整检查，再补受影响规模/30K混合长测。
4. 精确范围相等是安全准入：Native 若覆盖更大的无关范围，也会保守放弃裁剪；收益/代价需实测，不能宣称所有规模成本已消除。

原30K完整引用/重命名、SDK partial、UI/Windows未实测限制不因此关闭。没有提交、推送、合并、发布或清理真实缓存。


### 恢复入口的后继验证

新前置校验不能仍按纯状态观察处理，否则熔断后即使输入修复，它也会先失败，真正的引用请求永远到不了共享恢复准入。
已用真实LSP子进程、受控4次构建/租约清理失败打开原有共享熔断器复现：id7返回 -32603/worker unavailable，
`explicit-reference-recovery-red.log`。这不是原现场的真实OS崩溃复现，而是明确的恢复入口回归。

修订：内部 `captureSourceInputs` 代表用户完整查询的前置工作，沿用已有显式恢复准入/根创建路径；
纯 `prepare:false` 状态请求仍不创建Worker或消耗探测。没有新恢复计数器，也没有放宽3次/窗口、输入修复条件或截止时间。
watchdog原有“实际编译同步且有效命令终态”健康判定保持，纯输入摘要成功不被当作编译恢复成功。
公开引用对已知 worker-unavailable/restart-required 输出 -32803 与 reason，未知内部错误不吞掉。

`explicit-reference-recovery-green.log` 实际5/5；更严格的同例另1/1（4按名过滤）证明：
无输入修复时引用不重建；测试时钟推进后仍不重建；权威文档修复后纯状态仍不探测；
引用才建立第5个主Worker并返回精确3位置，重复相同结果。此前4个为受控失败历史，主Worker同时峰1，关闭后0，清理错误0。
收据 `explicit-reference-recovery-final-receipt.json` 绑定最新运行产物；最新TSC PASS。
此外扩展文件名为 `Late 空间😀'!%.ets` 的实际Mac Native同例1/1，5按名过滤；不是Windows实测。

仍需独立补覆盖：先有热缓存/有效Native候选，再耗尽共享恢复预算并修复的交错历史；
不能拿初始化始终失败的这条对照代替。原57项属于此前构建，不与后继5项相加宣称最新全量通过。


## 重命名终检与最终相关组合回归

公开真实 LSP 反例在编译器 checker 关卡（Program 已捕获）静默创建 `Late.ets`：
原行为成功返回遗漏新文件的 3 项重命名编辑，见 `rename-inflight-red.log`。
候选在完整重命名执行前后核对实际名称/磁盘输入，并保持同一父线程输入/恢复代次；
期间发生变化则撤销旧请求，下一请求同会话返回全部 5 项编辑。原 SDK/绑定/磁盘终检保留。

扩大回归曾有 9 项既有快照测试未进入旧索引关卡，原失败保留在 `rename-fence-green.log`。
两个原因分别修正：没有维护 owner 的只读索引不能被置为永久待对账；旧式无 qualification
元数据可参与发现及快照核对，但不得据此裁剪完整候选。随后 7/9 通过，另 2 项缓存夹具
缺少真实 READY 所需 SDK/准备状态。补齐夹具前置条件，保留原缓存命中/失效断言，最终 9/9 通过
（`snapshot-discovery-fixture-03.log`），没有放松完整性校验或跳过用例。

最新 Node 重建后六文件串行组合 **52/52 PASS，0 FAIL/0 SKIP，81.650s**；
TypeScript 检查、构建及 `git diff --check` 通过。
收据 `namespace-final-20261109/combined-final-receipt.json` 绑定命令、源文件及运行产物哈希。
本轮未修改/重建 Native，未开展 Windows/UI/新版 30K 耐久，不能用此前冻结候选代替。
受管缓存在源码树内的排除/所有权/事件合同，以及热缓存和 Native 已资格化后再耗尽恢复预算的
特定历史仍未闭环。最终全量检查、规模和耐久仍待本轮候选完成后重新执行。
`worker-protocol.ts` 1795 行仍属既有迁移债；本片较原版缩短，proxy 保持 500 行。


## 热缓存后熔断历史和源码树内受管缓存的实际后继

新增公开 LSP 历史先实证 3 项引用、Native `references.index.accepted`/candidateFiles=2、
答案 `references.cache.hit`，再输入新 Spare.ets 并触发编译器 Registry 不确定性，耗尽共享恢复预算。
熔断期间旧缓存不得返回成功；修复输入后，纯状态读取不得抢先恢复，显式引用只恢复一个 Worker，
精确结果必须是最新未保存 Main v3（行位置 +2），重复仍一致；物理 primary Worker 同时最多 1，
关闭无残留。`warm-circuit-04.log`：1 PASS / 5 filtered（定向执行，不是完整六项）。

早期夹具失败原样保留：`warm-circuit-01` 没有故障 seam 所要求的 Spare.ets，不能当产品缺陷；
`warm-circuit-02` / `warm-circuit-diagnostic-03` 虽进入熔断，但修复时还留着一次 snapshot 注入。
只读异常观测器在诊断产物内记录：首个 warm Host 在成员同步前退役/释放 Registry 即失败，
消耗一次恢复而没有到达 snapshot seam；后三次才消耗 snapshot，剩余 1 次。
修复步骤显式撤销余下的构建/释放故障并提供权威输入后通过，没有改动产品恢复/吞错/放松断言。
不将这两次夹具问题记为已确认的运行现场产品缺陷。

### IDX-V1-CACHE-NS-001：受管叶目录仍被当作源码

这是原计划“受管缓存入源码树排除合同”开放项的稳定标识，不新建远端 issue。
新公开真实子进程回归：将配置缓存根置于项目 `Cache`；在其旁边保留合法 `Cache/User.ets`
调用者。初始 Native 索引正常 ready=3，实际原生创建并持有的 `workspaces/<64hex>` 叶目录
包含 `cache-use.json`。向该叶目录写入引用同一函数的隔离 Generated.ets，无 watch，查引用。
预期精确 5 个真实源码位置，并包含 User 的 2 个位置；实际成功 **7 个位置**，多出受管叶中的 2 个。
证据：`managed-cache-red.log` / `managed-cache-red/managed-cache-source-tree-{response,events}.json`。
父版本 298d65f 加当前未提交 namespace 候选；实际 SDK 为隔离桩，非 UI/Windows。
原项目/用户缓存未变。此回归当前保持 RED，未以整个 Cache 排除或修改预期 7 绕过。

调用链：Native `workspace_runtime::initialize_workspace` 经 cache_location 得到实际 DB，
CatalogStore/Control 获取 CacheLease；Node 初始化只拿 workspaceIdentity/status，并没有受管
物理目录证明送至语义 Store。`listWorkspaceSourcePaths` 只有固定名称忽略；
`scanProjectMembership` 将 Cache 叶内 ets 当作普通源码。因此仅隔离测试缓存不解决产品配置情形。
Native 自己的 `catalog_walk` 同样只有硬编码目录名忽略，也需同源排除。

后继实现边界：由实际 Native 已打开/持租约的受管目录提供证明，Node 校验实际回退位置与
workspaceIdentity，将根范围/物理对象身份约束的排除策略按有序命名空间变更交给语义 Worker；
策略要进入恢复重放并撤销旧请求资格。枚举和 watcher 路由使用同一约束；Native 扫描也一致。
不能只信 cache-use.json、猜配置 D 盘路径、屏蔽整个 cacheRoot 或所有名为 workspaces 的目录。
源目录与缓存混放、cacheRoot=源码根、目录替换/符号链接、Native 关闭重开/Worker 恢复、
多根/多窗口及 Windows 占用仍是该实现需要覆盖的验收，不得由本个 RED 证明已满足。

完整恢复文件最终执行 `ownership-final-05.log` **6/6 PASS，0 SKIP，28.675s**。
`warm-recovery-and-managed-cache-red-receipt.json` 绑定当前测试及产物身份；受管缓存公开 RED 仍保留，
因此不是本轮所有回归通过。源码体积及 `git diff --check` 检查通过（旧 worker-protocol 迁移债不变）。
