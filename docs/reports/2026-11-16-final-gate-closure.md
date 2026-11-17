# 30K初始化与最终检查失败续修（2026-11-16）

当前目标仍在实施，未合并、发布、部署。实现位于隔离工作树
`.bench/worktrees/index-versioned-maintenance-20261104`，父提交
`298d65f5d7f796c347fe8be5c739e428066489d8`；根目录其他修改保留。

## 最终续修结论（本轮切片已验证，总目标仍OPEN）

本轮从冻结769的7FAIL继续，最终adad28ac完整`pnpm check:fast` **2550/2550PASS，
0FAIL/skip/cancel/todo**，2525输入及产物前后未变。对比只改动6个输入：
prepare-context-entry、type-engine、typescript-language-service、typescript-semantic-readiness、
configuration-source-identity及真实摘要故障注入fixture；`readiness-refresh-final-delta.json`
保留逐文件前后SHA。没有提交、合并、部署、重启日常进程或删除真实缓存。

本轮核心缺陷：同Host代次的Program观察已失效却不刷新；Native源码范围协调推进resetEpoch
和resolver代次后，同项目Root替换丢失刷新意图，后续一直unprepared、答案从未入缓存。
修复只保留同owner的刷新意图，绝不继承旧Program/READY；新实例仍须实际准备和完整校验。
原23项与扩大68项零跳过通过，最终全量也通过。取消/物理路径/字节证明断言均未放宽。

同冻结候选实际30K、同SDK、串行协议观测（不是多轮中位数）：

| 条件 | 语义准备 | 首次定义 | 重复定义 | Native与收尾 |
| --- | ---: | ---: | ---: | --- |
| 55，复用已关闭43缓存 | 85693ms | 12669.935ms | 8831.317ms | 30000ready；原SQLite60s检查超时，整轮FAIL |
| 56，全新空缓存 | 95582ms | 12044.145ms | 8461.163ms | 30000/30000ready、0skip；全部DB完整性/外键PASS |

56单会话14:30:46.028Z–14:37:27.605Z，401.577秒；4个公开请求：initialize、
两次definition、shutdown。精确命中ScreenManager81:9–20。两次查询均在Native发布前返回，
未把局部查询绑到全库索引完成。只有一个Worker；最后由正常shutdown主动terminate，
不是运行中崩溃/换代；server exit0、全部已观察自有PID关闭。Node峰2086.67MiB
（Worker线程共享进程RSS只计一次）、Native78.04MiB、同时进程树2152.76MiB；
不是PSS，Worker heap峰未单独测量。该6分42秒协议短测不算真实UI或两小时耐久。
`readiness-refresh-56-summary.json`及`photos-readiness-refresh-cold-56/`保留原始证据。

55原60s失败、独立同限制再次失败均保留。相同只读SQL分阶段诊断26.585s、
Python argv形式26.391s、最小Node20 spawnSync26.526s均返回ok，输入元数据不变；
56自己的原60s收尾也全部通过（大库37.644s）。因此有结构/外键检查成功证据，
不能称索引损坏；也尚不能归因于Node版本、SQL参数形式或并发。原超时波动根因仍未证实。
分阶段stdout为接收时间，可能受用户态缓冲影响，不将marker差值当严格独占阶段耗时。
独立180s上限只用于一次诊断且实际26.6s完成，未改产品或原60s验收上限。

最后只读核验：原项目/隔离副本各30000份源码、19776个不同内容SHA；与原前置清单及
相互比较均零增删改，冻结2525输入仍零变化；见`readiness-refresh-final-input-postflight.json`。

**用户已明确Mac没有API20SDK。** 当前项目要求20、实际选择24，诚实SDKpartial不变；
不能修改项目目标、打桩或伪造READY来通过。匹配SDK缺失限制真实完整资格验证，
不等于已经证明它是所有引用/重命名失败的唯一原因；其功能缺口保留OPEN。
30K初始化95s、查询8–13s仍严重慢；初始化最早请求47的45s外部失败仍未闭环，
不能由56（准备后查询）替代。真实UI、Windows及新正式两小时均未执行。
455冷目录3秒门槛继续沿此前授权，不对它宣称通过。

## 当前完整门禁结果（2026-11-16，优先于下方运行中记录）

当前adad28ac候选完整`pnpm check:fast`：**2550/2550PASS，0FAIL/skip/cancel/todo**，
12:47:59.141Z–13:55:36.117Z，约67.6分钟；2525输入哈希前后一致，Worker/Native也一致。
原始`readiness-refresh-final-checkfast/{summary,execution,inputs-before,inputs-after}.json`
及stdout全部保留。上轮769的7条失败均在本轮完整执行通过，没有删除/跳过原断言。
原20K引用5s用例也通过，阶段日志约4248.05ms；这是单轮，非新增多轮统计。
455冷目录3s门槛仍按此前授权不作验收结论；没有宣称它通过，也未启动该项额外优化。

此门禁不消除55的SQLite60s超时记录，也不证明真实UI、正式耐久、API20完整SDK或
30K早期请求47已通过。独立原60s完整性复核与当前候选冷Native复测继续，源码不再修改。

## 本轮修改边界与源码位置

- `src/core/types/typescript-semantic-readiness.ts:71`：刷新信号包含已退役Program观察，
  Host generation相同不再误代表证明仍有效。
- `src/core/types/type-engine.ts:450`：已获准的Root查询刷新检测reset epoch、
  resolver代次及观察失效；不是每个查询无条件完整准备。
- `src/core/types/prepare-context-entry.ts:42`：同canonical owner成功替换保留刷新意图；
  canonical owner改变不转移，旧Program/READY不转移，source-reset admission仍约束加载。
- `src/project/configuration-source-identity.ts`：无Native目录权威时立即原raw fallback，
  保留原取消同步边界，没有增加检查点改变真实取消契约。
- `tests/fixtures/reference-digest-final-mutation.cjs`：修复不再匹配实际实现的旧探针，
  在真实摘要返回后变更磁盘内容，原最终拒绝与恢复断言保持。

所有实际产品修改在隔离工作树，规范报告/ADR在仓库根。没有提交、合并、部署或重启Zed。
此次type-engine维持500行；既有typescript-language-service2974行、DocumentStore1524行
仍属迁移债，前者将刷新判断移入327行的readiness状态模块且原文件未增长。
Native270项Rust/Cargo输入与此前完整候选一致，不伪称本轮新运行了cargo测试。
当前运行完整检查期间不再编辑其冻结源码/测试输入。

## 当前候选与30K55（补充，完整门禁运行中）

当前冻结Worker `adad28acca9e8a261ddde61791369d37c17aebf3c372e9c418be07cd3fd44948`，
Server `8170b0e372c5bb5e9a18a13891353f38c65ed922098120e83ff7e53a787b8141`；
305源文件哈希归档，Native800e6628未变。原四文件23/23与扩大八文件68/68PASS、
均零跳过；扩大包括原20K5s、配置/路径拒绝、生命周期及取消恢复。
`readiness-refresh-final-checkfast/`自12:47:59Z运行完整检查，尚不能称全量通过。

55复用确切已关闭Native43索引，30000/30000ready，Node语义29995源。
初始化85693ms、首次精确ScreenManager跳转12669.935ms、重复8831.317ms；
SDK仍API20/24partial。Node峰2090.54MiB（含Worker线程只计一次），
Native143.47MiB，同步进程树峰2233.98MiB，非PSS。
本轮未单独采样Worker heap峰值；request.completed的heapUsed只属于主isolate，
不能用它代表整个Worker堆。
仅一个Worker，最后terminate由shutdownSemanticWorker正常dispose发起；
其exit1不能称崩溃，Server退出0且两个自有PID都关闭。

