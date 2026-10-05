# S05：context 生命周期与相容磁盘 LS 复用实验

日期：2026-09-29。当前状态（2026-10-05）：**S05 相容磁盘 LS 候选评估已收口／REJECTED；仅观测与默认关闭的原型已实现，生产能力未实现、未毕业**。下文的 `IN_PROGRESS` 是各历史检查点当时的状态。
S02 public-checker投影FAIL与S03 BLOCKED保持不变。以下第一检查点不修改默认策略、
缓存/语义加载、预算、worker数量、SDK或工程边界；没有commit/push/PR/merge/Issue写入。

## 实现与边界

现有`ARKTS_REFERENCES_TRACE=1`才输出`semantic.context.create/reuse/trim/evict`。
字段为contextSequence、reason、leaseCount、residentContextCount、monotonicNs及
现有trace附加的rss/heapUsed；不写source或新增路径字段。
sequence只标识同一Coordinator内context/LS生命周期，不是compiler Program identity，
不意味着同一Program/Checker/AST被复用，也不跨worker重启保持身份。
默认关闭时不构造字段或调用compiler查询；observer异常不能改变查询成功或回收。

既有reset条件等价抽入`type-context-reset.ts`；reason包括document-store-reset、
canonical-owner-change、reset-epoch-change、content-revision-change、sdk-configuration、
prepare-failed、memory-level2/3、capacity-lru、reference-dispose与shutdown。
本轮公开测试直接覆盖内容、SDK、L3与references原因，未声称覆盖每个reason。
shutdown日志传回parent不保证完成，不能把此机制当durable eviction audit。

## 固定环境与输入

HEAD/parent：`911ae43c274175614559b63f0311504747d8393d`，分支
`codex/references-resident-fast-path`，已有dirty tree保留；不是纯HEAD build。
Node v26.3.0、pnpm8.3.1、Darwin25.6.0/x64，i7-9750H、12logical CPUs、16GiB RAM。
实际backend alias为`ohos-typescript@4.9.5-r10`；无包/lock/后端升级。

Settings：`.bench/real-projects/settings-ecc550`，commit
`ecc550dfaed880e04e38a2477eb7235cd50475b9`，前后clean。
声明compile23/target20/compatible20；本轮使用用户授权的API24兼容轨，
不是API23/DevEco语义等价证明。SDK路径
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，API24/6.1.1.125。
query：`common/src/main/ets/sendable/HomeInitData.ets`，`HomeInitData`，
zero-based UTF-16 **16:13**，includeDeclaration=false，既有9-location oracle。

冻结manifest：[settings-homeinitdata-context-lifecycle-api24.json](../../bench/references/manifests/settings-homeinitdata-context-lifecycle-api24.json)。
两arm来自同一build，完整启动参数、有效ARKTS环境、PID、原始请求、diagnostics、
规范化位置、timeline与memory.samples在原始JSON；不能只按HEAD复现dirty build。

| 身份 | SHA256 |
| --- | --- |
| server inputs | `63254a0028d7a55198be447dd3a2dddafe9563c42d4a455561bbde215ac158d2` |
| workspace files | `4becf56cb2ff65cc58bd1ae53b6937b194f9020770ad397e526f3a51b85b0d40` |
| server.cjs | `14855eb0b6c99eb1bf7d43bde91b529a93d1dd1c4731770f67c1f9ce0b6691c3` |
| semantic-worker.cjs | `7b36e9011316a37b7123636b501e7b2748856d53c7c4de91cbe0c368b65836f1` |
| reference-verifier-worker.cjs | `d1aef7269d636e965a67dfe9181af64d6ca5b24e7c2019008e8725fa8707e513` |
| standard library | `ea78beea2aa84f93fe66645465c37eb916028b79cd9fe898d469bdf54efbf97d` |
| sidecar | `18f871605571c246ce5667f5aa65c9f4b3b851235c87ae83cf794fbb85adf6b1` |
| backend runtime | `af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc` |
| lockfile | `ece84ab0afea7a411c453aac7371f0e47381455c5e3cc03f639adff9d2bf1131` |
| SDK declarations | `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4` |
| target source | `8159f9be58985d71e76cb7507fb1bf421a47cacb6aaf99cbddb9e6efc703774f` |
| oracle | `58908aa4ee2554864cd4467ccf7a51b3aa8e6dd570fc0f66decc6500bf7f937b` |
| memory gates | `ac23114be952a5fe5c030040937d3c97aec1cecdda2ba42e4dbb854f89b37570` |

## 两个串行真实回放

ModeB：fresh Node/private index cache → candidate catalog ready → didOpen →
completion → definition → references → 正常diagnostics/idle → shutdown。
实际请求是textDocument/completion、definition、references，不是workspace/symbol
或documentSymbol；正常自动诊断保留。candidate-ready不推出semantic-ready。
每arm仅1新进程、先on再off；无随机化，不报告P95、CI或trace overhead因果收益。

| 实测项 | trace-on | trace-off |
| --- | ---: | ---: |
| target Node PID / sampler PID | 50470 / 50471 | 50802 / 50803 |
| completion客户端完整响应ms | 11,785 | 11,006 |
| 预热definition客户端完整响应ms | 90 | 48 |
| references客户端完整响应ms | 4,941 | 4,647 |
| exact references | 9/9 | 9/9 |
| target v1 diagnostics / process exit | 0 / 0 | 0 / 0 |
| sampled Node PID peak bytes | 1,150,054,400 | 1,153,142,784 |
| sampled server+sidecar tree peak bytes | 1,199,521,792 | 1,200,357,376 |
| sampler peak bytes（不加入产品） | 120,868,864 | 120,172,544 |
| harness peak bytes（不加入产品） | 74,731,520 | 73,515,008 |
| actual samples | 181 | 178 |
| actual interval P50/P95/max ms | 151 / 169 / 210 | 148 / 162 / 267 |

两arm全部9个URI+range集合相等、位置合法，正常shutdown、failure=null；SDK selected各1次。
现有runner只记录completion/definition预热的无error响应和时间，不保存/验证其payload；
Settings这两项不是exact oracle证据。注释编辑的LS复用/移位导航来自公开fixture测试，
本Settings pair无编辑、只有v1，不挪作edit-warm或完整ready桶验收。
外部sampler请求50ms但实际约150ms；采样peak只是观测下界，不是精确50ms峰值。
worker_threads RSS含在同一Node PID内，只计一次；server+sidecar不是含Zed的全产品，
Mac RSS不是PSS。原1024MiB为策略预算、不是硬进程上限；两armNode峰值超过该数。
无强制GC、heap snapshot、deadline延长或memory gate放宽。
前后只读pmset均CPU限制100%/12核/速度100%，swap使用50.75MiB未变；
不是全程温度/后台负载控制。沙箱ps/sysctl曾EPERM，获准外部只读采样后均无sampler stderr。

trace-on的因果定位限于：create seq1 → 5次acquire reuse seq1 →
`reference-dispose` evict seq1（lease0）→ 1个transient verifier batch。
5次acquire包含prepare/query/diagnostics，不等于5个用户请求。
completion/diagnostics当时Program为2261 SourceFiles（1496project、652SDK、113other），
这是现有compiler trace，不是新增observer构造的Program。
reference batch为674 SourceFiles/151project，ProgramReady4,163.758ms，
其中createProgram3,608.852ms；query85.551ms。ProgramReady与createProgram重叠，不能相加。
这支持“本轨references成本主要支付准备”，不证明保留该完整interactive Program
安全或能改善首次global query，也不把同一LS误当同一Program。

## 复现命令

在固定checkout、SDK、当前dirty source/build及sidecar已就绪时执行；输出用新路径，
不覆盖本轮证据。trace-off删除`--trace`并在env加`ARKTS_REFERENCES_TRACE=0`。

