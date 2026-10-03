# S05 context 生命周期与相容磁盘增量：公开 LSP TDD

日期：2026-09-29。Parent revision：`911ae43c274175614559b63f0311504747d8393d`。
第一检查点范围：默认关闭的观察点、既有reset条件的等价抽取、真实child stdio测试和文档。
不改语义工作集、预算、diagnostics、缓存失效或verifier生命周期。

## Characterization → RED → GREEN

| 实际命令/切片 | RED或既有保护 | 最小实现与结果 |
| --- | --- | --- |
| `node --test tests/semantic/semantic-context-lifecycle.test.mjs`（初始characterization） | 新进程真实definition在重复、overlay comment、disk comment、SDK切换、L3和重建后均exact；1/1 PASS | 在GREEN下把既有reset条件抽入`type-context-reset.ts`，同例1/1 PASS；原491行type-engine未增长 |
| 同命令（创建/复用原因） | 1 PASS/1 FAIL，exit1：实际SDK构造4次，而context create日志0次；不是SDK/build/路径失败 | Coordinator可选observer、type-engine仅trace-on接线；2/2 PASS |
| `node --test --test-name-pattern='default reference disposal' tests/semantic/semantic-context-lifecycle.test.mjs`（当时test名称） | 1 FAIL/exit1：只有generic explicit-removal，无法归因reference policy | 仅给原dispose调用传`reference-dispose`原因，不改处置；3/3 PASS |
| trace-off与test-layer audit | 公开同轨导航/diagnostics characterization；注册第127 entry、bundle-e2e第50项 | trace-on/off normalized definitions相等，均manual exact refs；trace-off无生命周期event |

第一轮trace GREEN复跑曾因期待shutdown最终eviction日志失败。
parent关闭时该日志不保证传回，故收窄为live请求边界的可观测性，不改shutdown或伪造事件。
记录此测试调整，不称其为运行策略缺陷。独立review指出累计events会掩盖后续
缺失reuse；最终测试在每次请求前记长度，仅断言该请求的event delta。

## 公开合同

- 复用现有LspSession、Content-Length stdio和真实`dist/server.cjs --stdio`。
- definition和references均校验URI+UTF-16 range；包含非BMP字符和注释移位。
- 未保存comment沿用context/LS；disk revision、SDK和L3仍按原策略重建。
- contextSequence只表示Coordinator内的context/LS生命周期，不表示Program reuse。
- 正常v1/v2 diagnostics均发布且为空；不关闭自动诊断。
- SDK两个fixture内容相同，专测reset原因；真实SDK选择/新鲜度由既有SDK回归保护。
- 新公开轨不覆盖所有reason、active lease/L2/LRU或每一verifier；既有focused tests
  继续保护这些策略。没有调用compiler getProgram来制造观测。
- observer异常隔离；默认关闭时不组装trace字段。shutdown日志不是durable audit。

## 本轮验证

```sh
node --test tests/semantic/semantic-context-lifecycle.test.mjs \
  tests/semantic/semantic-coordinator.test.mjs \
  tests/semantic/type-engine-context-runtime.test.mjs \
  tests/semantic/references-context-retention.test.mjs \
  tests/semantic/project-sdk-selection.test.mjs \
  tests/test-layer-manifest.test.mjs
/usr/bin/caffeinate -i pnpm check:fast
```

最终focused **37/37 PASS、exit0**，0 fail/cancel/skip/todo，
duration `20361.577221 ms`。日志`.bench/semantic-ready-s05/focused-green.log`。
本轮whole-fast 1160/1161 PASS、1 FAIL、exit1；原20s的struct references
请求4超时，隔离原deadline复核不覆盖这次whole失败。
whole-fast结果、冻结产物、真实Settings回放与剩余门禁见
[唯一S05报告](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)。
不把旧S01/S02 gate挪用于本轮，不以观察测试GREEN放行复用或500ms。

## 第二检查点：相容磁盘 delta 的默认关闭原型

Parent仍为`911ae43c274175614559b63f0311504747d8393d`，在保留的dirty tree上继续，
不是HEAD纯净对照。第二检查点当时原whole FAIL保持开放；本切片当时尚未重跑whole-fast。
复用技能按characterization→RED→minimal GREEN：既有文件变更边界、alias、overflow、
LS pressure和SDK策略先保护；不删除contentRevision guard。

