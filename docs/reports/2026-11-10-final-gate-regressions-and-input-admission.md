# 最终门禁新回归与输入准入：2026-11-10

状态：**IN_PROGRESS；未通过完整验收，不部署/提交/合并。**
关联 [ADR0043](../adr/0043-versioned-file-index-maintenance.md)、[ADR0044](../adr/0044-load-owned-input-proof-lifetime.md)、
[上一轮报告](2026-11-09-input-proof-purpose-and-diagnostic-handoff.md)。

## 冻结完整检查与稳定问题标识

parent `298d65f5d7f796c347fe8be5c739e428066489d8`，Node20.19.5，Worker ABI3。
IX14 `pnpm check:fast` 实际退出1：2453 tests / 2448 PASS / 5 FAIL / 0 skipped / 0 cancelled / 0 todo。
整个命令3877.458秒，Node测试3869.649秒。2436输入在检查期间未变。
这是完整失败，不因原19项迁移回归GREEN改称通过。
原始证据：`.bench/index-versioned-maintenance-20261104/namespace-final-20261109/ix14-complete-check-receipt.json`、
`ix14-pnpm-check-fast.log`、`ix14-new-failures.json`。
Spec记者在最终摘要重复打印失败；最终清单按完整测试名去重为5项，原interim误计摘要的文件保留，不能据此声称11个独立失败。
五项在独立串行重放 `ix14-five-isolated-red.log` 再次全部失败；44名称过滤，不是新增跳过验收。

| 稳定标识 | 实际现象 | 当前判断/状态 |
| --- | --- | --- |
| IDX-V1-IX14-001 | 未通知包入口切换后rename没有按原合同拒绝首个请求 | 已实证跨内部Worker命令消耗解析rebase；IX16完整对应GREEN，整体验收待完成 |
| IDX-V1-IX14-002 | resident-first 对照的第二轮缺2个答案缓存hit | 已定位SDK fixture不满足READY；修正元数据并显式断言READY，针对性GREEN，IX16完整对应GREEN；后继完整门禁待完成 |
| IDX-V1-IX14-003 | experimental双词法根首次完整delta更换LS，sequence3→5 | 已实证同一物理catalog交替词法扫描导致虚假成员变更；修复及公开LSP GREEN，IX16完整对应GREEN；后继门禁待完成 |
| IDX-V1-IX14-004 | 拒绝无效recycle后答案相同但缺预期缓存hit | 已定位SDK fixture不满足READY；保留缓存命中及回收拒绝断言，针对性GREEN，IX16完整对应GREEN；后继完整门禁待完成 |
| IDX-V1-IX14-005 | 熔断测试等待Native revision≥2超时 | 以实际初始资格revision/head为准，保留真实Native资格与恢复熔断断言；针对性GREEN，IX16完整对应GREEN；后继完整门禁待完成 |

## 001：实际因果链与修复边界

公开 `textDocument/rename` → proxy `ReferenceNamespaceAdmission.run` → 内部 `semanticReadiness(captureSourceInputs:true)`
→ `ProjectReadinessLifecycle` / `documents.prepareRoot` → `WorkspaceResolutionInputs.prepare` / resolver refresh。
未通知的package manifest切换在此被发现，recoveredUnnotifiedInput=true、generation1→2、changed/removed均空。
下一内部rename命令进入 `prepareContextEntry` 时，该rebase已不再属于它的command-local AsyncLocalStorage；
只看到resolution-generation-change，发生owner1→2重建并返回结果。

`ix14-rename-preflight-rebase.ndjson`、`ix14-rename-preflight-observed-red.log`及
`ix14-rename-alias-harvest/*/logs-2/server.log`对应上述顺序。
普通重放与观察运行分开；观察在实际bundled Worker边界仅记字段，不是自然时延数据。
**返回编辑集与当前冷态oracle一致；没有据此证明返回了错误编辑。**
确认的问题是完整输入观察绕开原有解析准入拒绝，并消费了后续消费者所需的失败状态。

