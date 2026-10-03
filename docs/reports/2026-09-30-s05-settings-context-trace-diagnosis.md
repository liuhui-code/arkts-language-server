# S05 Settings 混合回放：context/L3 trace 诊断（非性能门禁）

日期：2026-09-30，更新至2026-10-03。状态：**真实Settings空闲后indexed恢复已验证；S05尚未毕业**。
前半部分分析独立 experimental arm 的生命周期日志；后半部分记录同构建
phase trace和后续global→local scope修正的独立回放。trace-on的时延或RSS不能与
[trace-off 正式 A/B](2026-09-29-semantic-ready-s05-context-lifecycle.md)直接比较。
S05 仍 IN_PROGRESS；`ARKTS_SEMANTIC_SESSION_REUSE`默认off，S03仍BLOCKED。

## 冻结输入与原始证据

原始JSON：`.bench/semantic-ready-s05/settings-mixed-experimental-diagnostic-trace.json`，
SHA256 `6bbf6bc3bf26444459ffca72d006d6a882339bc5db61062a89dffadd302c141d`。
它保留完整LSP请求、versioned diagnostics、Location、structured server events、
外部RSS原始采样与timeline；下文统计都从这份本机文件读取。

| 身份 | 冻结值 |
| --- | --- |
| 仓库实际HEAD / Settings checkout | `911ae43c274175614559b63f0311504747d8393d`（dirty build） / `ecc550dfaed880e04e38a2477eb7235cd50475b9`（clean） |
| Node / OS | v26.3.0 / Darwin 25.6.0 x64 |
| SDK | DevEco OpenHarmony API24, 6.1.1.125；声明digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4` |
| manifest / schedule SHA256 | `309b92eb6fdb3f48872d7ba80dfe381adb0ec546d722ad9c53d00f1ee6865175` / `64c27ccc8e4d06078f723de67268af746403f6e170036d95b7073b4508b9e42e` |
| server / semantic worker SHA256 | `b7d3404a8a6f1ee05565a39370757a2445536c6e05a8f74bf9b7ec9ec2364977` / `aec33a87239a7e225d30aaf3299c47afdd760f110d3d6b15a89479e0680c0339` |
| verifier / sidecar SHA256 | `9db6259509197e46306e05ef3bf111eecfd1060393014f9a2b2e0c5bf47ab3b2` / `18f871605571c246ce5667f5aa65c9f4b3b851235c87ae83cf794fbb85adf6b1` |
| oracle SHA256 | `58908aa4ee2554864cd4467ccf7a51b3aa8e6dd570fc0f66decc6500bf7f937b` |

真实Settings的已打开consumer为
`product/phone/src/main/ets/Setting/Home/controller/HomePageMenuManager.ets`，
符号`HomeInitData`在zero-based UTF-16 40:37；声明在
`common/src/main/ets/sendable/HomeInitData.ets` 16:13，跨模块secondary光标
`common/index.ets` 284:23。工程声明compile23，使用本轮用户允许的API24兼容轨，
不声称API23或DevEco结果等价。原工程不改；runner在private no-hardlinks clone内
交替切换未打开声明文件顶部一行注释，不增加源码文件或改变module边界。

实际环境由runner固定：`ARKTS_SEMANTIC_SESSION_REUSE=experimental`、
`ARKTS_REFERENCES_TRACE=1`、`indexed-batched + closure + full SDK`、
`ARKTS_REFERENCES_CONTEXT_RETENTION=dispose`、`ARKTS_MEMORY_BUDGET_MB=1024`、
`ARKTS_BENCHMARK_CONTROL=1`；其它flag及启动参数在原始JSON的
`environment.effectiveArktsEnvironment`/`environment.launch`中冻结。
一次真实Content-Length/stdio会话完成100次磁盘编辑和立即primary definition、
11次9-location references与11次secondary definition、第50次Level3 pressure控制，
第51次精确恢复。状态PASS，全部URI+UTF-16位置和正常v1 TS2339/secondary空诊断
exact，原Settings clean，正常shutdown/exit0；不靠漏结果取得低内存。

## 日志与请求的对齐口径

按每条`requests[].startedAt/finishedAt`与`serverEvents[].ts`的wall-clock毫秒窗口
归属事件；边界同毫秒的事件可能有±1ms歧义，故只是诊断关联，不是compiler调用栈。
外部采样只统计目标Node PID一次，worker_threads已包含；请求50ms，实际1,058样本，
采样间隔中位125ms、P95 nearest-rank 140ms、最大232ms。Node peak RSS
2,533,834,752B；server+sidecar tree peak 2,724,982,784B。采样峰值是下界，
Mac RSS不是PSS或含Zed的产品内存，也未做GC/heap snapshot。
`contextSequence`只表示Coordinator的LS context生命周期，不是Program/Checker identity；
`semantic.context.reuse`是lease acquire次数，不等于用户请求数。

| trace事件 | 次数 / reason |
| --- | --- |
| `semantic.context.create` / `sdk.selected` | 75 / 75；create reason均`missing` |
| `semantic.context.reuse` | 183；只是acquire代理 |
| `semantic.context.evict` | 75：`memory-level3` 71、`content-revision-change` 3、`reference-dispose` 1 |
| `semantic.context.trim` | 3：均`memory-level2` |
| `references.index.fallback` | 5：均`workspace-changed` |

100个编辑后的primary definition中17个>500ms；按上述时间窗口对齐，
其中16个窗口包含`semantic.context.create`，另1个（op42）没有。
但**create不是慢的充分条件**：83个≤500ms的窗口中43个也包含create；
`memory-level3` evict在慢/快窗口分别出现14/17和41/83次。
op90–100仍频繁create/L3 evict，而primary definition约255–308ms。
因此日志支持“部分慢请求与context重建、L3压力并行出现”，不能证明
“每次context重建必然导致1.7秒”或“L3是唯一根因”。

| 代表区间 | 公共请求与外部RSS/事件观察 | 可得结论边界 |
| --- | --- | --- |
| op2–4 | primary definition约1.77/1.88/1.81s；窗口有create及L3 evict；op4完成RSS约600MB | 重建与慢请求同现；不等于证明Program冷建耗时占比 |
| op12–21 | 多数primary definition约1.59–1.62s；op20完成RSS约2.37GB，op21约2.52GB；期间反复create/L3 evict | RSS阶梯与反复回收同现；dispose不保证RSS立即回落 |
| op21 secondary | Node采样峰值2.534GB出现在跨模块secondary definition约2.14s窗口 | 峰值不能全部归给primary definition或references |
| op51–60 / op90–100 | 许多窗口仍create/L3 evict，primary definition多数约0.25–0.31s | 对“L3/重建本身足以解释所有慢请求”的反例 |

这份trace-on里11个references均完整，约5.2–8.2s；没有正式trace-off三次
约90s的`candidate-ineligible`异常值，只有5次`workspace-changed` fallback。
trace本身、运行顺序、进程与index时序均可能影响观察，不能据此说trace修复了
异常，也不能将trace-on的peak/median放入trace-off的≤1.10/P95门禁分母。

三个trace-off异常分别为off/op100 91.491s、experimental/op100 91.299s、
experimental复核/op81 94.060s，均返回9个exact引用。日志共同给出
`index.recovered`后`candidate-ineligible`：`supported=false`、`complete=false`，
但generation已ready且served=committed、无declaration identity。代码路径上，
[freshness](../../src/semantic/references/reference-index-freshness.ts)在committed generation
前进后清dirty；[candidate selection](../../src/semantic/references/reference-candidate-selection.ts)
拒绝不完整proof后返回无候选。此时proxy不设`forceLegacy`，执行器走完整合法
membership的**保守分批**，不是legacy。相同checkout的本trace-on记录
membershipFiles=1,496；按64 roots/batch和最多2个pinned roots约为24批，
这是[planner](../../src/semantic/references/reference-search-planner.ts)规则推导，
不是三个90秒请求的实测batch数（其trace-off报告无plan/batch事件）。
`workspace-changed`保持dirty而走legacy，故其5–9s不能直接与这一路由比较。
Rust返回`unsupported`的内部条件及每批真实耗时尚未定位；下一控制应冻结
同一generation并采batch trace，不能用截断引用或提高超时掩盖尾延迟。

代码可证机制：`sampleMemory()`用整个Node进程`process.memoryUsage().rss`
判定预算级别并调用`applyMemoryPressure`（[worker runtime](../../src/semantic/semantic-worker-runtime.ts)）；
L3滞回到目标比率见[memory policy](../../src/semantic/coordinator/memory-policy.ts)；
Coordinator对未leased冷context执行`dispose`并记录`memory-level3`，下次
`acquire`缺失则create（[Coordinator](../../src/semantic/coordinator/semantic-coordinator.ts)）。
相容磁盘delta仅允许跳过`content-revision-change` reset，不能绕过L3；
其判定见[reset guard](../../src/core/types/type-context-reset.ts)。
这些源码事实解释日志事件**如何发生**，并未证明RSS上涨由哪个AST/Program
或缓存持有，也未定量拆出createProgram/getTypeChecker/findReferences耗时。

## 同构建 phase trace：慢时间落在哪里

随后只增加默认关闭的 `semantic.prepare.complete`、`semantic.definition.complete`
观察事件，未改变默认复用策略、预算、worker数或语义结果。原manifest严格校验
semantic worker SHA；新构建首次回放被 `BENCHMARK_BLOCKED=SEMANTIC_WORKER_MISMATCH`
拒绝，故单独创建仅用于诊断的
[`settings-homeinitdata-mixed-ops-api24-phase-trace.json`](../../bench/references/manifests/settings-homeinitdata-mixed-ops-api24-phase-trace.json)
（SHA256 `a200247b1a4a7bc26afb38eba7c8f39e6b6a8a7d80c40c0502d1d9eef92dad9c`）。
它仍固定相同Settings checkout、API24 SDK、符号、oracle、100次操作schedule与
verifier/sidecar；server SHA为
`b7d3404a8a6f1ee05565a39370757a2445536c6e05a8f74bf9b7ec9ec2364977`，
semantic worker SHA为
`3c51d2c51810fef75f637e7ee3f253a16a8aff44b5745ebaeb0a7eeea00aa700`。
旧manifest和原始结果均未改写。

原始off报告：`.bench/semantic-ready-s05/settings-mixed-off-phase-trace.json`，
SHA256 `952ed1bc1dbd2615c754e84debb802997339e15655ff0c42c0f1fadb5aa7d7d2`；
experimental报告：`.bench/semantic-ready-s05/settings-mixed-experimental-phase-trace.json`，
SHA256 `3cd8a5b1678d6a4eaad37dff0cd4819958e8e134e8146ed5491f5cf6bacbd1e7`。
两个独立新进程按固定off→experimental顺序串行回放，均`PASS`：100/100个
真实磁盘编辑后的primary definition、11/11个9-location references、11/11个
跨模块definition、正常versioned diagnostics、第50次L3、第51次恢复、正常exit，
原Settings保持clean。目标PID外部RSS分别取得1,586/925个样本，最大间隙
281/184ms。

| trace-on指标 | off | experimental |
| --- | ---: | ---: |
| `entry.engine.prepare` n、median / P95 | 130；5.195 / 17.664ms | 133；0.238 / 15.997ms |
| primary definition LSP wall P95（100次） | 326.053ms | 1,584.529ms |
| primary `engine.define` P95 | 266.509ms | 1,532.712ms |
| primary wall >500ms | 2/100 | 11/100 |
| primary query后Program SourceFiles | 422 | 422或761；59/100次为761 |
| context create / evict | 119 / 119 | 45 / 45 |
| 外部Node PID sampled peak RSS | 1,668,087,808B | 1,339,621,376B |

这些数据把此回放的慢primary definition主要定位到`engine.define`区间，
**不是本次测到的`entry.engine.prepare`方法**。`engine.define`仍包含compiler
内部的Program/Checker及查询工作；当前事件不能将`createProgram`与
`getTypeChecker`各自拆分，也不代表LSP请求的全部准备步骤。实验arm跨模块后
primary Program从422个SourceFiles扩到761个，与部分中等时延同现；但最慢的
约1.6秒突发也发生在422文件组，且本次实验RSS峰值落在422文件的op25，
所以不能把时延或内存完全归因于文件数。off有更多L3 evict、primary却更快，
再次否定“只数L3次数就足以解释慢请求”。

本次trace-on峰值方向（experimental低于off）与此前trace-on控制
（experimental 2,533,834,752B；off 1,819,611,136B）**相反**；固定顺序、
trace开销、进程/index时序与采样扰动均未控制。不得从这两对推出复用能省内存
或必然涨内存。正式trace-off pinned A/B仍是experimental/off sampled peak
**1.600×**，超过`≤1.10`资源门禁；第二个仅experimental的独立复核没有配对off。
本诊断不改变S05 IN_PROGRESS、默认off与S03 BLOCKED。

先前生命周期trace的2.534GB峰值在op21 secondary definition；下一次
references请求约1.94秒后才开始，worker helper在返回前等待terminate。
因此该峰值不能解释为**当时仍在执行的**references verifier与interactive LS
叠加。近90秒引用尾延迟在正式trace-off三次均伴随`index.recovered`后
`candidate-ineligible`，它是candidate阶段`unsupported`，不是已经证明的
identity-binding失败；目标文件索引行过时尚属待验证假设。

## 后续 scope-restoration 切片：局部 roots 恢复，但资源门禁仍失败

在HEAD `911ae43c274175614559b63f0311504747d8393d` 的dirty tree上，
新公开LSP测试通过真实`dist/server.cjs --stdio`证明：experimental复用下，
局部definition的Program project roots原为2；一次完整legacy references之后变成3，
尽管definition与references的URI+UTF-16结果仍精确。RED后初版仅在默认关闭的
experimental分支，对完整legacy references查询结束执行Coordinator
`remove(..., "reference-global-scope")`，使下一次局部definition重建有界scope；
不裁剪合法references、不换worker、不改变诊断或预算。测试和相邻focused测试
18/18 GREEN；`type-engine.ts`改后496行。

新诊断manifest
[`settings-homeinitdata-mixed-ops-api24-scope-restoration.json`](../../bench/references/manifests/settings-homeinitdata-mixed-ops-api24-scope-restoration.json)
SHA256 `8009ac13a4492380df6af8032a8383c54843e4fba6bc45f2878a35bba442455b`，
固定同一Settings checkout、API24 SDK、oracle与100次schedule；server SHA仍为
`b7d3404a8a6f1ee05565a39370757a2445536c6e05a8f74bf9b7ec9ec2364977`，
semantic worker SHA改为
`74469c12637fbf4114c28c08326c125a88b89d2f7b14b04333a412b6c1e89e64`。
原phase manifest及结果保留，不跨构建做因果比较。

| 同构建trace-off、固定off→experimental顺序 | off | experimental |
| --- | ---: | ---: |
| 原始JSON SHA256 | `8b788426e01a207efcfcc27a2ec3642050b2c8fe0f8026bc647fc0e1dca0d4df` | `cd7f32587e1d58f4121d5fb2983e986d71d31cfa75a63f7c3a9bfbafc5946d09` |
| 100次primary definition P95 / >500ms | 312.328ms / 2 | 360.750ms / 5 |
| 最慢references | 93.260s | 88.654s |
| 目标Node PID sampled peak RSS | 1,274,720,256B | 2,290,962,432B（**1.797×**） |

原始文件分别为`.bench/semantic-ready-s05/settings-mixed-off-scope-restoration.json`
和`.bench/semantic-ready-s05/settings-mixed-experimental-scope-restoration.json`。
两臂均100/100 primary definition、11/11个9-location references、11/11 secondary
definition exact，正常versioned diagnostics、第50次L3、第51次精确恢复、exit0、
原Settings clean；目标PID分别1,541/1,520个连续样本，最大间隙369/285ms。
这是**一对固定顺序、非随机、无PSS**的trace-off对照，但experimental峰值已再次
超过≤1.10资源门禁；不能据此将scope修正毕业或宣称达到500ms产品目标。

另外一次独立experimental trace-on回放
`.bench/semantic-ready-s05/settings-mixed-experimental-scope-restoration-trace.json`
SHA256 `f0e2cad8efd55c5f2d77a70150c26d7e6f361e97e99414358d88c945e66981d5`
亦全部exact/正常退出。112个`semantic.definition.complete`事件中，101个primary
（初始+100次编辑）全部为`programProjectRootFiles=64`、
`programSourceFiles=422`；10个`reference-global-scope` evict可见，未再观察到
旧trace中primary扩到761个SourceFiles。这证明本切片**在该真实回放里**恢复
局部Program roots，不证明CPU/RSS会下降；该trace-on单臂不得与上表trace-off
RSS直接相除。两臂仍有约90秒的`candidate-ineligible`/保守分批尾延迟，
其索引目标行/拒绝分支尚未证明，不能归罪于本scope修正。

随后新增的公开安全反例证明，这个**无条件**移除并不正确：先让全工程completion
加载未import的全局`TargetType`，完整legacy references仍返回3个exact Location，
但移除已有完整membership的热context后，后续definition变成空集，v3正常诊断
出现TS2304。新测试
[`semantic-global-warm-reference.test.mjs`](../../tests/semantic/semantic-global-warm-reference.test.mjs)
先RED exit1；最小修正先读取请求前resident的membership状态，**仅当它并非
complete**时才在完整legacy references后执行`reference-global-scope`移除。
两项公开LSP测试2/2 GREEN，`type-engine.ts`改后499行。这样保留原本已加载
全局声明的context，同时仍防止局部context因一次引用搜索意外永久扩张。
此正确性反例不允许用“局部roots越少越好”覆盖全局语义真值。

上表Settings trace-off A/B、独立trace-on和scope-restoration manifest
**全部属于尚无该guard的旧build**；旧JSON与SHA必须原样保留，不可冒称新build
通过相同性能门禁。此前1.797×是旧build的失败证据，不是guarded build测量。

## Guarded build：一对新的真实Settings trace-off A/B

新manifest
[`settings-homeinitdata-mixed-ops-api24-scope-restoration-guarded.json`](../../bench/references/manifests/settings-homeinitdata-mixed-ops-api24-scope-restoration-guarded.json)
SHA256 `b8ab2bd2c5ca622a3c80abd2c9e62a5ff004189d55376e6e1c331a6802b043fa`
固定guarded semantic worker
`abc094157433ffe1be0206f77eebd565752021b24e2c7415a28b60201eb721b3`；
Settings checkout、API24 SDK、符号、oracle、schedule及其它产物身份保持独立锁定。
本轮按**experimental→off固定顺序**，各启动一个新进程/私有clone，均为
trace-off。不是随机顺序多轮，也没有当前guarded build的trace-on数据；
上一节101个primary均422个SourceFiles的trace只属于未guarded旧build。

| 当前guarded trace-off | experimental | off |
| --- | ---: | ---: |
| 原始JSON SHA256 | `75f296ca42a3db4f11f4c091e4959e61b4e699eb640ebda9a7ee8189eb4607da` | `a3563c798386d3cfec860fb1e2369d32e0230f57c626838a3c26a9d82e6a1633` |
| primary definition median / P95 | 249.360 / **1,747.660ms** | 259.170 / 328.460ms |
| primary definition >500ms | 6/100 | 2/100 |
| references median / 最慢 | 6,244.472 / 92,175.415ms（op81） | 5,849.712 / 88,221.667ms（op100） |
| 目标Node PID sampled peak RSS | 1,382,690,816B | 1,614,184,448B |
| 目标PID样本 / 最大间隙 | 1,565 / 256ms | 1,525 / 298ms |

原始文件分别为
`.bench/semantic-ready-s05/settings-mixed-experimental-scope-restoration-guarded.json`与
`.bench/semantic-ready-s05/settings-mixed-off-scope-restoration-guarded.json`。
两arm的全部机器checks为true：100/100 primary definition、11/11个9-location
references、11/11 secondary definition精确；正常versioned diagnostics、第50次
L3及第51次恢复、目标PID采样覆盖全操作、原Settings未改、shutdown/exit0。

本对experimental/off sampled peak比为**0.857×**，与上一未guarded固定顺序
单对的1.797×方向相反。进程与index时序、执行顺序和单样本变异尚未排除，
不得宣称guard稳定省内存，也不能把旧1.797×直接作为当前build回归值。
experimental的primary definition P95 **1,747.660ms**仍明显超出500ms目标；
两arm各有约90秒完整references尾延迟。尚无随机多会话、PSS/post-eviction、
当前build trace-on细分或最终产品门禁；故S05仍`IN_PROGRESS`、reuse默认off、
S03仍`BLOCKED`，不能毕业或默认启用。

## 复现与下一判别问题

在固定Settings checkout/SDK/产物SHA存在、macOS外部`ps`采样获准时运行；
使用尚不存在的新`--out`，绝不覆盖本次原始证据：

```sh
/usr/bin/caffeinate -i node scripts/bench/replay-settings-mixed-ops.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --manifest bench/references/manifests/settings-homeinitdata-mixed-ops-api24.json \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --operations 100 --session-reuse experimental --trace \
  --out .bench/semantic-ready-s05/settings-mixed-trace-replay-new.json
