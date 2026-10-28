# Mac Photos 30K 混合使用耐久测试

状态：本轮取证结束，耐久验收失败。完整正常主轮和补充探索会话都因发现问题提前停测，**未完成7200秒，不能宣称真实稳定**。没有继续重启刷通过。场景与停止合同见[测试计划](../plans/2026-10-27-30k-mixed-endurance-test.md)。

## 身份与隔离

- 分支`fix/partial-program-lifecycle-20261026`，父提交`17e923f0cb8c430b6a10793a0f3d2f9097febfec`，叠加未提交候选，包含最新取消接线修复；不是已提交main同义词。
- 普通运行server SHA256 `118d7575dfbb6cbd65ae87037e64a95fee03fad9d69d759cd785684643270b81`，Worker `6c583128f7b395053deff52a15d133e0f847bb20ae8d148d9a6bba979ec8efe3`。原生侧车 `8e9babc3bdaaa32747e5f55df9016dc196431e2baa1250180de1f20301674016`。
- Node26.3.0，实际编译器ohos-typescript4.9.5-r10；SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，日志API24/component6.1.1.125，dialectCompatibility仍unverified。
- 真实输入`/Users/liuhui/Documents/code/applications_photos_30k`的APFS隔离副本，30000源码（13900 ETS、16100 TS），保留模块拓扑和内容；44个独立声明/调用目标覆盖7个模块。所有写入限隔离副本。
- 原Zed1.25.3及安装扩展身份另存`extension-identity.json`。`AXIsProcessTrusted=false`，实际UI操作0，未安装候选到用户Zed、未关闭窗口或丢弃编辑。已有Zed自动请求日志只用于后台请求组合来源，不能算本候选UI通过。
- 全部证据根`.bench/30k-mixed-soak-20261027/`。`identity.json`含760项源码/配置/测试摘要，`worktree.diff`和原始身份保留。每轮记录实际制品与驱动哈希。

## 实际阶段

| 阶段 | 实际执行 | 结果 |
|---|---|---|
| calibration-v1 | 46.1s，24目标完成 | 原1536MiB外部Node线触发，1598.2MiB；不算产品OOM或泄漏证明 |
| memory-prefix-diagnostic | 12目标×3轮、36动作，141s | 显式GC后heap548.045/548.617/549.506MiB；只证明这段前缀可回收，不代表全矩阵 |
| calibration-v2 | 89.321s，44/44目标，50动作、107请求 | 独立精确定义、补全详情、诊断2322引入/消失、取消校准通过；refs/rename缺口另计 |
| old-control-v1 | 约39s，37请求，7动作完成 | 驱动exit1、无最终结果；同期间磁盘耗尽，具体退出原因未证实；不是旧版崩溃结论 |
| normal-2h-v1 | 有效耐久窗口0 | 监督器ENOSPC，环境中断，未开跑 |
| normal-2h-v2 | 47.412s总计、首次事故44.231s（混合开始后28.033s），6动作启动/5完成、29请求 | 最终计时31.214s还含事故采样，不能算有效负载窗口；未达到2h |
| move-minimal-v1 | 17.311s，无前5个混合动作 | 原制品独立复现，0/1/3s重试全失败；一个Worker，正常shutdown |
| move-diagnostic-v2/v3/v4/v5 | 独立诊断制品，不并入普通时延 | 确认栈、恢复边界与具体过期证明；哈希差异独立记录 |
| exploratory-2h-v1 | 518.702s总计，首次事故511.530s；103动作启动/102完成、512请求 | 取消截止终止Worker，前台失败；自动恢复1次；未达到2h |
| prefix-internal-v1 | 580.124s、108动作、529请求 | 无GC observer，内部消息观察；一个Worker，无换代，未稳定复现M002；不算耐久通过 |
| lifecycle-creation-v1 | 两个会话17.995/12.476s，15个断言步骤 | 新模块/实际光标/保存/依赖编辑/同目录rename/delete正确；自然shutdown后无存活自有进程 |
| move-keep-dir-control-v1 与 move-remove-dir-no-gc-control-v1 | 同制品、Node、无GC observer，仅目录保留/删除不同 | 保留空目录全部通过；删除目录持续-32803；结束后恢复隔离副本 |

磁盘初期耗尽属于测试环境/工具问题。已加入>=5120MiB开跑预检、<1024MiB停测；只对已停测缓存做逐字节验证的gzip归档，清理清单单独保存。用户Zed现场缓存未动。机器后续可用空间跳升，外部原因未测，不能归因于产品。

## M001：移动后恢复留下历史不存在路径证明，局部查询持续不可用