| 切片/原始日志（均在`.bench/semantic-ready-s05/`） | 实际失败/结果 | 改动 |
| --- | --- | --- |
| `disk-delta-characterization.log` | 原27/27 PASS，42,357.634ms；提取后`disk-delta-extraction-green.log`27/27、43,656.072ms | 在GREEN下将原revision/reset/bounded delta bookkeeping抽出`WorkspaceContentChanges`，不是新缓存/AST owner；DocumentStore减少33行 |
| `disk-delta-red.log` | public1 FAIL：实验预期3个LS构造，实际4个；正常definition/diagnostics已exact | 集中SESSION_REUSE默认off；生产者一次性精确revision span，consumer按owner/epoch/from/to/path交付证明放行 |
| `disk-delta-first-green-attempt.log` | public1 FAIL：disk comment后definition跨行错误range；script重插version1撞旧Program版本 | host resident版本加入per-path disk revision；`disk-delta-green.log`1/1 PASS |
| `disk-undelivered-red.log` | public1 FAIL、1,888.549ms：已精确返回2 references；新local LS读取triple-slash依赖后，磁盘comment应line1却仍返回line0 | 每个changed文本必须实际在非overlay documents交付；未交付源保守reset，不改fallback读策略 |
| `disk-delta-final-public-green.log`（中间构建） | 11 PASS/1 FAIL：双alias重建后v3 TS2304仍用v2 offset45，正确值92；没有放宽range断言 | host版本再包含resident已计算的source SHA，防共享registry/不同LS counter重置碰撞；不增加hash或重读 |
| `disk-delta-version-public-green.log` | public12/12 PASS，15,493.811ms；triple-slash与alias exact/normal diagnostics均GREEN | guard与host版本修复，不宣称compiler Program被复用 |
| `session-reuse-layer-red.log` | manifest3 PASS/1 FAIL：新增alias文件未分层 | 注册第128 entry/bundle51，并验证唯一分层 |
| `disk-delta-final-guards-green.log` | 51/51 PASS，40,099.310ms，exit0、0 fail/cancel/skip/todo | 原DocumentStore、Coordinator、类型runtime、retention及SDK边界继续保护 |
| `disk-delta-final-scope-green.log` | 中间public13/13 PASS，16,789.033ms，exit0、0 fail/cancel/skip/todo | 双alias增加off baseline：off重建、experimental首次完整delta复用；两者缺失span均重建，manual range/diagnostics不放宽 |
| `disk-combined-span-red.log` / `disk-combined-orders-red.log` | 单例1FAIL；四种顺序×off/experimental为2PASS/6FAIL、6,180.080ms。已返回的deleted definition是正确空集，RED为不安全span/未reset，不是错误Location证明 | 未知in-root source删除原来不advance；现在沿原changedRoots→advance推进durable contentRevision，两arm都重建，不加新manager或放宽预算 |
| `disk-combined-orders-green.log` | 四顺序×两策略8/8PASS，7,419.249ms，0fail/cancel/skip/todo | known-first、deleted-first、deleted-consumed-first、deleted-only均检查fresh定义、normal TS2304/v2精确范围、reset原因和exit0；GREEN后只提取同一fixture函数 |
| `disk-delta-fenced-focused-green.log` | 最新完整focused72/72 PASS、65,640.292ms、exit0，0fail/cancel/skip/todo | 同一次串行command覆盖公开LSP17、分层4与原guards51；非whole gate，原whole FAIL未被取代 |

公开命令：

```sh
node --test --test-concurrency=1 \
  tests/semantic/semantic-context-lifecycle.test.mjs \
  tests/semantic/semantic-session-reuse.test.mjs tests/test-layer-manifest.test.mjs
node --test --test-concurrency=1 tests/workspace-file-change-coordinator.test.mjs \
  tests/semantic/type-engine-context-runtime.test.mjs \
  tests/semantic/semantic-coordinator.test.mjs \
  tests/semantic/references-context-retention.test.mjs \
  tests/semantic/project-sdk-selection.test.mjs
```

复现使用真实子进程、原20s请求deadline，无sleep掩盖交付顺序。
100次fixture磁盘comment，每次立即definition比对人工完整URI+UTF-16 range，
实验LS sequence不变；SDK切换和L3仍重建。
另有off/experimental类型变化→TS2322/v3→修复empty/v4、全部导航exact对照。
两lexical root的一个alias先消费delta、再发另一delta，不允许另一alias补用旧LS；
正常versioned diagnostics、旧名无definition、新名精确移位导航及shutdown均检查。
跨root非法路径由现有worker public routing拒绝，本测试不借私有入口假造通知。
未交付compiler-only依赖反例直接驱动保守guard，不能为“复用率”删掉它。