```sh
/usr/bin/caffeinate -i env \
  ARKTS_REFERENCES_STRATEGY=indexed-batched ARKTS_REFERENCES_BATCH_ROOTS=64 \
  ARKTS_REFERENCES_DEPENDENCY_PROFILE=closure ARKTS_REFERENCES_SDK_AMBIENT_PROFILE=full \
  ARKTS_REFERENCES_CONTEXT_RETENTION=dispose ARKTS_MEMORY_BUDGET_MB=1024 \
  ARKTS_REFERENCES_ANCHOR_REUSE=0 ARKTS_REFERENCES_RESIDENT_FAST_PATH=0 \
  ARKTS_REFERENCES_CONSTRUCTOR_SCOPE=0 ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=0 \
  ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=0 ARKTS_REFERENCES_WAIT_FOR_INITIAL_CATALOG=0 \
  node scripts/bench/replay-references.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets --symbol HomeInitData \
  --line 16 --character 13 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-homeinitdata-context-lifecycle-api24.json \
  --mode B --catalog-state ready --timeout-ms 180000 --diagnostic-timeout-ms 180000 \
  --idle-ms 1000 --sample-interval-ms 50 --trace \
  --out .bench/semantic-ready-s05/settings-context-replay-new.json
```

原始证据：`.bench/semantic-ready-s05/settings-context-trace-{on,off}.json`。
on SHA256 `77b783ac98b08a12f8a493ff811a146d14fc265d99a3bbf89fc6fe9391ec045a`；
off SHA256 `d4d0e34072c313a8f369df10331c458791873d78f7a2bcb95f2ea432c4cd1d59`。
manifest SHA256 `551c702b58e4368a5a7d2dfe9555eb3d9b59e9a3944aca0cb6d8a65959db6626`。

## 验证与下一切片停止线

公开focused **37/37 PASS、exit0**，0fail/cancel/skip/todo；
本轮whole-fast **1160/1161 PASS、1 FAIL、exit1**，0cancel/skip/todo，
duration `1578142.060128 ms`。不能用focused或隔离重跑改标whole PASS。
RED/characterization与命令见[TDD](../tdd/semantic-ready-context-lifecycle.md)。
输入postflight共17项与preflight一致，Settings仍clean。
范围外1071份tracked/untracked文件摘要前后一致：
`08c2fd9741ce1fc5e29813e4097b11a3a8284fe7f821b169c0ca6a0aff132328`。
本轮修改的手写source/test/registry共7份，分别491/21/168/39/167/254/290行，
均≤500，type-engine仍491未增长。六份阶段Markdown链接检查和diff whitespace通过。

whole失败为`references-completeness.test.mjs:60`的403-file窗口覆盖公开用例，
不是本轮真实Settings回放。原始请求2（false）耗18,449.68ms、返回2位置；
请求3是0.62ms cache hit；请求4（true）重新miss，经2,665.15ms的isolated
anchor得到0 definition后进入保守完整fallback，在原20,000ms客户端deadline超时。
请求5与四个结果的manual exact assertions尚未执行；不能把2个返回位置当exact PASS。
这是response timeout，不是已证明的错误Location/协议/进程退出，也不能据此断定
本轮观察点导致回归或唯一归因于宿主。

原deadline独立新进程隔离命令如下；复核结果保留在同目录的
`struct-isolated-original-deadline-{1,2,3}.log`，不改source、SDK、flags或golden：

```sh
/usr/bin/caffeinate -i node --test \
  --test-name-pattern='finds unopened rewritten struct references beyond resident and lazy windows' \
  tests/semantic/references-completeness.test.mjs
```

三个独立复核均1/1 PASS、exit0、0fail/cancel/skip/todo，
总duration分别33,027.769ms/33,265.263ms/33,533.644ms。
超时在whole中观察到1次，三次隔离均未重现；跨运行模式的间歇/时序性尚未归因，
不是稳定复现，也不是以隔离PASS关闭whole失败。
排名假说（未确认）：完整fallback本就接近deadline → worker/准备/IO等耗时波动 →
S05处置/关闭观察点回归。前两者预测相同输入会跨20s边界；第三者须有仅S05增量
的差分证据。源码核对表明trace-off observer为undefined，早退于字段/clock/memory
构造，reset条件等价；失败两个retention点均residentBefore0/remove=false。
这降低第三项可信度，不代替before/after实验或根因证明。
第一检查点保留whole FAIL和未确认归因；未改deadline/禁诊断/切策略来消除测试失败。

日志SHA256：focused `55eade93b043e217bb7b3fbdb939c4a08ff364c91635151d32892f9b7d47a770`；
whole `0ff3ab2b4095c4ca333c8c05e4628a8407ce68a283a8a795a8f1aba8b9dfc60e`。

普通未保存comment已复用LS，不重做已有功能。下一默认关闭实验须先证明
相容磁盘delta对所有context完整交付，防止别的prepare消费delta后错误热复用；
配置/SDK/边界不安全仍重建。不能只删contentRevision reset来得到速度。
完整references仍需coverage证明；局部LS只能作局部/anchor复用。
随机trace-off A/B、≥100编辑/模块/压力/取消、post-eviction/PSS、Worker-shell/LS收益
均NOT_RUN；没有S05毕业、500ms整体达标或ADR0003 supersession。
S01 ready FAIL/覆盖缺口、S02反例、原>3GB/最终50%等门禁仍开放。

## 第二检查点：完整交付的 compatible-disk LS 原型（推进至2026-09-30）

后续“继续下一阶段”推进S05自己的受预算复用支线，不推进被S02阻断的生产facts/schema。
`ARKTS_SEMANTIC_SESSION_REUSE=off|experimental`在现有runtime集中解析，默认off。
原SDK full、indexed-batched+closure、dispose、per-batch transient verifier、并发、
1024MiB预算、diagnostics、结果完整性和deadline全部保留。

既有普通overlay comment本来就复用LS；新增的是已知既有磁盘source的完整delta。
DocumentStore只对同lexical root、无overlay、ordinary changed生成一次性from/to span，
保留原bounded changed/removed/reset owner。consumer须验证owner/epoch、已应用起点、
当前终点、精确path集合，且所有changed文本本次非overlay交付。
丢失/已被另一alias消费的delta、未交付的compiler-only依赖、未知路径、create/delete、
project/SDK/owner变化仍重建。只靠最新非空delta不足以证明完整交付。
审查进一步发现，未知source删除若不推进revision，会留下前一batch的相容span，
或在下一已知change重新生成span。四顺序×两策略public RED为2PASS/6FAIL；
错误是reset/policy合同，删除后的definition实际已为空，不能冒称错误Location复现。
最小durable修正让所有非overlay in-root source删除沿原changedRoots推进revision，
不改removedPaths预算/既有membership范围；standalone、前后顺序及中间消费均8/8GREEN。

Compiler host resident版本加入per-file disk revision和已有source SHA。
这是防脚本重插及跨LS counter重置的版本碰撞，不是第二文本缓存或第二语义世界。
独立静态审查未发现该restricted prototype额外correctness blocker；
off仅撤销复用准入，version composite、未知source删除fence与bookkeeping抽取两arm共同执行，
不应将关开关等同回滚旧产物，也不应把同build对照当共同改动的因果归因。
RED先后实测了disk移位wrong range、triple-slash依赖仍返回旧行号、alias重建的诊断
使用旧offset；没有更改expected范围来过测试。完整TDD见[同一记录](../tdd/semantic-ready-context-lifecycle.md)。

公开fixture100次真实磁盘comment立即查询，每次人工URI+UTF-16范围精确且沿用同LS；
off/experimental类型变化→正常v3 TS2322→修复v4空diagnostics，导航集合完全一致。
SDK切换、L3仍创建新的LS；两alias的缺失delta必须重建；未交付声明必须重建。
contextSequence表示LS实例，不表示same Program/Checker/AST，也不证明complete refs coverage。

最终同build Settings trace-off off/experimental只重放原ModeB，无磁盘编辑；
用途为回归控制，不把时延差异解释为disk复用收益。
候选构建的`settings-session-reuse-{experimental,off}.json`保留，但不是最终guard build；
无未知删除fence的`*-final.json`也保留为中间build控制；
真正最新冻结构建使用单独`*-fenced.json`，不可覆盖或混用旧产物。
新manifest为[session-reuse regression](../../bench/references/manifests/settings-homeinitdata-session-reuse-api24.json)，
项目commit、API24/SDK digest、HomeInitData16:13和9-location oracle沿用上文冻结输入。
最新构建和控制的结果在本节后续表；原whole FAIL及三次隔离历史不改标PASS。