正式方向：提取并共用原 `admitContextResolution`，内部完整输入观察也必须经过既有source-reset/configuration准入，
不创建Program、不修改普通公开status的prepare:false行为，不自动重放旧公开请求。
首次接线直接throw，rename原完整8项GREEN，但扩大源码/引用61项得到56PASS/5FAIL，原始失败保留。
这些引用用例原合同允许撤销旧resident后由独立完整编译器验证恢复同一查询；不能把rename拒绝语义机械套给它们。
因此保留显式 `inputs-changed-during-preparation` 报告并继续区分实际namespace字节证明和语义owner资格：
编辑集在前后准入失败时拒绝；独立完整引用验证仍可恢复，但失败owner的pending原始证明未结清前不能因为owner缺失就隐式新建全局Program。
`SourceResetAdmissions.hasPending`只观察既有生命周期状态，成功准备、真实配置更新与dispose按原机制结清。
最终组合尚在复验，不能将前述rename8PASS称整体修复完成。

原callback提取先有4项公开表征GREEN，源方法保留同一判定/证明/回收顺序。
新改动位于 `src/core/types/prepare-context-entry.ts`、`type-engine.ts`、`source-reset-admission.ts`、
`src/semantic/project-readiness.ts`、`src/semantic/references/reference-namespace-admission.ts`。
无RSS/V8/超时/身份/完整范围门槛变更。

## 候选工作区文件缺失与精确恢复

IX14完整检查结束后，临时工作树被发现1585个源输入缺失；此前结束时全输入核验仍一致，不能把这次后续环境事件归为IX14的5个产品失败。
1536份与Git parent内容精确匹配，另49份都找到SHA-256相同的保留冻结备份。
三个本轮修改文件仍存在并另行封存。未覆盖任何现存文件，逐文件exclusive创建恢复并复核：
其余冻结输入全匹配，仅预期三个修改与旧IX14不同。
删除来源**未证实**，不凭文件年龄认定OS清理或产品删除。

已用正常 `git worktree move` 将原
`/private/tmp/arkts-index-versioned-maintenance-20261104`
迁至持久隔离目录
`/Users/liuhui/Documents/code/arkts-language-server/.bench/worktrees/index-versioned-maintenance-20261104`。
没有reset/提交/推送/合并或删除真实缓存。旧路径运行记录保持原身份，不改写成新路径执行。
临时pnpm及部分node_modules也缺失；离线锁定安装因无缓存tarball失败，未下载。
随后只读复制主树现存安装依赖，package.json与pnpm-lock完全相同，编译器SHA与旧Worker内嵌SHA一致。
新路径类型检查/构建exit0。所有恢复来源/逐文件hash在 `unexpected-worktree-loss/` 收据。
后续候选另记新路径/产物身份，旧完整检查不冒称覆盖新修改。

## 尚未完成

五项已有针对性GREEN；扩大回归、最终完整门禁、新规模及原30K连续长测仍未闭环。
Windows刚只读SSH复核仍在192.168.31.14:22超时，日志 `windows-readonly-availability.log`；没有Windows/UI验证。
先前Photos15停止、density16未执行及完整30K引用/重命名、SDK、UI限制保留。
500ms仍为体验目标；只豁免测试2GiB RSS停线；455仅冷目录3秒计时豁免，不免正确性。

## 后继修正版：针对性结果，不代替完整验收

001最终pending-owner guard组合13PASS/2FAIL/52名称过滤（两个失败随后确认为002/004的SDK fixture问题），
见 `ix14-recovery-routing-and-cache-diagnostics.log`。原8项rename及5项独立引用恢复均GREEN。
002/004的SDK元数据原来缺少声明路径，实际readiness为partial/sdk-inputs-incomplete，不具备结果缓存资格。
只修夹具的path=ets并新增公开READY断言，不放宽产品缓存规则；005去掉“初始revision必须≥2”的假设，
断言实际初始资格revision等于head/currentInput。三项最终 `ix14-qualified-cache-and-circuit-final.log`
3PASS/0FAIL/36过滤。真实恢复complete4次、stopped事件存在、Worker峰值1/关闭后0；不改称自然故障统计。

