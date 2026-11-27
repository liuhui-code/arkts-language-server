# 2026-11-26 驻留局部引用修复实施与验证

状态：final03 实现及24项公开针对性回归GREEN，测试清单4项GREEN；独立最终全量已结束：2817项、2816 PASS / 1 FAIL、0skip；失败为30,003源码初始化progress/end等待60s超时，不能称全量通过。final02完整检查2807 PASS / 4 FAIL亦保留。
父版本 `cc92b50370c0a2471f8315bab2119e59996fd2cb`，当前隔离分支 `fix/partial-reference-owner-final03-20261126`；旧final02分支保留证据。
主工作区仍在main，原改动保留；没有提交、推送、合并或部署。

## 修复的具体问题

SDK partial 可让全局prepared标志为false，但不等于模块LS不存在或局部绑定无法证明完整。
原路线在Native候选/锚点阶段先付隔离LS成本，随后又用SDK-only verifier做局部查找；
即使模块LS已经能增量更新，后段复用也挡不住前段重复构建。

现在先以当前文档语法提示筛选，再在合法的现有投影语义组中执行实际compiler查询。
只有既有lexical-block生产者及当前文本/位置/编译器/Locations资格通过，才在原全输入围栏内发布。
编辑更新同一个LS的Host，编译器可以用oldProgram同步；不强求Program永远不变。
不支持的绑定/属性/shorthand、未知图、不能安全投影的包身份等继续完整回退，不返回截断成功。

相关代码：

- `reference-query-entry.ts`/`reference-query-router.ts`：候选选择前显式qualifiedOnly单job路线；缓存/final发布仍为原入口。
- `semantic-worker-reference-args.ts`：内部不可变、互斥请求模式，未改公开LSP能力。
- `reference-anchor-preparation.ts`：不适用语法在完整工作区准备前退出；实际同步输入scope保留。
- `retained-lexical-reference.ts`：稳定组选择、只接收实际compiler证明；特定投影拒绝安全回退，其他异常传播。
- `type-workspace-entry.ts`：此尝试不隐式扩成整个语义单元；正常操作保留原完整scope重试。
- `typescript-resident-reference-query.ts`：查询覆盖资格与全局Program观察分离，不伪造SDK READY。

## 历史合同与边界

[ADR0050](../adr/0050-query-qualified-retained-references.md)仍Proposed，不伪造独立审阅。
落实0018/0019长期LS/稳定组；0047/0048完整namespace/final、0049取消/drain和所有权均保留；
0029默认无RSS预算不变。不声称缓存读集能覆盖无通知在旧无关文件新增import/use的反例。
完整proof扫描仍与项目规模有关，本片不修初始化约91s或消除Photos约2.1s前后证明。

## 验证证据

[TDD记录](../tdd/2026-11-26-query-qualified-retained-references.md)包含父版本命令和中间失败。
证据根为主工作区 `.bench/reference-owner-fix-20261126`。

- `owner-red.log`：精确结果正确但LS3→7；`owner-green01.log`仍3→5，均未删除。
- `owner-green02.log`：首次公开复用回归1/1；`green02-detail/work.ndjson`实际增量Program旧值传入。
- `characterization-before-refactor.log`：38/38，0skip。
- `hint-red.log`：非局部符号全局准备2≠1，定位阶段性性能退步。
- `owner-final-focused.log`：5/5，0skip；精确结果、edit/undo、shorthand、无通知同size/mtime改写、内部模式。
- `candidate-identity.json`、`candidate-inputs.tar.gz`：1364份源码/配置/测试/脚本等输入及产物哈希；未提交版本有明确身份。
- `final-check-fast.log`：最终完整检查，终态待追加。

超限迁移债：TS LS2852→2851、Legacy622→620；type-engine500→498，新源码/测试均≤500。

## 未完成验收

真实Photos/SDK性能、Windows、Zed UI与正式混合耐久未由本轮synthetic协议短测替代。
完整30K跨文件引用/重命名、初始化、全输入核验扫描、安装diagnostic worker等原问题状态不变。
500ms是允许波动的体验目标；没有放宽产品超时/内存/规模或正确性断言。

## 冻结候选 final02：串行规模对照

