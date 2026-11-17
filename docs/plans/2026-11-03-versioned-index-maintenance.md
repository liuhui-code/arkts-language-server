> **当前有效状态（2026-11-12）**：完整 check:fast 于09:38结束，2470PASS/7FAIL/0skip，2477输入未变；下方RUNNING/旧全绿均为历史。当前集中修复30K初始化不可用；新增通用回退解析见证复用回归10/10PASS、类型检查PASS，仅定向结果，不代替全量或30K验收。[阶段拆解及根因](../reports/2026-11-12-30k-initialization-unavailability.md)。未合并、部署。

> Latest user scope update2026-11-11: remaining candidate failures/functionality gaps and severe tails MUST be repaired. Prior known-gap deferral no longer closes the objective. See [functional closure report](../reports/2026-11-11-functional-closure-and-scale-failures.md) and [Proposed ADR0045](../adr/0045-complete-membership-and-source-resource-budgets.md). Historical results remain evidence, not current acceptance.

> **当前修复状态（2026-11-12，持续实施）**：SDK重复候选探测122/244→2/4，9文件74PASS；包物理根值加载122→1，6文件57PASS（含替换后拒绝旧结果及同会话恢复）。这两套是相邻候选的定向证据，不相加充当全量。真实Photos16仍FAIL：初始化约89.5s失败换代，后续定义30s产品截止；首个退出原因为未测。独立18是90s外部观察后主动终止，不是OOM复现。当前固定Node20完整check:fast已启动，源码冻结；原2466全量、Photos36两小时296缺口均属历史。全局查询长尾、2万文件初始化和30K完整功能仍需修复。详见[当前报告](../reports/2026-11-11-functional-closure-and-scale-failures.md)。未合并/部署。


> Current final checkpoint (2026-11-11): format10/110 candidate2475 inputs. Fresh IX22 full check2466PASS/0fail/0skip/0cancel, source unchanged, runtime79 reverified. Mac native440PASS plus explicit455correctness1PASS; experimental25/fmt/Clippy/workspace releasePASS. Windows native433/experimental25/release, publicLSP13 and real30K index+5exactdefinitions/input postflightPASS (protocol, notUI). Photos36 formal started2026-11-10T23:06:46.905Z and is still RUNNING; ~74min provisional snapshot, not completed7200s acceptance. Read-only final audit and serial37->38->39 controllers are queued; no parallel comparison load. Known full references/rename/partialSDK and severe tails remain. No merge/deploy. [Latest evidence](../reports/2026-11-11-versioned-index-owner-metadata-retention.md).

# 文件版本化索引：可执行实施与验收计划

> LATEST IX20: source68aa4629/2441 inputs unchanged; fresh complete check PASS2463/2463, zero fail/skip/cancel/todo; exact249-input Rust reuse. Current Photos32 completed7200.369s formal protocol load:1074actions/4868requests, normal shutdown/exit0, independent postflightPASS;279formal full-scope refusals retained. Scale33 terminal96ordinary cells; density34 terminal72ordinaryPASS; topology35 running. Windows connected:24Native focused testsPASS; test-only passive-observer overlay13publicLSP+2CLI PASS, not yet integrated. Windows Photos cold index30000/30000 terminal, semantic degraded; input/SDK/runtime postflightPASS, actual UI NOT_RUN. Owner/header retention, current scale performance and real UI/Windows acceptance remain incomplete. No commit/merge/deploy.

> Earlier IX19 checkpoint (now terminalFAIL): the check was running with a confirmed test-fixture teardown failure/intervention; source028bd76f/2441inputs frozen. First bounded SCALE004 optimization has22port/manifest+22publicLSP testsPASS, full candidate not accepted. Existing owned-resource helper controls prove normal/setup/body cleanup in independent copies; integrate after terminal and run a new whole gate. Predecessor f33288b9 scale28/density29/topology30 and Photos27 are now fully aggregated with separate identities;30720factor-fixture bytes rechecked. Windows SSH still times out; UI not run. IX-07/08 IN_PROGRESS. [Current acceptance audit](../reports/2026-11-10-versioned-index-acceptance-audit.md). No merge/deploy.

> PREDECESSOR f33288b9 / IX18 checkpoint 2026-11-10: fresh2456/2456PASS, unchanged2439 inputs. Root-retention candidate Photos27 formal7282.278s completed with independent postflightPASS;284 known full-scope gaps retained. At that checkpoint scale28 was running and density29/topology30 waiting; all three have since completed with frozen-identity aggregation. IX-07/08 remain IN_PROGRESS for successor checks and platform/UI coverage. [Current endurance evidence](../reports/2026-11-10-photos30k-root-retention-endurance.md). No merge/deploy.


> Historical 2026-11-10 pre-fix checkpoint: IX17 2455/2455PASS; Photos23 protocol7264.848s completed with full-reference/rename gaps and definition tails. Scale24 STOPPED_FOR_DIAGNOSIS after95 sessions (67PASS/17gaps/11FAIL), including one current ordinary completion30s deadline; third trial incomplete, all profiles/density/topology NOT_RUN. IX-07/08 remain IN_PROGRESS. [Failure and root-lifetime evidence](../reports/2026-11-10-30k-ordinary-completion-deadline.md). No product threshold change, deployment or merge.

> 历史检查点 2026-11-09：ABI3冻结2433输入后生产Worker/恢复8PASS，原失败重放33PASS/19FAIL/82过滤，输入未变；完整check:fast尚未GREEN。最终ABI协议/公开缓存80PASS，拆分旧720行测试后相关85PASS；证明/重复组装/诊断阶段另有39/40/19定向PASS（重叠不相加）。Photos15/density16未执行，旧H13不替代当前验收。19项根因仍逐项定位；SDK/完整30K引用重命名、UI/Windows限制保留，455仅冷目录3秒计时豁免。[本轮根因与证据](../reports/2026-11-09-input-proof-purpose-and-diagnostic-handoff.md)。

