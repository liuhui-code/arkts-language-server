# 4 GiB 压力预算与 Worker 释放调查

后续实施说明：维护者在本调查后明确要求取消默认RSS预算。
[ADR0029](../adr/0029-opt-in-rss-memory-budget.md)与
[新候选验证](2026-10-29-default-unbudgeted-memory.md)记录该后续修改。
本报告保留调查时的4GiB源码/产物事实；本轮未部署，日常Zed原安装包不因工作树修改自动变化。

日期：2026-10-29。源码基线`9d47e550ee7c0a3ba9e0e889f62e04bb9fd4a78a`，
工作分支`feat/index-cache-lifecycle-20261029`，已有缓存治理修改保留。
本轮仅只读调查、报告和小型隔离探针；没有修改产品代码/配置/阈值、部署或停止用户进程。
证据根：`.bench/memory-policy-audit-20261029/`。

## 结论

**存在默认4 GiB运行期压力预算；不存在默认“RSS超过4G就终止主语义Worker”的规则。**
预算控制分级trim/驱逐及部分查询准入；主Worker压力替换是另一个默认关闭的实验选项。
Program被dispose、引用辅助Worker退出、主语义Worker替换、V8 OOM和整个Node退出是不同事件。

## 口径与配置

`config/semantic-runtime.json:5`默认4096 MiB，`coordinator/runtime-config.ts:19`读取
`ARKTS_MEMORY_BUDGET_MB`，第34行实际乘`1024*1024`，虽然变量叫MB，单位是MiB。
4096 MiB=4 GiB=4294967296字节，约4.295 GB；十进制4 GB=4000000000字节，并不相等。
环境变量在创建Worker的runtimeConfig时读取；编辑终端export不会改变已经运行的会话。

| 数据 | 范围 | 参与这项4 GiB判断？ |
| --- | --- | --- |
| `process.memoryUsage().rss` | 整个Node进程，包括主线程、语义/验证/诊断Worker、进程内native/external等 | **是**，只计该PID一次 |
| Worker里的`heapUsed/heapTotal` | 当前Worker的V8 isolate | 否；不是RSS预算的输入 |
| Rust原生索引/独立维护进程RSS | 各自独立PID | 否 |
| Zed+Node+native等进程树RSS和 | 各PID的RSS之和 | 否；不能再叠加Worker线程的“RSS” |