初版并行完整检查暂停，未记作完整通过；final02额外移除覆盖拒绝后的第二次同类尝试，
公开RED为2≠1，`final02-focused.log`5/5 GREEN、0skip。type-engine最终498行。
最终身份 `candidate-identity-final02.json` / `candidate-inputs-final02.tar.gz`，原先identity/archive仍保留。

Mac26.6.2 x86_64，Node20.19.5；编译器固定ohos-typescript4.9.5-r10，
SDK是隔离生成的API24元数据和1份FixtureAmbient，不是DevEco完整SDK；alias mismatch始终partial。
生成项目为1份Main及N-1个`export {}`未引用源码，项目import边为0；没有把N份源码当成N份Program成员。
候选实际查询Program均54文件：项目1、SDK1、内置标准库/其他52，项目root1+SDKroot1。
这个对照只检验无关文件增大、现有完整证明和可保留owner；不能外推真实依赖闭包增长。

每组1次冷项目初始化（OS页缓存未清）、首查1次，随后3次编辑/撤销/再编辑及4次热重复。
变更版本1→2→3→4，精确Locations3→4→3→4，每次后紧接同版本重复；全8次查询均核对完整结果。
Native/cache各会话隔离，不用真实缓存；基线为cc92原源码/config独立构建，Node/Native/SDK/输入生成器相同。
没有产品预算/超时/V8变更。首查和初始化只有n=1，不称多轮冷中位数。

### 未启动并行测试套件时的观测（毫秒）

| 项目源码数 | 构建 | 首查n=1 | 编辑后首查n=3 中位/最大 | 缓存命中n=4 中位/最大 |
|---|---|---:|---:|---:|
| 2048 | cc92基线 | 2110.39 | 815.42 / 935.61 | 151.30 / 166.27 |
| 2048 | final02候选 | 731.41 | 553.84 / 592.32 | 157.49 / 228.11 |
| 30000 | cc92基线 | 9533.94 | 6945.98 / 10912.14 | 1502.58 / 2772.08 |
| 30000 | final02候选 | 3127.67 | 2293.74 / 2445.73 | 806.75 / 838.42 |

每个规模均是单会话序列，不能称3个独立冷运行。没有关闭用户后台程序或清OS页缓存，
系统背景/采样开销仍在；因此不承诺表中全部差额为产品因果收益。
尤其缓存命中路径代码未变却也有波动，说明不能用单次前后时延比估计纯优化收益。

最初与check:fast并行的数据另存`scale/`：30K基线首查4772.48、编辑中位5143.45，
候选首查5652.56、编辑中位4966.74、热中位1624.68；没有挑掉较差样本后宣称全面改善。
`quiet-controls/`仅指本任务未并行运行其他测试，不代表整机空载。两组分别统计，不混为多轮中位数。

### 确认的工作量变化

两个规模、两组条件下计数一致：8个查询含4次真实缓存命中；
基线总LS9、Program9、其中verifier LS8、全库计划4、增量oldProgram0；
候选总LS2、Program5（初始化+首查+3次增量）、verifier LS0、计划0、oldProgram3。
基线8份verifier LS运行在同一个复用的thread2，不是8个Worker或8个Node进程；
候选2份LS均在semantic thread1。两者日志均只启动一次semantic Worker，没有观察到退役/恢复或error级别日志。
实际工作量下降由审计和Locations同时证明，不能仅凭耗时下降作此结论。

### 剩余2.29s为何还在

final02 30K的v2编辑首次查询2293.74ms，按不重叠墙钟边界：

| 区间 | 约ms | 占比 | 解释边界 |
|---|---:|---:|---|
| 请求开始→cache.miss | 802.00 | 34.96% | 原初始readiness/输入准入等聚合，不是全部已单独归因CPU |
| miss→retained owner开始 | 334.79 | 14.60% | 含文档准备291.56ms、排队/调度/组准备等，剩余未分拆 |
| retained owner | 362.21 | 15.79% | 含编译查询12.92ms（createProgram7.66ms），及原准备认证/final等；不可重复相加 |
| owner结束→响应 | 794.74 | 34.65% | 原最终输入资格/缓存发布/传输等聚合；没有全部拆成单独CPU阶段 |