随机真实disk-edit/mixed operation A/B、≥100资源趋势、post-eviction/PSS、Worker shell和
Program reuse收益、原>3GB/最终50%以及500ms完整桶均未毕业。此第二检查点当时
whole-fast NOT_RUN；此前1160/1161的whole FAIL当时仍开放，没有commit/push/PR/merge或默认推广。

### 最新 frozen build 与串行回归结果

最新source的`pnpm check`、`pnpm build`exit0；focused **72/72 PASS/exit0**，
0fail/cancel/skip/todo，65,640.292ms。17公开LSP+4分层测试+51既有guards在同一次串行command，
日志`disk-delta-fenced-focused-green.log` SHA256
`95bc4c012c70fb857651205d15925b4c6815ed4332b73890bebb02ec9f644707`。
不是新whole gate；旧whole timeout未归因/关闭。

| 最新身份 | SHA256 |
| --- | --- |
| server inputs | `0792af0d1a600b53d0a557813a74ec1ec5de1aef2fac30640abd78cd22ee761a` |
| server.cjs | `b7d3404a8a6f1ee05565a39370757a2445536c6e05a8f74bf9b7ec9ec2364977` |
| semantic-worker.cjs | `aec33a87239a7e225d30aaf3299c47afdd760f110d3d6b15a89479e0680c0339` |
| reference-verifier-worker.cjs | `9db6259509197e46306e05ef3bf111eecfd1060393014f9a2b2e0c5bf47ab3b2` |
| session-reuse manifest | `cb151de615e543e2c1f5d4ae994cc7e2815cd6b699ff38fe550dad3367302082` |

其它SDK/backend/sidecar/lib/lock/gate/workspace/source/oracle身份沿用上文表。
17项pre/postflight相等，Settings仍clean；repo仍为dirty source，不凭HEAD alone重放。

| trace-off无编辑ModeB（每arm一个fresh进程，先experimental后off） | experimental | off |
| --- | ---: | ---: |
| target Node PID / sampler PID | 66038 / 66039 | 66415 / 66416 |
| completion客户端完整响应ms | 8,740 | 8,478 |
| warmed definition客户端完整响应ms | 33 | 33 |
| references客户端完整响应ms | 3,578 | 3,473 |
| exact references / target v1 diagnostics | 9/9 / 0 | 9/9 / 0 |
| sampled Node PID peak bytes | 1,159,487,488 | 1,170,980,864 |
| sampled server+sidecar tree peak bytes | 1,201,627,136 | 1,212,686,336 |
| sampler peak bytes（不加入产品） | 120,868,864 | 122,163,200 |
| harness peak bytes（不加入产品） | 75,030,528 | 75,456,512 |
| actual samples | 165 | 166 |
| actual interval nearest-rank P50/P95/max ms | 126 / 136 / 173 | 123 / 136 / 140 |

9个完整URI+range集合相等，validation.errors=[]，无sampler stderr、failure=null，
两进程均正常exit0。现有runner不验证预热completion/definition payload，33ms不能作
这两能力的exact oracle/ready验收。无disk编辑，不能说明新增复用命中或节省构建。
每arm仅1次，非随机顺序，不报告latency P95/CI或比前一build更快的因果结论。
sampler请求50ms、实际约123–136ms；峰值为采样观测下界，不是PSS/含Zed全产品。
整个Node PID RSS只计一次；两arm仍超过1024MiB策略预算，该值不是硬进程cap。
无GC/snapshot/换SDK/禁诊断/延长原benchmark deadline。

原始JSON在`.bench/semantic-ready-s05/settings-session-reuse-{experimental,off}-fenced.json`；
experimental SHA256 `41508687174d0e6a6774dfaca2e5d24bd8a1ea4bb76ad4412ce58913e69726b4`，
off SHA256 `dcf19a63791e329243bd2d9ace2e3979d4ad03c72b9625679d6f03ac944b3ef4`。
请求timeline、合法性与oracle差分、PID/env/启动参数、versioned diagnostics和
memory.samples保留；此前candidate/`*-final.json`为不同worker/input SHA的中间构建，
不混用。新回放时`--out`用不存在的路径，不能覆盖这些证据。

可执行最新回归命令（off仅替换第一项；不是实际disk-edit benchmark）：

```sh
/usr/bin/caffeinate -i env ARKTS_SEMANTIC_SESSION_REUSE=experimental \
  ARKTS_REFERENCES_STRATEGY=indexed-batched ARKTS_REFERENCES_BATCH_ROOTS=64 \
  ARKTS_REFERENCES_DEPENDENCY_PROFILE=closure ARKTS_REFERENCES_SDK_AMBIENT_PROFILE=full \
  ARKTS_REFERENCES_CONTEXT_RETENTION=dispose ARKTS_MEMORY_BUDGET_MB=1024 \
  ARKTS_REFERENCES_ANCHOR_REUSE=0 ARKTS_REFERENCES_RESIDENT_FAST_PATH=0 \
  ARKTS_REFERENCES_CONSTRUCTOR_SCOPE=0 ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=0 \
  ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=0 ARKTS_REFERENCES_WAIT_FOR_INITIAL_CATALOG=0 \
  ARKTS_REFERENCES_TRACE=0 node scripts/bench/replay-references.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets --symbol HomeInitData \
  --line 16 --character 13 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-homeinitdata-session-reuse-api24.json \
  --mode B --catalog-state ready --timeout-ms 180000 --diagnostic-timeout-ms 180000 \
  --idle-ms 1000 --sample-interval-ms 50 \
  --out .bench/semantic-ready-s05/settings-session-reuse-new.json
```

范围外1070份tracked/untracked byte inventory前后一致，digest
`c0c5259d4f47f7a84082a7fc93da0f4c73e53d660e69aad415ea10f746b0cbdc`；
不覆盖此前未提交改动。7份阶段文档本地链接与git diff whitespace检查通过。
手写新helper103/42/30行，runtime76、type-engine491、public tests386/217、
layer registry255/291均≤500。存量超限迁移债保留：DocumentStore2089→2057、
TypeScriptLS3629→3624；本轮分别抽出revision bookkeeping与compiler content-version owner，
没有机械切碎或放任增长，仍未满足这两文件最终500行目标。

第二检查点结束时，下一切片是用真实Settings受控磁盘编辑与独立exact/诊断oracle评估有效构建节省，
再做随机混合操作资源、post-eviction/PSS与原whole gate。未通过前不默认开启、
不转长驻verifier，也不把S03或500ms整体状态重标完成。

## 第三检查点：真实 Settings 单文件磁盘编辑（2026-09-30）

