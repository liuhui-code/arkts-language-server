# Windows definition 阻塞与 Worker 生命周期：补充诊断

日期：2026-10-24（Asia/Shanghai）。这是对“每次跳转均重建、90秒超时、RSS上涨”的新增诊断，
不将前次15项异常恢复GREEN当作同步永不返回的覆盖。
本轮没有修改产品源码或仓库测试，没有提交、合并、部署默认Zed安装；缓存性能TODO继续暂停。

本文保留修复前诊断。后续实施的父端截止、受限恢复、实际compiler阶段观测及最终回归见
[监督恢复实现报告](2026-10-24-worker-supervision-recovery.md)；不以新候选的GREEN改写本页的原始失败和未复现边界。

## 当前能够确认的结论

1. **同步回调不返回时，现有取消只有合作式信号，没有父线程的独立取消宽限/执行截止守护。**
   在Mac和Windows都能用公开LSP复现：取消活动definition后1.2秒仍无终态，下一请求排队；
   手动解除测试暂停后才能结束。关闭会话则可终止该Worker，Windows约1141ms、进程exit0。
   这证明无响应构建的活性缺口，不证明真实项目存在同一种解析死循环。
2. **本次未复现用户所述的无限物理Worker重建、90秒超时或OOM。**
   当前候选Windows Photos的9次有效定义和3次缺失模块定义均完成。
   每场仅1个物理Worker；没有recovery/recycle事件。不能因此否定另一安装、项目或查询目标的现场。
3. **prepared/observed为false不能定位createProgram之前。**
   本次分别在roots读取、module resolution和checker处受控暂停，实际Program enter/return为0/0、
   1/0、1/1，活动查询都无法完成。相同外部症状可以落在三个不同边界。
   未直接采集用户现场三个flag，不把故障注入当成现场栈。
4. **当前恢复上限还有适用范围限制。** 3次/180秒是频率限制，不能阻止每90秒一次的长期失败；
   mutation的restart-required还直接进入recover，未经过该fatal计数分支。
   这两点有源码依据，但本轮未将其证明为用户现场的触发原因。

## 版本、环境和输入

- 本地父版本：e35459131366a32c48c10d1d74adef74357cd3dc；
  分支fix/windows-path-identity-20261022，含上一轮未提交的路径修复及ADR0020恢复候选。
  本轮src/tests/scripts/config/crates共761项初末指纹相同。
- Windows10 10.0.19045，Node20.19.5，ohos-typescript4.9.5-r10。
  compiler SHA256：af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc。
- 实际候选server.cjs SHA256：b4fe3cc36bda754a20d0cbfdb7b9b4be751f88e94cff4c4c7680862e3e3bc62b；
  semantic-worker.cjs：46ea6f13660d0a59480155d8ab022f168be1d89c3bf85698a52597c955d49735。
  均与本地当前构建逐字节一致，不用父提交号冒充dirty工作区的内容身份。
- Windows诊断目录：D:\code\arkts-definition-stall-20261024。
  node_modules junction和native exe取自此前独立路径修复checkout，不改默认安装。
- Photos为原项目a2c993829c46d965abefc5d2143187fa54fa4604的git archive隔离副本，
  共574个跟踪文件，其中288个.ets/.ts源码（排除.d.ts）；真实Photos结束时git status干净。
  每场隔离副本初末所有文件SHA一致。这不是2万文件实验，也不含未跟踪/忽略的本地依赖。
- SDK：D:\DevTools\sdk-declarations\openharmony-api24-6.1.1.125，API24 declarations-only。
  记录结束后1674项SDK指纹；本轮没有起始清单，因此不能单靠结束清单宣称本轮SDK初末逐项核对。
  初始化自然degraded/dependency-inputs-incomplete，缺失@ohos.filemanagement.userFileManager；
  没有补stub伪造READY。
- 默认运行期预算4096MiB，未加堆上限或强制GC。只配置SDK、native、隔离索引/日志目录；
  probe场额外启用计数/队列日志与测试预加载器。

