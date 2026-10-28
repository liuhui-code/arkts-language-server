# 30K 三项修复：最终功能与耐久验证

日期：2026-10-28。**最终candidate11的机制回归及7204.609秒单会话协议混合测试通过；时延按500ms体验目标评估，反复尾延迟保留；完整30K引用/重命名及全部SDK测试层仍未通过。**
本轮没有发布、合并、安装扩展、重启用户Zed或改动原Photos项目。所有中间失败保留，不追认原两小时失败为通过。
实施过程和失败历史见[实施报告](2026-10-27-three-soak-defects-implementation-and-endurance.md)，
最初根因见[三项问题诊断](2026-10-27-30k-issues-root-causes-and-adrs.md)。

后续真实UI请求的[独立验收记录](2026-10-28-zed-ui-30k-acceptance.md)：已准备隔离副本/profile及candidate11部署，
目前因macOS辅助功能/屏幕权限阻挡，UI0次/0秒，未启动测试实例；不得将本报告协议时间计入UI验收。
之后用户授权UI持续阻塞时先合并已验证修复；合并前775输入/87产物仍与本报告完整fast通过的候选一致，
该完整结果复用时必须说明身份相等，不冒称重新跑过2085项。实际PR/CI/合并提交由对应GitHub记录及合并收据另记，
本文“未合并”指此前验证时点，不代表后续远端状态；UI、SDK超时与完整30K范围限制不因此变为通过。

## 当前验收口径补充（2026-10-28用户明确调整）

**500ms是体验目标，允许适当波动；单次/偶发超过不独立判功能失败或阻塞交付。**
按典型操作、延迟分布、超目标频率、连续性和持续影响评估，不新增550ms/P95/比例等替代硬线。
原始数据与历史判定保留；持续严重慢响应、超时、错误及不可用不能由允许波动消除。
完整规则和旧自动化门禁的适用边界见[当前时延评估](../benchmarks/interactive-latency-assessment.md)。

复用本报告已有数据：补全列表41/645（6.36%）超过目标，详情46/304（15.13%），定义1375/3018（45.56%）。
补全/详情典型中位184.194/93.807ms；定义中位346.769ms，但多个时间段P95约1.99–2.26秒，不能一概称偶发。
workspace符号61次中位2067.720ms、最大10320.280ms，保留明显慢响应观察；比例/分位数都不是新硬门槛。
M003原八诊断越过缺陷已关闭，反复尾延迟另跟踪；M005的1005.862ms正确响应不因超过500ms改判功能失败。
这不是重跑/重标旧数值，也不是未经真实UI体验验证即宣称性能问题全部解决。

## 1. 方案、修复及边界

三项缺陷并非同一直接根因；共同约束是状态拥有者、输入代次和请求生命周期必须一致。

| 问题 | 正式实现 | 回归与真实输入证据 |
| --- | --- | --- |
| M001：移动恢复后删除历史探测目录，永久拒绝当前输入 | `LocalPackageResolutionOwner`统一持有解析答案、原始证明和代次；namespace/config变更同时撤销相应消费者的复用资格。closure/membership/Program及补全recipe绑定来源；未知变化当前请求拒绝、后继显式请求有界重载。普通body编辑不清全域 | 公开移动/目录生命周期、未知配置/SDK/符号链接及跨root对照；最终长测实际移动、恢复并删除目录37次，恢复后精确跳转全部通过 |
| M002：离开同步phase后取消计时倒退，误退役Worker | watchdog对同一命令取取消时间与最后合格活动时间的较大值；参考点单调延续至合法终态接收。产生、发送、接收分别观测；无消息或真正卡死仍受原宽限、绝对截止、退役与共享恢复预算约束 | 有限真实编译图＋50ms终态交付延迟先RED后GREEN；丢失终态和同步不返回仍按原截止退役/恢复。长测1Worker、0退役/恢复；**原自然30K精确竞态窗口仍未闭环** |
| M003：详情标为交互，实际仍排在所有诊断之后 | 22种Worker方法共用穷尽分类和实际派发策略；列表/详情同级，交互有限优先，同级FIFO，队首至多被绕过一次。保留mutation/global屏障、取消、背压及诊断公平性 | 八诊断公开积压对照、7种交互矩阵和256步公平性/屏障控制；长测304次详情均实际增加语义内容，无“原item回退”冒充成功；长在途诊断仍可能超过500ms |