本检查点只验证前述 default-off 相容disk LS实验对真实工程的一次受控编辑。
输入是同一干净Settings commit `ecc550dfaed880e04e38a2477eb7235cd50475b9`、
API24/6.1.1.125 SDK（声明digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`）、
当前dirty server build及[冻结manifest](../../bench/references/manifests/settings-homeinitdata-disk-edit-api24.json)
（SHA256 `f414b08afccbec36c69087703331871b617af8a209895d18e7542498f9275fb4`）。
声明compile23/target20/compatible20仍是API24授权兼容轨，不宣称匹配API23或DevEco等价。
runner对原工程做clean/HEAD/source hash检查，创建private `git clone --local --no-hardlinks`
精确checkout，只在临时clone内给一个已存在的声明文件加一行普通注释；不是复制文件凑规模、
不修改模块边界，原Settings前后均clean。没有强制GC、heap snapshot、改SDK、禁诊断、
延长180秒bench deadline或改1024MiB策略预算。

真实请求光标是已打开的
`product/phone/src/main/ets/Setting/Home/controller/HomePageMenuManager.ets`
的`HomeInitData`，zero-based UTF-16 **40:37**；未打开的声明为
`common/src/main/ets/sendable/HomeInitData.ets`。先等catalog ready，
第一次`textDocument/definition`必须精确返回声明`16:13–16:25`，再等正常v1诊断；给声明磁盘文件
加前缀注释并发送`workspace/didChangeWatchedFiles` type2后，同一consumer立即请求definition，
必须精确返回`17:13–17:25`。随后`textDocument/references`
（includeDeclaration=false）必须与原9-location oracle按完整URI+UTF-16范围比较：
未编辑位置不变，声明文件内原line28的引用移至line29。未使用`workspace/symbol`
或`textDocument/documentSymbol`。正常v1诊断均有一个既存TS2339；不是禁用诊断后的时延。

首个trace-on实验报告`settings-disk-edit-experimental-trace-new.json`为**FAIL**：
当时harness在磁盘编辑之后才等待consumer v1 diagnostics，等到超时；两次definition与9个
references虽exact，不能把该run算PASS或称diagnostics正常。调整仅是等待顺序：
在磁盘编辑前等待原有v1诊断，不更改server、deadline、诊断能力或expected位置。
修正后的trace-on `*-trace-v2.json`两arm PASS、正常exit0，完整定义/引用及诊断一致。
事件显示experimental一直沿用contextSequence 1；off在内容变更时
`evict(seq1, content-revision-change) → create(seq2)`。sequence仍只是LS实例身份，
不证明同一个Program/Checker/AST被复用。编辑后两arm的references都记录
`references.index.fallback: workspace-changed`，所以此次global请求没有因local LS复用加速。

为测产品路径，再用trace-off按`off→experimental`、`experimental→off`、
`off→experimental`顺序各运行三次独立新进程；每个run有独立clone和private index cache。
六个run均PASS：定义前后精确、references **9/9完整范围相等**、正常v1 TS2339、
无超时/OOM、正常shutdown/exit0，原工程保护检查true。请求延迟是客户端完整响应，
以下峰值来自外部采样整个目标Node PID；worker_threads已包含其中，不重复相加。

| trace-off 指标 | off（三次） | experimental（三次） |
| --- | --- | --- |
| 编辑后definition ms | 1,828 / 1,810 / 1,811；中位1,811 | 283 / 281 / 276；中位281 |
| 编辑后references ms | 6,488 / 6,597 / 6,732；中位6,597 | 6,738 / 6,264 / 6,611；中位6,611 |
| 采样Node PID peak bytes | 786,817,024 / 796,368,896 / 795,774,976；中位795,774,976 | 789,925,888 / 800,473,088 / 796,004,352；中位796,004,352 |
| 采样server+sidecar tree peak bytes | 1,043,832,832 / 1,052,467,200 / 1,053,790,208 | 1,046,216,704 / 1,056,210,944 / 1,050,456,064 |
| 外部sampler实际interval中位ms | 121 / 124 / 124 | 123 / 120 / 122 |

这支持**此冻结工作负载下编辑后local definition可沿用相容LS，并缩短约1.53秒**；
实验路径仍有281ms中位，不能由三次样本宣称P95≤500ms或一般工程达标。
references中位没有改善，约6.6秒，S05整体/全局references/500ms均未毕业。
Node RSS两arm中位几乎相同，也不是PSS、DevEco/含Zed产品峰值或最终内存gate证明。
sampler请求50ms，但实际中位120–124ms，采样峰值只是观测下界。
只做一次受控编辑，没有≥100真实混合操作、模块切换、取消、L3/post-eviction趋势。

可执行当前构建trace-off单arm复现命令；`--out`必须是尚不存在的路径，
要做off对照则同时替换`--session-reuse`和输出文件名。runner拒绝额外未控
`ARKTS_*`环境变量，并把实际有效值、PID、请求方法时间线/事件、全部规范化Location及
memory.samples写入JSON：

```sh
/usr/bin/caffeinate -i node scripts/bench/replay-settings-disk-edit.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --manifest bench/references/manifests/settings-homeinitdata-disk-edit-api24.json \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --session-reuse experimental \
  --out .bench/semantic-ready-s05/settings-disk-edit-experimental-replay-new.json
```

原始报告：`.bench/semantic-ready-s05/settings-disk-edit-{off,experimental}-trace-v2.json`
与同目录`settings-disk-edit-{off,experimental}-traceoff-{1,2,3}.json`；
consumer baseline在`settings-consumer-homeinitdata-baseline-new.json`。
原始六次真实回放的runner CLI及test-layer测试7/7 PASS，`pnpm check` exit0。
其后runner单独增加安全RED/GREEN：新报告目标的canonical parent若落在原Settings
或SDK内部（含symlink别名）就拒绝；`git status`不可用时fail closed，不能误判
原工程clean。新增四个CLI安全用例；不更改语义server、既有六次回放的结果或默认。
此前当前工作树完整`check:fast`曾1,177/1,177 PASS，但它在安全补丁之前，
不能作为补丁后最终门禁。补丁后的首次沙箱内重跑遇到macOS `ps`权限拒绝，
导致采样/回放测试失败并被停止（exit1）；这是**环境无效尝试**，
不计作代码回归、通过或产品测量。

在获准的macOS进程采样环境，最新当前工作树执行
`/usr/bin/caffeinate -i pnpm check:fast`：**1,181/1,181 PASS、exit0**，
0 fail/cancel/skip/todo，duration `1,195,387.333352 ms`。这是安全补丁后
当前源码的完整回归门禁，取代“当前源码whole-fast未过”的状态；
前述1160/1161 FAIL仍作为旧构建/旧运行的历史事实，不能改写为PASS。
隔离三次通过与最新whole GREEN均不证明原20秒struct请求超时的根因。
最新完整门禁仅有已完成的PTY输出，未另存raw log或SHA；不虚构日志工件身份。
安全补丁后额外一次真实experimental trace-off smoke
`.bench/semantic-ready-s05/settings-disk-edit-experimental-final-safety.json`为PASS/exit0：
前后definition exact，编辑后284ms，references9/9 exact且6,423ms，正常v1 TS2339，
原Settings保持clean，采样Node peak 784,285,696 bytes。它只证明新runner安全检查
未阻断这一次有效输入；不是新的off/experimental配对、P95或内存毕业样本。
安全补丁后没有重新采集六次Settings性能曲线，不能把旧曲线标为新runner的复测。
仍须按S05退出条件完成随机≥100真实混合操作、
压力/取消/post-eviction/PSS、完整gate和原>3GB/最终50%门禁，才可评审默认切换；
`ARKTS_SEMANTIC_SESSION_REUSE`仍默认off，per-batch verifier和ADR0003未变。

## 第四检查点：真实 Settings 100 次混合操作与 L3（2026-09-30）

在上述同一dirty server build、干净Settings commit、API24 SDK和9-location oracle下，
新[冻结manifest](../../bench/references/manifests/settings-homeinitdata-mixed-ops-api24.json)
SHA256为`309b92eb6fdb3f48872d7ba80dfe381adb0ec546d722ad9c53d00f1ee6865175`。
两个trace-off arm各用一个独立持久LSP进程、独立private `--no-hardlinks` clone和
private index cache；原Settings前后保持clean。100次实际磁盘comment开/关编辑均立即
`workspace/didChangeWatchedFiles`与`textDocument/definition`，每十次在`common/index.ets`
做跨模块definition和9-location references，最后第100次也各做一次；第50次请求
`arkts/benchmark/applyMemoryPressure` Level3并检查ack，第51次检查精确恢复。
seed只控制comment payload，检查点位置固定；schedule digest两arm相同：
`64c27ccc8e4d06078f723de67268af746403f6e170036d95b7073b4508b9e42e`。
这不是随机交替多组A/B。正常自动诊断保留：phone consumer v1的TS2339完整
code/category/range/message exact，common/index v1为空；不混入symbol/documentSymbol请求。

| 同manifest固定顺序，先experimental后off；各1进程 | experimental | off |
| --- | ---: | ---: |
| 回放状态 / 100次primary定义 / 11次引用 / 11次secondary定义 | PASS / 全exact | PASS / 全exact |
| L3第50次ack / 第51次定义恢复 / shutdown | exact / exact / exit0 | exact / exact / exit0 |
| 编辑后primary定义中位ms（各100次） | 311.815 | 261.549 |
| references中位ms（各11次） | 6,698.945 | 6,007.669 |
| 外部采样Node PID peak RSS bytes | 2,146,119,680 | 1,341,296,640 |
| 外部采样server+sidecar tree peak RSS bytes | 2,408,230,912 | 1,587,929,088 |
| 采样数 / 实际interval中位ms（请求50ms） | 1,797 / 127 | 1,545 / 128 |

实验Node采样峰值为off的**1.600倍**，超过ADR0003/S05沿用的≤1.10门禁；
本次实验arm的primary定义与引用中位也都慢于off，不能据上一检查点的一次编辑收益
推广default。`serverEvents`中`sdk.selected`计数experimental/off为52/118，
仅是部分context重建减少的代理，不证明Program复用或RSS差异由它造成。
实验op42–50的primary定义每次约1.7–2.0秒，nearest-sample RSS从
op42完成约1.16GB至op49完成约2.06GB；Level3后op51仍精确，op52完成约548MB。
这只描述此回放中的阶梯增长与回落，不证明Program/Checker具体保留根因、真正稳定平台
或跨会话无泄漏。单次固定顺序A/B与实际127–128ms采样不能给P95/置信区间、
精确瞬时峰值或因果归因；Mac RSS也不是PSS/含Zed产品内存。虽然完成100次并保持结果
完整，**资源门禁明确FAIL，S05保持IN_PROGRESS、默认off**；不能声称500ms、
post-eviction PSS、原>3GB/50%门禁毕业。独立queue-start取消控制见下，
不冒充100次混合操作中的verifier中途取消。

原始完整请求/诊断/Location、每样本RSS及timeline：
`.bench/semantic-ready-s05/settings-mixed-{experimental,off}-pinned.json`，SHA256分别
`23216bb6d0361345dfa0565ca16235ac3af4995e53d189a631f7a568bb38dd34`和
`89d0ca3671b3d1b0c897a3ebff2ecb78721001f6b09fb22229908041862fabaa`。
首次pre-freeze exploratory run不属这对固定输入，不用于对照。复现时用新`--out`路径；
默认off仅改`--session-reuse off`和报告路径，不覆写原始证据：

```sh
/usr/bin/caffeinate -i node scripts/bench/replay-settings-mixed-ops.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --manifest bench/references/manifests/settings-homeinitdata-mixed-ops-api24.json \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --operations 100 --session-reuse experimental \
  --out .bench/semantic-ready-s05/settings-mixed-replay-new.json