`pnpm check`/`pnpm build`在最终runtime实现上exit0。
最新focused日志SHA256：`95bc4c012c70fb857651205d15925b4c6815ed4332b73890bebb02ec9f644707`。
本切片只实现完整已交付ordinary disk delta的local LS实验；create/delete、reset/overflow、
SDK/project/owner变化和丢失revision仍保守重建；新增未知source删除也推进revision，
防止与其它batch组合/消费后恢复复用。此freshness修正与host version在off同样执行。
全局references scope、verifier/诊断能力
与预算不变；100fixture循环不是≥100真实混合操作/PSS/500ms毕业证据。
最终Settings控制与后续public证据更新在[唯一S05报告](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)，
中间失败日志保留；无未知删除fence的`*-final.json`是中间控制，真正最新构建用`*-fenced.json`。

## 第三检查点：真实 Settings watched-disk edit 的公开回放

`scripts/bench/replay-settings-disk-edit.mjs`复用真实`LspSession`、Content-Length stdio、
既有Location oracle及外部Node PID RSS sampler。它要求原Settings checkout clean且HEAD为
`ecc550dfaed880e04e38a2477eb7235cd50475b9`，验证原文件SHA，然后在private
`--no-hardlinks`本地clone里只给未打开`HomeInitData.ets`加一行注释；原工程不得改变。
CLI拒绝已有输出、dirty source和未控`ARKTS_*`环境；初始CLI/test-layer测试7/7 PASS，
`pnpm check` exit0。手写runner安全补丁后451行，仍未超过500行限制。

第一次trace-on真实回放保留为FAIL：harness在磁盘edit之后才等consumer v1诊断，
虽前后definition与references9/9 exact，但诊断等待超时；不能归为semantic结果PASS。
最小修正只将v1诊断等待移到edit之前，保留原正常自动诊断、180秒deadline、
结果oracle及server默认行为。修正后的trace-on off/experimental各1次PASS：
original definition`16:13–16:25`，注释后`17:13–17:25`，原line28的本文件引用
移到line29；其余8个引用不变，诊断v1包含已有TS2339，正常exit0。
`experimental`复用contextSequence1，`off`在content revision后evict1/create2。

trace-off采用三对独立新进程交替off/experimental（每次独立clone和catalog），
六个run定义/引用完整集合与shifted oracle相等、正常诊断/退出且原工程clean。
post-edit definition中位off 1,811ms、experimental 281ms；references中位分别
6,597ms、6,611ms。它是S05 local-LS受控编辑证据，不是Program identity、
全局refs加速、P95≤500ms或S05毕业。外部RSS、原始请求、环境SHA和受限结论见
[唯一S05报告](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)。
runner安全跟进以公开CLI用例按RED/GREEN增加四个拒绝合同：报告目标位于原Settings、
报告目标经symlink别名落入原Settings、目标位于SDK，以及无法读取原工程`git status`。
canonical-parent拒绝与status-null fail closed只保护benchmark输入/输出边界，
不改变LSP语义、SDK或六次已采集的真实回放。原始CLI/test-layer7/7和
`pnpm check`是安全补丁前证据；补丁前完整`check:fast`1,177/1,177 PASS
也不当作补丁后最终门禁。补丁后的首次沙箱重跑因macOS `ps`权限拒绝使
sampler/replay相关测试失败并被停止（exit1），记为环境无效尝试，而非代码回归。
随后在获准进程采样环境对当前工作树运行`/usr/bin/caffeinate -i pnpm check:fast`，
**1,181/1,181 PASS、exit0**，0 fail/cancel/skip/todo，
duration `1,195,387.333352 ms`。旧1160/1161 FAIL保留为历史运行证据，
但不再标记当前源码whole-fast未过；原20秒struct超时根因仍未证明。
安全补丁后一次真实experimental Settings trace-off smoke仍PASS/exit0：前后definition
及references9/9 exact，正常v1 TS2339，原工程clean；见报告的`*-final-safety.json`。
它不是新的两arm分布或产品P95门禁。
这项回归GREEN不替代S05随机≥100真实混合操作、post-eviction/PSS及产品500ms门禁。

## 第四检查点：Settings 100 次混合操作的公开回放

Parent仍为`911ae43c274175614559b63f0311504747d8393d`；本切片只新增
`replay-settings-mixed-ops.mjs`及输入/报告helper、公开CLI/分层测试和冻结manifest，
不改变生产默认、预算、语义加载或worker数。最初执行
`node --test tests/replay-settings-mixed-ops-cli.test.mjs` exit1：`--operations 99`
得到`replay not implemented`，而非预期的`--operations must be at least 100`。
实现后以下公开CLI/分层命令为**6/6 GREEN**，`pnpm check` exit0：

