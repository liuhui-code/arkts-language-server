# OP-06：逐请求发布证据的真实性与完整性

日期：2026-10-12；资源消费补充：2026-10-13。状态：本切片 GREEN；OP-06 / L08 仍 IN_PROGRESS。
父修订：`a111235bc4bfcb55b126752f95b3ba095f2996af`，分支
`codex/op00-query-attribution`，叠加已有 OP-00/01/02/03a 工作树。
采用 TDD 的公开 CLI 反例和最小实现；不改生产语义 owner、预算或默认策略。

本切片落实[后续计划 OP-06](../plans/2026-10-11-query-performance-follow-up-plan.md#op-06-最终验收工具与-l08-完成审计)
的证据消费保护，不是完整 release evaluator 的完成审计。
全部样本满足既有条件时，仅 correctness / ready / latency 三项可通过；
其它必需门禁缺失时仍不能发布。生产毕业要求没有变化。

## 表征与接口

随后2026-10-15：[原产品内存与PSS记录消费](op06-product-memory-comparison.md)
已公开RED→GREEN、相关75/75并独立审计。原数值/3-10-5合同复用不变，当前
SDK/构建/配置/选定策略绑定，原始proc字节数/角色/时钟完整复查；summary或
记录内部PASS仍不足采样/真实scope，整体BLOCKED。缺文件保留已核验query行，
没有虚构缺失字节SHA。本机无Linux/DevEco新实测，完整release正例未完。
audit SHA443fb2ab083e52bf5d4a4f874942b1647f1ca2b5cbf8cf9e4232ec2ce4568aaf；
原whole9FAIL与完整OP-00–06/L08范围保持，没有毕业或合入。

最新本地2026-10-15：[原始资源文件切片](op06-raw-resource-artifact.md)已公开
RED→GREEN并落回项目，保存sampler原字节，消费端重读hash/长度/全部记录，
旧报告明确未绑定，不授予PSS；项目内七文件73/73、零注解、身份稳定，audit SHA
ad449f9816f9250bbf13859acb86d4c1653033f9dfc5d3d13d510abfb3b12abf。
此前首轮实际公开完整采集1727项1718/9FAIL、exit1，证据完整性独立审计通过，
不等于回归通过。原失败五文件有限24/24及单例通过未复现，原9FAIL保留。
原资源覆盖/OOM、lifecycle/≥100循环、portability/DevEco-PSS、完整正例与336格
仍未完；evaluator仍不授予releaseEligible=true，没有新whole GREEN或合入。

继续使用公开命令，无新增开关或私有判定入口：

```sh
node scripts/bench/assert-semantic-release.mjs \
  --matrix config/semantic-release-matrix.json \
  --prepared-report REPORT.json --out NEW-REPORT.json
```

无证据、兼容 SDK、336 格、500 ms 目标 / 550 ms 上限、样本下限、候选
控制、trace-only、完整差分和原合同漂移的现有表征 11/11、exit 0，
1354.192109 ms，原日志 `.bench/op06-sample-evidence-characterization-v1.stdout.log`。
仍保留诊断和归因报告；它们不能充当正常产品时延或最终资源证据。

## 实际 RED → GREEN

每一项先运行公开命令的失败反例，再实现最小保护；未批量先写全部测试。
Node 为 `/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node`，
所有 RED 的原始根退出都是 1，失败 1 项，其余是名称过滤的未选中项。

| 反例 / 原失败 | 实现后的公开行为 | 原始证据前缀（均位于 `.bench/`） |
| --- | --- | --- |
| 同一会话报告只改变 JSON 格式再次导入，原本重复增加请求数；CLI exit 1 而非 2 | platform + hostname/PID/start + scenarioId 唯一；重叠尝试 exit 2、不写验收报告 | `op06-duplicate-attempt-{red,green}-v1` |
| 报告声称 PASS，但 planned > executed；原 correctness PASS | 检查实际行数、计划数、执行数、未执行场景、失败与退出；保留已执行 100 行并判 FAIL | `op06-incomplete-plan-red-v1`、`op06-incomplete-plan-green-v2` |
| 两构建各有 100 请求 / 5 会话，原汇总 latency PASS | 两组 200 行均保留，`MIXED_INPUT_IDENTITIES` / BLOCKED，不选更快构建 | `op06-mixed-input-{red,green}-v1` |
| reference target 的请求被写成 hover，原导入未拒绝 | 请求 kind 与 target kind / 引用声明策略必须一致；exit 2 | `op06-target-binding-{red,green}-v1` |
| hover 完整 payload 与 expectedPayload 不同，却标 equal=true；原 failures 0 | 重比完整 payload，failures 1、correctness FAIL，不仅检查布尔值 | `op06-payload-diff-{red,green}-v1` |
| collector 原本未保存完整引用 oracle，expectedLocations 是 undefined | 公开 collector 同时保存完整 actual 与 expected Locations，编辑使用当前已核验 oracle | `op06-location-report-{red,green}-v1` |
| actual 引用同数量但 range 不同，两份标签仍声称相等；原 failures 0 | 精确相对路径 + UTF-16 start/end 比较，failures 1 / FAIL | `op06-location-diff-{red,green}-v1` |
| 100 请求 / 5 会话的当前 ready 证明存在，但一行缺完整 oracle；原 correctness PASS | 不删该行，完整结果与 latency BLOCKED，`FULL_RESULT_ORACLE_MISSING`；ready 独立判定 | `op06-missing-oracle-{red,green}-v1` |
| actual / expected 均重复或包含负坐标、逆向 range、越界路径，却有 equal=true；原 failures 0 | 重新检查两侧集合合法性和唯一性；全部四控制 FAIL | `op06-invalid-locations-{red,green}-v1` |
| 同一个合法引用集合仅顺序不同，首版严格数组比较误判失败 | 引用按精确位置集合比较；其它完整 capability payload 仍保留顺序 | `op06-location-order-{red,green}-v1` |

CLI 测试命令为：

```sh
node --test --test-name-pattern='对应公开 test 名称' \
  tests/semantic-release-matrix-cli.test.mjs
node --test tests/semantic-release-matrix-cli.test.mjs
```

collector 的公开 RED / GREEN 使用原同一临时 suite：

```sh
node --test --test-name-pattern='candidate catalog readiness never' \
  tests/prepared-suite-cli.test.mjs
```

collector 修改前表征 1/1、exit 0，1483.993397 ms；RED 为缺完整 oracle，
0/1、exit 1，1205.656433 ms；最小 GREEN 1/1、exit 0，1309.136044 ms。
它验证报告生成，不将协议 fixture 当成产品能力或性能测量。

未删中间失败：`op06-incomplete-plan-green-v1.stdout.log` 仍为 12/13、exit 1。
该次已纠正 correctness，但把汇总可信度与查询 ready 证明捆绑，导致 latency
为 BLOCKED 而非失败；随后分开这两份证明，v2 13/13。

所有逐项 GREEN 都运行完整 CLI 文件；最后为 20/20、exit 0、零
skip/cancel/todo，2789.311335 ms，
`.bench/op06-location-order-green-v1.stdout.log`。

## 实现范围与 GREEN 下重构

- `assert-semantic-release.mjs`：样本唯一性、target 绑定、计划完整性、单输入组、
  完整 raw/oracle 重比与缺证据理由；不改变矩阵或原门槛。
- `prepared-query-report.mjs`：新增 `expectedLocations`，来源仍为已按输入 pin
  加载的独立完整 oracle，不重新查询目标或构造更小结果。
- synthetic receipt factory 提取到 `tests/support/semantic-release-evidence-fixture.mjs`；
  提取前后均 18/18 GREEN，明确只验证消费者，不能做产品证据。
- 没有新 executable test entry，库存仍 188；没有 Rust 或生产 source 改动。

本切片所改 handwritten script/test/helper 为 251 / 126 / 471 / 443 / 62 行，
均 ≤500。没有新增超限文件；前序 OP-02 记录的 language-service / document-store
迁移债务未在本切片变动。

## 冻结的相关回归

2026-10-12T15:22:18.309Z 启动，15:23:47.957Z 完成。

```sh
node --test --test-concurrency=1 \
  tests/semantic-release-matrix-cli.test.mjs \
  tests/prepared-suite-cli.test.mjs \
  tests/prepared-suite-interactive-cli.test.mjs \
  tests/prepared-suite-semantic-readiness.test.mjs \
  tests/prepared-suite-diagnostic-worker-pin-cli.test.mjs \
  tests/product-gate.test.mjs \
  tests/test-layer-manifest.test.mjs
```

真实 Node test child 81/81、exit 0 / signal null，83876.919489 ms，
零 skip/cancel/todo。含真实生产 compiler / framed stdio 的 ready 当前查询和
五个独立 fixture 进程、100 次 repeat 请求；该 repeat cell 的三项判定通过，
缺其它格和门禁仍不可毕业。这不是 Settings 的未查符号 / 普通编辑 P95。
collector 的完整位置对照、完整交互 payload、过期/缺失/配置覆盖证明、
诊断 Worker pin、原内存判定和库存保护一并通过。

原始日志 `.bench/op06-sample-evidence-focused-v1.stdout.log`，SHA-256：
`e18eac645f7190c2cdefd96de8cd07e8517d98523442e854b15a5f2bccd02246`。
`*-state.json` 保留真实 child exit、前后仓库及生产身份；1627 文件的前后
仓库 digest 同为 `2e7f1094b66965dd5b7743a7bd037eab9e53c51dac879bb387925037a9ff39ec`。
生产 input / server 仍为 `eae466b597b49cfc44b903319a1cb0a9872a6ce7c8c06510d47a5f1e2655f119`
/ `97cfc0467ce2b6fc46cb0a85142c7343d230c97141c5f6c561709d05ed2466ed`；
Settings / SDK / compiler / workers / sidecar / Node / lock / memory-gates 等
全部前后 pins 与 OP-03a 冻结构建一致。

控制器自身 exit 2 也保留：比较 build-identity 顶层而非 `.pins`，误报不匹配。
未重跑测试或覆盖原 state；独立终态审计重新比较全部实际前后 pins、日志 hash、
81/81 计数及真实 child exit，`*-audit.json` 为 PASS / audit exit 0。
这是审计包装错误，不是隐去一次产品或测试失败。

## 尚未完成的原目标

OP-06 仍需消费资源 / 生命周期 / portability 原始证据、DevEco/PSS、
原 >3 GB 引用与 ≥50% peak reduction、≥100 soak、当前完整能力回归和统一
冻结发布构建，再验证全证据正例可 `releaseEligible=true` / exit 0。
当前入口仍不能发布，不能用本切片的三项正例关闭这个缺口。
必要 raw/transcript/oracle 身份及足够新符号分层仍要完成最终消费审计，
不能只靠同数量或重复目标填满新符号桶。

原 OP-02 whole 1608/1610、两项原期限超时、exit 1 不改写；
OP-03a 当前 eae466b5 构建的新 whole 仍 NOT_RUN，81 项 focused 不能替代它。
OP-00/01/02/03a 的其余证据与采纳审计继续推进，OP-04 有界 Snapshot 和
OP-05 回收/恢复校准不以本最终工具或 550 ms / PSS PASS 为共同启动屏障。
不合并或 push，本切片随分支后续新完整 GREEN 经 PR 交付。

## 2026-10-13：原始 RSS 证据消费

继续同一公开 CLI，无新增参数、不改变生产语义/预算/默认策略。本补充只核对
已有prepared报告中的external-process-tree-rss曲线，不能通过PSS门禁。
父修订仍a111235b；生产source/产物保持C2 c2a50003。之前81项及1648 whole
分别属于原冻结身份，不借用为本后增工具/测试的完整head结论。

三次纵向公开RED→GREEN，全部production/SDK/repo前后身份稳定：

| 反例 | 原行为 | 最小修复与原始前缀 |
| --- | --- | --- |
| peak摘要与完整raw曲线矛盾 | memory NOT_RUN，忽略矛盾 | 重算Node/product/sampler三个已采样peak；`op06-resource-summary-{red-v1,green-v2}` |
| sampler报错，但完成查询/部分曲线正确 | memory BLOCKED，丢失失败 | 保留查询20行，memory FAIL/`MEMORY_SAMPLER_FAILED`；`op06-resource-sampler-{red,green}-v1` |
| 实际时间戳有间隔，摘要却声称p95=0 | memory BLOCKED，未核对摘要 | 重算gap p50/p95/max、核对请求间隔合法性；`op06-resource-interval-{red,green}-v1` |

所有前缀位于`.bench/`，RED真实根exit1，分别0/1、1/2、2/3；
GREEN联同原矩阵/库存分别25/25、26/26、27/27，真实exit0。
保留summary-green-v1的24/25 FAIL：新增测试已通过，但库存分层总数尚未更新；
修正为191个entry/unit-contract90后v2通过，不删除中间日志。

新增原始曲线边界表征包括PID去重、server PID缺失、product sum矛盾、负/非有限
RSS、丢样本/空曲线、时钟倒退、平台不一致、另外两个peak矛盾，以及合法反序
进程列表、大于1024MiB的观察与trace-only。完整三文件30/30、exit0、
4367.256602ms，零skip/cancel/todo，前后身份稳定：
`.bench/op06-resource-raw-contract-green-v1*`，log SHA
ed568eb6420d0353ddc3d37f24b8fc7608340563f3b76648746cf88116b69a81。

实现为`prepared-release-memory.mjs`55行、公开evaluator259行、新test146行，
均≤500。原始曲线核对结果在各inputGroup中按file/SHA保存，失败原因汇入cell，
不移除矛盾会话或已完成结果。既有正确性/ready/latency判断独立保留。
Node PID RSS一次计量，sampler不加到product；线程不冒充额外进程。

`memoryEvidence.status=PASS`只表示该归档RSS记录内部一致，cell.memory仍
BLOCKED/`RSS_NOT_PSS_RELEASE_EVIDENCE`。离散采样peak是观察下界，不是连续
真实峰值；不会补成Linux PSS、GC/退出释放证明或DevEco比较。1024MiB是既有
政策参数，不新设RSS硬上限；trace-only不会变正常产品证据。

本补充之后八文件真实collector/完整payload/ready/原内存工具相关回归已87/87、
exit0、80697.834811ms，零skip/cancel/todo，所有production/SDK/repo身份稳定；
`.bench/op06-resource-collector-focused-v1*`，log SHA
6de27e03bc4837d76db916bb1b6c5a7a486bf33173b6739421d0b66add41ff2c。
随后为既有五真实进程/100repeat用例增加RSS消费的明确正例断言，再次完整八
文件87/87、exit0、80692.488877ms、零skip/cancel/todo，所有前后身份稳定。
`.bench/op06-resource-collector-focused-v2*`，log SHA
cb8dbec2563a967cee41f82bc095da98ad82f0a2fe842e87f2e8cd034bf471f8。
五份真实采样曲线均被消费为内部一致的RSS记录，cell.memory仍BLOCKED，
不是Settings编辑/新符号的产品P95或独立PSS通过。类型/diff检查通过。
最新工具head whole `op06-resource-current-whole-v1` 已真实终态1663/1663、
exit0/signal null、2561628.898361ms、零skip/cancel/todo。开始/结束UTC为
2026-10-13T00:39:16.561Z / 01:22:14.935Z，日志SHA
6fb03b5d3a925e2987436b99b4d3cc8995328c47f9f614d11166633785bf766c。
1645个repo文件前后digest均
303a7ae3afe6ea097128f546d431adaef677f709e35bbed837a368df9f9a55cc，
production/SDK/stdlib/compiler/sidecar/Node/lock/memory-gates均稳定，生产仍C2。
终态独立audit再次核对真实退出/完整计数、日志、原始源码归档、当前production
和repo身份，为PASS；不是借用C2旧whole1648。该1663代码回归覆盖当前新增工具，
不等于最终产品P95/PSS或下一源码的完整GREEN。
全证据正例、资源原始外部文件绑定/覆盖范围、OOM、生命周期/soak、portability、
DevEco/PSS、历史大峰值与当前统一发布构建仍待完成，OP-06/L08不标DONE。

## 2026-10-13：墙钟回拨与真实单调采样

触发输入是OP-04正常100编辑中真实RSS时间戳倒序；原FAIL和4912行raw保留，
不重排、删行、改写时间或补造旧样本。独立Worker/harness单调时钟支持实际
系统墙钟调整，见[原始比较与诊断](../reports/2026-10-13-op04-warm-overlay-reference-comparison.md)。
本切片只修后续采样与报告消费，不改生产owner/预算/六默认或L08门槛。
父HEAD仍a111235b，生产d6d525cf；这不是C2旧whole1663覆盖的新工具结论。

纵向公开RED→GREEN，前后production/SDK/repo均稳定，原始前缀位于`.bench/`：

| 回路 | 公开失败 | 最小GREEN与原始前缀 |
| --- | --- | --- |
| 真实RSS sampler进程 | 墙钟回拨实际发生，但缺独立单调时间；0/1、exit1 | 每次真实probe开始前记录performance.now；1/1、exit0；`op06-rss-monotonic-sampler-{red,green}-v1` |
| 公开release CLI | 新单调记录已证明递增，但仅因墙钟回拨仍memory FAIL；0/1、exit1 | 明确intervalClock后按单调间隔重算；完整7/7、exit0；`op06-rss-monotonic-consumer-{red,green}-v1` |
| 损坏raw样本 | null记录使CLI崩溃exit2，查询行未消费；6/7、exit1 | 时钟存在检查空值安全，保留20查询行并memory FAIL；7/7、exit0；`op06-rss-null-sample-{red,green}-v1` |

sampler使用真实外部ps/PID/RSS；测试仅在专用child预加载外部Date.now回拨，
不mock compiler、采样值、进程或结果。UTC timestamp原样归档，monotonicMs是
该sampler进程内真实采样开始时间，不能跨进程直接对齐或冒充UTC/连续峰值。
报告标记intervalClock=sampler-monotonic-ms，原始行顺序不改。
旧报告无新字段仍按原墙钟合同严格递增；新记录缺tag、未知tag、字段混用、
倒序/相等/null/string/非有限/不安全单调值或非法UTC均拒绝，20行成功查询仍保留。
完整clock边界文件8/8 GREEN；有效RSS只获内部一致性PASS，memory仍BLOCKED/
RSS_NOT_PSS_RELEASE_EVIDENCE，不授予1024MiB硬RSS上限或PSS/发布资格。

修复后公开collector实际保留回拨墙钟并按采集单调间隔聚合，五个真实compiler
进程100repeat曲线也明确消费为该clock。九文件串行回归97/97、exit0/signal null，
130771.442255ms，零skip/cancel/todo，全部前后身份稳定：
`op06-rss-monotonic-collector-focused-v2*`，log SHA
82e73d8d33e01d77390c6ec4ccc5c9efd28e38d2ee5f8a7a972e72d779cd3898。
v1的96/97 FAIL原样保留：测试误要求collector提供evaluator才有的releaseEligible
字段，真实时钟断言已通过；修正为collector现有ready/latency门禁后重跑完整九文件。

可重放命令为Node20执行`--test --test-concurrency=1`，文件清单见v2-state.json：
query-layer-resource-cli、semantic-release-resource-cli、semantic-release-matrix-cli、
prepared-suite-cli、prepared-suite-interactive-cli、prepared-suite-semantic-readiness、
prepared-suite-diagnostic-worker-pin-cli、product-gate、test-layer-manifest。
sampler/summary/consumer/fixture及新增测试均≤500行；没有新库存entry、Rust或
生产source修改。完整OP-06及L08目标不据本切片关闭。

## 当前d6与新工具完整回归：FAIL保留

本地2026-10-14终态；实际UTC2026-10-13T15:17:59.374Z→16:26:07.493Z。
Node20以原`pnpm check:fast`运行，未改期限或关闭优化；1643/1673、30 FAIL、
exit1/signal null，4068238.406392ms，根统计零skip/cancel/todo。
独立审计重读全部1647个源码/测试/文档归档字节、当前repo/production/SDK与
日志，确认前后身份相同；审计status=FAIL准确反映真实回归，非发布证书。
目录前缀`.bench/op04-op06-current-whole-v1*`，log SHA
2c414fd93680c5fdf04770bfa24f302704228736a101d0c2a31dae665f892bfa，audit SHA
a91abd9da102ac623c061291af3bcb6b49023d75d1119765151cfa9b785aa535。

failure-index逐项保留30个完整失败块与hash：29项原期限超时，1项首次补全
-32803；后者发生在watched测试beforeCreate，尚未发出任何watched变更。
该原用例独立一次1/1 PASS、6名称过滤、exit0，不能叫修复或覆盖whole FAIL。
`op04-op06-watched-first-completion-repro-v1*`，log SHA
9353ddad285cd955535c7e45786752c8b9ec9fe06634e6c95ef1d976feff9958。
只读midflight设备快照CPU speed limit42%、swap7284.5MiB，是单次环境观察，
不证明所有超时的唯一原因。继续固定缩短序列/实际输入归因，不改5s/20s等原
期限、不反复whole直到偶然通过；当前source不得合入，不标OP-06/L08完成。

随后固定前序lsp-session/lsp-transcript/lsp-workspace-file-changes三文件21/21、
exit0/signal null，28332.991634ms，零注解、全部身份稳定；
`op04-op06-first-completion-predecessor-sequence-v1*`，log SHA
d7c11b9021a5f9dc2f6814f9dee7248177d9a659a9d3c2d851f596dc730de6d9。
仍未复现整轮输入拒绝，不宣称已修复或用它覆盖whole FAIL。继续独立输入
窗口归因；有证据输入的OP-05压力/恢复校准可先推进，不互设阶段屏障。

## 2026-10-14：当前构建完整回归证据消费

父修订仍a111235bc4bfcb55b126752f95b3ba095f2996af，生产sourceInput仍
1bc4e318ae484ce80e53463fdfa554d587046c1a328527a7515d420f1bb310a1。
本切片只修改公开验收CLI和Node测试退出诊断，不改生产owner、六默认、预算、
完整scope、SDK兼容决定、原期限或550ms/内存/样本门槛。OP-06/L08仍IN_PROGRESS。

CLI新增可重复`--regression-state FILE`；未提供时保留retainedCapabilityRegression
为NOT_RUN。输入是实际完整`pnpm check:fast`控制器的终态state，同前缀
`.stdout.log`及`-sources.jsonl`必须保留。schema为
`arkts-language-server.retained-regression-state`/1，包含platform、实际command/args、
selectedLayers/entries、before/after构建与SDK身份、beforeRepo/afterRepo、原exit、
完整根counts及两份artifact摘要。通用采集接线尚待收口，不能从旧state臆造终态。

消费者重读原字节并核对摘要、最后完整且确实位于日志末尾的SPEC总计、safe
integer计数、真实exit0和零fail/skip/todo/cancel。当前所有fast-layer入口必须
完整选中；源码归档逐文件核对、重算repo/sourceInput摘要，并与当前执行输入
库存/字节相等。源码过期记BLOCKED，归档遗漏/损坏/矛盾及失败执行记FAIL。
只有同平台产品报告的server/workers/sidecar/compiler/Node/stdlib/lock/gates/SDK
身份全部相同才可使用该回归，不拿旧构建或其它平台补当前缺证据。
每平台单列状态；三平台都具备各自完整PASS才使该独立回归项PASS，仍不使
其它未跑门禁或releaseEligible通过。源码文档注释更新不改写已经封存的原字节。

每一纵向反例先运行`node --test tests/semantic-release-regression-cli.test.mjs`，
记录父修订、命令、实际child exit及原log；以下前缀均在`.bench/`：

| 公共反例 | RED → GREEN后的行为 | 原始前缀 |
| --- | --- | --- |
| 当前构建完整回归输入 | 原CLI拒绝参数；新增单平台精确消费，不冒充其它平台 | `op06-retained-regression-binding-{red,green}-v1` |
| 前面PASS总计、日志末尾失败 | 不借早期总计，明确FAIL | `op06-regression-summary-tail-{red,green}-v1` |
| 自洽归档遗漏runtime reporter | 精确执行输入库存核对，FAIL | `op06-regression-archive-coverage-{red,green}-v1` |
| Windows原生命令路径 | 按报告平台解析，三平台各自原构建消费 | `op06-regression-platform-paths-{red,green}-v1` |
| 字符串true替代稳定证明 | 严格布尔与前后字节/身份，不接受truthy标签 | `op06-regression-stability-proof-{red,green}-v1` |
| 两边重复同一个无效artifact hash | 摘要格式不是标签匹配，FAIL | `op06-regression-digest-syntax-{red,green}-v1` |
| 超出safe integer的原计数 | 明确计数非法，不充当全覆盖 | `op06-regression-count-bounds-{red,green}-v1` |
| 重复同一回归artifact | 不重复增加证据，CLI exit2且不写报告 | `op06-regression-duplicate-artifact-{red,green}-v1` |

合成正例/日志/receipt只验证消费者，不是实际产品执行或跨平台通过。完整边界
文件9/9含非零/信号退出、RUNNING、部分入口、前后漂移、丢失/损坏log、计数
矛盾、原总计缺失、旧构建和当前源码过期控制，成功查询行独立保留。
缺总计保持counts=null、原exit原样；不补零或删除失败以使发布通过。
Windows/三平台正例仅为原生路径与绑定解析，不冒充实际Windows/Linux验收。

测试库存193→194、unit-contract91→92，精确库存原RED保留；新source/test/helper
为267/145/264行，退出诊断脚本/新test为242/82行，均≤500；旧1606行表征迁移债
本切片未增。`pnpm check`、Node syntax及diff检查通过。

九文件默认sandbox运行103/119、16权限FAIL原样保留：log SHA
0dfdd490940f7620880e5b0734f7a704fea80250a5e038184a3d90b5ae589ce3，
terminal-audit SHA60a5d1058a11b1dbd06b0ca02dd2295bfe3c3e20065ccdc46aa2873172db22a2。
随后相同源码在允许原生ps环境完整119/119、exit0/signal null，零注解；
UTC13:51:29.057Z→13:57:09.528Z，330522.804278ms。
`.bench/op06-regression-and-diagnostics-native-related-v1*`，log SHA
e7ae113915a541a50a569d0da12106ba68125f261099d2514e2183d96c5e018d，audit SHA
313dc8c476da34eb8f9c3fc3788efc825aba53f94c8d562291cab4278878cc4d。
1673文件源码archive SHAb3691d109f2033bb14f794d01b8f5cc2236c59aa916add98fa8ba2bc11d91ba6，
全部source/SDK/产物前后一致、实际Node退出独立核对。真实MAC流程的完整payload、
最新诊断、压力、原30秒超时、RSS/metrics损坏和生命周期保护都保留。

本相关GREEN不是新完整whole或最终矩阵。原无总计整轮与磁盘风险/诊断修复见
[OP-05检查点](op05-recovery-cost-calibration.md#后续整轮无根总计与退出诊断)。
下一步冻结当前源码执行完整check:fast，实际控制器保留带平台/选择的上述state，
再补真实产品构建绑定消费；资源外部raw、OOM/≥100循环、生命周期、portability、
DevEco/PSS及全证据releaseEligible=true正例/原336格矩阵仍待完成，不能合入或标DONE。

## 后续whole与采样完成区间检查点

上述工具head新完整whole为1711/1712、1资源资格FAIL、exit1，零注解，前后全部
身份稳定，log SHA8b9f6ae4b227d7c5e582c24d50cdeb23531bedc8b18aea3334f328d7761238ec，
audit SHAcaefc4e04a14346a12e10ed8a69e78bbb0e579c668104d171733f95efe0145c0。
原缺根总计批次不覆盖；本轮完整typed state可供失败证据消费，不可变成PASS。

该FAIL暴露原开始时间不能证明异步OS快照属于查询窗；实际旧额外子进程命令
未保留、原唯一原因NOT_PROVEN。固定一次原case PASS不能证明修复；两个真实
OS跨窗口反例RED→sampler增加真实完成时间GREEN，原raw/peak/tail全保留。
原窗内至少一条/不能含builder子进程的保护保留，只要求完整读取落于窗口。
结束字段配对/mono时长消费另立RED→GREEN，完整10/10；回拨墙钟不补造、不排序。
详见[OP-00真实反例与原记录](op00-query-layer-attribution.md#2026-10-14异步os采样的完整读取区间)。
七文件63/63、exit0/零注解、身份稳定，audit SHA
7b3caf5fe7245973c14b7921906087b0a5c4ae7421a46352c95add40964f8724。
新库存195/unit93；production/六默认/1024MiB/原期限不变，修复后freshwhole仍待跑。
RSS内部一致性不是独立PSS/物理释放或发布；原外部raw绑定、通用回归采集、
生命周期/≥100循环/portability/DevEco-PSS与完整release正例/336格均继续，OP-06/L08仍未完。

## 2026-10-15：完整回归公开采集接线

[新公开采集TDD](op06-retained-regression-collector.md)已补齐原通用采集缺口：
run-retained-regression固定原check:fast、归档原log/source/实际退出及输入前后身份。
非零/信号/ENOENT、缺根总计/0执行、SDK/源码/启动器漂移和原log失效都保持
真实终态FAIL，不覆盖旧artifact。八个公共RED→GREEN与原失败记录保留。
真实collector→消费者互操作另发现原production指纹算法不一致，修复向既有
路径/NUL/长度/NUL/bytes对齐、完整检查不删；原合成PASS不能证明该接线。
新库存196/unit94；九文件完整相关100/100、零注解、身份稳定，audit SHA
4d7a73e56602981677bf05ab9998f5dfa0432527fbd3242e8153b979e1a760c3。
fake-pnpm/query-proof均只验证工具；下一步真正新whole与产品绑定，完整资源/
生命周期/平台/DevEco-PSS/100循环/最终336格保持原合同，不能授予release或阶段DONE。

## 2026-10-15：生产冷成本切片后的回归资格

[OP-02目录存在性切片](op02-request-directory-presence.md)已按真实冷profile/
公开RED→GREEN推进生产代码，不再只补工具guard。59/59与原五失败文件24/24
分别通过；固定正常冷ABBA有限标签收益保留，均不是完整whole或L08验收。
production2303c3e7/三个Worker已变，旧1bc4e318构建的整轮1718/1727、9FAIL
不覆盖，也不能授予新构建GREEN。下一步一次冻结新whole，通过公开collector
保留实际终态；原资源/生命周期/平台/PSS/完整正例/336格目标继续，未合入/push。

## 2026-10-16：实际多进程restart两入口与逐段证据

父修订`a111235bc4bfcb55b126752f95b3ba095f2996af`，生产input
`a6ae3b97fe584d1299d2c5f5c28473f93d34eeb7dd59535bd00905f32b5f605d`未改。
原生产Content-Length stdio根准备已READY，但prepared工具把restart直接记为
LIFECYCLE_CONTROL_UNAVAILABLE。原公开RED确有0请求／1 FAIL，不是准备失败。
每组均先保存失败命令／父修订／完整源码／日志／真实退出，再最小实现；原FAIL保留。

| 公开反例 | RED前缀（均在`.bench/`） | 保护后的行为 |
| --- | --- | --- |
| 实际restart无法测量 | `op06-real-restart-public-red-v1` | 旧服务正常退出／PID消失，新PID先UNPREPARED，重新准备后测目标 |
| 跨进程借用重复快照历史 | `op06-restart-history-public-red-v1` | 真实process边界清查询历史，当前编辑oracle继续保留 |
| 同一新进程重复冒充首查 | `op06-restart-unseen-public-red-v1` | 连续restart组共用新进程，相同能力／symbol不重复计首查 |
| 汇总只认最后一个进程 | `op06-restart-consumer-public-red-v1` | canonical SHA／长度／身份、逐请求generation与资源逐段重读 |
| 删去任一进程原始RSS绑定 | `op06-restart-raw-binding-public-red-v1` | 资源FAIL，独立正确查询与分母不删；RSS不当PSS |
| 最终服务真实非零退出 | `op06-restart-final-exit-public-red-v1` | 精确查询保留，但本次restart失败；不只检查前驱 |
| 外部Git后置校验真实退出42 | `op06-restart-postflight-public-red-v1` | 3已完成请求／2进程资源与1未执行尾项保留，planned4／executed3仍FAIL |
| 精确库存未更新 | `op06-restart-test-inventory-public-red-v1` | 总214、fast207，新真实生产用例归bundle-e2e，不排除旧入口 |

入口为Node20.19.5 `--test --test-concurrency=1 --test-reporter=spec`；前七组通过
真实生产CLI→LSP，第八组是库存公共接口。selected RED的name-unselected单列，
不是完整文件；具体命令／原始SHA／counts均在下述独立audit中。

### 机制及已验证范围

[真实重启文件](../../tests/prepared-suite-restart-cli.test.mjs)9/9：已打开调用方Use→
未打开Query目标、查询源Use从未didOpen两入口，新进程先公开只读UNPREPARED，
按当前客户端文本／原版本重放，再公开prepare取得新generation，不预查询目标。
LS／AST／READY标签／旧completion或call item不跨进程传递。连续restart场景属于
一个新进程；分开的restart组实际再启动进程，缓存历史不跨真实边界借用。
混合5请求／3进程中，目标文件未保存编辑使definition从第0行移至第1行，两次
重启后仍精确为第1行、目标overlay版本2，磁盘仍为原文。新进程首查的
priorCompleteSnapshot=false，仅本进程显式repeat为true。
原candidate-control下unsupported restart／eviction负例保留，不将无见证场景升格。

[逐段消费者](../../scripts/bench/prepared-release-segments.mjs)每次输入只重读各canonical
报告一次，核对摘要／长度／workspace／SDK／build／flags、PID／独立generation、
初始／最终／handoff证明与请求归属。RSS绑定各自PID，不拼成同进程／连续峰值。
错segment、重复PID、借证明、缺报告、坏摘要／raw及同一真实请求以root＋canonical
重复提交均拒绝；请求分母保留。postflight失败先保存本段完整报告，再停后续组；
正常非restart后置异常合同未改。真实退出17／外部校验42只在私有测试边界注入，
不是修改生产LSP响应或正常计时策略。

### 完整相关与独立原生证据

`.bench/op06-real-restart-related-v1*`：19完整文件171/171、exit0／signal null、
零skip/cancel/todo，224972.646174ms。覆盖全部prepared CLI／诊断／L3／recycle／
READY及矩阵／资源／PSS／回归消费与库存，不是完整whole。
原log SHA `31aafb5660e23374c8c49ea7513456dd0c4bd0e59f28686b951bced4d7bc27f2`；
冻结1739源码SHA `f26cb29625e6e44fa9a7352c332978c5b1e48f0366185a72abe75d99fcd0c2ae`。
8组原RED＋11份逐项／完整GREEN收据全部保留，不将工具测试当最终产品验收。

`.bench/op06-real-restart-native-evidence-v1/state.json`另有两入口各一次真实公开CLI，
共4个服务OS进程exit0且PID已消失；初始UNPREPARED／READY／handoff、新generation、
精确结果、canonical与raw SHA／长度／全部采样均独立重读。state SHA
`2af26bdf7ddc5a9758112405346e77853d6bcc4cfa582e67f2e2be8ca1707d2a`。
这是私有API24完整profile SDK fixture，不是安装完整SDK／真实工程性能；PID退出
不等于已观察native LS dispose、Registry清零或物理释放。原CLI/report仍FAIL，
正式消费者两份仍BLOCKED，正确性／READY PASS不放行小N时延／RSS内存门禁。

Node20 `pnpm check`、12个变更源码／脚本／测试syntax及diff检查exit0，receipt SHA
`79d8ae68183eefbf658cae87aad50c8b8ea57d3f045741534f4e3fb25898bec7`。
本切片12个源码／脚本／测试均≤500行（主runner493），未增长既有超限源码债。
独立audit重读原日志／封存字节／当前SDK与构建／PID退出／raw与消费：
`.bench/op06-real-restart-evidence-audit-v1.json`，SHA
`0b95855d209819f7216688dbf245936a88ee4dbca7e8b44134a78debe9b596cf`，完整性PASS。

### 剩余验收不缩小

只收口definition/typeDefinition实际restart机制及上述异常留存切片。14能力restart、
completion resolve／call follow-up实际新会话来源／旧句柄拒绝、配置／取消／压力、
安装SDK／真实工程资格仍需继续，不据本测试推断全部支持。全证据releaseEligible=true
正例、原336格／每格≥100请求／≥5会话、P95≤550ms（目标500）、≥100交替循环、
正常压力／CPU／GC／Registry／物理释放、DevEco/PSS／历史峰值及三平台均保留。
OP06/L08 IN_PROGRESS；生产／ADR0015六默认／1024MiB／batch64／ADR0003不变。
旧whole1837/1839 FAIL与原403的20s失败不覆盖；一次有限未复现不是修复，见
[OP00](op00-query-layer-attribution.md)。新工具head whole NOT_RUN，合入须fresh whole＋
分支PR；最终门禁不反向阻塞前序切片，未合入／push。

## 2026-10-16后续：补全／调用层级重启来源资格

父修订仍a111235b、生产input仍a6ae3b97；仅验收工具／测试改变，不是新的LS优化。
[新真实生产文件](../../tests/prepared-suite-restart-followup-cli.test.mjs)5/5覆盖两入口：
完整completion／resolve、新进程拒绝真实旧UUID并可解析新UUID、缺当前completion／
prepare时不隐式补查或借旧进程结果、跨进程来源替换拒绝，以及完整prepare／
outgoing／incoming。预期由[声明与源码范围](../../tests/support/prepared-followup-fixture.mjs)
构造，不以待测回答生成oracle，不只比较项目数或部分字段。

补全UUID是会话内opaque引用，真实重启后旧项返回-32602；两种入口均验证。
调用item则是protocol1的root／位置路由，现有server按当前源与最终fence核验，
不是会话UUID；本切片不新增其opaque状态或协议限制。采集器必须在当前进程
重新测量prepare，且从该次完整正确结果选item；不复用上一进程的Map／AST／证明。

### 两个公开来源反例与最小修复

`.bench/op06-restart-followup-source-receipt-public-red-v1*`：真实完整结果均正确，
但报告只记声明target，未记实际来源请求。RED为undefined不等于new-list。
最小增加sourceScenarioId，来自实际validated completion／prepare的缓存记录；
无新RPC、编译器对象、优化开关或运行期答案缓存。GREEN两入口完整比较通过。

`.bench/op06-restart-followup-source-consumer-public-red-v1*`：有意只把resolve来源
改为旧进程真实before-list，并重算canonical SHA／长度，原消费者仍错误给ready PASS。
消费者现重新检查来源必须在本canonical进程内更早、目标／kind相符、同snapshot／
版本、完整payload与oracle相等且READY可独立复核；否则BLOCKED、请求分母不删。
合法新来源仍ready／correctness PASS。prepare／call跟随同一依赖合同，不改LSP协议。
第三个库存RED保留：原214与实际215不符；新入口纳bundle-e2e，总215／fast208。

另保留`.bench/op06-restart-completion-source-qualification-v1*`夹具资格失败：
初始oracle臆造普通member未提供的可选filterText，导致完整比较失败、resolve未发。
核对锁定compiler字段直传合同后只修预期，v2两入口通过；不是生产缺陷／修复，
不将这个失败计入上述公开行为反例，也不重标原记录。

### 完整相关与独立原生记录

`.bench/op06-restart-followup-related-v1*`：20完整文件176/176、exit0／signal null，
零skip/cancel/todo，255604.12723ms；含此前19文件的全部保护和新真实follow-up文件。
原log SHA `e638357397e760f615d335afbbff20f9c382e3b4830fa4fa49868735dbafd407`；
冻结1741源码SHA `1861747452e8df26edcc3f6ccfc3393ee14ca3cb9fece8a392cf38249cd64dc7`。
Node20 pnpm check、6个变更源syntax及diff共8命令exit0，static receipt SHA
`9773d67abdd17e98d4fbde8e3ef7b2498431cbd3d1bbed23c75dcaf5f390c90e`。
本切片六个源码／脚本／测试均≤500行，主runner497；未增长既有超限源码债。

`.bench/op06-restart-followup-native-evidence-v1/state.json`四个独立原生案例：
completion-opened／never-opened各2请求，call-opened／never-opened各4请求，合计
12完整精确响应、8服务PID正常退出且已消失；每请求READY、来源先后／本进程归属、
逐段canonical及raw SHA／长度／全部采样独立重读。原输入／SDK／oracle／私有Git
副本留存，复制后pins逐项相等，不依赖已清理临时夹具。state SHA
`5e58eb33883e333fb9c754764b1c6e9e014aca642dc4656d88ebacf7c0915377`。
原CLI/report仍FAIL，四个正式消费仍BLOCKED；私有API24 fixture不当安装SDK／
真实工程性能，也不把RSS／服务PID退出当PSS／LS dispose／Registry或物理释放。

独立审计10份原始收据／日志／全部封存源码、当前SDK／构建、输入副本、四个
原生案例／raw与消费结果，完整性PASS：
`.bench/op06-restart-followup-evidence-audit-v1.json`，SHA
`6d359df322546edfad5efc573c60d2d52d822a6618ce1c952b7ea303c48b2383`。
3个公共RED及1个夹具资格FAIL均保留，不称whole GREEN或最终矩阵完成。

本切片只关闭上述来源／实际UUID与完整follow-up局部资格；其它restart能力、
配置／取消／压力与复杂真实工程仍待。冷Program／closure、OP04独立磁盘增量与
未知输入、实际客户端／正常资源／100循环、完整releaseEligible=true路径及原
336格／每格100请求／5会话／P95≤550ms（目标500）／PSS／三平台继续。
原403失败不因一次有限未复现消失，128仍不采纳，不再重采闭合语料寻优。
生产／六默认／预算／ADR0003不变，新工具head whole NOT_RUN；合入须fresh whole＋
分支PR，OP06/L08仍IN_PROGRESS、未合入／push，不以最终门禁冻结前序工作。