**55整轮FAIL**：收尾原60s SQLite integrity检查数据库超时，被驱动SIGTERM；
controlDB通过。相同数据DB在51/53约26.51/26.69s通过，当前只能确认检查超时，
不能推断损坏；原超时完整保留，待独立复核。功能响应正确不能抹去收尾失败。
`readiness-refresh-55-summary.json`关联原始资源、请求、退出与完整性证据。
前一54轮因sandbox禁止ps导致保护不可用而停止，只终止已核对身份的自有服务和sidecar；
另误选新的冷缓存路径，故标为环境未完成/冷Native条件，不能混入暖55比较。
这是协议短测，不是UI、冷Native完整验收或新两小时耐久。

## 当前续修状态（2026-11-16，优先于下方历史快照）

冻结769b3c2f的最新完整check:fast实际为2550项：2543PASS、7FAIL、0skip/cancel，
2525输入前后未变，08:12:59Z至09:20:20Z。原始summary及stdout在
`initial-scope-final-checkfast-sampling/`；此前受限进程采样的中断轮次是环境未完成，
不能把其部分失败统计当产品缺陷，也不能称全量通过。

七项按原因分为五个缓存回归、一个已失效的摘要故障注入探针、一个无Native证明时新增的
取消检查点。修复探针以实际diskSourceDigest返回边界注入，保留原磁盘变更/最终拒绝断言；
无Native目录权威时直接走原raw fallback，取消检查点原6次断言不变。
同Host代次不等于已观察Program仍有效，刷新判断补充已退役观察。
最后两条缓存回归的实测因果链：Native协调源码范围后resetEpoch0→1、resolver1→2；
同项目Root替换时previousIntent=true→nextIntent=false，新实例永久unprepared，
答案从未入缓存，并非watch清掉已存在的答案。保留同一canonical owner的查询刷新意图，
但不移交Program/READY/旧证明，新实例仍需正常准备与完整新鲜度校验。
原四个文件23/23PASS、0skip，日志`readiness-refresh-reset-public-regression.log`；
扩大回归及新候选完整检查尚在推进，不能拿局部绿色替代最终门禁。

769候选原20K、原5s整文件三轮9/9PASS，引用中位4760.94ms、最大4827.32ms，
该完整门禁中也通过；此结果不表示30K已全部解决。受控真实30K依赖准备中取消对照：
52旧版重扫到55000次角色后45s外部保护中断；53新候选保留29995份已做事实，
首次精确跳转30043.129ms成功，随后24904.369ms（其中15889.177ms在父线程等待
已开始的诊断），热查询9340.096ms。单Worker、正常关闭与SQLite完整性通过。
原始`late-initialization-cancellation-comparison.json`；这是协议受控时序、暖Native，
不是UI或冷Native/两小时验收。最早初始化请求47的45s外部停测仍未闭环。
SDK仍实际API24/项目API20，诚实partial；没有伪造完整READY。

## 最新修复：解析元数据身份复用与初始化取消后的草稿恢复

CPU50及原始cpuprofile确认依赖构建内realpath占22.76s采样self时间，
绑定调用151000次对应58662个保留绑定、164个SDK绑定、19811个来源边界，
不能混称151000次不同依赖。调用栈分类见initialization-cpu50-realpath-callers.json。
针对元数据观察引入专用observeResolutionPath；实际源码字节读取仍raw。
installedSourcePath消费已确认Native物理目录和新鲜强叶结果，保留原边界、overlay、
包路径及raw fallback。公开RED两步各800次realpath，修复后各0；68/68定向PASS。
窗口内同大小/恢复mtime编辑仍被拒绝，路径链接/新鲜度/包重定向回归未放宽。

冻结129bdb5e候选51：准备85421ms、依赖图32843.66ms，49同阶段为113355/48389.14ms。
这是同缓存/原30K/原SDK的单对插桩观测，不作多轮统计，角色代码未变的时间波动未归因。
51首次/热跳转12937.32/8952.36ms仍严重慢；SDKpartial保持，完整Native/SQLite integrity、
shutdown/exit0和拥有进程关闭均通过。此轮不含初始化期间查询，不替代47失败。

进一步公开复现实际didOpen取消：初始语法事实只在局部变量、成功后才发布，
失败会丢掉已做工作；400源码扫描到第50个时取消，旧450次/首文件两次。
修复保留独立未发布草稿，并以原配置/SDK胶囊+profile和每文件当前输入决定能否恢复；
半构建依赖图有dirty屏障，不能伪造READY或沿用部分effects。配置/dispose会清除草稿。
语法阶段取消及依赖图阶段取消均400次，换SDK450次（明确丢弃旧域）；
改单个已解析文件401次，其他未改事实保留，新增global类型跳转精确。
initial-scope-resume-final-boundaries.log8/8PASS零跳过。

最新冻结Worker769b3c2f，305源哈希。扩大91项90PASS/1FAIL仅新增测试条目导致严格manifest
bundle数量180→181未同步；随后同步348条目/181bundle并专门验证，未跳过用例。
当前组合仍未完整check:fast通过；原20K5s引用仍OPEN，相关原始失败均保留。
受控30K依赖中途取消的旧/新候选串行对照52/53正在推进；不能预写通过。

## 30K初始化期间查询的新复现：不能用初始化后短测替代

最新冻结`operation-reference-proof-metadata-runtime`：Worker
`71943702a1287bfd717b9a502d82d37a62aee2088d768346c62a696abcc2fc90`，
父298d65f脏候选，304源文件哈希归档；Native仍800e6628。最新组合14文件
134/134PASS、0skip、284.44s，包含目录窗口、负角色重试、包重定向、来源证明与取消。
20K原5s整文件仍2PASS/1FAIL，未改门槛；完整门禁未重新通过。

只读逐文件核验隔离输入与用户原项目30000份源码完全一致，19776个不同内容SHA；
并非30000份同一内容。SDK仍项目API20/实际API24。
`post-gate-30k-source-preflight.json`保留全部源码哈希。

47（05:04:04.073Z开始）：观察真实Worker readiness dispatch后，打开原picker copy003，
在53:20查询getInstance；05:04:04.571Z发送公开definition id2。
打开mutation使初始化内部id1在05:04:04.574Z返回content-modified；同一Worker接收mutation，
内部readiness id2在04.582Z开始重试。没有Worker换代。Program/checker于约17.74Z返回，
之后仍做角色/依赖准备，公开definition尚未实际派发。Native约10.27Z已30000/30000 ready。
05:04:49.572Z，**诊断驱动原有45s响应保护**先触发，SIGTERM自己的服务，
公开请求没有LSP错误终态，transportError为external-response-timeout。
不能写成产品watchdog、OOM或Worker自行崩溃。Node峰1048.84MiB/native138.40MiB，
这些内存数字不能解释停止原因。失败原始证据`photos-post-gate-initialization-early-query-47/`保留。

48同窗口阶段采样再现保护停测：至约第45s角色仅推进到21000次，
尚未进入依赖图。首次探针前置校验抓出不存在的node方法，未启动该无效探针，
标记INVALID_PROBE_NOT_EXECUTED；修为实际external方法后再运行。