> 实施状态更新（2026-11-04）：用户已授权实施；IX-00/01/02/03/04/05 IN_PROGRESS；默认父端接线仍RED，其余尚未开始。
> 独立reader/权威data状态/查询取消及长期4槽parser所有权及有界file facts合批已有公开回归；自动对账/GC、默认Node/LSP及完整验收尚未闭环。
> 以下“本轮仅设计/未实施”等为原设计交付的历史表述。最新代码及验证见[实施收据](../tdd/2026-11-04-versioned-index-maintenance.md)与[ledger](references-feature-ledger.md#idx-v1-feature-ledger)。

起草：2026-11-03；交付复核：2026-11-04。设计：**DESIGN_READY / Proposed**；产品实现：**IN_PROGRESS（IX-00/01/02/05）**；行为验证：**局部已执行，完整验收未完成**。
[ADR0043](../adr/0043-versioned-file-index-maintenance.md)是本计划的设计合同；
状态仅在既有[Feature Ledger](references-feature-ledger.md#idx-v1-feature-ledger)回写，不另造活动ledger。
原设计交付仅含方案/ADR/ledger；后续已授权实施。本计划继续执行，不自动部署、提交、合并或发布。

## 1. 为什么做、完成后应看到什么

目标是解决 R-13 的日常索引全量写入、过期工作晚停止及其磁盘/维护成本，
保留完整语义和新鲜度，不把查询失败简单改成成功空集。
固定298d的128文件反例是改1文件仍写128；30K旧mixed-03的77写入代并非77次发布，
累计行也不是实际磁盘写字节。原始数据和失败继续保留。

最终正常路径：

```text
权威事件/对账 -> 具体变更集与input token -> 按URI合并
  -> 实际读取/内容键比较 -> 未变facts复用；改变文件提取
  -> 文件版本/组映射分批staging -> 核验 -> 短事务发布组
  -> 完整对账确认后提交资格收据 -> 父端核对dirty token
  -> 既有compiler/overlay/final fence -> 正确结果或明确失败
```

改1文件应只写该文件的新facts；重复字节可免facts写，不免必要的当前输入检查。
大文件、大变更组、删除和移动走同一版本化路线，不触发普通全库fallback。
全量对账仍可能读取/校验N文件，但只提取/写变化facts；不承诺整体时延与文件数完全无关。
完整引用/重命名、SDK及Zed所有权的既有缺口不因本特性关闭。

## 2. 开始实施前的基线与工作区处理

已只读核对GitHub main为`298d65f5d7f796c347fe8be5c739e428066489d8`，ADR到0042。
当前工作树HEAD为`b57ad075`且有其他修改；**不得直接在旧工作树覆盖或把它当最新main**。
本轮设计证据/保留快照：`.bench/index-versioned-plan-20261103`。

原设计的隔离入口示意如下；实际已在2026-11-04建立`/private/tmp/arkts-index-versioned-maintenance-20261104`，
分支`feat/index-versioned-maintenance-20261104`，固定parent仍为298d；不是在原dirty工作区实施。
下列20261103路径是历史示意，不表示实际创建过同名工作树：

```sh
git status --short --branch
git fetch origin
git worktree add -b feat/index-versioned-maintenance-20261103 /private/tmp/arkts-index-versioned-maintenance-20261103 origin/main
```

若分支/路径已存在，核对并复用其身份或采用新tag，不强制覆盖。
将**仅本方案文档差异**移植到新基线，ledger/index用增补而非整文件覆盖；
保留当前其他修改、原30K项目、用户窗口/未保存内容、日常安装及真实缓存。
复核新main是否已有新ADR/schema，必要时在提交前调整编号及所有引用，不篡改历史编号。

记录 commit、dirty patch/hash、Node/pnpm/Cargo、SDK路径/版本/组件、编译器、server/Worker/native哈希。
真实测试环境与生成夹具分开，普通计时与插桩产物分开；旧298d构建只读保留作A/B对照。
不擅改SDK、V8、产品超时/规模/内存配置以获得更好结果。

## 3. 模块责任与接口改动

以下路径以298d为准；实施前确认路径/调用点，名称是建议，不表示模块已存在。

| 层 | 现有入口/拟提取职责 | 修改边界 |
| --- | --- | --- |
| TS事件 | `src/workspace/default-workspace-symbol-service.ts`、`src/lsp/workspace-index-initialization.ts`及现有watch入口 | 保留created/changed/removed URI、输入token及root/config/目录不确定原因；不把任何事件都简化成无参catalog |
| TS端口/协议 | `src/contracts/workspace-index.ts`、`workspace-symbol-service.ts`，`src/index/sidecar-protocol-validation.ts`及session客户端 | 增加内部维护能力/任务/资格收据的严格类型和验证；未知成功payload仍协议失败 |
| 资格消费者 | `src/semantic/references/reference-index-freshness.ts`、原候选准入/状态调用点 | 旧native保留0005水位；新native使用已提交完整收据，仍有最终代次/输入校验 |
| native控制面 | `crates/index-sidecar/src/main.rs`、`catalog_runtime.rs`、`catalog_worker.rs` | 从同步refresh dispatch中移出解析/写入；control loop可接收变更/取消/状态；每workspace一个owner |
| native输入 | `catalog.rs`、`catalog_discovery.rs`、`catalog_source.rs`、`catalog_stream_producer.rs` | 复用0042扫描/4parser/所有权额度；对账产生内容键差异，保留ignore/准入/读错分类和source fence |
| 持久层 | `crates/index-sqlite/src/{schema,lib,catalog_store,catalog_session,catalog_control}.rs` | 提取file versions、publication groups、snapshot visibility、qualification、GC职责；旧bootstrap仍走private catalog |
| core及内存对照 | `crates/index-core` Store接口、MemoryStore、文档facts及rank_symbols | 如公开port需扩展则补内存等价；不扩张词法提取为跨文件TypeChecker |
| 缓存治理 | 原workspace使用权/reader lease/DB退役与维护入口 | 识别新格式及库内GC；同0041根，不新建影子cache根，不扩大真实缓存清理授权 |
| 测试 | 现有public Rust/NDJSON/真实framed LSP harness | 新测试按下表垂直落地，不以私有server单测替代公开LSP |

所有新增手写source/test/script≤500物理行。已超限的`index-sqlite/lib.rs`等不能增长；
先用characterization保护，再按上面的内聚职责提取，不机械切文件。
新增内部API采用 begin/stage/seal/publish/snapshot/collect 等明确职责，签名以受信输入和读写身份为边界。
新格式不允许旧的“较大generation即可写入”API绕过CAS；旧格式兼容入口保持表征行为。

## 4. 必须在代码中落地的完整合同

事件到native维护的映射须作为IX-03公开回归的输入表：

| 输入 | native动作 | 必须保留的其他合同 |
| --- | --- | --- |
| didOpen/didChange未保存/didClose | 不把overlay写入磁盘facts；只有实际磁盘权威变化才排磁盘维护 | semantic mutation、旧请求/句柄失效、关闭重开及原答案缓存规则照常执行 |
| 保存与随后重复source watch | 读取当前磁盘，合并URI/最新token；同内容复用facts | 不从didSave存在推定磁盘字节/身份正确，No-op仍按需要确认资格 |
| 源码changed | 该URI失效/提取，完整资格对账仅写差异 | 不因普通body变化重建全部词法facts |
| created/removed/显式移动批 | 成员/namespace变化；已知成组变更原子发布，独立watch无法证明配对时reconcile | 不依赖rename事件必然完整，不复活旧barrel/负探测证明 |
| native准入/ignore/extractor配置变化 | 推进token并重发现；domain真不兼容才完整重建 | semantic-only SDK/config变更仍走原语义合同，不无依据重解析所有本地词法facts |
| overflow/重连/未知目录事件/终检漂移 | needs-reconcile，保守完整核验准入集/源码，只写差异 | 未知不能报完整，不默认全库写 |
| 显式管理force/rebuild | 保留现有主动全量构建语义及完整私库检查 | 普通watch/大文件不能自动使用force掩盖增量缺口 |

### 4.1 数据模型和可见性

- 所有facts及FTS绑定file_version，完整版本只有seal后可引用；内容键含URI/SHA/extractor/schema/真实解析配置。
  file_version不由首个创建group独占；必须测v1→v2→v1后GC早期group仍保留当前复用v1，禁止错误级联删除。
- manifest是不可变发布组日志。每URI在head之前的最新已发布entry决定accepted/rejected/removed；
  staged组、历史组和旧facts不得进入LIMIT、歧义判断、候选截断、计数或最终rank_symbols。
- 大组的映射也分批staging；发布只改组头和metadata，不在最后更新全体URI head。
- 采用URI→组和group→commit序号索引；专测历史版本/隐藏匹配很多时的EXPLAIN和查询量。
  不在每次局部查询构造全项目临时active map，不新增bm25语料统计排序。
- 文件内容相同可以复用sealed facts；实际输入证明、resolver/SDK/config域及旧请求不复用资格。
- rejected替换旧accepted、删除barrel、扩展名歧义、binding/alias链和overlay必须保持Unknown/完整性原语义。

### 4.2 原子提交与跨进程

- 源码读取/解析在SQL事务外；分块写入沿原64文档/32768估算行/8MiB，
  大文档4096元素/4MiB边界，不把估算成本当精确heap或WAL硬上限。
- 源fence及大read-set在读快照H验证；最终短写事务只CAS store/domain/head H及有效owner/input token，
  同时提交组头、head、计数/资格变化。对账大组的计数delta在H计算，head变则重新核对，不能套旧delta。
- 同URI以entry ID而非仅content version做CAS，防编辑撤销ABA；absence携namespace_epoch，
  成员增删/移动发布推进epoch，不能清掉墓碑后让旧absence证明碰巧重新成立。
- 跨进程独立组可在重新验证read-set后重基准；同文件/namespace/域冲突拒绝。
  旧完整私库继续全parent比较。SQL事务/物理发布锁不跨解析、队列等待或全量磁盘检查。
- 重放同attempt只能查询/返回原终态；commit后断连不得重写，旧LSP请求不自动重放。
- publishing准入与owner输入/取消有同一顺序判定：先到的相关失效拒绝，准入后的事件保留到后继，
  data COMMIT才是可见点。新token不能被旧token收据清dirty，成功提交不能事后标未写cancelled。

### 4.3 完整资格与No-op

- native capability为`versioned-file-maintenance-v1`；内部新增命令至少有maintenance的
  start/changes/status/cancel及完整终态，具体wire字段在IX-00/01锁定并加strict validator。
- 父端生成native input token，区分它与overlay/文档/Host版本；合并后仍知道覆盖哪个输入及不确定性。
  token必须带issuer session nonce，仅同issuer内revision可排序；资格按issuer/token寻址，
  另一窗口同head的No-op不能顶掉已有有效收据，真正推进head则旧收据失效。
- 完整对账保留整个准入集和最终length/mtime/SHA检查，维护facts仅按差异；
  receipt必须绑定当前store/domain、head、token、qualification ID、scan-complete和拒绝资格。
- data已发布但尚未完成上述证明时，完整资格是pending/unknown；旧qualification不得认证新head。
  本地语义功能不等待索引，完整查询沿原安全路径或明确失败。
- No-op可以只提交新的qualification元数据，facts/head不必变化；根dirty仅由匹配的完整收据解除。
  重复同token可幂等返回已有收据；新token即使同字节也不省略必要证明。
- 旧native没有新能力时完整保留0005原水位/后启动catalog路线；缺字段、错误域、旧收据、未来token均不得放行。
  能力混配不静默建空库，不改变结果缓存和最终compiler/overlay新鲜度。

### 4.4 进展、取消与回收

- 同URI pending保持最新有效内容意图；按首次入队等公平顺序服务稳定文件，不让热点持续取消独立文件。
  待办超过既有传输/队列额度时保留needs-reconcile和最新watermark，不假装事件已精确消费。
- 源变化到达活动任务后及时标read-set/组过期，解析前后/槽/批次/验证/提交边界均检查；
  组废弃不废弃仍有效的sealed file versions。合法大文件仍允许单项展开，不增加源准入/RSS硬线。
- 控制线程不解析/持久化；取消ACK、任务完成、terminal-sent/received、资源归还分别记账。
  query/status的SQL也交给独立读连接/有界reader executor，与写队列分离；状态读取当前data而非owner旧值，
  控制面接收及时不等于任意同步IO都能立即完成，实际排队/IO继续计入耗时。
  真实故障不可改成cancel；SQL/单parser不能承诺任意点中断，绝对期限和原监督仍保留。
- 后台索引不归某个查询token拥有；前台请求保持有限优先、mutation/global barrier和单终态。
  同token失败不无限立即重试；新输入或显式恢复走有界调度，观察冲突/饥饿和失败原因。
- GC分批回收无可见/活动引用版本、退休entries和证实退出owner的草稿；新任务不得借用正被回收的版本。
  活动任务先取得使用权再借用版本，GC决定和引用变更在同一协调域/事务核对。
- 旧reader靠读事务可继续读旧页；旧操作没有开启读快照时不能任意重新请求旧head。
  不能只用lease计数或RSS下降判断GC正确；记录WAL被旧reader钉住、checkpoint忙及关闭完成。
- 真实缓存/离线根/Windows占用继续0028规则；不拆删WAL，不在前台VACUUM，不通过默认内存驱逐抑制历史增长。

## 5. 垂直实施片与提交边界

每片：先记录parent/失败命令/原始RED，再最小实现GREEN，保存文件/产物hash。
下列测试文件名是**拟新增**，本轮尚不存在，不是声称现在可运行或已经通过。
每片只完成对应机制；只有IX-07/08满足后才能称特性验收，不将小片GREEN称整机稳定。

| 片 | 先写的有效RED/characterization | 正式实现及退出条件 | 提交/回退边界 |
| --- | --- | --- | --- |
| IX-00 基线/合同 | 复用128文件public native：单改仍写128、相同通知免写、过期继续写；既有读快照/FTS/旧API表征 | 冻结状态/wire/计数定义、锁顺序、全接口oracle；准备测试隔离和trace收据。只观测，不改调度 | 测试/观测可独立提交；不能把埋点当修复 |
| IX-01 存储纵向闭环 | `file_version_publication`：staged隐藏、两块大文档、原子组、墓碑/拒绝、隐藏版本吃LIMIT、全部facts表/FTS oracle | 实现schema、完整写/读/资格对象、MemoryStore对照及公开库API；新格式仍不接生产；所有旧查询均有映射 | 单独存储提交；不暴露只迁移一半的查询 |
| IX-02 控制面/调度 | `maintenance_protocol`真实native子进程：大解析/慢writer时status/cancel仍可送达；事件关联、独立组进展、队列收敛 | start/changes/cancel/status能力、单owner/4parser/批writer和终态；有界队列/引用清算、跨进程CAS/受限重基准 | 与IX-01同一候选，旧生产格式仍用原路；不能只改refresh同步后假称可取消 |
| IX-03 变更集接通 | `lsp-index-file-versions.test.mjs`真实framed LSP：changed/created/deleted、保存重复、移动恢复/删除旧空目录、无通知后对账 | TS→native保留URI/token/不确定性；known变化增量，未知reconcile只写差异；每个mutation/close屏障完整 | 一条真实链贯穿；不只测native而漏父端 |
| IX-04 资格接通 | `lsp-index-qualification.test.mjs`：同facts新token、pre-open抓取失败、编辑期间旧build、跨进程旧status、遗漏/伪造receipt | 严格校验新能力/收据；ReferenceIndexFreshness兼容两模式；查询终检/overlay/SDK/答案缓存原合同不变 | 新格式cutover的必需依赖；未GREEN不得启用新格式 |
| IX-05 生命周期/迁移 | `version_gc_and_recovery`：跨stage/seal/publish强杀、提交成功ACK丢失、活动引用/长reader、ABA、双窗口、旧schema/旧binary | 新物理库迁移、控制库短切换、GC/恢复、后台checkpoint；cache根/usage锁一致，崩溃恢复拒绝半版本 | IX-01–05完成才形成可部署完整生产候选；不提交“先新格式、以后补GC”版本 |
| IX-06 组合反证 | 并发编辑/取消/目录切换/配置/大组、旧请求失效、两种声明策略及binding/删除传播 | 复用历史失败及新回归，冻结同一候选；所有新增失败修复后再检查 | 不放宽原断言、正确性/超时；回归时回退对应候选，不删证据 |
| IX-07 全量/规模 | 两种规模增长、多轮普通计时与独立trace；原100K成本失败原样复核 | 适用完整检查、机制计数/磁盘/尾延迟对照均有证据，未过项目准确阻塞/标状态 | 代码冻结后验证；新修改使受影响证据过期 |
| IX-08 耐久/平台 | 30K原mixed场景至少2小时单会话；Mac/Windows真实Zed另列 | 逐请求正确性、恢复、索引终态、资源/磁盘趋势；不排除原失败场景获绿 | 协议/真实UI分别验收；缺权限/连接只标未测，不冒充UI通过 |

各片ledger必须填：parent/final SHA、变更文件、RED命令/退出码、GREEN命令/退出码、证据目录、
残余风险和平台范围。与主线集成改变代码时补做对应检查，不沿用失效的旧结果。

## 6. 回归矩阵与明确oracle

| 类别 | 必测边界 | 必须成立 |
| --- | --- | --- |
| 内容复用 | 无变化、1文件、连续编辑、重复watch、相同字节不同mtime、编辑撤销 | unchanged facts不写；新输入有实际证明；旧请求/receipt不复活；元数据写单列 |
| 真实依赖 | barrel移动/恢复/删探测目录、删除导出、扩展名歧义、别名/继承、未打开依赖编辑 | 绑定只消费同快照可见facts；未证明依赖不排除；结果与冷完整oracle一致 |
| 准入/未知 | ignore增删/读错、目录读失败、policy skip、漏watch、overflow/重连、配置/SDK变更 | 恢复准入集/资格；读错不能复用为完整，正常忽略不能误当I/O失败 |
| 大文件/大组 | 520KB/80006 occurrence反例、近现准入上限、多个高膨胀文件、30K映射组、删除大文件 | facts和映射均分批；读者无半组；没有最后全URI更新/前台大删除；不改源阈值 |
| 查询覆盖 | prefix/acronym/substring/export/reference/identity/alias/binding/heritage/FTS、Unknown/零结果 | 活动过滤在LIMIT/排名/计数前；旧/隐藏同名不能吞有效行；served generation与资格同读快照 |
| 竞争/ABA | 两进程同文件冲突、不同文件重基准、absent→present→absent、v1→v2→v1、物理库换代 | stale expected-entry拒绝；独立性重新证明；旧全库不能重基准；status从data取当前真实代 |
| 跨窗口资格 | A/B同数字不同session、B在同head上No-op、B推进head、旧store高代迁移到新store低代 | 不互认token、不覆盖有效A收据；新head撤销旧资格；不跨store比较序号造成永久dirty |
| 取消/终态 | 等待槽、解析中、写批、seal、检查、发布前后、ACK丢失、旧世代响应 | 不发布过期结果；已发布不误报未写取消；每attempt/请求一个终态，资源实际结清 |
| 公平/恢复 | 热点持续输入、不同URI稳定写、前后台混合、保存/撤销/关闭重开、故障后新输入 | 稳定组可进展；普通取消不换健康语义Worker；原熔断/预算不被绕过 |
| GC/Windows | 未发布孤儿、读事务跨增量/切库、GC与借用同时、占用/重试、源离线/未知文件 | 不删活动facts/DB/WAL；OS锁保证owner，非TTL；逻辑GC/WAL/实际磁盘分别可解释 |
| 迁移/关闭 | 11/111、新旧binary混用、迁移中竞争/强杀、关闭时仍有queue/parser/SQL、重开 | 旧库可安全留存，新库完整才切换；没有空成功/覆盖；close后不新建库/任务 |
| LSP正确性 | Unicode/UTF-16、未保存/保存/同版本重开、补全详情/定义/引用/rename、最终磁盘窗口变化 | 完整结构oracle、版本、位置/编辑集一致，旧输入按既有typed error拒绝 |

新Native JSON/状态字段必须覆盖错误类型/截断/缺字段/不支持格式，不能把格式错误吞成普通busy。
Oracle同时保留已有native全文查询和真实compiler公共响应，不能只校验“无崩溃/返回非空”。
测试脚本清理fixture前须等待LSP shutdown/exit和所有native实际close，继续使用0028隔离cache变量。

## 7. 检查命令（计划，尚未运行）

先建立测试再执行；记录实际Node20工具链，不临时替换SDK或修改全局环境。
存储/协议片的拟定focused命令：

```sh
cargo test --locked -p arkts-index-sqlite --test file_version_publication
cargo test --locked -p arkts-index-sidecar --test maintenance_protocol
cargo test --locked -p arkts-index-sqlite --test version_gc_and_recovery
pnpm build
node --test --test-concurrency=1 tests/lsp-index-file-versions.test.mjs tests/lsp-index-qualification.test.mjs
```

最终同一候选按AGENTS及现有`check-release.sh`适用要求执行：

```sh
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace --all-targets
cargo build --locked --workspace --release
pnpm check:fast
```

如变更触及release/扩展打包路径，追加对应`pnpm check:release`/现有release要求，不能用focused替代。
455文件冷目录3秒性能项按既有授权跳过，保留原失败值/原因，准确报告未经跳过检查范围。
其他失败按具体原因处理，**原100K成本失败不是455豁免的一部分**。
以上是原设计检查集合，不等于执行证据。现已在隔离工作树实施；实际RED/GREEN、命令、候选输入及产物身份以TDD收据为准。
默认LSP及最终整链路检查未完成，不能把Rust聚焦通过改写为全部通过。

## 8. 性能与耐久执行规范

### 8.1 对照设计

- A组：128、2048、20000、30000项目源码，目标及有效依赖闭包固定，只增加无关文件。
- B组：沿用相同规模档，真实扩大依赖扇出/深度/共享依赖；实际Program成员数与native准入文件数分别记录。
- 另保留单文件体量/引用密度变化和30K真实Photos拓扑，不能用相同文件数表示相同代码规模。
- 同Node/SDK/模式/目标/缓存冷热，每格至少3次串行完整会话，旧298d/新候选交替配对；
  记录所有失败/超时，不能剔除失败后只算成功样本的中位数。
- 运行前固定操作序列、位置/符号、内容和编辑、随机种子；选不同热度/依赖闭包，不只重复同一命中。
- 冷索引、缓存重开、首次/热查询、保存/撤销后首次及重复、关闭重开分桶；完整引用/重命名不可用单列。

核心机制验收：改1文件的新facts写量仅属该文件；No-op facts写量零；
大组中间SQL commit不对外可见；普通变化不建完整私库；过期任务在可取消边界停且有效版本复用。
若为了完整资格仍扫描N文件，报告读取/校验成本，不能称全路径规模无关。
全局候选遍历成本、真实Program/依赖增长及按URI历史选择成本不承诺消失。

### 8.2 证据格式

每动作：序号/seed、文件/符号/UTF-16位置、操作/输入/编辑、前置冷热状态、文档/input版本、
开始/结束/排队、结果摘要/正确性oracle、取消/终态、store/head/qualification、Worker epoch及退出/恢复原因。
每维护attempt：触发事件范围、pending合并/不确定性、发现/实际读/hash/parse/reuse文件数、
stage/seal/publish/abort结果、各阶段耗时、读集合冲突、facts/entry/qualification行操作分项。
阶段嵌套时保留包含关系和exclusive时间，不能重复相加。

目录逻辑字节、DB/WAL/SHM、已发布/私有/废弃组、实际设备或进程I/O分别记录；
无法测量物理写盘明确UNMEASURED，不能用累计SQL行数/峰WAL长度称物理写放大。
数据每一代都有start/terminal，避免再出现原77代逐代终态缺失。
SQLite回收页可被复用而DB长度不降；大范围真实变更/迁移仍可暂存双份facts，不能把文件未缩小判泄漏或宣称峰值恒定。

采集Node RSS一次/PID、各Worker heap、native/Zed分别CPU/RSS、磁盘/系统压力；
Worker共享PID的RSS不重复累加。记录空闲/操作峰/完成后及空闲趋势，结合实际缓存/依赖解释，
不凭RSS不降断言泄漏，不为了压进2GiB做无关优化。

### 8.3 正式耐久与真实平台

先短校准确认oracle/资源采集/恢复/退出，失败先封存最小化，不能把校准时间累计成正式长测。
用30K隔离副本跑至少2小时**单会话**混合协议负载，纳入原mixed-03全部正常场景及原失败：
保存、watch突发、移动恢复/删除旧目录、编辑撤销立即定义、关闭重开、详情、引用/rename、忙闲切换。
不主动重启清累计状态；自动恢复逐次计数。保护停测、OOM、错误结果、卡死都是失败证据。

Mac/可用Windows真实Zed使用单独测试窗口/profile和可回退安装，先核对实际运行哈希；
流量来自真实UI还是协议必须标记，协议两小时不等于UI两小时。无需截图作为前置条件，
但没有实际界面操作的条件时必须标UI NOT_RUN/BLOCKED，不能仅凭日志宣布点击流畅。
不关闭用户窗口/丢未保存内容，不把部署日常实例包含在设计授权内。

500ms只作体验目标，报告p50/p95/p99/max、超目标频率及连续性，不新设硬阈值。
测试Node RSS 2048MiB停测线继续豁免，产品默认RSS仍null，V8/系统OOM、磁盘不足和整机危险保护仍保留。
正式开始/结束、动作数/请求数、错误/取消/完整性缺口、内存/磁盘/队列及恢复分别汇总。
原30K完整引用/重命名限制不能计成功，也不通过排除这些动作把功能总体写成全绿。

## 9. 发布条件、回退与剩余事项

### 9.1 预期收益和不能承诺的部分

| 原成本 | 预期改变 | 证据要求 |
| --- | --- | --- |
| 单改1文件重写N文件facts | 只写改变文件的facts、少量entry/资格元数据 | 128及30K同输入的parser/逻辑行/实际写IO对照；不预先承诺固定倍数 |
| 一个过期源拖旧代写满再整体废弃 | 可取消边界停止过期组，其余sealed版本下次复用 | 事件→失效→最后写批时间线、复用计数和任务实际终态 |
| 普通维护同时保留旧/新完整物理库 | 同库暂存变化facts，GC后页面复用 | DB/WAL/草稿峰、旧reader/WAL及GC原因；冷迁移/全范围真实变更仍可双份成本 |
| 隐藏版本或新旧字段混用 | 整组原子可见、同快照资格，No-op/跨窗口恢复可用 | 冷oracle、LIMIT/FTS反例、强杀/并发和LSP全结构正确性 |
| 扫描/磁盘身份、真实Program依赖和候选成本 | 本次不承诺消除；对账读取仍可随N增长 | 单列扫描/hash/parse/SQL/Program/排队；不能把写入优化称全路径O(1) |

### 9.2 集成和回退

本计划不是发布或合并授权。后续按正常分支/PR流程，最终候选适用检查和证据身份一致，
不改默认超时/规模/V8/RSS，也不以新feature flag长期保留不完整双实现。
内部能力协商服务于格式/版本兼容；实现阶段不完整分支不得启用新生产格式。

逻辑/完整性失败：停止新格式写入，保留现用完整库/原始证据，隔离修复；
不能把旧11/111缓存直接当新输入的完整答案。回滚需要受管兼容重建及重新认证，不强删用户缓存。
原方案的旧库、旧release、原始mixed失败按各自使用权/保留政策管理，不随代码回退批量清空。

最终交付必须分别列出：本特性机制/正确性、性能分布、完整检查、协议耐久、真实UI/Windows，
并列仍未解决的全量语义范围、SDK/用户环境和无关答案缓存TODO。
当前IX-00/01/02/05已进入实施并有局部公开回归；IX-03/04/06/07/08仍未完成或未开始。
完整目标未达成，状态以ledger及最新TDD收据为准，不能打整体完成勾。


### 2026-11-04 IX-05生产者域实施进度（尚未整体验收）

Native初始化旧生产者domain不再直接失败：只开放维护提示，旧facts不进查询；
坏输入导致升级失败后原库保持选中，修复输入、推进有效input后同会话可重试。
初始化时固定迁移来源权限；存活旧owner遇后来不同producer接管，读/单文件/全对账均明确失败，
不能迁回旧格式。创建草稿前的受锁权限核对与发布CAS分别防止提前/迟到竞态。
生产者内容身份不提供版本新旧排序，schema/profile迁移与启动器激活仍待独立闭环。
相关RED/GREEN及本候选检查写入TDD；局部机制通过不改变IX-05 IN_PROGRESS，
自动对账/GC、默认TS/LSP、完整检查与规模/原30K耐久仍按原计划继续。


### IX-05回收下一片执行合同

已新增长期`CatalogCollector`公开库端口，活动借用/预算/跨物理库/legacy边界已有回归；尚未Native自动调用。
调度将使用已有单writer lane，不另起无限后台写者：输入工作和GC均分成可观察量子，
待办不为空时保持有限优先，GC保留剩余工作/owner游标，不以单轮零变更推定扫描完毕。
错误和资源关闭单独观察；不改变已提交data的终态，不靠重启清算历史。
published group/ACK重放、owner/稳定锁对象的保留机制必须先有回归再缩减，不能直接全部删除。
自动触发、持续输入公平性、空闲收敛和关闭清算未验证前，IX-05继续IN_PROGRESS。


### IX-05生命周期前置问题与调度责任澄清

执行器提取前公开18项表征通过，提取后暴露并发cache-use写入失败；先修复
[IDX-V1-LIFETIME-001](../reports/2026-11-04-cache-use-record-concurrency.md)，再继续接自动维护。
不能让新GC/后台关闭增加合法metadata写失败，也不能忽略一次复现或降低unsafe检查。
唯一临时名/归属与每workspace写锁已实施，当前最终检查按新候选冻结。
完整对账自动后继沿现有父端workspaceFilesChanged/scheduleCatalog/runCatalog接线，
Native仍按父端issuer/token验证执行。避免新增一套抢同input的Native循环；
这不减少自动对账、GC、草稿复用或最终LSP/30K验收要求，均仍须完成。

### 2026-11-05 IX-05私有草稿实施进展

保留一个migration、当前内容预检复用及重试前有界私库回收已实现；
已用实际Native证明64提交后取消→复用62/写66，最终fence失败后复用126/写2；
force、同producer peer及不同producer接管有独立对照，失败Q不会随稍后成功变有效。
[详情及RED/GREEN](../reports/2026-11-05-private-index-draft-retry-and-reclamation.md)。
219输入冻结检查完成：Core/SQLite248、相关Native130、实验存储81/Native66，
fmt/双配置严格Clippy及release全部通过；收据`ix05-draft-v1-receipt.json`，不是旧212候选成绩。
下一实施顺序仍为活动库GC调度/元数据边界与父端接线，随后公开LSP和完整组合/规模/耐久验收。
一份私库不代表字节或元数据有界，自动GC及IX-03/04等均未关项。

### 2026-11-05 活动库自动GC接通

[公开机制及回归](../reports/2026-11-05-automatic-versioned-index-collection.md)：一个保留collector，
单量子/数据写入串行、持续输入有限回收机会、空闲探测、独立取消、故障不覆盖data终态、
fatal不因后续输入反复重建，显式工作区重初始化恢复；7项真实Native及owner sweep定向回归已通过。
完整回归发现IDX-V1-GC-002，隔离同候选删除恢复仍RED；当前224输入未验收。
先补工作区内容复用租约/有限近期历史及明确退役，不能插入延迟或修改旧零解析断言掩盖。
IX-05仍IN_PROGRESS，metadata/墓碑/ACK/partial/schema尚未完成。
下一片接父端严格能力/事件/资格解码和现有URI/token调度，保持legacy兼容及最终输入证明；
大存量TS文件先用公开表征保护并提取职责，不在旧长文件继续堆代码。

### 2026-11-05 内容租约后继实现

[IDX-V1-GC-002修订](../reports/2026-11-05-index-content-reuse-lease.md)已实施：工作区pin、近期两内容、
完整资格后的删除成员退役、GC/输入串行交接及peer/fatal清算；原删除恢复断言原样GREEN。
4项库、3项Native新回归及既有生命周期/GC组合已通过定向命令，228输入正在完整冻结核验。
这不关闭删除成员缺少成功对账时的收敛、metadata/ACK/partial/schema或默认LSP，先保持当前候选身份完成检查。
接线下一步仍为父端严格能力/状态/Q与URI/input自动对账、ReferenceIndexFreshness兼容及公开LSP证据。

228输入v1完整Native发现GC-003：background GC误阻止显式工作区initialize。
已用受控GC gate建立RED、修复数据/后台活动边界并验证原reader恢复、新epoch及非法替换不毁旧owner；
完整检查重新冻结为v2，保留v1失败，不更改原断言或延长超时。

v2本片228输入冻结完成：Core/SQLite253、相关Native143、实验存储86/Native79；
fmt/双配置严格Clippy/release均通过，详见`ix05-reuse-v2-receipt.json`。
Node依赖已按锁文件独立安装、工具pnpm8.15.9未替换全局；两个既有adapter测试文件27PASS/0skip，
275输入未变作为提取旧长TS模块的表征。这不是公开LSP验收，IX-03/04接线尚未完成。

## 2026-11-05 IX-03/04执行更新

[父端桥接](../reports/2026-11-05-index-node-protocol-bridge.md)：旧协议职责拆分表征GREEN，
新能力/输入/快照资格合同GREEN，生产framed LSP发现默认仍走旧catalog，保留RED等待接入。
Native补协商factsDomain；不启用缺少URI/input/reader/No-op新鲜度消费的半成品默认。
其余完整检查、迁移/partial/元数据回收、规模、30K两小时和实际UI仍按原计划。

## 2026-11-05 默认候选接通检查点

[17文件109PASS及真实LSP/No-op证据](../reports/2026-11-05-default-index-maintenance-and-noop-freshness.md)。
默认候选维护/独立读取/资格消费接通；原默认128由真实framed LSP证实，旧raw legacy128失败仍保留。
IX-03具体URI投递和不确定性、IX-04更多交错以及余下完整生命周期/规模/耐久仍依赖后继片；不提前勾完成。
新字段是未发布候选内部协议：早期本轮v1实验Native缺indexedDocuments不能被新Node当作完整成功；
部署时须用同一候选成套Node/Native产物，不自动吞错回退。

## 2026-11-05 URI/input接线检查点

[实现/局部问题及证据](../reports/2026-11-05-index-input-delivery-and-directory-lifetime.md)。
changed URI先局部更新，完整对账相同token不重复写；namespace/config保留URI及不确定性并按完整组核验。
真实LSP复合回归覆盖创建/移动/删除空目录/恢复/重复watch/配置，未覆盖didSave，不能以重复watch代替保存入口。
Native进度补scope/uri；输入ACK、任务分配与资格分开；现存祖先路由与保守未知不降低真实路径/新鲜度约束。
先完成保存/漏watch恢复/未知目录与重连、资源-only过滤及持续输入/取消，再关闭IX-03/04，metadata/partial等照旧。
前一完整Rust401/0/1已结束；当前全量pnpm在跑并出现采样权限失败，需保留阴性和授权对照后再全量验证。

## 2026-11-05 保存与工作区退役检查点

[局部实现、兼容边界及失败证据](../reports/2026-11-05-index-save-compatibility-and-cache-retirement.md)。
新增INPUT-005/COMPAT-001/GC-003，分别接通save磁盘事件、保留原显式refresh协议调用者、
让已知版本化工作区在活动锁/源身份/快照保护下整组退役；未来/未知内容保持保护。
旧日志消费者改读真实公开终态而不伪造legacy阶段；保存能力有公开LSP/合同证据。
后续next副本局部100/29/34及Native26通过并非最终全量；先等冻结85973终止，核对明确清单集成，
再以正常批准采样权限和已有Node20.19.5跑完整检查。其余IX03–08原要求和未完成项继续。

## 2026-11-05 集成后完整验证继续

前一冻结全量已结束且FAIL（2228/2365），保存137项与一次失败fixture的外部收尾干预；源码无漂移。
next23文件已按hash清单集成；新补全覆盖回退公开RED/GREEN及23项相关回归通过，整体仍未完成。
[后续报告](../reports/2026-11-05-index-save-compatibility-and-cache-retirement.md)区分实际partial与可选索引不完整。
新完整check:fast/默认Rust/strict检查和实验GC已启动；GC-004偶发来源及constructor捕获/终检仍待定位，
不接受放宽原断言或只选绿轮。原IX03–08范围、规模两因素、30K单会话2h与平台/UI分别验收继续。

## 2026-11-05 精确输入等待和退役所有权后继

[实施收据](../reports/2026-11-05-index-input-wait-and-retirement-ownership.md)：resource-only全catalog反例修复36PASS；
精确input订阅拒绝旧请求28PASS及相关47PASS；GC-004固定实验第11轮捕获正常退出tmp残留，
受控真实公开shutdown RED→GREEN，退役由有界runtime持有并实际join，不改清理安全性。
新增代码仍在next副本；集成全检已有两项constructor失败，继续定位；原IX00–08范围不缩减。

## 2026-11-05 IX-03/05后继检查点

[状态/证据](../reports/2026-11-05-index-input-wait-and-retirement-ownership.md#后继验证与修订不把中间green当成完整交付)：
退役补合并重试，最新Rust完整410PASS/1旧ignored，双布局相关/Clippy/release通过；
引用成员枚举失败可同会话实际重扫一次，容量partial保留；原测试缓存自干扰已取证并隔离。
ignore/exclude变化默认入Native对账、不进入SDK/Host mutation，相关66PASS。
旧集成checkfast2360/2365 FAIL，context计数具体disk-type-error步骤及两项取消/启动竞态未闭环。
漏watch/未知目录/重连/持续全对账公平、受管缓存入源码树排除合同、完整metadata/partial/迁移/ACK与
IX06–08规模/原30K两小时/UI/Windows仍按原要求，不能由局部机制通过勾完成；不提交合并部署。

## 2026-11-05 目录类型与准入后继

[详细记录](../reports/2026-11-05-index-namespace-lifecycle-and-admission.md)。
INPUT-011正式3场景1PASS/2FAIL后修订，后继6种目录生命周期及相关68PASS/0skip；
INPUT-010完全静默新增在命中/不命中答案缓存时均陈旧，仍OPEN；有根目录提示的恢复已通过。
INPUT-012完整任务仍等待global flush，两条取消/替换RED已建立，精确input准入验证中。
旧完整2360/2365失败及新完整中断130独立保留；上下文oracle29PASS、实际token取消/恢复26PASS。
32+3明确文件已集成；目录/准入后继尚待验证后集成。整体IX-00–08不提前标完成。

### 2026-11-05 next-only boundary / frozen gate negative

Resource-named directory delete formal6/8RED, then4 related files23PASS after
namespace fallback. Not yet integrated into frozen W. Actual old/new Native
shared-cache safety refusal2PASS recorded in namespace lifecycle report.
Frozen W full Node has archive consumer negatives and one test-process OOM;
actual Git inventory includes477877756 bytes of experimental build artifacts.
Wait for terminal, preserve/re-home those outputs under canonical target/ and
rerun unchanged collector contract plus complete candidate checks. No source
filter relaxation or V8 increase. All remaining original scale/soak/UI scopes
stay OPEN; no merge/deploy.

INPUT-014 checkpoint: actual source/rule directory-to-file changed-only2RED.
Next now preserves metadata URIs, scopes known descendant updates, and treats
regular source replacement as admission. No new wire field/SDK configuration.
Extra canonicalization first failed the original3-call contract; same-phase
sharing restored it without memoizing final identity fences. Final9files93PASS,
0skip plus tsc PASS. Ten explicit pending source/test paths are recorded in
ix03-kind-next-only.json; W full source remains frozen and negative. Wider kind
transitions and large descendant-removal scaling are not inferred from2-file
fixtures. Same full checks and original scale/soak remain required after assembly.

2026-11-08 continuation: INPUT-015 stale resource-directory index symbol now has
formal RED and current source-domain105PASS; real Stage disjoint/symlink/hardlink
controls included. Source exclusion is conditional, not filename-based. Frozen
whole Node2370/2374 failed and both Rust retirement gates failed. ENV-001 artifact
isolation restores unchanged collector24PASS; ENV-002 stale Cargo library is
proved by binary/dependency mismatch, fresh default/experimental2/2 behavior.
Next gate must force3 owned package rebuilds and preserve full input identities.
No scales/endurance launched; IX00-08 overall remains IN_PROGRESS.

### Final assembled candidate checkpoint (2026-11-08)

[Current check/scale evidence](../reports/2026-11-08-versioned-index-candidate-acceptance-progress.md): full pnpm checkfast2393/2393 PASS, source before/after identical. Parent298d; source snapshot c475777e9563966f47b75c66dbb36351b63e7a5023e78b6f01048ce6f75a7deb. Rust410PASS/1existing ignored, experimental28PASS, release/fmt/strictClippy PASS; original100K store cost PASS. The455 ignored release correctness entry was explicitly rerun and PASS with clean fixed455 hashes; measured cold3168.92ms exceeds3s and is timing-only user-waived, never labeled a timing pass.

Two calibration oracle failures were independently reproduced on old/current public responses, retained and corrected without product changes: consumer-local alias versus direct-origin rename and separate barrel API identity. Strict range/text/open-version checks remain. New round final-acceptance-03 calibrates17 operations PASS and is running the full serial matrix. SDK remains partial; phase complete is not SDK READY. Scale/2h/UI/Windows are still open; Proposed ADR status and no commit/push/deployment policy unchanged.

### IDX-V1-SCALE-001: valid dependency graph exceeds retained proof capacity

[Root-cause evidence](../reports/2026-11-08-scale-dependency-witness-capacity.md): final scale round03 stopped at real-dependency20000 first definition -32803. Old298d ordinary control fails identically; independent candidate trace records configuration-witness-capacity at4096 facts. Native indexed20000 and all databases passed integrity; no guard/OOM/crash. Witness source unchanged from parent7af6a4b7...; count means two-map facts, not4096 unique files.

Real framed LSP minimum regression against exact final artifacts:128PASS/4608FAIL,6.53s, minimal isolated SDK. Next-only test `tests/semantic/large-dependency-input-proof.test.mjs` is registered in bundle-e2e (316 entries); manifest4PASS. No product source has changed yet, so the prior complete2393PASS does not cover a future capacity fix.

ADR0036 decision3/6 explicitly retains this4096 boundary and rejects capacity-loss as safe source reset. Any correction must explicitly amend that scope, preserve every actual load-owned fact/final fence, distinguish mandatory validation state from optional caches, and prove owner/reset/namespace retirement. Do not merely raise4096, drop proof, clear/restamp caches, force healthy Program rebuilds or reactivate Rejected0039 directory caching. The unrelated global result-cache/Host performance TODO stays deferred. Large persisted save/watch write counters and original30K2h/platform scope remain required, not inferred from overlay-only timings.

### ADR0044 / IDX-V1-SCALE-001 implementation checkpoint (2026-11-08)

Mandatory load-owned proof retention replaces the healthy4096-fact quota; source provenance covers all retained facts.
Failure-detail bound and real unprovable/SDK/input/epoch/final-fence rejection remain unchanged. Explicit design revision:
[ADR0044](../adr/0044-load-owned-input-proof-lifetime.md), Proposed, no fabricated acceptance.
New lifetime RED1/7 then final8 plus manifest4 =12/12 PASS; actual LSP128/4608 and original source/SDK regressions26/26 PASS.
Separate approved-sampling20K diagnostic: ordinary cold/warm and trace cold PASS17 actions each so far;
trace warm in progress. Initial sandbox run17 correct actions but /bin/ps EPERM remains FAIL, not discarded.
New-source final fullcheck is queued behind the diagnostic; prior2393 PASS belongs to the prior source only.
Round04 controller has8 Python policy/gate tests PASS and separates confirmed baseline capacity failures from candidate correctness:
old failures remain FAIL, later unexecuted old operations remain UNMEASURED; timeout/resource/closure/integrity errors still stop.
No claim of full scale,2h,UI or Windows completion. Large persisted save/watch Native counters remain a required follow-up.

### Complete-checkout revalidation checkpoint (2026-11-08)

ADR0044's proof repair passes four actual20K diagnostic sessions68 exact operations with integrity/process closure;
ordinary edit-first references7.89–7.91s remain slow. Full details and hashes are in the
[capacity report](../reports/2026-11-08-scale-dependency-witness-capacity.md).
IDX-V1-ENV-003: N was partial staging, so its full-suite CLI/editor/bench ENOENT failures were preserved and stopped.
Exactly five repair inputs plus one test trailing-blank correction were integrated into complete W.
Fresh full checkfast now freezes2375 tracked/unignored inputs, including required bin/editor/bench files.
Old2393 PASS and N26/12 focused evidence do not become a new W whole-suite pass.
Round05 and its byte/reference-density supplement are queued behind complete prerequisites, not yet executed.
Persisted save/write scaling and original30K2h remain required; no UI/Windows/whole performance success claimed.

### Runtime completeness checkpoint (2026-11-08)

IDX-V1-OBS-004: immutable candidate mirrors omitted standard-library/diagnostic/runtime assets.
Prior20K subset-runtime query checks remain evidence, not complete-package acceptance or strict baseline performance comparison.
Direct N full-dist public128/4608 regression remains scoped GREEN. Missing-asset contribution to latency/SDK state is unmeasured.
[Root report correction](../reports/2026-11-08-scale-dependency-witness-capacity.md#idx-v1-obs-004-runtime-mirror-completeness-audit-2026-11-08).
Test-first runtime copier7PASS, controller/package15PASS and density8PASS. Complete built79 runtime assets and historical
installed77 assets (both70 library names) are now pinned separately; baseline3-JS layout is preserved, no defect assumed.
Round05 waiters stopped before load, evidence preserved; complete W fullcheck continues unchanged.
Round06/density06 wait behind strict prerequisites; no new scale/persisted-save/2h result yet. No product change/deploy/publish.

### IDX-V1-INIT-001: cold namespace RED/GREEN checkpoint (2026-11-08)

Previous complete checkfast2402/2403 FAIL is retained, source unchanged. Its failing assertion was Native catalog phase,
not an observed semantic READY transition. [Detailed causal chain and limits](../reports/2026-11-08-cold-cache-multi-root-initialization.md).
Cold shared directory creation is a confirmed independent defect: public Rust cold race64/64 plus lease-dir-only58/64 failures;
real Native initialize third pair IO/File exists; controlled two-root public LSP8/8 degraded, actual Native IO frames retained.
Original full failure lacks raw Native error, so exact historical equivalence remains unproven; no false claim otherwise.
Minimal AlreadyExists + original no-link/type/reparse revalidation repairs valid concurrent creation without accepting files/links,
adding retries, locks, thresholds or a schema change. Native release now9c65ce... versus retained409b08....
Rust cold/record concurrency9PASS; formal public cold/warm/root semantics/symbols/close plus original lifecycle/manifest15PASS;
same controlled public sequence8/8PASS; real Native64 pairs/128 initialize all succeed, all exits0. Focused ClippyPASS.
New source needs fresh full Node/Rust/default/experimental/pinned455 correctness checks; old410/28 not reused as new whole PASS.
Complete runtime79 assets and unchanged70 standard libraries remain required before resumed scale/30K2h. UI/Windows untested.

### Fresh combined candidate checks (2026-11-08)

The previous complete2402/2403 FAIL and stopped round06 remain preserved; new controlled public evidence confirms
IDX-V1-INIT-001 can produce that same catalog state from real Native IO/AlreadyExists. Directory idempotence repair,
no-link/type/reparse rejection and original initialization/root isolation assertions remain intact.
Fresh combined candidate checks, no reused old Rust results: workspace414PASS/0FAIL/1existing ignored;
experimental retirement28PASS; experimental namespace/use-record9PASS; release/fmt/strictClippyPASS.
Original pinned455 correctness explicitly rerun:1PASS, source455 hashes/head585feb and clean input unchanged.
Measured cold3089.691304ms exceeds3s; standing user timing-only waiver, not a timing pass.
Fresh complete Node checkfast is now running, not yet a final whole-candidate verdict.
Receipt `ix03-cold-namespace-final-checks.json` freezes2381 tracked/unignored/compiler inputs and backups all owned sources.
Round07 only starts if the six checks AND both declared supplements pass; gate17 controlsPASS, density8 controlsPASS.
Proper runtime79 assets, persisted-source1/0 counters, all ordinary/trace scale trials and original30K2h remain queued.
No user data/real cache deletion, deployment, commit, push or merge. Real UI/Windows not verified.

### Fresh final whole-candidate gate GREEN (2026-11-08 10:10 UTC)

The actual frozen integrated candidate passed complete `pnpm check:fast`: **2406/2406**,0failed,0skipped,0cancelled;
Node test duration3527845.166422ms. Fresh workspace Rust414PASS/1existing ignored, experimental28+9PASS,
release/fmt/strictClippyPASS and pinned455 correctness1PASS complete the six checks and two declared supplements.
The455 cold3089.691304ms timing-only user waiver remains explicit. SourceAfter equals all2381 SourceBefore hashes.
Receipt: `.bench/index-versioned-maintenance-20261104/ix03-cold-namespace-final-checks.json`.
This replaces no historical failures and does not imply true UI/Windows or whole scale/endurance acceptance.

Round08 copied/verified all79 current runtime assets, with the exact server145f982c/semantic19715a2b/
referencefc3b7229/Native9c65ce08 identities recorded in the receipt. Persisted source public LSP calibration128
and formal128/2048 sessions PASS, including exact Native file-write1/duplicate0/full-qualification0 counters,
disk-derived symbols after close, forged-save-payload rejection, restored source manifests, normal closure and DB integrity.
20K is currently executing;30K and the full multi-round semantic baseline/current matrix plus original30K2h remain pending.
2048 changed-save observed~656–733ms; zero-write duplicate~634–745ms. These are preliminary end-to-end maintenance
observations including scheduling and qualification, not parser-only timings or physical IO claims; no phase attribution inferred.
Source counts204 changed/new handwritten files audited,0new/growing over500-line violations;7shrinking legacy debts retained.
Evidence: `ix08-integrated-source-size-audit.json`. Product W remains frozen; no commit/push/deploy/merge.

### IDX-V1-GC-005 and OBS-006: round08 stopped, not endurance complete

Round08 persisted calibration128/formal128+2048 passed their symbol/write/input/integrity checks.20K FAIL:
save15848.6ms (1document write), duplicate unchanged0writes but qualification missing within original30s.
All observed LSP-owned PIDs closed/server0/integrityPASS. Raw failure and controllersSTOPPED remain.
Independent same-release Native-only128/20K and protected stack samples locate GC SQL scanning while the incoming
writer waits on Collection::Barrier. Native20K operation labelsPASS do NOT establish complete success: teardown
needed protection kill(-9); validated interpretation records closureFAIL, ACK signed offsets not request latencies.
SQL VM regression (actual bundled3.53.2/public collector) RED512549k->20488488k; rewriteGREEN28k->116k.
No deleted-data/owner/fence/budget/schema rule weakened. NULL/live-pin/current-data characterization passes original,
removing NULL guard from rewrite fails, final guard restored. Default focused testsGREEN; experimental/release and
new final complete checks still required. Prior complete2406PASS applies only pre-GC-repair frozen snapshot.
OBS006 audit adapter lost CLI argv; corrected after RED with3PASS and real empty isolated cache-GC CLI0/schemaPASS.
Earlier raw automatic-GC errors are driver-invalid evidence, not proven product CLI failures. Shared observer changed
only after all round08 controllers terminated. Full scale/30K2h/UI remain incomplete.
[Detailed report](../reports/2026-11-08-versioned-index-gc-query-cost.md).

## Final repair focused/public checkpoint (2026-11-08)

Default focused GC12PASS and experimental WITHOUT ROWID GC12PASS, including actual bundled collector VM work.
Release rebuilt13.84s; Native6553ab87ff0c9d20a36344062fa9b38fa095251fbbaeae0d91adf3395d2c9b2e.
Independent complete79-asset public LSP replay on new20K/30K fixtures passes original30s observations,3unique saves,
3duplicate watches and restore, exact symbols/forged payload refusal, source manifest restoration, process exit0/closure
and integrity. No automatic cache-GC error after adapter argv correction.
20K save median2355.2ms/max2440.5ms; duplicate median2377.9ms/max2381.1ms.
30K save median3376.2ms/max3484.1ms; duplicate median3358.0ms/max3360.0ms.
These are3 in-session samples, not independent cold trials. Earlier failed20K first save15848.6ms and duplicate30s
failure remain, not a valid many-round performance ratio; adapter argv also differs, while direct Native stack/VM
experiments independently isolate SQL scan cost. Full scans still grow with real source count; no500ms success claim.
Evidence `driver-failure-20261108/repaired-public-summary.json` and all underlying runs.
Fresh combined whole-candidate checks and gated full scale/original30K2h are next, not yet passed.


### 当前验收检查点：catalog测试迁移完成，等待新完整门禁

ABI3冻结重放原19项失败均有公开接口GREEN对照；其中旧数值协议改为拒绝完整范围收窄，真实Native资格正向路径独立验证。
本轮候选仅增加测试迁移/取证；此前产品修复仍须完整门禁和新的规模/30K长测验收。
13项过滤组合、首次索引完整6项、Native持久恢复/证明完整10项及catalog/语义组5项已有实际证据，组合不可简单累加为全量通过。
旧IX13失败和Photos15停止状态保留，density16未执行；不部署、不提交、不合并。
[当前测试合同、原始失败与逐组证据](../reports/2026-11-09-input-proof-purpose-and-diagnostic-handoff.md)。


### 2026-11-10 IX14完整失败及后继修复

IX14完整2453项：2448PASS/5FAIL/0skip，冻结输入未变；原19项GREEN没有覆盖这5个新反例。
稳定问题IDX-V1-IX14-001…005记录于[新门禁根因报告](../reports/2026-11-10-final-gate-regressions-and-input-admission.md)。
001跨Worker命令解析准入旁路修复及引用恢复反证中，其余4项OPEN；不得启动新的30K负载或标完整通过。
临时源码缺失已逐hash恢复并迁至`.bench/worktrees/index-versioned-maintenance-20261104`，原因未证实；
旧路径证据不改写，新候选须重新记录身份。未部署/提交/合并；Windows新SSH复核仍超时。