Node官方说明：Worker中的rss属于整个进程，其他memoryUsage字段属于当前线程/isolate。
RSS也不是PSS或macOS physical footprint；跨进程RSS直接相加可能重复计算共享页。
依据：[process.memoryUsage](https://nodejs.org/docs/latest-v20.x/api/process.html#processmemoryusage)，
通过Context7 `/websites/nodejs_latest-v20_x` resolve/query核验。

## 实际分级与时间条件

| 状态 | 预算比例 | 默认触发点 | 主要动作 |
| --- | ---: | ---: | --- |
| L0 | <70% | <2.80 GiB | 正常运行 |
| L1 | ≥70% | 2.80 GiB /2867.20 MiB | 标记压力级别；coordinator不trim/驱逐 |
| L2 | ≥82% | 3.28 GiB /3358.72 MiB | trim无活动租约的上下文：清编译证明/部分快照/anchor memo，回收旧LS再创建空LS |
| L3 | ≥92% | 3.68 GiB /3768.32 MiB | 驱逐无活动租约的上下文、dispose LS/Program；释放闲置引用验证Worker |
| L3滞回出口 | <85% | <3.40 GiB /3481.60 MiB | 离开L3，再按当前比例判断L2/L1/L0 |

所以压力回收可在4 GiB之前发生。L3触发后降到3.5 GiB仍是L3；降到3.4 GiB以下才退出。
没有“连续超额N秒”或滑动平均判定：`memory-policy.ts:22`按当前样本及L3滞回标志决定。
`semantic-worker-runtime.ts:92`在**Worker事件循环**上每1000ms采样；mutation后、普通请求完成后、
异步references终态后也采样，部分准入检查会主动刷新。`readMemoryPressure`第446行和
`sampleMemory`第453行都读取`memory.rss`。

1秒是定时器配置，不是最坏反应时限：同步compiler/checker不返回时，该Worker上的定时器不能执行。
现有调用点刷新也不是每次V8分配前的检查。活动构建和短期峰值可以越过预算。
未开启metrics文件只是不落盘采样，**不关闭压力策略**。

## 回收对象、执行保护和恢复

调用链：Worker `sampleMemory`→`LegacySemanticEngine.applyMemoryPressure:116`→
`SemanticTypeEngineRegistry.applyMemoryPressure:460`→`SemanticCoordinator.applyMemoryPressure:122`。

- `semantic-coordinator.ts`的`#coldUnleasedContexts`只选择`leaseCount===0`的上下文，优先扫描槽，再按交互LRU。
  当前registry构造时`costAwareEviction:false`，不能把旧成本排序ADR当成当前执行策略。
- 在途同步语义工作通过`semantic-query-lease.ts:5`等持租约，finally归还；
  高压力不能直接dispose这个活动owner。**标签页打开本身不等于永久持租约**，空闲上下文即使有打开文档也可驱逐。
- L2：`type-workspace-entry.ts:158`→`typescript-language-service.ts:1637`→
  `registry-pool.ts:69`。清部分快照/证明，dispose旧LS并创建空LS；不终止主Worker，不承诺清空全部Host源码快照。
- L3：`semantic-coordinator.ts:202`→entry.dispose→`typescript-language-service.ts:1621`，
  结清LS并清脚本/输入/版本/成员等状态，从coordinator移除上下文。
  后续请求按当前文档权威内容重新创建owner/LS/Program，可能有重建时延。
- 共享SDK/标准库Registry pins可继续保留在主Worker，默认不强制global.gc。
  解除引用不等于RSS立刻下降，也不等于主Worker或整个Node进程已退出。
- **辅助Worker例外**：L3还会调用`reference-verifier-client.ts:26`的releaseWhenIdle；
  空闲立即terminate，忙碌则设retire，当前job finally后再terminate。下个job等待旧终止完成后可新建。
  这是保留SDK语法的串行引用验证Worker，不是主语义Worker。

### 首次初始化豁免

`coordinator/memory-policy.ts:27`在`initialPreparationActive()`时返回L0，仍采集真实RSS。
`ProjectReadinessLifecycle`→`InitialProjectPreparation.run`覆盖首次项目准备的调用域；
不是整个后台SQLite索引进度条的统一开关。一次正常返回的READY/partial/degraded准备消耗该豁免，
以后普通prepare/恢复不重新获得；抛错/取消尚未完成的首次尝试与完成尝试区分处理。
Worker重建通过父端已消费状态恢复，不能反复重启骗取压力豁免。
初始化仍受取消、关闭、新鲜度、截止监督及V8/系统资源限制；豁免不是无限可用内存保证。

## 整只主语义Worker的主动回收

`semantic-worker-runtime-control.ts:52`必须同时满足：

```text
ARKTS_BENCHMARK_CONTROL=1
ARKTS_L03_PRESSURE_WORKER_RECYCLE=1
```

未设置任一个都关闭。普通4 GiB压力策略不依赖这两个选项，不能把两者混为一项。
手动benchmark回收另要求`ARKTS_L01_SEMANTIC_WORKER_RECYCLE=1`，也不是默认生产入口。

即使显式开启，仍有这些约束：

1. `sampleMemory:464`实际因L3减少了residentContextCount，才发送pressureRecycle事件；
   仅RSS超额、没有可驱逐owner，并不产生该事件。
2. 父端`semantic-worker-recycle.ts:66`等待无在途请求，且proxy第162行要求无prepare及pending mutation。
   调用者不再等待/取消返回，不代表实际Worker命令已终态。
3. Worker `runtime.ts:190`验证既往L3驱逐、contextCount=0、leaseCount=0、无活动全局引用。
   当前默认相关策略开启时，如果压力已经恢复，会返回pressure-recovered跳过回收。
4. 真正替换先排空/停止旧Worker，等待实际exit；`semantic-worker-shutdown.ts`最多先等待1秒协作关闭，
   再await terminate。该1秒是关闭流程，不是内存持续超额窗口。
5. 重建重放已注册root、配置及最新未保存文档，处理并发mutation，旧世代不能发布结果。
   JS堆/Program不直接迁移，后续需要重新准备；不能承诺恢复零耗时。

## 故障监督和OOM不是4 GiB主动回收

父线程watchdog独立于Worker压力定时器：普通请求30秒、全局引用等120秒、准备/排队180秒、
mutation10秒及取消宽限1秒的默认监督触发的是**活性故障**，不是RSS阈值。
故障恢复受3次/180秒及连续自动恢复预算、250/500/1000ms退避和半开输入条件约束，
见`semantic-worker-failure-recovery.ts:77`及[ADR0020](../adr/0020-failed-semantic-build-recovery.md)。
正常L3上下文驱逐本身不换代，也不消费该故障恢复预算。

`semantic-worker-host.ts:205`创建Worker时没有设置resourceLimits；已安装launcher没有附加
`--max-old-space-size`参数。环境NODE_OPTIONS仍可能改变V8配置，必须按具体会话核验。
独立小进程探针清除其自身NODE_OPTIONS、不加载项目/SDK、不分配大内存，测得：

| Node | 主isolate/Worker总heap_size_limit | Worker默认old generation |
| --- | ---: | ---: |
| 20.19.5 | 4144 MiB | 4096 MiB |
| 26.3.0 | 4192 MiB | 4096 MiB |

这是新探针的结果，不是当前用户LSP已测堆上限。总堆含young等空间，与4 GiB **RSS预算**不是同一指标。
V8达到堆限制可能报Worker OOM或fatal abort；global OOM仍可终止整个Node，父监督也随之消失，
无法把它当成一次正常压力回收。某个Worker单独错误/退出而父进程仍存活时，才可能走受控故障恢复。
依据：[Node Worker resourceLimits](https://nodejs.org/docs/latest-v20.x/api/worker_threads.html#new-workerfilename-options)。
本轮没有制造OOM或真实4 GiB大内存负载。

## 日常安装与工作分支

本节实查Mac日常安装；本轮没有重新连接Windows核对其日常安装/活进程环境，不延伸为Windows运行版本证明。
2026-10-29T06:08:33Z只读进程快照：Zed PID44125及crash-handler44126；
**未发现该默认安装启动的LSP或原生索引进程**。因此没有当前LSP RSS/Worker heap或活进程env可核对。
Zed进程白名单env未见内存策略覆盖；用户settings无arkts LSP override，30K项目`.zed/settings.json`不存在。
Zed后续可能重新取得shell环境，不能把这些静态结果冒充下一次启动的有效env。
本轮没有替用户打开项目/启动语言服务来消除这个观测限制。
06:14:27Z收尾复查仍为相同Zed两个PID、默认安装LSP/native均0；初始快照保留在`process-config-initial.json`。

| 产物 | 日常安装 | 当前分支构建 |
| --- | --- | --- |
| release | `~/.local/libexec/arkts-language-server/0.1.0-local-beta.1-9814f859…7561e6c` | 当前dirty分支，未部署 |
| server SHA256 | `913efb35639b32bfb7cc978eac5aa8f6e654a8a96147c9acf2b3572b8c161665` | `2e3681cd222ea5ae2b7e99871a94106c2b1dda5680d43f0a36366f532b81bb11` |
| semantic Worker SHA256 | `77d318293de68f8701e108dd836790fac685e0eef9c87af7af8f273ef36377f0` | **完全相同** |
| server内置预算/压力回收开关 | 4096MiB及相同双开关条件 | 相同 |

扩展0.1.0-local-beta.1，release`eb601694…a18474b7`，WASM SHA256
`3776f76d011d2e3b2fafc5df67a6361558704107d51c9bbfa284b4889a5da774`。
安装目标来自实际launcher，不用README或旧报告猜测。安装没有可证明源码commit的manifest，
不把release内容指纹当Git SHA。工作分支相关内存策略源码对HEAD零差异，结论同样适用于该基线的这些路径。
Worker字节相同和server实际嵌入配置的核对足以确认策略一致，但不是一个不存在的活会话的加载证明。

默认server.log近期混入测试PID；仅凭该共享日志路径不能认定为日常Zed会话。
`installed-log-lifecycle.json`对此单独标注，结论以进程/launcher/产物证据分层。

## 测试与原始证据

- 本轮`Node20 --test tests/semantic/semantic-coordinator.test.mjs`：20/20通过，
  `coordinator-validation.log`，覆盖4GiB默认/override、L3活动lease保护、L2→L3、滞回及停止驱逐。
- 复用最终源码此前完整check:fast2092/2092的公开LSP证据：
  `.bench/index-cache-lifecycle-20261029/check-fast-final-node20-v4.log`；
  两个压力回收开关各自缺失时主Worker始终1个、开启后真实换代且未保存结果正确、
  首次1MiB预算豁免及故障恢复不续豁免均已通过。行号摘录`existing-lsp-and-policy-evidence.json`。
  低预算夹具证明控制机制，不当作生产4GiB满载稳定性测试。
- `identity.json`：源码/安装路径、哈希、配置、阈值。
  `process-config.json`、`zed-settings.json`：当前进程及白名单配置。
  `heap-limit-probes.json`及`heap-limit-probe.cjs`：两版Node的小型堆上限观测。
- 2048MiB豁免仅为此前驱动的`SOAK_IGNORE_NODE_RSS_GUARD=1`，原`SOAK_NODE_GUARD_MIB=2048`保留，
  见[原报告](2026-10-28-three-soak-defects-final-verification.md)第104行起。
  它不修改`ARKTS_MEMORY_BUDGET_MB`、Worker回收双开关、V8上限或当前产品策略。

本轮未改任何产品状态；若需要判定某次真实“超过4G后退出”，须对齐该次活PID/世代、有效env、
pressure-recycle.complete、unresponsive/recovery或fatal OOM/退出证据，不能只靠RSS相关性定因。
`verification.json`确认此前51份工作树文件SHA256均未改变，本轮仅新增此报告及隔离调查证据。