003证实另一个独立缺陷：projectFileSets按物理根共享，paths却来自调用者词法根。
refreshProjectMembership轮流扫描first/second，将未改文件误认作删除/新建，清空连续delta历史，
experimental第一消费者因而合理拒绝复用。观察日志 `ix14-alias-delta-v2-raw.ndjson` 与普通RED独立；
第一版观察器局部变量名不匹配造成两项timeout，是探针错误，不归为产品故障。

修复：catalog保存稳定scanRoot，刷新只在其真实物理根仍相等时复用扫描入口；改指向/失效则以当前调用根重扫。
不合并LS实例、不借用其他消费者已消费的delta、不规范化公开URI、不小写路径、不移除最终校验。
有界LRU发布逻辑提取到同一catalog模块，document-store从1573降至1567行（仍为迁移债）；type-engine为499行。
新公共Store回归先14PASS/1FAIL，修后15PASS/0FAIL；原framed stdio LSP双alias及新Store组合4PASS/0FAIL，
日志 `ix14-alias-catalog-public-red-and-characterization.log`、`ix14-alias-catalog-public-green.log`、
`ix14-alias-public-lsp-final.log`。撤掉物理根核验的受控mutation立即使retarget回归失败，
见 `ix14-alias-origin-guard-mutant-red.log`，随后恢复核验；不是自然时延实验。
所有旧失败与无效探针日志保留；当前仍未宣称完整GREEN或30K/UI验收通过。

扩大目录/引用/alias/回收/恢复组合 `ix14-final-expanded-controls.log` 已实际78PASS/0FAIL/0skip，275846ms。
这是正确性组合，期间另有编辑集/批验证组合运行，不作为自然时延统计。后者及新完整门禁仍待结束。

编辑集/分批验证 `ix14-final-edit-and-batch-contracts.log` 最终34PASS/0FAIL/0skip，151578ms。
后继完整检查独立命名IX15，持续隔离新路径，冻结全部输入并逐文件备份；当前尚未有最终结果。

## IX15环境权限失败与原样重放

IX15新路径完整检查在外部进程资源采样出现spawn EPERM；直接执行ps同样operation not permitted。
失败点为macosSampler与declaration facade A/B runner的真实进程采样，不据此认定产品语义错误。
允许进程采样的相同原始两项串行重放2PASS/0FAIL/29名称过滤，见
`ix15-external-sampling-permission-controls.log`。未mock数据、未跳过断言、未改产品。
为避免继续消耗已无法成功的全量运行，只停止核验过父子身份的专用测试树；不触碰Zed/日常服务。
IX15最终exit=-15、574.890秒、冻结2438输入未变，是**提前停止的不完整失败**，不称已跑完全量。
证据 `ix15-intentional-sandbox-stop.json`、`ix15-complete-check-receipt.json`、原始完整日志均保留。
Photos17控制器随失败停止，未启动Photos负载。后继IX16在允许真实进程采样的环境重新执行相同check:fast。

## IDX-V1-OBS-011：后续测试必须区分等待审计和审计失败

此为验收控制器缺口，不是产品或Native缺陷。严格authorize会拒绝缺失power proof，
而调度器未表示“会话已成功恢复输入、正在等审计”的阶段；会话结束与独立审计生成之间存在退出竞态。
在实际30K负载之前发现：scale19仍WAIT、runs为空，按精确命令/状态核对后仅停止其专用Python等待进程，
保存`execution-before-controller-supersession.json`并标SUPERSEDED_BEFORE_LOAD，不称产品失败或完成测试。
新scale21/density20只对成功、输入已恢复且proof缺失的父状态WAIT；失败/UNPROVEN/错收据仍终止。
既有严格验证器不改，纯函数新等待回归先RED后4PASS，旧严格6PASS；公开子进程控制器观察到
无proof时仍存活且不创建fixture，已有错误父状态/坏proof/失败scale继续拒绝。
更新旧“缺失proof必须立即退出”调度预期时的timeout证据保留，不当成产品挂死。

