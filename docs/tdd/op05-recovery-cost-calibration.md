# OP-05：回收与恢复成本校准

本地日期：2026-10-14；最新推进：2026-10-16。状态：IN_PROGRESS，未采纳新政策，未完成阶段或L08。
父HEAD a111235bc4bfcb55b126752f95b3ba095f2996af，工作分支
codex/op00-query-attribution。已有dirty修改保留；本批只复用公开采集命令，
不新增生产行为、owner或优化开关。

最新存活owner切片已覆盖打开调用方及never-didOpen源，两入口各完成17次编辑，
第18次真实自动L3后READY撤销，原40次计划保持34完成／2失败／4未执行。
实际native释放／自然GC与冷重建已区分，详见[两入口存活owner记录](#两入口存活owner与真实自动回收)。
当前72358623代码原完整回归1862/1862已独立通过；不覆盖本诊断FAIL或最终产品门禁。

同日延后认证候选已完成公开反例、87/87相关回归和固定八会话对照；时延改善但
反序RSS高24.5%／28.2%，按预声明资源假说REJECTED并逐字节回退，详见
[候选回退](#延后认证候选回退)。原六默认／预算／既有修改不变，继续其它独立切片。

## 已有归因输入

OP-00观测到实际timer→L2 trim/recycle，六个编辑verifier冷getProgram4.47–4.77s。
OP-04固定15编辑诊断见实际L2→level2 resident miss→L3驱逐→新context
inputs-incomplete/再次驱逐；完整RPC约1.9s退回5.0–5.2s。正常400编辑没有持续
净收益，不能以短样本采纳overlay-sync，见[原始报告](../reports/2026-10-13-op04-warm-overlay-reference-comparison.md)。
这些是窗口内触发证据，不证明所有慢值的唯一原因或native释放/GC/PSS。

当前d6及新RSS工具whole1643/1673、30 FAIL保留；29原期限超时和1首次补全
输入拒绝，全部身份/归档稳定。原输入拒绝单跑与固定前序三文件21/21通过，
不是修复；未完成复现继续记账，不阻止本资源校准切片，也不允许合入。

## 固定首批：100编辑与10次压力恢复尝试

目录`.bench/op05-settings-edit-pressure-baseline-v1/`，一个真实Settings/API24
进程，原100次增删交替、相同完整引用oracle与逐版正常诊断；每10次编辑插入
一次显式L3恢复尝试。计划114个查询、100次编辑、102份诊断、10个压力控制。
100是编辑/交替任务次数，不伪称100次实际驱逐；真实驱逐见证去重后另报。

六默认开启，1024MiB/原滞回、完整SDK/成员、一个owner/最多两个contexts，
所有查询/诊断原20s期限。overlay-sync=0；Snapshot、resident-first及请求内
hash/module-resolution候选保持当前构建配置，未在本批重新采纳。
trace=1与benchmark=1仅为压力功能控制/归因，正常诊断保留，不强制GC，
主动Worker回收、重复L2 rearm、旧S05、anchor/scope缩小保持关闭。
本批不属于正常产品时延/PSS/DevEco或最终550ms分布。

只承认公开collector实际收到的L3驱逐见证；显式acceptObservedEviction沿用
既有合同，区分already-observed/after-control，记录真实事件时间与身份，
不能补造第二次驱逐。无见证的尝试保留BLOCKED/未执行，不当普通repeat通过。
每个真实结果重比完整位置；保留拒绝、超时、OOM/退出、所有计划未执行项。
保存manifest、命令、完整report/stdout/metrics与前后production/SDK/repo
身份；未来RSS含真实sampler单调时间，完整曲线消费不替代PSS门禁。

## 尚未完成的阶段范围

本单批是当前政策的归因基线，不是反序政策对比或完整生命周期验收。
继续≥100任务/编辑/压力原合同、其它能力、10k/100k原cold3/warm10/stress5
工作流、Registry实际残余/native dispose/CPU与独立GC-live/PID-RSS解释，
再做有限同构建反序候选校准。没有净收益证据就保持当前政策。
最终PSS/DevEco、比例、历史大峰值、平台和550ms留OP-06/L08；不提高预算、
删合法成员、关闭诊断、退回cleanup-only或持久化verifier换通过。

## 首批真实终态与独立审计

实际UTC2026-10-13T16:41:25.747Z→16:53:30.744Z。114/114查询exact，100编辑、
102份当前完整诊断，与同source正常OFF控制的全部diagnostics逐项相等；
10个L3控制均applied，10个恢复RPC都有实际lease0驱逐事件，去重10个见证，
无blocked/未执行项。真实server PID23384、exit0/signal null；raw CLI1与
FAIL/DEGRADED原样保留，不把该功能工作流变成ready/P95通过。

恢复RPC最小4885.94、中位5318.68、最大5376.90ms，仅本诊断窗口逐值观察。
压力请求/实际驱逐/恢复的完整时间线另存，不隐藏控制结算等待。
5605个外部RSS样本按真实sampler单调时间核对PASS，间隔p50 126.81/
p95 137.20/max240.35ms；Node观测peak1288814592bytes=1229.109375MiB。
离散峰值是下界，1024MiB是政策值，不是硬RSS上限；未证明PSS或GC释放。

前后全部production/SDK/repo身份一致。独立terminal-audit重新核对当前pins、
manifest/report/stdout/metrics SHA、完整oracle、诊断对照、真实PID/exit和
驱逐身份：INTEGRITY_PASS/functional PASS/resourceIntegrity PASS，
releaseEligible=false。audit SHA
c883e1e02854cc74ce2f5b8654e96818fb1a070eaf30de79dc40d21b79041d8f；
state SHA c6f36c7eec28bc8f227921affd9b4a8f7a107ffeb0e49d2c2f90983cf51731a6。
它只收口这个单基线执行，不完成反序政策、其它能力/规模/Registry/GC/CPU、
OP-05或L08；没有新默认采纳，没有重跑至有利结果。

## 规模工作流前置：实际SDK身份记录

2026-10-14本地日期，公开`run-macos-e2e.mjs --sdk PATH`的报告原先直接复制
仓库toolchain lock的摘要，不是实际选择的SDK。新增API24合成SDK消费者用例，
完整执行原cold3/warm10/stress5、20模块访问、真实compiler/stdio/RSS；
RED实际18会话成功后摘要断言失败，根exit1，0/1选中、8项名称过滤。
最小修复只读取所选SDK元数据与声明digest，不改SDK兼容、预算或运行数。

RED日志`.bench/op05-macos-selected-sdk-red-v1.stdout.log`，SHA
647c78141eff8069bf03c9a97d9b1e1b02fbbfdf8d964903977538d69e79320b；
GREEN完整product-gate文件9/9、exit0、零skip/cancel/todo，20518.868677ms，
日志`.bench/op05-macos-selected-sdk-green-v1.stdout.log`，SHA
3597d27d1e393f720362dd9fbc1dcf7b8f399774e1dcdf6ccf59141044da68a0。
两个state中全部生产/实际SDK/repo前后一致；生产仍d6，strict与diff check通过。
脚本423、测试353行，无新test entry/Rust/生产源码变化。
合成SDK只验证工具身份消费，不是产品基线；9/9不能覆盖当前whole的30FAIL。

固定下一批目录`.bench/op05-macos-large-workflow-baseline-v1/`，复用原
`.bench/unrelated/ws-10000`与`ws-100000`，各一次cold3/warm10/stress5，
原初始化/目录/查询期限不变、六默认开启、完整实际API24 SDK、正常诊断，
trace/GC/overlay-sync实验不启用。执行前后封存全部非忽略源码、产物/SDK身份、
两个夹具的全部实际路径与字节，不重生成或缩小夹具，不复用历史54会话。
该CLI当前仅对生成成员作completion label、同URI definition和references数量
检查，未保存逐查询完整oracle/最新诊断；因此本批仅是原规模执行与RSS开发
校准，不能据此宣称OP-05全部精确性/生命周期/PSS或L08完成。
根失败与未执行会话保留；固定两组不因结果不利追加重跑。

## 原10k/100k工作流终态与证据边界

本批UTC17:06:23.618→17:34:40.349（2026-10-13，本地2026-10-14），
10k CLI17:06:48.949→17:09:51.408，100k17:09:51.412→17:34:13.023。
两CLI各exit0/signal null、cold3/warm10/stress5完整，共36会话、10次压力后
补全成功；全部目录分别10000/100000，生成成员检查失败0。不追加重跑。

| 原规模 | 进程树peak RSS MiB | 暖尾值中位RSS MiB | 压力后补全RPC ms |
| --- | ---: | ---: | ---: |
| 10k | 410.62 | 381.29 | 3418.10–3518.71 |
| 100k | 587.88 | 573.46 | 3493.53–3694.62 |

报告的暖会话仅保留SQLite缓存，每个会话仍是新server，不是跨会话常驻LS。
各10个暖样本completion P95为3509.35/4012.18ms，definition244.77/257.40ms，
references203.18/222.56ms；只描述该CLI序列，不授予≥100请求/能力桶的550ms。
暖尾值RSS比1.504、观测peak比1.432，增长保留；不是PSS比例判FAIL/PASS。
没有原始外部RSS曲线或每个server的native exit code，不能宣称资源曲线审计、
真实驱逐/PSS/GC/Registry释放通过；API24完整SDK、正常诊断与默认预算未改。

独立terminal-audit重读当前全部1648源码档案、产物/SDK pins，以及两夹具
10006/100007实际文件路径与全部字节，检查全部manifest/log/report SHA，
逐会话数量/目录/原命令并重算memory/latency汇总：INTEGRITY_PASS，
developmentWorkflow PASS，releaseEligible=false。生产仍d6；所有前后pins相同。
state SHA25cae007e2a3cf3b2ab1dcc18e9c84b0affa90a0e90f3fbecb478b4a719e62d2；
audit SHAdbf9c3e8a301343f8bdd4827bb6dee882f28dd3283150755f2c3110972e1ad1f；
source档案e6530a69f85802090e72465a48ac448fcb2afd1e4f796007c6ccec806517be82。
两个report SHA分别
9dcafd43068eb4b1041bf5d2e138b29f4403d86606a8a5d1127fc6bed6155b70 /
f8a123b09cf135b1e3b45b73273ad261a2cc65380d5a9e9d1849065b1f42542d。

只读中途归档从17:20:38.860开始，保存88次实际临时文件快照。100k现存累计
日志最终包含18个唯一server start/stop日志对、77个ok查询（41completion/
18definition/18references）和5个实际Worker recovery.complete，旧thread1→2。
这不是L3驱逐的独立见证或native退出码。只取得warm5–9及stress0–4十个
native指标文件179行，观察Worker始终1、contexts最多1、projectFiles最多201、
末lease0；其余8会话指标缺失。日志及每个归档byte/SHA独立audit PASS，SHA
285cc9dae39976185d31a90abd017c952fc840a891519e65a4a12aeab68f7e4e。
单次主机只读观测CPU speed100%、swap8101.75MiB，仅环境记录，不是慢值唯一原因。

该原规模执行切片完成，不完成OP-05。下一项先补规模工具的完整payload/oracle、
最新版本诊断、原始RSS和真实退出留存，再校准回收资格/成本排序及固定反序；
其它能力、Registry/CPU/GC-live和当前whole30FAIL继续。最终PSS/DevEco、平台、
历史峰值和550ms仍在OP-06/L08，不阻塞前述独立切片。

## 完整响应留存切片：公开RED→GREEN

先由原9/9 GREEN保护提取复用的真实macOS夹具，提取后9/9、exit0，
20475.778087ms，日志`.bench/op05-macos-workflow-fixture-refactor-v1.stdout.log`，
SHA5c0cd96e33377c733e4e007b13325f9f3fe16803c281d813873c162560e8d5c0。
再新增单个公开CLI反例：18会话结束后`run.receipts`缺失，RED0/1选中、
9项名称过滤、exit1；日志`.bench/op05-macos-full-response-red-v1.stdout.log`，
SHAcd404b07a44c67842c220f82f4bcd5e537b635099a1fe15dd71bde16098b0904。

最小实现保留每条实际语义response及压力控制receipt（method、当前文档版本、
原生JSON-RPC id/result），不再只留下汇总；原请求顺序、期限与工作流数不变。
新增公开测试重比生成成员definition/ref完整位置集合，保留completion完整项及
session handle；压力回执与后续completion分开。普通4条/stress6条包含控制，
18会话共有77条语义结果加5条压力回执，不伪称82个能力样本。
该测试用合成SDK只资格化工具，不授予真实产品/全部能力oracle毕业。

首次完整文件GREEN10/10、exit0、40330.194745ms，日志
`.bench/op05-macos-full-response-green-v1.stdout.log`，SHA
658e8337bc77a2d6bfe33de191b1543b72821d952272ec0277a9aed9558f1ffd。
GREEN下只整理位置集合序列化表达式，再冻结四文件联合，原命令：

```sh
node --test --test-concurrency=1 tests/product-gate.test.mjs \
  tests/semantic-release-resource-cli.test.mjs \
  tests/semantic-release-matrix-cli.test.mjs tests/test-layer-manifest.test.mjs
```

联合42/42、exit0、零skip/cancel/todo，45672.407478ms；日志
`.bench/op05-macos-evidence-focused-v1.stdout.log`，SHA
41839e2e42d4889355841d079449440f45650a75fb6b0acc21a29c233d2f2b6b。
全部生产/实际SDK/repo前后一致，独立audit重核当前pins、repo及原始日志/根统计
为INTEGRITY_PASS，SHAfd2fbe2718855c8b9047928ca4f79f677b7aa4db6d6fdf3b67683714dd169f62。
strict、两个脚本syntax和diff check通过；脚本432、测试400行，无新entry/Rust。
生产仍d6；新的工具head没有新whole GREEN，最近1643/1673、30FAIL仍保留。

先前规模报告由旧423行工具执行，**不重标为本次有receipts的证据**，也没有为
新格式重跑两组。下一项仍须绑定实际请求params与独立完整oracle、当前版本
diagnostics、原始外部RSS/真实退出以及失败/未执行尾部；当前实现遇到错误仍
可能只保留CLI错误日志。只收口完整成功响应留存，不收口全证据/OP-05/L08。

## 实际请求绑定与冻结位置oracle

2026-10-14本地日期，生产仍d6、parent仍a111235b；本批只改开发测量工具。
先补实际params（URI、UTF-16位置、声明策略/trigger context与压力level），
与原生id/result及文档版本一起保留。公开RED0/1选中、9名称过滤、exit1，
原params为undefined；最小实现后完整文件10/10、exit0、39707.52756ms。
证据前缀`.bench/op05-macos-request-binding-{red,green}-v1`。

新增可选`--oracle FILE`，不是生产优化开关。冻结JSON提供verified事实、实际
SDK declaration digest、全部夹具实际路径/字节digest、精确目标和definition/
references完整位置；不向候选预查答案。每个实际definition/reference结果
复用已有完整位置消费者，拒绝missing/extra/duplicate/非法range，而非只看数量。
报告保留raw response、params、actual/expected完整位置、oracle原文件SHA；
`locationOracle.capabilities`只列definition与references:includeDeclaration=true。
未提供oracle显式NOT_PROVIDED；completion仍只有成员label检查和完整raw留存，
不能把这个子范围当全部capability/完整payload或产品毕业。

公开入口RED为旧严格parser尚不支持oracle，0/1、10名称过滤、exit1；随后原
真实18会话的独立生成位置正例使完整文件11/11、exit0、60331.034505ms。
前缀`.bench/op05-macos-pinned-oracle-{red,green}-v1`。八类负例通过：未核验事实、
SDK摘要不符、实际SDK文件改动、非入口合法源码改动、目标位置变化、重复位置、
同数量但错误definition/reference范围。首版negative characterization FAIL保留：
夹具共享start对象，改reference起点同时改了query位置，先触发QUERY_IDENTITY；
改为只改终点后1/1选中、11名称过滤、exit0、3563.142277ms；不是产品修复。
前缀`.bench/op05-macos-oracle-negative-characterization-v{1,2}`。

另一真实反例在初始pin后、实际LSP child启动时，只追加私有夹具无关源码字节，
所有compiler/stdio/响应仍真实；原18会话CLI却exit0/MACOS_E2E=PASS。
RED0/1、12名称过滤、exit1。新增结束时SDK/全部夹具及原oracle文件摘要复核，
变化拒绝成功报告；完整13/13、exit0、83675.053168ms。
前缀`.bench/op05-macos-oracle-postflight-{red,green}-v1`。
探针仅包裹公开OS spawn并转交原参数；基于[Node20 builtin ESM同步文档](https://nodejs.org/docs/latest-v20.x/api/module.html#modulesyncbuiltinesmexports)，
只在本私有macOS工具fixture激活，不修改生产server/compiler结果或开关。

相同位置仅JSON字段/集合顺序不同也曾被误判MISMATCH，公开RED0/1、13名称过滤。
最小实现只规范化已验证的file/range字段形状，仍绑定原oracle文件raw SHA，
不重写、排序或删原文件；完整14/14、exit0、103616.73373ms。
前缀`.bench/op05-macos-oracle-location-order-{red,green}-v1`。

新四文件冻结联合（原product-gate/resource/matrix/inventory命令）46/46、exit0、
零skip/cancel/todo，108756.491294ms，日志
`.bench/op05-macos-oracle-evidence-focused-v1.stdout.log`，SHA
344325f12414c2fe0dd1e0d6d8322fae8a4cdb6116dbef81fded18aac213ae29；
state SHA4afabe909a324f57c80cc4d881ef0c220b10f6b439dab44ee3289d1473ffe211。
全部production/SDK/repo前后一致。全部11个RED/GREEN/characterization日志、根
退出/计数和SHA独立audit一致；最终还重核当前全部repo bytes和production pins，
INTEGRITY_PASS，audit SHA3023812f2e3b8762e5883e49cb244ab953af70840ec55c96131b87bb248eaa74。
strict、四个syntax与diff check通过；script458/oracle63/test492/probe24行，
均≤500、库存仍191、无新test entry/Rust/生产源码变化。

本批合成SDK只资格化工具；旧36规模会话不加oracle重标或重跑。结束pin不证明
任意变化后恢复原字节的瞬时窗口，原生产加载/结束fence仍保留。新的head没有
新whole GREEN，最近1643/1673、30FAIL未消除，不允许合并。
下一项补当前diagnostics、原始外部RSS/真实退出和失败/未执行尾部完整留存，再
做冻结真实规模精确性/生命周期与固定反序政策校准；完整OP-00–06/L08范围不变。

## 失败、真实退出与逐点资源记录

2026-10-14本地日期，parent仍a111235b、production仍d6。本批只改开发工具和
公开CLI测试，不改生产策略、原cold3/warm10/stress5、请求顺序或期限。
先在14/14 GREEN下分别提取私有夹具和报告聚合职责，两次完整14/14均通过；
后来在原15/15及新增退出保护GREEN下提取macOS用例职责，完整16/16通过。
提取前后公开行为受原用例保护，没有新增test entry，库存仍191。

| 公开反例 | 原实际RED | 最小修复后的验证 |
| --- | --- | --- |
| 同数量错误reference范围 | 实际返回后没有部分报告，0/1选中 | 完整15/15 |
| 初始pin后无关源码变化 | 结束拒绝时丢掉18个会话，0/1选中 | 完整15/15 |
| 真实server native exit17 | 查询完成却CLI0/MACOS_E2E=PASS，0/1选中 | 三类失败3/3选中 |
| 真实压力接口-32601 | 报告丢掉原生错误回执，0/1选中 | 1/1选中 |
| 原始RSS/native指标缺失 | 成功18会话后只有汇总，0/1选中 | 1/1选中 |

所有名称过滤项按原skip保留，选中GREEN不冒充完整文件GREEN。对应冻结前缀：
`.bench/op05-macos-partial-failure-{red,green}-v1`、
`op05-macos-postflight-retention-{red,green}-v1`、
`op05-macos-native-exit-{red,green}-v1`、
`op05-macos-pressure-error-{red,green}-v1`、
`op05-macos-resource-curves-{red,green}-v1`；三个职责提取前缀为
`op05-macos-failure-{fixture,report}-extraction-v1`和
`op05-macos-case-ownership-refactor-v1`。实际命令、全部前后身份、退出、原始
日志、根统计和SHA均进入独立audit，未覆盖或删除不利记录。

已准入工作流失败仍CLI1/MACOS_E2E=FAIL，但保存实际会话、targetPid、原生
JSON-RPC params/id/result或error，以及真实shutdown/exit。引用不匹配例保留
三条实际响应、native exit0和17个未执行会话；native exit17例保留四条成功
查询和实际shutdown，未执行17，不把查询成功当生命周期成功。结束输入漂移
保留18个已执行会话及82条回执，measurementStatus仍incomplete、oracle FAIL；
run COMPLETE只表示该会话执行完，不授予全局输入一致性。未准入的preflight
拒绝仍不制造执行报告。没有warm观测的汇总明确null，而不是零或NaN。

exit17探针只在私有cache/server进程的同步exit监听器中设置实际退出码，
不替换compiler/stdio结果；语义依据见[Node20退出规则](https://nodejs.org/docs/latest-v20.x/api/process.html#event-exit)。
压力拒绝探针只在私有server启动边界关闭benchmark接口，真实LSP返回-32601，
不注入伪响应。报告保存该完整error且没有result；level3Observed=false。
此字段现在只在收到实际applied:level3时置true，仍不是实际L3驱逐/native
dispose或Registry释放见证。正常测量的六默认/full SDK/正常诊断未改变。

每个run现在保留全部外部ps采样解析出的进程树观测：墙钟timestamp、实际
采样monotonicMs及timeOrigin、PID/role/parent/startIdentity、RSS/cpuPercent、
truncated、进程数与总RSS；标注原请求间隔250ms，不伪造实际间隔。native
指标的全部解析对象也保留，包括实际进程、时钟、lease/contexts和heap/RSS
scope。它们不是原ps全机表或原JSONL字节档案；测试逐项重算peak/final，
核对PID去重、单调间隔与context摘要，不能推断GC-live、CPU时间或物理释放。
Worker线程不重复加入Node RSS，RSS仍是离散下界，不是PSS/1024MiB硬上限。

冻结原四文件联合命令50/50、exit0、零skip/cancel/todo，146807.390521ms。
日志`.bench/op05-macos-failure-resource-focused-v1.stdout.log`，SHA
cdfb948834131c73c51ad34c4e0cf55e81d188c043f7af6493488b17dd5f199e；
state SHA111cabf4fa904f0b9fbb87eb9ed006b622817db86db8b6dfe903841b65ee9050。
独立audit重读全部14批原始终态、重新核对当前全部1655个非忽略repo文件字节、
production与完整实际API24 SDK：INTEGRITY_PASS，releaseEligible=false，
audit SHA71d7fc73708f5728aa952240c6ca9f0c334310c1896015d9a105af7fa1034de7。
全部原会话已退出；pnpm check、九文件syntax、diff check及≤500行核对通过，
独立static SHA616575b8bc60a432ce56d23f9c8689bfe478cab5889f0d4dae81126422f58cad。
main431/report81/oracle63、test entry303、fixture88/cases267、三probe24/11/11行。

本批合成SDK只资格化工具，旧36个规模会话不升级或为格式重跑。当前版本
diagnostics仍未完整留存；初始化/无响应超时的已发请求、采样错误、指标解析
与后置invariant失败的报告路径还须独立反例，不能声称所有失败均已留存。
未成功施压的stress尾值仍须隔离于postEviction汇总，不能作真实驱逐后资源。
下一切片先保护这些证据边界及当前诊断，再做真实冻结规模/资格成本排序与
固定反序校准；其它能力、Registry/CPU/GC-live和全部OP-00–06/L08范围保持。
最近whole1643/1673、30FAIL未消除，新工具head没有新whole GREEN，不允许合并。

## 当前诊断、后置失败与已发无响应请求

随后本地2026-10-14继续公开CLI纵向切片，parent仍a111235b、production仍d6。
只改开发采集工具/测试；原cold3/warm10/stress5、查询顺序与期限、完整SDK、
六默认/1024MiB/owner及正常诊断不变，不把550ms变成前序门槛。

| 切片前缀（均在`.bench/`） | 实际RED | GREEN选中范围 |
| --- | --- | --- |
| `op05-macos-unapplied-stress-{red,green}-v1` | -32601后177401856bytes仍计postEviction，0/1 | 2/2；16名称过滤 |
| `op05-macos-current-diagnostics-{red,green}-v1` | 18会话未存通知，0/1 | 1/1；18名称过滤 |
| `op05-macos-postrun-metrics-{red,green}-v1` | native退出后指标缺失即丢报告，0/1 | 3/3；17名称过滤 |
| `op05-macos-malformed-metrics-{red,green}-v1` | 真正JSON解析失败即丢报告，0/1 | 3/3；18名称过滤 |
| `op05-macos-interrupted-request-{red,green}-v1` | 实际已写补全帧但记0请求，0/1 | 3/3；19名称过滤 |

未接受压力的尾值仍保留在原run/曲线，但不进入postEviction汇总，无合格
观测明确null。历史字段只汇总applied:level3后的尾值，仍不是native驱逐见证。
正常/压力会话现在保存最终当前版本3/4的完整原生publishDiagnostics通知，
严格匹配URI/version。公开正例的18份非空完整诊断与两个独立fresh正常会话
逐项相等；控制在工作流后查询，不预取候选答案，不关闭诊断或使用trace/GC。
10s诊断观察沿用最近稳定公开测试接口，不提高原请求期限；单列残余等待
latestDiagnosticsMs，不改原RPC计时含义。报告中的通知留存不等同--oracle
已核验诊断；该可选oracle仍仅核验definition/inc-declaration references。

后置缺失探针只把私有实际指标文件移入备份；畸形探针保留原文件备份再写
私有不完整JSON。真实parser错误及完整UTF-8原文现在进入semantic.rawJsonLines/
metricsError，正常文件也逐行重算等于samples。缺失原文为null；不把缺测当零。
资源验证仍FAIL，但四条已收语义响应、当前版本诊断、native exit0和17个未执行
会话留存。之前parsed-only/无原文的检查点保留，不升级旧报告。

中断探针仅包裹客户端真实stdin写出，复制实际Content-Length帧中的JSON，再
对该私有live child发SIGKILL。不是模拟compiler响应，也不杀进程组；实际
closeResult为code null/signal SIGKILL，不把kill()返回true当已退出证据。
现在等待前先记录request/params/id/version，RECEIVED/ERROR/FAILED分开，
无响应保留原错误与实际单调elapsedMs，不填伪result。公开测试重比独立观察
到的实际写出帧；这证明客户端尝试，不证明server已处理。原会话仍FAIL且尾部
17未执行，不把已发查询记成未执行。探针事件/ESM同步语义依据
[Node20 child事件](https://nodejs.org/docs/latest-v20.x/api/child_process.html#event-exit)与
[builtin live bindings](https://nodejs.org/docs/latest-v20.x/api/module.html#modulesyncbuiltinesmexports)。

当前四文件冻结联合54/54、exit0、零skip/cancel/todo，167665.845347ms。
日志`.bench/op05-macos-diagnostics-failure-focused-v1.stdout.log`，SHA
6b23032a0bcf992c51813f59c4610c8fc3dda553b43d1ea4b692c89af40e27fd；
state SHA56465045687ef97ef1440984694fece7814db2a11e3a14c42eac732f5094af09。
独立重读本轮全部11批根退出/统计/日志与当前完整production/SDK/1658个repo
文件字节，INTEGRITY_PASS、releaseEligible=false、owned工作流已退出，audit SHA
a904332893350e455c7ac93774e0754faa2812dab175d6c67327494e2a4ab02f。
再封存逐文件原字节base64/SHA，独立解码重核全部14458909bytes及聚合身份，
SOURCE_ARCHIVE_PASS；`-sources.jsonl` SHA
c08f20c7573449f93f63c266742a88d02f51d7834a9e8908a15eb46396d67cbf。
所有测试后文档编辑发生在封存之后，不重写测量源码。pnpm check、12文件syntax、
diff和≤500行检查PASS，static SHA
77ac473192cbda638c8bc1db3f7ee4b7bcf6d9c1de225c4be2b077dde6334692。
main458/report81/oracle63、entry303、fixture95/cases366/diagnostic-control30；
新增两个边界probe33/40行，库存仍191，无生产源码/Rust变化。

一处准备补丁的空hunk被apply_patch拒绝，未修改文件/启动测试；修正后才启动
上述畸形指标RED，不能把工具调用错误当行为RED。所有实际失败日志原样保留。
本批仍是合成SDK工具资格化，旧36规模会话不升级/为格式重跑。初始化、真正
原期限超时、sampler实际失败与指标schema异常仍须独立保护，不能宣称全失败
路径完成。随后继续真实冻结规模精确性/生命周期、资格成本与固定反序政策
校准；其它能力/Registry/CPU/GC-live和全部OP-00–06/L08范围不缩小。
当前whole仍1643/1673、30FAIL；新工具head无新whole GREEN，不允许合并。

## 实际采样故障、原期限超时、schema与初始化

2026-10-14本地继续，parent仍a111235b、production仍d6；只改开发工具和测试。
不改六默认、完整SDK、正常诊断、1024MiB/原滞回、owner/contexts或查询期限。

| `.bench/`冻结前缀 | 公开实际RED | GREEN选中范围 |
| --- | --- | --- |
| `op05-macos-native-sampler-{red,green}-v1` | native ps失败导致报告丢失，0/1 | 3/3；20名称过滤 |
| `op05-macos-original-timeout-{red,green}-v1` | 实际30s等待误记FAILED，0/1 | 3/3；21名称过滤 |
| `op05-macos-metric-schema-{red,green}-v1` | 合法JSON null行丢报告，0/1 | 3/3；22名称过滤，四种schema矛盾 |
| `op05-macos-initialization-exit-{red,green}-v1` | 原初始化帧未记录，0/1 | 3/3；23名称过滤 |

采样探针执行真正带非法参数的/bin/ps，不注入输出；保留原execFile及其custom
promisify语义，避免把返回对象变成字符串而制造伪失败。参考
[Node20 execFile](https://nodejs.org/docs/latest-v20.x/api/child_process.html#child_processexecfilefile-args-options-callback)和
[custom promisification](https://nodejs.org/docs/latest-v20.x/api/util.html#custom-promisified-functions)。
先产生实际样本再使第三次ps调用exit1。现在立即接住异步拒绝，保存前序样本
及原生code/cmd/stdout/stderr，完整查询/当前诊断仍可记录，真实session exit0；
整个run和CLI仍FAIL，17会话未执行。异常时只清理已验证的私有child/cache，
原指标移入私有备份；正常退出不冒充采样通过，Root退出也不证明Registry/GC。

超时探针对私有live child发SIGSTOP，原生ps状态T确认已暂停，原补全请求真的
等满30_000ms。shutdown时SIGCONT恢复同一进程，实际exit0，但查询仍TIMEOUT。
保存原timeoutMs、真实单调elapsedMs、错误和实际请求，不填response/result。
SDK/查询/诊断期限未提高，既有prepared消费者相同超时来源约定保持；初始化
状态分开记录。暂停目标/清理路径在fork前验证，退出保护不留下暂停进程。

schema反例先备份真正指标，再分别破坏null行、rss=-1、目标PID或rssScope。
四种均拒绝，不删原UTF-8文本或已完成响应/诊断/真实exit0。现在核验原producer
数值字段安全非负整数、实际PID、Node RSS/Worker heap单位范围及单调时钟文本；
原文保留，错误记录，samples不把非法记录作为有效观测。不是物理释放证明。

初始化中断仍复制实际客户端写出帧再精确SIGKILL；initializeReceipt单独保存
原request/ID/options/capabilities、原30s期限、响应或错误/耗时，原77语义结果
加5压力回执的计数不变。缺测run峰值与整体peak都为null，不能Math.max(null)
转成零内存；全阶段仍FAIL，已准入会话与17个未执行尾部明确区分。
本例没有原生initialize错误响应；那类响应和超时后的晚到帧仍不能声称全覆盖。

原四文件冻结联合58/58、exit0、零skip/cancel/todo，203857.095339ms。
日志`.bench/op05-macos-observation-fault-focused-v1.stdout.log`，SHA
e8a60b47cab0ea9efe74f043a5f1c1b48b5309c3e294a0d802699e998350d514；
state SHAda123a13a12e110b37915b891f3e53b2c776fabb2afcd9107697de4d3278e58b。
独立9批原始根统计/退出/日志、当前完整production/SDK/1660个repo字节核对
INTEGRITY_PASS、releaseEligible=false，owned工作流均退出；audit SHA
5ce448a9a2e4ac7b38b13c02fc11300b2d9e4487005f7f338fd3a7e5cb3f5862。
14482459源码bytes逐文件base64封存并独立解码重核，SOURCE_ARCHIVE_PASS，
`-sources.jsonl` SHA3cf8ffa747666a4af8f5a5193e48d894ca34802a8ebbedd3cbc08b48caa3c5ed。
类型检查、14文件syntax/diff/≤500行PASS，static SHA
510a677c1395c35558391660ace583d3653cd156b98ef9ee0039b19ca86ae082。
main480/report82、cases468/fixture103、两新增probe48/61行，库存仍191，无Rust/
生产源码变化；文档跟进在测量源码封存之后，未重写旧失败或追加有利重跑。

只读校准前置还确认当前cost-aware排序须至少两个未租用候选、全部有正的实际
重建成本且成本不同，否则LRU；释放后每次重新读压力，不等于GC已发生。
原单上下文Settings恢复基线不能资格化排序收益。后续先确认现有公开流程
实际产生两个合格上下文与cost/lease/evict见证，再作同构建默认ON/显式costOFF
固定反序、完整结果/最新诊断和生命周期/资源对照；仍最多两个contexts，不
制造第二owner、放宽滞回/预算、强制GC或持久化verifier换收益。

本批仍是合成SDK工具资格化，不完成真实规模/全部能力/Registry/GC/CPU、反序
政策或OP-05/L08。下一项推进真实冻结规模完整证据、排序资格与恢复净成本，
必要异常边界保持FAIL-closed；旧36规模会话不升级/为格式重跑，当前whole
1643/1673、30FAIL未消除，不允许合并，全OP-00–06/L08范围不缩小。

## 完整SDK双上下文资格与固定反序成本校准

本地2026-10-14，生产仍d6、parent仍a111235b，无生产/工具源码或默认值修改。
先在原10k/100k/1k三根、完整API24 SDK下观察两个实际正成本context：2596.35/
403.61ms；第三根进入时实际`capacity-cost`驱逐便宜context，lease0。单次资格
观察12回执/4诊断、exit0、全部pins稳定；未应答一条progress-create请求，不作
完整目录/正常资源对照，亦不与下一批合池。目录`.bench/op05-fullsdk-cost-eligibility-v1/`。

随后固定`.bench/op05-fullsdk-cost-reverse-v1/`四独立进程，OFF→ON→ON→OFF，
仅成本开关不同；五项其它默认保持开启，正常诊断、indexed-batched/closure、
完整SDK/所有夹具字节、1024MiB/原滞回、一个owner/最多两个contexts不变。
主动Worker回收、L2 rearm、overlay-sync、GC/旧sessionReuse均关闭。
真实progress-create帧正常应答；不预查询oracle、不等待最终SLO或伪造目录就绪。
这是trace-only功能/成本观察，未完成原cold3/warm10/stress5目录验收。
原initialize10s/query20s/diagnostic20s/control5s/shutdown5s不变。

四组共68实际RPC回执：4初始化、4压力控制、60语义查询（48definition/12含声明
references）；完整位置逐条重比独立夹具事实，全部exact。16份当前v1/v2正常
诊断完整相等、均为空；四个server及控制器实际exit0，原期限无失败/未执行。
ON两个根的成本2798.09/420.41与2682.35/421.23ms，均选择较便宜的无lease
context；OFF无成本观测是关闭合同，不标缺测失败，实际选择原LRU较旧context。
两ON的显式L3各释放一个后停止，两OFF各释放两个；全部实际lease0。处置时Node
RSS约355–422MiB，低于原85%退出目标；这是功能干预，不是自然高压力/GC释放。

| 固定组 | 容量后A RPC ms | L3后A RPC ms | 15语义RPC合计 ms | native Node峰RSS MiB | 进程树峰RSS MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| OFF forward | 477.27 | 2369.52 | 21479.28 | 561.51 | 888.07 |
| ON forward | 54.99 | 27.40 | 18513.16 | 612.62 | 1127.29 |
| ON reverse | 50.42 | 27.98 | 18490.76 | 630.84 | 1138.13 |
| OFF reverse | 482.21 | 2424.12 | 21612.37 | 621.27 | 1134.18 |

A为固定10k根；B容量后仍462.57–472.06ms（ON）/465.70–471.12ms（OFF），
L3后423.66–455.22ms（ON）/432.76–433.04ms（OFF）。两方向RPC合计分别降低
13.81%/14.44%，仅此预声明序列；不是端到端全部等待、正式P95或CPU独占收益。
RSS没有一致下降：ON Node峰值两方向更高，进程树亦未证明改善；不隐去资源
代价、不提高预算，不把较早的grouped compiler成本当未来恢复成本保证。
现有默认成本策略保留，不据此增加政策、推广其它候选或授予阶段/产品毕业。

UTC20:05:42.698→20:09:02.989（2026-10-13），独立原始state/log/驱动代码、完整
SDK/产物/三个夹具所有111019文件、60完整结果/16诊断及316真实单调RSS样本
重核INTEGRITY_PASS；另核原16个PID+启动身份均已退出，不等同Registry/dispose。
audit SHA20e28a17470952c86cb5bbcdd9e0e6eaad87f2a5c0cf34f5b83ea6a784818ca2；
state SHA7ddccc49be9ccf2f74319c239c9cf87cb7fc0fc12ec236e3306db27d4c3ee131。
1660个测量源码/14490538bytes逐文件原字节封存、独立解码PASS，archive SHA
bfb0642a78dad697fd264c4b93b3a6db48cbb722955b8b333f5fd7dba9114dab。
源码聚合39855def843a286e25e7448b4e062954517320bda78544c85cc4181d34187c20；
文档跟进在封存后，控制器/实际驱动另存原文，所有本批进程均CLOSED。

此切片收口双context排序及原滞回功能/有限净成本对照，不关闭OP-05。继续真实
10k/100k原工作流的独立完整oracle（含completion）、当前诊断/生命周期资格，
其它能力/自然压力、Registry/CPU/GC-live及整体30FAIL；不重标旧36会话或为格式
重跑，不把RSS当PSS。完整OP-00–06/L08与最终550ms/资源/平台门槛保持。

## 完整补全oracle、原始日志与实际规模资格批次

2026-10-14本地，parent仍a111235b、生产仍d6。本批只改开发采集工具/测试，
完整SDK、六默认、预算/滞回/owner、原查询/目录/诊断期限与库存191不变。
先在四个公开回执表征4/4 GREEN下提取请求职责，后同四用例4/4；包含真实
原30s超时与已发请求中断。再提取独立oracle用例职责，八个原公开用例8/8。
新模块职责独立，原主脚本480→461、用例468→387；没有生产源码或Rust变化。

完整补全反例：必需stableMember标签仍在，错误完整payload却被旧CLI在18会话
后报PASS，公开RED0/1；最小修复后三个公开用例3/3。oracle现在绑定v1/v3/v4
的全文SHA、UTF-16位置/context与完整CompletionList。复用原完整payload消费者，
只去掉经结构验证的会话UUID；原响应/UUID保留，顺序、kind/detail/insertText/
sortText/textEdit/isIncomplete等不删字段。未提供补全oracle仍NOT_PROVIDED，
旧位置oracle不冒充补全验证；快照缺失/重复版本/错位置/文本/旧会话句柄拒绝。

正向事实先独立观察锁定compiler公开API与同生产Host，并以公开AST声明事实
构造struct成员的LSP预期，不复制待测LSP回答。1k/10k/100k各一个LS、每组三
快照，共9个原生观察；每组201合法成员/569 SourceFile，原生info230项也原样
保留，声明事实对应stableMember/build两项。不是把230项冒充原生两项输出。
全SDK/fixture/生产身份稳定，目录`.bench/op05-macos-completion-native-oracle-v1/`；
10k/100k oracle SHA分别42a664ed12b0bfe32ad4edf8905d47a91558b532e7e86fafb539242c564801e6
与241a7b37fe30dcb5698665145968359cd84e58d76b837839f9825861ea22b242。
补全正例41次全字段/绑定通过，连同原位置与正常诊断控制四用例4/4。

另一个公开RED0/1证明18会话后临时日志全丢失。最小实现清理前保存原始JSONL，
按实际PID提取本会话，暖cache的累计原文不删；日志异常留原文/错误、仍FAIL。
正常start/stop与native exit分别核对，不把日志stop当Registry/dispose/GC证明；
日志、补全正例、初始化中断三用例3/3。所有RED与表征转录保留。
前缀为`.bench/op05-macos-{receipt-characterization,receipt-extraction,oracle-ownership-extraction}-v1`、
`op05-macos-full-completion-oracle-{red,green,positive}-v1`与`op05-macos-runtime-log-{red,green}-v1`。

四文件完整相关62/62、exit0、零skip/cancel/todo，247003.462786ms；prefix
`.bench/op05-macos-complete-workflow-focused-v1`，log SHA
8c682e571ea0027500b69c9699d7287bfe7e64775f4797ae35f4d9e948fceaf8。
独立9批终态/全部SDK/产物/1663源码字节audit PASS，SHA
14d03b46831545a157d5c322b1c38f02c97196026c2e81b8d65f70849b51cdd1。
原源码14508781bytes封存、独立解码PASS，archive SHA
e018768bd90e075e9b1f726b48c469311bbaec58241b391468a0edac6bedb358；
源码聚合d6db01c0175ed660911fc14140a217fc97285fe6c4a982e72a11ba597c073bd7。
pnpm check、17文件syntax/diff/≤500行通过；static SHA
8564e14a76e48807e0513b65828a59371f77a63973c921476ca7b5275ac406e8。

随后固定`.bench/op05-macos-large-workflow-qualified-v1/`原10k/100k各一次
cold3/warm10/stress5，trace-off/full SDK/正常诊断/六默认/原预算与期限；不是
格式重跑，新增独立完整补全/位置、当前诊断与日志/原始资源/真实退出资格。
10k UTC20:50:28.912→20:53:19.123（2026-10-13），18/18完成、77完整语义结果
（41补全/18定义/18含声明引用）、18当前诊断、5真实压力回执/恢复，全部exact。
peak/暖尾中位RSS398.89/384.94MiB；暖10样本补全P95 3510.76ms，恢复
3424.09–3560.92ms，5次journal-overflow Worker恢复日志保留；非正式P95/PSS。

100k UTC20:53:23.820→20:58:26.448，原CLI1、只完成前两个cold；第三cold在
首次语义查询前FAIL，15会话未执行。8实际语义结果完整exact、2当前诊断；
暖/恢复数据为null，不补零或借旧18会话。观测peak RSS577.25MiB仅部分运行，
不做完整规模增长比。实际目录20:56:04.445已DEGRADED（100000/100000、skip0），
约41s终态；CLI只等percentage100，却继续等到原180s超时。不是补全/引用超时，
无semantic Worker/指标是该失败边界未启动，不误判为语义丢数据。
源码确认server的degraded report无percentage100且随后done，CLI等待条件有缺口。
降级本身原因尚未证实；不能因计数完成把DEGRADED改READY或延长期限。

四独立新进程v3/v4正常诊断控制通过（均真实1003），20份完整publication相等；
control SHA b38711342ab9a75248df446bed9e85a30d3fff5ccf1a7571e8b5c2b150483231。
21实际会话/85完整语义结果/20诊断/1345单调RSS样本与全部日志/metrics/原
SDK/产物/fixture字节独立audit PASS，仅functional PARTIAL；42原PID+启动
身份均退出。audit SHA5936f4c65385b6eea46ec4c9148a4e1494dadee19fb0787941712cb96fb9a66c，
state SHA14968770b33ab9786d99f6a4e6887163af82d232ed48c1df12db19e32648ff11。
第一审计器漏传已冻结追加overlay，误报位置差异；仅补回该已知文本再重核，
未重跑/改写任何产品会话。所有原FAIL、未执行和旧规模证据保留。

下一项用真实生产stdio和受控sidecar系统边界构建快速公开DEGRADED/end反例，
先保存实际progress终态、明确拒绝并消除180s空等，再查状态请求/stall/提交/
退出的真实降级原因。初步源码常量为request15s/initialize30s/catalog-stall30s，
不能仅据常量归因本次41s失败，不放宽门限。修复后只补明确失败/未执行范围，
不重跑已完成10k或前两100k会话碰PASS。其它能力/Registry/CPU/GC-live、整轮
1643/1673的30FAIL与完整OP-00–06/L08仍未完成，没有新whole GREEN或合入。

## 目录终态修复、显式冷后缀与100k补测

2026-10-14本地，parent a111235bc4bfcb55b126752f95b3ba095f2996af，生产仍d6；
完整API24 SDK、六默认、1024MiB、owner/context/滞回和所有原期限不变。
本批没有生产/Rust修改；涉及的手写工具/测试最大455行。

公开RED使用真实production stdio和私有不可执行sidecar文件，触发实际OS启动
失败而非伪造LSP回答。原CLI已收到DEGRADED/report/end，却等待180s后超时；
原反例180422.63ms、0/1、exit1，prefix
`.bench/op05-macos-degraded-catalog-red-v1`。最小实现保存create/ack/begin/
全部report/end，并在原180s总窗口内识别READY、DEGRADED、CANCELLED或不完整
终态；不把计数完成当READY，不延长期限。三个公开用例3/3，完整四文件
63/63、零skip/cancel/todo、exit0，prefix
`.bench/op05-macos-catalog-terminal-focused-v1`，log SHA
cd763734012a9c01d92b823edd300734e067703f50a140026affa08635f0cfbc。
独立三批audit SHA27f2995a3e7eed445fc4f202fb0fdb80ed9a67353db3a3062089715fd4967748；
20项strict/syntax/diff/行数检查通过。1664源码聚合
629ee702c831ac2f4a0694348126d16bdd593fc81d07b31181cc5bede1e7ae55，
原字节archive SHAf47155f612b57ebc36fb3641e386e8eba5a289a236c1b66b9aca9800742c7c20。

随后有限catalog-only诊断用原100k夹具和真实release sidecar/adapter默认
request15s、initialize30s、stall30s、termination1s；不运行已成功语义会话。
三次目录均READY，实际close0，耗时37.03/40.59/52.23s，最大事件间隔
294.68/262.50/262.33ms。SDK/产物/源码/夹具前后稳定，原协议逐帧审计通过；
`.bench/op05-macos-catalog-diagnosis-v1/audit.json` SHA
25b7409d399135d2eabea7512b2bfbb05459a734b86281a7782c0874ad60fd67。
这没有复现原降级，原100k cold2的真实原因仍NOT_PROVEN。磁盘低空间观察
不是原失败归因；确认实际进程退出并保存文件SHA/大小后，只删除本诊断生成
的三个SQLite缓存（1821990912bytes），原协议/state/plan/audit保留，可重建缓存。

为只补失败/未执行范围，公开起点反例先0/1：CLI拒绝`--start-at cold:2`。
最小GREEN允许冷阶段后缀，仍保留原cold3/warm10/stress5、18项库存与排除项，
通过后输出PARTIAL而非PASS。第二个公开RED证明从warm:1新建缓存会冒充原暖
链路；最小修复只允许cold起点，随后两个起点用例与真实降级用例3/3、exit0。
命令为Node20 `--test --test-concurrency=1
--test-name-pattern='explicit start|catalog observes real degraded progress'
tests/product-gate.test.mjs`；33中3通过/30未选，不是新完整回归。前缀
`.bench/op05-macos-workflow-{start-red,start-green,cache-lineage-red,start-qualified}-v1`。
重跑完整默认表征曾被自动审查拒绝，改为只执行新边界的私有24文件夹具；
没有绕过拒绝或重跑原规模成功范围。四批独立audit SHA
e4cf53e961e51e33b2fe18087abfa01974dc10e0eab9709cff1da850a56b45c9；
20项静态检查通过，原测量源码1664文件聚合
a71a16df36d7b1db076e72b9a153b8440d000b834eae45936e29d754f7a4fb97，
archive SHA8d9a7afc0ef2df995a8a96427b78017ae9611762620d76b3313f7e006a49526c。
先前63/63只属于目录终态版本；新增起点版本没有被升级为新whole GREEN。

补测目录`.bench/op05-macos-100k-suffix-observed-v1/`，真实CLI命令为Node20
`scripts/bench/run-macos-e2e.mjs --workspace .bench/unrelated/ws-100000
--sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony
--sidecar target/release/arkts-index-sidecar --oracle
.bench/op05-macos-completion-native-oracle-v1/ws-100000-oracle.json
--start-at cold:2 --out .bench/op05-macos-100k-suffix-observed-v1/report.json`。
实际外层执行Node20 `.bench/op05-macos-100k-suffix-observed-v1/controller.mjs`；
其plan.json保存全部显式六默认/候选关闭环境、精确args和观察器SHA，子进程
`NODE_OPTIONS=--require=<该目录绝对路径>/native-sidecar-observer.cjs`，不合成回答。
原失败cold2及未执行warm10/stress5共16/16完成，CLI0但banner/measurement均
PARTIAL、原18项计划中前两个cold未运行。原FAIL/旧报告字节不变，不合成新的
同轮18/18或重跑10k/前两100k会话。UTC00:27:58.522→00:53:18.045，所有完整
SDK/产物/源码/夹具/独立原生oracle前后稳定；只增加透传字节的native观察。
69完整语义结果（37补全/16定义/16含声明引用）、16当前诊断完整相等，5实际
压力回执和恢复完整补全通过。另两个新正常进程v3/v4诊断控制均真实1003，
SHA976b3c852bda6ac56982a8ef7f45b4317cb3c5f25761036e54ef6cc7cffa737f。

独立重读4280单调RSS样本/原日志/metric/native协议，32个PID+启动身份均退出；
16 server全部exit0。sidecar两次优雅exit0，14次在shutdown已ack后按既有1s
终止界限SIGTERM回退，无意外退出。保留该关闭差异，不称全部优雅退出，也
不把server.stop/线程退出当LS.dispose/Registry/GC-live证明。RSS peak/暖尾/
压力后尾值600.77/568.61/578.68MiB；暖10样本补全P95 5028.30ms，定义/引用
327.57/264.43ms；五次恢复4784.01–5035.54ms，5份实际worker recovery日志保留。
已有目录的暖重建90.08–105.84s仍慢，原180s不变，不宣称内存或最终时延达标。

过程中磁盘最低观察约350MB；确认cold2的两个确切进程已退出、保存原日志与
数据库SHA/大小后，另清理该已结束专属缓存607332658bytes，活跃warm/stress
缓存未动。审计明确environmentInterventions/strictTimingComparable=false；
资源和耗时仅诊断性观察，不作为受控A/B、规模增长比例、PSS或release P95。
最终audit SHA dc6e8f532740d421668679fdda1b6d4cab88af94434393e512c7c36d3f7efa0c，
state SHA31463b8438698e08e25403fc49002973eb3944ffab0f983bc88e617cd2cff351。
报告补测范围已执行，不为旧FAIL补PASS；原降级根因、暖目录/关闭净成本、其它
能力/Registry/CPU/GC-live、≥100交替循环、原whole30FAIL及完整OP-00–06/L08
继续推进。没有新整轮GREEN、最终550ms/PSS验收或合入。

## 暖目录成本定位与原子全量清理切片

2026-10-14，parent仍a111235b。已完成上一批后才启动有限目录诊断，不重跑
已通过语义会话。原100k冷/暖各一次，真实adapter/sidecar同缓存、原request15s/
initialize30s/stall30s/目录180s/termination1s；只开已有SQL和阶段计时，不开
扫描全库的storage探针。两次READY、全量100000、601791 occurrence/601194
identity/200 binding行相同，协议/SDK/产物/源码/夹具独立审计通过。
`.bench/op05-warm-catalog-cost-v1/`，audit SHA
c491e3dd030c8bb3e58b0390c2902ff84764631d89ecf1c640549d021197e544。
冷SQL27229.79ms，暖85469.86ms；暖deleteDocuments49855.16ms、commit4671.75ms。
目录总体31842.29/108094.76ms，close778.80/2151.41ms；暖真实SIGTERM回退。
删除是一个已证明主要成本中心，不因此归因旧cold2降级。1664原源码归档
SHAb1832500ea7e3cae564c04348f0823acc964886f64092bbc051a04712adb353d。

先用公开activate_catalog/search、MemoryStore完整结果和重开查询表征1k实例，
真实SQLite C分配请求cold49143/warm68736，原2倍预算通过，不能伪造RED或收紧
门槛冒充成本复现。计数通过初始化前的真实分配函数透传，仅隔离测试子进程
有效；不改生产分配器，不是live bytes/RSS/CPU证明。Context7及
[SQLite配置规则](https://www.sqlite.org/c3ref/config.html)、
[分配接口](https://www.sqlite.org/c3ref/mem_methods.html)保护原内存函数所有权。

随后真实规模公共反例用100k文档、两代完整查询与原SQL trace：旧目录删除
39386.13ms超过整次冷激活21136.09ms，0/1 FAILED。命令为Node20封存外层下
`cargo test --release --locked -p arkts-index-sqlite --test
catalog_replacement_allocations -- --exact
large_catalog_replacement_does_not_spend_more_on_removal_than_fresh_activation
--nocapture`，prefix `.bench/op05-catalog-removal-cost-red-v1`，log SHA
cfc03ede0f02e9e8978c5a531d11ba7c6cdc546387a282935aa62584c09c70c5。
原Cargo失败转录保留；封存脚本最后误用Node TAP字段抛错，初始RUNNING记录
不是存活证明。独立原字节/SDK/source/PID核验后另存terminal-recovery-audit，
实际观察器exit1、Cargo退出码NOT_RETAINED，不补推断101、不重跑原反例。

最小候选一仅在原Immediate transaction内一次FTS delete-all并停用/恢复实际
缓存schema的原删除触发器；SQLite外部内容表语义由
[官方FTS说明](https://www.sqlite.org/fts5.html#the_delete_all_command)核验。
原公共成本用例仍FAIL：delete23217.97ms > cold19275.10ms，实际Cargo101；
`.bench/op05-catalog-removal-cost-green-v1`这个历史前缀不能被当GREEN。
只解决部分开销，不改验收条件。候选二在同一事务先批量清理全部七个子表，
再删除文档，保留foreign-key/原schema/所有数据及原后续insert/refresh路径。
失败则数据和触发器一起回滚；没有新生产接口、迁移或优化开关。
原同用例GREEN：delete14404.04ms < cold18809.33ms，exit0，prefix
`.bench/op05-catalog-removal-cost-green-v2`，log SHA
b57bc7c9f560fef6b2e7414f999a66618be868689cc950b31bdd82ac80eb4dc4。

新公共表征还验证晚到真实SQLite插入失败后：旧generation/全量substring/
exports/引用结果与MemoryStore相等，后续incremental替换和删除、重开仍正确。
整个index-sqlite包72/72、19个原生section、exit0、零ignored/filtered；嵌套
子进程不重复计数。prefix `.bench/op05-catalog-reset-rust-focused-v1`，audit SHA
34c303ec975c8929ac7ada9645e833d1490abd89ba783f88f526fd4dcd8e8e1b。
格式仅变本批owned文件，最多248行；之后三个小型Rust用例再次通过，原100k
成本例不为格式重复执行。Clippy先抓到测试中的三处无用into，修正后严格
`cargo clippy --locked -p arkts-index-sqlite --all-targets -- -D warnings`通过。
pnpm check、cargo fmt/diff检查通过；完整TypeScript whole仍未新跑。

相关release构建真实cargo exit0，源码before/after稳定；只有sidecar产物SHA
84597a63→8e9babc3bdaaa32747e5f55df9016dc196431e2baa1250180de1f20301674016。
Node server/各worker实际字节未改变，源码输入指纹随Rust变化，不再把新产品
绑定旧d6源码标签。通用封存器的测试式“产物不变”guard返回2是预期产物替换，
不是Cargo构建失败；原记录及独立transition审计均保留。

新构建仅做原100k冷/暖目录各一次，SDK/策略/预算/夹具/原期限不变：两次READY，
原完整行数不变，两个实际sidecar都优雅exit0。冷SQL27023.57ms近旧27229.79ms，
但冷整体49091.46ms比旧31842.29ms更慢，SQL外增量仍待归因，不隐藏不利值。
暖delete26622.40ms、SQL46592.50ms、整体67699.48ms、close958.52ms；旧值
49855.16/85469.86/108094.76/2151.41ms且关闭SIGTERM。有限数据支持该删除成本
切片改善，不是受控正式P95/内存/全部关闭场景收益。目录
`.bench/op05-warm-catalog-candidate-cost-v1/`，audit SHA
15dd9d76a03fed3dd02a05529188d30d359a9e04add01c0edf6f03024465d59b。
旧目录诊断专属缓存607682560bytes在实际进程退出、审计及文件SHA保存后清理；
原IO/SQL/stage/源码字节保留，可重建，不触碰新测试数据库。

新native的三个相关公开文件12/12、exit0、零skip/cancel/todo，包含真实stdio
持久目录两代、未打开新增引用及恢复；其它overlay/adapter为各自原表征，不
冒充全SDK产品工作流。prefix `.bench/op05-catalog-reset-native-lsp-focused-v1`，
log SHA425594f5acda6c4c71499e88d64032c13830903481d23d3e983fd641296b1371。
综合slice audit SHA48cd0e79f4fef0ed68434a133881c08bf0e6a1147ad8aa2a3755491e75e9463f；
最终1668源码聚合3b1f7b2bfee04fb6bddfdba932670efac46d6fb20227c455c24b050a0436feab，
原字节archive SHA41afe498962caed2b8dd8280759d47954b510f92894dfbd4fde490ddb524d213。
切片保护与构建已具备；六默认/1024MiB/owner/contexts/滞回不变，旧全部FAIL保留。
原cold2降级原因、SQL外冷成本、当前whole30FAIL、≥100交替循环、其它能力/
Registry/CPU/GC-live及完整OP-00–06/L08仍待完成，没有新whole GREEN或合入。

## 当前整轮与观察窗口：两个公开 RED→GREEN

暖目录候选之后，原30失败清单一次性复现为30/30 PASS，71项总计中的41项
是显式名称过滤，不是完整回归。prefix `.bench/op00-whole30-current-reproduction-v1`，
log SHA9d637cb1128e891a53290fa0b12eb869450645163bdf4dcde3aaa1c0afb87e02。
随后完整`pnpm check:fast`实际终态1697/1698、1 FAIL、exit1，零skip/cancel/todo，
2866246.936015ms；原30用例也全部在该整轮通过，原期限未变，不证明旧失败
的唯一原因。新增25项工具保护不能拿旧1673分母替代当前1698项。

整轮prefix `.bench/op00-current-whole-after-catalog-v1`，log SHA
e2733434d9b9a40accb769916e29fdceadb99be2ffa272d109494ac4124c3d72；
独立terminal-audit SHAb6156f4a5de0a1c9ee61b8e24f32873e1f78f7882a27654d87e708eafb40fd28。
完整1668源字节archive SHA827b2d0d2a6eb711574cf15dbffe227c76ffd0e8f443cb12d74b2a7f3a09e0b8，
全部before/after源码、SDK、产物及实际PNPM退出核对通过。封存器的TAP计数字段
为-1，只是对SPEC reporter不适用；原字段不重写，以上数取实际最外层终态SPEC，
不累计测试内自建子进程summary。旧1643/1673、30 FAIL原记录保留。

唯一FAIL为`prepared suite verifies recovery when natural L3 already disposed the context`：
前面的三份完整引用结果、当前诊断、真实驱逐断言均通过，失败在末尾
`idleEnd.monotonicMs - idleStart.monotonicMs >= 200`。原测试清理了临时report，
该整轮实际idle差值NOT_RETAINED；不能把后续注入值冒充原样本或推断唯一原因。

按Context7核验的[Node20定时器契约](https://nodejs.org/docs/latest-v20.x/api/timers.html#settimeoutcallback-delay-args)，
单次定时回调不保证精确触发时间。首个公开CLI反例仅在collector进程提前一次
200ms回调；真实performance时钟、server、sampler、完整payload和RSS不改。
配置和idle起止事件都存在，实际仅1.839133ms就结束，0/1选中FAIL，2项名称过滤。
最小修复以真实单调deadline检查剩余时间，不padding时间戳/资源或降低断言；
同反例GREEN，回调仍约1.27ms，实际观察201.800741ms。prefix分别
`.bench/op05-minimum-idle-observation-red-v1`／`green-v1`，log SHA分别
4f0416fdb9692868c2532df38415b5f4f212c9e7ab9895d9c6629fea20bc2560／
4355ab2d13fdd7b18bb5a78dc48e30f299a6d2e72db8e95129d2bfbefe1175f3。
随后完整三例3/3、exit0、零注解，原自然L3与Registry收尾保护通过。

第二个独立纵向反例覆盖同collector的120ms驱逐后窗口：原单次剩余时长等待
只观察2.095239ms，0/1选中FAIL、3项过滤。改为同一单调deadline等待，并把
观察起点置于start记录之后；Worker回收已消耗的时间仍计入，不重复等待整窗。
同反例GREEN，真实窗口121.762358ms。prefix分别
`.bench/op05-minimum-eviction-observation-red-v1`／`green-v1`，log SHA分别
cf96f8624640afdeb5ec5c94e28b57b45b6d608ce8b8bcaf3c920a944d9486c5／
7966f17ba44a73af359c7bd15472b32fdef95248d9a9a08a1e41f97789161e91。
只提前外部timer边界，真实LSP/压力见证/最新诊断/引用与Registry断言保留。

新七文件完整相关回归65/65、exit0、零skip/cancel/todo、143675.009915ms，
prefix `.bench/op05-minimum-observation-related-v1`，log SHA
db277bff5bb1db78d6e08e16ea14a20aadcb076da8fd13fef497dad5bdc84ee9。
两窗口及原自然L3、Worker回收、诊断/readiness、原始RSS/单调消费保护通过；
综合slice audit SHA2c5e3de74dbc2efa6998cb2a9460b75fdcafbaf326f88ecd7fd0b06aa942a8d3，
各批source archive/log/SDK/产物/实际PID退出独立核对。手写四文件474/158/223/24行，
无新CLI参数、开关或生产预算变化；Node/sidecar实际字节与六默认保持。
注入preload只用于测试，不加入真实产品或资源实验。pnpm check/diff检查通过。

这两个切片修正观察时长资格，不是加快产品RPC、PSS/GC或整阶段验收。
修复后fresh whole仍待运行，原1697/1698 FAIL不覆盖、不能合入；下一步先完成
当前完整回归，再继续SQL外冷成本、其它能力/Registry/CPU/GC-live/≥100循环及
客户端/最终矩阵，完整OP-00–06/L08范围和550ms门槛不变。

## 修复后整轮与 auto-import 测试目录前置条件

观察窗口修复后完整`pnpm check:fast`真实终态1699/1700、1 FAIL、exit1，
零skip/cancel/todo、2965326.090448ms。两个新窗口反例、原自然L3、原30失败项
都在本整轮通过；唯一新FAIL为超过4096导出auto-import的首次completion
返回-32803/current workspace inputs，约998ms，不是原期限超时或配额截断。
该用例在上一完整整轮通过过，不能凭计时修复或单跑覆盖这次FAIL。
prefix `.bench/op00-minimum-observation-current-whole-v1`，log SHA
16d2b2127798bc2d2c2517dd5a6303ec82ae6a9aee5d9a6d96ad1d62530a805d；
独立terminal-audit SHAe7349cbcead826a6d6b5320dc03c85b170427c6e8a80afcb221749d14f03d624。
1669原字节archive SHA69f974c6b1e4c31fedd794214b993a1c1cc4f45dc923106e2fa2166eb750463a，
全部前后源码/SDK/产物及真实退出一致；原1697/1698与旧30FAIL仍保留。

固定六次单例均PASS，每次19总项中18项名称过滤，不是whole；随后原文件完整
19/19亦PASS，log SHA33f07931f186908e92113980f85fcc74e7998ebd1acf8a58aec0625753d83a66。
仅在真实目标response返回后通过公开LSP测试接口保留完整目标params/result、
stderr、两份源字节及协议metadata。observer的elapsed包含post-response捕获I/O，
不用作产品计时；metadata transcript不冒充全部payload转录。原-32803仍未复现，
唯一原因NOT_PROVEN，不按结果追加成功样本或宣称修复。

一次1000ms测试sidecar目录提交控制得到另一种明确FAIL：完整正确fallback
回答仍存在，但Program为25根，不是正例宣称的已就绪两根。固定150/300/450ms
三个控制均PASS，实际目录终态都早于completion开始，没有复现原-32803。
这只证明“缓存workspace/symbol可查询”不能作为committed catalog-ready证明，
不能把另一个25≠2断言失败当原输入拒绝的唯一原因。

原19/19 GREEN保护下将该独立完整性用例从1777行文件提取，旧文件1606行，
新文件188行；旧文件其余字节与封存原文减去该case严格相等。仍有>500行迁移债，
不是新增超限许可。新增精确test entry使库存191→192、bundle-e2e86→87；
两个原精确库存RED均保留，修正后完整三文件23/23、exit0、零注解，log SHA
1a85fd7d79e0c5c411531cef84fd502ba6e9776680ba1078915023fd1943d5aa。
原行为19项未减少，测试文件拆分不等于新增能力或whole通过。

提取后的同一1000ms控制原case再次RED25≠2、0/1，log SHA
01817f90225e551a4222e594350f337a05a26d9357f533eff1acd84e1aa955be。
最小测试修复只为正例开启标准work-done progress客户端能力，消费实际目录
终态`Indexed 1/1 files; skipped 0 entries`，随后保留原完整payload/位置、两根/
预解析和stale完整25根/resolve回退保护。第一版错误匹配ready字符串的FAIL
保留；第二版原控制GREEN1/1，log SHA
21c346f0a4e029b3f50c0aad23e212c2fbb5b143171611262e4c1027d48c693b。
原LSP5s、test60s期限不变，无预查询目标、伪造READY或生产代码/预算修改。
新独立文件192行，并让未来completion拒绝断言携带原stderr，避免再次丢失原因。

四文件完整相关26/26、exit0、零skip/cancel/todo、30510.329193ms，prefix
`.bench/op00-autoimport-committed-catalog-related-v1`，log SHA
508f76ccf0e73ea0a6d3df6747cbf0a5faff096a1cea97d9e3d6730f0fb792f7。
包括原表征、库存及catalog期间缓存workspace/symbol响应合同；生产未加等待。
综合slice audit SHA835e41f32da867029945bd8cd564509276cbd9f599858d31726101c8cedcd51d，
逐批原字节/日志/捕获/SDK/产物/实际PID退出核对。只修已证实测试前置条件，
不声称原整轮-32803唯一原因或生产性能改善；当前source fresh whole仍待运行，
原1699/1700 FAIL保留，不能合入。后续原成本/能力/生命周期/平台和L08门槛不变。

## 后续整轮无根总计与退出诊断

`.bench/op00-committed-catalog-current-whole-v1*`实际已终态，PNPM exit1/signal
null；记录器因缺少最终根SPEC总计另退出2。counts必须保持null，不能把日志中
1466条已通过行当整轮计数，也不能宣称1700/1700。日志止于completion-resolve
text-change取消用例；旧30失败项、auto-import、两观察窗口和自然L3已有通过行，
但剩余库存执行与完整GREEN没有证明。生产/SDK/1670文件归档前后稳定。
log SHA3817ec7d5a472525087eefacd1903e5a537b792dac2fd2d6ba66c3c578772c90，
独立abnormal-terminal-audit SHAa2768d09abb3553c4cdcb731083880cfac2735b0fcd761ff2b2af519a3c68655。
底层Node退出码/信号没有保留，原唯一原因仍NOT_PROVEN，不补造信号或失败项。

退出后磁盘可用约382MiB是明确环境风险，不证明它是该次退出的唯一原因。
只清理已核实实际进程83016/83046/83072退出的本任务candidate-cost缓存：
精确`op05-warm-catalog-candidate-cost-v1/cache`内唯一SQLite数据库607686656字节。
删除前记录路径/文件SHA/原终态state摘要，日志、SQL/raw、原fixture、源码归档
全部保留；缓存可从原100k fixture重建，但未归档可逐字恢复的数据库副本。
清理audit位于该批目录`cache-cleanup-audit-v1.json`，不清空bench或其它临时目录。
之后设备空闲空间还会变化，不把全部空间回升或后续通过归因于这一次清理。

退出诊断按公开真实子进程RED→GREEN补齐：`run-node-test-layer`仅向stderr输出
实际child code/signal，成功child缺失/损坏/超限runtime报告另列原因；结果、原
退出与fail-closed策略不变。信号v1测试错误杀到内部test child的失败保留，
v2在实际spawn边界终止根child，RED为空stderr→GREEN明确SIGTERM且不伪造总计。
缺失报告反例先完成真实clean test，再在外部文件边界移除报告；原静默exit1
RED→GREEN明确ENOENT/child-code0。普通test失败继续保留code1/signal null。
前缀`op00-layer-{signal,summary}-diagnostic-*`；初步相关49/49，见OP-06联合审计。

后续九文件第一次默认sandbox回归103/119、16 FAIL、exit1，所有失败涉及被拒绝
的ps/进程探测；原log与terminal-audit保留，非代码GREEN。相同源码、原期限和
正常single/24-file fixture在允许原生探测环境119/119、exit0、零注解，330522.804278ms。
source/产物/SDK前后相同；未重复已完成10k/100k性能批次，未改断言或加预算。
`.bench/op06-regression-and-diagnostics-native-related-v1*`，log SHA
e7ae113915a541a50a569d0da12106ba68125f261099d2514e2183d96c5e018d，
独立audit SHA313dc8c476da34eb8f9c3fc3788efc825aba53f94c8d562291cab4278878cc4d。
这批是相关回归，不是完整check:fast；新工具whole仍待运行，原异常整轮不覆盖。

## 两入口存活owner与真实自动回收

2026-10-16，同一production72358623／source1744个文件f44a1438，复用完整安装
API24 SDK和34源／32真实推导hop语料；Program覆盖34项目／255 SDK／52 stdlib／
61自动development声明，共402，不冒充Settings或独立真实工程。六默认、1024MiB／
原滞回、单owner／最多两context不变；sessionReuse／Snapshot／overlay-sync／
主动回收／强制GC均关闭。真实编辑Seed、正常查询及打开入口的逐版诊断不省略。
观察仅转发实际bundle的原生compiler调用，不修改磁盘产物或发布结果；它不是正常A/B。

原计划两入口各20次编辑，5／10后分别实际L2／L3，owner保持存活20秒再显式恢复。
打开入口首次运行`.bench/op05-alive-owner-native-v1/`在18失败，17次完整通过；
原stop-after-failure留下disk未执行。其后仅首次补执行原未运行的disk入口，目录
`.bench/op05-alive-owner-unexecuted-disk-v1/`，20次原断言不变，同样17完成、18失败。
不重跑opened、无第二次disk尝试。合计40计划／34完整完成／2失败／4未执行，
两入口19／20及disk计划末尾didOpen／诊断都未执行，不算通过。

两次18的定义及hover仍是精确当前number结果；实际sampleMemory调用栈见L3
`#evict`，native leases归零，随后readonly READY为UNPREPARED，严格诊断保持FAIL。
这是预算保护下实际撤销认证，不等于错误答案、已证实产品缺陷或恢复后永久失效。
两入口此前手动L2／L3均真正释放并显式恢复完整READY／查询；自动L3后的额外恢复
未测试，不补造通过。旧1862/1862代码回归不覆盖该资源／READY持续资格失败。

| 入口及owner存活20秒窗口 | 原生lease末值 | 旧Program WeakRef末值 | major GC | PID RSS开始→末值 MiB |
| --- | ---: | --- | ---: | ---: |
| 打开调用方L2 | 0 | 全部清空 | 3 | 798.02→82.84 |
| 打开调用方L3 | 0 | 全部清空 | 3 | 469.36→89.21 |
| never-didOpen源L2 | 0 | 仍有4个 | 0 | 469.04→469.13 |
| never-didOpen源L3 | 0 | 全部清空 | 3 | 547.58→91.05 |

同一PID／thread1在各自窗口内继续存活；每入口观测21次原生dispose，均有实际
fork refcounts与独立有界账本核对为0。没有合适GC的disk L2存活WeakRef不证明
泄漏；有GC的L3窗口支持旧观察对象可回收，不证明所有隐藏AST、物理释放或PSS。
所有观察GC均无FORCED标志，global gc不可用；未申请强制GC。
Node的[Rss／Worker作用域](https://nodejs.org/download/release/v20.19.5/docs/api/process.html#processmemoryusage)
和[GC事件字段](https://nodejs.org/download/release/v20.19.5/docs/api/perf_hooks.html)
分别解释进程RSS和isolate heap，不能叠加线程RSS或用shutdown尾部替代存活idle。

disk失败前额外只做一次元数据flush，无查询重试。实际39个Program、22次LS创建／
21次dispose；其中17个同LS后继Program复用全部255 SDK／52 stdlib对象identity，
只换1个项目SourceFile，不能误称39次完整SDK解析。跨LS冷准备则重新得到全部
SDK／stdlib对象；源码保守content-revision重建与之相符，但不据此推广已拒绝S05，
也不把对象identity等同独立parse调用计数。末flush新普通查询owner有402当前lease，
不是旧dispose残余或重新READY。该次定义RPC约126736–131548ms，自动L3约129284ms、
新LS创建约129290ms，均在同一RPC内；接下来的hover尚未开始。不能把这次请求内
驱逐／再冷准备误记为hover创建。原opened失败路径没有全量source-ID摘要，不作同类推断。

两次native LSP及sampler均正常exit0，原PID均不存在、私有Seed恢复，源码／产物／
完整SDK前后相同。原opened audit9ff9defa；联合audit-v2 d8acb52e，完整SHA
d8acb52e587f51d6acc3b25d0261715c4249cbe5c3b8897147b89aabe0baa1c7，
状态INTEGRITY_PASS_ORIGINAL_AND_SUFFIX_FAIL，product NOT_ACCEPTED／releaseEligible=false。
完整原始响应／RSS／GC／Registry／失败尾部及每个artifact SHA均封存；不追加有利重采。
联合v1保留，仅纠正其中新owner被称为hover owner的解释；原数据、断言和FAIL不变。

本窗口不支持“原生lease持续残留”为首要解释，也未证明旧正常RSS1.1595的唯一原因。
下一切片转向实际编辑触发的完整SDK／stdlib冷准备及请求内驱逐再建：先形成两入口公开成本反例，
保持完整输入／最终fence／取消／压力及保守失效，再验证最小候选，不能加预算、
缩小SDK／图或缓存跨批AST来换通过。复杂真实closure、一般delta／未知在途、
其余能力／≥100循环／soak／平台及全证据消费仍继续；550ms／最终PSS仅留OP06／L08。

## 延后认证候选回退

2026-10-16，本切片针对前述“根认证完成后sampleMemory驱逐，同一定义RPC再冷建”
提出候选：只准备既有显式会话的完整根scope，认证留到实际查询lease内；不改
压力门槛／最终输入fence／取消，不新增owner、缓存、开关或跨批AST。父HEAD仍
a111235b。候选production d13c4508、1746文件source078070d6，均是已回退的历史身份。

真实framed-stdio、未打开源、实际watched依赖编辑先RED：一次定义创建2个context，
L3均实际lease0驱逐，精确结果正确；最小候选GREEN为1次创建／1次驱逐，打开调用方
也通过相同反例、当前诊断及显式恢复。RSS边界只在私有fixture中合成，不是性能／
内存测量；候选并没有证明自然压力下原40编辑计划通过。

两次完整相关82/84 FAIL分别保留：原取消观察用例看不到后置认证的input-check事件，
另有新增测试库存计数未同步。独立未引用成员负例实际PASS，识别缺失依赖2307、
降级并恢复；排除“漏查完整成员”假说，不能把该次名为detached-scope-red的PASS
伪称RED。随后真正input-trace RED2/3，再补回启用trace的实际检查边界并保持trace0
不输出，原定义／引用取消完整断言恢复。最终12完整相关文件87/87、exit0、零注解；
原取消、SDK物理新鲜度、两入口、队列和输入保护未放宽。TypeScript check通过。

旧构建用归档源码重建，4个native bundle逐字节匹配原72358623；当前构建和旧构建
仅3个生产文件不同。随后固定baseline／candidate／candidate／baseline，每块两入口，
共8新进程；每会话2次真实Seed类型编辑，完整安装API24 SDK、六默认／1024MiB、
正常诊断，module reuse1固定，trace／preload／profiler／GC／Snapshot／overlay-sync均0。
没有与回归／profile并发，无目标答案预查询。48定义／hover、32当前READY、12最新
正常诊断和8真实exit0全部一致；34项目／255SDK／52stdlib／402 Program覆盖不缩小。

| 入口 | 旧构建编辑定义中位ms | 候选中位ms | 正序采样RSS比 | 反序采样RSS比 |
| --- | ---: | ---: | ---: | ---: |
| 已打开调用方 | 2910.98 | 2669.99 | 0.9561 | 1.2450 |
| never-didOpen源 | 2995.47 | 2686.27 | 0.7793 | 1.2822 |

每入口／arm只有4个编辑定义样本，不作P95／550ms、Settings或PSS声明。正常对照
的source身份与native字节分别绑定：capturePreparedIdentity的serverInput反映当前
host仓库，baseline出生输入另以72358623及归档精确字节证明，未错标为新代码。
产物目录不同也保留为资格边界，不据RSS断言唯一原因或持续泄漏。无强制GC；
原始单调RSS逐点PID去重和sum／peak核对，所有目标进程及记录器均已退出。

中位数约改善8.3%／10.3%，但预声明每对RSS≤1.10假说被两反序对反驳，不能只取
正序或合池峰值采纳。本候选REJECTED：完整归档后仅撤销本轮7个owned文件变更，
3生产文件／2既有库存文件恢复原字节；本轮新增的fixture与测试移出工作树，可从
封存源码逐字恢复。原用户／此前修改完整保留，没有新默认开关或远端写入。
恢复后production72358623、1744文件source2eb90542及4个bundle均与本轮前完全相同，
216总入口／209fast恢复；原1862/1862证据仍适用于相同执行输入，不称候选新whole。

目录`.bench/op05-query-root-certification-v1/`保存各次原命令／parent／完整source／
日志和终态；candidate-native-archive.json另封存75个生成产物。原生正常对照目录
`.bench/op05-query-root-normal-v1/`不重跑，原八份report保留。联合audit SHA
0a597d18d1b708c73c5663be34816678096fa85584fd00de5042ca2893f7ff8b；
恢复审计SHA4e744a73f7525399bb90d103132a18229ca3d0a6463372859387ca0cbe375eea。
候选source档案SHA4d56f4106f4931ddb327328602268980933e66c615a3c732b260077a3b04b674。
全部releaseEligible=false，目标仍未完成；原40编辑FAIL／RSS1.1595及历史失败不覆盖。

拒绝本候选是该切片比较约束的结论，不是用最终550ms／PSS冻结前序计划。下一项
转独立一般磁盘delta／未知在途、复杂真实closure和其它冷SDK准备机制；不重采
本候选寻优，不重开已拒S05／SDK候选Map／Snapshot推广。原≥100循环、物理资源、
真实工程、客户端／全证据消费、平台和完整OP00–06／L08范围继续。
