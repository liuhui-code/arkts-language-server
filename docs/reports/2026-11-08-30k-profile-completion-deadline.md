# IDX-V1-SCALE-003：30K依赖组暖态插桩补全触发产品截止

状态：OPEN / P1，2026-11-08。实际失败，不计性能通过；Photos7200秒仍未开始。

## 已确认的直接原因

运行源码/SDK/运行包与最终2406/2406候选相同；父298d，候选完整79资产，Native6553ab87。
生成夹具 `final-acceptance-10/fixtures/dependencies-30000`：30000项目源码、32扇出树状依赖，
目标Main.ets第2行character56（零基UTF-16）成员补全；查询前仅打开Main，执行首次及重复定义。
没有编辑、撤销、保存或重命名；这是新进程、保留上一冷会话的应用索引，不是同Program暖开。
本次有ARKTS_REFERENCES_TRACE=1及Native只读tee，必须与普通计时分开。

| UTC时间 | 实际事件 |
| --- | --- |
|14:18:53.237|PID60551，semantic Worker epoch1/thread1启动|
|14:19:26.386|首次定义完成；Program项目30000、SDK256、其他113；项目roots256、SDKroots2|
|14:19:34.671|重复定义完成，同Program对象序号1|
|14:19:36.344|公开LSP id4 textDocument/completion发出|
|14:19:36.345–.346|父端入队trace5、发给Worker request5；admission→send0.486ms|
|14:19:36.346|Worker接收→dispatch0.433ms，执行complete|
|14:19:36.373|prepare9.904ms完成，resident proof因inputs-incomplete拒绝（正常受限资格路径）|
|14:20:06.295|又一observe阶段proof拒绝，尚未产生终态|
|14:20:06.373|父端watchdog：execution-deadline，limit30000ms，sent以来30025.731ms|
|14:20:06.477|公开id4返回-32603，`Request textDocument/completion failed with message: Semantic worker unavailable`|
|14:20:07.857|服务shutdown；随后实际code0、无保护强杀、DB后检PASS|

LSP整体30132.053ms；该次**不是**SCALE-002的19秒前台排队：入队发送几乎立即完成。
计时来自不同观测区间，不能把Worker dispatch延迟、prepare、watchdog窗口重复相加。
终止前program starts/returns=4/4、checker=4/4、sync=19/19，phase=request，terminalState=none。
这反驳“Program未返回所以卡死”的简单推断；完成compiler调用不等于公开请求已完成。
不能从这些计数得出本次补全单独构建4次，它们是共享进度累计值。

父端 `src/semantic/semantic-worker-watchdog.ts:21,97–140` 使用现有30秒普通请求绝对执行截止；
该判断没有因活跃activity延长普通执行时限。检测后调用failed回调，由supervisor结清请求/隔离该代。
`src/core/types/typescript-language-service.ts:370–401` 的补全入口执行官方getCompletions、输入核验、
resident capture，再处理候选；`src/core/types/type-engine.ts:228–250`还在trace模式观察Program。
没有完成事件/CPU调用栈，尚不能把30秒归入上述哪一段，更不能把trace额外成本或GC推测写成结论。
本会话只观察到epoch1启动；没有后续新查询，未验证其恢复/重建结果。

## 环境、资源及独立控制

后取完整pmset日志并按会话14:18:53.053–14:20:10.705UTC核查：**无系统Sleep重叠**。
不是ENV-004的合盖中断。没有OOM/崩溃证据，也没有测试外部45秒保护触发。
每PID一次的RSS峰：Node1780.02MiB、Native117.57MiB、树1931.98MiB（含tee）；
Worker线程RSS包含在Node内，不能再加一份。主进程heap与Worker局部heap也不混用。
Node超过2GiB测试停线仍豁免；此次未触及任何资源保护，未修改产品截止/V8/RSS策略。

两个受保护串行独立控制正在执行：同30K输入/SDK/查询顺序/保留索引/产物，仅切普通与trace，
不替换原FAIL、不改负载或时间阈值。普通控制首次补全已PASS23948.4ms，仍属严重慢响应；
全部17操作及trace控制结果待终结后补录。一次普通通过不能证明trace是唯一根因。

## 对本轮验收的影响及边界