连接到的默认Windows checkout是a111235bc4bfcb55b126752f95b3ba095f2996af，
其Worker字节身份与候选不同；默认Zed及LS日志结束于2026-10-18。
不能将它们称为用户最新90秒故障的原始日志。先前15/15 Windows回归也只在隔离目录执行，
并未更新默认Zed安装。本轮没有可与转述对齐的最新现场版本、wire及连续内存数据。

## 实际调用链与flag含义

| 边界 | 本轮源码位置 | 实际作用 |
| --- | --- | --- |
| 公开definition | src/lsp/run-language-server.ts:485 → SemanticRequestRunner.run:104 | 文档/磁盘权威与请求新鲜度；连接取消token |
| Worker入口 | src/semantic/semantic-worker-proxy.ts:260 → workerDocumentRequest:8 | 同一父线程owner；转交初始化join和取消signal |
| 初始化join/发送 | worker-project-preparation.ts:55 → semantic-worker-recycle.ts:40 | 普通查询先等该根初始化；recover进行时等重放事务 |
| 排队/派发/取消 | semantic-worker-supervisor.ts:232、303、533 | 活动查询的cancel只改SharedArrayBuffer；不立即settle，不安排强制终止计时 |
| Worker执行 | semantic-worker-runtime.ts:313 → legacy-semantic-engine.ts:315 | define先查询稳定组；结果为空时再查询完整作用域 |
| 准备/租约 | core/types/type-engine.ts:199、231、284 → semantic-query-lease.ts:14 | prepare更新Host输入；实际同步查询期间一直持有context lease |
| LS同步 | typescript-language-service.ts:725 → recoverable-language-service.ts:48 | getProgram独立异常边界；仅在返回/抛错后能运行catch/finally |
| 固定compiler | node_modules/typescript/lib/typescript.js:124351 | synchronizeHostData提交lastProjectVersion、读Host与校验旧Program，再调用createProgram和checker |
| 正常回收 | coordinator/semantic-coordinator.ts:185 | 仅未被使用的leaseCount=0 context可淘汰；正在构建不能在栈内拆掉自身 |
| 强制退出 | semantic-worker-host.ts:143、159 → semantic-worker-shutdown.ts:4 | 替换/关闭不要求曾成功观察Program；等退出后才完成替换 |

OfficialReadinessState.prepare在typescript-semantic-readiness.ts:72先clear，
等整个prepareOfficialReadiness返回后才提交programPrepared；内部onProgramPrepared还在
getProgram及getTypeChecker之后。因此false也可能表示尚未调用、缺输入提前返回、调用中、
checker中或后续校验抛错，不能当成“编译器尚未开始构建”的证明。

hasObservedProgram在typescript-resident-reference-state.ts:42表示持有输入证明，
不是线程生命状态。typescript-language-service.ts:342将它用于已准备编译器状态的优化判断。
压力淘汰和shutdown没有把它当成释放前提。本版本也没有转述中同名的prepared/built/observed
三元组recover-skip日志，须用实际日志的函数和版本对齐。

semantic-worker-recycle.ts:111的recover只失效旧输入证明、replaceWorker、重放roots/配置/overlay、
flush和健康围栏；它**不调用prepare，也不以hasObserved=false跳过终止旧Worker**。
后续查询可能重新准备，与物理Worker替换、LS创建及Program更新是三种不同事件。

