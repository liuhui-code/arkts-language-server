# OP-06：产品内存对照与原始 PSS 记录消费

日期：2026-10-15（运行 UTC2026-10-14）。状态：本工具切片相关 GREEN；OP-06 / L08 IN_PROGRESS。
父修订 `a111235bc4bfcb55b126752f95b3ba095f2996af`，分支 `codex/op00-query-attribution`。
落实[后续计划](../plans/2026-10-11-query-performance-follow-up-plan.md#op-06-最终验收工具与-l08-完成审计)的原产品内存证据消费，不是产品门禁或完整正例完成。

## 公开入口与原合同

```sh
node scripts/bench/assert-semantic-release.mjs \
  --matrix config/semantic-release-matrix.json \
  --prepared-report CURRENT-QUERY-REPORT.json \
  --memory-comparison COMPARISON.json --out NEW-RELEASE-REPORT.json
```

`--memory-comparison` 可重复。容器 schema 为
`arkts-language-server.product-memory-comparison` / 1，包含 platform、buildIdentity、
flags，以及 server/deveco 两份原协议报告的 `{ file, sha256, byteLength }` 引用。
文件是容器同目录 basename；summary 各限1 MiB，不允许绝对、跨目录、Windows
drive-relative 路径，重读全部 UTF-8 字节/长度/hash/JSON，不靠标签判成功。
缺文件或矛盾保留已验证 query 行并明确 FAIL；缺失容器字节的 SHA 保持 null。

在原三个公开合同表征 GREEN 下提取 `product-memory-gates.mjs`，原
`assert-release-gates.mjs` CLI 参数、输出、严格键集合及全部数值校验不变。
DevEco steady/peak 比0.75/0.85、100k/10k比1.25、eviction/warm比1.20、
warm P95/baseline比1.25、零 contract failure，以及 cold3/warm10/stress5、
comparisonIdentity 全等都继续执行。提取前后3 PASS/30名称过滤，原日志保留，
不称为 product-gate 全文件通过。

L08 会保存原数值判定，但不能只因它 PASS 就授予 PSS。非Linux、缺少Linux
query build、归因运行、SDK字节不符、构建/配置不同或未选定预算/策略均拒绝或
明确BLOCKED。绑定与完整回归使用相同的15个构建/SDK字段，不把旧汇总重盖当前
身份。比较实际 flags；两边都加大预算或关闭六项默认也不能充作选定策略。
正常1024/indexed-batched/closure/full SDK与六项默认没有改变。

## 原始记录消费的资格边界

可选 `rawEvidence` 引用同目录 JSON 原文件（每文件≤64 MiB，超限拒绝而不截断）。
schema 是 `arkts-language-server.product-pss-observations` / 1，measurementKind
为 `linux-smaps-rollup`，platform为linux，samples保留全部实际记录。
每个记录有 product/metric、wall/monotonic 读取开始及完成时间、totalPssBytes、
processes；每PID保留 role、startIdentity、rssBytes/pssBytes 与原 procStatus/
smapsRollup 文本。按已有 `process-memory.sh` 的一次 VmRSS/Pss kB 行规则重算
字节，拒绝重复字段、错误/不安全数值、重复PID、身份矛盾、缺必需角色、排除
角色、错误树总量和缺失/倒置monotonic读取时序。Node线程不作为额外PID相加。
角色来自原 product-benchmark-workflow：Zed/server/sidecar 与 DevEco/analysis。
wall clock 原样保存，不用它替代同一采样器的 monotonic duration。

内部 `rawObservation.status=PASS` 只说明给定记录可复核；它不认证实际来源、
完整采样窗口/统计配方或产品运行范围。返回原记录、metricSamples、artifact，
`summaryBinding` / `productCoverage` 仍 NOT_VERIFIED；整体 comparison BLOCKED，
`PRODUCT_MEMORY_RAW_SCOPE_NOT_VERIFIED`。没有原记录时明确 RAW_NOT_PROVIDED。
目前没有实际Linux/DevEco测量，更没有独立PSS、物理峰值或发布正例。

## 公开 TDD 与保留的中间结果

每项公开 CLI RED后最小 GREEN，前后source/SDK和原根退出归档；测试用合成
summary、query proof和proc文本，只资格工具，不宣称真实Linux记录或产品内存。

| 反例 | `.bench/` 原始证据前缀 |
| --- | --- |
| L08不接受原产品对照入口 | `op06-product-memory-summary-consumption-{red,green}-v1` |
| SDK不同的数值PASS对照被忽略 | `op06-product-memory-sdk-binding-{red,green}-v1` |
| 另一构建被当作当前数据 | `op06-product-memory-build-binding-{red,green}-v1` |
| 单边改变预算/flags未明确拒绝 | `op06-product-memory-configuration-binding-{red,green}-v1` |
| 容器缺失抛异常、丢query报告 | `op06-product-memory-missing-comparison-{red,green}-v1` |
| 给定PSS记录未被消费 | `op06-product-memory-native-records-red-v2`、`green-v1` |
| 非Linux仍无准确资格原因 | `op06-product-memory-platform-qualification-{red,green}-v1` |
| trace数据仍被当普通数据 | `op06-product-memory-attribution-qualification-{red,green}-v1` |
| 缺Linux query却空集合匹配 | `op06-product-memory-missing-query-build-{red,green}-v1` |
| 两边都改预算/默认却匹配 | `op06-product-memory-policy-qualification-{red,green}-v1` |
| 新入口未登记 | `op06-product-memory-inventory-{red,green}-v1` |

native-record REDv1 fixture 的summary字节/KiB及跨产品PID标识错误保留；在未改
生产实现时先纠正fixture得到REDv2，再最小实现。已有6/6 GREEN保护下提取
共享raw fixture；15类kernel/进程/clock损坏、9类原gate拒绝、7类文件/路径
边界都有完整CLI表征。最终本文件13/13、零注解，不把loop子控制数当根测试数。

## 联合验收与下一步

七文件联合75/75、真实exit0/signal null、零skip/cancel/todo，50342.351981ms，
UTC18:38:00.745→18:38:59.366。原矩阵、RSS/原始文件、完整回归receipt/producer与
库存均通过；真实PID90229退出，source/SDK/产物不变。
`.bench/op06-product-memory-comparison-focused-v1*`，log SHA
`f5253f158d2cec866b5fa1eb3b652ddc537f24b25a5b2470da8b60e6a1e636d4`，
独立audit SHA `443fb2ab083e52bf5d4a4f874942b1647f1ca2b5cbf8cf9e4232ec2ce4568aaf`。
1687文件 source archive SHA `490fa36ef0a29d82f1c840a164942c6c7d4b63ec58aad7a14a9a610233a401c7`，
repo SHA `27bab800a1f6c35c9804eb01d0eb50ef38e52abfa517d78c01468bbb15df8387`。
库存199/unit97/fast192；所改script/test49–371行，均≤500。Node20 pnpm check、
syntax/diff通过。生产input1bc4e318/servere832f9b6保持，没有Rust/owner/预算修改。

继续原记录统计配方/采样覆盖与真实产品运行绑定、OOM、nativeLS/Registry/
物理释放及≥100交替循环、portability/真实客户端、独立DevEco/PSS与历史>3GB/
≥50%下降，以及全部证据正例releaseEligible=true和336格。判定器仍不授予发布。
原whole1718/1727、9FAIL及有限24/24未复现都保留，没有新whole GREEN或合入。
本机SDK实际api声明仍没有必要DataShareResultSet；不伪造输入/吞诊断，API24
兼容决定保持。OP-00–05独立合同/采纳审计也继续，不以最终550ms/PSS阻塞。

## 2026-10-15：声明峰值的必要下界保护

父修订仍a111235bc4bfcb55b126752f95b3ba095f2996af，生产input5cf9d618。
前一冻结整轮1757/1757已经独立审计；本节后续工具变更不能借它授予新工具head
完整GREEN。只补原计划中“汇总与原始记录不能矛盾”的必要条件，不改变schema、
阈值、workflow、预算／六默认、源／SDK或把原始记录内部PASS升级成产品PASS。

公开CLI反例：原数字gate仍PASS，原proc记录亦内部一致，但server或DevEco
所声明的peakPssBytes比同产品的原始peakPssBytes观测低1字节。原工具仅BLOCKED，
没有明确指出矛盾。命令：Node20 `--test --test-reporter=spec`
`tests/semantic-release-product-memory-cli.test.mjs`。
RED13/14、exit1，log SHA
`809670d7914fb9bb28b37fb7b07d653b7c9de343e983050fe247da8161182f96`，
audit SHA `634c42b7d2f5e51cf36266440693302e636a837dfcf816e5c94124bd51143ef0`。

最小6行实现逐个产品检查全部同名峰值观测；任何记录高于汇总明确FAIL，
`PRODUCT_MEMORY_RAW_PEAK_EXCEEDS_SUMMARY`，完整rawObservation与query行保留。
不把其它统计指标的窗口猜成峰值窗口；缺峰值或高于已观测值的汇总仍按原
范围不足规则BLOCKED，不认证采样覆盖或真实peak。所有原原文／单位／角色／
时钟、文件digest、构建／SDK／flags及原比例拒绝保持。

GREEN14/14；再补后续更高峰值和未覆盖更高汇总两控制。八文件联合82/82、
exit0、零skip/cancel/todo，51219.558598ms，前后源／SDK／构建相同且实际PID
退出。前缀`.bench/op06-pss-peak-summary-{red,green,related}-v1*`，相关log SHA
`25c48363c4db9af32b6dfe06545a4e9e1e89c0f7153e4dfb059523a7fb8970e1`，
audit SHA `26c7eebc13c8082975a8e01d7f20e8d18ff52d01498132bf82863863a6a69d88`。
script119／test393行，Node syntax／pnpm check／diff通过，库存203/fast196不变。

这些proc文本、汇总及query为合成fixture，只资格判定器，不称本机Linux／
DevEco实测。summaryBinding／productCoverage仍NOT_VERIFIED，releaseEligible=false。
继续原统计配方、真实workflow／scope／采样覆盖、生命周期／平台／soak／历史
峰值和全证据正例／336格；完成相关工具批次后再冻结fresh whole，不逐小改反复
重跑旧50分钟流程碰通过。前一1757GREEN与全部旧FAIL保留其原始源身份。

## 2026-10-15：八项固定统计配方绑定

父修订a111235bc4bfcb55b126752f95b3ba095f2996af，production input5cf9d618不变。
原records schema1可显式提供statistics/schema1/product-pss-summary-v1；配方和
资格边界见[原协议新增统计节](../benchmarks/product-gate.md#6-bind-raw-pss-summary-arithmetic)。
server四项中位数、peak最大值、initialWarm首样本，DevEco中位数／最大值。
本版本绑定全部八项算术，不证明窗口、工作流／拓扑、真实来源或采样覆盖。
未知／扩展配方和矛盾FAIL，缺指标NOT_VERIFIED／BLOCKED；旧记录不补配方。

公开CLI原16用例中的新反例15/16、exit1，明示完整配方却仍NOT_VERIFIED。
`.bench/op06-pss-statistics-red-v1*`，log SHA
`23a4d25cc5da5c295ab6a98f06b0365fa0d6962a68ebd26991771c5d0a26c39b`，
audit SHA `c24e23540385458022df3fde898732e0b1215b56f320fc4937a8e26b23eca62b`。
39行固定计算模块最小GREEN16/16，原峰值矛盾理由保留；相等时summaryBinding
PASS而productCoverage仍NOT_VERIFIED，comparison继续BLOCKED。

在实际16/16表征GREEN下提取98行共享合成fixture；提取后16/16，log SHA
`4e396c119b312322c24718ffbdcb2c5cdeab604c77d1cdb2dcd1f1e458df8d36`。
新132行公开CLI控制分别保护中位数≠均值、偶数中位数、maximum／first、
八项分别矛盾／缺失、未知／扩展配方和不安全中间算术。保持原kernel／文件／
角色／时钟／build／SDK／flags与数字gate拒绝，成功query行不丢失。

库存未登记RED9/10后登记；首联合88/89为遗漏第二处unit精确计数97→98，
原失败log／audit保留，不当统计失败或GREEN。补正后九文件89/89、exit0，
零skip/cancel/todo，55968.674078ms，前后全部源／SDK／产物身份稳定且PID退出。
`.bench/op06-pss-statistics-related-v2*`，log SHA
`1842aba38e9ad054b2a5a01c8edaa62b61143936cf0f0b5bfc1dbd0ab681dabe`，
audit SHA `7eb74a5b5be18fba9ee27c8bb8da84c57f2403eb32980c6b7ec747f751697dcf`。
库存204／unit98／fast197，所有所改源码／测试／脚本≤500；pnpm check／syntax／diff通过。

全部数据为合成proc／summary／query，只有工具资格，没有本机Linux或DevEco实测。
生产、六默认和原门槛不变；旧1757整轮不覆盖新工具head，fresh whole待工具批次
完成后运行。继续真实工作流、拓扑／run／PID／窗口、采样覆盖与原范围、native
生命周期／平台／soak／历史峰值和全部正例／336格；OP-06／L08仍IN_PROGRESS。

## 2026-10-15：原拓扑／run／读取区间与PID声明绑定

原七种拓扑、两产品和每拓扑cold3／warm10／stress5，共252槽位不缩减。
原workflow字节hash、comparisonIdentity及全部七份真实引用文件字节／digest重读；
数字计数／seed／入口和生成根必须与原generator相符。唯一run ID与产品／拓扑／
kind／index绑定；原始sample.runId、PID／role／startIdentity和完整读取区间对应。
允许真实分析进程cohort改变，声明为已观测身份的union；每个声明身份必须被观测。
这是给定数据的声明绑定，不证明真实工作流执行、完整树或采样覆盖。

公开CLI RED16/17，无workflowBinding；最小GREEN17/17。原始前缀
`.bench/op06-pss-workflow-binding-{red,green}-v1*`，RED log SHA
`c87b8f6eeec9f041f2c0d2d3f04fffd8c916acb003eac74390012fc8bb88c798`，
audit SHA `eeb6b9f50769790bc16d84a2b44daa073c421564b2713510aeec68548391cc88`。
补充rehashed manifest真实类型反例17/18：字符串文件数被错误当相同拓扑；
一行数字类型检查GREEN18/18，log SHA
`4a2379afee65e1f0007fe1ebdfe4523d7c10cc86f0e861669030ab1ec5fadf62`。
原失败不改写，不放宽完整槽位或元数据类型。

新公开控制覆盖七个分别缺失的拓扑、42个product/topology/kind边界槽位、
未观测owner、19类identity／槽位／PID／role／区间矛盾、动态cohort及原manifest
丢失／字节变更。库存未登记RED9/10保留；登记后十文件97/97、exit0，零注解，
69205.300412ms，全部前后源／SDK／产物一致且实际测试PID退出。
`.bench/op06-pss-workflow-binding-related-v1*`，log SHA
`315a3f12b9a9ba4b8850b23664db79b37e22b57fcab879315593a4c88c9710cc`，
audit SHA `8b6236b1fd6ec45e5a3cbf3185723253e6be0dcca8d9b98a3aeacb770b9364b1`。
计算module99／consumer136／新测试133／fixture71行，原测试360；均≤500。
库存205／unit99／fast198；pnpm check／syntax／diff通过，没有Rust或生产改动。

workflowBinding PASS只是DECLARED_MANIFEST_RUN_WINDOW_OWNER_BINDING_ONLY；
execution／samplingCoverage／productCoverage仍NOT_VERIFIED，comparison仍BLOCKED。
样本／manifest／query为合成fixture，不称本机Linux或DevEco实测。生产5cf9d618、
六默认、原阈值不变；旧1757不盖新工具head，fresh whole待相关工具批次完成。
继续真实动作／完整payload／缓存连续性／ready、采样空洞与峰值覆盖／OOM、native
生命周期／平台／soak／历史峰值及全证据正例和336格，OP-06／L08不标DONE。

## 2026-10-15：采样窗口／实际空洞及原始错误绑定

不新增“实际必须等于请求50ms”的假门禁或任意连续峰值空洞阈值。显式sampling
schema1声明请求间隔、原始error和全部run的采样摘要；重算首／尾时刻、边界
空洞、最长完整读取区间、实际start-to-start间隔P50/P95/max。原workflow先绑定。
至少两点且两端各在一个已声明请求间隔内，只资格window-span；内部超请求
空洞如实列出，不认证连续峰值。缺记录／单点／截短保持BLOCKED，矛盾FAIL。

公开CLI RED18/19：没有samplingBinding；最小49行计算模块GREEN19/19。
`.bench/op06-pss-sampling-binding-{red,green}-v1*`，RED log SHA
`87d77ba5c49a05fbf9bc8ccd5b36d2c5b15dc035bb5d178a9bdcfc651ac7d8b2`，
audit SHA `8324e7bbd270c549a794c03aef16e56b9f13ec409b347d9f82fae25df6e0f512`。
错误留存另有公开RED5/6，原采样code3/message在报告中缺失；最小保留原error
对象后仍FAIL，不补造成功观测。原RED log SHA
`5ca1a2a73be02afb1d6e64f84f5df116bcf9759d4550a56b31913677a7aaba10`，
audit SHA `fd28f2ed40b2ae8196ffd2ada2da0d30fe1b88cfecb0efc33d5ecbd8be44ec9d`。

126行公开CLI控制覆盖单点／首尾截短、42个product/topology/kind摘要缺失、
9种数值摘要矛盾、原始error／坏版本／间隔／重复或外国run、80ms实测间隔
不能被写成50ms、没有workflow不能附会cadence。库存未登记RED9/10保留；
登记后十一文件104/104、exit0、零注解，75547.528397ms，全部源／SDK／产物
前后稳定且实际测试PID退出。前缀`.bench/op06-pss-sampling-binding-related-v1*`，
log SHA `acc985b9306922cfb2cec198775aac6e41c5261420c12102cf1fa39c9a019746`，
audit SHA `a9a9553b5065c9770eb17ae82e1f07bb3dfb32e0787d079037d209e6817d15f3`。
计算49／consumer145／fixture43／新测试126行；原测试380，均≤500。
库存206／unit100／fast199；pnpm check／syntax／diff通过，没有生产或Rust修改。

samplingBinding PASS仅DECLARED_RUN_WINDOW_GAP_ACCOUNTING_ONLY，连续峰值和
productCoverage仍NOT_VERIFIED，comparison仍BLOCKED。全部proc／query／采样器
错误为合成fixture，仅工具资格。生产5cf9d618、六默认和原门槛不变；旧1757
不覆盖新工具head，fresh whole待相关批次完成。继续真实动作／完整结果／缓存／
ready、原生采样方法／树／峰值／OOM、生命周期／平台／soak／历史峰值和全证据
正例／336格，不把此必要条件当L08完成或前序550ms门禁。