严重度高；本轮新发现并复现，尚未隔离引入提交，不能称已证明是本次取消修复引入的回归。

最小操作（全部在隔离副本）：

1. 打开`product/phone/src/main/ets/picker/PickerUIExtensionAbility__copy_003.ets`，查询`SelectParams.defaultParam`，零基位置70:46。基线定义正确，1104.17ms。
2. 把`feature/thirdselect/src/main/ets/default/utils/ThirdSelectConstants.ts`移至新建子目录`utils/soak_moved/ThirdSelectConstants.ts`，更新caller import，跳转正确。
3. 恢复caller import、依赖原路径，并删除刚产生的空`soak_moved`目录；立即再次跳转。
4. 普通主轮请求29耗时1668.36ms后返回`-32803 / Semantic query requires current workspace inputs`。独立最小复现请求4为1182.96ms，同样失败；后续立即/1秒/3秒探测84.47/18.48/21.68ms全为同错误。错误更快不是成功或缓存命中。

诊断运行：同内容推进版本、文档close/reopen、无关文件查询不能恢复；可逆配置变更并恢复后，同Worker恢复正确。该边界经诊断制品复现；普通制品扩展边界还需独立对照。没有Worker自动换代、超时或OOM，不能归因监督器熔断。

实际链路：公开definition → `SemanticRequestRunner` → proxy/Worker队列 → Legacy/TypeEngine → `TypeScriptLanguageServiceEngine.define` → `assertCurrentInputs` → `assertCurrentQueryInputs` → `loadedConfigurationIsCurrent` → `LocalPackageResolver.configurationFreshness` → `LoadedConfigurationWitness.freshness/scan`。

独立诊断v5记录了第一个实际不匹配路径：

`feature/thirdselect/src/main/ets/default/utils/soak_moved/oh-package.json5`

它一直不存在，但探测时最近存在的祖先原是`soak_moved`（inode204949283），删除空目录后变成`utils`（inode204928208）。历史负向探测证明仍参与后续查询校验，即使当前caller已不再import移动后的文件。旧证明不会被普通文档版本或关闭重开重载；配置刷新使resolver/witness reset后恢复。v4没有`markUnprovable`事件，v5的实际失配在`scan`，不能误称“unprovable布尔量永久置位”。

代码依据：`src/project/loaded-configuration-witness.ts:157`的freshness与scan验证全部保留事实；`:201`的lookupIdentity构建真实缺失祖先身份；`src/core/sdk/local-package-resolver.ts:45`合并resolver/model证明，`:207`的invalidate执行reset；`src/core/types/typescript-query-inputs.ts:38`拒绝失配；`src/lsp/semantic-request-runner.ts:177`转换为公开-32803。

同条件无GC observer对照补证：保留空目录时0/1/3秒探测140.90/46.37/41.48ms均正确，推进版本、关闭重开、无关文件也正确；删除空目录时持续失败。独立新模块的同目录rename/undo/delete也通过。因此已收窄到历史缺失祖先事实残留，不能泛称所有文件移动或重命名都坏。

最小修复方向（本轮不实施）：文件/命名空间变更时，由实际拥有者失效并重新加载相关查找缓存及其证明，或重建被影响的resolver证明域；保留符号链接/身份校验及最终新鲜度栅栏。不能仅删除失败事实后继续使用旧解析，也不能把全路径小写或吞掉错误当修复。需以“保留空目录/删除空目录、旧import已移除、连续移动、配置恢复、同session其他文件”为回归边界。

证据：`normal-2h-v2/anomalies/A001/`、`move-minimal-v1/{requests,actions}.ndjson`、`move-diagnostic-v2/input-failure-stacks.ndjson`、`move-fence-v5/witness-mismatch.ndjson`、`diagnostic-*-runtime.json`。诊断改动只存在冻结制品副本，原制品与产品源码未修改。

## 时延与资源口径

initialize RPC的7.14ms只是协议握手。普通主轮从initialize发送至semanticPreparation终态9028ms、探索8434ms、诊断前缀8755ms，三者均degraded（project-membership-incomplete），不是全项目READY；原生索引另有491秒的长轮进度区间。见`initialization-times.json`，不能把握手耗时当完整初始化。

探索轮另发现M002（活性事件，底层原因未闭环）和M003（已证实的排队性能问题）。不能因监督恢复成功就把M002算稳定通过。

### M002：后台取消截止导致前台一起不可用