时间戳毫秒精度，原实际duration为高精度；边界拆分近似值保存`control-summary.json`。
Program更新不是2.29s主体；仍需迁移输入资格/证明消费者、减少全namespace往返与派生集合重复维护。
本片不擅自删除这些合同，也没有将未测余量全算为某个函数。500ms非硬失败线，但2秒级仍是OPEN体验问题。

### 资源观测口径

一秒间隔进程RSS采样，Node包含主线程/所有Worker，只计一次；Native为其独立子进程。
它是**采样最大**，不是连续真实峰值，未采集全进程树所有V8 isolate堆快照。
quiet 2048：Node基线339.8MiB/候选203.8MiB，Native14.1/12.7MiB；
quiet 30K：Node610.2/636.3MiB，Native73.7/60.5MiB。不能由后者宣称内存全面降低或泄漏。
Worker heap仅实际semantic.references日志观测，基线隔离verifier堆未在同字段测得；不补推测值。

### 复现和文件

```sh
# $repo为隔离候选工作树；$server指向固定baseline或candidate的dist/server.cjs。
# $output必须是不存在的新目录，不能覆盖历史结果。
node .bench/reference-owner-fix-20261126/scale-retained-owner.mjs "$repo" "$server" "$output" 30000
python3 .bench/reference-owner-fix-20261126/summarize-controls.py
```

`run-scale-controls.mjs` / `run-quiet-controls.mjs`包含实际顺序；控制器记录各轮PID/起止/退出。
每轮manifest、operations.ndjson（完整响应/版本/实际输入）、server.log、work.ndjson、
resources.ndjson、transport.json及result.json均保留；`environment.json`记录平台/基线产物。
非UI；未用本组简单拓扑代替Photos实际SDK、依赖闭包增长或Windows验收。
final02全量日志为`final02-check-fast.log`：2811项、2807 PASS / 4 FAIL、0skip，耗时6741421.87ms。其调度及清单错误在final03修正后须独立重新全检。

## 自审保留的风险

投影根数量不等于实际Program依赖闭包大小；本轮生成项目的import边为0。
首次合法组查询仍可以冷建该组Program，不能由本轮54文件Program保证所有真实模块同样小。
重型完整回退继续隔离，但不能将此前承诺夸大成所有局部尝试都没有同步编译/阻塞风险。
真实稠密/深依赖、Photos文本转换/包身份拒绝是否命中本优化、并发前台影响仍需独立验收；
没有据此盲加文件数/内存/超时门槛，也没有将合成结果称真实30K UI通过。

## 真实 Photos/SDK 的适用性组件验证

`photos-qualification/`是独立只读语义组件：同一隔离Photos29995文件、DevEco SDK路径，
父版本原配置/目标不改；未启动Native、LSP/Worker队列或Zed，和check:fast并行运行。
SDK状态仍为partial，`sdk-inputs-incomplete`/`coverage-unproven`，没有伪造READY。

实际文件：`product/phone/src/main/ets/picker/PickerUIExtensionAbility__copy_003.ets`，
零基43:9的`extensionWindow`；v2仅将查询组件内overlay增加`void extensionWindow;`，v3恢复。
原磁盘文本SHA `abde5c958e758df9ae1e8aa248c3353b8517c5eb8ff55bb4f26144aa2d0ab22d`运行前后相同。
精确Locations3→4→3，真实compiler lexical-block receipt全部通过，LS保持2份，
3次查询中的两个后续Program都带oldProgram，没有跨Worker移植AST。
实际Program482文件：项目87、SDK282、其他113；投影root1不等于Program仅1文件。

组件初始化135334.52ms、首查6488.24ms、编辑3833.49ms、撤销3825.40ms；
这是并行负载/组件诊断，不与历史W7公开请求4800.95ms作速度对照，也不是新LSP端到端数据。
编辑编译回调276.10ms，其中createProgram253.43ms；owner区间2160.67ms含该编译与认证，不能重复相加。
组件层仍数秒，整体性能事项不关闭。

