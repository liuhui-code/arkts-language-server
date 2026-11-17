# 30K Photos：版本化索引候选连续协议耐久结果

本轮完成连续正式阶段 **7265.248 秒（121 分 5 秒）**，正常关闭；这不是整个功能验收完成，
更不是 Zed UI 点击验收。完整引用/重命名拒绝、语义长尾及其他规模补测仍单列。

## 身份与边界

- 源父版本 `298d65f5d7f796c347fe8be5c739e428066489d8` 加隔离工作树候选；
  源快照 SHA256 `93d200fb012381d1255602b6f0967124d9811aac802cf62213b9a618b1379a1f`。
- 工作树 `/private/tmp/arkts-index-versioned-maintenance-20261104`，不是父版本原包、main 已发布包。
- server SHA256 `d34a69c36cf507d0504de7ab3e56e8003d3fd0dcf42bd7b2758dc64f183df26f`；
  Native `9034ad301aaca22c3cb516778c8e044fa4593be50eba674b61efc6f800732dce`。
  全部 79 项运行资产及 SDK 元数据运行后复核一致。
- Node 20.19.5；SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，声明不完整。
- 输入为保留的 Photos 30K 项目的隔离副本：30000 个索引源码、30060 个受保护输入；真实模块拓扑保留。
- 真实 stdio LSP 子进程，Native 原始 tee、语义队列 trace、Worker 内存指标；无编译器/GC 探针。
  该观察模式耗时不合并到未开启 Native tee/语义统计的普通模式；普通模式仍有资源采样、队列日志及内存指标，
  并非零观察开销。两者都不是 UI。结果缓存命中、实际 Program 文件数/构建次数未测。
- 产品默认未配置 RSS 预算；测试 Node RSS 固定停线按既有授权禁用，其余资源保护保留。
  核对驱动发现其历史未生效默认值为1536MiB，并非此前口头沿用的2048MiB；
  本轮环境豁免为1，未启用这两个数中的任何一个，也未修改产品阈值或主动重启。

## 时间、动作与公开响应

正式阶段北京时间 **2026-11-09 02:51:49.660 至 04:52:54.908**，同一会话、种子 `817954798`。
含准备/校准的会话为 02:44:24.160 至 04:53:34.952。计划 7200 秒，最后一个既定空闲周期跨过边界，
实际 7265 秒；包含忙闲交替，不能称为 121 分钟持续满载。

| 口径 | 实际结果 |
| --- | ---: |
| 正式完成的动作 | 1138 |
| 全会话动作（含准备、校准） | 1195 |
| 正式窗口内发送且收到的响应 | 5160 |
| 其中成功响应 | 4577 |
| 其中错误响应（下表） | 583 |
| 全会话请求（含初始化、关闭） | 5275 |
| 驱动 findings / 未结束进度 token | 0 / 0 |
| 全会话已知功能缺口记录 | 299 |

错误没有算作功能成功；`findings=0` 只代表驱动支持场景及其预期拒绝断言成立。

| 正式错误响应 | 次数 | 解释 |
| --- | ---: | --- |
| definition -32800 | 145 | 取消场景的取消响应 |
| references -32801 | 141 | 交错修改后的旧请求失效 |
| references -32803 | 198 | 完整范围不可用，功能缺口 |
| rename -32803 | 99 | 完整范围不可用，功能缺口 |

全会话 299 个缺口含正式前校准，不能与正式 297 个范围拒绝混作同一窗口。
动作覆盖阅读、编辑/撤销、补全/详情、取消突发、标签开关、依赖/barrel、移动/恢复/删目录、watch、配置、空闲恢复。
校准覆盖 44 个目标；正式阶段重复热点与跨目标混用，并非随机遍历全部 30K 文件。
命名的 save-212/close-255 回归回放通过，但不是原长序列全部前缀，也不是 UI 保存或关闭的证明。

## 时延（正式成功响应，毫秒）

| 方法 | 数量 | 中位 | P95 | P99 | 最大 |
| --- | ---: | ---: | ---: | ---: | ---: |
| completion | 438 | 230.28 | 426.63 | 1197.16 | 1232.41 |
| completionItem/resolve | 284 | 208.24 | 372.74 | 458.21 | 517.29 |
| definition | 2947 | 371.67 | 4131.45 | 4308.96 | 5638.33 |
| hover | 292 | 254.77 | 1516.59 | 2180.66 | 2527.42 |
| documentHighlight | 292 | 484.60 | 1635.84 | 2464.35 | 2541.24 |
| documentSymbol | 147 | 640.40 | 1028.08 | 1123.66 | 1200.51 |
| typeDefinition | 145 | 481.03 | 1720.17 | 2305.40 | 2527.26 |
| workspace/symbol | 23 | 2359.53 | 4222.22 | 5716.04 | 5716.04 |