```

上述命令只适用于前半部分的旧worker SHA。重放本次phase A/B须先构建出
诊断manifest固定的server/worker SHA，并分别指定未使用过的输出路径：

```sh
/usr/bin/caffeinate -i node scripts/bench/replay-settings-mixed-ops.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --manifest bench/references/manifests/settings-homeinitdata-mixed-ops-api24-phase-trace.json \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --operations 100 --session-reuse off --trace \
  --out .bench/semantic-ready-s05/settings-mixed-off-phase-replay-new.json
/usr/bin/caffeinate -i node scripts/bench/replay-settings-mixed-ops.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --manifest bench/references/manifests/settings-homeinitdata-mixed-ops-api24-phase-trace.json \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --operations 100 --session-reuse experimental --trace \
  --out .bench/semantic-ready-s05/settings-mixed-experimental-phase-replay-new.json
```

前一**未加global-warm guard**的scope-restoration旧产物须使用其独立manifest；
其历史trace-off A/B命令如下，输出名每次须选择尚不存在的路径。guarded build
应被这个旧manifest的SHA校验拒绝，不能把旧结果标成新build：

```sh
for arm in off experimental; do
  /usr/bin/caffeinate -i node scripts/bench/replay-settings-mixed-ops.mjs \
    --workspace .bench/real-projects/settings-ecc550 \
    --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
    --manifest bench/references/manifests/settings-homeinitdata-mixed-ops-api24-scope-restoration.json \
    --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
    --operations 100 --session-reuse "$arm" \
    --out ".bench/semantic-ready-s05/settings-mixed-$arm-scope-replay-new.json"