49独立补测完整阶段，05:20:18.421Z–05:23:32.505Z，**未在初始化中发送查询**，
不能算47通过。语义准备113355ms、29995源、诚实SDKpartial。
ProjectOperationScopes.ensure 97627.22ms包含ScopeDependencyGraph.update48389.14ms，
差额49238.08ms为角色准备及其读取/检查，不把包含区间重复相加。
projectSourceRole累计约32878.76ms（采样计数30000，含进入图后的少量external），
模块绑定调用采样151000次、累计43498.48ms；不等于151000个不同依赖。
首次/热定义12992.21/8857.70ms，精确原ScreenManager81:9–20正确，
Native全量资格、DB integrity、shutdown/exit0和拥有进程关闭均通过。
CPU50用于区分绑定验证、实际解析及路径证明热点，尚不能把调用次数归因为重复I/O。
见`post-gate-initialization-stage-summary.json`及各轮requests/wire/logs/resources。
非UI、非新两小时耐久；原失败耐久和完整引用/重命名能力缺口保留。

## 本次续修：全量失败中14项已有定向绿色，20K时延仍未通过

冻结9aa的完整检查仍为2527PASS/15FAIL，不改写历史结果。之后catalog真实阶段探针修正，
原8个公开窗口场景全部PASS、0skip（`catalog-actual-stage-regression.log`，15.20s）。
原root方法会执行，但复用本请求已观测catalog，无新的root lstat；堆栈加深80仍5FAIL，
该假设已排除。新探针先校验产物支持的真实阶段，分别在已完成Native观察后/Root使用前、
未catalog枚举以及catalog最终叶校验时变更输入；保留全部原成功/拒绝断言。
因此原15条失败中的14条已有对应定向修复，不代表当前组合全量通过。

20K原5s引用仍FAIL。先把查引用中未使用的全Program状态报告改为仅当既有根会话需要刷新时执行，
同时给工作区准备保留显式的查询/最终输入union，不能将未验证metadata跨await借用。
原整文件仍2PASS/1FAIL（`reference-refresh-large-green-attempt.log`），保留失败。
独立扩展等待诊断`reference-refresh-diagnostic/`完整返回3个正确位置，5930.51ms；
前readiness1831.87、references1794.29、后readiness1778.07ms为不重叠Worker区间，
其余含父端传输/调度/候选处理，不臆测细分。引用Worker lstat120384→80048；
前后各80381，所有最终磁盘/命名空间和配置校验保留。此诊断不是原5s门禁通过。
下一切片仅复用冻结成员列表决定的URI/长度编码，真实磁盘token、内容和最终资格仍每次重验。
路径与结果缓存既有characterization12/12PASS；新切片公开回归进行中。

## 当前有效结论：目录证明、图遍历与正文编辑（续进）

此节优先于下方保留的历史运行状态。当前仍 **OPEN**，不宣称全量验收通过。

|运行/候选|语义准备ms|首次/热定义ms|证据范围|
|---|---:|---:|---|
|39 optional-receipt priority|108823|14755.67 /11209.04|插桩；热realpath211168降至59170|
|41 仅namespace source目录借用|109789|13934 /11240|无实际收益，保留失败实验|
|42 普通source-path也借用目录|105059|14798 /11580|重探针扰动；热realpath3658，不能作普通时延结论|
|43 同上，普通冷缓存并等全库|106093|12350.54 /8736.94|Native30000/30000 ready、0skip，全库integrity PASS|
|44 同上，复用43完整缓存|94712|12982.99 /9257.34|Native约4.81s ready，语义仍API20/24 mismatch partial|
|45 query内图组合复用，完整缓存|94704|12504.45 /8792.30|编辑/撤销/快速撤销/关重开/跨模块协议短测，非UI/耐久|

43全库文件1828823040bytes，Node峰值2053.85MiB、Native79.96MiB，正常退出且已采样拥有进程均关闭。
45从2026-11-15T23:32:11.964Z至23:38:03.307Z；编辑首跳13622.57ms、撤销13621.06ms，
一次重复25126.85ms，补全23956.83ms，都是尚需处理的慢响应。精确跳转、完整索引原始ScreenManager类及范围核验通过；
没有Worker重建/OOM，Node峰值2598.20MiB、Native141.20MiB、同时进程树2738.91MiB。
Worker heap不再叠加到同Node PID RSS。overlay关闭且磁盘基线保持，shutdown/exit0、两个拥有进程CLOSED，全库完整性PASS。
这不证明完整引用/重命名或语义READY，不替代失败的正式2小时耐久。

已确认三个不同层次重复工作：可选Native receipts先占满32MiB使有效配置观察无法入缓存；
普通observePath源码证明没有复用原目录；同一query重复遍历依赖图。前三项已分别有RED/GREEN和原30K计数对照，
最后图组合当前扩大回归156/156PASS、零跳过，未删除原始加载证明或最终独立磁盘核验。

新增正文编辑回归经真实子进程公开hover复现：只改局部变量类型和撤销，依赖图累计构建2→3→4，
实际number/string/number已正确，说明多建是元数据对象身份导致而非依赖变化的必要更新。
最小修复复用相同dependencies摘要及ambient/opaque/dependencyFree标志的原始角色对象，
内容key与operation revision仍推进，实际Host/编译器文档仍更新。整scope13/13PASS，累计2→2→2；
不能外推到磁盘保存（原路径mtime/ctime证明变化仍可能重建）。扩大回归157/157PASS、零跳过（179345.60ms）。
原始命令/RED/GREEN见B/body-role-reuse-{public-red,public-green,typecheck,build}.log。
新冻结Worker9aa07ec6b4068861677aaa02f8c1c68338bfcde2ec8d7180fa15edb1a315725e。

### 正文角色修复实际30K复验46及队列长尾

新候选仅`ProjectOperationScopes.ensure`产品源码变化，冻结Worker
`9aa07ec6b4068861677aaa02f8c1c68338bfcde2ec8d7180fa15edb1a315725e`；
17文件扩大157/157PASS、零跳过，179345.60ms。
原30K隔离输入、SDK和43完整缓存重放：2026-11-15T23:50:08.990Z至23:55:25.365Z，
准备96494ms，首次/热定义12466.04/8695.66ms。
编辑9485.55ms、撤销8907.18ms，快速编辑撤销8761.23/9040.67/8829.46ms；
关文档8794.67ms、重开重置version1为8823.70ms、再关闭8709.96ms。
相较45编辑13622.57/撤销13621.06ms，单次配对观察约30%/35%下降；不是多轮中位数或普遍线性结论。
依赖拓扑未变时省去重建有收益，实际编译器类型/新鲜度仍须更新。未声称磁盘保存同样优化。

重复长尾仍24189.75ms，补全23820.22ms。`body-role-repeat-tail-causality.json`记录完整请求和队列事件：
LSP id6，define trace8，epoch1；23:52:25.198入队，23:52:40.641才send，
父端等待15442.23ms；Worker收取到dispatch0.2635ms，剩余约8747.52ms。
同文档version3/input applied revision3的后台diagnose workerRequestId7已23:52:25.199派发。
这里不是无证据猜测“Worker队列慢”：主体阻塞在父端等待已经运行的诊断，非Worker收到后排队。
ADR0027明确不抢占已运行的原地编译，这一限制不能误写成新优先级排序缺陷；
诊断内部编译/IO各段还未测，须独立补证。无Worker换代/OOM。

46所有13个overlay/cross-module定义核验、补全及原始完整catalog类范围核验通过；
Node峰值2039.23MiB、Native140.61MiB、同时进程树2178.80MiB；
overlay关闭且磁盘基线保持，shutdown/exit0、两个拥有进程CLOSED，全库integrity PASS。
语义仍真实SDK-partial，不证明完整引用/重命名/READY、真实UI或正式耐久。
新的完整`pnpm check:fast`已结束：2542项，2527PASS/15FAIL/0skip/0cancel，约68.8分钟；
B/body-role-final-checkfast/summary.json记录最终顶层统计，2517输入前后哈希一致；冻结候选源码没有执行中变化。
测试自测内嵌的skip/todo样例不计入顶层结果。此候选明确未通过。