500ms 为体验目标；定义和全局符号有持续长尾，不能称延迟问题解决。
正式成功补全中15/438（3.42%）超过500ms，详情2/284（0.70%）；定义1265/2947（42.93%），
不属于仅一次偶发波动。六个完整20分钟桶的定义P95均约4.05–4.19秒，长尾贯穿会话。
该频率属于包含密集配置、目录和依赖变化的既定混合压力分布，不等同日常UI分布。
最慢三次定义分别为请求3881/485/4739，均标记为配置变化后首次查询，目标为
`PickerUIExtensionAbility__copy_003.ets` 中 `ScreenManager.getInstance`；
完整URI、位置、输入版本、时间及前十个慢响应保存在 `formal-latency-target-observation.json`。
本轮尚未将长尾逐个关联内部阶段；不得套用旧 SCALE002 的排队百分比或归因为 Program 重建。

## 索引维护：避免再次全库写入的实证及限制

唯一被完整资格引用的数据 store 为 `catalog-10064-18e6262aa3e3de18-0.sqlite3`。
原始顶层 `maintenance/terminal` 逐条统计，无重复 `(attemptId,scope,uri)` 终态：

| scope / outcome | 数量 |
| --- | ---: |
| workspace qualified | 293 |
| workspace published-unqualified | 3 |
| workspace cancelled | 522 |
| file data-updated | 620 |
| file unchanged | 201 |
| file cancelled | 73 |
| file failed | 1 |

有计数的 workspace 终态为首次 30000 文档、随后 295 次 0 文档；其中 3 次尚未取得资格。
有计数的 file 终态为 368 次写 1 文档、453 次写 0 文档（含复用已存在版本）。
首次冷建报告 14220087 facts 行；这不是旧版累计逻辑行的同一公式，也不是物理写字节。
596 个终态没有 facts 写计数，记为未测；取消/失败可能留下私有工作，不能称其零写入。
此数据支持本会话没有在每次编辑/重新资格时再写 30000 文档；不证明所有扫描、证明或语义工作与规模无关。

一个 file failed 为 SmartPickerManager.ts 的最终 source fence 拒绝。
驱动恢复文件领先恢复通知，Native 在此窗口拒绝提交；后续对同 URI 免写并在 rev366 完整资格。
保留失败计数；未测究竟哪个 stamp 字段失配，不把 `currentInput=false` 当作 file 输入已过期的证据。
详见 `native-source-fence-rejection-adjudication.json` 及其逐条时间线。
另逐条核对三个 published-unqualified：rev63/head35→rev65、rev328/head228→rev330、
rev640/head451→rev643，后继都在同 head 取得完整资格、写0文档；不是不可恢复状态。
`all-unqualified-successor-audit.json` 保留原始响应字节位置及后继完整终态；
这不证明每个中间请求都可用，也未细分最终 source fence 失败的具体字段。

## 资源与结束状态

- 2 秒 RSS 采样，最大间隔 2193ms；Node 峰 1190.79MiB、Native 246.34MiB、树 1468.02MiB。
  Worker 线程包含在 Node RSS 中，不另加一次；这些独立峰不可相加，RSS 总和不是 PSS。
- Worker isolate heapUsed 事件采样最大 1020.60MiB，非等时间采样，不能直接推导时间加权均值或泄漏斜率。
- 完整 20 分钟区间的 Node RSS 中位数约 959–967MiB；Native 中位数由 211.79 增至 228.12，
  后一完整区间 226.70MiB。只描述这次观察，不以 RSS 不降或此趋势单独证明泄漏/无泄漏。
- 系统 free 最低 67%；采样数字 FD 峰 Node32、主 Native41、主 tee20。监听器/所有句柄未测。
- 索引唯一文件逻辑长度峰 1871256804 字节（约1.743GiB），分配块峰1887391744字节；WAL 峰7416064字节。
  分类峰可能不同步；均非累计物理写放大量。
- 语义 Worker 启动 1 次，无退役/重建事件；4 个实际 Native：主服务、启动时缓存 GC、两次定时缓存 GC。
  原始生命周期均 exit0；GC 保护活动缓存、删除0，不是主 Worker 换代。