新顺序：IX16完整门禁 → Photos18独立原30K校准/7200s单会话 → 精确休眠窗口审计 →
scale21的持久化写入与128/2048/20K/30K对照（3轮普通与独立trace、冷/暖、固定闭包/增长闭包）→
density20固定2048源码的16/64/512KiB目标文件及3/128/2048引用。
控制器测试不等于实际压力结果；新增两个后继控制器当前都仅等待，无重叠负载。
SDK ets实际3536份声明/JSON文件、54585417字节的SHA manifest已只读记录，
不是完整SDK/READY证明。旧baseline安装产物逐项仍匹配；当前树状拓扑未独立覆盖共享依赖变化，不能宣称已覆盖。

证据位于`.bench/index-versioned-maintenance-20261104/{scale-acceptance-21,density-acceptance-20}/`：
`review-stage-red.log/green.log`、`controller-review-wait-green.log`、`scale-gate-red.log/green.log`、
`controller-scale-bypass-mutant-red.log`及恢复GREEN（各目录保留实际文件名）。
冻结产品W未修改；本节是R中的执行记录，不篡改正在运行的全量源码身份。

## IDX-V1-IX16-001：全量暴露自然纳秒时间的夹具恢复误差

IX16尚在运行，新增失败为`resident-first-edit-admission.test.mjs:280`：
`overlay synchronization cannot hide an unwatched same-size disk edit behind a known overlay change`。
失败发生在同尺寸写入后utimes恢复的mtime断言，**尚未发送新增overlay或查询新的引用**；
不能把这个断言失败称为产品返回旧结果。原失败未打印mtime两端数值，历史实际差值UNMEASURED。

相同Node20/Mac文件系统的独立真实API实验：1000自然样本未超容差；扩大10000次有5次超出原<0.001ms断言，
最大0.001220703125ms。样本beforeNs=1794251037809860215，afterNs=1794251037809859000，
从自然纳秒时间经浮点毫秒/秒后由utimes写为微秒时间，足以复现同一失败谓词。
不是编译器性能实验，也不将这5/10000外推为实际LSP故障概率或精确证明历史样本数值。

修正原型只在初始化/捕获pins/预热Program**之前**为该测试额外磁盘输入设置可精确表示的整数秒时间，
之后同尺寸无watch编辑仍按原方式恢复mtime，并把断言加强为mtimeMs完全相等，保留两种overlaySync策略、
全部新增引用/声明/诊断/owner恢复/正常关闭断言。1000次固定时间文件系统对照差值全0；
独立测试副本的公开framed LSP用例1PASS/7名称过滤（用例内两种overlaySync均执行）。
候选产品和当前W测试源均未改；完整检查继续收集其余失败，不能用原型GREEN改称IX16通过。

证据：`namespace-final-20261109/ix16-first-failure-and-diagnostic.json`、
`ix16-mtime-diagnostic/{precision-results-10000.json,precision-results-fixed-1000.json,filesystem-device-control.json,prototype-public-lsp-green.log}`。
完整失败日志原样保留；后继仅在完整运行终态后集成有证据的测试夹具修正及新一轮门禁。

### 拓扑验收缺口已具备执行工具，尚非实测结果

`topology-acceptance-22`的夹具/真实CLI8PASS、密度先决条件4PASS、公开控制器2PASS（RED均保留）。
固定2048源码、目标文本、总字节和完整可达集合：fanout8/16/32时最大深度固定6；
depth6/9/12时最大fanout固定8；共享边三档时fanout8/depth6固定。
共享边只指向下一层，保留DAG、不改闭包或用额外文件冒充共享；共享边会改变边数/度分布，须按实际指标解释。
这些指标由测试从实际import文本独立遍历核对，不把生成器自报值当实际Program成员数。
控制器仅等待密度完成，不与前置负载重叠；145计划会话含1独立校准，3轮普通/1轮trace与冷暖/旧新分别记。
新工具不等于新规模或性能结论；SDK/30K完整引用重命名/真实UI限制保留。

## IX16完整终态与最终夹具集成