```sh
node --test tests/replay-settings-mixed-ops-cli.test.mjs \
  tests/test-layer-manifest.test.mjs
```
CLI拒绝少于100次编辑与报告落在原Settings内；真实LSP测试从未使用私有server入口。

两份[固定原始报告](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)
来自同一manifest SHA`309b92eb6fdb3f48872d7ba80dfe381adb0ec546d722ad9c53d00f1ee6865175`：
每arm一个独立真实子进程/私有clone，100次watched disk edit后立即primary definition，
11次完整refs与11次common/index secondary definition，正常精确v1诊断、
第50次L3 ack及第51次恢复全部PASS，原工程不变。实验arm的采样Node RSS peak
2,146,119,680B对off 1,341,296,640B，为**1.600×**，超过≤1.10资源门禁；
即便功能GREEN也不能推广默认。一次固定顺序A/B不是随机多会话、PSS、取消或P95毕业证据。
同冻结输入的第二个experimental-only进程亦100/11/11 exact且L3恢复，
采样Node peak为1,796,046,848B；没有第二次配对off，不能当随机A/B。
两次experimental均22/100个primary定义>500ms（off 2/100）；
约90秒引用与`candidate-ineligible` fallback同现，不把相关性写成根因。
独立trace-on/reuse-off取消控制通过真实framed LSP在`references.queue.start`
后取消显式id2，得到`-32800`且无result；新refs9/9 exact、definition exact和
正常v1 TS2339/退出。该control不是verifier batch中途取消证明，也不能把
experimental 100操作arm的取消门禁视作通过。
第二个独立reuse-off控制在`references.batch.start`后、batch.complete前取消id2，
同样`-32800`无result，恢复refs9/9、definition和诊断exact、正常退出；
仅证明该off batch-start窗口，不把它推广到experimental或任意batch。
取消runner的公开CLI/fixture分类`node --test tests/replay-settings-cancel-control-cli.test.mjs`
为8/8 GREEN，包含已完成/竞争成功/重复终态均不得冒充已取消的反例。

## 第五检查点：回放工具的误报防线

Parent仍为`911ae43c274175614559b63f0311504747d8393d`。在本次工具防线改动前，
`/usr/bin/caffeinate -i pnpm check:fast`已exit0，**1,191/1,191 PASS**；
不能把这一轮视为随后改动的完整回归。内存报告先加公开helper测试：
`node --test tests/replay-settings-mixed-ops-cli.test.mjs` RED exit1，缺少
`targetRssCoverage`；补齐目标Node PID、操作首尾覆盖和采样间隙检查后同命令
**3/3 GREEN**。现有四份原始Settings混合报告的目标PID采样均独立复核为连续，
最大间隔分别304/276/293/232ms，首样本早于op1、末样本晚于op100；
原始JSON不改写，新检查防止未来缺失目标PID仍误报PASS。

取消控制先以真实framed-LSP伪服务器制造“恢复响应同时有正确result和error”：
旧runner错误输出PASS，针对性测试RED exit1；加入`!recovery.references.response.error`
后GREEN。另一个RED证明旧报告把`references.batch.start`误称为in-flight；
该事件在Worker创建前，修正为`batch-scheduled-before-verifier`，不宣称
compiler执行中取消。取消CLI测试最终**9/9 GREEN**，runner459行、测试258行。
上述两组都只修复证据验收，不更改production语义路径或S05结论。

## 第六检查点：definition慢区间的默认关闭观测

Parent仍为`911ae43c274175614559b63f0311504747d8393d`，继续保护dirty tree。
本切片只在既有`ARKTS_REFERENCES_TRACE=1`下增加
`semantic.prepare.complete`（`entry.engine.prepare`耗时）及
`semantic.definition.complete`（`engine.define`耗时与查询后Program文件数）事件。
默认trace-off不组装事件；不改复用默认、worker、预算、缓存或语义结果。
在真实Content-Length child-process LSP测试中逐事件RED/GREEN：

| 命令 | 先失败 | 最小实现后 |
| --- | --- | --- |
| `node --test --test-name-pattern='disabled lifecycle tracing' tests/semantic/semantic-context-lifecycle.test.mjs` | RED1 exit1：缺`semantic.prepare.complete` | GREEN 1/1：trace-on有事件，trace-off无事件 |
| 同命令的第二个切片 | RED2 exit1：缺`semantic.definition.complete` | GREEN 1/1：同一public transcript有定义事件与文件数 |

