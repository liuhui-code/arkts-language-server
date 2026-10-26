# 同步编译卡住、失败初始化与Worker监督恢复

## 范围和结论边界

本轮在`fix/windows-path-identity-20261022`、父revision `e35459131366a32c48c10d1d74adef74357cd3dc`的候选上实现，
包含前轮路径身份和失败LS租约修复；以源码清单、dirty diff及bundle SHA确定实际版本，不把父commit当最终全部源码。
不发布、不合并。缓存性能TODO暂停；455文件冷目录3秒门槛由用户授权排除，其余检查按实记录。
原Windows现场的无限createProgram/module-resolution循环及RSS耗尽仍未复现；本轮验证的是可控活性缺口和恢复合同，
以及Photos自然输入下的实际行为，不宣称定位了该现场循环体或解决全部500ms/2万文件规模成本。

## 官方方案核验

Context7对Node.js、TypeScript、esbuild的resolve-library-id均因HTTP transport失败，重试Node仍失败；
未虚构library ID或query-docs结果。转而获取以下官方文档/固定版本源码，原件和SHA保存在证据`sources/`中。
最终检查期间再次resolve Node.js仍为同一HTTP失败，保留`context7-final-retry.json`，没有把不可用服务冒充已获取文档。

| 来源 | 核验事实与本项目采用部分 | 边界 |
| --- | --- | --- |
| [TypeScript v5.9.3 nodeServer.ts:671–715](https://github.com/microsoft/TypeScript/blob/v5.9.3/src/tsserver/nodeServer.ts#L671) | 同步检查取消管道；保留当前共享取消单元和编译器检查点 | 编译器不检查时不能强制中断。未升级本项目4.9.5-r10 |
| [rust-analyzer架构取消章节](https://rust-analyzer.github.io/book/contributing/architecture.html#cancellation) | 输入/派生状态分离，revision取消在边界转换成请求失败 | Salsa协作取消不是终止任意卡住线程的机制；不移植其增量数据库 |
| [clangd 21.1.0 TUScheduler.cpp:907–948](https://github.com/llvm/llvm-project/blob/llvmorg-21.1.0/clang-tools-extra/clangd/TUScheduler.cpp#L907) | 动作开始检查取消，scope-exit归还AST，失败AST显式报错 | 此处没有任意计算强杀保证；不移植陈旧preamble/索引路线 |
| [VS Code 1.104.0 TS客户端:628–700](https://github.com/microsoft/vscode/blob/1.104.0/extensions/typescript-language-features/src/typescriptServiceClient.ts#L628) | 宿主监督、错误预算、重放模型及用户动作恢复 | 其次数/窗口和UI决策并非通用标准，本项目另选3次/180s并增加连续失败限制 |
| [Node20.19.5 Worker.terminate](https://nodejs.org/download/release/v20.19.5/docs/api/worker_threads.html#workerterminate) | 父线程可以请求终止Worker JS，Promise在exit完成；等旧isolate退出才创建替换者 | 线程仍共享进程RSS；resourceLimits只限制JS引擎部分，不能保证进程级OOM/native abort隔离 |
| [esbuild onLoad](https://esbuild.github.io/plugins/#on-load) | 固定编译器精确工厂签名添加调用/返回观测，保留resolveDir和loader | 签名变化构建失败；不是编译器算法修复或跳过校验 |

实际编译器仍是`ohos-typescript@4.9.5-r10`，原文件SHA：
`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`。
构建`dist/arkts-compiler-observation.json`另存输入/变换SHA；已安装compiler文件不写入，产物工厂包装必须如实披露。
固定Node源码的[StopThread](https://github.com/nodejs/node/blob/v20.19.5/src/node_worker.cc#L775)、
[ExitEnv](https://github.com/nodejs/node/blob/v20.19.5/src/env.cc#L1116)和
[stop_sub_worker_contexts](https://github.com/nodejs/node/blob/v20.19.5/src/env.cc#L1775)补充核验了停止执行及子Worker退出/Join边界。
这支持等待物理退出再重建，不把任意native调用必能及时退出当成保证；未证明进程隔离级别的OOM恢复。

## 实际缺口与调用链

公开`textDocument/definition` → `run-language-server.ts:485`/`SemanticRequestRunner.run` →
`SemanticWorkerEngine.define/#documentRequest` → `workerDocumentRequest` → `WorkerProjectPreparation.request` → `SemanticWorkerRecycle.request` →
`RootSemanticWorkerSupervisor.request` → `SemanticWorkerHost`物理Worker → runtime `runWorkerCommand/answerRequest` →
OHOS适配层`recoverable-language-service` → 固定compiler LS同步、createProgram和createTypeChecker。

1. 共享取消单元能跨线程写入，但Worker同步执行期间无法运行它自己的事件循环/定时器；只有compiler检查点能配合抛出。
   原监督没有对已发送活动查询的父端截止，取消可能没有终态。压力回收要求的hasObserved不是强制替换前提。
2. 原频率窗口过后可再次重启，不能证明实际成功过；mutation restart-required还可走另一入口。
   现在所有物理故障入口使用统一预算，mutation在熔断时不能直接创建Worker绕过监督。
3. 前轮已修复的同版本失败LS和部分Registry acquire/release不配对问题继续保留：失败退休LS并结清owner余额，
   后续同版本重新创建LS；正常成功后的取消保留健康Program。此项无需每次整Worker重启。
4. observed/prepared/built是适配层证明，不能等同工厂返回。实际Program可能已返回，checker正在绑定，observed仍false。
   新观测明确区分真实工厂进入/正常返回、LS同步和semantic-query，异常不计作“正常返回”。checker后续内部细分未测。

关键实现：`semantic-worker-watchdog.ts`、`semantic-worker-failure-recovery.ts`、`semantic-worker-host.ts`、
`semantic-worker-recycle.ts`、`semantic-worker-progress.ts`、`scripts/compiler-observation-plugin.mjs`。
失败租约链继续见[前轮报告](2026-10-23-degraded-initialization-recovery-and-lifetime.md)及[ADR0020](../adr/0020-failed-semantic-build-recovery.md)。
编译器提前提交版本、未进入已安装Program的Registry租约和同步执行不配合取消是不同缺口，不能由一个observed标志解释。
前两项在适配层的同步事务/owner边界修复；第三项由未被阻塞的宿主承担监督，编译器检查点继续处理能合作的取消。

## 恢复合同

父线程每25ms检查已发送命令。默认执行预算为普通请求30s、references/rename/incomingCalls120s、准备180s、mutation10s，
已发到物理Worker、尚未执行的命令，其排队预算为max(该操作预算,180s)；开始执行后仅用执行时钟。
取消宽限1s独立于执行截止。`ARKTS_SEMANTIC_{REQUEST,GLOBAL,PREPARE,MUTATION}_TIMEOUT_MS`及
`ARKTS_SEMANTIC_CANCEL_GRACE_MS`接受正整数毫秒；测试缩短预算不代表产品默认或500ms达标。

物理恢复顺序：围栏旧epoch并结束其请求所有权 → 最多100ms等待root supervisor收尾 → 最多1s通知Worker清理嵌套验证者 →
Worker.terminate并等exit → 退避 → 创建一个替换者 → 使用父端最新配置和权威文档重放。
正常请求不自动重放；旧世代消息由物理Worker身份和epoch一起隔离。recovery.complete只证明输入重放，不是READY。
排队取消可先结束调用方等待，底层命令直至真正终态仍计入在途，不把它误判成空闲。

最多3次/180s，另有“新输入上实际成功之前最多3次自动恢复”的累计限制，退避250/500/1000ms；时间窗口过期不清累计计数。
成功ACK、只读状态、跳过构建及同输入的成功查询均不能补充累计自动恢复预算。恢复中再次故障/缓冲溢出立即回收替换者，不自动嵌套重建。
恢复队列上限为32条记录和4MiB UTF-8文档文本，沿用独立文件事件条数校验；4MiB不是整个进程或全部元数据的内存上限。
相邻同文件全文更新合并，close/文件事件仍为边界。
熔断保留最新输入，停止Worker。修复实际文档/文件或配置后，显式prepare或前台语义请求可消耗频率预算进行一次半开探测；
相同配置及空rootDirty提示、状态查询、后台诊断不解锁。探测失败回熔断；后续再次修复可重试，不永久要求重启客户端。
纯rootDirty但没有具体文件变化或配置差异不能作为修复证明。
已完成根的初始化压力豁免消费状态跨Worker保留；前轮公开LSP回归在极小压力预算下验证fatal恢复不能重新领取初始化豁免。

| 事件 | 必须完成的动作 | 何时可继续 |
| --- | --- | --- |
| 可返回的初始化异常/同步取消 | 退休该LS、结清该owner余额、撤销成功证明 | 后续同Host版本显式构建，正常复用SDK域，不必整Worker重启 |
| 同步执行不返回/取消超宽限、fatal、mutation restart-required | 结束旧epoch所有权、实际退休Worker、共用预算与退避 | 预算允许时单个替换者重放最新输入；原查询不重放 |
| 恢复过程再次失败或缓冲溢出 | 停止恢复并回收替换者 | 实际输入改变、明确工作且有频率预算时一次半开探测 |
| 自动预算耗尽/探测失败 | 保留父端权威输入，Worker回收、请求显式失败 | 时间单独过去无效；修复输入后允许受限探测 |
| 会话关闭 | 停止watchdog与退避、结清请求、等待退休 | 不创建新Worker |

物理恢复预算不限制能够合作结束、每次结清owner的同版本LS显式重试；普通缺声明的degraded也不消耗Worker重建次数。
Registry能够合作退出时按owner配对结清，保留其他owner及SDK pin；不能合作时丢弃整个旧isolate，不声称运行了每条release。
SharedArrayBuffer只有16个int，不持有AST；旧Worker监听器/计时器、supervisor和代际mutation跟踪收尾。
RSS包含所有线程，不能给Worker逐个相加，也不能用RSS未立即下降判定AST泄漏。

## 验证记录

[TDD详细记录](../tdd/worker-supervision-20261024.md)；证据根`.bench/worker-liveness-20261024/`。
最终候选v8增加15项公开LSP回归。与前轮15项、诊断调度、生产Worker压力恢复、常驻调用层级和诊断CLI合跑，
`42-focused-v8.log`为**73/73 PASS**，零skip/cancel/fail；覆盖了测试异步暂停入口的全部正值调用场景。
Windows v8在完整准备的隔离目录执行**50/50公开回归PASS**，零skip/cancel/fail；完整TAP见`windows-v8-recovery-final.log`。
994个传输输入逐项核对且前后不变；Windows全部11条串行命令（回归1条、Photos/故障/GC/配置10条）均退出0。
后验所有候选Node/索引进程均已退出，真实Windows Photos工作区干净。
首个全量尝试因无效参数分配顺序问题主动中断；第二个尝试实际暴露4个诊断构建一致性失败，日志均保留。
修复共用生产compiler变换后，原有字节一致性/完整答案断言保持，四个失败场景均在73项合跑中GREEN。
第三个全量尝试在共享恢复等待的取消反例确认后主动中断，不算完整PASS。
第四轮实际暴露两个调度场景失败：测试专用异步hold不读取消，超过1s宽限后正确触发监督退休，打断新版本请求。
V5统一合作取消后，第五轮又暴露压力场景缺少预期恢复；独立日志证明该1500ms故障hold在26ms结束、未形成预期积压。
V6让调度测试显式选择合作取消，故意积压mutation的故障测试保留原来的不合作模式；两类原断言均保留，未改产品截止或延长测试等待。
Windows V5前两次扩大回归分别因漏传两个夹具、缺少源码根Git身份而在三项启动服务器前失败，原日志保留；补齐后完整35项通过。
V6扩大Windows验证发现测试失败后清理顺序导致SQLite EBUSY、服务未关闭；V7修正清理和精确路径预期后，50项自然结束但仍49通过/1失败。
剩余实际产品缺陷是整文件调用项的内部path未按其他映射项转换为原生路径，合法incoming→outgoing被误判过期。
V8只在[整文件项边界](../../src/core/types/typescript-call-hierarchy-range.ts#L33)执行path.resolve，显示name和所有新鲜度/身份/范围断言保留；
对应[普通项映射](../../src/core/types/typescript-language-service.ts#L1171)、[跟进准备](../../src/core/types/typescript-language-service.ts#L1066)和[精确比较](../../src/core/types/typescript-language-service.ts#L2646)。相关RED→GREEN与旧轮中断均见TDD和原始证据。
最终v8完整`pnpm check:fast`正常退出0：**1984/1984 PASS，fail/cancel/skip/todo均0**。
Node测试阶段3062270.183ms，整个命令3071107.428ms（约51分11秒），包含TypeScript检查、运行时构建和release sidecar构建；
逐次日志`check-fast-final.log`与实际终态`final-check-result.json`保留。检查前后772个源码/测试/构建输入及正式构建的76项生产产物SHA全部一致。
Rust `cargo test --locked --package arkts-index-sqlite --test path_identity_contract`为1/1 PASS，Rust产品源码本轮未改。

新增第14项特别验证：预加载器仅将预算使用的Date.now推进超过180s，且每次重放后显式prepare确实READY，同一输入仍在第四次故障停止，
不会因夹杂成功而无限重建；随后编辑输入再探测可以恢复。`31-intermittent-success-red.log`保存修复前反例。
这是预算时钟的可控模拟，并未实际等待多个180s，也不是长期soak；执行/取消截止与测量仍使用performance.now。
这比仅验证“连续失败没有成功”更严格，累计预算只在输入代际变化且有效成功时重置，频率预算从不由这些动作清空。
第15项证明半开请求在等待admission Promise时也能真正取消，替换者启动仍暂停时调用方已经得到唯一终态；
共享恢复继续由监督端拥有，解除启动暂停后最新输入能够READY。修复前反例在`33-half-open-cancel-red.log`。

### 调用链和工厂位置

| 边界 | 文件/函数（最终冻结源码） |
| --- | --- |
| 公开definition | [run-language-server.ts:485](../../src/lsp/run-language-server.ts#L485)、[SemanticRequestRunner](../../src/lsp/semantic-request-runner.ts#L65) |
| 文档权威与准备 | [define](../../src/semantic/semantic-worker-proxy.ts#L263)、[workerDocumentRequest](../../src/semantic/semantic-worker-document-request.ts#L8)、[WorkerProjectPreparation](../../src/semantic/worker-project-preparation.ts) |
| 排队/取消及回收 | [SemanticWorkerRecycle](../../src/semantic/semantic-worker-recycle.ts)、[RootSemanticWorkerSupervisor](../../src/semantic/semantic-worker-supervisor.ts)、[SemanticWorkerHost](../../src/semantic/semantic-worker-host.ts) |
| 父监督与预算 | [watchdog](../../src/semantic/semantic-worker-watchdog.ts)、[failure-recovery](../../src/semantic/semantic-worker-failure-recovery.ts) |
| Worker入口 | [runWorkerCommand调用](../../src/semantic/semantic-worker-runtime.ts#L141)、[answerRequest](../../src/semantic/semantic-worker-runtime.ts#L240) |
| LS同步与失败清算 | [recoverableLanguageService](../../src/semantic/backends/ohos-typescript/recoverable-language-service.ts#L18)、[ownedDocumentRegistry](../../src/semantic/backends/ohos-typescript/owned-document-registry.ts#L13) |
| 实际固定compiler | `node_modules/typescript/lib/typescript.js`：createTypeChecker45964、createProgram107890、synchronizeHostData124351、版本提前提交124360、Program赋值124460、checker调用124465 |
| 观测与构建 | [semantic-worker-progress](../../src/semantic/semantic-worker-progress.ts)、[compilerObservedSource](../../scripts/compiler-observation-plugin.mjs)、[诊断构建复用](../../scripts/bench/query-layer-worker-build.mjs) |

`checkerStarts/Returns`是checker**工厂**的进入/正常返回，后续类型计算可能在semantic-query中发生。
同步、Program返回、checker工厂返回、最终输入证明和READY各有不同边界；本轮没有给checker内部所有CPU工作细分耗时。

### 环境和普通Photos计时

Photos来自`applications_photos@a2c993829c46d965abefc5d2143187fa54fa4604`的隔离副本，574跟踪输入、288磁盘源码。
288不是实际Program成员计数；本轮未记录各Photos Program的成员文件数，不据此分析规模复杂度。
Mac使用1670项API24/6.1.1.125声明快照；Windows使用1674项同版本声明目录。
Mac v8正常样本plain19/20/21，Windows v8正常样本plain1/2/3；每轮新进程/新索引目录、顺序执行三个固定成员的五种状态。
Mac为Intel i7-9750H/16GiB、Darwin25.6.0；Windows为i5-7300HQ/16GiB、Windows10.0.19045，两端均Node20.19.5。
Mac检查使用pnpm8.15.9；Windows直接运行逐文件核对的bundle，依赖复用既有隔离checkout，本轮未重新安装。
普通轮没有诊断预加载；Mac测量时没有并行运行check:fast/GC诊断。每轮从新进程启动；first-open发生在该轮初始化终态后，不保证目标Program全冷，OS页缓存未清空。
操作计时为LspSession.request调用前到收到完整响应，未重新操作Zed UI，也不是键盘到像素时延。
repeat为热态重复请求，不宣称独立结果缓存命中；Program/AST复用与结果缓存命中不能混为一谈。

各状态n=9，覆盖三个成员各三轮；逐目标n=3中位数/最大值见`measurement-summary.json.perTarget`，逐次见CSV/原始帧。
所有90次目标成员文本校验通过，所有正常轮均1个语义Worker、0次恢复，服务进程退出0，源码/SDK/runtime前后SHA不变。

| 平台 | 状态 | n | 中位数ms | 最大ms | >500ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Mac | first-open | 9 | 242.000 | 355.005 | 0 |
| Mac | repeat | 9 | 216.193 | 263.975 | 0 |
| Mac | edit-overlay | 9 | 247.330 | 255.517 | 0 |
| Mac | after-edit-repeat | 9 | 124.224 | 128.534 | 0 |
| Mac | close-reopen | 9 | 238.524 | 249.540 | 0 |
| Windows | first-open | 9 | 466.953 | 711.394 | 3 |
| Windows | repeat | 9 | 330.490 | 455.099 | 0 |
| Windows | edit-overlay | 9 | 473.264 | 945.485 | 4 |
| Windows | after-edit-repeat | 9 | 282.079 | 373.985 | 0 |
| Windows | close-reopen | 9 | 481.010 | 884.485 | 3 |

初始化计时从initialize发送前到semanticPreparation终态：Mac中位数17470.181ms、最大17862.001ms；Windows中位数35458.127ms、最大36295.115ms。
六轮均为自然degraded，报告2307：`@ohos.filemanagement.userFileManager`无法解析，coverage=null/readyCapabilities为空。局部定义正确不证明整个项目READY。
v8正常查询Mac为0/45超过500ms，Windows为**10/45**；全部逐次数据保留，没有剔除Windows第2轮。
其中最大为Windows第2轮第3步，`common/src/main/ets/default/view/browserOperation/ThirdDeleteOperation.ts`，
`callback`，0基(33,10)，version2，edit-overlay，**945.485ms**；同轮关闭重开为884.485ms。
所有慢项的文件、位置、版本、顺序见`slow-operations.json`和`photos-operations.csv`，具体编辑见各轮report.edits/原始帧。
这些均发生在0次Worker恢复的普通轮；本轮未测它们各内部阶段的独占耗时，也没有CPU/IO/GC对照，不能把波动归因于某一阶段。
V2–V7普通轮及所有失败样本均保留；不同轮次时延变化不当作本轮活性修复的性能收益。

Mac首批plain1/2/3及probe1因计划SHA不匹配，在查询前拒绝（0次有效查询），错误样本保留。48个固定成员计划在Windows为CRLF、Mac为LF；仅调整offset/SHA后，符号及LSP行列相同。
跨副本288份源码均仅行尾不同，另有1个非源码图片路径字符差异，未在本轮追查其导出原因；完整输入清单保留。不得称两系统全项目字节一致，也不跨OS推测时延归因。

### 默认预算的受控故障和资源

以下不是500ms性能PASS，故障仅在独立预加载器注入。普通计时与插桩计时分开。

| 平台 | 活动checker取消→唯一终态ms | 无取消的请求发出→截止终态ms | 恢复后同输入查询ms（取消/截止两例） | 物理语义Worker |
| --- | ---: | ---: | --- | --- |
| Mac | 1003.105 | 30129.342 | 693.575 / 661.642 | created→exited→created→exited，峰值1 |
| Windows | 1012.680 | 30142.103 | 741.644 / 755.785 | created→exited→created→exited，峰值1 |

活动故障的共享计数为Program进入2/返回2，checker进入2/返回1，phase=checker，直接否定“没有observed就证明createProgram没完成”的推断。
恢复中配置/文档诊断在Mac和Windows v8均验证：替换者启动暂停时发送新SDK与未保存文本，恢复后的definition指向新SDK声明，显式准备READY，关闭退出0。原始帧在`configuration-recovery-darwin-7/`和`windows-v8/configuration-recovery-win32-1/`。

独立probe轮100ms采样，RSS按整个语言服务器进程统计一次，包含其所有线程；isolate heap各自统计，不能把不同时间峰值相加。

| 平台 | 进程RSS观测峰值MiB | 主isolate heap峰值MiB | Worker isolate heap峰值MiB | 关闭后退出前RSS最后样本MiB |
| --- | ---: | ---: | ---: | ---: |
| Mac | 778.930 | 9.940 | 639.443 | 104.234 |
| Windows | 737.020 | 10.173 | 656.567 | 40.902 |

这是观测峰值，可能漏掉100ms内瞬时峰值；没有测空闲稳态平台、原生索引RSS/PSS、SDK独占内存或长期泄漏趋势。
两端probe均只创建/退出一个语义Worker，最终live=0；原生索引各一个PID，退出0。Worker.terminate的线程exit1为预期，服务进程退出0，不能把它记成服务崩溃。
正常probe共16次Program进入/返回、16次checker工厂进入/返回、71次LS同步进入/返回；这些不是parser次数，也不能从汇总数推算每请求SDK复读。

Mac和Windows各运行失败构建GC与成功对照：第一次部分失败后，项目租约0、项目AST弱引用存活0、Program0；成功对照正常持有项目租约3/AST3/Program1，退休后均0。
三次注入故障后后续构建成功，退休检查点项目资源仍归0，SDK独立pin保留。部分Host/LS轻包装在诊断重复包装回调下暂存，后续上下文替换后可消失；不据此宣称所有JS对象立即回收或产品永久泄漏。
关闭检查不再有MessagePort/ProcessWrap，仍观察到诊断/定时器包装；最终进程正常退出。详见Mac `*-probe-final7/checkpoint-*.json`、Windows v8 `*-probe-final6/checkpoint-*.json`及`lifecycle-summary.json`，不把RSS下降等同于租约正确结清。

### 两端真实Photos受控卡住

完整SDK/Photos上的附加故障试验没有改产品参数或磁盘源码。先打开上述ThirdDeleteOperation.ts，再发送同SDK配置刷新、prepare:false屏障，注入checker bind不返回，发definition并真实取消。
中间v3的Windows首轮等待恢复仅10s而失败并关闭会话，保留`windows-v3/photos-fault-win32-1`，不算恢复通过。
后续诊断等待45s覆盖产品原有30s预算，并启用已有队列追踪；v8两端均只恢复一次，旧线程先退出再创建新线程，峰值1，关闭后剩余0。
证据确认实际卡住的是后台**diagnose**（epoch1/Worker请求3），definition尚排队；取消definition的终态为Mac1.520ms、Windows2.525ms，没有因此杀掉另一个活动命令。
默认执行截止判定记录Mac30011.994ms、Windows30004.101ms，均为phase=checker，Program9进入/9返回、checker9进入/8返回。
监督判定到输入重放完成的日志区间Mac1837ms、Windows1818ms；它包含旧线程退出、退避、创建和重放，不与请求耗时作为互斥分段相加。
同输入恢复后首个定义正确但耗时Mac**4738.574ms**、Windows**7570.391ms**；随后另外两组首次打开分别为Mac**1484.475/1442.095ms**、Windows**3321.123/3263.847ms**。
Windows另有538.375/561.704/560.570/544.885ms操作，逐项文件、位置、编辑和顺序见原始report和`lifecycle-summary.json`。
这些故障后的冷查询单独保留，不能混进两端正常90次查询，也不能排除后宣称全部≤500ms。代码路径明确恢复只重放输入，随后需要准备私有派生状态；各SDK/Program/核验阶段的独占占比本轮未测。
此附加例验证受控故障恢复，不证明原现场无限循环已复现，更不证明缓存或规模问题已优化。

## 改动边界与剩余风险

可审查边界为三个相互依赖的部分：失败LS与Registry owner清算；父端监督/单一恢复策略/重放及取消所有权；
实际compiler工厂观测与生产/诊断构建一致性。对应公开LSP回归、默认参数诊断和本文证据一起保留。
不单独回滚预算而保留mutation或fatal的另一条无限重启入口；若回滚本轮监督，按这组三部分核对调用点，保留前轮路径修复和缓存TODO。
产品仓库没有创建提交、推送、合并、发布或修改真实Photos源文件。起始dirty diff、最终772输入源码快照和候选diff区分本轮与既有工作。
Windows临时副本为既有fixture输入核验建立独立的空validation提交；它只是测试身份，实际产品版本由源码/bundle SHA确定，不冒充主分支提交。

Worker隔离只回收线程的JS堆；共享进程仍可能被native阻塞、进程级OOM或abort影响，本轮没有这些强保证。
恢复会失去旧isolate私有Program/AST派生状态，这是当前恢复后的冷查询成本；正常路径继续复用，不主动优化此前暂停的缓存/规模问题。
半开恢复仍受3次/180s限制，真实输入改变不等于立即绕过频率预算。后台诊断和状态读取不能当修复信号。
共享phase/counter为采样观测，不是全部字段的事务快照；checker工厂返回不证明之后的类型计算结束。
原Windows无限循环及OOM、自然完整项目READY、2万文件和长期内存增长仍未闭环；不能用本轮288磁盘源码的局部定义测试替代。
遗留大文件为`typescript-language-service.ts`3096行、`legacy-semantic-engine.ts`785行；本轮未增加新超限源/测试/脚本文件。

## 复现与证据

```sh
export PATH=/Users/liuhui/.nvm/versions/node/v20.19.5/bin:$PATH
pnpm check:fast
node --test --test-concurrency=1 tests/semantic/failed-build-recovery.test.mjs tests/semantic/unresponsive-worker-recovery.test.mjs
node .bench/worker-liveness-20261024/controlled-lsp.mjs cancel 100
node .bench/worker-liveness-20261024/controlled-lsp.mjs deadline 100
node .bench/worker-liveness-20261024/photos-validation.mjs plain 100
node .bench/worker-liveness-20261024/photos-validation.mjs probe 100
node .bench/worker-liveness-20261024/photos-fault-validation.mjs fault 100
node .bench/worker-liveness-20261024/configuration-recovery.mjs 100
python3 .bench/worker-liveness-20261024/summarize-results.py
python3 .bench/worker-liveness-20261024/summarize-lifecycle.py
```

Mac SDK默认复用`.bench/mac-photos-v1/sdk/openharmony`的声明快照，Windows默认API24声明路径；
可显式设置PHOTOS_SDK/PHOTOS_WORKSPACE。Photos隔离快照及固定查询计划随证据保存。
Windows使用同bundle/测试/驱动的逐文件SHA核对、固定Node20.19.5、独立目录，不覆盖默认安装或真实项目。
每个诊断trial使用尚不存在的输出目录；重跑时改用新的编号，避免覆盖原始证据。
Windows后验进程清单无本候选遗留Node/索引进程，真实Photos `git status --porcelain`为空，见`windows-v8/windows-postflight.json`。
Mac真实Photos已跟踪内容相对HEAD无差异；后验见两个未跟踪`.DS_Store`，原样保留且不归因，见`mac-original-photos-postflight.json`。
本阶段未做Mac原树的完整起始清单，不由后验结果声称原树全量字节初末一致；隔离测试副本已逐项核对。

`sources/`含官方来源原件；最终`windows-v8/windows-lsp-runs/`含公开回归逐次生命周期/结构化日志，早期`lsp-runs/`按轮次保留；`controlled-*`含默认截止下逐帧原始记录；
`photos-*`含逐次耗时、完整帧、编辑内容、输入前后SHA及自然状态；`check-fast-final.log`含完整最终检查。
最终归档与校验和在本报告最终结果段记录。`.bench`不纳入Git，需保存归档以保留原始证据。


## 最终验收与封存

- 最终v8：完整`pnpm check:fast` 1984/1984 PASS，零fail/skip/cancel/todo，退出0；焦点合跑73/73，Windows公开回归50/50。
- Mac串行验证10条、Windows串行验证11条命令全部退出0；三轮普通Photos共90次定义结果校验正确，所有慢样本保留。
- 772项源码和76项正式生产产物检查前后SHA一致；四个生产bundle、70份标准库及两个manifest均包含。Windows994项传输输入初末一致。
- 原83项目录清单混入7项非生产生成物，其中SDK测试driver由`tests/sdk-discovery.test.mjs:12–21`在测试时重建，1项SHA变化。
  已保留83项初末清单、原文件及完整diff，未将它们全部记为一致。该driver不在`scripts/build-runtime.mjs`的生产入口中，
  差异是它从旧helper变成最终v8的path.resolve；生产4个bundle在测量前已包含此修复并始终一致，源码没有修改。
  正式产物清单由构建入口和标准库manifest确定，详见`runtime-production-classification.json`、`final-production-runtime-{before,after}.json`。
- Rust路径合同焦点1/1 PASS、相关release sidecar构建成功。未运行独立large、sealed-artifact或完整real-sdk矩阵；真实SDK/Photos验证范围见上文。
- 455文件冷目录3秒门槛由用户授权排除，本轮未执行、不记PASS；缓存性能TODO继续暂停。没有提交、推送、合并、发布或更新默认Zed安装。

[证据索引与复现](../../.bench/worker-liveness-20261024/EVIDENCE.md)、
[最终检查原始日志](../../.bench/worker-liveness-20261024/check-fast-final.log)、
[逐次操作CSV](../../.bench/worker-liveness-20261024/photos-operations.csv)、
[生命周期汇总](../../.bench/worker-liveness-20261024/lifecycle-summary.json)。
完整[证据归档](../../.bench/worker-liveness-20261024-evidence.tar.gz)与
[SHA256文件](../../.bench/worker-liveness-20261024-evidence.tar.gz.sha256)一起保存；`.bench`未纳入Git。
最终源码/新增测试/构建输入在归档内`final-source-snapshot.tar.gz`，文档在`final-docs-snapshot.tar.gz`，
`candidate-tracked.diff`/`candidate-status.txt`和起始快照保留工作边界；`archive-file-sha256.json`核对归档成员。
Windows独立原始归档SHA256：`69612b2011b37fe46d8bac9b9c814356e3af9c1e8fa3b4c1e5b0961ad6225e56`。