普通20K原5s引用门禁最后仍失败；独立放宽等待的诊断仅证明正确结果能在6309.28ms返回，不能作为门禁通过。
其中root readiness1759.72ms、references2302.10ms（包含验证Worker309.91ms）、afterReadiness1725.66ms，
三者不重叠合计5787ms，其余约522ms，不能再次加验证Worker时间。新候选原门禁已重验：body-role-large-completion-ordinary.log，2PASS/1FAIL/0skip，43.86s；仍是完整引用5s超时，保留失败，不归因到本轮已经修复的图角色重复构建。
完整check:fast尚无新结果，历史2480PASS/22FAIL仍有效为历史失败，不能以156或13局部绿色替代。
所有当前运行仅Mac协议；原项目与隔离副本30000源码及共享配置字节相同，仅副本多.zed/settings.json；
SDK3536文件与原基线一致。保护原始失败和未保存编辑，不合并、不部署。

### 新全量结束：2527PASS/15FAIL，不能被局部绿色覆盖

B/body-role-final-checkfast 已结束（冻结2517输入未变化），最终15条失败记录，非15个独立缺陷。
其中11条为：
完整20K引用原5s超时1；编译期间负global角色变化后旧请求正确拒绝、立即重试仍-32803为1；
catalog原始输入窗口5（4个root探针未触发、1个pre-after已catalogued返回markerEnd而非拒绝）；
包entry/安装link retarget后的完整引用拒绝4。必须核对实际阶段及原有0044配置新鲜度合同，不能先把后两组改标签为驱动问题。
原始逐条保留在B/body-role-gate-failure-triage.json和完整stdout.log；运行中不改隔离候选。
已准备只替换child server路径的诊断副本（copy-identity.json封存原始/副本hash），
将比较39/44/45/46冻结产物；尚未运行，不能宣称共同根因或任何新增修复已经验证。
当前157定向绿色和30K46正确短测均不替代本次全量失败；另外3条retained-source-evidence初始化快速Worker退出、1条scope-input-identity-retention缺探针文件；
静态核对发现旧SDK探针不识别observedSourceIdentity且必抛唯一位置错误，旧长路径探针只统计已被目录证明消除的realpath，
尚需独立复现后修正观测而保留完整功能断言。最终统计已在summary.json，不重复累计末尾失败清单。

## 全量后续修：失效成员恢复与独立输入域

完整门禁仍是冻结9aa候选2527PASS/15FAIL，不能把下面定向结果算成新全量通过。

- 三个SDK读取用例的快速退出已由Worker原始error证实：`resident-source-read-counter.cjs:86`
  不识别新observedSourceIdentity调用，模块编译主动抛`one actual before identity site required`；
  Program/checker starts均0，不是OOM。修正探针识别后原三用例3/3PASS：96SDK文件各查询/最终2次身份核验，源码和Host重复读取0。
- 负全局角色恢复：同一请求源码变化先被正确拒绝；新请求却携成员revision2进入scope，刷新后store revision3，
  导致再次-32803。`negative-role-capture.ndjson`记录实际顺序。完整成员证明失败现在单调标记invalidated，
  不再借出目录证明；下次prepare/prepareDiskSnapshot在文档事务及源码加载前刷新该缓存。旧请求仍拒绝，原证明不能重臂，
  新证明须实际扫描。公开原用例GREEN，四文件51/51 characterization PASS；提取成员缓存读取/LRU/公开投影后七文件70/70PASS零跳过。
  DocumentStore1540→1524行（仍为迁移债务），新project-membership-access.ts41行；不是清全部Program或提高预算。
- 长路径原探针只数已消除的realpath，故没有日志。新探针记录实际配置源码identity工厂，另记录任何native-realpath以拒绝额外调用。
  原8351文件/96组公开用例保持精确结果、单Worker和2次身份守卫，并新增0逐叶realpath断言，已通过。
- 包retarget：31/32/33/34冻结候选相同13场景均13PASS；35/39/46为3PASS10FAIL，收窄到34→35的11源文件变化。
  独立变体只去掉成员证明对整个package resolver epoch的依赖，保留模型对象身份、原始配置capsule、managed generation、
  容器/目录/叶身份及所有最终fence，原4个包场景4PASS。正式实现后原references-batch-search-coverage整文件26/26PASS零跳过，
  新包入口及安装link使用当前完整结果，与fresh process精确对照。成员资格应由实际输入决定，不能随不相关解析缓存epoch一同失效。
- Catalog五失败继续诊断：stack30→80的独立观测对照仍3PASS5FAIL，已排除单纯栈截断，未据此改产品或放宽原断言。
  第一版阶段探针因compiled unavailable3参数名失配无有效数据，单列INVALID_DIAGNOSTIC_PROBE；修正并预检后重跑，结论待实际数据。

证据：B/sdk-counter-current-callsite-green.log、rejected-membership-{characterization,post-extraction-regression}.log、
membership-specific-owner-package-green.log及gate-failure-runtime-comparison/。
当前还需处理catalog实际阶段、原20K引用5s失败、最新组合完整门禁和30K冷/热复验。SDK20/24 mismatch仍未解决，
已询问匹配SDK路径且不等待该信息阻塞独立修复。没有新UI/Windows/正式2小时耐久、合并或部署声明。

## 已完成测量与边界

原始证据目录 B：`.bench/index-versioned-maintenance-20261104/functional-closure-20261111/initialization-breakdown-20261112/`。
原嵌套路径隔离Photos项目物理30000源码、Node成员29995，SDK API24/6.1.1.125仍为
unverified/typescript-compatible-only，语义终态真实partial。全部为Mac协议驱动，非UI验收。

|普通运行|初始化ms|首次定义ms|重复定义ms|结果|
|---|---:|---:|---:|---|
|photos-final-identity-nested-cold-30|134663|18471.562|13880.129|精确目标正确|
|photos-final-global-nested-cold-31|136200|19067.774|13985.966|精确目标正确|

31冻结Worker SHA256 `aab73500bd6a823fc292eef7c99bdafcf342a07b87ba757189fda71226b9725a`。
Program开始/返回2/2（SDK和项目），checker2/2；重复定义没有增加Program构建。
Node峰值1578.83MiB、Native64.36MiB；正常shutdown/exit0、测试拥有进程CLOSED。
只验证bootstrap DB完整性，未完成Native全库冷索引；不能宣称全量引用/重命名、完整READY或长期稳定通过。
约136秒初始化及14秒重复定义仍为严重性能问题。原始OOM/30秒超时失败保持，不被本轮覆盖。

## 完整检查：真实失败，不沿用旧绿色结论

冻结上述候选，Node20.19.5串行`pnpm check:fast`：2502条，2480 PASS、22 FAIL、
0 skip/cancel/todo，约74.66分钟。1239输入前后无变化。仅沿用用户授权455冷目录3秒门槛豁免。
证据：B/final-global-checkfast.log、final-global-checkfast-summary.json及对应evidence目录。
22是失败记录数，非独立缺陷数。后续源码修复尚未再次通过完整检查。

归并待处理：缺canonicalRootId的旧核心适配器；默认补全/详情；显式发现批次计数；
仍假定隐含20K上限的partial驱动；包symlink overlay；生命周期构建次数；20K及30K持续慢查询。
基线失败亦需修复，不能以已知限制结束。

## 本轮垂直修复及现有证据

1. 旧核心适配器没有canonical成员收据，不可授权投影，也不能对undefined解析路径。
   `semantic-groups.ts:decorate`保留其原完整scope。原失败定向13/13 PASS：
   B/canonical-receipt-adapter-green.log。