`pnpm check` exit0；focused
`node --test tests/semantic/semantic-context-lifecycle.test.mjs tests/semantic/semantic-session-reuse.test.mjs tests/semantic/references-context-retention.test.mjs`
为**18/18 PASS**。`type-engine.ts`改后499行、测试392行，未超过单文件500行上限。
这些是观测合同，不是Program identity或低延迟门禁；本切片未重跑完整
`pnpm check:fast`，也没有申请merge。

原冻结混合manifest在重新构建后正确拒绝回放：
`BENCHMARK_BLOCKED=SEMANTIC_WORKER_MISMATCH`，不得覆盖旧结果或称为语义FAIL。
另建诊断专用manifest
[`settings-homeinitdata-mixed-ops-api24-phase-trace.json`](../../bench/references/manifests/settings-homeinitdata-mixed-ops-api24-phase-trace.json)，
SHA256 `a200247b1a4a7bc26afb38eba7c8f39e6b6a8a7d80c40c0502d1d9eef92dad9c`，
绑定新worker SHA而保留同Settings/API24/符号/oracle/schedule。串行off→experimental
的两个新进程都100/11/11 exact、正常diagnostics/Level3/退出；off与experimental
原始JSON SHA分别为
`952ed1bc1dbd2615c754e84debb802997339e15655ff0c42c0f1fadb5aa7d7d2`、
`3cd8a5b1678d6a4eaad37dff0cd4819958e8e134e8146ed5491f5cf6bacbd1e7`。
`entry.engine.prepare`中位off/experimental为5.195/0.238ms，primary
`engine.define` P95为266.509/1,532.712ms；primary LSP wall P95为
326.053/1,584.529ms。实验Program在跨模块后可从422扩到761个SourceFiles，
但422组也出现约1.6秒突发，不能把所有慢请求归给Program文件数。
本次trace-on RSS峰值方向与上一次trace-on相反；正式trace-off 1.600×
资源门禁失败未变。方法、原始证据与不确定性见
[S05 phase trace诊断](../reports/2026-09-30-s05-settings-context-trace-diagnosis.md)。

## 第七检查点：完整legacy引用之后恢复局部语义scope

Parent仍为`911ae43c274175614559b63f0311504747d8393d`。新增公开
[`semantic-global-scope-restoration.test.mjs`](../../tests/semantic/semantic-global-scope-restoration.test.mjs)
走真实子进程、Content-Length/stdio、正常diagnostics，逐位置比较definition及
完整legacy references。`node --test tests/semantic/semantic-global-scope-restoration.test.mjs`
先RED exit1：实验复用下局部definition的`programProjectRootFiles`为2，
查询全工程references后变成3，违反“下一次局部查询仍有界”的合同；
返回Location本身没有出错。初版修复仅在**默认关闭的experimental分支**，
完整legacy references结束时以`reference-global-scope`原因移除该Coordinator
context；随后相同公开查询恢复2 roots，语义结果不变。focused **18/18 GREEN**，
`type-engine.ts`改后496行；不更改worker数量、内存预算或生产默认。

新scope-restoration诊断manifest SHA256
`8009ac13a4492380df6af8032a8383c54843e4fba6bc45f2878a35bba442455b`
锁semantic worker `74469c12637fbf4114c28c08326c125a88b89d2f7b14b04333a412b6c1e89e64`，
原phase manifest/证据不覆盖。真实Settings/API24同schedule的trace-off
off与experimental分别100/11/11 exact、诊断/L3恢复/exit0；原始JSON SHA分别为
`8b788426e01a207efcfcc27a2ec3642050b2c8fe0f8026bc647fc0e1dca0d4df`、
`cd7f32587e1d58f4121d5fb2983e986d71d31cfa75a63f7c3a9bfbafc5946d09`。
primary definition P95由off 312.328ms对experimental 360.750ms；
sampled peak RSS为1,274,720,256B对2,290,962,432B（**1.797×**，资源FAIL）。
独立experimental trace-on SHA
`f0e2cad8efd55c5f2d77a70150c26d7e6f361e97e99414358d88c945e66981d5`
的101个primary definition均为64个project roots/422个SourceFiles，且记录10次
`reference-global-scope` evict；这是scope恢复证据，不能与trace-off峰值混算。
约90秒references尾延迟未解决。该固定顺序单对A/B不能当随机分布/PSS/500ms
毕业证据；S05仍IN_PROGRESS、reuse默认off、S03仍BLOCKED。下一个公开安全反例
证明该初版无条件移除不正确；以上A/B只对应旧build。

