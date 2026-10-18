# OP-00 查询分层归因 RED GREEN 记录

日期：2026-10-11。父修订：`a111235bc4bfcb55b126752f95b3ba095f2996af`。
分支：`codex/op00-query-attribution`；保留此前计划与报告归档改动。
目标：[OP-00](../plans/2026-10-11-query-performance-follow-up-plan.md) 的当前构建
分层测量，不以工具 GREEN 代替全部分层实验或 L08 毕业。

2026-10-18最新：[403冷引用超时专项定位](#2026-10-18-403冷引用超时专项定位)已完成
原样复现、阶段账本、实际线程CPU与SDK负对照。已确认七批重复冷Program／SDK
解析为主导成本，带声明另加一次definitions0的锚点Program；完整失败请求实际
线程CPU19.29s、原20s拒绝后20.39s精确返回。定位完成不等于修复：生产ac4c136b、
原测试／期限／82产物未改，whole仍1864/1865 FAIL，无新默认或性能采纳。

2026-10-17检查点：[默认 transient 统计候选](op00-transient-statistics.md)已REJECTED／
逐字回退。公开统计访问4→0、四新用例及受控11完整文件39/39通过，但固定完整
SDK旧／新／新／旧8会话32引用／8 READY／12诊断一致后，时延没有一致净收益，
正序磁盘两项慢约19–20%，不追加有利重采。两个睡眠干扰FAIL和原日志保留。
恢复审计435453a9确认全部1748份仓库及82份产物为本轮前字节，productionac4c136b，
217总／210-fast；其原whole1864/1865 FAIL／403首次引用20s超时不变。候选完整归档，
不借39项或旧1862授予GREEN；继续真正冷Program／完整SDK及复杂closure。

前一检查点：独立CPU与来源观察确认真实编辑重复创建255份SDK源，且
READY准备绕过既有请求内模块／目录复用。72358623最小接线后两入口公开
RED→GREEN、64/64；固定8正常会话真实编辑中位约3.42→2.97s，一对RSS1.1595，
资源假说未通过。当前原完整check:fast1862/1862、exit0、零注解，独立审计
8c5cc269；原403源码／四oracle／原期限保持，当前通过不证明旧超时已修复。
详见[OP04终态](op04-versioned-overlay-snapshot.md#当前72358623完整回归终态)。后续先区分
存活owner的native leases／live heap／自然GC与RSS及真实驱逐回落，仍继续复杂
真实closure／冷准备；不以shutdown尾部、PID退出或代码GREEN授予资源毕业。

前一production5e7bffc4的独立重复通知切片12完整文件93/93，完整
安装SDK新34源／32推断依赖hop固定8会话96exact／当前READY。两入口重复通知
中位3.50/3.43s→79/77ms；真修改仍3.27–3.48s，四对RSS含一对升高。原v1工具
误判通知修订的FAIL保留，审计a20ba24f，详见[OP04当前证据](op04-versioned-overlay-snapshot.md#2026-10-16重复磁盘通知的独立输入切片)。
不是S05/128采纳、403修复、Settings/P95/PSS／物理释放；随后原完整check:fast
已1858/1858、exit0、零注解，209入口／1744源码／SDK／产物／启动器与真实退出
独立审计47ad6dda。原403四份oracle和原期限本轮通过，旧a6整轮1837/1839 FAIL
保留。继续实际changed-file准备／复杂真实closure／冷Program、压力及全部余项。

## 第一切片 官方 LS 的公开 CLI

公共接口：`scripts/bench/query-layer-probe.mjs --layer official --manifest FILE --out FILE`。
使用现有 prepared-suite 的输入与 oracle pin 验证，生产 DocumentStore、resolver、
SDK 选择与 LanguageService Host；通过锁定 compiler 的工厂捕获实际公开 LS，
不读取 private engine 属性。直接 official 查询不使用完整答案缓存。

测试：两文件真实 ETS 工程，未打开消费端包含两处引用，排除声明；同快照两次
直接查询均须精确，完整 membership 为 2、只有一个 LS、输入前后身份不变。
结果只证明归因 CLI 的行为，不宣告新的 LSP capability。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node \
  --test --test-concurrency=1 tests/query-layer-probe-cli.test.mjs
```

RED：显式 CLI stub 输出 `QUERY_LAYER_PROBE_NOT_IMPLEMENTED`、exit 2；
公开测试 0 PASS / 1 FAIL，602.702648 ms；不是缺失模块或外部 SDK 阻塞。
最小实现首次仍失败：复用的测试 SDK 元数据缺少 `path: ets`，严格选择校验
报 `QUERY_LAYER_SDK_UNAVAILABLE`。修正夹具元数据并重新 pin，没有放松校验。
GREEN：1/1、exit 0，1699.557365 ms；零 fail/cancel/skip/todo。

后续垂直切片均先在同一公开 CLI 上 RED，再最小实现：

| 行为 | RED | GREEN |
| --- | --- | --- |
| 未查 implementation | unsupported；1 PASS / 1 FAIL | 2/2，3397.921526 ms |
| 未保存 overlay 与 edit oracle | unsupported；2 PASS / 1 FAIL | 3/3，4967.889871 ms |
| package 身份为锁定 r10，而非 compiler.runtimeVersion | 4.9.5 不等于 4.9.5-r10 | 3/3，4945.876515 ms |
| 必要输入缺失：准备 DEGRADED、目标查询 0、局部结果仍 exact | 缺失 readiness；3 PASS / 1 FAIL | 4/4，6806.676904 ms |
| 真实 owner/index/Worker、完整范围与同快照答案缓存 | owner 参数不支持，exit 2；0 PASS / 1 FAIL，4 个未选中 | focused 1/1，2758.173202 ms |

owner 边界为公开 `SemanticEnginePort`，包含生产 proxy 的候选规划和 Worker IPC；
不包含 LSP stdio、诊断调度、就绪刷新或响应编码。保持实际 Sidecar 与默认策略，
不以缺少 index 的 24-batch fallback 或强制 legacy 路径充当等价 B 对照。
只使用公开接口；独立 index cache 为工具创建的临时目录，退出后移除。

最新完整 focused 文件：5/5、exit 0，9680.029216 ms；零 skip/cancel/todo。
两个 typed entry 的 strict 编译通过（owner 导入仓库 JSON，使用 resolveJsonModule）。
新源/工具/测试及登记文件均 ≤500 行；新的完整 check:fast NOT_RUN，合入前须执行，
不借用 PR #95 的 1585/1585。其它能力、生命周期和资源曲线继续补齐。

## 外部资源曲线与真实时间边界

公开接口：`scripts/bench/measure-query-layer.mjs --layer official|owner --manifest FILE --out FILE`。
复用已有独立 process-tree RSS sampler，不将 harness 或 sampler 加进产品 RSS，
Worker thread 只算所属 Node PID 一次。原始 probe、原始 RSS 和综合报告均保留，
同名文件拒绝覆盖；采样失败不能返回 PASS。外部 watchdog 按实际准备／查询
阶段设截止时间，失败保留 stderr、退出状态、资源与已观测时间边界。

资源 CLI 首个 RED 为显式 stub（0/1，706.11229 ms）；实现后沙箱 ps 报 spawn EPERM，
如实输出 FAIL。只读采样授权后 GREEN 1/1、2271.389918 ms，未跳过采样。
真实时间边界 RED 0/1、2268.266873 ms；最小 IPC phase 实现 GREEN 1/1、2972.013198 ms。
构建进程隔离 RED 0/1、2473.443195 ms：stop 后仍有 0 RSS 的未及时回收子进程。
将一次 bundle 构建放入独立子进程，并等待其退出后再开始 Host 准备；不读取构建库
private 状态，不通过删去样本伪装干净曲线。完整 focused 回归 6/6、exit 0，
10665.593204 ms；零 skip/cancel/todo。真实 deadline 超时与失败恢复测试仍须继续补齐。

最早 owner 开发控制 5/5 exact，准备 14.286 秒；未查引用 1194.34 ms，
新增／删除引用 4328.10／4013.02 ms，重复答案缓存 0.11 ms；没有外部资源曲线。
原始控制：`.bench/op00-owner-no-declaration-r1-v1.json`。不以该单轮作稳定分位数。

## 当前构建 完整 LSP 基线

Node 20.19.5，真实 Settings/API24，1024 MiB、正常诊断、trace OFF。
六项优化环境变量均不设置，实际验证生产默认，而非依赖 benchmark flag 启用。
新建六份清单，不覆盖旧对照报告；含／不含声明各三个新进程。
source input `af9469ef7aa331a4d96d044fa94d7b1123ca2bd13c130884c7b698c675f64db6`；
server `3e65d6b1ac66385e72b6b3216d9d2dbcd0c744d011296e2db3cd785c78dc86f5`。

六会话 30/30 exact，正常诊断 PASS、产品进程退出 0；报告整体 FAIL，
readiness DEGRADED，不能填充 ready 后正式 SLO。未查引用 915.0–1023.7 ms、
新增引用 4208.1–4359.3 ms、删除引用 3930.7–4155.3 ms、重复 cache 1.3–1.7 ms。
Node 采样峰值 1080.9–1096.2 MiB；product tree 含 sidecar，为 1250.5–1265.8 MiB。
这些是逐值范围，不是 P95，不将 worker thread RSS 重复相加。
原始清单/报告：`.bench/op00-lsp-{no-declaration,with-declaration}-r{1,2,3}-timing-v1*`。

## 独立 trace 的阶段线索

三个独立 trace 会话各 5/5 exact，正常诊断 PASS、产品退出 0，readiness 仍 DEGRADED。
未查引用候选规划 72.45–74.11 ms，resident 命中段 847.64–884.91 ms。
每次编辑先 inputs-changed 拒绝 resident，随后单批 transient verifier：
worker Program 准备 3173.85–3533.39 ms，查询本体 62.33–70.61 ms。
这些字段可能重叠，不能直接相加为互斥阶段；不能把事件数当 Program 构建计数。
原始清单/报告：`.bench/op00-lsp-r{1,2,3}-trace-v1*`，不混入 trace-off 延迟样本。

## 官方完整 LS 的真实工程对照

独立顺序执行 r2/r3/r4，无并行类型检查或 benchmark；三个进程 15/15 exact。
原始报告：`.bench/op00-official-no-declaration-r{2,3,4}-v1.json`，r4 复用 C-r1 清单。
最早 r1 与类型检查启动重叠，仅保留为开发控制，不计三轮独立样本。
准备 13.18–13.70 秒，必要输入仍 DEGRADED，准备目标查询 0、完整 membership 1496。
未查 implementation 252.24–259.54 ms；未查引用 180.69–200.16 ms；
同快照直接查询 135.25–142.89 ms（无答案缓存）；新增引用 741.73–767.75 ms，
删除引用 721.51–743.99 ms。A 的时间为 Host prepare + compiler query，尚不含结果映射，
不能等同于完整 LSP SLO；RSS 当前只有点值/maxRSS，没有外部曲线，不能冒充内存验收。

owner 真实工程重复样本与外部资源采样继续采集；OP-00 保持 IN_PROGRESS。

## owner 三轮独立外部资源会话

顺序运行 `.bench/op00-owner-no-declaration-r{1,2,3}-resource-v2.json`；分别复用
C 同编号清单。三个 driver、probe 和 harness digest 完全一致，15/15 exact。
所有会话必要输入仍 DEGRADED；候选、SDK、overlay 与声明策略沿用冻结清单。
未查 implementation 1370.39–1766.18 ms；新引用 982.88–1015.73 ms；
新增引用 4356.98–4413.07 ms；删除引用 4072.09–4122.41 ms；cache 0.145–0.167 ms。
Node 采样峰值 1086.67–1097.33 MiB；含全部后代的 tree 峰值 1125.90–1266.95 MiB。
各 323–331 个样本，实际间隔中位数 129–130 ms，最大 153–173 ms；
不以请求的采样周期代替真实间隔。第一轮 tree 较低值仅如实保留，不算优化收益。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node scripts/bench/measure-query-layer.mjs \
  --layer owner \
  --manifest .bench/op00-lsp-no-declaration-r1-timing-v1-manifest.json \
  --out .bench/op00-owner-no-declaration-r1-resource-v2.json
```

输出使用独占创建；重放须换新的 out 名称。相同命令替换 layer=official 即可对照，
不复用已存在的报告／RSS／metrics 文件。资源窗口覆盖实际准备到最后查询，
不将多会话 maxRSS 合成为单进程峰值。其它声明策略、能力与压力恢复继续执行。

## 三层同输入外部采样对照

A 三个独立会话 `.bench/op00-official-no-declaration-r{1,2,3}-resource-v2.json` 完成，
driver digest 一致，15/15 exact；prepared membership 1496、一个官方 LS，目标预查询 0。
准备 12.72–12.91 秒，readiness DEGRADED 没有重标为 READY。
与同编号 C 清单一致，三个层各 5 请求、3 进程，共 45/45 exact（不含声明）。

| 测量项目（ms，逐值范围） | A 官方完整 LS | B 真实 semantic port | C 完整 LSP |
| --- | --- | --- | --- |
| 未查 implementation | 261.61–263.26 | 1370.39–1766.18 | 1314.5–1508.1 |
| 新引用 | 183.18–192.27 | 982.88–1015.73 | 915.0–1023.7 |
| 同快照重复 | 137.64–147.90，无答案缓存 | 0.145–0.167，缓存命中 | 1.3–1.5，缓存命中 |
| 新增未保存引用 | 696.42–713.61 | 4356.98–4413.07 | 4217.3–4359.3 |
| 删除未保存引用 | 679.61–683.42 | 4072.09–4122.41 | 3930.7–4039.0 |

A 有 175–176 个外部样本；Node 峰值 763.39–777.48 MiB，probe tree 峰值
766.89–777.48 MiB；实际间隔中位数 129–130 ms，最大 146–177 ms。
A/B tree 包含 probe 整个生命周期的后代（bootstrap 构建、postflight pin 核验亦保留），
不是纯 LSP 产品树；正式 G-MEMORY 不能用其代替 C，也不能用 RSS 冒充 PSS。
构建辅助进程在 Host 准备前已退出；harness/sampler 不在采样树内。

A 仍只计 Host prepare + compiler query，不含结果映射；B 用内存 logger 收集事件，
C 还写 stderr/文件并执行 LSP 生命周期。独立会话的调度、GC 和日志成本存在差异，
C−B 不能直接定义为互斥的传输／诊断阶段。可支持的结论是：B 独立复现约 4 秒
编辑长尾，问题不依赖 LSP 传输；结合独立 trace，先排查 resident 输入核验与
编辑后 transient Program 准备。所有范围仅为机制归因，不是 P95 或最终产品验收。

OP-00 仍缺：A/B 含声明独立对照、未查 definition/incomingCalls、body/API 编辑、
constructor／多批及压力恢复；实际 read/stat/realpath、Program/SourceFile/Registry
生命周期计数；真实 deadline/失败保留回归。D 客户端显示计时 NOT_RUN。
新的完整 check:fast NOT_RUN；保留 IN_PROGRESS，不以已有 45/45 关闭阶段。

收尾登记回归：新增两个 executable test entry 后，库存期望仍为 180／unit-contract 85，
先后得到 9 PASS / 1 FAIL（12776.54206／11781.331808 ms）。将库存更新为实际
182／87，并断言两个新文件都在 unit-contract，没有删除检查或跳过新测试。
最终三文件 combined focused 10/10、exit 0，11801.33009 ms；零 skip/cancel/todo。
typed entry 的 strict 编译与 diff whitespace 校验通过。测试夹具遵循平台 sidecar
可执行名；不支持 RSS sampler 的平台必须报告失败原因，不能换成 maxRSS 冒充采样。
当前正向曲线仅在本机 macOS 验证，Linux／Windows 新工具验证尚待 CI。

## definition、incomingCalls 与失败证据保留

沿用父修订 a111235 与现有分支，继续每个行为先 RED，再最小实现。

| 公开行为 | RED | GREEN |
| --- | --- | --- |
| definition 返回未打开模块中的完整定义 | official unsupported，0 PASS / 1 FAIL、5 个未选中；1603.137245 ms | focused 1/1、3466.365208 ms |
| incomingCalls 使用真实 prepare item，返回未打开 caller 的完整 payload、路由、UTF16 ranges | Location-only oracle 不支持调用项，0 PASS / 1 FAIL、6 个未选中；1975.805854 ms | focused 1/1、3645.436713 ms |
| 中途失败保留已完成请求、失败耗时与原因，不执行后续场景 | exit 2 且整会话结果丢失；0 PASS / 1 FAIL、7 个未选中，2169.869658 ms | focused 1/1、3772.921574 ms |

新能力均分别执行 official 与 owner 两个真实子进程，没有 mocked LS 或 private
engine 访问。A 直接调用锁定 compiler 的公开 API，B 走现有 semantic port；映射
复用公共 LSP 适配器，校验完整 payload，不删 data／detail／range 使 oracle 变绿。
Context7 没有匹配 call hierarchy 文档，接口按仓库锁定 r10 的公开 d.ts 与现有适配器
核对，未借用新版专属 API。失败会话 exit 1、status FAIL，后续 ID 明确 unexecuted；
输入 pin 错误仍 exit 2，不能误当作完成了一次查询。

三文件 combined focused 13/13、exit 0，24246.879464 ms；零 skip/cancel/todo。
三个 typed entry strict 编译和 whitespace 校验通过。完整 check:fast 仍 NOT_RUN。
复用既有 Controller.refreshUi 的七目标／五场景池，新建当前生产产物、Node 20、
trace-off 的三份清单：`.bench/op00-lsp-incoming-r{1,2,3}-timing-v3-manifest.json`。
不复用已被重建移除的旧 profiler server，不覆盖旧报告，六项优化开关均未设置，
验证实际生产默认。source input 仍 af9469…；固定原 workspace／SDK／oracle。

官方第一会话 5/5 exact，首次 incomingCalls 557.69 ms，重复直接查询 58.17–64.54 ms；
原始综合报告 `.bench/op00-official-incoming-r1-resource-v3.json`。完整字段校验 invalid
为空，但 readiness DEGRADED 保留，不是 ready 后 SLO 或最终毕业。独立 owner/C
及其它两轮继续采集；实际身份／读操作计数和生命周期场景仍未完成。

## incomingCalls 三层三轮完成的控制证据

同一七目标／五场景池，A/B/C 各三个独立进程、各 15/15 exact，总计 45/45。
A/B 各层 driver digest 在三轮内一致；C 使用同一当前 server artifact。
完整 payload 的 invalid 均为空；C 正常诊断、shutdown 与产品 exit 0。
C 报告整体 FAIL／readiness DEGRADED，如实保留，不重标为正式 ready SLO。

| 项目（ms，逐值范围） | A official | B semantic port | C 完整 LSP |
| --- | --- | --- | --- |
| 首次 incomingCalls | 523.65–712.15 | 995.73–1720.33 | 1020.96–2401.24 |
| 同快照重复 incomingCalls | 58.17–87.42 | 492.87–921.59 | 527.56–1409.65 |
| prepareCallHierarchy | 44.29–61.35 | 223.76–431.86 | 241.72–554.36 |
| Node RSS 采样峰值（MiB） | 748.38–750.59 | 764.75–772.40 | 746.78–753.49 |
| tree RSS 采样峰值（MiB） | 750.59–753.39 | 933.95–941.21 | 915.59–922.79 |

原始报告：`.bench/op00-{official,owner}-incoming-r{1,2,3}-resource-v3.json` 与
`.bench/op00-lsp-incoming-r{1,2,3}-timing-v3.json`；对应综合报告保留 raw probe、RSS、
metrics 和完整时间边界。A/B tree 边界仍为 probe 生命周期，不替代正式产品内存门禁。

没有删除后两轮的慢样本。各层准备和请求延迟随轮次上升，实际 RSS 采样间隔
中位数从 131–134 ms 到 165–227 ms，最大 326 ms，不能当 50 ms 稠密曲线。
事后 uptime 负载 3.65/3.77/3.28；pmset 无法读取 thermal/performance 状态。
这些不足以证明热降频或具体外部负载原因。保留未解释的跨会话变化，不把不同
时间的 C−B 差值认定为某一个阶段，不计算正式 P95；正式重采须记录 CPU／负载时序。

下一组 definition 保留独立完整公共 LSP 已验证的 setPageModel 跨模块 oracle，
新建 `.bench/op00-lsp-definition-r{1,2,3}-timing-v3-manifest.json`，未换容易目标。
清单已冻结，定义目标模块不预打开，实测尚待执行。压力控制／恢复、body/API 编辑、
constructor／多批、实际身份／读操作计数仍须完成；OP-00 不关闭。

压力控制防假 PASS：公开测试先复现 after-eviction 被 A 当作普通查询并返回 PASS
（0 PASS / 1 FAIL，8 个未选中；3110.25981 ms）。A/B 当前没有实现相应物理驱逐、
压力恢复或重启，最小修正为明确 QUERY_LAYER_CONTROL_UNSUPPORTED 并保留先前
成功请求。不是用正常查询代替压力验收；这些场景的实际执行仍是阶段剩余工作。
最后 combined focused 14/14、exit 0，27261.401432 ms；零 skip/cancel/todo。
三个 typed entry strict 编译通过，完整 check:fast 仍 NOT_RUN。

## 跨模块 definition 三层三轮控制

沿用既有 setPageModel 独立完整公共 LSP oracle；定义目标查询模块不预打开，
定义所在 controller 模块也不经公开 open 预热。A/B/C 各三进程、各三请求，
共 27/27 exact；三轮内各层 driver digest 一致，生产 source input 仍 af9469…。
所有产品 exit 0，C 无运行异常；readiness DEGRADED 仍使 C 报告整体 FAIL。

| 项目（ms，逐值范围） | A official | B semantic port | C 完整 LSP |
| --- | --- | --- | --- |
| 首次跨模块 definition | 275.72–1461.39 | 2451.20–4077.41 | 3304.02–3808.09 |
| 同快照重复 definition | 48.63–197.82 | 862.63–1374.23 | 2248.76–2649.64 |
| Node RSS 采样峰值（MiB） | 716.70–722.84 | 757.87–770.36 | 737.30–748.94 |

原始综合报告：`.bench/op00-{official,owner}-definition-r{1,2,3}-resource-v4.json`；
完整 stdio：`.bench/op00-lsp-definition-r{1,2,3}-timing-v4.json`；对应冻结输入清单为
`.bench/op00-lsp-definition-r{1,2,3}-timing-v3-manifest.json`。顺序执行，无并行测试或
代码修改，不覆盖旧报告。资源原始样本与输入前后核验均保留，不宣布正式 P95。

整组耗时与实际采样间隔明显变大：各会话采样间隔中位数 135–481 ms、最大
853 ms，不能当请求的 50 ms 密集采样，也不能凭一轮速度推断长期性能。
三层独立测量并不是同一请求的互斥分账；剩余实际 read/stat/realpath 和
Program/SourceFile 身份观测仍是选择优化事务的依据，不能仅用 C−B 相减代替。
压力恢复实现未完成：A 的官方 LS 销毁／重建与 B/C 的实际内存压力须分别标注，
前者不能冒充产品压力验收。含声明对照、body/API 编辑及 constructor 仍待执行。

## owner 真实驱逐与重复恢复控制

公开 CLI 用 `ARKTS_BENCHMARK_CONTROL=1` 和 `ARKTS_REFERENCES_TRACE=1`
触发实际 owner L3 控制；六项优化仍采用未设置变量时的生产默认。
先查询另一个目标，观察新的 `semantic.context.evict`、`memory-level3` 和
residentContextCount=0，然后才发送未查目标。恢复后再次施压另列
pressure-recovery-repeat；不在查询计时前重新准备 Program。
这是显式控制驱逐，不宣称复现自然 RSS 压力或关闭正式内存门禁。

首次 RED：同父修订 a111235 的公开测试在第二场景得到
QUERY_LAYER_CONTROL_UNSUPPORTED:after-eviction，0 PASS / 1 FAIL、9 个未选中，
2502.965313 ms。最小实现的首个 GREEN 为 focused 1/1，2467.279245 ms。
重复恢复追加后的早期命令观察输出未保留，不补写其 RED 数字或终态。
当前实际重跑同时证明未查恢复与再次施压后的恢复，完整位置精确且无答案缓存。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  tests/query-layer-probe-cli.test.mjs tests/query-layer-resource-cli.test.mjs \
  tests/test-layer-manifest.test.mjs
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node node_modules/typescript/bin/tsc \
  --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext \
  --moduleResolution NodeNext --resolveJsonModule \
  scripts/bench/query-layer-official-entry.ts scripts/bench/query-layer-owner-entry.ts \
  scripts/bench/query-layer-call-hierarchy.ts
```

当前 combined focused 15/15、exit 0，29433.978807 ms，零 skip/cancel/todo；
strict 编译 exit 0。缺少 opt-in 的压力场景仍显式失败，官方 A 尚无物理
生命周期控制。真实 Settings 恢复和其资源曲线尚待新控制；完整 check:fast
仍 NOT_RUN。工具 GREEN 不关闭 OP-00 或 L08。

## 实际输入操作计数 A 层首切片

日期：2026-10-12；父修订仍为 `a111235bc4bfcb55b126752f95b3ba095f2996af`。
生产 source `7816d51d…`／server `a2df8bb0…` 未变。现有 CLI 新增显式
`--observe-inputs`，默认不观察；只覆盖 official driver 的 run 内同步 native API
尝试，按 setup、preparation、query 和 outside-request 分窗。调用原 fs／crypto
API 并保留原返回／异常，结束后恢复；不读取私有引擎、不新增 LS 或目标预查询。
preflight、driver/oracle load、postflight、异步 fs、Worker、子进程和内核 syscall
明确排除；不能把该计数冒充整个进程启动或 B/C 总量。首切片当时 owner 模式
明确拒绝未覆盖的边界；后续 owner 支持单列在下一节，不追改旧观察器身份。
报告标记 `normalTimingEvidence=false`，不进入正常 SLO。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test \
  --test-name-pattern='official diagnostic observer counts executed input operations' \
  tests/query-layer-probe-cli.test.mjs
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  tests/query-layer-probe-cli.test.mjs tests/query-layer-resource-cli.test.mjs \
  tests/test-layer-manifest.test.mjs
```

公开 RED：CLI 拒绝新 flag，QUERY_LAYER_OPTIONS_INVALID／exit 2，测试 0 PASS／
1 FAIL、exit 1，728.911666 ms，另十项未选中。最小实现首次仍 FAIL：测试错把
已加载文本的 setup 读取要求在 preparation 出现；实际 preparation 的 readFile=0、
stat/lstat/realpath/hash 非零。按真实窗口修正该断言，不搬移或编造计数。
GREEN 1/1、exit 0，1976.712205 ms，另十项未选中；完整结果与输入身份不变。
默认关闭和未覆盖边界／重复 flag 的拒绝保护补充通过，最新三文件 focused
17/17、exit 0，30306.9092 ms，零 skip/cancel/todo。临时 DEBUG 标记已移除。
observer/probe/test 为 74/156/448 行，均未超限。

预声明三份新 manifest／report／stdout／metrics 路径；不复用旧 metrics。三个
独立真实 Settings 进程已完成，15/15 exact、目标预查询 0、membership 1496，
各 CLI exit 0，全部 pins、driver 和 observer 身份一致；readiness 仍 DEGRADED。
观察器 SHA256 `a860556f934fbd1af06b963bb4309285b29f0d049555b32346a6d57ac97a75c0`。
清单与逐文件 digest 审计为 `.bench/op00-input-operations-v1-{jobs,audit}.json`，
原始文件 `.bench/op00-official-no-declaration-inputs-r{1,2,3}-v1*`。
下面每个计数三轮完全相同；hash 字节只指 update 输入，不是全部 compiler 数据量。

| A 层窗口 | readFileSync | statSync | lstatSync | native realpath | hash update | update 输入字节 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 初始 prepare | 28 | 119580 | 191609 | 111519 | 1753 | 12337366 |
| 未查引用 | 0 | 254 | 0 | 261 | 259 | 2144457 |
| 同快照直接重复 | 0 | 254 | 0 | 261 | 259 | 2144457 |
| 新增未保存引用 | 0 | 1536 | 4569 | 2769 | 1500 | 10672843 |
| 删除未保存引用 | 0 | 1536 | 4569 | 2769 | 1500 | 10672738 |

普通 realpathSync 初始 prepare 另有 178 次，查询窗口为零；setup／outside-request
全部保留在 raw 报告。零 readFile 不等于零新鲜度成本；native API 尝试不是
物理 I/O 或互斥 CPU 时间。先补 B 的实际 Worker 计数与 Program/SourceFile 身份，
再选可复用计算，不能仅凭调用多就删除开始／结束 fences。
OP-00 仍 IN_PROGRESS；该工具更新后的新 whole NOT_RUN，既有 whole FAIL 不改写。

## 实际输入操作计数 B 层及嵌套 Worker

日期：2026-10-12；父修订、生产 source `7816d51d…` 和 server `a2df8bb0…`
不变。`--observe-inputs --layer owner` 现在覆盖真实 owner driver 和真实 Worker；
默认关闭，不改六项生产优化默认、Worker 入口、workerData、消息内容或返回。
通过 Node 20 的 `--import` 在实际 Worker 入口之前安装同步原生 API 观察器，
嵌套 verifier 沿用继承的启动参数。已用 Context7 核对
[Node 20 CLI](https://nodejs.org/docs/latest-v20.x/api/cli.html#--importmodule) 和
[Worker 启动参数](https://nodejs.org/docs/latest-v20.x/api/worker_threads.html)。
preloader 自身不创建 Worker，不新增 compiler owner 或目标预查询。

Worker 在每个真实 outgoing message 发送前独立写出 PID/threadId、序列、
累计计数、入口文件名及有限 RPC header；不记录源文本／payload。捕获实际 fs／
crypto API 尝试并转发原调用；主线程按真实收到的消息数核对外层 Worker 快照。
嵌套 verifier 由独立真实编辑反例保护。Worker terminate 不保证触发退出回调，
因此这里只声称覆盖到最后已记录消息，不声称完整销毁、Registry 释放或生命周期。
主线程窗口仍明确排除 preflight／driver/oracle load／postflight；异步 fs、
子进程与内核 syscall 未覆盖。主线程与 Worker 计数分开保留，不重复加 Node RSS。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test \
  --test-name-pattern='owner diagnostic observation includes real semantic Worker' \
  tests/query-layer-probe-cli.test.mjs
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  tests/query-layer-probe-cli.test.mjs tests/query-layer-input-observer-cli.test.mjs \
  tests/query-layer-resource-cli.test.mjs tests/test-layer-manifest.test.mjs
```

第一条为提取前真实 RED/GREEN 命令；测试现已迁入 input-observer-cli 文件。
公开 RED 为 QUERY_LAYER_INPUT_OBSERVER_UNSUPPORTED／CLI exit 2，测试
0 PASS／1 FAIL、exit 1，721.47334 ms，另 12 项未选中；最小实现 GREEN
1/1、exit 0，3266.386503 ms，另 12 项未选中。完整结果、cache-first、
真实 Worker 非零计数及输入身份通过，不以主线程计数冒充 Worker。

提取前 characterization 13/13、exit 0，31365.706818 ms。随后将观察相关
测试职责提取到独立文件；新 entry 未登记的公开库存 RED 为 0/1、exit 1，
154.964901 ms，另三项未选中。早一次错误 pattern 没选中测试，不记为 RED。
登记后实际库存 187／unit-contract 89，bundle-e2e 83 不变；联合 18/18。
补充未保存新增引用的真实嵌套 verifier 表征：最初 fixture 错把末行 UTF-16
range 写成 23..34，实际完整结果为 24..35；修正 oracle，不算生产缺陷 RED。
最新四文件联合 **19/19、exit 0，37251.439147 ms，零 skip/cancel/todo**。
原始日志 `.bench/op00-worker-inputs-{red,green,characterization,focused}-v1.stdout.log`，
库存失败为 `inventory-red-v2`，最新联合为 `focused-v2`；临时 DEBUG 已移除。
observer/probe/preload/collector 为 81/166/37/39 行；原 CLI 测试 389 行，
提取文件 141 行，均未超限。

三会话预声明于 `.bench/op00-owner-input-operations-v1-jobs.json`，顺序运行，
每会话五请求，**15/15 exact**、全部实际 CLI exit 0、目标预查询 0、无未执行尾部。
PIDs 为 38589／38685／38775，pins、driver、三份观察源和完整场景输入一致；
清单仅更换 benchmarkId 和专属 metrics 路径。API24／完整 SDK／Settings 输入、
预算、声明策略和六项生产默认不变；正常 trace 关闭，未同时重回归或修改源码。
必要输入仍 DEGRADED，`normalTimingEvidence=false`、`releaseEligible=false`。
审计 `.bench/op00-owner-input-operations-v1-audit.json` 保留清单／报告／stdout／
metrics／原始 JSONL digest，逐 Worker 序列和累计单调性、raw/report 全量一致性。
原始文件 `.bench/op00-owner-no-declaration-inputs-r{1,2,3}-v1*`。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node scripts/bench/query-layer-probe.mjs \
  --layer owner --manifest .bench/op00-owner-no-declaration-inputs-r1-v1-manifest.json \
  --out .bench/op00-owner-no-declaration-inputs-r1-v1.json --observe-inputs
```

重放必须换新的 manifest／out／metrics 路径，现有输出独占创建。每轮 semantic
Worker 14 个快照，两个 reference verifier 各一个，三轮计数完全相同：

| 观察范围 | readFileSync | statSync | lstatSync | native realpath | hash update | update 输入字节 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| semantic 最后消息累计 | 30 | 152744 | 254658 | 145014 | 3559 | 25935610 |
| semantic implementation 响应到未查引用响应的差量 | 0 | 12063 | 19775 | 12074 | 1031 | 7636169 |
| verifier thread 2 最后消息累计 | 11 | 17550 | 706 | 2305 | 154 | 1228114 |
| verifier thread 3 最后消息累计 | 11 | 17550 | 706 | 2305 | 154 | 1228079 |

差量来自 semantic request id2→id3 两次真实响应的累计快照，可能含区间其它工作，
不是独占 RPC 耗时或完整 compiler I/O。主线程窗口、其它 RPC 响应及消息保留在 raw。
cache 重复完整命中，编辑后两请求 cache miss；不能把 verifier 累计相加当请求 P95。
下一切片先映射实际签名／inputsFor 调用方和输入身份，再选择等价的纯计算；
这些计数不证明所有 hash 等价，也不授权移除开始／结束新鲜度 fence。

旧 A 观察源及 probe 已分别归档为
`.bench/op00-input-operations-v1-{observer,probe}-source.mjs`，digest 仍为
`a860556f…`／`9eba546a…`。本轮 observer/preload/collector/probe digest 分别为
`9673d0f0…`／`8b87ab91…`／`f651f2be…`／`41ac9d7f…`，完整值见审计，
不把旧 A 样本 repin 成新观察器运行。生产完整回归的 1589/1601、12 FAIL 继续
保留；该工具更新后的 fresh whole NOT_RUN。Program/SourceFile/Registry 身份、
调用点互斥成本、生命周期释放及其余预声明场景仍缺，OP-00 不标 DONE。

## 2026-10-13：资源 wrapper 中途超时／退出请求保留

父修订仍为a111235bc4bfcb55b126752f95b3ba095f2996af；生产输入c2a50003不变。
本切片只修改归因工具及真实子进程测试，不改变产品期限、配置或公开能力。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  --test-name-pattern='resource watchdog retains' tests/query-layer-resource-cli.test.mjs
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  --test-name-pattern='resource abrupt exit retains' tests/query-layer-resource-cli.test.mjs
```

真实compiler/完整测试SDK返回第一请求的两个UTF-16位置；第二场景在真实IPC
query-start边界停住，第三场景尚未执行。私有preload只转发真实消息后阻塞或
SIGKILL实际probe PID，不替换LS、Worker、oracle或响应。timeoutMs仍10000。

watchdog原RED 0/1、exit1、12492.616676ms、一个未选中：实际SIGTERM和
query-start超时已见证，但requests=[]，应保留两条。正常资源CLI先做
characterization 1/1；最小实现同一反例GREEN 1/1、12393.223699ms。
证据 `.bench/op00-resource-watchdog-checkpoint-{red,green}-v1*`；原RED log SHA
72dad016de30f4f34deaf4fa63e8e30f24341d2643d3b7754458c7ade22be3d1，GREEN
afbd4e949eda8d38e70d84314365bc3980234fb0c2c65945430fe3e406490d10。

随后独立突然退出反例RED 0/1、exit1、2345.440628ms、两个未选中：真实PID
在同一第二场景SIGKILL，报告failure却为null。捕获真实close原因的最小实现
GREEN 1/1、2328.228435ms；`.bench/op00-resource-abrupt-exit-{red,green}-v1*`。
原RED log SHA3055a523da6302d7d56b4887989fffeebeb1b4cfcd72fd10ae6a894263aa87f4，
GREEN d4310291c10164c98bfb84a7972196f0d4858cd2abd218f44a36d033d1342902。

完成时发送实际完整请求与既有oracle核对结果，不以phase数量当结果证明。
依赖prepared item的payload按真实顺序只核对一次；裸probe及观察器运行不提前
核对。wrapper保留已完成行，对实际开始但无终态的请求记录timeout/error及
父进程单调时钟耗时下界，不填elapsedMs、locations或成功payload；采样器退出
等待不计入该下界。未执行tail明确列出。中断整份报告始终FAIL/releaseEligible=false，
缺失postflight不伪造inputIdentityUnchanged。完整报告仍需全部原有门禁。

真实owner/Worker/sidecar两种中断表征2/2；完整四文件联合24/24、exit0、
73368.053644ms、零skip/cancel/todo，另保护官方和owner的prepare→incomingCalls
完整三请求依赖、正常RSS、输入观察、编辑verifier和库存。`pnpm check`及
diff检查通过；所有这些冻结运行的production/SDK/repo身份前后一致。
最新证据 `.bench/op00-resource-checkpoint-focused-v2*`，repo1640文件 SHA
c6cca87d6f98393999dc18dd64f48687b3a0cf617b422bad211d4ea3e1e9c363，log SHA
9d9beb4917498217358ac5f603d057aa8dac5cfaf0e5d51031ceca40a173c2a3。
脚本136/178/143/194、测试193、私有preload29行，均≤500。

工具源/driver身份已变化：不把旧A/B资源样本repin成新工具运行；资源probe中
实际检查点核对/保留成本仍计入它的资源曲线，不冒充产品收益。该缺陷切片DONE，
OP-00整体仍IN_PROGRESS，Program/Registry等未完成范围不缩减。

2026-10-15后续[transient发布顺序切片](op00-transient-verifier-release-order.md)已真实
RED→GREEN：原消息先于finally dispose；现先完成native release再发布结果／输入错误。
成功55/56→0和真实SDK拒绝57→0两合同通过；八文件40/40、原期限和scope保持。
三轮新冻结Settings15/15完整oracle一致，六个verifier各dispose1、实际676→0，
父側exit独立保留。补齐这六个正常完成路径的旧“收尾未知”，不重标旧记录、
不证明强制取消的dispose或GC／物理回落；编辑仍诊断wall约4.92–5.80秒。
当前完整回归、其它场景与全部OP-00／L08范围继续，不能凭本合同标DONE。
随后当前源码c2a50003冻结whole已1648/1648、exit0、零skip/cancel/todo，
production/SDK/repo前后全部一致；`.bench/op02-source-root-model-reload-whole-v1*`。
log SHA862da85ca90f3274aea3bfc344c74fe7585fc4a4ec805c682a74a16fac5bcc4e。
该完整GREEN仅是本head代码回归，不替代剩余实验、采纳或550ms毕业。

相对父修订的文件大小审计覆盖68个改动手写源/测试/脚本、37个新增文件，
新增超限或既有超限增长均为0；`.bench/op00-checkpoint-whole-file-size-v1.json`。
既有债务仍为language-service3282、document-store1860、legacy917、proxy550、
worker-protocol1927、references-batching1349行，六者均比父修订缩短，未清零。

## 2026-10-13：实际公开 Program/SourceFile 返回身份与 getter 区间

父修订仍a111235bc4bfcb55b126752f95b3ba095f2996af，生产source仍c2a50003。
使用TDD/最小改动：仅`--observe-inputs`的official层观测已有公开getProgram
成功返回，不新建LS/Program、不调用目标来探测，不访问private engine。
接口已通过Context7官方compiler API文档及锁定4.9 fork声明核对；不升级compiler。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  --test-name-pattern='official object observation identifies' tests/query-layer-input-observer-cli.test.mjs
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  --test-name-pattern='compiler return timing records' tests/query-layer-input-observer-cli.test.mjs
```

身份原RED为完整结果正常、但缺compilerObjects：0/1、exit1、3204.006624ms，
四个未选中，log4c2511620ae66c4c87bd3156f53ad8328ffb91d70b1828994c8f7f0f60de772b；
同一反例GREEN1/1、3167.235502ms，logbf15ae626faedce4349070aec20b73b9e3071c4a160d7b477b7089425032ae7d。
随后getter时钟原RED缺实际interval，0/1、1878.210574ms，八个未选中，
log18298eb4fb46770052b0daad582cb6be3152e1f02024aee2987c2fb9a10af61f；
最小GREEN1/1，logc6223a62cc607242f59064f625408e0c4d741ecde53748a4cae0334162e7fbde。
前缀`.bench/op00-compiler-objects-{red,green}-v1*`及
`.bench/op00-compiler-getter-timing-{red,green}-v1*`保留完整冻结身份、命令与日志。

WeakMaps只保存对象→数字ID，报告只保存id/file元数据，不强持有旧AST或源码。
SourceFile来自实际返回Program的getSourceFiles；ID仅在该observer/PID中有意义。
public getter区间为真实调用前后单调时钟墙钟，不是纯CPU；元数据提取在区间外。
不是全部Program构建/所有内部getter计数，SourceFile身份复用也不是parser或checker
执行次数、Registry零残余或物理GC证明。normal probe不启用，releaseEligible始终false。
事件4096、Program128、累计source记录65536有界；容量不足明确complete=false/FAIL，
不缩减compiler scope或丢结果。真实五笔各1025位置及130编辑/132请求容量表征均
全量exact，归因拒绝而不是假完整；后者磁盘不变。UTF-16编辑真实Program/SourceFile
换代控制也通过。source记录容量分支尚无独立边界表征，不能冒充已全部验证。

四文件完整相关29/29、exit0、86155.672791ms、零skip/cancel/todo，类型/diff检查
通过，全部production/SDK/repo前后稳定；`.bench/op00-compiler-objects-focused-v1*`，
log53149e9bb1cdad33496924dc37e0ea6bb486537675ae58554187f737a9187e17。
helper54/probe192/test327行，≤500；旧工具源生成归档
`.bench/op00-compiler-objects-parent-inputs-v1.json`，旧诊断样本不repin。

预声明三个真实Settings/API24独立official会话已15/15 exact、实际CLI0/进程0、
pins与repo全部一致，无预查询，服务工厂每轮1次；未与重回归并行或追加有利样本。
`.bench/op00-compiler-objects-official-v1-{jobs,state,audit}.json`绑定全部manifest/
report/stdout/source digest及真实PID28301/28382/28473。每轮实际观测3个Program，
每个2261 SourceFile（project1496/SDK652），40次公开getter返回。两次编辑每次
换代均复用2260个SourceFile对象，仅HomeInitData一个换代，无增删来源。
查询窗公开getter union约0.02–0.11ms，不是热路径主成本；编辑compilerQueryMs
约586–619ms、owner准备约40–42ms，初始准备约11.43–11.55s。均为独立诊断wall，
不算正式P95、不与phase重叠相加，也不将剩余phase wall归为单一CPU来源。
真实必要输入仍DataShareResultSet缺失/DEGRADED，不认证READY。

此证据要求继续观察真实目标API/准备、B层/嵌套Worker及Registry/释放，而非优化
这些微小公开getter或把Program换代推断成全工程重解析。OP-00仍IN_PROGRESS。
生产c2a50003的前一whole1648/1648保留，但不包含本新工具/五测试；本次工具
fresh whole NOT_RUN，合入前须与实际head匹配。不以此门禁阻塞独立后续切片。

## 2026-10-13：真实目标 API 区间及 Registry 正常收尾

父修订仍a111235bc4bfcb55b126752f95b3ba095f2996af，生产source仍c2a50003。
两项公开CLI反例依次RED→GREEN，未修改生产owner、默认组合或预算：

```sh
node --test --test-concurrency=1 --test-name-pattern='compiler target-call attribution records' \
  tests/query-layer-input-observer-cli.test.mjs
node --test --test-concurrency=1 --test-name-pattern='official Registry lifecycle observes' \
  tests/query-layer-input-observer-cli.test.mjs
```

实际使用Node20.19.5。目标API原RED缺实际calls，0/1、exit1，日志
b10a666a87ad7f6d3b91599bdf46c4fc01b8b8c8e97b2b7221bab81fa0ada439；
同一测试GREEN1/1、exit0、1895.965554ms，日志
e289f94093969d82f62a8c3c185e3254a6654c27d3f9cac33ae5ca051b86463d。
Registry原RED缺实际registry记录，0/1、exit1、1882.668006ms，日志
722b7e5f5393d801f11650ad612959d9fff63eaa0aad67a5b32520f503ffc731；
最小GREEN1/1、exit0、1889.208311ms，日志
f15798516311e5f39449c585e32b3681a99d76b8f94d79cfe892d4623fb7fba5。
前缀为`.bench/op00-compiler-target-call-{red,green}-v1*`及
`.bench/op00-compiler-registry-lifecycle-{red,green}-v1*`，保留冻结命令与身份。

实际native目标调用前后记录单调墙钟、返回/抛出状态与顶层array长度，
不预查询、不改变native返回或异常。findReferences顶层数组是symbol组，
不是全部Location数量；完整结果仍独立核对。仅正常返回路径已有直接表征，
抛出记录与4096个call容量分支尚未独立表征，不冒充全部已覆盖。

观察原createDocumentRegistry工厂及成功WithKey acquire/update/release、
成功dispose，不新建Registry/LS。lease表只存公开base bucket/path与整数，
不访问SourceFile private字段；它不是scriptKind/node-format逐项所有权证明。
update可能创建native新entry，未匹配update/release明确complete=false，不猜配平。
WeakRef不额外强持有Registry；收尾独立读取公开reportStats的refCount总和，
统计缺失、格式错误、算术不符、未覆盖unkeyed操作和容量不足均拒绝归因。
Registry≤128、每Registry同时lease key≤65536；新边界分支尚未逐一表征。
这证明逻辑持有情况，不证明GC、live heap、RSS/PSS已回落。

UTF-16未保存编辑的既有公开表征现亦检查实际update、原磁盘不变、完整新
definition及native统计零残余；1/1、exit0，
`.bench/op00-compiler-registry-edit-characterization-v1*`，日志
e4c3784c86a12cb08700063ca05a2635ad4f2d8aed203c9080ef0bf483d82b97。
四文件联合31/31、exit0、89450.006874ms、零skip/cancel/todo；
`.bench/op00-compiler-target-registry-focused-v1*`，日志
4a8dfbd3fd4a3c1dd422b1a08ddab19d164af3442d8f05d2ce5565ba8c646062。
类型/diff通过，全部冻结production/SDK/repo前后一致；helper144/probe211/test400行。
新工具源归档`.bench/op00-compiler-target-registry-inputs-v1.json`，不改旧样本身份。

预声明三个真实Settings/API24独立official诊断会话15/15 exact、实际CLI0，
PID34175/34264/34362，全部pins、repo、driver、observer与raw digest审计一致；
`.bench/op00-compiler-target-registry-official-v1-{jobs,state,audit}.json`。
每轮实际9次目标API、1个LS、无准备预查询、3个Program各2261 SourceFile；
两次编辑每次复用2260对象。Registry每轮acquire2261/update4522/release2261，
峰值observed lease2261、native收尾refCount0、successful dispose1，未知update/
release均0。update次数并非4522个重新解析或新lease。

新增引用三轮总wall860.92/833.85/901.87ms，其中getDefinitionAtPosition
680.83/662.30/719.01ms，findReferences139.43/130.63/142.30ms；
删除引用总wall786.79/777.92/737.44ms，其中definition617.41/613.22/570.11ms，
findReferences126.16/123.47/129.12ms。外围owner准备约38–58ms。
因此该A层编辑成本主要位于第一目标API调用内，不是已观测微小公开getter；
内部同步、解析、checker各占多少仍未被本边界解释。时段按union审计，不叠加
重叠区间，也不以旧工具样本宣称新诊断成本回退或产品优化收益。
保留全部慢值，normalTimingEvidence=false、releaseEligible=false，必要输入
DataShareResultSet缺失仍DEGRADED，不宣布P95/READY或L08毕业。

本首切片GREEN；含声明A/B由下一节补齐功能与计数，仍需B/嵌套Worker对象、其它预声明场景、
回收/压力生命周期及D实测。新工具head fresh whole仍NOT_RUN；既有C2生产
whole1648不覆盖这些后增工具测试，不成为其它切片共同前置。

## 2026-10-13：含声明引用 A/B 各三个独立真实会话

按原计划补齐，不重复抽样直到有利。预声明恰好A/B各三会话、每会话五场景，
复用原已核验含声明oracle与原overlay bytes，但另建当前C2 pins/manifest/output；
旧报告不改身份。六个进程实际exit0、30/30 exact、前后production/SDK/repo
身份稳定，A/B归一化manifest相同；六份raw与每场景完整Location oracle重新核对。
包含声明的初始/重复/新增/删除集合分别10/10/11/10位置；implementation为1位置。
不是首次未打开模块的支持证明：保留原preOpenTargetIds，不隐藏该剩余合同。

证据`.bench/op00-with-declaration-layers-v1-{jobs,state,audit}.json`，audit SHA
5b2ca25275f4d8c649751d9a4b98c0d23ea127830e0a4d2d5c6edcfe3324a309。
A PID34534/34624/34719，B PID34804/34904/35003。记录全部diagnostic wall值：

| 场景 | A官方完整LS，三轮ms | B真实owner，三轮ms |
| --- | --- | --- |
| implementation | 249.49 / 249.25 / 249.26 | 1055.90 / 1131.95 / 1084.70 |
| 未查引用 | 177.98 / 175.10 / 178.81 | 693.24 / 687.69 / 693.86 |
| 同快照重复 | 138.87 / 130.82 / 133.34 | 0.146 / 0.135 / 0.160 |
| 未保存新增引用 | 842.80 / 832.06 / 838.77 | 5669.85 / 5599.46 / 5164.19 |
| 未保存删除引用 | 771.33 / 798.00 / 767.04 | 5436.56 / 5422.84 / 5440.61 |

A每轮仍1个LS、9次实际目标API、3个各2261 SourceFile的Program，无预查询；
Registry acquire2261/update4522/release2261、成功dispose1，native收尾0。
B重复项实际answer cache命中，其它项未命中；不是把缓存重复当未查目标。
每轮实际semantic Worker14个累计快照、两个编辑verifier各1个；raw文件逐字
hash、thread/sequence、计数单调与报告数组审计一致。Worker计数仍非RPC独占；
B/Worker的Program、Registry终态明确NOT_OBSERVED，不能借A的释放结论替代。

六轮必要输入均DEGRADED，normalTimingEvidence=false、releaseEligible=false；
本次没有独立进程树RSS/PSS/CPU曲线，不授予正常产品P95或阶段净收益。
编辑后的owner成本仍显著超过A边界，具体阶段/生命周期继续归因；不直接以
B−A当某一CPU职责或额外compiler实例的成本，不撤去输入结束保护换通过。
此预声明功能/计数范围已补齐；OP-00仍需B/Worker对象与完整生命周期、其余
能力/场景、当前构建正常资源与D证据。其余阶段不以这些补测为共同启动门槛。

## 2026-10-13：Worker compiler 原生观测与 Registry 证据纠正

父修订a111235b、生产source c2a50003与原产物不变。本切片使用公开owner CLI
及真实Worker，先RED再最小实现，不访问private server/engine或SourceFile字段。

**历史证据解释纠正**：锁定r10的reportStats只列bucket名以`_`开头的项，
实际getKeyForCompilationSettings生成的普通bucket不满足这个条件。此前OP-00
记录的reportStats=0不能独立证明native零残余；撤回这一解释，不修改旧raw/audit。
已有实际成功acquire/release/dispose计数和完整结果仍保留。首版新Worker观测
在真实55个持有lease与空reportStats之间明确拒绝，未假PASS。

现在使用本锁定fork实际暴露的getLanguageServiceRefCounts，仅传入观测到的公开
WithKey path/scriptKind参数，逐已知path-kind跨bucket求和；不是上游标准API，
不是未见键的全局census，不猜归一化kind、不读取private SourceFile字段。
缺方法、异常、形状不合法、与流量账不符、路径容量不足均拒绝归因。
已知path-kind≤65536/Registry，WeakRef不延长对象寿命，统计不可得不填假零。
新的outstandingLeaseSource明确记录fork/观测范围；仍不宣称物理RSS/PSS已回落。

原Worker的compiler实际内嵌在CJS bundle，外部require.cache钩子不覆盖它。
仅owner的--observe-inputs生成另有digest的诊断Worker：保留完整原compiler源码，
在exports边界附加pass-through Proxy；先以无钩子相同build设置逐字复现原
server及三个Worker产物，不一致即拒绝。独立builder结束/reap后才开始观测，
无额外LS/Program/目标预查询。库文件保持原生产物理路径与bytes，SDK、完整
project scope、WorkerData、消息、默认配置与1024MiB政策不变。
诊断产物不冒充原生产Worker，actual path/生产及诊断sha、compiler/hook/builder/
stdlib digest绑定报告，不用它判正常产品时延或资源收益。

预加载及嵌套Worker构造边界只映射白名单中的原/诊断产物；实际SourceFile身份、
getProgram/目标API区间、LS starts/dispose与Registry计数来自该isolate中的native
调用。Worker ID必须与raw计数吻合。只持有有界数字/文件名，不保留旧AST/正文；
latest compiler记录原子发布，不在每条消息反复保留完整图。每个isolate记录
timeOrigin、最后实际outbound/isolate-exit边界，未观测终态不推断已释放。
当前是Worker生命周期归因，不是独占RPC计时；IDs不可跨thread比较。

```sh
node --test --test-concurrency=1 --test-name-pattern='owner compiler observation records' \
  tests/query-layer-input-observer-cli.test.mjs
```

真实RED0/1、exit1、4143.075213ms，11个未选中；
`.bench/op00-worker-compiler-objects-red-v1*`，log
57a51a075ab2a68bacf107f25686c87eb289e99f2fe560cb8489eb2a955d9081。
首两实现FAIL均保留（green-v1/v2）；v3同一反例GREEN1/1、exit0，
`.bench/op00-worker-compiler-objects-green-v3*`，log
7b5bb438e09315aad690926c051880d7aed8c725bb73b5fb4ddfbfc1f7866c8e。
定义完整oracle、观察关闭对照、生产stdlib路径及真实native refcount一致。

首次四文件30/32 FAIL是嵌套产物身份拒绝，不抹掉；
`.bench/op00-worker-compiler-focused-v1*`，log
822cfb7aad437108eaaf833d6ebaf74c3a2287266a3b35f9d4bc88aea9411b5a。
嵌套路径诊断保留两个中间FAIL及actual-cause；原因为macOS临时路径的
/var与/private/var物理别名。生成产物地址按真实目录规范化，身份保护未移除，
原两失败2/2 GREEN；`.bench/op00-worker-compiler-nested-green-v3*`，log
784a7b55324cc7e995ae2b84c9767ad8ed85bd03a403d66d83e45e02f671a73e。

随后同四文件完整32/32、exit0、105431.821057ms、零skip/cancel/todo，
production/SDK/repo前后稳定；`.bench/op00-worker-compiler-focused-v2*`，log
2ab7aede677f2179c777126165821ae54b6c81087195c9aa990ec2365621cf57。
包含真实编辑verifier、完整结果、不多建LS、关闭观察对照、incoming依赖、
正常资源/中断保护、事件/Program容量和库存。类型/diff通过；新增builder79行，
preload69/collector59/helper209/probe167/test469行，均≤500。
此工具切片GREEN；真实当前构建的native持有/分层数据随后固定次数重建。
生产C2旧whole1648不覆盖本后增工具/测试，新工具whole仍NOT_RUN；OP-00和
OP-05/L08原生命周期/压力/资源/时延范围继续，不以新32项宣布完成。

### 当前构建的固定 A/B native 观测

预声明A/B各三独立进程已30/30 exact、实际exit0，所有production/SDK/repo
before/after身份一致；无并行重回归或追加有利样本。A PID46473/46564/46653，
B PID46745/46846/46948。`.bench/op00-worker-compiler-layers-v1-{jobs,state,audit}.json`，
audit SHA9e166bf62ff4e9ec6b256c1653f4f51a5eaa289c677b794460bf22a7568f1a20。
raw oracle/current overlay bytes、实际Worker路径、生产/诊断产物及工具/库digest、
每条native区间与Program ID全部复核。工具源归档
`.bench/op00-worker-compiler-inputs-v1.json`，旧样本不repin。

A三轮成功dispose后，对实际2261个已观测path-kind的fork refcounts求和均0，
acquire2261/update4522/release2261，与native统计一致。这是纠正后的独立路径
见证，不能替先前空reportStats授予历史native census。全部统计仍非RSS回落证明。

B每轮真实semantic Worker starts2/dispose1，观测到1个2261 SourceFile的Program
（project1496/SDK652/原生产stdlib52），其已知Registry路径当前native持有0。
没有把两次LS工厂当作两次Program构建。两次编辑分别启动真实transient verifier，
每个starts1，实际观测676 SourceFile（project153/SDK410/生产stdlib52、其它61）；
这些是生产候选/closure同WorkerData产生的实际scope，不是诊断工具缩减输入。

六个编辑verifier的getProgram区间union分别4735.73/4692.34、4712.83/4743.98、
4768.70/4786.39ms；随后目标API union约53–56ms，其中findReferences约
43.72–48.69ms。B新增引用三轮5851.54/5819.98/5870.91ms，删除
5572.86/5628.92/5669.44ms。主要已观测成本位于冷verifier的getProgram，而非
最终引用搜索本体；该native区间含同步/准备，仍不是纯CPU或全部parser/checker
计数。留存完整时钟realm；Worker累计区间不冒充独占RPC阶段，余量不归单因。
owner原驻留服务为何回收/替换仍需实际触发原因见证，不仅凭starts2推断普通
编辑重建或压力trim。下一切片围绕这条冷准备路径及其内存资格，而非盲增并发。

六个编辑verifier最后可见边界均outbound-message：native持有676、dispose
未观测到，不能写成零或当作泄漏。生产per-batch terminate合同仍保留；还需
parent实际exit/成功dispose边界与独立live-heap/RSS/PSS证明。当前记录诚实暴露
此生命周期尾部缺口，不用功能PASS替代OP-05/06。所有会话必要输入仍DEGRADED、
normalTimingEvidence=false、releaseEligible=false；不授予READY/P95或L08毕业。

### 父侧退出与 native dispose 调用来源

新公开反例分别证明父侧退出数组缺失、L3 native dispose 调用来源缺失，
再实现实际 Worker `exit` 监听和成功原生调用的有界栈/区间记录；不由最后
消息推断退出，不额外调用 dispose，也不把 terminate 当作 dispose。
父侧上限1024个Worker/parent，native lifecycle事件上限4096/isolate；超限拒绝
归因。成功dispose后立即原子发布checkpoint，普通关闭观察路径不记录调用栈。

父修订仍a111235b，生产source c2a50003及原产物不变。RED/GREEN前缀为
`.bench/op00-worker-parent-exit-{red,green}-v1*` 和
`.bench/op00-native-disposal-caller-{red,green}-v1*`；两项各0/1→1/1，
真实exit1→0，所有production/SDK/repo身份稳定。完整四文件相关回归
`.bench/op00-worker-lifecycle-focused-v1*` 为33/33、exit0、113495.123213ms，
零skip/cancel/todo；log SHA
8d9f9c6eebe6741ec8fca1f9d78f6fc5ae4581d8a866cc5052db2a35501e386e。
类型/diff通过；新lifecycle helper25行，observer/preload各73行，均≤500。
该回归不替后增工具授予C2旧whole1648的完整head结论。

预声明三个真实owner会话，PID52661/52777/52881，15/15 full-oracle exact、
真实exit0，production/SDK/repo/raw/诊断产物/库身份审计PASS，无追加有利样本。
原始控制与结果为 `.bench/op00-worker-lifecycle-layers-v1-{jobs,state,audit}.json`，
audit SHA a9fa95a3e62527eee95ba2f3532c989423886726fdbe56bfd052a0d9681a29e6；
工具源独立归档 `.bench/op00-worker-lifecycle-inputs-v1.json`，不改旧样本身份。

三轮LS替换均有同一真实调用链：`Timeout.sampleMemory` → applyMemoryPressure
→ coordinator → L2 trim → recycleOfficialSemanticService。实际旧服务dispose
约168.97/167.47/158.24ms，已观测2261 path-kind的native refcounts均0。
这关闭本三轮“为何替换”的未知项，不能推广成所有编辑都会销毁LS。

每轮一个semantic Worker和两个编辑verifier均有父侧created/exited配对，
六个verifier生命周期约5.18–5.49秒，实际exitCode1来自显式terminate。
这是线程停止见证，不是服务dispose或GC/RSS回落见证。verifier最后compiler
边界仍outbound-message、676 lease、dispose未观测，不填假零，也不推断泄漏。
其getProgram union依次4507.79/4469.23、4671.51/4610.28、4639.96/4771.38ms，
后续目标API约50–56ms；完整新增/删除引用约5.36–5.78秒。冷准备仍是主要
已观测成本，不能以更多Worker、cleanup-only或放松1024MiB换通过。

会话仍DEGRADED、normalTimingEvidence=false、releaseEligible=false。独立
live-heap/RSS/PSS、其余能力/压力场景、当前工具whole与阶段采纳继续推进；
OP-00/05/06和L08不由本切片标DONE，最终550ms仍仅在OP-06/L08判定。

后增工具/测试随后随新冻结整轮check:fast1663/1663、exit0、零注解通过，
production仍C2、全部pins/repo身份稳定且独立audit PASS。原始前缀为
`.bench/op06-resource-current-whole-v1*`；完整计数/时长/日志与repo digest
见OP-06 TDD。由此补齐本次工具head的代码回归，不重标旧1648/32/33证据；
仍不是OP-00所有场景或L08产品验收完成。

## 2026-10-14：异步OS采样的完整读取区间

父修订a111235bc4bfcb55b126752f95b3ba095f2996af，生产sourceInput保持
1bc4e318ae484ce80e53463fdfa554d587046c1a328527a7515d420f1bb310a1。
新完整check:fast真实1711/1712、1 FAIL、exit1/signal null，零skip/cancel/todo；
UTC14:03:55.517Z→14:58:24.156Z，3246150.07028ms。已跨过之前无总计的退出位置。
`.bench/op06-retained-regression-current-whole-v1*`，log SHA
8b9f6ae4b227d7c5e582c24d50cdeb23531bedc8b18aea3334f328d7761238ec，
独立terminal-audit SHAcaefc4e04a14346a12e10ed8a69e78bbb0e579c668104d171733f95efe0145c0。
完整源码/SDK/产物前后一致，1673文件archive SHA
8a84ca21b78564ccfe7b8908f74a04ac46f4a20e5db9646deeebf4155ef087e5；真实根PID退出。
这轮唯一FAIL在query-layer-resource CLI的窗内进程断言，不是已完成查询的语义
差异、超时或CLI失败。旧30、auto-import和观察窗口保护在整轮通过，不覆盖旧FAIL。

原断言将sample.timestamp当作实际快照时刻；它实为异步OS读开始时间。
三条被归入窗口的原采样中，一条包含额外PID82126/RSS16384字节。
sampler对所有后代统一标sidecar，不能据此称它为Rust sidecar或compiler-builder。
该原PID命令、完整原timeline/raw因fixture清理未保留，唯一原因NOT_PROVEN；
原FAIL及独立failure-note SHA字段都保留，不能事后填新数据解释旧样本。

固定一次原case单跑PASS1/1、6名称过滤，保留实际完整report/probe/raw/manifest；
`op00-rss-window-original-native-once-v1*`，log SHA
5e4368b6d47df1babf625f6a415b5230b5036aeb64cefc8dba95548a64aeea87。
捕获在原CLI退出及report读取之后、断言之前，不改原report/RSS/时间。
native report request计时不含捕获I/O，但test duration包含；不是产品性能样本。
该次原查询结束之后真实仍采到子进程，不能用一次PASS宣称整轮问题修复。

随后两个固定公共sampler CLI反例均RED：真实目标/真实子进程/实际ps或proc读，
仅延迟一次外部读取；任务结束后创建已知子进程，实际快照包含它，但开始时刻
仍属于原任务。v1未保留完整诊断行的FAIL保留；v2在断言前保存行，start
1791990813747 ≤task-end1791990813761 <child-spawn1791990813763，额外RSS462848。
缺完成区间不能证明快照属于原任务，不是mockRSS/改时间、compiler延迟或预查询。
prefix `op00-rss-snapshot-completion-red-v{1,2}`，log SHA分别
b19364e8c022ab280638d15e50e9ca1325ff78954908a45da2cb77a2d32207dd/
648074470778d4b3a9067f85d845012e72f0fcefae2e6b7c92fb439bcf997002。

最小实现只为每条原采样增加实际completedTimestamp/completedMonotonicMs。
同反例GREEN1/1、exit0；start1791990867116、task-end7146、child-spawn7149、
read-end7233（后三个数沿用同一179199086前缀），真实mono区间115.269→232.912ms。
`op00-rss-snapshot-completion-green-v1`，log SHA
a081dc61d22010dddbeb28c617e30fbb796895bd2be57d3bacdda5870a40b657。
只用start及end都落入窗口且墙钟不倒序的完整读取作原进程资格断言；仍须≥1条
真正窗内采样且每条仅有官方driver。全部raw/peak/tail不删、不改，不用未知结束
时间升级旧记录。原case重新完整PASS1/1、6过滤，3条合格/14条raw、两查询exact，
log SHA3fe6a68ddf94b7f133f5146c6037b507209ffc6fd1bb79162f941a256e522d65。
反例证明此时间归因错误存在，不证明旧82126是什么或唯一成因。

消费端独立公共CLI反例RED→GREEN：完成mono早于start不能获RSS内部一致性PASS；
保持20行查询，memory FAIL/MEMORY_COMPLETION_INTERVAL_INVALID，release仍false。
随后完整10/10保护配对缺失/null/string/unsafe/mixed结束字段；墙钟回拨原样保存，
区间时长只用同一sampler的真实mono，不用不同进程的mono对齐任务。
Node20测试用builtin边界绑定按[官方module文档](https://nodejs.org/docs/latest-v20.x/api/module.json)
及[execFile文档](https://nodejs.org/docs/latest-v20.x/api/child_process.json)实现；无生产preload。

新库存195/unit93，原精确库存RED保留。七文件完整相关63/63、exit0/signal null，
64611.421529ms、零注解，source/SDK/产物前后一致、真实PID退出独立核对。
`op00-rss-completion-focused-v1*`，log SHA
3faf10cad810671b77bf3a75ce24f84ff6ca977d3386311a24884003c857e1f7，
audit SHA7b3caf5fe7245973c14b7921906087b0a5c4ae7421a46352c95add40964f8724。
原取消/中断/完整checkpoint/回拨与原参数不变；pnpm check/syntax/diff通过。
新sampler/helper/test/fixture为99/72/79/50行，均≤500，无Rust或生产owner修改。
这修正资源观察资格，不是PSS/GC/时延收益；修复后当前whole仍未跑，不能合入。
原OP-00剩余场景/归因、OP-05资格/100循环及OP-06全部资源/生命周期/平台/
DevEco-PSS/最终336格保持原范围，OP阶段和L08不据此标DONE。

## 2026-10-16：403 文件冷批次的有限对照与真实阶段归因

父修订仍为a111235bc4bfcb55b126752f95b3ba095f2996af；当前生产输入
bd4010b6532a6a5f377099b2f0c416565f99ef2d2be3a042e88c2a651c8545b1，
server9ae12f908c051223aa322cd443674f32c714683007e970782895b6f901593d5a、
semantic Worker9698b1e6c0c4ddf8dc018614e1eb1f8d7a410ae6e8ada48b1a7b2cbad30274da。
本切片不修改生产、测试、构建、默认或库存；沿用28完整相关文件313/313，
不借该相关回归声称当前206-fast整轮GREEN。历史1779/1797 FAIL、403原20s
超时及其它未定位的5s失败全部保留。

先以默认64、trace0、无observer执行一次原始
`references-completeness.test.mjs` 的
`finds unopened rewritten struct references beyond resident and lazy windows`：
1 PASS/0 FAIL/2名称过滤，exit0/signal null，35120.426749ms；原四请求及20s
期限不变。独立audit14e00a4392dad697a23c3c26939b96bd20d39ec1c7699cc83d20dc89ab1c482b。
这一次通过不是已找到或修复旧超时的成因，也不把整套35s写成冷请求时延。

### 非交付记录器的公开 RED→GREEN

仅在`.bench`建立透明client preload，复用原LspProcess的Content-Length帧、
原response/timeout/close和外部进程树RSS sampler。完整帧及client返回时刻写
journal；实际LSP spawnargs只有`dist/server.cjs --stdio`，不加载observer。
采样从真实child.pid开始，不扫描其它应用、不增加LS/Worker、GC或scope缩减。
原小型overload公开oracle（四请求、两声明策略及重复、全部Locations）同时运行。

有效RED：原公开case已PASS1/1、2名称过滤，而记录器测试因缺少journal失败，
0/1、exit1，7755.566779ms。更早v1误继承NODE_TEST_CONTEXT而未运行子suite，
不算有效RED；其原日志保留。移除该测试runner上下文并要求原case确实运行，
不是删掉产品断言。最小实现GREEN1/1、exit0，11014.394793ms，完整响应、
server未加载preload、真实RSS样本及采样器exit0均验证。observer78行、其公开
CLI测试59行，均非交付/未登记到fast库存。命令与字节在各run的diagnosticInputs
归档，前缀`op00-cold-observer-red-v{1,2}`、`op00-cold-observer-green-v1`。

### 固定64→128→128→64，trace0

执行前冻结`.bench/op00-cold-batch-fixed-order-v{1,2,3}.json`。
v1/v2各四次启动均因错误import specifier失败，没有native LSP/journal或产品
查询；8个FAIL原state/log/audit保留，明确归类HARNESS_IMPORT_PATH_INVALID，
不是产品失败、性能数据或有利值重采样。v3直接构造并在spawn前校验绝对路径，
每格只运行一次，未另选更好的值。

原403文件case、同一完整SDK/closure/1024MiB/六默认、单verifier并发、
两个声明策略各初查与重复、全部UTF-16范围和20s期限均不变。只改变既有
`ARKTS_REFERENCES_BATCH_ROOTS=64|128`，trace/overlay Snapshot实验/anchor
reuse为0，session reuse为off。以下是client send到完整response返回的观察值，
包含collector/sampler开销；不是bare product、P95或最终性能认证。

| 顺序/批root候选 | 初查不含声明ms | 初查含声明ms | 整套原test root ms | 采样tree RSS最大MiB |
| --- | ---: | ---: | ---: | ---: |
| A/64 | 16993.43 | 18698.61 | 36221.83 | 377.71 |
| B/128 | 9866.33 | 11824.61 | 22050.95 | 369.83 |
| C/128 | 9930.46 | 11759.70 | 22259.77 | 372.83 |
| D/64 | 16675.52 | 18926.53 | 36020.07 | 373.07 |

四进程16个完整响应分别2/2/3/3 Locations，独立重建静态oracle及跨根规范化
全文SHA一致；重复命中1.85–2.78ms，不与冷请求混算。两组整套观察耗时分别
下降39.12%/38.20%，不含声明冷请求下降41.94%/40.45%，含声明下降36.76%/37.87%。
配对RSS样本最大值比0.9791/0.9994，仅能说这两对未观察到上升，不宣称内存
优化或真实峰值合格。实际采样最大起点间隔165.37–328.73ms；起止读取区间、
首样本缺口和逐请求完全窗内样本数保留，毫秒cache请求没有RSS覆盖不填零。

四run完整生产/source/SDK身份、collector字节、原始日志/帧/RSS、真实test
root与LSP PID退出独立核对。原fixture以SIGTERM清理LSP，不冒充优雅shutdown、
native LS dispose或物理内存释放。总报告：
`.bench/op00-cold-batch-fixed-order-v3-report.json`，SHA
6d732f6158219a17109389e12ea69fffe81d6e24f6112c04aad0d8663f01afcd。
原始前缀`op00-cold-batch-observed{64-a,128-b,128-c,64-d}-v3*`；每run
SPEC为1 PASS/0 FAIL/2名称过滤，不能加成零skip的whole回归。

### 独立trace1：验证重复准备，不混入正常对照

另预声明`.bench/op00-cold-batch-phase-plan-v1.json`，64/128各一次，同原case
和期限，均1 PASS/0 FAIL/2名称过滤，完整响应与上述静态oracle一致。
两个完整native stderr分别42630/30725字节，无截断，同实际PID。

64：两次miss各7批，14 start/14 complete；128：各4批，8 start/8 complete。
每批candidate/membership仍403、closure、SDK255、transient-worker；未改变
全部合法文件覆盖。Program准备分别1960–2029/1959–2064ms，query多数
3.4–4.6ms、末批85.6–90.3ms；startup receipt约286–307ms，不是纯创建CPU。
含声明之前两者都还有一次独立anchor Program（1976/2006ms、definitions0），
随后完整fallback。字段可能重叠，不按互斥CPU求和。
这是重复冷Program成本的实际证据，不把本机等待或index race定为唯一原因。
每个独立engine的Program sequence1/SourceFile reused计数不当跨批复用。
报告`.bench/op00-cold-batch-phase-plan-v1-report.json`，SHA
0fbb9334aef573caf931413833c3374dd2a6064423cae52a8287a7b95fb1b67b。

### 切片结论与下一合同

归因/有限候选观察已完成，不追加同403语料以追求有利值。128仍NOT_ADOPTED，
生产默认64不变；六默认、1024MiB/原滞回、one owner/max2 contexts、verifier
并发1和ADR0003每批释放/终止不变。简单filler语料不能证明复杂closure内存准入。
下一步按同一正常构建验证真实工程/大依赖、两种source入口的新路径与proof
成本、编辑/未知输入/取消/压力恢复，并保留原完整性和预算保护；没有一致收益
可REJECTED收口，不扩大默认或偷偷改变预算。最终550ms/PSS/336格仍留OP06/L08，
不阻塞上述局部合同。当前生产完整206-fast尚待新整轮终态，不授予合入。

本次冻结文档后使用现有公开`run-retained-regression.mjs`采集一次原
`pnpm check:fast`，不增加observer/采样/批大小覆盖，也不与性能实验并发。
新前缀`.bench/op00-cold-batch-current-whole-v1/whole*`；运行状态和结果只按
实际state/原始stdout/最终SPEC及独立audit判定，不在此预报GREEN。

后续真实终态为1822/1824、2FAIL、exit1、零注解、3043887.808356ms，
完整输入身份审计5e4670c8通过；原403在该whole通过但不宣称旧超时已修复。
其中旧未打开空结果预期已按真实生产成功＋独立synthetic空响应负例拆开，
相关26文件207/207；构造器seed事件整轮失败尚未定位，单例/完整文件通过不覆盖。
同生产安装完整SDK的1000/500受控工程18独立进程全部exact/current READY，
首次引用仍约3.9–4.2s。另两trace均以inputs-changed拒绝resident证明后开单批，
Program约3.20–3.34s、query约72–73ms；不是scope/SDK/预算被缩小。
原CLI最终门禁仍FAIL，PSS/物理释放未授予；详细hash、时序、修正和下一公开RED
见[OP03a最新记录](op03a-completion-diagnostic-priority.md)。测试head新whole仍待跑，
原OP00–06/L08范围和六默认/64batch/1024MiB/瞬态生命周期不变。

随后proof交接切片已公开RED→GREEN，生产81d6e876；此前inputs-changed实际
可来自普通reference proof未观察，不能直接认作签名变化。只交接原owner已过
完整最终fence的只读元数据及既有Program，9完整文件75/75、auditac7407c4。
新构建固定18个安装完整SDK首次查询均exact/current READY/正常诊断，打开调用方
引用中位229–230ms、never-didOpen源464–470ms，准备仍4.14–5.52s；正常audit69d6dac6。
两独立trace均同Program hit、0 miss/batch/verifier、1 owner/context，scope仍
501project/255SDK/52std/869Program，audit4f77a846；不混入正常时延。
原18格约4s、旧whole FAIL及新18份最终FAIL均保留，不冒充P95/PSS或物理释放。
详见[OP03a最新记录](op03a-completion-diagnostic-priority.md)；当前head下一次原
完整collector前缀`.bench/op03a-ready-proof-current-whole-v1/whole*`，不预报GREEN。
本闭合语料不再寻优；继续复杂真实closure/冷准备、独立disk delta/未知在途、
压力恢复和正常资源资格，550ms最终门禁不前置，默认64/六组合/预算/生命周期不改。

该新构建原完整collector已终态1826/1826、exit0、零注解、3093552.887731ms，
完整源码/SDK/产物/原启动器/PID退出独立审计1de2bf76。正式评估器已真实消费，
macOS回归PASS而最终BLOCKED，audit70eca240，不冒充P95/PSS/其它平台。旧FAIL保留。
然后新增一个公开磁盘依赖编辑RED：完整3个引用正确且正常退出，但原显式READY
会话未刷新，根仍DEGRADED/旧证明失效，audit83952896。该时点只增加保护测试，
生产81d6e876不变；当时新测试head为RED，不能借此前1826 GREEN。下一最小引用认证
刷新继续原owner/资源/取消/最终fence，bounded resident-only不隐式编译，不开旧实验。
详见[OP03a记录](op03a-completion-diagnostic-priority.md)；原OP00–06/L08范围保持。

随后上述引用刷新RED→GREEN，当前88ad7e9b的9完整文件81/81、exit0，独立身份
审计987689db；两入口／两声明策略、缺输入修复、真实compiler取消均保护。
独立安装完整SDK、受控1000/500副本4个正常trace0进程，编辑后exact/current READY、
诊断一致且退出0；RPC3973.51／3997.46／3512.57／3946.70ms，采样RSS最大
507.63／558.99／566.05／564.94MiB，auditb5c51a6b。无A/B／P95／PSS或净收益结论。
两单独trace auditffa33bbd均因workspace-changed保守fallback与content-revision-change
替换一次context，再完整检查869输入，普通compiler查询约68／59ms；context
创建到该查询约3607／3274ms，真实输入检查自身合计约116／98ms。定位的是
冷Program及认证前段成本，不把全部前段叫纯parse；一个owner、最大同时一个
context，无transient批次。不代表增量disk复用或物理释放。旧1826 whole不覆盖
当前生产，fresh whole NOT_RUN；先补其它ordinary能力动态证明，再继续复杂
closure／OP04／正常压力资源，不重开S05／默认实验或据小样本宣布L08毕业。

再后续普通刷新切片已以公开RED证明definition、诊断先完成和outgoing follow-up
的缺口。宽触发根准备首轮86/88 FAIL保留（07112a09），原负例不改；选择性根
准备与原意图传递后当前a6ae3b97的9完整相关文件88/88，audit e4c7eaa1。另新
安装完整SDK／1000-500受控副本两trace0进程，首次定义219.55／227.91ms、
编辑后3692.15／3838.86ms，完整结果／当前READY／诊断／退出一致；采样RSS最大
558.95／556.55MiB，audit7becc0ca。不是Settings、A/B、P95、PSS或净收益；旧秒级
瓶颈与全门禁保留。只有必要context重建／不完整loaded scope才先走根准备，
完整owner的普通查询保持原afterQuery／query scope／最终fence。细节及所有
原失败见[OP03a](op03a-completion-diagnostic-priority.md)。原完整collector前缀
`.bench/op03a-ordinary-ready-refresh-current-whole-v1/whole*`已预声明，不预报GREEN。
随后继续其它动态能力／复杂closure、冷Program、独立disk delta／未知在途／配置、
正常压力／物理资源、实际Zed与OP06完整正例，不以最终550ms冻结前序。

该原完整整轮实际FAIL／exit1：fixture写入与最终Node harness输出均ENOSPC，
child-exit7且无最终根摘要，counts=null；11个可见失败标题不当最终总数。
独立审计23bd83d0确认206入口、1734源码归档与当前源码、构建／SDK／启动器、
原CLI收据／日志与原PID退出一致。这是证据完整性，不是whole GREEN或语义根因。
先处理同卷任务重复派生存储，保留全部原路径／SHA与失败日志；空间足够后
新前缀重跑原完整命令，不削弱保护、期限、默认组合或OP00–06/L08完整范围。

## 2026-10-16：整轮终态与专用verifier观察的真实路由资格

原前缀`.bench/op03a-ordinary-ready-refresh-current-whole-storage-recovery-v2/whole*`
实际终态1837/1839、2FAIL、exit1、零注解，3303432.414356ms。全部206 fast入口、
1734源码归档／当前字节、构建／完整SDK／标准库／启动器、原CLI收据／日志及
原PID退出独立审计SHA
`4ab388e2f644aa6e75fe962a4c32476cad3093c6b072d547b16f0fbedc6d54fa`。
本轮0 ENOSPC；原v1缺根摘要／counts=null不被重标。两失败为owner观察要求verifier
hashUpdate>0，以及原403含声明id4在20s超时。后者先返回不含声明响应约16.74s、
重复cache约1.19ms，含声明先付约2.40s零定义anchor再完整fallback；这些是失败
过程边界，不是该case完整oracle通过、纯CPU或唯一原因。冷Program／额外anchor／
调度GC仍区分；旧64/128有限观察和NOT_ADOPTED决定保留，不追采有利值。

### 原样RED及独立原生对照

在终态审计后，保持生产a6ae3b97／Worker4f6462ce和原用例／期限原样复现：
`.bench/op00-observer-transient-boundary-public-red-v1*`，实际0 PASS/1 FAIL，
另11项name-filter未选；不是完整文件统计。父修订a111235b，原SHA／完整日志保留。

`.bench/op00-observer-transient-boundary-native-evidence-v1/`另一次真实公开owner
CLI默认与唯一resident-fast-path=0对照：各一个新进程、各3个完整精确响应，
未保存Use.ets新增引用而磁盘不改，旧答案cache miss；默认只有一个semantic
Worker／原生findReferences，无verifier，fallback两个verifier各有正哈希计数、
1个LS、1次native dispose、零Registry残余和真实created/exited。全部原生JSONL／
compiler／lifecycle文件、构建字节及PID退出独立重读，audit SHA
`d9ea6d3db3652be90535e5ca628b05655f1f2d697db2439e0a6d0223ba097300`。
这是私有完整profile SDK fixture的诊断，不是安装SDK或正常性能／PSS资格。
owner编译器记录停在最后outbound，未观察native LS dispose且当时116 leases；
线程退出不等于已观察dispose或物理释放，也不据该非终态记录宣称泄漏。

### 最小GREEN与默认路径保护

仅给专用verifier观察用例加原有resident显式关闭，保留全部hash／compiler／
dispose／Registry／native-exit断言，不改生产默认。初次selected1 PASS／11未选，
随后增强原默认观察用例的同类引用编辑、完整结果、cache失效及无虚构verifier。
无新开关／helper，测试477→494行。三个完整文件input-observer／probe／resource
实际30/30、exit0、零注解，119387.621466ms，完整源归档＋唯一本文件差量重建、
SDK／产物前后身份与实际PID退出独立审计SHA
`acf11315c887c80cb9b71d4080cfff5f3dddf51696c39ebff73de4c5f729e116`。
Node20 pnpm check exit0，receipt SHA
`e493d93c880b61a1e2919d9accc04fa138ffbafbf16adb1d8d4d416811456556`；diff检查通过。
原whole2FAIL不追认通过，403未修、当前新测试head whole NOT_RUN。后续继续原实际
成本／复杂closure／独立disk delta与未知输入、OP03b、正常资源／物理释放／soak、
OP06真实restart与全证据PASS路径／336格；六默认、batch64、1024MiB与ADR0003不变。

## 2026-10-16：一次有限403复测与独立restart切片

原storage-recovery-v2的403 id4／20s超时及whole1837/1839 FAIL保留。在生产
a6ae3b97／原1734源码测试head上，仅一次原用例／原期限复测：
`.bench/op00-original403-current-finite-repro-v1*`，1 PASS／2项name-filter未选，
exit0，37933.527262ms；四个响应返回后才到达原完整oracle比较。独立audit SHA
`c67ed6b0d1b3b1fe700fe038cd24cf099ffc06122145e40ed455aae609ca2b31`。
这是FINITE_NON_REPRODUCTION_NOT_A_FIX，不是原因已定位、性能改善、完整文件或
whole GREEN；不继续原样重采，原期限／默认64／128 NOT_ADOPTED不变。

随后推进独立OP-06实际restart生产接线，不用550ms／原难点冻结其它工作。
两入口新进程重新READY、未保存编辑／版本重放、逐进程证据消费与异常尾部保护，
19完整相关文件171/171、exit0，独立audit SHA
`0b95855d209819f7216688dbf245936a88ee4dbca7e8b44134a78debe9b596cf`。
详见[OP-06记录](op06-release-sample-evidence.md)。仅私有SDK机制资格，不解决原
403冷Program／复杂closure／物理资源／正式矩阵；生产／六默认／预算不变。
当前工具head whole NOT_RUN；全部余项和合入前fresh whole＋分支PR要求保持。

后续独立OP06来源切片：两入口完整completion/resolve与prepare/incoming/outgoing、
真实旧补全UUID失效及本进程实际来源核验，20完整文件176/176；四私有SDK原生案例
12精确请求／8服务PID正常退出，audit6d359df3，详见[OP06](op06-release-sample-evidence.md)。
只是工具／测试资格，生产a6ae3b97未改；原403／64-128决定不重开、不追采有利值。
继续复杂closure／冷Program、独立OP04输入和正常物理资源；全目标与最终门禁不缩小。

## 2026-10-18 403冷引用超时专项定位

用户本次要求先把原因定位清楚，因此本切片只诊断，不实施性能修正。原未提交
改动全部保留，父修订仍`a111235bc4bfcb55b126752f95b3ba095f2996af`，生产输入
`ac4c136b69d74332c73ed8a9aa6c9dc562ec440070a2082679922f186050d863`。

### 原样反馈环与四个可证伪假设

先在Node20.19.5、真实子进程／Content-Length stdio上执行原403用例，所有
ARKTS实验环境清空、无preload／采样／trace，原20秒期限和测试字节不变：

```sh
/usr/bin/caffeinate -is /Users/liuhui/.nvm/versions/node/v20.19.5/bin/node .bench/op00-403-diagnosis-v1/run.mjs baseline plain
```

实际RED：首个不含声明请求`id2`超时，用例20300.811376ms；源码、SDK及构建身份
前后相同。caffeinate只绑定本次进程，未改系统设置。其后的每组实验都先保存
计划，逐次执行并保留所有FAIL。四个假设与预测见同目录`plan.json`：

1. 串行冷Program累计超限：应观察到七批秒级准备，查询本体很小。
2. 输入校验／磁盘IO主导：应出现大的准备外围空隙、校验或读取热点。
3. 诊断队列／索引等待：应把主要时间消耗在首批开始之前。
4. Worker启动／GC／系统调度停顿：应出现启动或非当前线程CPU时间主导。

现有trace一次、原trace-OFF元数据／文件调用观察一次、独立CPU采样一次，随后
SDK缺失负对照一次；再按预声明完成四次无文件包装／无profiler的trace-OFF尾部
观察，以及两次实际线程CPU探针。共11次原场景，3 PASS／8 FAIL，名称过滤的
另两用例各自skipped，不冒充完整文件或whole。以下不同观察模式不混成时延分布：

| 运行 | id2不含声明（ms） | id4含声明（ms） | 原用例结果 |
| --- | ---: | ---: | --- |
| baseline，无观察 | 20s超时 | 未发送 | FAIL |
| 现有trace | 18841.51 | 20s超时，尾部未观测 | FAIL |
| trace-OFF元数据／文件调用 | 18951.50 | 20s超时，尾部未观测 | FAIL |
| 独立CPU profiler | 18540附近 | 20s超时，尾部未观测 | FAIL |
| SDK缺失负对照 | 4345.32 | 4398.34 | PASS |
| tail-1，轻量元数据 | 16229.14 | 17926.31 | PASS |
| tail-2，轻量元数据 | 16174.42 | 20s拒绝；21796.76完成 | FAIL |
| tail-3，轻量元数据 | 18314.74 | 19158.65 | PASS |
| tail-4，轻量元数据 | 17300.46 | 20s拒绝；20390.09完成 | FAIL |
| 实际线程CPU-1 | 18183.4附近 | 20s拒绝；20389.4附近完成 | FAIL |
| 实际线程CPU-2 | 18270附近 | 20s拒绝；20280附近完成 | FAIL |

尾部观察只在原20s Promise已经拒绝后让服务器最多继续5s，不把迟到响应返回给
原测试，不再发送后继应用请求，也没有放宽原期限。四次迟到id4的完整Locations
均独立核对精确；这些用例仍为FAIL。共30份收到的完整引用payload核对原静态
UTF-16 oracle一致，包含正常响应、缓存重复及迟到响应，不把未返回工作计为通过。

### 已量出的因果链

冷服务没有可复用的已准备上下文。首次候选查询在索引尚未打开时迅速失败，进入
403全范围保守回退。现有trace里：诊断暂停0.479ms、候选选择2.73ms，索引catalog
约70ms后ready；父侧semantic admission到send返回360.88ms，Worker收到后到dispatch
1.56ms。文档准备101.87ms。等待项没有占掉这条请求的主要时间。

随后默认64根策略生成7批，每批`new Worker`、新LS／Program／Checker，完成后
释放并终止；批次根只约束项目源，完整SDK ambient仍逐批重新加载。每批实际
255份SDK声明、10741499个SDK文本code units，另有52份stdlib／430409 code units；
中间批次项目源仅65份、约1506 code units。不同Worker之间没有AST／Program复用，
同一Worker查询前后SourceFile reused计数不是跨批复用。

现有trace的首个id2请求18841.51ms，其中七批完整墙钟合计18329.39ms，Program
ready合计15386.90ms，createProgram子阶段13403.89ms，实际查询合计121.48ms。
单批准备2171.82–2224.46ms，查询多数3.52–4.38ms、末批97.46ms；批间连续推进。
startup receipt合计2384.40ms是另一项成本，但可能与Worker内准备重叠，不与
Program字段按互斥CPU相加。首请求已经接近20s，实际无观察baseline也复现了id2超限。

第二个不同策略的冷请求id4还尝试一次独立锚点Program。该Program实际只包含
1个项目文件，fixture的全局struct声明在远端文件、没有import边；返回definitions0，
随后仍走403／7批回退。trace的这次额外锚点2589.13ms，Program2207.37ms。
这使含声明请求形成8次冷准备。此额外成本属于id4，不能倒算到原id2失败上。

轻量tail-2测到完整失败21796.76ms：锚点及七批Program ready合计18568.32ms，
查询合计129.34ms。一次Program由邻近约1.9s变为3.63s，另两批2.45／2.55s，
原20s耗尽时末批仍在执行，随后正常精确返回；不是可由删掉测试结果要求解决的成本。

### Program内部与实际线程CPU

独立profiler的14份已完成verifier采样中，源码解析inclusive约1183–1274ms／批，
其中JSDoc解析737–816ms，bindSourceFile约220–234ms，GC约124–147ms，最终
assertCurrentInputs约7–16ms。这些包含关系不能相加。主要采样栈为
`programFileStats → getProgram → synchronizeHostData → createProgram →
createSourceFile → parseSourceFile → parseJSDocComment`，绑定也发生于首次getProgram
之内；后续显式getTypeChecker很快，不代表没有绑定成本。

文件调用观察中每批约6392次stat、11319次lstat，分别累计约65–72／64–72ms；
readSync约8–10ms。native realpath未被该包装计时，故不将这些数字冒充全部IO成本。
该探针的process.resourceUsage包含整个Node进程及GC线程，不能拿它分配单线程等待。

为区分实际执行与墙钟，额外在`.bench`内构建只读OS当前线程CPU时钟
`CLOCK_THREAD_CPUTIME_ID`的N-API探针，没有接入产品。先执行
`node20 --test .bench/op00-403-diagnosis-v1/thread-clock.test.cjs`，RED为
MODULE_NOT_FOUND，再最小实现／clang构建，GREEN1/1：100ms阻塞等待仅约0.25ms
线程CPU，100ms计算约96.40ms线程CPU。源码23行、测试16行，父修订同上。

两个完整失败请求保留原trace-OFF、无fs包装，记录实际线程CPU并独立采样：

- CPU-1的id4最终20389.4ms；8个verifier观察窗口合计19566.43ms，其中当前线程
  CPU19291.56ms，差274.87ms；Program ready16782.00ms、查询136.99ms。
- CPU-2的id4最终20280附近ms；同窗口19431.28ms，当前线程CPU19076.35ms，
  差354.93ms；Program ready16593.48ms、查询137.40ms。
- 两次全部30个verifier段的自身CPU／自身墙钟约95.99%–98.92%。加载探针约
  0.7–2.3ms／批，profiler停止及写盘额外耗时也单独记录。这些是观察性数据，
  不作为正常产品时延或P95；当前线程CPU窗口与Program阶段包含重叠，不能相加。

这两次实际失败的主要成本是线程持续执行冷准备；没有必要用秒级系统停顿解释
超限。墙钟减线程CPU仍包含IO、调度、GC协作等，不把差额单独命名成某一种等待。
所有运行前后CPU_Speed_Limit为100是端点读数，不能证明期间频率或主机压力恒定。
本轮没有把其它实验的睡眠／限速移作本次失败原因。

### SDK负对照与结论边界

仅在单个诊断子进程里令SDK发现路径不存在，原403语料、四个原始引用结果断言、
64根／隔离策略及20s期限不变。锚点实际SDK声明0、Program225.98ms，两次冷引用
4345.32／4398.34ms，四份完整oracle通过。物理安装SDK未动。该对照支持重复SDK
准备为主要增量成本，但不具备完整SDK语义资格，不是建议去掉SDK、改默认或性能采纳。

因此本次定位结论是：**保守完整回退的7次独立冷Program反复解析同样的完整SDK，
其中SDK源码／JSDoc解析占主要热点，绑定、路径校验、GC与启动还有附加成本；
20s单请求预算余量很小。含声明的失败还叠加一次definitions0的冷锚点准备。**
正常成本波动会推过期限，实际查询只占很小部分。此前删统计的候选未减少必须
发生的冷Program准备，不能解决这个主导成本。用户要求的当前机制定位已完成，
后续应围绕减少完整冷准备次数／共享不变声明的可验证设计另开修正切片，保留
完整作用域、输入新鲜度和原内存／生命周期门禁。

原那一次只有粗日志的id2事件无法事后重建逐毫秒分配；本轮无观察原样重现相同
id2失败，另取得当前同场景完整失败账本和CPU证据。没有把id4锚点成本、观察开销
或未测的历史主机状态硬套给那一次。定位完成不表示原超时已修复。

全部材料在`.bench/op00-403-diagnosis-v1/`，`plan.json`、`controls-plan.json`、
`tail-plan.json`、`cpu-plan.json`均先于各自执行。独立audit核对11次相同1749源码
输入／SDK／产物及实际退出、30完整payload和44份CPU profile，状态
PASS_DIAGNOSTIC_INPUT_AND_FULL_LOCATION_AUDIT，SHA256
`3ec32e1490055428622948903ad6df9f7909d31dc4de23f0241dbb8e4c5e3166`。
原82份dist文件保持逐字相同；生产源码、原测试、请求期限、六默认与1024MiB未改。
原whole仍1864/1865 FAIL，本切片未启动新whole，不授予merge／产品性能GREEN。

### 255份SDK声明的持有内存实测

用户进一步要求量出SDK解析产物本身的内存，评估一次解析后长期持有是否更简单。
此前整进程／完整LS峰值不能充当这份SDK缓存的大小，也没有证据要求先建设复杂
驱逐系统。以下只测本403语料实际加载的255份SDK声明，不冒充所有SDK API模块。

`.bench/op00-sdk-memory-v1/`保存原始CLI与结果。实际安装API24、相同SDK字节、
Node20.19.5和锁定`ohos-typescript@4.9.5-r10`；从生产代码bundle原编译选项及
full ambient发现函数，compiler本体external，仍调用同一实际fork。独立发现进程
通过真实createProgram/getTypeChecker取得255份SDK、10741499 code units，
与原引用case一致；另外52份stdlib。未加载项目源码，未改变产品代码或构建。

先写CLI测量合同，父修订`a111235bc4bfcb55b126752f95b3ba095f2996af`：
`node20 --test .bench/op00-sdk-memory-v1/measure.test.cjs`的原始RED为
MODULE_NOT_FOUND。最小实现后固定parse／bind／parse／bind四个新进程，完整
合同GREEN1/1，均精确255文件和原文本量，SDK及compiler字节前后核对一致。

各阶段显式GC三次并让出事件循环，以下是相对已加载compiler基线的活堆增量：

| 持有状态 | 第一次（MiB） | 第二次（MiB） |
| --- | ---: | ---: |
| SDK文本 | 14.58 | 14.47 |
| SDK文本＋解析SourceFile／AST／Registry | 107.39 | 107.23 |
| 相同255 AST再次acquire并平衡release后继续持有 | 107.42 | 107.24 |
| SDK＋stdlib完整Program／Checker | 164.25 | 164.29 |
| 释放Program／Checker变量，仅持有SDK AST根及可达状态 | 118.38 | 118.37 |

两次parse均实际复用全部255个相同对象，重新取得约24.45／23.85ms，没有再造
一份AST；不把这个SDK原语操作时间当作LSP响应或绑定节省。释放缓存后剩余增量
1.89／2.01MiB；释放绑定后的SDK根后剩4.03／4.19MiB，不能把初始化后的compiler
内部缓存变化判成SDK泄漏。只留SDK根也可能连带保留其它对象，因此118.38MiB是
该引用图的实际持有量，不声称每个字节都只属于SDK语法节点。

纯解析阶段RSS增量134.08–136.39MiB；绑定后仅SDK根阶段153.83–154.61MiB。
RSS包含分配器和保留页，释放后也未立即回到原值，不用它替代活对象大小。
本实验的显式GC仅用于测量，没有提出生产强制GC或正式物理内存门禁通过。

由此支持一个更小的待验证方案：**在同一个长期存活的验证Worker中保留一份当前
SDK的解析结果，由批次共享；SDK／backend／相关解析配置变化时替换，继续释放
项目请求状态。** 当前约107–118MiB的活堆数据足以支持先验证这个方案，不需要
把通用LRU／分级驱逐体系作为前置条件。当前数据仍不是所有SDK／全项目的峰值，
也没有证明跨批绑定、新鲜度与长期引用图全部正确，产品实现尚未改变。

独立audit状态PASS_SDK_HELD_HEAP_ACCOUNTING，SHA256
`29661f34d408a3151e02eca820f4e716faecfca41ecb9a3c6eaea332677d2681`；同一
productionac4c136b／完整安装SDK身份及82份dist产物保持原字节，原whole FAIL不变。