首轮runtime trace有日志，但进程环境没有开启SourceFile身份WeakSet开关，
所以该轮所有`*SourceFilesReused/FirstObserved`均0代表**未测**，不是证明全部重解析。
为避免只凭oldProgram就宣称AST复用，另开`photos-qualification-trace/`启用已有身份观测，结果另记。
该轮源码、compiler/组件哈希、完整结果、阶段事件、LS/Program构造及资源/外部210s保护均封存；
未改变产品超时或V8/RSS策略，不把独立组件成功替代真实LSP/UI/耐久。

### trace-on 实际AST身份对照

`photos-qualification-trace/`已完成PASS_COMPONENT_ONLY，另有`ast-identity-validation.json`
对实际对象身份计数作确定性断言。3次查询的精确Locations仍为3→4→3、LS始终2；
后两次查询每次复用SDK282/282、项目86/87，仅目标项目SourceFile对象更新。
不是根据oldProgram标签或Worker未重启推断，也不是说磁盘SDK读取/校验全部消失；
其他113份来源没有单列相同的身份计数，不能扩大成所有对象的结论。

trace-on组件初始化137670.57ms，编辑编译回调227.81ms/createProgram209.54ms，
撤销233.02ms/createProgram214.99ms；均为另一独立并行诊断运行，不与前一轮混合算中位数。
实际SDK与源码不改；原文件hash再次核对，生命周期按原dispose结束，外部210s保护未触发。
这证明原真实查询适用本片，但完整LSP/Native/缓存围栏、UI与长测仍未由组件验证替代。

### 计时的插桩边界

上面的scale/quiet-controls均启用了reference trace与私有compiler构造审计，并保留1秒资源采样。
它们是**诊断计时**，不是默认trace关闭的普通产品时延，未测每个插桩自身的扰动。
计数用于证明重复构造消除，不由这组数字直接承诺普通产品速度。
准备另在完整检查结束后串行执行trace-off对照，保留同一输入生成器/精确结果与资源采样，
不在其没有compiler观测时虚构Program计数，也不把同输入重复自动标成已测cache hit。

### 构造计数语义与大规模完整性补充

审计中的`program-created`/`service-created`在构造函数**入口**记录，计数口径是进入/尝试次数。
仅有入口不能证明Program已返回、checker已执行或构建成功；本轮成功查询还用精确结果、
post-query实际Program规模/身份和第二轮SourceFile身份作独立证据，不从入口缺失推断卡点。

最终完整检查运行过程中，既有`large-dependency-input-proof.test.mjs`的30,003源码合成场景已通过：
闭包外旧目录前缀之后的消费者仍被完整引用/重命名覆盖；引用16976.80ms、重命名17119.02ms，
整个用例115387.18ms（包括初始化等，不可与两个请求重复相加）。另有4608依赖闭包通过。
这证明相应简单拓扑没有截断，不代表所有30K图都失败，也不关闭真实Photos复杂SDK/全量操作缺口；
两个约17秒请求仍属于现存明显长尾，没有因为正确性PASS就改为性能达标。

## final03：完整检查发现的调度回归及正式补正

当前活动分支/worktree变为`fix/partial-reference-owner-final03-20261126` /
`/private/tmp/arkts-reference-owner-final03-20261126`。final02保留原样继续收集终态。
原全量发现3项真实回归：两项从未查询冷根多1次RPC；一项已有SDK-partial完整根owner从1次变2次。
原结果内容正确，但额外探测违反既有调度合同，不能只把测试改成容忍两次。

先加零TS依赖的父端直接let/const声明名成本提示，再增加“已有完整根Program的局部绑定”反例，
仍2≠1，故最终是**单job owner准入**：按原策略同步可用根owner，未命中才尝试合法分组。
父端收到null不能重复retained查询；不支持后仍完整回退。模式group尊重禁用resident-first，
retained-first仍须原有根准入，不能给未知根冷建授权；不伪造全局READY。

新warm-root额外断言初期校准失误已用cc92独立构建证明：已prepare的root原本1次retained意图，
不是0。只校正新增断言为维持1；原冷根0及原warm-owner1的仓库断言未改。
`final03-combined-owner-red.log`证明局部暖根真实2→1的需求；
`final03-combined-focused.log`23/23、0skip，所有原失败及新反例已GREEN。
最终再补默认/flag0、SDK AST身份计数回归，完整检查将对最终冻结候选重新执行，不挪用final02成绩。

