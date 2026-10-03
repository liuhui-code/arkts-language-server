# S05：context 生命周期与相容磁盘 LS 复用实验

日期：2026-09-29。状态：**观测及default-off磁盘LS原型已实现；S05 IN_PROGRESS，毕业未完成**。
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