2026-10-27 03:49:17.054Z（北京时间11:49:17.054），Worker世代1开始`diagnose`，内部id1394，文件`common/src/main/ets/default/model/browser/AbsDataSource.ts`，版本80，requiredRevision952。
第103动作正在24标签波次中，80ms逐个打开、50ms逐个关闭，然后回到caller；源码`run-language-server.ts:271`的didClose会取消文档和workspace新鲜度，不限于关闭文件自己的诊断。
03:49:17.690Z，公开请求512在重新打开的Picker文件版本80查询`filterMediaType`，零基76:15。
03:49:18.453Z，监督器记录`cancellation-deadline`，`elapsedMs1399.734`是从发送起的总等待，不是实测取消时长；宽限1000ms。随后03:49:18.458Z，definition返回-32603，耗时768.39ms，message为`Request textDocument/definition failed with message: Semantic worker unavailable`。
03:49:19.119Z创建thread2，03:49:19.429Z恢复18份overlay；driver随后因已封存事故停测，没有做恢复后新查询，不能声称客户端功能已恢复。

触发快照phase=idle；Program489/489、checker489/489、synchronize2205/2205，不能称卡在createProgram或OOM。普通轮GC最大148.88ms，最后一批GC合计约204.94ms；也不能仅靠这些数排除调度、观察器影响或终态消息竞态。需要内部命令/终态到达证据判断：真实取消迟滞、完成后尚未结算、计时器/消息到达竞态，三者尚未闭环。

仅重放最后动作、重建磁盘/overlay并关闭GC observer，没有Worker失败；但固定时刻重放会因冷态请求更慢而使后续close提前取消两个前台请求，返回空fallback，服务日志outcome=stale。此窗口不能视为M002复现或新增错误定义缺陷，也不能证明GC observer是根因。`window-no-gc-v1`原始结果的`window-reproduced-error`标签只表示oracle未全匹配，M002目标错误实际未复现，须按本说明解读。