IX16实际完整check:fast退出1：2455 tests /2454PASS/1FAIL/0skip/0cancel/0todo，
3914.812秒；2438输入全程未变。唯一失败IDX-V1-IX16-001是上述mtime恢复准备断言。
IX14五个已修问题均在此完整运行中实际GREEN，日志保存对应完整测试名；不把IX16改称通过。
Photos18/scale21/density20/topology22均因门禁失败STOPPED_FOR_DIAGNOSIS，实际压力runs为空，
未复制或启动原Photos项目负载，未将等待时间累计到正式耐久。

在完整终态后才集成独立原型到W：与冻结输入比较唯一变更为
`tests/semantic/resident-first-edit-admission.test.mjs`，417行。
保留旧源、前后SHA与改动边界在`ix16-mtime-integration-receipt.json`；
真实W整文件8PASS/0FAIL/0skip，19154ms，日志`ix16-integrated-mtime-public-green.log`。
这是测试输入确定性修正，无产品源码/阈值/断言放宽；相同毫秒值现在要求完全相等。
后继IX17重新执行完整pnpm check:fast，Rust仅在249源及Native相同的前提下明确复用原检查，不称重跑。
后继控制器使用独立目录与输出，旧失败/未运行状态均保留，不覆盖旧execution.json。

## 当前候选的自动后置审核（工具验证，不是实际长测结果）

Photos23增加独立只读`audit_after_session.py`/`formal_audit.py`，不修改正在等待的控制器或产品W。
先等待真实单会话终态，再核对源码/运行路径/SDK、7200秒正式窗口、输入恢复、必需混合动作、
实际shutdown/exit、已采样拥有进程关闭、SQLite逐库结果和进度终态；不是只接受COMPLETED/NORMAL标签。
有明确OOM/Worker fatal stderr时拒绝，正常cancel或仅RSS>2/4GiB不拒绝；不据stderr无命中证明没有未观测错误或泄漏。
已知完整引用/重命名缺口单独保留，不把power PASS称全功能或UI PASS。
实际SDK声明/JSON/链接的端点快照另比对，不能证明中间内容/物理身份整段未变，也不证明SDK完整。
真实pmset只读新查询必须exit0；按实际正式起止判断Sleep，FAIL/UNPROVEN均不能放行后续负载。

proof先完整写到自己的临时文件，再无覆盖原子发布；实际已有结论不能被新结果改写，
实时audit-state允许原子推进。反例覆盖旧proof保留、序列化失败无半文件、已采样进程仍活着、
正常标签与错误退出/坏库矛盾、缺失结果、短会话、缺失动作和源码/SDK不匹配。
纯控制与受控假pmset/假完成报告仅用于验证审核工具，不是实际7200秒或电源测量。
本目录全部Python控制33PASS（含原有17、新formal9、公开driver4、原子发布3），
错误覆盖mutation RED，恢复GREEN；日志位于`final-acceptance-23/*audit*log`、`complete-python-controls-green.log`。
实际审核进程已启动但仍WAITING_FOR_SESSION，尚无真实power结论或压力结果。
当前产品2438冻结输入继续核验，不因追加R中的报告更新W或重置完整运行。

## IX17完整检查实际GREEN，进入当前原Photos验收

IX17 `pnpm check:fast` 实际exit0：**2455/2455 PASS，0FAIL/0skip/0cancel/0todo**。
命令3873.435956秒，Node测试3866042.4348ms；2438冻结输入在完整运行前后完全一致。
原时间戳反例在本次完整执行中GREEN；旧IX14/15/16所有失败和控制数据仍保留。
完整收据 `namespace-final-20261109/ix17-complete-check-receipt.json` 与原始 `ix17-pnpm-check-fast.log`。
Rust为逐一249输入及相同Native二进制验证后的既有检查复用，见 `ix17-rust-reuse-evidence.json`，
不是本轮fresh cargo运行。构建后的四个主要产物仍与IX16一致，观察收据另存，不以此代替所有79运行资产验证。

Photos23实际已越过完整门禁并进入PREPARING_VERIFIED_ORIGINAL_INPUTS，
将逐文件验证原30K隔离数据和完整运行资产后再校准及开启独立正式会话。
准备/初始化/校准不能累计成两小时；此时还没有新长测或规模通过结论。
后置审核与scale24/density25/topology26仍等待，各自零实际压力runs；不部署日常Zed、不合并或发布。