```

同manifest/schedule/产物又独立复核一次**experimental-only** 100次回放，
`.bench/semantic-ready-s05/settings-mixed-experimental-repeat2.json` SHA256
`9cff7e5bc87e6b24097d6c35ec481bfb3f1d4d62056872d086c6c30f7f005d96`。
它再次PASS全部100/11/11 exact、正常诊断、L3 ack/恢复与退出；外部Node峰值
1,796,046,848B（1,849样本），仍高于唯一off对照峰值的1.339倍。
这是不同时间、无第二次配对off的同臂复核，不把1.339当成随机配对估计；
两次experimental峰值差异也表明需要进一步定位内存阶段和控制运行条件。
100次primary定义中，>500ms分别为首对experimental 22次、off 2次、
第二个experimental 22次；这是逐请求计数，不是会话P95/产品SLO结论。
三条references约90秒的异常值分别在首对的op100与复核的op81，均记录
`references.index.fallback: candidate-ineligible`；其它检查点约5–9秒。
这是同时出现的trace关联，不证明fallback是唯一或直接耗时根因；须分阶段再诊断，
不能通过截断结果、禁用诊断或抬高deadline隐藏异常。
本切片新runner的公开CLI/分层focused 6/6 GREEN、`pnpm check` exit0；
其后whole-fast 1,191/1,191 PASS；最新证据guard另有focused GREEN，未重跑whole-fast。

独立trace-on、`session-reuse=off`取消控制后来完成：原始
`.bench/semantic-ready-s05/settings-cancel-off-control.json`，SHA256
`b33dd8b94ff0eaa8c353b0664f1b3b485481c325bd90911809d81eb16dd709a1`。
真实Settings同manifest/SDK/产物；显式LSP请求id 2在日志
`references.queue.start`后发送`$/cancelRequest`，响应error.code=`-32800`且无result。
随后独立新references9/9完整exact、definition exact、正常v1 TS2339，原工程clean、
exit0；170个外部RSS样本的Node峰值795,377,664B。此控制**只证明queue-start
阶段取消与后续恢复**，没有证据说明取消时已经进入verifier batch，也不是
experimental arm、100次混合操作的取消交错或其内存门禁复核。
第二个独立trace-on/reuse-off控制在同一traceId的
`references.batch.start`（session1/batch0）后、batch.complete前取消显式LSP id2：
`.bench/semantic-ready-s05/settings-cancel-off-batch-control.json`，SHA256
`5a73c994712289143f527735723246ff43c80ce441eaa1726fe9057eba67b7b5`。
该run同样PASS：唯一终态`-32800`/无result，随后fresh refs9/9、definition exact、
正常v1 TS2339、原工程clean/exit0；171个Node RSS样本峰790,978,560B。
这是**off策略batch已调度后的取消控制**；该事件在verifier创建前，不证明experimental arm、
任意batch边界或100次编辑期间交错取消全部通过。

相同冻结输入的[独立trace-on生命周期诊断](2026-09-30-s05-settings-context-trace-diagnosis.md)
逐请求对齐create/evict/L3/RSS；其采样值不与上述trace-off性能门禁直接比较。
该独立诊断已追加2026-10-03真实Settings post-idle indexed恢复、两次Program准备的
阶段计时与观测计时纠错；S05仍IN_PROGRESS，实验默认off。

## 当前构建复核：相容磁盘 LS 复用的时延回归（2026-10-03）

新[固定manifest](../../bench/references/manifests/settings-homeinitdata-mixed-ops-api24-s05-current.json)
SHA256 `3850a87c1d3448272d9aa76aed98d022b7b36e8c9f6f81b3e1248c9b80a63998`
锁定dirty HEAD `911ae43` 的 server `74d195ba…b9562`、semantic worker
`7268c7e2…ae42ed`，仍用干净Settings `ecc550d`、DevEco API24 `6.1.1.125`、
同一9-location oracle与100次操作schedule。旧guarded manifest在此构建上先以
`BENCHMARK_BLOCKED=SERVER_MISMATCH`退出（无语义请求）；首次受限采样尝试也在
首个样本前因`spawn EPERM`失败，均不计入下面的结果。获准外部PID采样后，
两对独立进程按off→experimental、experimental→off反序执行；每次均使用
private no-hardlinks clone及index cache，原Settings保持clean。

| trace-off；每臂100编辑、11引用、11跨模块定义 | Pair 1 off | Pair 1 experimental | Pair 2 off | Pair 2 experimental |
| --- | ---: | ---: | ---: | ---: |
| 真实LSP/精确结果/正常诊断/L3恢复/退出 | PASS | PASS | PASS | PASS |
| 编辑后primary definition P95 ms | 277.9 | **1,656.9** | 271.9 | **1,608.3** |
| 100次定义中`>500 ms` | 2 | 24 | 2 | 11 |
| references中位ms | 5,296.4 | 6,013.9 | 5,396.7 | 5,336.6 |
| 目标Node PID采样峰值RSS bytes | 2,102,009,856 | 2,268,606,464 | 2,210,217,984 | 2,052,845,568 |
| experimental/off峰值比 | — | 1.079× | — | 0.929× |

四份不可覆盖的原始报告依次为
`.bench/semantic-ready-s05/settings-mixed-current-pair1-{off,experimental}-escalated.json`
和`settings-mixed-current-pair2-{experimental,off}-escalated.json`；SHA256依次为
`e5cd76804661f15aa5e63027c0b345ec62e77d5fab15c7a5c27149a5a510a072`、
`024796af05ec25660be4d802dc025d63252199085ad382e500e6a72cdb17ebfb`、
`97f6ad2efa8f91956cd695f8f807a9056333ce7838601f3f4f1157e51aadfcdf`、
`7bd5cdc994fa5f9b815642cc94f7f3836f3f1afb523c5251e480223223e54e74`。
四臂均100/11/11精确、正常版本诊断和Level3 ack/恢复；目标PID RSS采样覆盖
全部操作，最大间隙按表列序为232/165/159/141ms，worker线程RSS未重复相加。
这是两对反序而非随机充分样本；峰值比方向不同，不证明热复用稳定省内存，
也不能用Mac RSS代替PSS。但两对均出现定义P95约1.6秒，对当前热复用候选的
时延毕业门禁构成直接失败证据。单次编辑曾观察到的281ms收益不能覆盖这组混合负载。

同构建另做独立trace-on off与experimental各一臂，均100/11/11 exact且正常退出；
原始报告SHA256为`53008e93d471cdd5e9aa30088279ef162c2919a577eba316cac261ab5136b8c8`
与`dc1239aeccf9d13cc3ebfe32b4b8183b02ebc9b54094c9b4ed81eb6cce8e0ef4`。
在该**诊断运行**里，off的100次primary definition均新建context，却只有最初2次
超过500ms；experimental的64次慢定义都新建context，另外36次无新建的定义均
不超过500ms。慢定义约1.5秒落在`engine.define`，`entry.engine.prepare`约5ms；
所测Program均422个SourceFiles。大多数experimental慢窗口伴随`memory-level3`
evict。该关联说明“少创建context”并不保证低时延，且L3抖动值得单独验证；
不证明旧Program由谁持有，也不把trace-on RSS与上表trace-off门禁相除。
当前不启用实验复用、不改预算/Worker/GC或reference范围。S05仍IN_PROGRESS，
该相容磁盘LS候选未毕业；S02/S03与500ms整体状态不因此改变。

## 当前构建复核：定义尖峰的 compiler 阶段归因（2026-10-03）

Parent `c4df943e5ff9dc1d724bb2aee75d7c4a197efcf4`；仅增加默认关闭的
`semantic.definition.complete` compiler 计时。先在真实子进程 LSP 测试中要求
`createProgramMs/createProgramEvents/otherDefinitionMs`，原产物执行
`node --test --test-name-pattern='disabled lifecycle tracing preserves exact navigation' tests/semantic/semantic-context-lifecycle.test.mjs`
为 RED/exit1（字段缺失）；最小实现后相同命令 GREEN/1 pass，完整 lifecycle
focused 15/15 GREEN，`pnpm check` exit0。计时包裹实际 `engine.define()`，不预先
调用 `getProgram()`；fork 的 `PerformanceDotting` 只在 trace 开启时采集已发生的
`createProgram` 事件，`otherDefinitionMs` 仅是 `engine.define()` 内扣除该事件的
未细分余量（含其内部checker/候选映射），不包含后续结果合并，**不是**独立
`getTypeCheckerMs`。上游合并同类事件，所以 `createProgramEvents` 是事件组数，
不能用它断言一次查询究竟构建了几个 Program。关闭 trace 时不启用该 collector。

同一干净 Settings `ecc550df…0b9`、DevEco API24 `6.1.1.125` 兼容轨、九位置
oracle 与 100 次冻结操作，独立进程顺序跑 trace-on `off → experimental`。
[本次 manifest](../../bench/references/manifests/settings-homeinitdata-definition-compiler-trace-api24.json)
SHA256 `e3dedb6c421127e69875d1df05f69e2108f44518423519986d79f6ece229c8cf`，
固定实际 worker bundle `3e8455b3…2f`；仅 session-reuse flag 不同。
两臂均 PASS：100 次磁盘编辑后 primary definition、11 次 refs、11 次跨模块
definition 全部 exact，正常版本诊断、L3 ack/恢复和退出均通过，原工程仍 clean。
首次受限运行的外部采样器未产出首样本，**没有发出 LSP 语义请求**，保留为
`.bench/semantic-ready-s05/settings-definition-compiler-trace-off.json` 环境失败，
不纳入以下统计。获准的外部采样请求间隔 50ms，两臂实际样本间隔中位均为 123ms。

| trace-on 诊断，不是性能毕业样本 | off | experimental |
| --- | ---: | ---: |
| 编辑后 primary definition 中位 / P95 | 255 / 281 ms | 249 / 300 ms |
| 100 次中 `>500ms` | 2 | 5 |
| 对应慢请求 `createProgram` | 1.33–1.48 s | 1.31–1.41 s |
| 每次 primary definition 观察到至少一个 `createProgram` 事件组 | 100/100 | 100/100 |
| Node PID 外部采样 peak RSS | 2,028,408,832 B | 2,152,054,784 B |
| server+sidecar tree peak RSS | 2,290,003,968 B | 2,426,044,416 B |
| 外部样本数 | 876 | 857 |

实验慢请求位于操作2–5、12；off 慢请求位于操作1–2。两臂其余大多数
`createProgram` 约 0.2s，Program 都报告 422 SourceFiles。由此**本次尖峰
主要发生在实际 compiler `createProgram` 期间**；单凭 Coordinator
`create`/L3 事件无法定量归因。此一对 trace-on 运行的实验臂尖峰少于
此前 trace-off 反序两对，说明操作时间分布不稳定，不能据 300ms 的本次 P95
推翻此前 1.657/1.608s 的失败门禁，也不能把 RSS 当 PSS 或宣称 500ms 发布目标达成。
实验仍默认关闭；S05 保持 IN_PROGRESS，下一次行为改动须先解释 compiler
冷热切换，并过 trace-off 反序、exact、1.10×资源及 post-eviction 门禁。

不可覆盖的原始报告（完整请求、Location、诊断、采样曲线与事件）：
`.bench/semantic-ready-s05/settings-definition-compiler-trace-{off,experimental}-escalated.json`，
SHA256 依次为 `f32a156009cd561954854461b5f67c0c7e8802097c55057dcfc32b953d952515`
和 `eb81b8caa8d4126c2cc7f70009638df1d8743fb32d1594ee1afbf058eb1f2d1b`。
固定构建仍在本机时可从仓库根目录重放；每臂必须使用新的输出路径：

```sh
/usr/bin/caffeinate -i node scripts/bench/replay-settings-mixed-ops.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --manifest bench/references/manifests/settings-homeinitdata-definition-compiler-trace-api24.json \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --operations 100 --session-reuse off --trace \
  --out .bench/semantic-ready-s05/settings-definition-compiler-trace-off-replay-new.json