上面actual Photos组件的较早数据明确属于final02；final03正在重复实际输入验证新retained-first模式，
并显式检查父提示对原43:9符号为true。不能自动把旧组件时延当作新候选LSP性能。

补充计时限制：既有30,003用例继承fixture关闭resident-fast-path等策略，约17秒是该回归配置的请求，
不是日常Zed默认参数的速度验收；它证明该配置的完整性，并保留其明显长尾，不据此改标签称性能达标。

## final03 冻结与失败保留

`candidate-identity-final03.json`固定1365份产品/测试/脚本/配置/Rust输入与CJS/native哈希，
`candidate-inputs-final03.tar.gz`保留完整输入。没有将main的未提交诊断文件或其他任务修改覆盖。
`final03-final-focused.log`24/24、0skip，覆盖默认与RESIDENT_FIRST=0、真实SDK AST身份、
原冷根/暖根/partial局部根一次准入、parent compiler isolation；`final03-manifest-green02.log`4/4。
新增测试导致显式总数383→384、bundle层201→202，已按真实清单更新且保留RED，未删除用例。

final02最终4项失败：前述3项调度回归，以及新增测试遗漏清单固定计数。
`final02-terminal.json`与原日志保留。final03完整检查必须在冻结候选上重新执行，不借用2807项历史通过。

`photos-final03-qualification/`在并行完整检查期间触及原210秒外部保护，SIGTERM结束；
尚在初始化、没有完成查询。没有证据称OOM/产品Worker崩溃，result的RUNNING不能覆盖controller的FAIL_PRESERVE。
旧两次实际Photos成功属于final02；最新候选需串行独立复验。原失败不删除，也不抬高保护时间。

非Windows/非UI。没有用私有组件或协议短测关闭实际端到端、UI与耐久缺口。

### final03实际Photos串行复验

`photos-final03-quiet-qualification/`：2026-11-26T13:15:21.364Z→13:17:26.582Z，
独立只读组件、无并行测试套件，210s同一保护未触发；PASS_COMPONENT_ONLY。
初始化111808.66ms；v1首查5017.00ms，v2编辑2994.49ms，v3撤销3004.19ms。
精确结果3→4→3；实际Program仍482=87项目+282SDK+113其他，LS稳定2份。
后两次各复用282/282 SDK、86/87项目SourceFile；`ast-identity-validation.json`有独立确定性断言。
实际编译回调190.91/176.90ms（嵌套createProgram174.04/162.81ms），不能再与各次总时延相加。
原磁盘源码hash未变，SDK仍partial；真实符号适用最终qualifiedOnly(retained-first)路线。

该结果与前一轮210s保护失败分别保留。这里只证明组件资格/增量/结果正确，
不把串行较快全部归因修复，也不等同完整LSP、Native索引、真实Zed点击或Windows验收。
约3秒的编辑组件及约112秒初始化仍是未解决性能项。

## final03 关闭诊断插桩的普通协议对照

`final03-trace-off-controls/`四个独立会话均PASS，2026-11-26T13:17:42.886Z开始，
基线2048→候选2048→基线30000→候选30000顺序；无并行测试套件，不停用户后台服务、不清OS页缓存。
同上合成partialSDK、1个目标项目文件+N-1独立空模块、零项目import边，并非Photos或真实依赖增长。
此轮Program文件数未测；早期trace-on同拓扑实测54（项目1/SDK1/其他52），不冒作本轮实测。
关闭reference trace与compiler审计，保留默认日志及1秒资源采样。原始记录的0构造计数为未测，
不是0次构建；`final03-trace-off-summary.json`将compilerConstructionCounts显式标null。
缓存hit是默认独立日志明确记录，各会话4次；不由同版本重复行为自行推断。

| 项目源码数 | 构建 | 首查n=1 ms | 编辑首查n=3中位/最大ms | 热查询n=4中位/最大ms |
|---|---|---:|---:|---:|
| 2048 | cc92 | 1122.23 | 405.77 / 419.26 | 81.34 / 86.20 |
| 2048 | final03 | 446.98 | 292.59 / 355.64 | 84.37 / 91.89 |
| 30000 | cc92 | 5658.88 | 5117.90 / 5218.19 | 1047.71 / 1065.72 |
| 30000 | final03 | 3689.66 | 2728.82 / 2848.91 | 943.40 / 1099.26 |