done
```

当前guarded build使用新锁定manifest；按本次固定顺序重放（每次选择未用过的输出名）：

```sh
for arm in experimental off; do
  /usr/bin/caffeinate -i node scripts/bench/replay-settings-mixed-ops.mjs \
    --workspace .bench/real-projects/settings-ecc550 \
    --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
    --manifest bench/references/manifests/settings-homeinitdata-mixed-ops-api24-scope-restoration-guarded.json \
    --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
    --operations 100 --session-reuse "$arm" \
    --out ".bench/semantic-ready-s05/settings-mixed-$arm-guarded-replay-new.json"
done
```

## Index 拒绝位置探针（默认关闭）

已在现有100次Settings回放增加`--index-rejection-snapshot`，只在
`references.index.fallback`的`candidate-ineligible`事件出现时，读取该**私有clone**
SQLite的同一只读事务：committed generation、目标URI的export行列、
`reference_searchable`与declaration identity。只有快照generation等于事件的
`servedGeneration`，才比较声明范围；不改索引、搜索策略、诊断或references结果。
探针不把`workspace/symbol`当成语义真值，也不保留原工程副本。

先前未开启探针的trace-on两arm已经证明约90s的阶段分布：experimental op100
89.499s中，24个保守batch共86.614s，Program-ready共77.961s，实际引用查询
共1.522s；off op100 92.525s中，对应为89.832/80.650/1.567s。
因此可断定**尾延迟来自候选拒绝后的顺序冷Program准备**，尚不能断定拒绝原因。
既有三次`candidate-ineligible`均为Rust/SQLite返回`completeness=ready`、
`servedGeneration=committedGeneration`，不是Node合成的URI映射失败；
“旧目录代次晚提交、目标行仍落后”仍只是待验证假设。

当前guarded build另以独立新进程完成三轮默认关闭探针的真实回放：

| 回放 | JSON SHA256 | 结果 | 最慢references | 拒绝快照 | 目标Node sampled peak RSS |
| --- | --- | --- | ---: | ---: | ---: |
| off、trace-off | `db1dbb17ddc1e6f5a28bca6918e11d93f3a08a662ef510fe209dc3b769d80ce3` | PASS | 7.714s | 0 | 1,931,296,768B |
| off、trace-on | `7501cc41aa99f9fcb04fd36becbcbf3337131f5ddf8b1032f371d8e894faa3e2` | PASS | 8.042s | 0 | 1,866,891,264B |
| experimental、trace-on | `5408b35f0e6ea006480676cacdf5086ca2de6bf2e764c8bf91dc9c7fd99d324f` | PASS | 8.156s | 0 | 1,354,932,224B |

原始报告位于`.bench/semantic-ready-s05/settings-mixed-{off,experimental}-index-row-observer-*.json`。
三轮均为100/100定义、11/11个9-location引用、正常版本诊断、Level3/恢复、
target PID外部RSS与clean exit通过。off trace-on曾记录`index.recovered`，
但候选仍获接受；故“任意generation前进必然失败”已被反例否定。
本轮**未捕获拒绝事件**，不能从零快照推断索引无竞态，也不能将这三轮
与先前的约90s尾延迟合并作性能改善宣称。一次沙箱尝试因macOS采样
`spawn EPERM`在任何语义请求前失败，单独保留为环境失败报告，不计入三轮。

复跑探针：在下方原有guarded命令上追加`--index-rejection-snapshot`，并使用
不存在的新`--out`；外部RSS采样需要本机允许查看目标Node PID。
下一步若再现拒绝，先检查快照generation是否与事件一致，再比较export行
与compiler目标行；不同才成立“行号漂移”，相同则调查Rust的别名上限与
source admission分支。未完成该判别前不改生产freshness/默认策略。

下一判别需在不改语义正确性/预算/worker数的前提下拆分`engine.define`
内部Program/Checker各自时长、index目标行的实际位置与
`unsupported`分支，以及context dispose后哪些compiler对象仍可达。不能因
RSS在L3后仍高就宣称可达Program泄漏；未做强制GC/heap snapshot。
仍需随机顺序多会话trace-off对照与PSS/post-eviction证据；S05默认off及
ADR0003继续有效。

## 独立两次编辑 generation 水位回归（非 Settings 性能复核）

在父 HEAD `911ae43c274175614559b63f0311504747d8393d` 的 dirty 工作树上，
公开 LSP 最小工程稳定触发一个**真实新鲜度竞态**：第一次 watched edit
启动 generation 2；其 activating/committed 1 阶段发生第二次 edit。
compiler definition 已见 `Target.ets` 新声明 line 2，但 generation 2 ready、
generation 3 activating/committed 2 时，旧 freshness 从已接受的1过早恢复到2。
scripted sidecar 随后 `candidate-ineligible`；native debug sidecar 当次反而接受
旧代次2的 direct-import candidates。两臂最终 references 均完整，故此证据
证明的是候选新鲜度门禁失效，**不是**一次已确认的漏引用或90秒尾延迟根因。

RED 日志分别为 `.bench/semantic-ready-s05/index-generation-race-scripted-red.log`
（SHA256 `ef8ac767e26095cce83349c1a75a269888f0b6fe742c707d8ff48fa3729dd6db`）
和 `.bench/semantic-ready-s05/index-generation-race-native-red.log`
（SHA256 `4c9e74cf60aa5741d5b588f2a85bc28ff9dea9e917d794a51b002ed407033cb3`）。
可重放命令：先构建 server，再运行
`node --test tests/semantic/references-index-generation-race.test.mjs`；native 控制用
`ARKTS_INDEX_RACE_REAL_SIDECAR="$PWD/target/debug/arkts-index-sidecar" node --test tests/semantic/references-index-generation-race.test.mjs`。
后者须使用本仓构建的 debug sidecar；该最小工程刻意不使用真实 SDK，
不能和 Settings/API24 的 RSS/时延数据混合。

最小修正仅将 native status 可选 `buildingGeneration` 纳入 watched edit
恢复基线 `max(accepted, committed, building)`；status 捕获失败保持 dirty，
待后续 ready/committed **严格超过**基线才恢复 indexed。scripted/常规 resync/
manifest 6/6、native 1/1、index adapter 28/28 GREEN，`pnpm check` exit0；
该检查点时全量 `pnpm check:fast` 仍在运行；真实 Settings 100-op 尚未复跑。
不能宣称消除了既有`candidate-ineligible`长尾或达到500ms。

## 水位修正后真实 Settings/API24 单对回放（trace-off）

同一真实 Settings checkout `ecc550dfaed880e04e38a2477eb7235cd50475b9`、
API24 declaration digest `8098b8ab…a33d4c6e4`、server SHA256 `c0388bee…e506fd8`；
manifest SHA256 `253a5385…c0d816dd`，100-op schedule SHA256
`64c27ccc…b9e42e`。固定顺序 **off→experimental**，各为独立新进程；
原始 JSON 与完整环境分别保存在
`.bench/semantic-ready-s05/settings-mixed-off-index-watermark-observer-new.json`
（SHA256 `8dd39e446e688662817ebeba3c32e00428c0627e9860a734a67e2984bf57595c`）
和 `.bench/semantic-ready-s05/settings-mixed-experimental-index-watermark-observer-new.json`
（SHA256 `b3a2d13d3181d4fb193ad3c715f140ac768e23bd2da31f8aca67df6e989d273d`）。
两臂均PASS：100/100 primary definition、11次9-location exact references、
11次 secondary definition、正常精确版本诊断、L3/op51恢复、原工程clean、exit0。

| 指标 | off | experimental |
| --- | ---: | ---: |
| 100次primary definition median / nearest-rank P95 | 261.653 / 306.324ms | 259.972 / 1,718.658ms |
| primary definition >500ms | 2/100 | 6/100 |
| 11次references median / nearest-rank P95（亦为最慢） | 5,877.870 / 7,498.150ms | 6,114.310 / 8,303.234ms |
| 目标Node sampled peak RSS | 2,097,225,728B | 2,166,226,944B |
| process-tree sampled peak RSS | 2,354,556,928B | 2,423,648,256B |
| `candidate-ineligible`快照 / `workspace-changed`fallback / indexed recovery | 0 / 11 / 0 | 0 / 11 / 0 |

experimental/off 的Node peak为**1.033×**，tree peak为**1.029×**；
单对低于1.10资源比例门槛，但不是随机多会话/PSS或post-eviction毕业。
外部RSS目标间隔50ms，实际样本间隔中位123/125ms（off/experimental），
不能把采样峰值当真峰值或将tree RSS当PSS。两臂本次都没有90秒尾延迟，
但每次references都紧随watched edit并走`workspace-changed`完整回退，
**没有一次indexed恢复**。回放在op100后约1秒退出，11次回退不证明目录永久
dirty；尚未测Settings空闲后恢复的真实时点。因而本次未验证indexed快路径，
更不能宣称水位修正解决历史`candidate-ineligible`或500ms目标。
修复后仍需覆盖恢复后的indexed查询和多次交叉顺序复测；S05保持IN_PROGRESS、
reuse默认off，S03保持BLOCKED。

复跑时使用未占用的`--out`，在上文guarded命令基础上改用
`bench/references/manifests/settings-homeinitdata-index-watermark-api24.json`，
并加`--index-rejection-snapshot`；固定 `--operations 100`、同一oracle/SDK，
分别设`--session-reuse off`和`experimental`。本切片全量
`pnpm check:fast`为**1,199/1,199 PASS**，不替代产品性能门禁。

## 2026-10-03：空闲后 indexed 恢复的真实 Settings 回放

前节的11次references都紧随编辑，不能判定后续代次是否追上。新加的
默认关闭`--post-idle-reference`沿用现有100-op runner、同一Settings工程/
API24 SDK/9-location oracle、正常diagnostics和独立目标Node PID外部RSS
采样。它在op100后等待sidecar ready代次严格超过最后一次
`workspace-changed` fallback基线，再查询`common/index.ets:284:23`
（零基UTF-16，`includeDeclaration=false`），另行检查实际路由。
同一manifest SHA256 `253a5385…c0d816dd`、SDK声明digest
`8098b8ab…a33d4c6e4`、server SHA256 `c0388bee…e506fd8`、
sidecar SHA256 `18f87160…85adf6b1`；Settings原checkout
`ecc550dfaed880e04e38a2477eb7235cd50475b9`保持clean。

| 独立进程 | 状态 | fallback基线→ready | 新增LSP refs | exact / 路由 | sampled Node / tree peak RSS |
| --- | --- | ---: | ---: | --- | ---: |
| off | PASS | 7→8 | 5,545.128ms | 9/9，cache miss→recovered→accepted→indexed，无fallback | 2,040,700,928 / 2,287,312,896B |
| experimental | PASS | 9→10 | 5,381.871ms | 9/9，同上 | 1,818,624,000 / 2,088,259,584B |
| off，修正计时再验证 | PASS | 9→10 | 5,431.002ms | 9/9，同上 | 2,067,243,008 / 2,326,417,408B |

原始JSON依次为
`.bench/semantic-ready-s05/settings-post-idle-off-20261003.json`
（SHA256 `b459f47c…d89919d7`）、
`.bench/semantic-ready-s05/settings-post-idle-experimental-20261003.json`
（`d8e6b495…4e55`）和
`.bench/semantic-ready-s05/settings-post-idle-off-timing-fixed-20261003.json`
（`158306e7…01eb201`）。三份均包含完整LSP transcript、9个规范化
Location、request-scoped route events、catalog trace、50ms目标的外部RSS
原始样本、环境和产物身份、100-op及诊断检查。前两份`waitMs`观测字段
**错误包含了后续refs查询**（14,172/15,456ms），不能用作catalog等待
证据；第三份经独立测试修正并复跑，等待ready仅`10,774ms`，随后查询
`5,432ms`。前两份查询时间以其独立LSP request `elapsedMs`为准。

修正后的off进程trace把这次5.431秒拆为：candidate-selection
`2,747.72ms`，其中独立anchor worker `2,569.62ms`（Program ready
`2,233.37ms`）；随后1个indexed batch、3个候选文件，batch worker
`2,581.44ms`（Program ready `2,242.76ms`，实际query `48.41ms`）。
两个worker的Program均含613个SourceFiles、151个project文件及410个SDK
SourceFiles；这说明该查询的主要可观测延迟是**重复构建compiler状态**，
并不能据此说`findReferences`本身耗时5秒。两阶段成本不可简单和进程RSS
相加；worker_threads RSS已计入同一个目标Node PID。

一条可重放命令（需上述Settings checkout和SDK路径；输出使用新文件名）：

```bash
node scripts/bench/replay-settings-mixed-ops.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --manifest bench/references/manifests/settings-homeinitdata-index-watermark-api24.json \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --operations 100 --session-reuse off --post-idle-reference \
  --out .bench/semantic-ready-s05/settings-post-idle-repeat.json
```

真实index可恢复、且完整结果无损；它**没有**证明500ms、历史90秒尾延迟
根因或最终内存门禁。两臂单对顺序固定，experimental/off的RSS不能据此
解释为稳定收益。接下来优先以公开LSP合同防护并测量anchor与首batch
重复Program准备，再考虑融合；另需完成启动期index-status失败的安全
恢复反例、交叉多会话与PSS。首次沙箱内`pnpm check:fast`有采样型用例
在`ps`不可用时超时，不能标GREEN；允许macOS外部`ps`采样后，定向
61/61 PASS，原始完整`pnpm check:fast` **1,201/1,201 PASS、0 skip**。
S05仍IN_PROGRESS，实验默认off，S03仍BLOCKED。