```

将 `--session-reuse off` 改为 `experimental` 并更换 `--out` 即为第二臂。
本切片 `pnpm check:fast` 在获准的 macOS 进程采样环境完成
**1,207/1,207 PASS、exit0**（`1,116,548.281385 ms`），0 fail/cancel/skip/todo；
初次沙箱内整套尝试因多个外部采样用例无法获取 `ps` 首样本而中断/exit130，
不计为代码回归或通过。`git diff --check` 通过。新增 helper 为36行，
`type-engine.ts` 为500行，没有扩大既有超限 source。

## 启动前 watched edit 后的索引恢复切片（2026-10-03）

Parent HEAD `c4df943e5ff9dc1d724bb2aee75d7c4a197efcf4`，保留原有
未提交 S05 trace 改动。公开子进程 LSP 测试先在
`window/workDoneProgress/create` 回复前编辑未打开的 `Use.ets`，确保索引尚未
open。原产物运行
`node --test tests/semantic/references-preopen-index-recovery.test.mjs`
为 **RED 0/1**：首次请求精确、完整地 fallback；catalog 随后 ready 后仍缺
`references.index.recovered`，根因是 pre-open `index.status` 失败导致 dirty
水位未定义。不能把未知水位设为 0，因为磁盘上可能已有旧提交代次。

最小修正使 catalog 在真正启动前读取可信 committed/building 水位，绑定当时
最新的 watched-edit token；只在同一次 catalog 报 ready、提交代次严格超过该
水位后解除 dirty。期间任何未知或竞争仍走完整 fallback。新增测试验证编辑后
移位的精确 Locations、两种 `includeDeclaration`、两次 cache-miss indexed 查询
及正常退出；不改变默认策略、SDK 范围、worker 数或预算。`semantic-worker-proxy.ts`
由既有 614 行降至 613 行，相关变更分类归入索引新鲜度 owner。

`pnpm build`、`pnpm check`、定向公开/manifest **11/11** 与获准 macOS 外部
进程采样的 `pnpm check:fast` **1208/1208、exit 0**。首次受限沙箱整套运行
受 `ps` 权限影响中断，不能计作代码 FAIL 或 PASS。可选原生 sidecar
generation-race 测试的中间窗口被第三代 catalog 提前提交，原断言未满足；
该非确定性运行不构成新路径通过证据，旧持久代次加 pre-open 编辑仍需专门覆盖。

随后将该公开 LSP 用例强化为**旧代候选确实会漏文件**的对照：sidecar
先暴露 committed generation 1，在索引尚未打开时新增含 `Thing` 引用的
`Added.ets`；generation 2 被显式暂停，旧代候选不含新增文件。索引打开前及
新代提交前的请求都精确走完整 fallback；释放 generation 2 后，两种
`includeDeclaration` 经各自 cache miss 均走 indexed 路径并包含新增文件的
真实位置。负向控制曾故意让新代仍遗漏 `Added.ets`，测试按预期报告
两个位置缺失；恢复 fixture 后通过。最终 `pnpm check`、`pnpm build`、
索引专项公开 LSP 8/8 通过，fixture 490 行。该加强发生在上述
1208/1208 整套检查之后；整套数字不能冒充新 fixture 的复跑。此测试
使用脚本 sidecar 的内存 generation，不等于重开已有 SQLite 数据库的原生持久代次验证。

### 原生 SQLite 旧代次与 pre-open 编辑组合回归（2026-10-04）

新增公开子进程 LSP 测试
[`references-native-preopen-index-recovery.test.mjs`](../../tests/semantic/references-native-preopen-index-recovery.test.mjs)，
使用 release Rust sidecar 和同一 SQLite cache，连续五次独立运行均通过。
第一进程完成 catalog 并以 `workspace/symbol` 验证真实声明；第二进程在
`window/workDoneProgress/create` 回复前新增含引用的 `Added.ets`、watch-edit
`Use.ets`，且保持正常自动诊断。两种 `includeDeclaration` 均经完整 fallback
返回精确的 6／7 个位置，没有接受旧候选。回复后，第二进程的
`discovering.committedGeneration` 等于第一进程已提交代次，证明重新打开的是
同一持久旧代；新代提交后两种策略再次精确，均记录 indexed accepted，
并出现 `references.index.recovered`。测试已归入 `bundle-e2e` 常规测试层。

验证命令：
`node --test tests/semantic/references-native-preopen-index-recovery.test.mjs tests/semantic/references-preopen-index-recovery.test.mjs tests/release/index-sidecar.acceptance.mjs tests/test-layer-manifest.test.mjs`，
本轮 7/7 PASS；`pnpm check` PASS。原生新测试另经五次连续独立回放均 PASS。
此用例覆盖“启动前编辑 + 持久旧代重开 + 新代提交后的恢复”两个端点；
原生 catalog 对四个文件提交过快，尚未确定性覆盖“sidecar 已打开、旧代可查、
新代尚未提交”的中间窗口。该窗口仍由上述 scripted generation 测试控制。
这是 R-08 正确性回归，不是 Settings 真实工程、热 LS 资源毕业、500 ms 或
原始 >3 GB 内存门禁证据；没有修改生产策略。

另以干净 Settings `ecc550df…0b9`、DevEco API24 `6.1.1.125` 兼容轨做一次
新进程、catalog-ready、mode-A、默认 indexed-batched 回放：`HomeInitData.ets`
UTF-16 `16:13`，`includeDeclaration=false`，**9/9 精确 Locations**、正常 v1
空诊断、indexed accepted、退出 0。客户端 references 完整响应约 4.596 秒；
外部采样 server+sidecar 峰值 RSS 610,127,872 B，非 PSS／统计性时延门禁。
原始曲线与响应保存在
`.bench/semantic-ready-s05/settings-index-catalog-lifecycle-regression-20261003.json`
（SHA256 `9e4ccfcd07e3b09ac7a48387f32f15f8c991a1d3d6d0288f8a38aacb9993bbcd`）；
未用 manifest 预检 SDK declaration digest，故只作真实工程回归控制，
不是匹配 API23、pre-open 编辑或最终 500 ms／PSS 毕业证据。

阶段决策（2026-10-03）：相容磁盘 LS 保留这一**具体候选不予准入**。
两组反序、每臂 100 操作的真实 Settings trace-off 对照已显示实验臂
definition P95 1.608–1.657 秒、关闭臂 0.272–0.278 秒；单次 trace-on
compiler 事件不能推翻这个结果。后续不再通过重复采样同一机制争取放行；
开关保持 default-off，原完整 fallback、预算和 transient verifier 不变。
这只结束该候选的评估，**不是** S05 全部能力 IMPLEMENTED，也不阻止
独立且有新机制/新 RED 的安全切片；S02→S03 的精确性阻断仍在。

## 后续观测切片：LS 身份与 Program 身份分开（2026-10-03）

父修订仍为 `c4df943e5ff9dc1d724bb2aee75d7c4a197efcf4`；保留既有 dirty tree。
本切片只给现有 trace 的 `programFileStats()` 增加 worker-isolate 内的
`programSequence`：用 `WeakMap<Program, number>` 给**查询后已经取得的** Program
赋观察序号，不额外调用 `getProgram()`、不保留强引用、不改变 compiler 查询或
默认关闭的 trace。该值不是 `createProgram` 调用次数，不跨 worker/进程可比较，
也不能证明实际查询执行期间使用的 Program 对象身份。原有
`contextSequence` 仍只代表 Coordinator 的 LS 生命周期。

公开真实子进程 LSP 测试先要求相容磁盘复用轨在未修改的两次定义后观察同一
Program，磁盘注释编辑后在同一 `contextSequence` 下观察不同 Program。
旧构建运行
`node --test --test-name-pattern='experimental disk deltas keep a compatible LS' tests/semantic/semantic-context-lifecycle.test.mjs`
为 RED/exit1，首个定义缺少 `programSequence`；最小实现后该命令 1/1 GREEN，
完整 lifecycle focused 15/15 GREEN、`pnpm build`、`pnpm check` 和
`git diff --check` 均通过。本切片尚未重跑完整 `pnpm check:fast`。
fixture 只证明“同一 LS 不必等于同一 Program”；不证明编辑后旧 Program
被保留、发生泄漏，或该机制解释真实 Settings 的全部时延。

使用干净 Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9`、DevEco
API24 `6.1.1.125` 兼容轨、`HomeInitData.ets` UTF-16 `16:13` 再跑一次真实
Mode B（新进程→catalog ready→didOpen→completion→definition→references）。
[固定本次构建的 manifest](../../bench/references/manifests/settings-homeinitdata-program-identity-api24.json)
SHA256 为 `8b823c953f8101340a073131aa32a2307988214b16bacdb5112882e444deeae5`；
server/semantic-worker/verifier-worker bundle SHA256 分别为
`a27fad38ba94f4315473e58577ceba9526b9bb8d0e4b48fba179112e0d9f6ad4`、
`e1302435980e8848d41da5f2260a963ae3b4637e96efcb199068946ee56df202`、
`12b44f6c546fb4f2c8b1213976bca56dc32c4b50347a9ce5fb89786a5b301d6e`。
首次受限采样在首样本前 `spawn EPERM`、未发语义请求，保留
`.bench/semantic-ready-s05/settings-program-identity-api24.json` 为环境失败；
获准外部只读 PID 采样后的新输出为
`.bench/semantic-ready-s05/settings-program-identity-api24-escalated.json`
（SHA256 `adf8c7c507d8aefd08ae9485a5b3c04062e7c7819957ba97a62b34bb4caeb217`）。

