# 30K三项缺陷：实现与耐久验收

日期2026-10-27开始，跨至2026-10-28；最终状态：**candidate11完整fast2085/2085、7204.609秒单会话协议混合验证及事后审计通过；既有SDK层两项控制仍超时，反复尾延迟与完整30K功能缺口保留**。
最终身份、口径、逐方法分位数、资源/关闭审计及限制见[最终验证报告](2026-10-28-three-soak-defects-final-verification.md)。
2026-10-28用户后续明确：[500ms是体验目标](../benchmarks/interactive-latency-assessment.md)，偶发超过不独立判功能失败/阻塞交付；
按典型操作、分布、频率和持续性评估，不新增替代硬线。下方当时的“500ms未达”等表述保留历史数据语境，不作为单次硬门槛。
父提交`17e923f0cb8c430b6a10793a0f3d2f9097febfec`，保留已有工作树，无合并、发布、安装或用户Zed重启。
历史两轮混合测试仍为FAIL，见[原报告](2026-10-27-30k-mixed-endurance.md)；本轮结果不追认历史通过。

## 身份与输入

证据根`.bench/30k-three-fixes-20261027/`（下称B），工作分支`fix/partial-program-lifecycle-20261026`。
`baseline*`保留本轮开始的工作树及757项目录输入，根package/lock/tsconfig另计后为760。
中间candidate3的`candidate3-identity.json`含767项源码/测试/脚本/配置输入与87项冻结运行产物；
`candidate3-working-tree.patch`可还原候选，`candidate3-prefinal-identity-check.json`确认完整检查前零源码差异。
完整检查反例修正后的中间candidate4见`candidate4-identity.json`：768项输入/87项产物，
冻结路径`soak-harness/runtime/candidate4`；完整含新增文件的差异为`candidate4-working-tree.patch`。
candidate3产物仍在原`runtime/candidate`，不覆写其日志或指纹。
candidate4随后完整检查确实FAIL，中间candidate5见`candidate5-identity.json`：774项输入/87项产物，
`candidate5-working-tree.patch`包含新增文件；冻结`runtime/candidate5`，前述各候选继续保留。
candidate5全量2074/2075、1项canonical owner原表征失败，已补齐既有新owner分类；
中间candidate6见`candidate6-identity.json`及完整差异，774项输入/87项产物，冻结`runtime/candidate6`。
其耐久随后失败并补出M004，候选7亦有删除边界反例；候选8的完整检查失败11项，原始收据保留。
候选9修正产品后的相关回归通过，完整检查遇到测试首次/重建后查询混淆，停止exit143；详见末节。
candidate10只调整该测试前置条件，产品与9字节一致，之后其真实耐久又暴露M005。
当前candidate11见`candidate11-identity.json`、`candidate11-working-tree.patch`：775输入/87产物，冻结`runtime/candidate11`。