2. completion操作从Legacy提取到`src/semantic/completion-operation.ts`，原生命周期6/6 characterization PASS，
   Legacy由686减至631行（仍为迁移债务，未宣称达到500行）。证据B/completion-operation-extraction-characterization.log。
3. 默认索引未确认ready时，operation scope缺少未打开export根。新增公开stdio回归先RED（Greeter缺失），
   用已加载源码角色的primitive export摘要选择候选superset，经实际编译器验证；沿用128候选批次和全局影响根。
   export*反向传播、unknown保守保留，不是新的语义索引或完整READY证明。
   新回归补全及resolve PASS：B/unindexed-scoped-autoimport-project-green.log。
   SDK provider真实incomplete仍保持true；首次新用例的false期望错误单独保留，未修改既有断言掩盖问题。
4. 原有同名auto-import回归仍失败，诊断捕获父端`canonicalizeJsonArray`拒绝共享路径数组，
   导致`Invalid semantic worker response`再进入恢复。证据B/ranked-parent-worker-error.ndjson。
   与同步编译卡死/OOM不同。修复每个item独立数组，协议约束不变；正在回归。
5. 单字符Unicode前缀实际不启用module export搜索；scope planner却沿用全项目auto-import不足标记。
   修复标记仅作用于实际启用的模块搜索，SDK/编译器真实incomplete仍保留。原有断言不变，正在回归。

## 尚待完成

补齐export摘要的barrel/alias/default/编辑与撤销回归；处理剩余失败根因；更新最终产物身份，
重新完整check:fast及普通30K冷/热/编辑查询。现有成功局部运行不替代这些验收。
参考[ADR0045](../adr/0045-complete-membership-and-source-resource-budgets.md)，仍Proposed；
前序报告[11月15日](2026-11-15-30k-initialization-follow-through.md)。

### 续进：已完成的回归与新根因

- completion-ownership-characterization-green.log：原有4项回归PASS；
  metadata-completion-lifecycle-full.log：整文件9/9PASS，含140候选跨批、未打开export编辑/撤销、
  默认命名、别名和循环export*。共享数组问题不再触发Worker换代。
- package-overlay-membership.ndjson：原catalog26路径、view25路径，同revision2；被overlay遮蔽的
  entry/Outside.ets是差异。已增加Store本地原始catalog/view配对收据，未删除任何路径身份验证。
  package-overlay-origin-green.log：4类package escape全部PASS；
  membership-origin-regression.log：14/14PASS（包含9项scope用例，不重复相加）。
- partial驱动不再用20000空文件冒充不完整。改为真实5MiB源码触发source-unavailable；
  引用和incoming calls仍返回原严格错误，新增重复incoming检查。
  real-partial-membership-regression.log：功能4PASS，manifest计数因提取新增文件338!=337而失败；
  随后正确更新清单总数/层分配，partial-fixture-manifest-green.log：4/4PASS。
  大型旧调用层级文件提取独立partial责任，行数下降；没有恢复隐含20K上限。
- context-owner-diagnostic.log及arkts-context-lifecycle-Cd4oze.log：SDK配置后第三个上下文尚未编译，
  被同一reset标记再次以document-store-reset驱逐，随后创建第四个上下文。原有生命周期3项失败
  是真实重复重建，不是直接修改expected计数。用原有reset epoch识别已消费事件，保持无epoch旧适配器
  的保守reset和真实新epoch驱逐。reset-epoch-once-regression.log：21/21PASS，原有创建次数/驱逐原因断言不变，含100次磁盘编辑及未知删除控制。

### 冻结候选32及剩余项

`operation-gate-closure-runtime-identity.json`：299个源码文件逐项哈希，Worker
`026fe57dfef1319dc48286637c4a5dd3f0e5cfeef50bb73b2ce62183339ec42a`，server
`d2d7caa63a28d3147bf372cfc6d463fc067b06cb228c3ac11d7b3a682b5a3be9`，Native未变。
Photos32原嵌套30K隔离副本、新索引，初始化109703ms，首次定义14865.397ms、重复11202.041ms，
精确ScreenManager位置正确；终态仍SDK-partial。完整结果见B/photos-gate-closure-nested-cold-32/result.json。
这是普通协议运行，保留既有轻量Worker阶段观察；不含重度函数插桩，非UI、非长测。
与31的差异包含系统缓存/运行波动，不能把单轮时差都归功于某一修复。

`finite-30k-real-partial-regression.log`：整文件3/3PASS，真实30000源码，替换一个生成文件为
5MiB unavailable源码，4轮/最终版本37/Worker启动1/恢复0；仍保持严格全局引用拒绝。
这是部分输入下有限同步的机制验证，不能替代合格完整30K初始化验收。

`completion-candidate-global-accounting.log`：6/6PASS，包括原2项发现回归和4项manifest。
六个原conformance非module脚本（ArkuiBuilderTailPage/ArkuiPage/ArkuiResourcePage/
ArkuiSdkCompletion/Home/InlayHints）是必要全局根；原测试把它们误算成候选批超限。
现独立解析夹具计算这六个脚本，保留严格candidate计数/批次/fingerprint/结果和详情断言，
并增加实际Home全局定义正确性检查。过期Native提示由已验证源码元数据superset选根，
不再要求全25根；编译器及最终新鲜度证明仍保留。原大型characterization提取批次责任到独立文件，
减少原文件行数；manifest339/bundle177。不是直接把2/3改成8/9而不验证语义。

`final-gate-failure-disposition-20261116.json`逐条关联22个历史失败，去掉套件级重复摘要。
当前主要待证失败是完整20K场景总期限。普通复测交互检查完成55.46s，总期限60s仍失败；
正在独立诊断记录实际Worker方法、FS次数及嵌套阶段时间，不将区间重叠相加。
新完整check:fast尚未执行，当前不能宣称所有22条已通过。

### 最后一类失败：真实重复物理身份解析，及被回归否决的试验

独立诊断`large-query-diagnostic.log`/`large-query-phases.ndjson`不与普通计时混算：
定义4406ms、补全5734/5540/5719ms、详情3667/3474ms。每个补全/详情约40500次realpath，
约1700–1838ms；源码正文readFile计数0。readiness子阶段1383–1522ms是包含关系，不相加。
这些诊断与普通运行相近，但插桩开销未单独定量，不能精确归因为各步骤互斥百分比。
引用前的semanticReadiness4093ms被测试60秒总期限打断，不能宣称引用正确完成。

新的公开98源码完整Program回归首先RED：96个无关叶文件每次192次realpath，
源码全在Program中；不是通过排除它们缩小语义范围。
初版每请求枚举父目录，虽减少leaf realpath，普通20K回归仍FAIL：18!=6次noise枚举；
证据`large-completion-directory-sharing-ordinary.log`，未放宽“不重复枚举”断言。
该路径已从产品候选撤出，改为借用已有完整native成员枚举的原始目录/拼写收据；
查询只新鲜核验叶文件和原始目录证据，不重新列目录。未知/partial/injected、弱身份及SDK非成员仍raw验证。
Store原始目录索引随原catalog释放；收据本地Symbol传递，不序列化跨Worker授权。

`native-directory-receipt-focused.log`中公开完整98源回归：192→0 leaf realpath，精确目标正确；
其余目录成员/manifest/scope26PASS，但6个新增通用单测因esbuild导出对象只读的驱动错误失败，原日志保留。
修正测试局部clone后`native-directory-receipt-safety-green.log`6/6PASS：最终union中较晚owner
重命名较早已检查的叶文件拒绝、失败后下次raw恢复、大小写拼写、弱inode/symlink保留raw、
预算fallback不重复构造、取消传播且不打开目录。通用单测是公开LSP回归的补充。
`directory-resolution-sharing-red.log`及canonical版本是先行projected控制、原本已通过，
不是RED证据；真正RED见`full-program-directory-sharing-red.log`。