## 第八检查点：保留已经加载的未import全局声明

新增公开
[`semantic-global-warm-reference.test.mjs`](../../tests/semantic/semantic-global-warm-reference.test.mjs)
（120行），仍使用真实LSP子进程、正常自动诊断及UTF-16精确Location。
先让全工程completion加载未import的全局`TargetType`，随后v2 definition精确，
完整legacy references返回3个exact Location。上一切片的**无条件**experimental
eviction使其后的definition成为空集，v3正常诊断报TS2304；新测试RED exit1，
不是benchmark误报。最小GREEN修正只在请求前resident尚未拥有`complete`
project membership时执行`reference-global-scope`移除，保留原已完整加载的热
context；两项公开LSP测试**2/2 GREEN**，`type-engine.ts`改后499行。
默认复用仍关闭，不降低reference范围、不关diagnostics、不改预算或worker数量。

第七检查点的Settings trace-off A/B、独立trace-on及固定manifest均锁定
**未加guard的旧worker build**。原始报告和SHA不覆盖，也不能冒称这次guard后
已经完成真实Settings性能复核；下一检查点单独锁新构建。完整不确定性见
[S05诊断报告](../reports/2026-09-30-s05-settings-context-trace-diagnosis.md)。

## 第九检查点：guarded build的真实Settings单对A/B

守卫后的源码`type-engine.ts`为499行，两项公开global-scope/global-warm LSP测试
2/2 GREEN。新
[`settings-homeinitdata-mixed-ops-api24-scope-restoration-guarded.json`](../../bench/references/manifests/settings-homeinitdata-mixed-ops-api24-scope-restoration-guarded.json)
SHA256 `b8ab2bd2c5ca622a3c80abd2c9e62a5ff004189d55376e6e1c331a6802b043fa`
锁semantic worker SHA
`abc094157433ffe1be0206f77eebd565752021b24e2c7415a28b60201eb721b3`；
旧未guarded manifest及原始JSON未覆盖。本轮仅按**experimental→off固定顺序**
各运行一次真实Settings/API24 trace-off回放，并非随机多轮或产品release gate。

| 当前guarded构建 | experimental | off |
| --- | ---: | ---: |
| 原始JSON SHA256 | `75f296ca42a3db4f11f4c091e4959e61b4e699eb640ebda9a7ee8189eb4607da` | `a3563c798386d3cfec860fb1e2369d32e0230f57c626838a3c26a9d82e6a1633` |
| primary definition median / P95 | 249.360 / **1,747.660ms** | 259.170 / 328.460ms |
| primary >500ms | 6/100 | 2/100 |
| references median / 最慢 | 6,244.472 / 92,175.415ms | 5,849.712 / 88,221.667ms |
| 目标Node PID sampled peak RSS | 1,382,690,816B | 1,614,184,448B |

两臂全部checks为true：100/11/11 exact、正常versioned diagnostics、L3与
op51恢复、原工程clean、目标PID采样覆盖、正常exit0。目标样本数/最大间隙为
experimental 1,565/256ms、off 1,525/298ms。实验/对照峰值比**0.857×**，
与旧未guarded单对1.797×方向反转；单对固定顺序和不同构建不能证明稳定内存
收益。实验P95仍>500ms、两臂仍出现约90秒完整refs尾延迟；当前guarded build
没有trace-on细分或随机多会话/PSS，S05继续IN_PROGRESS、reuse默认off、
S03继续BLOCKED。详细限制与当前可重放命令见
[S05诊断报告](../reports/2026-09-30-s05-settings-context-trace-diagnosis.md)。

## 第十检查点：默认关闭的SQLite拒绝位置探针

父revision仍为`911ae43c274175614559b63f0311504747d8393d`，保持已有dirty tree。
先在公开CLI测试增加`--index-rejection-snapshot`，执行
`node --test tests/replay-settings-mixed-ops-cli.test.mjs`得到RED exit1：
`unknown argument: --index-rejection-snapshot`。新增只读快照测试后执行
`node --test tests/reference-index-rejection-observer.test.mjs`得到RED exit1：
observer模块不存在。最小GREEN只在显式flag下启动observer；
`candidate-ineligible`事件时从私有SQLite只读事务抓同一generation的export
行列和`reference_searchable`，写入回放报告，不参与语义决策。
两项测试合计6/6 GREEN；不同generation保持`targetSpanMatches=null`，
不能把晚采样误判为行号漂移。所有新/改手写script与test≤500行。
首次`pnpm check:fast`（需获准运行macOS外部采样）执行了1194项，
1193项通过，唯一失败是测试分层manifest未登记本轮探针及先前两个S05
LSP测试。清单与固定数量断言按真实新增入口从131更新到134后，
清单/探针/CLI定向10/10 GREEN，两项公开S05 LSP测试2/2 GREEN；
**完整`check:fast`尚未在该清单修正后重跑**。沙箱内尝试曾因采样器
`spawn EPERM`产生回放超时，中止后在获准环境重跑，不能计作代码失败。