真实回放 PASS/exit0：`textDocument/references` 9/9 精确 Locations，目标 v1
诊断 0，Settings 原仓仍 clean；请求完整响应 3,393ms，外部 194 个样本观察到
Node PID 峰值 RSS 1,127,804,928B、server+sidecar 同时刻树峰值
1,168,662,528B。worker_threads RSS 已含在 Node PID 中，不重复相加；
此为 RSS、非 PSS，也不是多次运行的 P95。交互定义在 persistent worker
观察到 `programSequence=1`、2,261 SourceFiles；一次 transient verifier batch
也报告 `programSequence=1`、674 SourceFiles，但**两者属于不同 isolate，数字相同
绝不表示同一个 Program**。本次无编辑、不构成真实 Settings Program 切换证据。
完整原始时间线、采样曲线和结果均在上述 JSON；既有相容磁盘候选仍 default-off
且不准入，S05 仍 IN_PROGRESS，S02/S03 与 500ms/资源发布门禁不变。

固定构建在本机可用时，从仓库根目录以新输出路径重放：

```sh
node scripts/bench/replay-references.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets --symbol HomeInitData \
  --line 16 --character 13 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-homeinitdata-program-identity-api24.json \
  --mode B --catalog-state ready --timeout-ms 180000 --diagnostic-timeout-ms 180000 \
  --idle-ms 1000 --sample-interval-ms 50 --trace \
  --out .bench/semantic-ready-s05/settings-program-identity-api24-replay-new.json
```