Round11在第20条新尝试（含2次唤醒重试）停止；两条旧版30K最后profile坐标未执行。
postflight守卫也停止，**没有继续启动density/Cargo/Photos耐久**。96普通会话完成状态未改变。
现有ADR0020监督恢复与ADR0027活跃任务不可抢占是相关合同，ADR0043的Native增量维护并不
承诺消除真实30K compiler依赖成本；当前尚未证明该失败是本特性引入，或与NativeGC有关。
不能把该失败降为完整引用/重命名的已知资格缺口，也不能放宽超时掩盖它。
下一步先完成两次有界控制、对齐内部阶段，判断需要进一步最小复现/剖析的范围，再决定续跑。

## 原始证据

`.bench/index-versioned-maintenance-20261104/final-acceptance-11/scale-runs/dependencies-30000-candidate-0-profile-warm/`
保留result.json、请求及压缩wire、stderr.raw（含error watchdog）、server.log、资源及SQLite后检。
`final-acceptance-11/execution.json`与`postflight.json`为实际停止收据；`warm-completion-deadline-20261108`
保留独立控制身份、命令及逐次结果。`sleep-interruption-20261108/power-after-profile-failure.log`是本次OS证据。

用户真实Photos、Zed窗口、真实缓存未修改；没有合并/发布或产品修复。

### SCALE003 paired controls have now terminated (no product change)

Same30K/SDK/runtime/cache/query sequence: ordinary17actions completed with8 known full-reference/rename gaps,
firstcompletion23948msPASS, NORMALclose/integrity. Trace control failed firstdefinition at~30.13s,
execution-deadline phase=program (3starts/2returns), whereas originalcompletionfailure was phase=request/allreturns.
Trace Nodepeak1394MiB, NORMALclose/integrity. Different observed phases cannot be unified without stack evidence;
a single pair cannot prove tracing is the only cause. Raw `warm-completion-deadline-20261108`.
Main24433, postflight51394, control51588 are all terminal; no active pressure load. Photos7200s NOT_STARTED.
Next narrow diagnosis must distinguish mandatory compiler work from optional Program-stats synchronization,
without threshold changes or speculative product fixes. Final2406/416 remains source-specific, not full acceptance.

### SCALE003 call-stack diagnostic (separate modified bundle, 2026-11-08)

Two exact wrappers instrument only compiler.getProgram and synchronizeHostData in a copied semantic bundle.
Original79-asset runtime and2384 frozen product sources unchanged. Injection guard tests2PASS; initial incorrect
absolute/relative runtime-copy input refused before load, then corrected. No product patch/rebuild/threshold change.
Context7 TypeScript resolve again failed transport; actual installed4.9.5-r10 and its bundled source are authoritative.
One protected run52680 failed firstdefinition~30015ms/NORMALclose/integrityPASS, not a new formal sample.
Required getDefinitionAtPosition preflight: getProgram27028ms includes sync27027ms. Later getProgram1.58ms
from definitionCandidates, residentcapture0.79ms, programStats0.995ms. No extra slow Program build fromstats here.
Compiler query callback28777.898ms includes groupedcreateProgram26408.986ms; these nested values MUST NOT sum.
Trace eventdefinitioncomplete at15:00:24.012Z and certification at.013; parentexecutiondeadline at.423 with all
Program/checker returns. Last statsgetProgram returned23.331Z, so remaining observation/event span~681ms, not27s.
Do not assign the remaining public-result interval to a specific finalfence/IPC stage without direct measurement.
`scale003-stack-probe/causal-evidence.json` retains full call stacks/inclusive timings and modified-bundle identity.
The slow extra-statistics-Program hypothesis is falsified in this sample; required real30K dependency compilation
is a major measured cost. It does not prove the exact same hot stage in earlier uninstrumented failures.

Independent original Photos30K slice14799 was then started on the UNMODIFIED79-asset runtime, exact preserved
30060 input identities and full original scenario matrix; it calibrates44targets before its own7200s formal phase.
SCALE003 staysOPEN, original profile/whole acceptance remainsFAILED/incomplete. This independent slice doesnot
turn a failed gate green or omit failing Photos scenarios; no realZedUI/Windows claim. Density/finalCargo stillpending.


## 2026-11-10 qualification of later probes

A later ordinary uninstrumented completion also failed, so this cannot be described as trace-only.
Some later diagnostic helpers disabled the use-strict directive (OBS-013); their raw logs remain but cannot
prove strict-equivalent behavior. Corrected observer and independent root-churn evidence are recorded in
[the current report](2026-11-10-30k-ordinary-completion-deadline.md). Historical failure evidence is retained.