用同一guarded manifest、真实clean Settings/API24、相同11个9-location oracle
分别运行三次新进程100-op回放：off trace-off、off trace-on、experimental
trace-on。三次均PASS全部checks，最慢references分别7.714/8.042/8.156s，
目标Node sampled peak RSS分别为1,931,296,768/1,866,891,264/
1,354,932,224B；三次均**未出现**`candidate-ineligible`，拒绝快照为空。
off trace-on虽出现`index.recovered`但候选仍可用，否定了“代次前进本身必然
导致拒绝”的简化解释。此前原始trace-on 24 batch与约90s尾延迟仍是有效
独立证据；本轮不能证明其触发根因。默认复用和索引策略不变，S05未毕业。
原始报告SHA、复现命令、权限失败样本与判断边界见
[S05诊断报告](../reports/2026-09-30-s05-settings-context-trace-diagnosis.md)。

## 第十一检查点：两次 watched edit 的 index generation 水位

父 HEAD `911ae43c274175614559b63f0311504747d8393d`；保留原有 dirty tree。
新增真实子进程、Content-Length stdio 的公开 LSP 回归
`node --test tests/semantic/references-index-generation-race.test.mjs`。
测试先建 generation 1，再连续修改未打开的 `Target.ets`：第二次修改发生于
generation 2 activating（committed 1）；compiler definition 已指向新声明
line 2。随后 generation 2 ready、generation 3 activating（committed 2）时
查询完整 references；旧实现错误发出 `references.index.recovered`，以基线
1 接受代次 2，未等包含第二次编辑的代次 3。scripted sidecar RED exit1，
出现 `candidate-ineligible`；native debug sidecar 同一公开测试 RED exit1，
接受旧代次 2 的 direct-import candidates，但最终 references 仍完整。
两份 RED 原始日志：`.bench/semantic-ready-s05/index-generation-race-scripted-red.log`
SHA256 `ef8ac767e26095cce83349c1a75a269888f0b6fe742c707d8ff48fa3729dd6db`；
`.bench/semantic-ready-s05/index-generation-race-native-red.log` SHA256
`4c9e74cf60aa5741d5b588f2a85bc28ff9dea9e917d794a51b002ed407033cb3`。

最小 GREEN：native status 向 index port 暴露可选 `buildingGeneration`；每次
watched edit 的恢复基线取 `max(accepted, committed, building)`，status 捕获
失败则继续 dirty/complete fallback。scripted fixture 报告 building generation
并冻结各代声明行。构建后 scripted race、常规 resync、分层清单合计6/6 GREEN；
设置 `ARKTS_INDEX_RACE_REAL_SIDECAR` 的 native debug sidecar 同一公开 LSP
测试1/1 GREEN；index adapter 28/28 GREEN；`pnpm check` exit0。
本检查点记录时 `pnpm check:fast` 尚在运行，**不宣称 whole-fast GREEN**。
generation 水位修正是新鲜度安全回归，不等于历史约90秒尾延迟的根因证明；
修复后真实 Settings/API24 100-op 回放尚未执行。S05仍IN_PROGRESS、reuse
默认off、S03仍BLOCKED；未提交、推送或合并。补充判别见
[S05 trace 诊断](../reports/2026-09-30-s05-settings-context-trace-diagnosis.md)。

## 第十二检查点：修复后真实 Settings/API24 100-op 单对 A/B