## Photos23实际开始正式单会话（当前仍未完成）

冷索引实际30000/30000、跳过0，335341ms。原输入有13900ETS+16100TS，另60个配置/资源文件；
完整79运行资产核验后使用独立副本，协议驱动NOT UI。正式开始UTC2026-11-09T20:45:50.221Z，
即北京时间11月10日04:45:50.221；此前335秒初始化、校准及一小时门禁等待全部不计正式7200秒。
正式启动检查点见`photos23-formal-start-checkpoint.json`，当前运行不能称两小时通过。
初始化semanticPreparation报告为degraded/project-membership-incomplete，不能将30000 Native完整索引
混同为语义Program完整；局部操作仍实际执行。Worker指标projectFiles来自
`type-workspace-entry.ts:128`的membership.paths.length或workspace.documents.length，
不是compiler.getProgram().getSourceFiles；其峰20000不得当成实际Program成员数。

实际专用PID73276的允许名单环境核验：ARKTS_MEMORY_BUDGET_MB/ARKTS_BENCHMARK_CONTROL均NOT_SET，
SOAK_IGNORE_NODE_RSS_GUARD=1；运行配置defaultMemoryBudgetMiB=null。
只保存该三项，不留存/打印其他进程环境。未修改V8/产品超时/规模/内存策略。
实际采样Worker数量字段始终1、residentContext1；日志只观察到一次semantic.worker.started，
没有据RSS不下降推断泄漏。初步worker heap峰1081669000B、进程RSS峰1226104832B，
后续采样还能下降；这些是采样范围观察，不证明整个剩余会话或未观测线程无问题。

初步正式请求1523条按结果分桶：详情86次均ok，p50约184.20ms、max502.02ms；
补全134次均ok，p50约218.51ms、max1083.30ms；定义850次ok，p50约325.07ms、p95约3888.19ms、max5120.31ms，
另42次明确取消单列。该混合分布包含不同冷热/编辑状态，不作为单场景归因或最终结论。
引用54次-32801、58次-32803及重命名29次-32803全部保留为错误响应/功能缺口，不能算成功；
500ms仍只是体验目标，定义秒级长尾继续OPEN。实际逐次原始请求、位置、输入、时序在requests.ndjson及wire.ndjson.gz。
所有此处数字是指定live快照，不随会话继续而被视为最终值，见`photos23-live-formal-distributions.json`。

### IDX-V1-OBS-012：取消终态的事实写入计数未测

实际raw Native NDJSON才是完整维护事件来源；本轮server.log不输出详细maintenance phase。
早期server-log观察器0只表示“没有匹配到该日志类别”，不是0维护；保留原派生快照并添加解释，
使用`photos23-native-raw-terminal-observation.json`和原始responses.raw。
该快照173个唯一attempt/终态、无重复ID：首次明确writtenDocuments30000、factRowsWritten14220087；
其余有计数字段的终态单次最大writtenDocuments1，累计报告32document/25150fact rows。
**65个取消终态缺少写入字段，不能以默认0相加，也不能据此证明所有取消完全免写。**
这些是明确报告的逻辑facts计数，不是SQLite/设备物理写字节，旧456706174行的定义不能直接套作比例。
较后独立取消观察有167帧，141有最后progress（140workspace、1file），其余未观察到progress；
progress不是最终写入计数，不将其indexed0/1当作实际SQL写入或commit数。
此项为已确认观测缺口，当前不改运行中的产品/策略或中止正式会话；后续补证时区分排队取消、
发现/校验中取消和写入/发布边界，不能因没有字段而关闭过期工作成本问题。
证据`photos23-cancelled-attempt-progress-observation.json`及raw帧，原始日志保留。

## OBS012取消计数缺失的调用链补证（正式会话运行中只读分析）