| 项目 | 本轮固定值 |
| --- | --- |
| 当前candidate11 server SHA256 | `913efb35639b32bfb7cc978eac5aa8f6e654a8a96147c9acf2b3572b8c161665` |
| 当前candidate11 Worker SHA256 | `77d318293de68f8701e108dd836790fac685e0eef9c87af7af8f273ef36377f0` |
| 中间candidate10 Worker | `b57d54dc6a23b0efff39d44a8e280b51e722c7cc525409bcc8d69bef94ca2aba`，与9字节相同 |
| 中间candidate8 Worker | `e5857d35a61b922ff703fabf06fc93f2564d1533abf9d059de3fdc5435dceb4f`，server与9相同 |
| 中间candidate7 Worker | `0f175d7326d4071829e213d507f383015468c210a55ab561f299312ddd61bc48`，server与8相同 |
| 中间candidate6 Worker | `7529fc516e1dd648bf20b686f8a5e927e2477356124ded60047cee581915f023`，server与8相同 |
| 中间candidate5 Worker | `0fca9a755cb3002d9e06539c50ca230a79f64081972bc0310f4f9f30a1873cf5`，server与6相同 |
| 中间candidate4 server / Worker | `b8226466…f5c72` / `9f5d7114…a17c`，完整值见其identity |
| 中间candidate3 server / Worker | `be21bd63…db2e` / `4cb278d8…5e1`，仅对应前述旧校准 |
| 对照server / Worker | `118d7575…270b81` / `6c583128…efe3`，完整值见baseline校准result |
| 原生索引SHA256 | `8e9babc3bdaaa32747e5f55df9016dc196431e2baa1250180de1f20301674016`，未改Rust |
| Node | 26.3.0，darwin/x64、Darwin25.6.0、Mac16GiB；原始Node report保留 |
| 编译器 | ohos-typescript4.9.5-r10，SHA256 `af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc` |
| SDK | `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，API24/component6.1.1.125，dialect未认证 |
| 项目 | 原30K Photos的隔离副本，13900 ETS+16100 TS；30287份文件字节指纹与原项目一致 |
| 写入边界 | `B/soak-harness/project`，原项目只读；`project-before.json`保存全量输入 |
| UI | `ax-trust.txt=false`，未做真实Zed点击，不把协议混合会话表述为整机UI通过 |

只读已安装扩展身份见`zed-installed-identity-readonly.json`：ArkTS0.1.0-local-beta.1，
wasm SHA `3776f76d011d2e3b2fafc5df67a6361558704107d51c9bbfa284b4889a5da774`；
扩展目录`eb601694…a18474b7`，launcher仍指向安装包`f6728882…34dc400`。
本轮没有安装任何候选、启动或重启该扩展；安装指向不等于日常Zed实际进程身份，协议使用上表冻结产物。

启动仍为degraded：30000源码超过20000 membership上限。局部操作独立认证，全范围引用/重命名-32803仍是用户可见缺口，
不得计功能成功；未抬规模、超时、V8或产品内存阈值。实际进入Program的文件不能用catalog/projectFiles20000代替；
本轮普通耐久没有逐次compiler输入清单，未测部分不推断。

## 方案依据及适配

Context7三次resolve均因transport error失败，未获取query-docs；原始工具结果和官方回退在`research-tool-results.json`、
实际安装编译器片段/哈希在`installed-compiler-research.json`。本轮不改安装的编译器或SDK。

| 机制 | 官方依据 | 本仓库适配及限制 |
| --- | --- | --- |
| 解析答案、负查找、消费者共同失效 | [TS resolutionCache源码](https://github.com/microsoft/TypeScript/blob/main/src/compiler/resolutionCache.ts)；安装4.9包同类入口 | 同一resolver拥有缓存/证明代次；DocumentStore closure/membership及Program消费链绑定，保留自定义Harmony及物理身份核验；不调用未承诺稳定的TS内部API |
| 可变AST同步与取消边界 | [TS4.9.5 services](https://raw.githubusercontent.com/microsoft/TypeScript/v4.9.5/src/services/services.ts)、[clangd线程设计](https://clangd.llvm.org/design/threads)与[20.1.8 scheduler](https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-20.1.8/clang-tools-extra/clangd/TUScheduler.cpp) | 单可变owner，保留mutation/读版本顺序和不可安全回滚阶段；不复制clangd过期preamble返回或每TU并行架构 |
| snapshot取消的适用前提 | [rust-analyzer cancellation](https://rust-analyzer.github.io/book/contributing/architecture.html#cancellation) | Salsa/不可变快照能安全展开，不证明此处原地TS同步能任意抛取消 |
| 发送、接收、退出不同边界 | [Node26.3 Worker官方文档](https://nodejs.org/download/release/v26.3.0/docs/api/worker_threads.html) | 终态produced/sent只读里程碑；合法接收才结清，丢包仍有界退役，terminate由既有父端监督，不靠Worker timer |
| 取消仍要响应，语义相关操作保序 | [LSP官方3.14稳定合同](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/specification-3-14.md) | 版本/单终态/取消不变；仅重排可独立交互，global和mutation屏障保留。未假称本次完整读取3.17正文 |

ADR[0025](../adr/0025-namespace-proof-domain-recovery.md)、[0026](../adr/0026-cancellation-grace-terminal-handoff.md)、
[0027](../adr/0027-completion-details-diagnostic-priority.md)记录方案、替代方案、边界及回滚。
状态保留Proposed：维护者授权实现，未虚构独立设计评审或追认Accepted；既有ADR历史不变。

## 三项修复及回归

| 问题 | 实际改动 | 失败→通过证据 |
| --- | --- | --- |
| M001 | `LocalPackageResolutionOwner`同域管理缓存/原始证明/代次；失效后实际重载。WorkspaceResolutionInputs协调closure/membership；LS witness及条目绑定消费代次，本地视图绑定生产者，不跨isolate比较本地计数 | `m001-red.log`恢复删目录-32803；`m001-focused.log`34/34。补target消费者反例`m001-target-consumer-red.log`保留；完整消费者回归`m001-consumer-focused.log`20/20 |
| M002 | watchdog合格同步活动参考点至合法终态接收始终单调，离开phase不能回退。SAB原64byte备用字记录产生/发送；不延长原绝对截止或取消预算 | `m002-red.log`、`m002-terminal-observation-red.log`；有限终态交付通过，丢失终态仍在原宽限内退役一次并恢复；原不可返回绝对截止对照通过 |
| M003 | 22方法穷尽分类统一优先级，列表与详情同级；所有交互有限优先、同级FIFO、队首至多绕过一次、global屏障及mutation顺序不变 | `m003-red.log`；7项公开交互矩阵与3项策略/256步公平性对照通过；`m003-public-matrix.log`的错误signature坐标作为驱动失败保留，修正坐标后GREEN |

`candidate3-focused.log`16/16含三项与独立Worker引用最终核验；候选迭代后新增7个test entry纳入fast，共264 entries，未放宽原断言。
细节与命令见[TDD收据](../tdd/2026-10-27-three-soak-defects.md)。M002受控边界根因成立，但原自然30K竞态的精确终态时序仍未闭环。
普通body/原子save保留合法解析代次；只对过时解析命名空间保守重建元数据域，不在每次编辑清所有缓存或重启Worker。
共享resolver跨root的保守重建成本仍存在；不是精确到import的失效图，不宣称规模无关或500ms已达标。

实现定位（本候选行号，供逐项审查）：

- M001：`src/core/sdk/local-package-resolution-owner.ts:36/46/81`创建见证、准入和整域退役；
  `src/core/workspace/workspace-resolution-inputs.ts:7`协调消费者；`document-store.ts:885/960/1451/1476`
  分别在视图准备、生产者绑定、closure存储与复用时约束代次；`type-context-reset.ts:13`退役旧Program消费者。
- M002：`src/semantic/semantic-worker-watchdog.ts:99`保持取消参考点；`semantic-worker-progress.ts:43`记录真实终态发送；
  `semantic-worker-runtime.ts:269/435`成功/错误都走同一发送边界。请求结果仍由父端现有校验结清。
- M003：`src/semantic/semantic-request-lanes.ts:6/37`为穷尽策略表/实际选择器，
  不新增独立优先名单。全量回归继续保护supervisor的mutation、旧世代和恢复合同。

行数：修改后的resolver431、type-engine498、worker-runtime491；新owner与workspace协调各低于150行。
已有超限债务`typescript-language-service.ts`3096→3085、`document-store.ts`1765→1765、`legacy-semantic-engine.ts`767→756，
本轮提取内聚责任且未增加行数；未假称这些旧文件已达500行。

## 临时测试条件变更与校准

09:37:18.954426Z记录用户授权，**只禁用本轮驱动Node RSS>2048MiB提前停测**。
`node-rss-test-waiver.json`保存权限、范围及原条件；新tag设置`SOAK_IGNORE_NODE_RSS_GUARD=1`，仍记录原2048数值与waived标志。
native5120MiB、tree6144MiB、系统free15%、磁盘1024MiB、45s无响应保护不变；真实OOM/崩溃/错误/不可用仍失败。
`node-waiver-red.log`→`node-waiver-green.log`9/9验证只跳过Node项；未做为了压入2GiB的产品内存优化。
`v8-limit-comparison.json`从原始Node诊断report核对旧版及两候选：main/Worker实际heap limit均4395630592 bytes，
不是通过抬V8上限取得新条件结果。

| 独立运行 | 条件 / 结论 | 动作/请求 | Node / native / tree采样峰值MiB |
| --- | --- | --- | --- |
| calibration-candidate3 | 原2048 guard，68.568s保护停止，首因external-memory-guard；不是OOM/Worker故障 | 38 / 76 | 2069.5 / 3598.6 / 5117.4 |
| calibration-baseline | 原2048 guard，对照旧产物90.125s完成，无异常 | 50 / 107 | 1568.0 / 3610.9 / 5174.5 |
| calibration-candidate3-node-waived | 仅Node豁免，91.503s完成，无异常 | 50 / 107 | 2399.0 / 3612.2 / 6009.5 |
| calibration-candidate4-node-waived | 已知namespace范围修正，94.227s完成，无异常 | 50 / 107 | 2384.8 / 3607.3 / 5990.3 |
| calibration-candidate5-node-waived | 命令/派生来源准入修正，90.695s完成，无异常 | 50 / 107 | 1948.3 / 3600.6 / 4576.7 |
| calibration-candidate6-node-waived | 中间候选，97.807s完成，无异常 | 50 / 107 | 2308.4 / 3498.7 / 5759.2 |

各轮均独立新进程，原型GC/进度观测不改源码、cancel cell、阈值或显式GC；未把校准计入7200s。
各轮为新LSP/Worker冷进程，未清OS文件缓存；逻辑输入字节相同，恢复编辑会改变隔离文件时间戳。
candidate5峰值较低不能单轮归因代码：GC及native索引完成时点不同，亦未实施压进2GiB的内存优化。
失败轮result.stopReason随后被unexpected-exit覆盖，**first incident保留外部保护原触发原因**，分析以此为准。
校准完整轮均1Worker、0恢复，96次定义样本含首次/重复；完整引用/重命名分别缺口、1次显式取消分开统计。
candidate4校准覆盖44目标/41源码文件；定义p50/p95/max为213.5/1485.6/1701.4ms，1份详情128.9ms。
Program调用48进/48返、checker48/48、同步439/439；这些计数不是48次全项目冷编译。
对照定义p50/p95/max为170.8/1454.1/1701.9ms，新版184.5/1534.8/1688.2ms；
详情只有1份有效语义样本，对照121.7、新版127.4ms，不能据此证明30K队列尾延迟改善。
Worker heap采样峰值对照1360.6、新版2157.8MiB；原先另一轮相同旧版也出现2202MiB。
GC时点和目标增长未对齐，不能仅凭峰值差异认定泄漏；分别保留自然GC/idle趋势，不用RSS不降判断无法回收。

所有逐操作文件/符号/位置/输入版本/前置状态/时间在各tag的`requests.ndjson`、`actions.ndjson`和压缩`wire.ndjson.gz`；
`result.json`、`resources.ndjson`、`worker-metrics.ndjson`、`progress-observation.ndjson`、`gc-1.ndjson`、`logs/server.log`保留。
Node PID RSS只计一次，已含Worker线程；native PID单列，tree是RSS求和而非PSS。Worker heap为isolate-local，不能再加一次RSS。

## 完整检查及耐久收据

完整fast第一轮sandbox采样spawnEPERM后中断；第二轮中间候选发现target消费者缺口后中断，均exit143，不计PASS。
第三轮`check-fast-candidate3-final.log`发现3项root-dirty回归后中断，不能算通过：显式已知目录事件过度清理无关闭包。
candidate4保留范围外**原始**证明及有效消费者，范围内已有alias/closure匹配负责退休，解析值仍清理、Program epoch仍推进。
未知或unprovable仍全域重建，不用重新盖戳保留旧答案。原断言不变；`m001-scoped-proof-green.log`52/52。
新增2项未通知跨域manifest变更对照先作表征，再保持GREEN，262 entries、unit110。
candidate4完整跑完：2069 tests、2063 pass、6 fail、0skip/cancel/todo，3015.316s，exit1。
六项新鲜度/旧item消费合同失败的实际响应是新结果，未据此断言旧URI损坏；`candidate4-issued-inputs-red.log`独立复现。
candidate5为整个命令保留未知重载事实（membership及多次prepare都不能抹去），不变输入当前请求仍-32803，后继显式请求可恢复。
新增服务端补全namespace来源与父端root/config收据；父端预计算详情也须Worker小请求准入，同调度/恢复约束，不传大载荷。
`completion-namespace-origin-red.log`保留旧item被附新域详情的反例，`candidate5-artifact-lifetime-regressions.log`39/40保留漏查父端缓存入口；
补齐后`candidate5-cached-authority-public.log`6/6、最终`candidate5-final-related-regressions.log`54/54，
包含原6项、两种namespace旧item、真实5000-export预计算编辑、取消和调度；scope嵌套/并发/异常释放与400KB载荷另有单位RED→GREEN。
原6项错误合同、原3项缓存保留断言不修改；新M001用例明确等待基线诊断，再断言拒绝/同会话重试恢复，修正之前未约束背景状态的假设。
中间候选改为candidate5后重新完整检查；前文candidate3/4校准仅保留对照价值。
candidate5完整2075 tests中2074 pass/1 fail，0skip/cancel/todo，3012.048s；不是完整通过。
唯一canonical owner变更是已有新输入，candidate6复用原分类正确清算旧owner，不放宽路径判断。
`candidate6-owner-and-namespace-controls.log`75/75、`candidate6-unchanged-input-controls.log`9/9通过，原断言均不改。
最终`check-fast-candidate6-final.log`完整退出0：2075 tests / 2075 pass / 0 fail、cancelled、skipped、todo，3317590.785ms。
同一产物运行`pnpm test:e2e:real-sdk`退出1：SDK功能11/11通过；附带Settings rename、incoming calls两个驻留控制各180000ms超时取消，13项中11pass/2cancelled。
不是该测试层全量通过，未授权跳过，原始`real-sdk-candidate6.log`保留；不会修改其超时或断言。
`candidate6-check-receipts.json`区分检查命令/退出码和实际范围。

正式耐久前真实30K短复现`soak-harness/move-candidate6-original-scenario`34.438s完成：
移动/恢复/实际删除历史目录通过，恢复后三次精确跳转193.855/58.103/47.261ms；关闭重开1097.716ms。
同字节新版本、无关文件和配置往返之后也均精确返回，1Worker、无恢复/错误/保护停测。
Node/native/tree采样峰值863.1/3319.0/4174.5MiB；仍是短复现，不替代7200s。
455冷目录3秒门槛继续按此前用户授权跳过，未宣称该门槛通过。
未改Rust产品代码；构建仍执行仓库既定release步骤。

耐久须使用`soak`，不得使用排除M001的`continuation`；固定seed817954798、7200s从mixed开始、并发上限4。
包含原文件移动/恢复删目录、编辑撤销、关闭重开、未打开依赖/barrel、配置、监听突发、前后台和补全详情。
正式长测前收紧驱动：删除历史探测目录必须实际成功并写`external-probe-directory-delete`事件，不能吞rmdir失败。
`probe-delete-oracle-red.log`及`harness-qualification-contracts-green.log`保留；没有新增目录watch通知改变原失败条件，
产品768项输入及冻结产物不变。先前校准没有运行fileMove，主会话按新驱动哈希独立追踪。
正常用户与故障注入分开；不主动重启LSP，所有自动换代计数；提前保护停测记FAIL，不当完成。
上述为首次长测前的约束；candidate6后来实际提前失败，详见下文。candidate10的独立7200s尚待最终检查后执行。

复现命令（工作目录仓库根，先运行完整检查，不使用用户真实项目写入）：

```sh
pnpm check:fast
SOAK_NODE_GUARD_MIB=2048 SOAK_IGNORE_NODE_RSS_GUARD=1 node .bench/30k-three-fixes-20261027/soak-harness/run-candidate11.mjs calibration NEW_CALIBRATION_TAG
SOAK_NODE_GUARD_MIB=2048 SOAK_IGNORE_NODE_RSS_GUARD=1 node .bench/30k-three-fixes-20261027/soak-harness/run-candidate11.mjs soak NEW_2H_TAG
node .bench/30k-three-fixes-20261027/soak-harness/summarize.mjs RUN_DIRECTORY
```

tag目录必须不存在；项目安全边界/预先指纹由harness保留。测试全程不安装扩展、不关闭用户Zed。
未覆盖：真实UI权限、Windows本轮、30K全范围引用/重命名完整性、原始OOM自然长序列、所有请求500ms。
缓存性能OP-04及无关原生内存优化继续暂缓。

## 最终候选长测进行记录

2026-10-27T16:11:01Z启动`soak-harness/functional-2h-candidate6-node-waived`（Mac已10月28日），固定种子817954798、模式soak、预算7200s。
从mixed开始单独计时；原M001动作6完成，随后动作212因M004失败，未主动重启；该运行保持FAIL。
运行前`candidate6-pre-soak-integrity.json`确认774源码/测试输入、87冻结产物、当前dist和native均零差异；原项目/隔离副本30287文件各零差异。
`sdk-before-candidate6.json`记录44894份SDK文件指纹，供结束后核验。两小时运行与前述短复现、校准、完整检查时间严格分开。

### 最终候选6第一轮耐久失败（不计7200s完成）

`functional-2h-candidate6-node-waived`第212动作/公开请求1027在2026-10-27T16:35:57.618Z返回-32803。
目标`common/src/main/ets/default/model/browser/album/AlbumDataImpl.ts`，genAlbumsInfo，零基71:13，版本16；66.282ms。
前一动作211输入/撤销后保存另一文件`AlbumSetPageActionBar.ets`，随后打开该目标即失败；具体拒绝来源尚待诊断，不凭相同错误码推断同根因。
从mixed开始1484.441s（包括封存清理前采样窗口），总1502.941s；212动作/1027请求，1Worker、0恢复，manualRestarts0，未触发资源保护/实际OOM。
Node/native/tree采样峰值1479.9/4459.6/5110.4MiB，不能把内存未触线当功能通过。完整incident/wire/overlays/touched-files/progress保留，正常耐久结果FAIL。
最小化运行使用独立记录的`candidate6-diagnostic`（仅日志插桩，执行哈希不同），不得混入普通计时样本或覆盖冻结candidate6。

### M004直接根因与最小公开回归

独立插桩`diagnostic-candidate6-212-prefix`同样在动作212/请求1027失败（46.726ms；与普通66.282ms分开），
`proof-diagnostic.ndjson`给出Thread1的`assertCurrentQueryInputs→assertCurrentInputs→define`；编译器定义调用之前拒绝。
过期的是前一文件`AlbumSetPageActionBar.ets`，保留5060字节的旧磁盘load fact，保存后实际5091字节；不是查询目标文件损坏。
源码曾经作为compiler fallback磁盘输入读取，后来成为当前overlay。partial membership没有走完整catalog的source-read更新，
保存overlay时有效语义字节已在内存，事件不推动语义内容版本，因此该Program消费者仍带保存前磁盘证明。
随后查询其他文件也扫描它，正确拒绝旧证明，但源码authority切换的生命周期未结清。
此前两个简单保存控制都未让LS先获得该份fallback证明，所以通过不能反证这个条件。

`resolution-namespace-lifecycle.test.mjs`新增import-type回归：物理夹具有Main、Target及未引用Unopened三个源码，目标依赖为Main→Target，实际Program清单未测。
complete对照通过；加20001个无关源码使真实catalog partial后，
在保存后的第一个请求稳定-32803；未保存编辑已精确返回移动后的声明行号。
`promoted-lazy-source-save-current-range-red.log`保存1pass/1fail，修复后同断言2/2通过见`...-green.log`。
不是按文件规模修改阈值：20000上限、SDK/超时/内存策略均不变。

candidate7在LS安装当前overlay快照后，仅对该源文件先前确实存在的positive source fact执行一次实际bounded stable磁盘读，
确认词法及物理root内、排除SDK词法/物理域，并沿用原before/after及失败读证明；不是缓存命中盖戳或删除身份检查。
该磁盘读只结清旧source proof，不用其字节替换用户overlay；SDK/config/负向目录事实继续原校验。
完整catalog的既有token-read提取为同一source-witness模块，行为不变。新helper37行，旧TSLS3087→3085；
不为压RSS改变任何产品内存参数。副作用是有旧fallback事实的overlay在准备时有真实有界读取；功能优先，本轮不扩大为无关缓存优化。

### 候选7边界反例与候选8

没有把保存特例当全部完成：额外公开边界诊断`candidate7-promoted-overlay-delete-probe.log`在partial nested源码
保持overlay打开但磁盘删除时仍-32803；正式complete/partial删除恢复回归保留`promoted-lazy-source-delete-candidate7-red.log`。
因此候选7完整fast由新反例主动停止（exit143；未记PASS），核验PID/启动时间和只停止自身进程的收据为
`candidate7-check-stopped-for-boundary-counterexample.json`；保留其日志及775输入/87产物身份。
候选8在source created/deleted的mutation屏障显式调用`WorkspaceResolutionInputs.changedNamespaces`，
退役词法及物理父目录的解析域，再准备输入；不能仅看package resolver是否碰巧保留过同一路径证明。
普通body/changed/save仍不调用该命名空间分支，不修改全局内存、V8、超时或文件数阈值。
DocumentStore1765行不增长、协调器57行；现有SDK语法共享和路径校验保留。

### 附带Settings性能控制的原样超时补证

`settings-rename-candidate7-diagnostic`原样重跑180s的现有L08 rename测试，外部只读封存临时日志/metrics，退出1、cancelled1。
210s诊断保护未触发，180s及550ms原门槛均未修改。该既有manifest使用非默认1024MiB及多个历史实验开关。
原生catalog1846文件在约8s完成；语义初始化69.143s后partial。随后单次implementation8545.66ms、11次rename8178.21–8437.65ms，
各RPC记录ok而非单请求静默卡死；测试整体在180s取消，不能宣称这些payload已通过末尾完整oracle检查。
原日志有level3 transient diagnostics、metrics有residentContextCount0以及反复sdk.selected；这些是实测状态，
尚未独立分解每8s的全部内部阶段，不把所有耗时推断成一项内存或初始化开销。
该检查仍不通过，未授权豁免；本轮不为它提高产品内存或测试时限，也不顺带扩展为无关内存优化。

候选8 `candidate8-source-and-namespace-regressions.log`完整79/79，0fail/skip/cancel/todo，59.339s；typecheck/build GREEN。
包含原52项DStore缓存保留、输入admission、四档source authority/save/delete、读中竞态及未通知SDK/config保护。
随后完整执行`check-fast-candidate8-final.log`，其失败见下一节；不能用候选6的2075/2075或候选7中断结果代替。

### 候选8完整失败与候选9的准确修正

`check-fast-candidate8-final.log`完整退出1：2081 tests / 2070 pass / 11 fail / 0cancel/skip/todo，3212.922s。
独立原用例`candidate8-sdk-and-deletion-full-regression-red.log`重现全部11项，未修改原断言。
3项SDK用例不是已证的SDK重复读取：私有counter以全bundle的`const content = ...`字符串找Host读点，
新增project source helper恰好也有该字符串，导致注入在Worker模块启动时抛`one actual host fallback source read required`，
尚未执行SDK用例。`candidate8-sdk-fixture-startup-cause.json`记录实际Worker错误/栈，不能把它当真实SDK构建异常。
候选9将注入定位收敛到实际`compilerScriptSnapshot`函数，保留唯一读点、96声明、0重复文本读和两轮身份核验的原断言。
另外8项删除用例已经返回正确空定义，但源码namespace先移除了旧context，掩盖原本必须记录的content-revision-change。
候选9先使用现有连续delta/owner/reset判定，再以resolution-generation-change作为兜底，仍在元数据变更且租约未结清时拒绝；
不是补发假的evict日志，也没有放宽原重建原因断言。TypeEngine498行，保持500以内。
`candidate9-sdk-and-deletion-full-regression-green.log`原11项全部通过；SDK96项源文件编辑后0次文本重读、每项2次独立身份核验。
新候选必须再次完整检查及独立7200s；此前所有失败/中断保留。

`candidate9-related-and-full-regression-controls.log`完整128/128通过，0fail/cancel/skip/todo，146.534s；
覆盖namespace/save/delete、读证据、overlay/disk、首编辑准入、补全消费、跨root文件集合、解析域生命周期、
文件事件、语义context、取消终态交付及前后台公平性。候选9完整检查以`check-fast-candidate9-final.log`单独记录。

### 候选9首次/重建后查询的测试前置条件修正

候选9全量在`creating a previously absent package owner`发现原断言失败；独立原样串行可重现，
`candidate9-absent-owner-repeat-2.log`保存原断言，`absent-owner-diagnostic`只读封存原进程日志。
两份引用结果均与新进程的完整oracle一致：19:06:36.843Z旧context1退役，36.866Z创建context2，
37.018Z新Program完成完整引用，37.046Z第二次查询命中新context2。
没有证明旧输入被复用，失败是“后续任何命中都不允许”的测试阶段混淆；不能通过禁用合法缓存使测试变绿。

候选10为false/true两种includeDeclaration分别用独立warm会话，先收齐实际打开文档的基线诊断，
然后无通知创建manifest并只查询第一次；原no-resident-hit和fresh完整结果相等断言保持不变。
新增单查询数量断言防止驱动暗中执行第二次已恢复查询，未加sleep、改产品或修改阈值。
`absent-owner-first-query-qualification-red.log`在原helper实际2/期望1，支持限定查询后GREEN。
`candidate10-reference-coverage-regressions.log`完整24/24、0fail/cancel/skip/todo，103.970s，
包括原retarget、正负配置证明、共享SDK及原两次热复用的正对照。
候选9检查仅在已核对的自身9个进程上SIGTERM，exit143、无残留；未执行尾部不算已通过，
收据`candidate9-check-stopped-for-cold-query-qualification.json`。候选10必须完整重跑，不能追认候选9绿色。

### 候选10最终完整检查

`pnpm check:fast`完整退出0，2081 tests / 2081 pass / 0fail/cancelled/skipped/todo，3132348.135ms。
原始`check-fast-candidate10-final.log`和`candidate10-fast-final-receipt.json`保留；
检查结束775输入/87冻结产物均零差异，当前dist server/Worker与冻结候选一致。
这是当前候选的完整结果，不复用候选6的通过或候选9的局部结果；真实SDK层及7200s另行记录。

最终真实SDK层`real-sdk-candidate10.log`完整退出1：13tests/11pass/0fail/2cancelled/0skip/todo，438.435s。
11项真实API24功能通过，两个既有Settings rename/incoming calls性能控制各在原180000ms取消。
该层不是完整绿色；其历史1GiB及其他开关、550ms和180s门槛不变，未授权跳过。
原样诊断及归因限制见前文Settings证据，不为使这两项变绿扩大无关内存优化。
`candidate10-real-sdk-receipt.json`记录准确范围及775输入/87产物仍零差异；455冷目录门槛未执行，按此前用户授权跳过，不记PASS。
`candidate10-project-sdk-preflight.json`核对原/隔离项目各30287文件（13900ETS/16100TS）及SDK44894文件均无字节差异。

### 候选10正式耐久：原动作212通过，后续动作255失败

`functional-2h-candidate10-node-waived`采用同30K副本、seed817954798、默认产品配置，只有驱动Node RSS2048豁免。
校准另轮95.639s、50动作/107请求、1Worker/0恢复，Node/native/tree1880.8/3607.0/5462.4MiB。
校准关闭前索引仍报告99%且无end，不把它宣称为完整进度收尾通过；正式长测中索引在20:23:33.825Z确实ready（30000/30000）。

原M004动作211的输入事件除时间戳/原文外一致（含文本SHA），随后同目标AlbumDataImpl.ts、版本16、
inputRevision2309的genAlbumsInfo定义由66.282ms的-32803变为67.448ms精确通过；请求号1027→1026。
`candidate10-original212-control.json`保留对照；未假称两个会话的全部内部缓存/墙钟状态完全相同。

随后[SOAK-30K-M005](../plans/2026-10-11-query-performance-follow-up-plan.md#soak-30k-m005)在动作255出现：
已打开的ScreenManager.ts临时overlay优先于外部磁盘文本，第一次定义成功；恢复磁盘、撤销overlay并didClose后，
PickerUIExtensionAbility__copy_003.ets版本183、零基53:20、getInstance的请求1236在954.725ms返回-32803。
父准入到send1.290ms，Worker接收到dispatch0.085ms；其余区间不能未经测量直接归因编译。
mixed1477.767s含事故封存采样、总1494.869s，255动作/1236请求，1Worker/0恢复，保护未触发、无OOM。
Node/native/tree1865.4/4728.1/5686.6MiB，清理无restore/close错误。正式7200s结果保持FAIL。
证据为该tag的`anomalies/A001`、逐操作/wire/完整服务日志及`candidate10-endurance-failure-triage.json`。

简单complete/partial关闭控制均GREEN；额外显式resident0/1四格仍GREEN，不能据-32803猜为同一source fact。
原`createReadinessFixture`默认含历史residentFastPath0，故新增1控制保证真正覆盖产品默认；未修改公共fixture全局默认。
正在独立只读日志产物`candidate10-diagnostic`复跑至动作255，身份`candidate10-proof-diagnostic-identity.json`；
它不是普通计时、不是7200s验收，不改任何阈值或输入校验。产品修复必须以实际根因和公开RED为依据。

另补事后审计`B/audit-transcript.mjs`，独立检查双向ID/单终态、晚到取消、进度结束、清理及mixed单调时钟≥7200s。
`audit-transcript-red.log`→`...-green.log`4/4，原候选6失败的CLI负对照确实退出1；不替代语义payload oracle。

### M005独立复现、最小RED与候选11

`diagnostic-candidate10-255-prefix`同动作255/请求1236、同文档版本183/inputRevision2885失败942.734ms，
与普通954.725ms分开。mixed1492.411s含封存采样、elapsedSeconds1509.013s，1Worker/0恢复；诊断不是耐久通过。
`candidate10-m005-proof-root-cause.json`证明ScreenManager.ts原事实17243字节，恢复后17200字节，
`TypeScriptLanguageServiceEngine.define:719`→`assertCurrentInputs:280`→`assertCurrentQueryInputs`→compiler witness scan拒绝，尚未进入定义compiler调用。
不把942ms全部算给一次scan；其中准备/读取等尚未独立分解。未触及witness容量上限。

简单关闭控制以及直接ordinary-import的四格均GREEN；缺失前置事实是先前compiler fallback的旧磁盘证明。
最终最小例先import-type强制fallback，再切普通import纳入显式文档；外部改磁盘而overlay权威、恢复、关闭。
`closed-fallback-admission-resident-matrix-candidate10-red.log`完整/partial×resident0/1中3GREEN，仅partial/default resident1 RED。
关闭后partial跳过`observeAdmittedSourceRead`的完整catalog-token分支，原`observeOverlaySourceRead`又跳过非overlay；
新raw snapshot已安装到Host，旧load fact却没有同步，保留健康context时才暴露。冷重建对照故而掩盖缺陷。

候选11用`observePreparedSourceRead`（helper:19、LS.prepare:304）统一安装脚本时的source authority交接。
非overlay实际稳定读必须等于当前已准入的document.content，overlay仍按原真实读协调；
词法/物理工作区、SDK双域排除、4MiB上限、before/after及最终独立snapshot/联合校验全部保留。
只更新同文件原有source fact，不清全witness、不重建健康Program；SDK/config/负目录证明不取得新发布资格。
`closed-fallback-admission-resident-matrix-candidate11-green.log`4/4含context数不增长与未知SDK变化仍-32803的负对照。
`candidate11-source-authority-regressions.log`82/82、0fail/cancel/skip/todo，83.009s；build/typecheck及diff检查通过。
helper38行、原LS3085行不增长。相关[ADR0025](../adr/0025-namespace-proof-domain-recovery.md#m005overlay返回已准入磁盘快照)已补契约，仍Proposed。
最终完整fast和独立7200s正在重验，不借用候选10的2081/2081或原动作212绿色。

候选11最终完整`pnpm check:fast`退出0：2085 tests/2085 pass/0fail/cancelled/skipped/todo，3122831.819ms。
`candidate11-fast-final-receipt.json`核对775输入/87冻结产物无差异，dist与冻结server/Worker一致。
本次包含新增partial/default-resident关闭交接回归，以及原SDK/未知变化、取消、恢复、调度全量；真实SDK层独立重跑中。

### 候选11最终SDK、校准及真实30K快速对照

`real-sdk-candidate11.log`完整退出1：13tests/11pass/0fail/2cancelled/0skip/todo，440.546s。
11项实际API24功能通过，既有1GiB Settings rename/incoming controls仍各180000ms取消，未豁免或改参数。
`candidate11-real-sdk-receipt.json`保存范围；不宣称整个SDK层通过，不从超时取消推断全部payload正确。
`candidate11-pre-soak-integrity.json`逐文件核对775输入、87产物、原/隔离项目各30287文件及SDK44894文件零差异。
无继承的memory/benchmark/resident/session/recycle/NODE_OPTIONS覆盖，产品4096MiB、V8和全部超时不变。

`calibration-candidate11-node-waived`94.559s，50动作/107请求，1Worker/0恢复、exit0、无finding/restore/close错误。
Node/native/tree峰值2312.2/3604.4/5781.1MiB；**实际超过原2048但没有因Node项停测**。
索引99%未end时主动关闭的短校准不算完整索引收尾或耐久通过；新长会话独立验证。

真实30K最小化`repro-closed-authority.mjs`先在另一个现有文件的临时overlay使用合法
`typeof import(...).ScreenManager`建立fallback事实，恢复该overlay，再做原Picker/ScreenManager的overlay→disk交接。
保持30000文件、真实SDK/拓扑及默认配置，旧candidate10在13.355s流程的关闭后请求4返回-32803（952.456ms）；
同条件candidate11 13.236s流程精确返回，均是冷owner短对照，不替代原254动作的前史或7200s。
证据`closed-authority-candidate{10,11}-named-export`的result/wire/actions/完整日志。

此前该辅助脚本误把具名导出写成.default，旧/新/诊断三次均在primer首次查询无定义后进入完整membership回退，
被20K现有限制拒绝，尚未执行关闭操作。`closed-authority-invalid-primer-attempts.json`保留驱动错误与栈；
这三次不算产品回归、M005复现或修复通过。纠正后脚本显式核对源码实际具名导出。

全新`functional-2h-candidate11-node-waived`已于22:30Z附近启动；模式soak、seed817954798、从mixed开始7200s，
原所有场景保留、并发4、不主动重启。实时`soak-harness/.../progress.json`每10s更新，结束后独立审计才能计通过。

## 2026-10-28最终收据（前文为未改写的过程记录）

最终同一会话mixed单调时钟7204.609272s，UTC22:30:26.612→00:30:31.212；1197动作全部完成，
5681操作RPC=5394成功/170取消/80输入更新/37完整范围不可用，另initialize及shutdown各1。
1Worker、0恢复/运行期退役；37次实际移动恢复删目录，原M004动作212及M005动作255均精确返回当前位置。
304份详情全部enriched，57份最新版本诊断加入/清除通过，进度全部end，协议没有重复/缺失/孤儿终态。
`candidate11-endurance-audit.json`passed；审计工具另有6/6及已知失败负对照，不仅依靠driver completed。
原自然M002窗口未证明，37份完整范围失败不计成功；1981份成功操作超过500ms是体验统计，非1981次功能失败。
偶发越目标不阻塞交付，反复秒级尾延迟仍按分布与持续影响跟踪，不据此宣称所有性能问题消失。

Node/native/tree RSS峰1877.195/4806.793/5623.672MiB；Node PID含Worker，heap单列，不叠加。
临时2048MiB驱动豁免只用于测试，校准实测2312.180MiB仍继续；产品/V8/超时/其他保护不变。
关闭exit0，Worker code1发生在正常shutdown的terminate；精确进程身份复核无本轮活进程/zombie残留。
`candidate11-post-soak-integrity.json`：775输入/87产物、原与隔离各30287文件、SDK44894文件零差异。
源码/运行产物自完整2085检查后未改；真实SDK层依旧11pass/2原180s控制取消，未标整个层GREEN。
最终汇总、失败分类、实际排队证据、复现命令及未测项目以上述最终报告为准；不安装、不合并、不发布。