前一检查点尚未跑真实工程；其后使用相同 manifest SHA256
`253a5385…c0d816dd`与schedule SHA256`64c27ccc…b9e42e`，固定
**off→experimental** 顺序各启动一个新进程，保留正常诊断并启用只读
`--index-rejection-snapshot`。两份原始JSON及SHA见
[S05诊断报告](../reports/2026-09-30-s05-settings-context-trace-diagnosis.md)。
两臂均PASS 100/100 primary definition、11次9-location exact references、
11次 secondary definition、L3/op51恢复、版本诊断、source clean和exit0。
100次primary definition中位/P95（nearest-rank）为off 261.653/306.324ms、
experimental 259.972/1,718.658ms；11次refs最慢7.498/8.303秒。
目标Node采样峰值2,097,225,728/2,166,226,944B，experimental/off=1.033×；
单对不能作为PSS、多会话资源毕业。两臂各11次`workspace-changed`完整回退、
0次indexed recovery、0次`candidate-ineligible`快照；本轮没有90秒尾延迟，
但references都紧随编辑，op100后约1秒退出，不证明index永久dirty，也未测
空闲后的indexed恢复。因此仍不能证明水位修正消除历史尾延迟/达到500ms。
全量`pnpm check:fast` **1,199/1,199 PASS**；S05仍IN_PROGRESS、reuse默认off，
S03仍BLOCKED，未提交、推送或合并。

## 第十三检查点：真实 Settings 空闲后 indexed 恢复

针对第十二检查点仅在编辑后立即查询的问题，先给现有100-op公开LSP runner
增加默认关闭的`--post-idle-reference`。公开CLI RED：未知参数导致
`node --test tests/replay-settings-mixed-ops-cli.test.mjs`退出1；最小GREEN让
runner在最后一次编辑后等待sidecar提交**严格大于**该次fallback基线的代次，
再在相同server进程打开`common/index.ets`并查询HomeInitData的另一已知
usage位置（零基UTF-16 `284:23`）。该位置和新打开文档版本使结果缓存不
掩盖索引路由；runner分别检查完整9-location oracle、`cache.miss`、
`index.recovered`、`index.accepted`、`candidateMode=indexed`且无fallback。
修正等待时间曾误包含随后查询的观测错误后，又以CLI测试RED→GREEN固定
`waitMs`和`queryMs`分离；定向测试6/6 GREEN。

真实Settings `ecc550df…d9`、API24 SDK声明digest `8098b8ab…c6e4`、
相同server/sidecar产物和manifest下，off及experimental各独立新进程
100-op回放均PASS：100/100 primary definitions、11次正常references与
新增post-idle references均9/9 exact、正常诊断、原工程clean、退出0。
off的索引代次7→8，experimental为9→10；两者新增请求均明确走indexed
而非legacy。首次两份原始JSON的`waitMs`字段误含查询耗时，只能使用
timeline计算近似等待或以LSP request的`elapsedMs`读取查询时延，不能
把该字段当索引等待。修正后的第三个独立off进程为代次9→10、
`waitMs=10,774`、`queryMs=5,432`、LSP request `5,431.002ms`，
仍9/9 exact且路由完整。原始JSON、SHA、逐阶段成本及复现命令见
[S05诊断报告](../reports/2026-09-30-s05-settings-context-trace-diagnosis.md)。

这证明当前已ready的Settings工程不是“一次编辑后整会话永久legacy”；
但10秒量级的catalog catch-up和5秒量级的indexed冷请求未达500ms。
单对A/B及第三次off不满足随机多会话、PSS、post-eviction或原始>3GB门禁。
本切片定向CLI测试6/6 PASS；首次沙箱内`pnpm check:fast`因macOS `ps`
不可用导致采样型端到端用例超时，不能计为GREEN。在允许外部进程采样的
同一机器上，先对失败所属5组测试复核61/61 PASS，再完整运行原命令
`pnpm check:fast`：**1,201/1,201 PASS、0 skip**。`git diff --check`通过，
新增手写script/test均≤500行。S05仍IN_PROGRESS、reuse默认off，S03仍BLOCKED；
没有提交、推送或合并。

## 当前构建 S05 复测输入（2026-10-03）

Parent revision仍为`911ae43c274175614559b63f0311504747d8393d`，在已有dirty
工作树上只新增固定benchmark manifest与更新证据文档，未改生产语义行为。
旧guarded manifest的公开CLI先以`BENCHMARK_BLOCKED=SERVER_MISMATCH`、exit2
拒绝当前build（无语义请求）；新增当前build manifest后，
`node --test tests/replay-settings-mixed-ops-cli.test.mjs`为6/6 PASS。
首次沙箱内真实回放因`spawn EPERM`在首个外部RSS样本前FAIL，保留为环境失败，
不写入A/B。获准采样后，同一Settings/API24/9-location oracle的两对反序
trace-off真实Content-Length stdio回放均100/11/11 exact、正常诊断/L3/退出；
另有同build trace-on off/experimental各一臂作归因，不能替代trace-off门禁。
固定产物、四份原始RSS曲线/Location与P95及局限见[唯一S05报告](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)。
实验复用仍默认关闭；本轮未跑完整`pnpm check:fast`，不申请合并。