实现入口：`local-package-resolution-owner.ts:15`、`workspace-resolution-inputs.ts:14`、
`type-context-reset.ts:14`、`semantic-worker-watchdog.ts:99`、`semantic-worker-progress.ts:43`、
`semantic-request-lanes.ts:6/37`，均在`src/core`或`src/semantic`下。
父端preResolved详情也经`prepared-completion-receipts.ts:11`的小收据准入，400KB载荷不回传、不绕过原请求上限或恢复约束。

长测另发现并正式修复两处相关的source authority交接遗漏：

- **M004**：compiler fallback先观察磁盘源，后来该文件成为overlay并保存；partial目录没有协调旧磁盘fact。
  candidate6动作212的AlbumDataImpl定义在compiler调用前拒绝；另一已保存源的旧事实5060字节、实际5091字节。
- **M005**：fallback源后来成为显式准入的磁盘snapshot；overlay关闭后，partial/default-resident路径未协调旧fact。
  candidate10动作255的Picker定义在compiler调用前拒绝；ScreenManager.ts旧17243字节、实际17200字节。

最终由`typescript-source-witness-updates.ts:19`的`observePreparedSourceRead`在LS安装当前脚本时交接自身原事实，
调用点`typescript-language-service.ts:304`。非overlay必须真实稳定读取且逐字等于已准入snapshot；
保留词法/物理边界、SDK排除、读取竞态和独立最终联合核验，不清整个witness或重建健康context。
complete/真实partial × resident0/1四格先3通过/1失败，再4/4通过；原输入/SDK/竞态相关82/82通过。

最终长测保留原顺序和输入：M004动作212、版本16/inputRevision2309精确跳转75.369ms；
M005动作255、请求1236、Picker版本183/inputRevision2885、零基53:20的ScreenManager.getInstance精确跳转1005.862ms。
后者修复的是可用性，**不把旧954.725ms错误响应与新1005.862ms正确响应说成提速，也不只因新响应超过500ms判功能失败**。
该关闭返回磁盘场景共38次，全部返回正确位置，最大1255.846ms。

## 2. 成熟方案依据与ADR