`photos23-cancel-counter-call-chain.json`固定本次分析的7份源码SHA与stderr读取边界。
`maintenance_executor.rs`接收`Ok(Err)`后走`Terminal::failed`；
`maintenance.rs:96`的通用失败/取消终态没有writtenDocuments、factRowsWritten或fileWriteWork。
正常完成的workspace/file终态才传递这些计数，因此不能将取消终态缺字段转换为0。
`maintenance_fact_batch.rs`与`maintenance_file_engine.rs`会在write_versions自身出错时记录
`index.file-facts.write.cancelled/failed`，但后续解析结束、输入fence、staging/发布失败不保证经过该日志分支。
本次stderr前42886495字节未匹配到这些JSON事件，只能说明未观察到该类写调用错误日志，不能证明取消没有写入。

`versioned_file_writer.rs:36-56`在每次write_versions调用中安装SQLite hooks并保存返回前快照，
`versioned_write_observation.rs:24-48`计的是该调用的commit/rollback回调，不是全库提交或落盘字节。
workspace批次或file写入成功后仍可能在后续验证中失败；现有通用终态没有将已完成累计工作转交给观察者。
因此这是已确认的观测契约缺口，当前实际取消逐次累计写量仍未测；不能由静态的可能执行路径
进一步声称本轮某次取消确实发生了SQL写入。当前候选/运行资产没有修改，正式长测继续。

## 后继规模实验的测量口径复核（尚未运行）

`scale24-measurement-coverage-audit.json`记录控制器/查询脚本及实际W统计实现SHA。
scale24的普通会话不启用references trace；独立profile会话通过公开查询完成事件读取
实际Program.getSourceFiles/getRootFileNames，分项目/SDK/其他。只对成功查询后有事件的时点
报告Program成员，不能从fixture的staticClosureFiles或Worker membership指标补齐。
Program/checker序号及AST first-observed是isolate内身份观测，不是从进程启动起的累计构建/解析总次数。
旧round10的无关文件2048场景曾实测ProgramProjectFiles2048（历史候选），说明依赖图固定也不必然
意味着Program大小固定；该例不能冒称当前候选实测，须待scale24实际输出。

当前后继脚本没有独立filesystem read/realpath调用总量适配器，缺字段必须标未测；
Native的discovered/indexed/written计数不等同文件系统调用次数。普通时延、profile观测分开，
不为补此口径改变当前正式Photos会话或等待中的自校验控制器。

### 正式会话前约57分钟的资源分桶（中途观察）

`photos23-live-memory-ten-minute-bins.json`仅统计正式起点后的Worker metrics，
前5个完整10分钟桶的Node进程RSS中位数分别962.35、976.82、952.00、951.74、940.65MiB；
第50分钟开始的桶仍不完整。RSS取每PID一次，Worker heap为isolate指标，两者不可相加。
采样semanticWorkerCount/totalSemanticWorkerCount/residentContextCount均为1，transientVerifierCount为0；
不能据采样排除短暂未观测实例，更不以RSS峰后回落或当前中位数判定无泄漏。
当前负载包含不同真实输入/缓存和忙闲阶段，需正式结束后的资源与关闭证据共同评估，
不将不同阶段混成稳定状态内存斜率。

### Native terminal prefix near one formal hour (UTC21:45:01, interim)

`photos23-native-terminal-hour-prefix.json` records the first81368804 bytes of responses.raw:
886 terminals, no duplicate attempt IDs;148 qualified,304 cancelled,321 data-updated,111 unchanged,2 published-unqualified.
The initial30000-document write is separate. Of581 subsequent terminals with explicit write counters,
390 report0 and191 report1; totals reported191 documents/159878 logical fact rows, maximum1 document per reported terminal.
All304 cancelled terminals lack these counters: their write cost remains UNMEASURED, not zero.
This prefix does not prove a bound for every cancelled attempt or the remaining session.
The contemporaneous cache snapshot reports1870058076 logical bytes,1886240768 allocated unique bytes,
1863770112 database bytes,6254192 WAL bytes,32768 SHM bytes (dev/ino deduplicated).
These are endpoint file sizes, neither session peaks nor physical write bytes. No physical write-amplification ratio is inferred.