源码中没有90秒请求截止。测试工具的响应等待超时也不等于语言服务器已取消/停止计算。
如果编译器持续同步运行，Worker内timer和普通消息不能替代父线程守护。
Node20的terminate返回退出Promise，正确替换须等该Promise完成。
参见[固定版本Node Worker文档](https://nodejs.org/download/release/v20.19.5/docs/api/worker_threads.html#workerterminate)。

## 最小受控验证

使用真实子进程、Content-Length stdio，先令SDK覆盖不足使初始化正常degraded，
再在LS Host/compiler边界受控暂停；暂停不检查产品取消cell，模拟不合作同步调用。
每场先发活动definition，再发同位置第二条definition，取消两者，1.2秒后检查终态。
第二条因同lane请求使第一条superseded；wire中的活动响应在解除暂停后为[]，
排队请求为-32800。该取消fallback差异已保留，不能伪报两条都立即返回-32800。

| 暂停处 | 到达暂停时实际Program enter/return | 取消1.2秒后活动请求 | Windows解除暂停后关闭 / 保持暂停关闭 |
| --- | --- | --- | --- |
| getScriptFileNames（createProgram前） | 0/0 | 尚未结束 | 23.011ms / 1141.341ms，均exit0 |
| resolveModuleNames（createProgram内） | 1/0 | 尚未结束 | 23.135ms，exit0 |
| getTypeChecker（createProgram已返回） | 1/1 | 尚未结束 | 47.936ms，exit0 |
| 健康对照，3次同位置definition | 共1次enter/return | 均正常完成 | 22.058ms，exit0 |

Mac重复运行得到同样活动请求不终止现象；保持暂停直接关闭为1128.603ms。
每场只有1次Worker started，无recovery。fixture只用Atomics等待，没有制造堆增长，
所以不把它当成RSS泄漏或真实module resolution死循环的复现。
初版driver错误要求活动请求也返回-32800而失败，原始trial1保留；校准后trial3不更改原始数据。

## Windows Photos逐次结果

每场新语言服务器进程；普通场先运行，probe场后运行，未清OS文件缓存。
因此只能称进程冷启动，不能用初始化48910.553ms与35106.280ms之差估算插桩开销。
计时为发请求至收到完整响应，不是Zed键盘/鼠标到像素；未重新操作Zed UI。

| 文件/符号/零基位置 | 前置状态 | 普通ms | probe ms |
| --- | --- | ---: | ---: |
| common/.../ThirdDeleteOperation.ts callback 32:10 | 首次打开 | 182.824 | 205.589 |
| 同上 | 重复 | 326.214 | 334.727 |
| 同上 | 关闭重开 | 338.561 | 365.035 |
| feature/browser/.../RenameMenuOperation.ts menuContext 33:10 | 首次打开 | 446.303 | 475.115 |
| 同上 | 重复 | 282.206 | 284.298 |
| 同上 | 关闭重开 | 499.322 | 511.322 |
| feature/editor/.../PcMainMenuBar.ets selectedMode 36:16 | 首次打开 | 481.921 | 511.940 |
| 同上 | 重复 | 263.578 | 289.941 |
| 同上 | 关闭重开 | 476.425 | 493.070 |
| common/.../AlbumDefine.ts @ohos.filemanagement.userFileManager 14:30 | 首次打开、目标缺失 | 未测 | 528.513 |
| 同上 | 重复、目标缺失 | 未测 | 452.641 |
| 同上 | 关闭重开、目标缺失 | 未测 | 823.699 |

完整路径、请求顺序、打开/关闭帧、源码SHA和精确params均在各场report.json/wire.ndjson。
没有编辑/重命名源文件。前三文件返回实际位置；缺失模块三次均[]，不能称为成功跳到目标。
单轮逐次值不冒充多轮中位数或长期稳定性。超过500ms的probe样本原样保留。

有效目标probe场：创建1个Worker、8个LS，总计13次实际Program enter/return
（包括初始化、诊断和关闭重开，不能全计给9次用户请求）；Host回调31651次enter/return。
缺失模块probe场：1个Worker、8个LS，Program enter/return为10/10，Host回调25558/25558。
该场3次公开请求产生6个definition callback：组查询无结果后走完整作用域。
组Program含138个项目文件、279个SDK文件、530个总文件；
完整作用域Program含283个项目文件、305个SDK文件、701个总文件。
前两次的两个callback均无新增createProgram事件，关闭重开才在两个owner各更新一次。
初始化8个LS不等于重启8个物理Worker，重复prepare/getProgram也不等于每次新建Program。

probe主进程每500ms采RSS，口径包含同进程全部Worker，**不相加线程RSS**，不含native sidecar，
不是全进程树内存峰值。有效目标场观测峰值719.672MiB，最后操作附近718.566MiB，
Worker退出事件附近39.602MiB；缺失目标峰值718.523MiB，最后操作附近714.469MiB，
退出事件附近39.816MiB。有限采样可能漏掉短峰值，普通场没有同口径RSS采样；
没有长时间soak/heap retainers证据，不据此宣称不存在其他内存泄漏。
统计定义参见[Node20 memoryUsage](https://nodejs.org/download/release/v20.19.5/docs/api/process.html#processmemoryusage)。

## 最小修复建议和未闭环项

以下为后续修复边界，**本轮未实施**：

1. P0：父线程独立管理活动工作/排队、取消宽限及明确操作截止；超限先围栏旧epoch，
   再终止并等待旧Worker退出。不等prepared/observed或Worker自行处理shutdown消息。
   初始准备与交互请求应有明确不同预算，不能将未证明来源的90秒常量直接抄进所有操作。
2. P0：fatal、超时/无响应、mutation restart-required统一进入恢复策略。
   除频率上限，还要限制没有实质成功构建/查询之间的连续失败；
   recovery.complete、prepare:false或skip都不能解除连续失败围栏。
   必须避免迟到的旧请求超时再击穿正在进行的恢复，不重放已经终态的客户端请求。
3. P1：对真实卡住的Windows版本，用父线程可读的进度计数区分同步前、Program内和checker后，
   再取得对应Host参数/解析链与采样栈。当前progress-probe已提供共享计数，
   即使Worker不让出事件循环，父线程仍能观测最后活动回调；缺少现场栈时不改路径或解析算法。

建议回归包括冷构建不返回、热更新不返回、取消/关闭、旧Worker退出后才能启动新Worker、
多根同Worker、最新overlay重放、每隔90秒失败仍触发连续失败熔断，以及prepare:false不伪造恢复。
RSS回落不替代退出事件、owner余额或堆引用证明。

## 复现和证据

本地目录：.bench/definition-stall-20261024/，全部为诊断脚本/证据，不跟踪入Git。
命令在Node20及已构建runtime下执行；trial目录须未存在：

    node .bench/definition-stall-20261024/stall-case.mjs roots replay release
    node .bench/definition-stall-20261024/stall-case.mjs checker replay release
    node .bench/definition-stall-20261024/stall-case.mjs roots replay-close close

Windows使用新的隔离root、与候选一致的dist/support/config及dependencies，先运行windows-setup.cjs
导出Photos副本，再在该root执行：

    node windows-run-diagnostics.cjs
    node .bench/definition-stall-20261024/photos-definition.mjs missing-probe replay

- windows-inventory.json/windows-processes-before.log/Zed-original.log/windows-server-original.log：
  可访问环境盘点及旧默认日志，不标为用户最新故障现场。
- windows-evidence/*/report.json、wire.ndjson、probe.ndjson/progress.ndjson、stderr.raw：
  逐次LSP、状态、Program/Host计数、进程RSS及退出记录。
- windows-diagnostic-evidence.tar.gz：首批Windows原始封存，含Photos源快照；
  windows-diagnostic-additional-evidence.tar.gz：缺失模块场景、更新后的driver及SDK/环境指纹。
- 本地controlled-run-results.json/controlled-repeat-results.json：
  包括校准失败，未只留通过样本。
- source-before.json及最终verification.json：确认本轮产品输入未改。

未重跑pnpm check:fast，因为本轮产品源码和仓库测试字节未变；此前1969/1969仅证明前次候选的
既有覆盖，不能当作本轮“同步永不返回已修复”。455文件冷目录门槛继续按用户授权排除。