当前普通20K完整重跑`large-completion-native-directory-ordinary.log`进行中；
之后必须扩大新鲜度/取消/路径及完整检查，不将局部计数通过当整体验收。

### 原始枚举收据复用后的普通20K结果（仍失败）

`large-completion-native-directory-ordinary.log`：初始化ready18.67s、全部交互断言
（含不重复枚举、真实候选解析及未重解析noise）49.49s完成。随后引用请求response9在默认5秒
客户端等待内未完成，整组2PASS/1FAIL；不是总60秒保护触线，也不能算引用成功。
对应日志停在Worker request13 semanticReadiness完整输入资格读取，待继续消除重复正文读取；
不能根据Node约内存或这条超时推断OOM/死循环。

下一垂直回归将通过公开引用请求验证：已有完整、已新鲜核验Program中的关闭磁盘源字节证据
是否可在同一租约及最终fence内借用为Native磁盘digest；open/dirty overlay、未知/partial owner
必须继续读真实磁盘，不得把overlay文本当磁盘或用mtime代替实际字节证据。先建立真实RED，
不只凭性能百分比实现缓存。原30K候选32身份不包含此后目录收据改动，需再次冻结复验。

### 完整输入摘要的真实字节证据复用：首条公开回归

重构前readiness公开characterization27/27PASS：readiness-before-digest-characterization.log。
新回归经引用公开stdio接口，先证明Native完整98源资格与精确三处引用，再检查Worker真实读取。
初版新oracle错误要求引用列表的内部遍历顺序，实际集合完全相同，已改为对精确URI/range集合比较；
真实RED见reference-admission-byte-evidence-correct-oracle-red.log：两次完整准入各重读96个noise源码。
实现后reference-admission-byte-evidence-green.log：相同精确引用集合，两次准入均sourceReads0；
leaf realpath288→96。仍需覆盖overlay/raw磁盘、无通知更改与最终fence突变，不能仅凭首条通过交付。

Readiness normalization从大类移到既有readiness模块，TS LS2978→2974行；TypeEngine保持500。
剩余大型文件迁移债务没有被宣称消除。回调只在实际root lease和模块请求最终union内计算primitive摘要，
不输出SourceFile/文本/闭包，不新增源码/AST缓存。失败visitor不重试同一输入；无owner/budget保留raw捕获。
普通20K原断言/期限不变的新重跑large-completion-verified-digest-ordinary.log正在执行。

### 字节借用的反例与终态修复

`reference-disk-overlay-regression.log`2/2PASS：未保存Unused5的AST文本不能作为Native磁盘摘要，
每次准入仅该文件实际读取，关闭后回到0读取，精确引用集合保持。随后新增同长度/mtime
“实际借用摘要之后改磁盘”故障回归，首次FAIL保留在reference-disk-byte-final-fence-regression.log。
返回的三处引用碰巧未变，并不证明该旧输入有资格成功：namespace失败移入readiness状态catch后
被当成普通cache miss，后续重新建立了输入，违反原来namespace错误的终态边界。
现区分visitor已开始与仅状态探测：namespace或其最终fence失败继续向外抛出，不降为cache miss，
也不清掉后续实际查询可恢复的READY intent。reference-disk-byte-terminal-green.log3/3PASS：
旧请求-32803无结果，修复/真实通知后同会话定义正确并恢复READY，Worker仍1。
故障夹具先归一化初始mtime到整秒，记录并断言变更前后长度及mtimeMs完全相同；ctime变化由原fence检测。
另加regular/strong dev/inode资格，弱身份及symlink字节证据仍raw读取，Windows实机未测。

本次20K普通新运行large-completion-verified-digest-ordinary.log仍FAIL：交互50.05s完成，
引用请求已越过此前semanticReadiness，推进到reference batch start（20004准入/2候选），
但仍超过原5秒客户端等待。需要继续拆解plan/Worker启动/候选验证，不能把一步提速称完整解决。
Context7本轮重试仍transport失败，见context7-source-api-20261116.json；依照实际安装的
4.9.5-r10声明/源码核验API，没有宣称已取得在线文档。


### 补全复用路径遗漏原始目录收据（本轮续修）

先前“overlay后目录收据丢失”只是候选假设；实际调用栈没有支持该判断，未实施动态重绑目录证明。
真实stdio新增回归先用98源码复现两次各96次noise realpath/96次读取。该测试初始要求少于10次
过严，因为完整补全仍有有界原始快照预加载及最终正文核验，不能把这些必要校验一起删掉。
扩大为2050源码（2048个noise）后，第一轮3586次、第二轮254次noise realpath；第一轮3332次
确实来自TypeScriptLazySnapshots.compilerOwned → requestFileIdentity → diskIdentity，另254次
来自Store.loadFromDiskWithinTransaction。诊断见completion-directory-2048-callsite-valid.log；
此前callsite.log及一次语法错误导致EPIPE的驱动记录均保留，不作为产品失败数量。

最小修复：每次LS.prepare将该捕获workspace的本地原始目录收据交给本owner的lazy snapshot模块；
compilerOwned只能对其原本descriptor守卫的确切snapshot/stamp调用observedSourceIdentity。
保留admission token、强dev/inode、原始目录身份/拼写、叶文件前后核验、独立最终union；未知、
symlink、预算不足和证明过期仍raw，clear释放引用。没有动态续签catalog、信任watch或删最终正文核验。
语言服务2974行未增长；lazy模块仍小于500行。新oracle要求noise realpath不超过现有256份
原始快照上限，未修改任何产品预算/超时。lazy-directory-overlay-green.log：两次均254，
与原3586/254对照；补全精确本地result项正确。不能因此宣称完整20K引用或原30K已通过。

补充上轮读I/O口径：large-query-after-byte-phases.ndjson记录readSync而不是仅readFileSync，
semanticReadiness13实际1次open/2次readSync/79个API字节，references14为0；初始化40842次
readSync/1494362个API字节。旧readFileSync=0不足以证明无源码读取；这些都是API计数，
不是物理磁盘读字节。补全仍255次open/510次readSync/2629个API字节，约40K次realpath
与当前补全遗漏的compilerOwned路径一致，但其耗时改善必须由未插桩原20K重跑单独验证。


### 冻结候选33的原路径30K冷启动，以及20K引用完整诊断

新冻结operation-lazy-directory-runtime：300源码哈希，Worker
`3d803ec85bc7e89ea280dca49e1e5e0a0641c6793cdd063f3e6414d7d980919d`，
server `e6d24f51282da5bbe35aea97264924930bfb5c2cd9678476a5015cf0e8cff194`；
parent298d65f脏候选，Native仍800e6628…且未改Rust。
photos-lazy-directory-nested-cold-33：握手6.60ms；初始化111327ms（29995源，
SDK-inputs-incomplete/partial）；首次定义15253.42ms、重复11525.10ms，
准确ScreenManager.ts81:9–81:20（0基）。Node PID RSS峰1559.11MiB（包含Worker线程，
不再叠加）、Native65.64MiB、同时树1622.62MiB。1个语义Worker、Program2/2、checker2/2，
重复跳转无新Program；关闭时shutdownSemanticWorker主动terminate→Worker exit1，
不是崩溃/恢复；server shutdown ack/exit0、两个已观测拥有PID CLOSED、bootstrap DB完整性PASS。
不等待完整Native catalog；此PASS不代表全库DB、SDK READY、全量引用/重命名、UI或耐久通过。
比32的109.70s/14.87s/11.20s没有可认定改善；单次差异不作性能因果结论。