每档仅一个独立会话，首查不称多轮中位数；未直接测量采样/系统背景扰动。
热路径产品代码未改却有波动，不能把所有墙钟差额归因本片；初始成本与实际依赖闭包成本另验。
30K编辑中位仍2.73秒、热最大1.10秒，保留OPEN，不把偶发500ms超出当功能失败，也不称达到性能目标。
每次响应均按当前版本完整精确Locations核验，未改变V8/产品保护或读取合同。

逐轮manifest记录输入/产物hash，operations保留输入与完整响应；controller记录真实PID/起止/退出。
所有会话各一次semantic Worker启动、error级事件为0；不将此短测作为长期恢复/泄漏证明。
进程RSS一秒采样含全部Node线程且只计一次，Native独立记录，详细峰值在summary。

### 缓存与编译复用不是一件事

trace-off两版每会话都有4次真实`references.cache.hit`，全部query-qualified/lexical-block；
逐次事件见`final03-trace-off-measurement-availability.json`。这不是本片首次启用结果缓存。
编辑后旧Locations失效应重新计算，但不意味着SDK AST、LS及未改变的项目AST也必须重建。
本片修的是miss路径的owner选择与编译状态复用；没有取消根级结果失效或磁盘权威。
重复缓存结果仍约943ms，不应解释为实际符号查找仍花943ms；原输入/发布资格等围栏仍执行，
compiler构造在trace-off运行未观测，不能从0占位计数推断完全没有任何编译准备。

## final03全量过程中新增失败：30,003文件初始化进度等待

`final03-check-fast.log`保留原失败：`default membership preserves complete references and rename beyond both former catalog bounds`，
总用例85561.19ms，等待索引progress/end的驱动60s截止触发，尚未调用references/rename。
服务PID67412，semantic Worker thread1；server.started13:59:41.423Z（生成夹具期间已启动），
lsp.initialized13:59:54.855Z、semantic初始化13:59:54.869Z；日志尾部仍有14:00:53.228输入校验，
14:00:54.572原生catalog QuickCheck。不能据此判OOM、死循环或本片引用快路失败。
原测试文件未改；沿用fixture关闭resident-fast-path，该次也未进入引用请求。
但不能仅凭此前final02同例PASS115387.18ms就将本次失败排除，更不能称最终全量GREEN。

该次完整原始服务日志被既有fixture cleanup删除，仅TAP中截断stderr片段可用；证据局限如实保留。
`large-membership-isolated-control.test.mjs`从原例精确提取，仅传既有serverPath参数选择冻结产物，
原30,003内容、完整结果断言、60s进度/请求截止和120s总截止全部保留。
全量结束后串行基线/候选补测，并通过既有ARKTS_TEST_EVIDENCE_DIR保存服务日志及公开协议元数据环形摘要（不含完整payload）。
当前原因未归因，不提高截止时间、不把后续单例通过冒作本次完整检查通过。

### 最新实际Photos组件仍约3秒的测量边界

v2总2994.49ms按代码中不重叠计时区间：全局文档准备533.99ms（17.83%），
retained-owner1687.75ms（56.36%），其余未拆聚合772.75ms（25.81%）。
owner内部实际compiler回调190.91ms（总时延6.38%）、其中createProgram174.04ms；
两个是嵌套区间，不能再加到上面总数。对象身份已证明未改SDK/项目AST复用。
owner还含现有prepare、认证/输入核验等，未逐项拆开；其余也不强行归成全量扫描或排队。
原始及明确区间定义见`photos-final03-quiet-qualification/nonoverlapping-component-intervals.json`。
这表明消除LS重复准备并未消除全部输入/准备成本；组件数据不含完整公开LSP父端前后围栏。

## 最终候选完整检查终态

`final03-check-controller.json`：2026-11-26T13:19:50.273Z→14:59:08.199Z，
`pnpm check:fast`退出1；Node测试2817项、2816 PASS / 1 FAIL、cancelled0、skip0，
Node测试时长5853239.21ms（不是含构建的整命令墙钟时间）。
唯一失败仍为上述30,003源码索引初始化progress/end等待60s，尚未到引用/重命名。
此前final02的三项队列回归和测试清单计数遗漏在完整套件均已GREEN，原断言未放宽。