### Existing cancellation regression scope, verified against exact reused Rust log

The IX17 Rust reuse receipt pins unchanged Rust inputs and Native; it is not a fresh cargo run.
The exact reused `ix13-route-recovery-final-rust-workspace.log` confirms:

- line341: `cancelled_cold_prefix_is_reused_but_changed_removed_and_new_inputs_are_revalidated` ok.
  The real Native transcript blocks parser65 after64 written/staged files, cancels and verifies unpublished invisibility;
  changes/removes/adds inputs, then verifies62 valid files reused and66 actual parse calls, plus exact current queries.
- line1046: `cancellation_at_each_visited_admission_boundary_never_seals_a_partial_small_batch` ok.
  Covers pre-transaction/rollback/success controls; cancelled small batches have0 commit callbacks and no sealed versions.
- line1049: `large_file_cancel_keeps_committed_prefix_unpublished_reclaimable_and_retryable` ok.
  Requires an observed committed prefix (at least4 callbacks), unpublished/incomplete invisibility, reclamation and successful retry.

These controls prove the mechanisms and explicitly permit prior committed work on cancellation; they do not
measure cumulative cost of the304 live cancelled terminals or substitute for final30K integrity/closure.
Read-only Windows retry still exits255 with TCP timeout to192.168.31.14:22, recorded separately in
`windows-readonly-availability-20261110-followup.json`; no Windows test, UI or deployment executed.

### Worker lifecycle checkpoint (UTC21:54:22, initialization/calibration included)

`photos23-live-worker-lifecycle-check.json` reads59442429 bytes of server.log.
The Worker event namespace reports one semantic.worker.started, threadId1; observed dispatch epochs are solely1;
manualRestarts is0. Request dispatch.started is explicitly separate from Worker creation:11596 dispatches
include8143 diagnose,1831 define,218 semanticReadiness,249 complete,165 resolveCompletion,226 references,57 rename
and other methods. These are internal dispatches across initialization/calibration/formal stages, not UI/user action counts,
not completed requests or Program builds. No unlogged lifecycle activity is ruled out by this log-only prefix.
The first broad event-filter snapshot is retained as `photos23-worker-event-prefix-unfiltered.json`;
its dispatch entries must not be misread as11538 Worker creations. The narrowed lifecycle snapshot separates them.

## Photos23 final completed protocol session

The actual single-session window and postflight have completed, not merely reached a running timer.
7264.848s,1132 formal composite actions/5140 formal requests; restoration, normal shutdown/exit0,
both DB integrity and actual power/SDK endpoint audit PASS. Full references/rename failures, input races,
Native cancelled/failed missing counters, definition tails and UI/Windows limits remain explicit.
The final standalone report supersedes interim snapshots for totals, without deleting their historical evidence:
[Photos30K final protocol endurance](2026-11-10-photos30k-final-protocol-endurance.md).
Scale24 has actually entered persisted-source scale after the exact final proof; later experiments are not yet complete.


## IX18 current whole candidate gate PASS (2026-11-10)

Fresh full `pnpm check:fast`:2456/2456PASS,0fail/cancelled/skipped/todo,4141.296s wall;
raw Node test duration4132.627s.2439 source inputs unchanged before/after; no mid-run source edit.
This includes the new partial definition->member-completion Program-retention regression.
Receipts: `namespace-final-20261109/ix18-complete-check-receipt.json`, `ix18-pnpm-check-fast.log`,
`ix18-terminal-summary.json`, and exact4-file `ix18-root-retention-review.patch`.
Rust is explicitly reused from identical249 inputs/Native5f648342 with check-log hashes revalidated, not a fresh cargo run.
Photos27 gate has actually released into isolated originalPhotos input preparation. New formal7200s not yet started;
Photos23 completed endurance remains old-candidate evidence. Scale28/density29/topology30 wait serially.
Original scale24 failed95 results, full30K references/rename limits, definition tails, partialSDK, OBS012,
Windows SSH timeout and real UI tool-host failure remain recorded. No full feature/platform/performance acceptance.
No product threshold change, commit/push/merge/deployment or daily process restart.