普通20K最新large-completion-lazy-receipt-ordinary.log仍2PASS/1FAIL：初始化18.94s、
交互断言48.04s完成，引用仍超过原5秒客户端等待。为知道实际后续阶段，独立诊断副本
large-query-observe-completion.mjs将外部观察延至30秒、整组90秒；不修改产品或正式测试期限，
也不作为普通性能通过。large-query-completed-diagnostic.log/对应phases记录：
完整引用约8.37秒返回。Worker1 references14约2594ms（含验证Worker），两侧readiness
分别约2.5秒；验证Worker2 job318ms，其中prepareHost40.6、Program197.0、query22.4ms；
这些子阶段有包含关系，不能重复相加。2roots/20004admitted，实际验证Worker已正常返回。
因此早先5秒窗口没有verifier日志，不能据此推断它没启动、卡死或存在execArgv缺陷。

诊断暴露潜藏驱动问题：三处精确URI/range均正确，只是顺序为Main两处再Unopened声明，
原oracle要求相反顺序。正式测试改为对完整三项排序后精确比较（重复/缺失/错误range仍FAIL）；
不改变5秒等待。旧顺序失败保留。接下来对完整资格校验CPU取样，避免凭统计量重写新鲜度合同。


### 后续CPU定位及测试配置身份纠正

large-query-cpu-diagnostic.ndjson.cpuprofile是独立插桩样本，不与普通耗时混算。
自采样约lstat861ms、path.resolve238ms、normalizedPaths145ms、GC256ms；Profiler自身
启动/dispatch约301ms也在采样，不能将这些数值当普通运行的精确互斥百分比。
lstat主要栈为resident diskInputsCurrent及原始completeMembershipProof.current，
不是验证Worker的checker死循环。其独立诊断完整三处引用集合通过，依然不是原5秒门禁通过。

新增normalized-source-paths：只对Object.freeze的原始路径数组弱引用复用纯词法规范化结果，
可变数组每次重算，返回值冻结，替换数组形成新key，不缓存任何current/READY结论。
同一inputsFor中已规范化成员不再第二次path.resolve。新单测先RED缺失helper，再2PASS；
manifest初次341/342计数失败保留，加入新文件后342entry/unit141的完整manifest回归6PASS。
tsc/build PASS。普通20Klarge-completion-normalized-metadata-ordinary.log仍引用5秒FAIL，
初始化18.58s、交互46.73s；不能以一轮较快交互宣称已满足尾延迟。

源码审计发现该测试继承selectedL03Policy，其中ARKTS_REFERENCES_RESIDENT_FAST_PATH=0，
虽本case关闭benchmark control并使用默认预算，却并非产品的默认常驻复用配置。
前述强制fallback测量仍有效，不能改标签为成功或删掉该覆盖；另建同输入、原5秒等待的
默认配置独立对照，明确清除该继承override。第一轮诊断驱动误拼require=undefined导致EPIPE，
保留large-query-default-policy-control.log作为驱动失败；optional observer驱动修正后重跑，
不能把该EPIPE计为产品崩溃。默认对照结果尚待记录，真实30K33未继承这个测试夹具。


### 逐行追踪落盘形成前台尾延迟：ADR0046

进一步控制原20K案例的继承配置后发现：selectedL03Policy关闭resident fast path，
readiness fixture又强制referencesTrace=1。仅恢复resident默认值仍首次定义5181ms失败；
仅关闭queueTrace仍失败；再关闭referencesTrace时首次定义2446ms正确，交互33.61s完成，
引用仍5秒失败。这不是可关闭校验来提速，所切换的是观测输出；正式旧配置继续保留。
`default-definition-input-trace-backlog.json`：20057源40114事件，Worker发出跨度137.9ms，
父线程持久化跨度3835ms。Node20.19.5官方同步FS/Immediate资料已核对，Context7本轮仍传输失败。

新公开130源码回归RED：732完整事件/732同步append（readiness-log-batching-red.log）；
实现父线程有界64行/64KiB批量sink后，GREEN：同732事件/17append，精确定义未变，
logging既有4项同时PASS（readiness-log-batching-green.log）。不是删事件或只输出摘要。
发送端继续流式发送每个source-start，父线程idle立即刷出，使真正取消仍可在Worker同步检查中观察；
错误、响应终态、退出/失败/退役/dispose前刷出。定制logger无bulk方法维持原同步方法语义。
单位8项含manifestPASS；完整取消/恢复扩大验收仍待本轮最终运行。[ADR0046](../adr/0046-bounded-worker-observation-delivery.md)保持Proposed。

同原配置、原超时普通20K在`large-completion-log-batches-ordinary.log`仍2PASS/1FAIL：
初始化16.13s、交互35.47s完成，完整引用仍5s客户端等待失败。只有观测落盘开销已被直接计数修复。

### Native实际观察的确认与准备→查询衔接

新公开计数先RED：98源完整引用准入，96noise每次576次lstat（6/文件），正文0读取。
早期尝试只借现有metadata又追加独立Native最终检查，计数仍576；随后暂存Native观察但未
连接准备阶段，反而672。失败原件分别在membership-independent-final-fence-green.log及
membership-pending-public-regression.log，不能叫提速。该过程暴露真正生命周期断点：
Native成员核验先在documents.prepareRoot完成，后来的leased模块查询已是另一metadata阶段。

正式衔接使用已有withSynchronousInputPreparation，仅跨同步准备阶段到原模块查询租约内的
独立最终union；不把最终核验挪到lease之外，不跨await。Native只暂存自己这次实际lstat及
原始目录物理/拼写证据，只有全目录、配置、eligibility及文件token校验成功并登记owner/epoch/
revision后才可借用。失败/取消/版本不符或预算不足继续raw，不能将pending当有效证明。
最终阶段清空所有pending；Native保留独立raw最终叶校验，Program的最终叶校验仍fresh。
无Program/budget及admission失败的raw namespace分支显式保留自己的最终输入frame。

readiness-preparation-receipt-public-regression.log：43/43PASS、零跳过。
相同公开准入的lstat576→384（每文件6→4），正文仍0；精确引用、未保存overlay/raw磁盘、
借用后同长度/mtime突变拒绝、配置/源码/真正取消/部分状态及恢复均保留。
新的membership-validation-union单位用例证明：较晚owner在早先Program最终检查后原地改正文，
长度及mtime相同、目录身份未变，Native独立最终检查仍拒绝；没有编译器owner也保留最终成员核验。
另覆盖未确认/失败/抛错/版本不符pending及最终阶段不可继承。该额外最终fence的成本明确保留，
不为了减少计数复用最终阶段的旧记录。引用dispatch仅同步prepare+status做同样衔接，await前退出scope。

后续原20K`large-completion-pending-native-receipts-ordinary.log`仍2PASS/1FAIL：
初始化16.49s、交互35.21s完成，引用5s未完成。局部I/O减少不等于端到端验收成功。

### Host根路径纯元数据的稳定所有权（当前最后CPU切片）

前述CPU采样显示normalizedPaths/path.resolve有重复全量工作。Host保留自己的不可变规范化
metadataNames，成员/推断入口/语义范围改变或clear时失效；Compiler仍接收原顺序的可变副本，
避免把metadata排序/冻结施加给SDK。仅内部证明使用稳定冻结数组，normalizer对自己产物幂等。
不缓存磁盘current/READY、不持有额外Program/AST或文本，也不宣称消除了N个文件最终验证。
单测先RED缺方法及非幂等，再8PASS（含完整manifest），新增文件将清单改为346entry/unit144/bundle179。
真实SDK/公开回归及原20K对这最后切片的结果尚未记录，不能沿用之前73或43当最终候选全绿。