同种子前缀重跑关闭GC observer、增加内部封套观察，执行108动作529公开请求，未复现。1442个已发送内部请求有1442个唯一终态，无缺失/重复/版本头不匹配；Worker post→父端receive中位0ms、最大16ms。该成功对照不能说明失败现场也没有竞态。M002的详细底层根因仍未闭环，不据一次对照给出修复宣称。Context7文档查询HTTP失败，观测边界核对[Node26.3 Worker官方文档](https://nodejs.org/download/release/v26.3.0/docs/api/worker_threads.html)，未机械将Node消息事件等同产品终态已结算。

该窗口还暴露测试工具的gzip反压监听器重复注册警告。驱动自测先RED（15个阻塞写入导致多个drain监听器），改为一次反压周期只注册一个drain回调后GREEN；没有提高监听器上限或改产品。原失败窗口和警告保留，最后创建/生命周期校验使用修正后的驱动。

### M003：补全详情在8个后台诊断之后才派发

请求70、action14，`feature/browser/src/main/ets/default/view/album/AlbumSetPageActionBar.ets`版本35，成员`createHorizontalActionBar`。补全详情5328.783ms，其中唯一关联的trace1282从父端admission到send-return5266.325ms（98.83%）；剩余全部阶段合计上界62.458ms。Worker接收到dispatch0.194ms在该上界内，不能再相加。
这段派发前区间实际有8个diagnose（内部id213–220）先执行；没有其他前台Worker请求插入。`src/semantic/semantic-request-lanes.ts`将resolveCompletion列为interactive，但普通诊断队列前的优先绕过只包含define/hover/complete，详情仍按FIFO落在诊断之后。不能把这5秒归因为重复SDK解析或编辑后Program重建。
最小改进方向是统一前台请求的有界公平调度与诊断取消/终态交接，保留全局屏障和防饥饿；本轮不改调度代码。证据`slow-resolve-timeline.json`、`over-500ms.ndjson`含对应trace和全部params。

探索轮逐操作分布（包含错误/取消，不把失败排除；更细分组见analysis.json）：

| 操作 | 次数 | p50/p95/p99/max ms | 公开错误数 |
|---|---:|---|---:|
| definition | 277 | 221.21/2055.23/3194.08/4313.29 | 18（17客户端取消、1不可用） |
| completion | 51 | 150.99/1082.57/1519.03/1519.03 | 0 |
| resolve详情 | 25 | 59.13/5299.62/5328.78/5328.78 | 0 |
| hover | 46 | 142.46/1234.15/6899.28/6899.28 | 0 |
| highlight | 46 | 191.82/4769.45/6833.47/6833.47 | 0 |
| documentSymbol | 29 | 236.80/4770.34/5760.97/5760.97 | 0 |
| typeDefinition | 17 | 275.78/6774.55/6774.55/6774.55 | 0 |
| workspaceSymbol | 6 | 1100.91/2584.50/2584.50/2584.50 | 0；结果完整性未证明 |
| references | 6 | 2.81/16.10/16.10/16.10 | 6（5编辑交错content-modified、1完整性限制） |
| rename | 4 | 2029.36/2459.94/2459.94/2459.94 | 4（能力/完整性缺口） |

rename未出现在本轮initialize广告能力中，强制协议探测不等于真实编辑器可发起重命名。17次显式取消，cancel→terminal中位2ms、p95/max1003ms；不是所有取消都低于500ms。512次请求共136次>500ms，40个查询文件、43个目标；498次didChange、241次open/241次close、1次save、4次真实类型诊断引入/消失校验。热点和不同文件都执行，仍不能代表所有30K文件语义正确。

探索轮Node RSS峰值1557.68MiB、原生4194.43MiB、同一采样服务树4876.70MiB；最大Node/Native峰值出现时刻不同。发生取消截止前Node RSS已回落约676MiB、Worker heap约699MiB，不能把该事件称OOM或RSS泄漏。8分钟仍不足以判断长期稳定斜率；没有触发外部内存/磁盘保护。

Worker heap采样峰值1881.36MiB，是V8逻辑堆使用量，采样节奏与ps RSS不同，不能加到Node RSS上或当实际物理页。Worker采样最大1、累计创建2、自动恢复1；上下文最大1。Node数字fd首/末/峰14/19/20，native9/8/9。所有空闲窗口短于20秒且native仍在索引，不具备稳定全系统空闲平台，OLS趋势只描述这些采样，不能据此推断泄漏。原生约4.1GiB是实际独立进程成本，不能用Node的4GiB压力配置说明整服务树内存已受同一预算覆盖。

索引progress从03:40:47.147Z begin到03:48:58.330Z end，约491.18s，短轮停在99%的现象在长轮有终态；进度结束本身不证明索引完整性。尝试追加原生栈采样时进程已随停测退出，sample报“no longer running”，没有热点栈可用于归因。

普通主轮29个请求（包括initialize、取消、内容变化和失败）p50/p95/p99/max为938.97/1719.49/2193.67/2193.67ms。定义19次包含取消和失败，p50/max1083.63/2193.67ms；补全130.63ms、详情58.54ms，各仅1次，不能当稳定分布。逐次>500ms记录在各轮`over-500ms.ndjson`，包含方法、文件、位置、版本、输入revision、前置场景及错误。

主轮Node RSS峰值1067.44MiB、原生3413.11MiB、同时服务树4386.55MiB。峰值不是各独立峰值相加。Node按PID只计一次，包含Worker线程；Worker isolate heap单独记录；进程RSS之和不是PSS。主轮只有一个Worker、无自动恢复。主轮很短，不能判断长期斜率或泄漏。

普通运行只加只读GC observer和原有trace/metrics，不强制GC或替换编译器；观察器有调度/I/O开销，不能声称零扰动。探索轮在监督器失败快照中实测Program489次开始/返回、checker489、synchronize2205，包含初始化及各请求；这些不是489次全30K Program。实际每次Program输入/解析文件数和JS监听器数量未测。独立memory诊断的显式GC与真实Program文件/parse计数不可混入普通计时；`worker-metrics.projectFiles`也不冒充实际Program文件数。repeat同revision不冒充结果缓存命中。

原生索引在多次短轮停止时仍报告30000/30000、99%，没有end；这时只能记录“尚未结束”，不能凭短轮断言卡死。长轮结论待补。

## 复现和分析

在仓库根，使用已有冻结制品、SDK、隔离副本（不要指向真实项目）：

```sh
node --test .bench/30k-mixed-soak-20261027/driver-contract.test.mjs
python3 -m unittest discover -s .bench/30k-mixed-soak-20261027 -p test_analysis.py
SOAK_NODE_GUARD_MIB=2048 node .bench/30k-mixed-soak-20261027/move-repro.mjs move-new-unique-tag
python3 .bench/30k-mixed-soak-20261027/supervise.py soak normal-new-unique-tag
python3 .bench/30k-mixed-soak-20261027/supervise.py continuation explore-new-unique-tag
python3 .bench/30k-mixed-soak-20261027/analyze.py normal-2h-v2 calibration-v2
```

目录标签不得重复覆盖。固定种子817954798；完整消息在`wire.ndjson.gz`，动作包含输入文本、外部写入、版本和顺序，事故保存最近1000条/32MiB消息、overlay及现场文件。恢复归档SQLite前必须将对应WAL.gz解压回原名，并按`cache-archives.json`核对SHA；不能把只有DB/SHM的目录当完整缓存使用。

最终驱动oracle/反压与Worker observer自测7/7、分析器5/5，脚本语法与500行限制检查通过；RED/GREEN及父提交见`tooling-validation.json`和对应日志。此前候选`pnpm check:fast`2052/2052通过是先前代码回归证据，**不是耐久稳定证明**；本轮未改产品代码，没有把该结果冒充新一轮全量检查。

## 未覆盖与限制（持续补充）

- 真正Zed前台点击、输入、返回及UI进度验收0次；不能用协议会话替代。
- 正常完整7200s矩阵因M001提前失败；探索排除该动作后因M002再次提前失败，两者都未完成2h。
- 全30K完整引用/重命名仍是用户可见缺口，不能计功能成功；hover/高亮/符号主要检结构，完整内容正确性只对有独立oracle的定义/成员补全/诊断标记作保证。
- 长轮输入期并发补全仍对已知成员位置发起；补充创建场景验证了实际新输入光标补全/详情，但没有完整替代长轮每个光标动作。
- 24是每次波次选择的文件数；其他阅读/编辑也会留标签，12只在标签动作结束时裁剪。实际主轮峰值25、探索/前缀峰值34个打开文档，不应把这些数据当严格12标签负载；RPC并发峰值始终4。每轮结束overlay均为0，见`tab-accounting.json`。
- 配置测试是build-profile可逆注释和didChangeConfiguration空settings，验证重新加载/恢复路径；有效编译选项、模块选择、SDK切换的行为变化未覆盖。
- 发起references后改依赖已执行，但实际返回content-modified/完整性限制；没有证据说明它已进入完整引用搜索，不能宣称覆盖了真实长引用任务中途编辑。
- 项目close/reopen只验证完整LSP shutdown/新会话，原生缓存每次隔离冷目录；未测同进程工作区folder切换（服务器未广告该能力）、热native缓存重开、熔断后真实重试恢复。故障/极限独立阶段未执行；`run.mjs`的extreme/reopen占位循环不算覆盖。
- 180秒长空闲和7200秒稳定平台未执行到；本轮不含受控卡死/OOM注入，未复现产品OOM。
- 原项目30287文件逐字节SHA核对无差异；隔离副本最终也逐文件核对，结果见`original-diff.json`/`isolated-diff.json`。mtime不比较，用户未保存编辑从未读取覆盖。760项产品输入与运行制品哈希未变，见`final-product-identity.json`。

优先级：先修M001的证明生命周期（稳定复现、直接阻断局部功能），并对M002保留内部收发/取消时刻和监督端事件循环证据以定位竞态；随后处理M003前台详情排队。另对native高内存及索引长时成本做独立资源分析。以上均是本轮发现和建议，本轮没有实施产品修复、发布或合并；原无关缓存TODO未启动。

| 场景域 | 实际覆盖 | 验收限制 |
|---|---|---|
| 阅读 | 40查询文件/43目标；定义、hover、高亮、文档/工作区符号 | 定义有独立oracle；其他部分为结构校验；全refs/rename失败 |
| 开发 | 498次change，13轮输入undo、12轮批量替换undo/redo，4次诊断版本标记 | 另补实际光标新成员补全/详情；非每次真实键盘事件 |
| 导航与取消 | 17组四请求prefetch/取消，立即后继定义 | 1次后台取消截止影响前台，未稳定最小化 |
| 标签/模块 | 11个标签波次，跨7模块、关闭重开31次 | 其中最后一次失败；实际峰34标签 |
| 依赖/barrel | 4次overlay与磁盘冲突，4次barrel、1次直接依赖修改 | 完整引用运行中的编辑未真正进入搜索阶段 |
| 文件系统 | 2次监听突发，3次增删；补充新建导入/改行/同目录rename/delete | 新目录移动后删除旧探测目录稳定失败 |
| 配置/生命周期 | 3次配置重载恢复；另2次真实进程shutdown/新会话 | 有效配置语义变化、热native重开未覆盖 |
| 耐久/空闲/故障 | 两个7200s目标会话实际提前失败，短闲有观测 | 2h、180s长闲、极限/故障阶段未完成，不能验收稳定 |

全部原始请求/输入/取消和终态时间线留在逐轮目录；`issues.json`记录分类，`progress.json`记录本轮最终失败状态，`harness-final.tar.gz`与`evidence-manifest.json`供复跑和核验。没有隐藏失败样本或把短前缀通过当整机长测通过。