- server error/fatal 日志0；正常 shutdown ack、exit0、无外部干预、无残余进度。
  会话后独立只读 `ps` 检查上述已知 PID 均不在；没有停止其他进程。
- 数据 DB 完整性+外键检查通过（28.52秒），control DB 通过；未把检查耗时当损坏或产品请求延迟。
- 受保护30060输入运行前后完全一致。会话后全部30444树条目与保留原副本比较一致，含文件hash、目录、模式、symlink。
  非源码全树未做运行前hash，此项是运行后对照，不能冒充全树前后证明。

## 电源核验器误报与纠正

旧核验器把运行前 `00:12:31 Sleep ... Entering DarkWake state` 当成一直未醒的系统休眠，原 FAIL 原样保留。
Apple 的 [实际日志实现](https://raw.githubusercontent.com/apple-oss-distributions/PowerManagement/main/pmconfigd/PrivateLib.m)
在同一 Sleep 域输出不同目标状态；[电源状态分支](https://raw.githubusercontent.com/apple-oss-distributions/PowerManagement/main/pmconfigd/PMConnection.m)
可在阻止真正休眠时记录 DarkWake；[内核说明](https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/iokit/IOKit/pwr_mgt/IOPM.h)
明确 CPU 可在 DarkWake 运行。不能仅看栏目名断定系统睡眠。

仅在本轮诊断目录修正解析：实际样本先 RED，随后9项 GREEN，保留原4项；真正 Sleep 跨窗口仍 FAIL，未知格式 UNPROVEN。
当前会话及正式窗口均无已记录系统 Sleep 重叠，核验 PASS，绑定原控制收据 SHA256
`c7fbdc95f36bc2826143af65050961aed903a8de627f268eddefb0aa304908ab`。
未改变电源设置/产品/原收据。Apple main 仅佐证日志语义，未核验本机系统的精确源码版本；
日志无休眠不等同所有电源事件可观察，更不把空闲当满载。

## 当前检查与未闭环项

当前冻结候选完整检查：`pnpm check:fast` 2412/2412；Rust421通过/1原有忽略；release、fmt、Clippy及相关补充通过。
455 冷建3381.35ms，只有3秒时间门槛按用户授权豁免，正确性通过；不称未豁免全量绿色。

文件体量/引用密度补测13校准17个操作通过，但收尾只读 ps 被沙箱拒绝，因此原轮 FAIL 保留。
补测14在允许进程采样的独立目录完成97/97，见[固定体量/引用密度对照](2026-11-09-versioned-index-density-comparison.md)，
不覆盖原轮，不合并为一次连续耐久。
Photos缓存重开功能正确，默认60秒离线检查超时；独立82秒同SQL完整性/外键检查通过，原FAIL保留。
见[重开及补证报告](2026-11-09-photos-cache-reopen-postflight.md)。
原“能力探测”短进程经原始输出schema核对更正为启动缓存GC，依据`native-process-role-audit.json`；不覆盖原始日志。
当前 Native 受影响规模复核、冷索引并发前台、独立Photos实际 Program 观察及最终清单仍待完成。
SCALE002/003 语义长尾/截止、INPUT010 静默新增、源码树内缓存命名空间、SDK不完整、30K完整引用/重命名仍未闭环。
Windows/UI 未实测；本轮实际 `cua.getState()` 返回原生管道启动失败及浏览器宿主不可用，
只证明控制通道不可用，不据此认定缺少系统辅助功能授权。未截图或操作用户窗口；协议工作继续。
只读证据 `ix14-desktop-channel-preflight.json`。不自动合并、发布、部署或删除用户缓存。

## 证据与复现

证据根 `.bench/index-versioned-maintenance-20261104/final-acceptance-13/`：
`execution.json`、`installation.json`、`photos-inputs-before.json`/`after.json`、
`final-session-analysis.json`、`formal-error-responses.json`、`post-session-tree-comparison.json`、
`post-session-identity-and-process-check.json`、`sleep-free-validation*.json`、`power-*.log`。
`protocol-runs/versioned-final-13/` 保存逐请求参数/位置/版本/时序、actions、wire、队列日志、资源、原始 Native tee、结果和DB检查。

原命令：固定 Node20.19.5，环境 `SOAK_IGNORE_NODE_RSS_GUARD=1 SOAK_NO_GC_OBSERVER=1`，
运行 `harness/run.mjs soak versioned-final-13`。输出名/冷缓存不得复用覆盖；按控制器准备新的独立目录、
固定输入及79资产后方可复跑。本轮不重新跑两小时，也不把补测视作此会话的延长。