1365份冻结输入无变化，完整79份构建产物哈希无漂移；`final03-terminal.json`保留终态。
没有将一个失败排除后声称全量通过，也不重跑全套碰运气覆盖本次结果。
随后用未修改的原仓库文件及相同helper，串行基线/候选选定单例对照；
仅选择该例，其他原例被名称筛选而未执行，不能把它称全套GREEN。
旧adapter只准备未执行；实际选择原文件的命令、hash和参数记录于
`large-membership-stock-control-provenance.json` / `run-large-membership-stock-controls.mjs`。
所有60/120s截止和完整Locations/rename断言不变，额外2秒进程CPU/RSS采样有未单独测量的观测扰动。

补证记录范围：stock原例的`transcript.json`来自transcriptEntries，仅方向/ID/方法/字节数的有界环形摘要，
不是完整请求/响应payload，且不含逐条时间戳；`large-membership-stock-transcript-availability.json`明确记录。
精确Locations/rename由原例不变的完整oracle断言验证，成功时原始payload未保存，不能说已保留完整协议帧。
此前scale控制的operations.ndjson另含完整响应与实际编辑内容，两种证据不混淆。

## 初始化超时最小对照的实际结果

原仓库30003源码用例、相同helpers/内容及60/120s截止，串行基线/候选均通过。
2026-11-26T14:59:23.723Z→15:00:46.184Z，单例test时长40784.81/41319.65ms；
各自只选择1例，另4例名称筛选未执行。不是全套通过，原全套FAIL不改变。
基线index.ready在initialized后16906ms、semantic初始化17275.36ms；
候选分别17136ms、17900.73ms。两者并行阶段**不相加**。
精确完整引用/重命名（原断言未改）：基线8173.77/7357.29ms，候选8500.09/7334.02ms。
原fixture明确resident-fast-path=0、trace=1，这些是诊断配置，不是日常Zed默认速度。
两版此例未执行本片qualified入口，时间相近；一次配对不构成严格回归/无回归统计结论。

随后通过原导出的runNodeTestLayer API，在内存中只选择原文件全部5例，
保持canonical双reporter和runtime零skip/todo/cancel约束，无源码/manifest落盘变更。
`large-membership-canonical-file/controller.json`：15:02:32.998Z→15:03:28.250Z，5/5 PASS、0skip，
Node测试54773.72ms；其中30003例41518.03ms，引用7732.84ms、重命名6918.37ms。
此文件还覆盖cold来源证明及128/4608真实依赖闭包。该补证排除了“独立原例总失败”以及
“仅因名称筛选或单reporter就通过”的解释，不能排除整套顺序、缓存/整机资源等条件差异。
全套失败时完整服务日志/资源未留存，故不能把其约60秒初始化归因为OOM、GC、I/O、热降频或泄漏。
对应产品/测试条件长尾原因仍**未闭环**，不改超时、不删失败、不再重复全套碰绿色。

两次stock控制各保留60163服务事件与2秒进程资源采样，LSP RSS包括线程只计一次，Native单独统计；
摘要`large-membership-stock-summary.json`，脚本和完整原例来源hash均保留。
成功结果由完整oracle核对，但stock协议文件仅128条有界元数据摘要，原始payload未保留，不能夸大。
这组大规模全局引用正确性不替代真实Photos复杂SDK、日常配置、UI或正式耐久验收。

## 当前完成边界与剩余事项

S0公开partial/edit复现、S1现有组LS消费、S2在锚点/全库规划之前的一次准入已实现；
SDK282/282与项目86/87对象复用在真实Photos组件验证，默认与flag0公开回归GREEN。
S3输入资格/final消费者迁移**未实施**：全namespace证明/派生集合/根结果失效仍在，
30K普通协议编辑中位2728.82ms、实际Photos组件约3秒、初始化111.81秒均仍OPEN。
完整check:fast保持2816PASS/1FAIL；该失败未稳定归因。500ms是体验目标，不新增硬线。
Windows、真实Zed UI、前台混合长尾及正式耐久本轮未验；无提交/推送/合并/部署。