## SourceFile 身份与真实 Settings 磁盘编辑（2026-10-04）

父修订仍为 `c4df943e5ff9dc1d724bb2aee75d7c4a197efcf4`；原有未提交改动保留。
这是**仅观测、默认关闭**的切片：在既有查询后 `programFileStats()` 遍历中，用
`WeakSet<SourceFile>` 统计同一 worker isolate 已见过的 SDK／工程 SourceFile
对象。仅 `ARKTS_REFERENCES_TRACE=1` 才访问该 WeakSet；不增加
`getProgram()`／`getTypeChecker()` 调用，不持有 SourceFile 强引用。
`programSequence` 仍是观察到的 Program 身份，不是 compiler 构建次数。
公开真实 stdio LSP 测试先 RED（新字段缺失），后 GREEN；完整 lifecycle 文件
16/16、S02 磁盘 oracle 与既有 spike／测试分层聚焦 17/17、`pnpm check`、
`git diff --check` 均通过；本切片**未重跑完整 `pnpm check:fast`**。

沿用干净 Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9` 和 DevEco
API24/ETS 6.1.1.125，SDK 声明摘要
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`。
同一当前构建 `server.cjs` SHA-256
`a27fad38ba94f4315473e58577ceba9526b9bb8d0e4b48fba179112e0d9f6ad4`，
`semantic-worker.cjs`／`reference-verifier-worker.cjs` SHA-256 分别为
`fe4c07ab39deb3a01c9be44a67fd76631dd2fb5140c5e35330b68207956b2310`／
`5dc6e94772ce58f1257a62341b80ebdc18542682f1aa6841837463f4922e6680`；
sidecar SHA-256 `18f871605571c246ce5667f5aa65c9f4b3b851235c87ae83cf794fbb85adf6b1`。
两臂为串行、各一个新进程、trace-on、原工程无修改；脚本在**无硬链接私有克隆**
中给 `HomeInitData.ets` 前置一行注释，依次请求原使用位置
`HomePageMenuManager.ets` UTF-16 `40:37` 的 definition、编辑后 definition、
references，保留自动诊断。首次受限沙箱回放仅因采样器首样本 `spawn EPERM`
在语义请求前 FAIL；获准只读进程采样后以**新输出路径**重跑两臂 PASS。

| 单次观测 | experimental | off |
| --- | ---: | ---: |
| 编辑前／后 Program 序号（同一 persistent isolate） | 1 → 2 | 1 → 2 |
| 编辑后 SDK SourceFile 已见／首次见 | 306／0 | 0／306 |
| 编辑后工程 SourceFile 已见／首次见 | 63／1 | 0／64 |
| 编辑后 `createProgram` 事件时长 | 244.7 ms | 1454.7 ms |
| 编辑后 definition 客户端完整响应 | 298 ms | 1747 ms |
| 编辑后 references 客户端完整响应 | 6478 ms | 6207 ms |
| 精确 references／正常 v1 诊断／退出 | 9/9／1 条 TS2339／0 | 9/9／1 条 TS2339／0 |
| 外部采样 Node PID RSS 峰值 | 753094656 B | 805097472 B |
| 外部采样 Node+sidecar 树 RSS 峰值 | 1005498368 B | 1066217472 B |

两臂编辑前定义也均精确指向 `16:13`，编辑后精确移至 `17:13`；9 个引用
URI＋UTF-16 range 与移位 oracle 精确一致，原 Settings checkout 事后仍 clean。
worker_threads 已包含在 Node PID RSS，不重复加总；树 RSS 不是 PSS，也不含
Zed。请求采样间隔设 50 ms，实际采样约 120–155 ms，峰值是观测下界。
这些数据证明**这一次编辑下**实验臂的新 Program 复用了全部被观察的 SDK
SourceFile 对象和 63/64 个工程对象；不能证明旧 Program 已回收、TypeChecker
复用、AST 成本大小或总体时延因果。两臂各只有一次且开启 trace，不能推翻此前
两对反序、每臂 100 操作的 trace-off P95 失败；相容磁盘 LS 候选继续不准入、
默认 `off`，S05 仍 IN_PROGRESS，500 ms 与内存发布门禁仍未达成。

原始结果与完整请求／诊断／RSS 曲线保存在本机 `.bench/semantic-ready-s05/`：
`settings-sourcefile-identity-experimental-20261004-escalated.json` SHA-256
`64f4c3d5b833a47a05fc7d2701dbb0889a11b48ab5c47cab05fa1c322212b0ac`，
`settings-sourcefile-identity-off-20261004-escalated.json` SHA-256
`743484371b16eb6c2022633c6d69beedc8e8d202d2894f6ca4d0552902e03a87`。
沙箱失败报告单独保留，不混作语义结果。

```sh
node scripts/bench/replay-settings-disk-edit.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --out .bench/semantic-ready-s05/sourcefile-replay-new.json \
  --session-reuse experimental --trace
```

更换为 `--session-reuse off` 与另一个全新 `--out` 路径可复跑对照臂。
本次未传 `--manifest`，虽然原始报告记录了 checkout、SDK／oracle／产物摘要
和全部有效 `ARKTS_*` 环境，但**不是已冻结 manifest 的 release 门禁样本**。

## S05 安全决策收口（2026-10-05）

本阶段对**相容磁盘 local LS 复用这一具体候选**的安全评估已完成，结论为
`REJECTED`，而非继续用单次 trace-on 收益争取准入。两对反序、每臂 100 次真实
Settings/API24 操作的 trace-off 对照虽然保持 Location、诊断与 L3 后恢复精确，
实验臂编辑后定义 P95 为 1.657／1.608 秒，关闭臂为 0.278／0.272 秒；早期
固定顺序配对还观察到 1.600× 的 Node RSS 峰值比，超过 ≤1.10 门禁。后续峰值比
方向不一致，故不能将 1.600× 推断为稳定资源倍率，但也没有可用于毕业的资源
收益或 post-eviction PSS 证据。单次 SourceFile 对象复用证明存在局部机制，
不证明长期保留安全或抵消上述 trace-off 时延失败。

`ARKTS_SEMANTIC_SESSION_REUSE` 保持默认 `off`；未满足准入条件时沿用现有完整
语义 fallback、预算／L3 和 per-batch transient verifier。**S05 安全决策完成
不等于热会话生产能力 `IMPLEMENTED`，不等于 P95 ≤500 ms、原始 >3 GB／50% 或
DevEco/PSS/post-eviction 内存发布门禁通过，也不 supersede ADR 0003。**
如以后提出不同复用机制，须有新的公开 RED、独立的 exact/新鲜度/取消与资源
门禁，再作为新切片评审；不得把这个已否决候选重命名为已完成优化。
S02 仍 FAIL，S03 仍 BLOCKED；本决策不解除 facts 路线停止线。