最新已冻结、已跑30K仍为metadata-only34（不含后续logging/Native pending/Host metadata）：
初始化107096ms，首次14586.78ms、重复10956.16ms，正确同ScreenManager位置；仍SDKpartial。
后续候选需要重新冻结、冷启动与缓存重开；未合并/部署/发布。原2480/22全量失败尚未被新完整结果替代。


### 真实Photos SDK partial的确切前置拒绝：API20与24不匹配

新增只读sdk-coverage-preflight.ts/cjs，不创建LS/Program，不修改SDK/项目，0.25s完成：
使用同LocalPackageResolver.sdkTarget/loadCompilerSdk/sdkReadinessCoverage，目标compileApi20、
compatibleApi20；选中SDK API24/6.1.1.125，安装ready/identified、full profile、ambient index-full
匹配、components无issue，targetQualification明确mismatch：
`Project requires SDK API 20; selected SDK API is 24.`
结果见sdk-coverage-preflight-result.json。这是一项已证实的READY前置拒绝，**不是缺声明、
OOM、SDK parser循环或Program没返回的证据**；不能把所有旧失败都归于它。

原30K与隔离副本build-profile.json5字节相同，SHA256
`0268a85c564077cf752be36bc9ba213c33a75d25d8158dff1f74f8f68d04bd89`。
因此不是本轮夹具篡改了目标API。原SDK24不变；没有自动换SDK、改compileSdkVersion或放宽匹配规则。
本机常见/Applications SDK与~/Library/Huawei/Sdk只读元数据查找仅见当前分发，未证明整机无API20。
先匹配目标SDK后仍须验证后续依赖/声明/完整资格，不能保证匹配本身就会READY。
普通30K已有局部能力仍正确可用；SDK匹配问题不能作为它们10秒以上尾延迟的充分解释。

现sdk.selected仅记录安装ready/API24，隐藏target mismatch，易被误读成完整SDK资格已通过。
为此增加targetQualification/compileApi/compatibleApi/targetApi/sdkTargetMessage等扁平日志字段，
不修改SDK选择、兼容判定、public readiness状态或能力边界。公开真实子进程回归先RED缺字段，
再GREEN：目标20/SDK24明确mismatch，仍partial、局部定义正确，全引用能力未被伪造。
sdk-target-observability-and-metadata-green.log9PASS（含Host metadata/normalizer/manifest）；
初始空modules夹具无有效源导致workspace-sources-unavailable，修为真实entry/src/main/ets，
这些夹具错误日志保留，不算产品缺陷。

Host metadata切片的普通20K整组large-completion-host-root-metadata-ordinary.log仍2PASS/1FAIL：
初始化15.98s、交互33.77s，引用超过原5s客户端等待；严格原断言不变。实际安装的r10源码
lib/typescript.js:124369已自行对Host.getScriptFileNames().slice()，故撤去多余的第二层复制，
保持原Host API/顺序，仅内部proof使用冻结metadata；不向SDK传冻结数组。
最新23文件取消/恢复/路径/SDK/metadata扩大回归current-native-preparation-and-worker-lifetime-regression.log正在运行。

### 最新30K冷启动35：功能返回，但跳转退化，不能验收

同冻结current-proof-lifetime候选、原输入/SDK，冷缓存35：握手5.95ms，
准备终态112892ms、29995源、SDKpartial；首次精确ScreenManager定义23567.74ms，
重复19637.28ms。前一冻结metadata-only34为14586.78/10956.16ms，不能把新候选
称为真实项目性能改善。顺序版本包含多个切片，单组时序亦有环境差异，尚不能归因某一切片。
当前开始同缓存重开分阶段36；统计FS操作与包含关系，防止重叠相加。

35 Node峰2027.02MiB（同PID含Worker线程，只计一次）、Native67.78MiB，
同一采样进程树峰2094.74MiB。退出0、shutdown确认、所采样2个owned PID均CLOSED，
孤立bootstrap SQLite integrity PASS；Native full catalog在关闭时cancelled，
该DB通过不证明全量索引/引用/重命名完成。没有OOM/Worker恢复风暴证据；
仍不代表UI或耐久验收。result/resources/worker-causes/logs及wire原始记录全部保留。


### 当前候选冻结与扩大回归：184/184，无跳过

current-native-preparation-and-worker-lifetime-regression.log完成184PASS/0FAIL/0skip，282.96s。
包含初始化部分失败/同版本重试、同步不返回监督、取消/半开/共享预算、mutation及配置重放、
关闭重开覆盖权威、SDK目标不匹配日志、路径/目录/源字节最终fence、metadata与Worker日志生命周期。
这是针对性扩大回归，不是新的完整check:fast；旧2480/22结果仍保留。

冻结operation-current-proof-lifetime-runtime，302个源文件逐一哈希；
Worker 3fc700e5e0de0a59f41845847a6e16393bb550c3eb15d5c58180e40c18441d0e，
server caafed86abbbbd0cefac4e79a5aeea8bb608204a1d2c23e7993769effe78b9fd，
Native仍800e66281afb57afe4c129a17923b7778fbd0fbf4cf817d2f591caa4685bc07c。
身份清单operation-current-proof-lifetime-runtime-identity.json记录脏工作树，不伪称已提交SHA。
同SDK endpoint重算3536文件、零symlink，新增/删除/内容变化全部0，见
sdk-content-current-comparison-20261116.json。未更换SDK或更改项目API20目标。
原30K隔离输入冷启动photos-current-proof-lifetime-cold-35已启动；后续需同候选缓存重开。

### 30K性能退化闭环进行中：可选收据挤占实际校验预算

普通冷35/重开36均正确，但首次/重复23.57/19.64s与23.61/19.74s。
36原拟使用NODE_OPTIONS加载探针，Client主动清除该变量，实际未插桩；
不存在的阶段日志不能作为计时证据，36明确改记普通重开，未混同UI。
修正为诊断argv加载后，37实际阶段日志采样成功，重复定义20.22s，
realpath211168次/9502.86ms，Worker入队到dispatch不足2ms。
对照旧冻结metadata-only同缓存38重复11.17s，realpath59504次/2801.31ms；
withPreparationInputValidation包含时间14.66s对5.51s，而query/final包络5.71s对5.75s。
这些包含时间存在嵌套，不相加作总耗时。Native配置capsule仅23facts约10ms，
SDK/编译scope capsule181/182facts各约25ms，排除先前“Native配置capsule本身数万facts”的猜测。

可复现预算反例：Native可选pending占用与真实配置身份同32MiB；长路径可填满预算，
后续64个配置观察重复读取117次。先RED后最小修复：真实file/config/directory观察需要空间时，
优先淘汰未消费pending，保留已消费记录与所有原始证明。未消费回落原raw观察，最终union独立重验。
预算、产品deadline、V8/RSS、身份/完整性/新鲜度合同均未变。
pending-receipt-budget-priority-safety.log21/21PASS，tsc/buildPASS。

冻结operation-priority-receipts-runtime对35仅一个产品源变化request-input-validation.ts：
Worker283f06ab2aab21e303d56598b4e3019ac5d2504676f3c041ef9d858f1bc5240e。
同缓存同探针39进行中；必须看到真实计数/耗时后才能确认本轮退化已消除。
全证据索引pending-receipt-priority-diagnosis.json；184PASS属于修复前候选，不能冒称新候选扩大回归。