采用[TypeScript解析缓存的失效与消费者关联](https://github.com/microsoft/TypeScript/blob/main/src/compiler/resolutionCache.ts)、
[TS4.9.5可变LanguageService同步](https://raw.githubusercontent.com/microsoft/TypeScript/v4.9.5/src/services/services.ts)、
[clangd的单owner与更新/读取顺序](https://clangd.llvm.org/design/threads)、
[Node26.3 Worker的发送/接收/退出边界](https://nodejs.org/download/release/v26.3.0/docs/api/worker_threads.html)
和[LSP取消终态/保序合同](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/specification-3-14.md)。
[rust-analyzer的snapshot取消](https://rust-analyzer.github.io/book/contributing/architecture.html#cancellation)依赖安全unwind前提，
不能机械套用到此处原地TS同步。没有引入第二套依赖图、Salsa或并行可变Program。

Context7 resolve三次均传输失败，未成功query-docs；官方来源回退和实际安装4.9.5-r10源码证据见
`B/research-tool-results.json`、`B/installed-compiler-research.json`，其中B为下节证据根。

| 决策 | 约束与取舍 |
| --- | --- |
| [ADR0025：解析证明域及恢复](../adr/0025-namespace-proof-domain-recovery.md) | 答案/证明/消费者共代次；未知变化不静默发布，来源交接只更新当前已准入源。共享resolver仍有保守失效成本，未宣称精确逐import或规模无关 |
| [ADR0026：取消宽限与终态交付](../adr/0026-cancellation-grace-terminal-handoff.md) | 合格活动单调，发送不等于ACK，原绝对截止不变；不依赖Worker事件循环守护同步挂起 |
| [ADR0027：交互有限优先](../adr/0027-completion-details-diagnostic-priority.md) | 分类即实际调度来源，mutation/global保序，队首有界绕过；不抢占在途编译，不承诺自动达到500ms |

三份ADR均保持**Proposed，已授权实现并有验证收据**；没有虚构独立审阅或改成Accepted。
问题稳定标识及遗留项在[现有待办](../plans/2026-10-11-query-performance-follow-up-plan.md#soak-30k-m001)。

## 3. 固定身份与测试条件

证据根 **B=`.bench/30k-three-fixes-20261027`**；最终运行 **R=`B/soak-harness/functional-2h-candidate11-node-waived`**。
分支`fix/partial-program-lifecycle-20261026`，HEAD/父提交`17e923f0cb8c430b6a10793a0f3d2f9097febfec`，
加本轮及已有未提交工作树；不能把HEAD当成已提交的最终候选。
`candidate11-identity.json`、`candidate11-working-tree.patch`冻结775份源/测试/脚本/配置输入与87份运行产物。

| 输入/产物 | 实测身份 |
| --- | --- |
| server SHA256 | `913efb35639b32bfb7cc978eac5aa8f6e654a8a96147c9acf2b3572b8c161665` |
| Worker SHA256 | `77d318293de68f8701e108dd836790fac685e0eef9c87af7af8f273ef36377f0` |
| 原生索引SHA256 | `8e9babc3bdaaa32747e5f55df9016dc196431e2baa1250180de1f20301674016`，Rust未改 |
| 配置运行模块SHA256 | `8b3c7a53194fdf67b326d761f40d26c6d4a86ac46f7c9b3344fe2f3b6a6c36d3` |
| Node/机器 | 26.3.0、darwin/x64、Darwin25.6.0、16GiB Mac；V8各isolate原limit4395630592bytes不变 |
| 编译器 | ohos-typescript4.9.5-r10；SHA256`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc` |
| SDK | `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，API24/component6.1.1.125，44894文件；dialect仍未认证 |
| 项目 | 原`/Users/liuhui/Documents/code/applications_photos_30k`；只写`B/soak-harness/project`；13900ETS+16100TS=30000源码、30287总文件 |
| Zed扩展 | 只读记录`zed-installed-identity-readonly.json`；0.1.0-local-beta.1，安装包**不是candidate11**，未安装/重启，未断言当前UI进程加载身份 |

`plan.json`早期candidate字段保留了中间候选标记；它实际仅提供分布，**本次身份以driver selector、result与冻结哈希为准**，没有事后改写历史计划。
原项目、隔离项目、SDK及775/87身份在长测前后逐文件核对均零差异，见`candidate11-{pre,post}-soak-integrity.json`。
冷进程启动但没有清OS页缓存；不是硬件冷盘测试。

2026-10-27T09:37:18.954426Z记录用户临时授权，仅豁免本轮驱动Node RSS>2048MiB提前停测。
环境`SOAK_NODE_GUARD_MIB=2048 SOAK_IGNORE_NODE_RSS_GUARD=1`，保留2048原值和waived标志。
产品4096MiB策略、V8、超时、正确性断言不变；native5120/tree6144MiB、free15%、disk1024MiB、45s无响应保护保留。
旧条件candidate3在2069.5MiB被保护停止的原证据保留，首因external-memory-guard，不是OOM。
最终校准94.559s、50动作107请求、Node2312.180MiB，按授权继续完成，不算两小时。

## 4. 实际执行覆盖与功能结果

最终混合窗口UTC **2026-10-27 22:30:26.612 → 2026-10-28 00:30:31.212**，
Mac本地06:30:26→08:30:31；按同一驱动单调时钟为**7204.609272秒**，不含初始化、最终idle或清理。
`result.normalSingleSessionElapsedSeconds=7214.604`含最终10秒idle，`elapsedSeconds=7230.797`还含初始化/采样；不混用。

固定seed817954798、最多4个未完成公开请求、正常输入90–350ms、动作间隔300–1800ms；
44个目标、41份源码、不同模块和依赖闭包；没有手动重启，也没有continuation排除模式。

| 完成动作类别 | 数量 |
| --- | ---: |
| 阅读：定义/返回、hover、高亮、符号 | 273 |
| 开发：输入/短语法错误、补全/详情、批量替换/撤销/重做/保存 | 304 |
| 快速导航＋取消交错 | 172 |
| 多标签/跨模块/关闭重开 | 128 |
| 依赖/barrel/overlay与磁盘权威交接 | 118 |
| 外部文件生命周期/监听突发 | 95 |
| 配置切换与恢复 | 50 |
| 额外最新版本诊断加入/消除检查 | 57 |
| **全部已开始并完成** | **1197/1197** |

实际6635次change、2805次open和2805次close、364次外部写、37次移动/恢复/实际删探测目录、
32次watch突发、26次外部create及26次delete、28次save；70个idle窗口含3次180秒idle，11次idle后跳转均通过。
标签12是保留策略软值而非硬上限：观测openDocuments最大38，未谎称始终只有12个打开文件。

完整wire：5683客户端请求（含initialize/shutdown）、2个服务端请求均有唯一终态；无孤儿、重复或缺失终态，进度token全部end。
**用户操作RPC为5681：5394成功、170客户端取消、80输入变更取消、37完整范围不可用**。
只按RPC可用性：全部操作成功率94.948%；排除预期取消/被更新请求后为5394/5431=99.319%，**不是100%全功能通过**。
1197/1197指场景驱动完成，其中包含如实观察不可用并继续独立局部健康检查的动作，不能等同1197个全功能成功。

其中引用100次：80次与依赖编辑交错返回-32801，20次-32803；重命名17次均-32803。
初始化明确`degraded/project-membership-incomplete`，原20000成员上限未改。
20份引用错误说明完整snapshot不可用；17份rename只有通用current-input错误，**普通日志不能逐次精确归因到哪个内部拒绝分支**。
独立诊断前缀有membership guard证据，但不据此把每份通用错误精确同因化；37次均记功能缺口、不记成功。

全部172条cancel通知中，171条到达客户端尚未接收终态时、1条为终态后的合法晚到取消。
171条in-flight的cancel→terminal p50/p95/p99/max为1.350/1.737/2.544/3.117ms；
170份-32800，1份成功响应与取消交错，不把已完成结果的race误记取消失败。
后台取消具体次数未单独完整计数；恢复预算、致命退出和真正挂起另由公开控制回归验证，不能因长测0恢复就声称覆盖了每个恢复路径。

正确性强项是指定定义URI/range、编辑后的当前位置、所需补全成员及304份详情实际enriched、57次当前版本2322诊断加入并清除。
hover非空、符号/高亮范围、workspace符号路径为较弱oracle；导航prefetch和输入中的异步补全并非每份都有独立golden payload。
没有把所有RPC-ok一概当作完整语义等价证明。
5697份诊断中3份带旧版本通知在客户端发出新edit后的0.49–0.87ms抵达，原版本标签正确；
只凭双向wire不能证明服务器已先收到新edit，未认定为发布越过服务器版本fence，见`candidate11-diagnostic-version-wire-order.json`。

## 5. 时延、排队与实际阶段观测

单位ms，线性插值分位数；下表只列RPC成功样本，不把取消/不可用的快速响应混入性能成功。

| 方法 | 成功数 | p50 | p95 | p99 | 最大 |
| --- | ---: | ---: | ---: | ---: | ---: |
| definition | 3018 | 346.769 | 2139.148 | 3292.420 | 4230.839 |
| completion | 645 | 184.194 | 1114.218 | 1351.807 | 1516.381 |
| completion resolve，全部enriched | 304 | 93.807 | 1241.931 | 1353.905 | 1387.730 |
| hover | 445 | 223.063 | 1887.265 | 2761.093 | 3927.414 |
| documentHighlight | 445 | 316.479 | 1793.403 | 2428.276 | 2497.258 |
| documentSymbol | 273 | 341.417 | 2602.705 | 3071.362 | 3399.005 |
| typeDefinition | 172 | 962.714 | 1754.324 | 2309.943 | 2328.614 |
| workspace/symbol | 61 | 2067.720 | 5807.734 | 10082.904 | 10320.280 |
| codeAction | 31 | 155.712 | 1213.974 | 1244.016 | 1254.833 |

1981/5394份成功操作（36.73%）超过500ms，属于体验统计，不等于1981次功能失败；
全部操作超过目标的1998份还含17份失败rename，不能排除失败样本或仅据混合比例判定体验通过/失败。
initialize协议响应6.521ms不代表语义准备完成；实际语义初始化日志10068.751ms且degraded。
首次AlbumSelect.ets/onLoadingFinshed定义1502.622ms；native目录30000/30000 ready在22:36:02.501Z，独立于语义READY。

以“method＋完全相同params＋全局inputRevision”重新分首次/重复，忽略scenario，避免旧invocation标签误导：
定义首次成功2524份，p50/max910.772/4230.839ms；相同输入重复494份106.966/1723.384ms。
这些是热会话/同输入重复，**结果缓存命中及逐次AST复用未测**，不能由快慢推断命中。
具体场景：撤销后立即定义169份p50/max256.208/1560.149ms；关闭重开384份1143.916/3160.010ms；
移动恢复37份1490.653/1819.592ms；完整scope失败后的局部定义37份全部正确。

最慢详情请求3621，action762、SmartPickerPhotosDataImpl.ts版本155、resetDataSoak762，23:45:48.100Z发送：

1. trace37426父端准入→send返回 **1206.780335ms，占同一客户端1387.730313ms的86.961%**。
2. Worker10662接收→dispatch **0.112087ms**。
3. 剩余180.837891ms包含准备/执行、传输与客户端记录，普通运行未完整逐段归因；不全部叫compiler时间。

详情到来时10661诊断已在执行；它结束后下一条即10662详情，期间没有另派排队诊断，随后才10663诊断。
这符合“不抢占在途、有限优先、后台公平性”，原八诊断排队缺口未出现。
原5328.783ms与本轮最慢1387.730ms的目标/前置状态不同，**不是严格配对A/B提速率**。

全部详情父端等待p50/p95/max0.387/1144.801/1268.716ms，Worker接收→dispatch0.132/0.183/0.460ms；
这些总体分位数不相除当占比，也不跨时钟原点相减。诊断父端等待最大16229.692ms但继续服务，未声称有500ms保证。
内部59060次enqueued包括mutation/被合并或取消的待发送项，16987次send/dispatch不是公开请求数；
**实际父队列长度及全部取消未发送条目数未测**，不能用两者相减估计积压。

实际安装编译器wrapper计数：createProgram 5258进/5258正常返回、createTypeChecker 5261/5261、
synchronize 24127/24127；Worker退出采样pendingCommands=0。来源是`compiler-observation-plugin.mjs:34`及`semantic-worker-progress.ts:52`，
正常返回计数不含throw；并非用prepared/built标记猜测。createProgram可传oldProgram并复用AST，**不是5258次全项目冷解析**。
普通长测没有每个Program输入清单、解析/realpath/读文件数或内部阶段累计计时；这些保持未测。
metrics.projectFiles取`type-workspace-entry.ts:128`的membership/document视图，初始化20000、交互中位102/最大交互输入也变化，
**不是编译器真实SourceFile数量**；不能把实际依赖闭包与30000物理源码或20000上限混为一谈。

## 6. 内存、资源及关闭

3616份约2秒RSS样本。Node PID只算一次，含所有Worker线程；Worker heap为isolate-local，不能再叠加一份RSS。
native单独进程；tree是各进程RSS之和而非PSS，跨进程共享页可能重复计入。各自峰值不同时，禁止再相加当tree峰值。

| 观测 | p50 MiB | p95 MiB | 峰值 MiB |
| --- | ---: | ---: | ---: |
| Node PID RSS | 858.967 | 960.488 | 1877.195 |
| 原生索引RSS | 3811.070 | 4558.555 | 4806.793 |
| LSP＋native进程树RSS | 4748.736 | 5418.178 | 5623.672 |
| Worker heapUsed，35215份metrics | 642.742 | 762.890 | 1637.682 |

Worker GC独立采样最大heap1637.688MiB；6份Node report中的main heap13–19.228MiB，
父端request.completed样本最大21.803MiB，均只是可测采样，不声称捕获每瞬间峰值。
Worker GC观测32554条、累计duration52400.635ms、单条最大122.617ms；不是每次用户操作停顿之和，不能直接归因给慢请求。
没有显式GC、内存/超时/规模策略调整或为了2GiB的产品内存优化。

| mixed分钟 | Node RSS p50 | Worker heap p50 | Node RSS局部OLS MiB/min |
| --- | ---: | ---: | ---: |
| 10–30 | 865.742 | 638.651 | -0.840 |
| 30–60 | 858.342 | 646.451 | +0.494 |
| 60–90 | 847.967 | 636.853 | +1.860 |
| 90–120 | 852.572 | 645.176 | +2.889 |

局部斜率受GC、不同模块、文档集和缓存输入变化影响；中位数相近和未累计Worker不足以证明无泄漏，正斜率也不足以证明泄漏。
三次180秒idle的Node首→末877.359→825.926、791.387→772.418、825.355→701.668MiB；
最终10秒idle末774.277MiB，Worker heap末约597.866MiB，均未强制GC。
native末段RSS大幅波动，原因未插桩；不推测为SQLite页缓存或泄漏，4.8GiB高占用仍列待优化。

整个会话仅1个semantic Worker、最多2个服务进程（Node＋native），0自动恢复、0运行期退役、0手动重启。
residentContextCount采样始终1、coordinator leaseCount采样0，后者**不是编译器Registry全租约计数**。
FD：Node最后19/最大27、native最后9/最大11；JS监听器数未测。
Node进程累计CPU末83:13.63、native最后存活样本48:22.97，非单操作或单线程CPU分解。
系统free最低43%，磁盘最低66964.996MiB；resource/capture采样无错误，未触发其他保护。

shutdown响应623.726ms，LSP最终exit0；Worker-exit code1发生在正常shutdown的
`semantic-worker-shutdown.ts:24`调用terminate时，不能记为运行期崩溃/恢复。
2026-10-28T00:35:31Z按PID＋启动时间＋命令核验，LSP22372和native22377均不存在、无owned zombie，
见`candidate11-post-soak-processes.json`。无restoreError/closeError；退出后的完整输入哈希确认全部恢复。

## 7. 最终检查与未覆盖项

| 检查 | 最终候选实际结果 |
| --- | --- |
| `pnpm check:fast` | **exit0，2085/2085，0fail/cancelled/skipped/todo，3122831.819ms**；775输入/87产物及dist一致 |
| 相关source authority回归 | 82/82，83.009s；四格生命周期4/4；SDK96声明0重读和两轮独立身份核验原断言保留 |
| 事后协议审计工具 | 6/6；已知失败候选的负对照仍退出1，不能只靠driver completed判通过 |
| 真实SDK层 | **exit1：13项，11pass、2cancelled，440546.175ms**；既有1GiB Settings rename/incoming两控制各180s超时，未豁免、未改阈值，不能计整个层通过 |
| 最终协议长测 | audit passed、7204.609s、1197完整动作；37次完整范围不可用单列，不是全功能通过 |
| 455文件冷目录3秒门槛 | 沿用此前用户授权跳过，本轮未执行，不是PASS；[既有TDD记录](../tdd/shared-catalog-lexical-scan.md)的3.603547961s等历史失败保留，不作本轮测量 |
| Rust | 本轮无Rust变更；未冒称重跑新的focused cargo test |

SDK两超时的已有诊断显示反复SDK/context准备及resident不保留；具体内部阶段尚未全分解，
不是通过本轮Node2048豁免可消除的同一限制；未扩大到无关1GiB性能策略优化。
实际正常使用仍有尾延迟、完整范围缺口和原生高内存；缓存性能OP-04继续暂停。
本次新口径不把偶发越500ms作为交付阻塞，但多窗口反复秒级延迟及workspace符号的典型慢响应仍保留影响评估。
AXTrusted=false，**没有真实Zed UI连续点击/整机验收，也没有本轮Windows真机验证**；
两小时协议会话不能替代这些层。没有故意重启项目来抹累计问题，项目关闭重开/热原生缓存重开不是本轮2h覆盖。
完整30K全范围验证/重命名正确payload及批次执行受上限阻挡；没有不完整成功结果。
一次两小时未OOM/不可用不证明原自然OOM永久消除；原自然M002交付窗口仍未证，保留风险。

整个交付工作树的旧超限文件债务（相对父HEAD）：`typescript-language-service.ts`3096→3085、
`document-store.ts`1773→1765、`legacy-semantic-engine.ts`785→756、`tests/project-file-set-cache.test.mjs`2190→2170。
本轮进入时后两份产品文件已为1765/767，当前分别1765/756；保留此前提取，未假称已达500行。
相关type-engine498、proxy493、worker-runtime491，新helper38、namespace测试301；无新增超过500行手写源/测试/脚本。

## 8. 复现命令与证据索引

在仓库根、既有只读输入基线及已恢复隔离副本下串行执行；每个tag必须全新，不能覆盖旧结果。
首次重建需以candidate11身份检查冻结runtime，下面直接使用保留的最终产物；不操作真实Photos/Zed。

```sh
pnpm check:fast
ARKTS_REAL_SDK_PATH=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony pnpm test:e2e:real-sdk
SOAK_NODE_GUARD_MIB=2048 SOAK_IGNORE_NODE_RSS_GUARD=1 node .bench/30k-three-fixes-20261027/soak-harness/run-candidate11.mjs calibration NEW_CALIBRATION_TAG
SOAK_NODE_GUARD_MIB=2048 SOAK_IGNORE_NODE_RSS_GUARD=1 node .bench/30k-three-fixes-20261027/soak-harness/run-candidate11.mjs soak NEW_2H_TAG
node .bench/30k-three-fixes-20261027/audit-transcript.mjs .bench/30k-three-fixes-20261027/soak-harness/NEW_2H_TAG
node .bench/30k-three-fixes-20261027/soak-harness/summarize.mjs .bench/30k-three-fixes-20261027/soak-harness/NEW_2H_TAG
```

- R的`actions.ndjson`、`actions-summary.json`：每次输入/路径/符号/文档版本/顺序、前后状态及动作完成情况。
- R的`requests.ndjson`、`wire.ndjson.gz`：逐次原始耗时、完整双向协议与输入/取消，可按action/request ID检索。
- R的`logs/server.log`、`progress-observation.ndjson`：105776条日志level均为info，实际Program/checker/sync计数、世代与终态；RPC错误仍按前述分类保留。
- R的`resources.ndjson`、`worker-metrics.ndjson`、`gc-1.ndjson`、`fds.ndjson`、`system-memory.ndjson`、`reports/`：资源口径与时序；不是仅保存峰值。
- B的`candidate11-endurance-{audit,summary}.json`、`candidate11-final-derived-evidence.json`：审计、逐方法/场景统计、分窗内存、最慢详情同请求队列证据。
- B的`candidate11-{fast-final,real-sdk}-receipt.json`、对应完整log、`candidate11-post-soak-integrity.json`：最终检查、输入/SDK/产物一致性。
- B的`candidate11-final-delivery-working-tree.patch`及交付收据：最终可审查工作树（包含既有工作，不自动提交/合并）；冻结candidate11原patch不覆盖。
- B的`latency-policy-20261028/`：本次口径修订前文档副本、文档变化及校验收据；旧交付收据仍指向当时报告，产品/运行产物和原始耐久证据未改。
- 原始失败、旧保护触线、候选6/10失败、各独立诊断/最小RED和错误default导出的无效primer尝试继续保留；详见历史实施报告。

## 9. 合并候选的跨环境复核

提交`3ab8936`在Linux Node20.19.5的完整fast得到2082pass/3fail；这不是前述candidate11 Mac全绿的同环境重跑。
失败分别涉及前台dispatch与父端返回后核验的观测边界，以及失效后重建的合法命中；
原始失败、受控RED/GREEN、未能证明的自然CI精确窗口和仅测试范围的修订见
[合并CI观测边界记录](../tdd/2026-10-28-merge-ci-observation-boundaries.md)。
最终HEAD必须重新完成CI全量，不能以旧2085/2085代替；该记录及PR状态保留后续结果。
真实UI仍未执行、SDK两超时及完整30K范围缺口不因此变绿。
