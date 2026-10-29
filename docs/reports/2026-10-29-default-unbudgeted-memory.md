# 默认无 RSS 预算：实施与验证

交付阶段说明：本文保留首次验证阶段的状态与证据；后续维护者授权的提交/PR合并及补充检查见
[合并候选验证](2026-10-29-cache-rss-merge-validation.md)。该授权不包含日常部署或删除真实缓存。

日期：2026-10-29。父提交 `9d47e550ee7c0a3ba9e0e889f62e04bb9fd4a78a`，
分支 `feat/index-cache-lifecycle-20261029`；包含既有未提交索引缓存治理工作树。
当前候选未提交、push、合并、发布、部署；未重启或停止用户Zed/语言服务。
[决策ADR0029](../adr/0029-opt-in-rss-memory-budget.md) ·
[TDD逐片记录](../tdd/2026-10-29-opt-in-rss-memory-budget.md) ·
[先前只读调查](2026-10-29-memory-pressure-and-worker-release.md)。
原始证据：`.bench/default-unbudgeted-memory-20261029/`。

## 行为变化

维护者明确优先功能可用、响应快和稳定性，其次才是低内存。
本候选取消产品默认固定RSS预算及由它自动触发的降级/驱逐，没有改成更大的固定值、
系统可用内存百分比、默认TTL或另一个Program数量阈值。

| 配置 | 实际含义 | RSS触发的自动动作 |
| --- | --- | --- |
| 未设置`ARKTS_MEMORY_BUDGET_MB` | `defaultMemoryBudgetMiB:null`，`memoryBudgetBytes:null` | 分类始终L0；不trim/驱逐，不因RSS拒绝完整请求或改用临时诊断，不发压力Worker替换事件 |
| 显式正数，如`4096`或`768.5` | 正数MiB，向下取整为安全的正数字节数；4096MiB=4GiB | 保留既有L1/L2/L3及滞回、活动lease保护和首次初始化豁免；不是RSS硬封顶 |
| 空串/空白、0、负数、NaN/Infinity、off/null、小于1字节或超安全整数 | 配置错误 | 不悄悄改成无限或退回4GiB |

环境变量在创建Worker的runtimeConfig时读取；删除变量并建立新会话才能取消已有显式配置。
本轮没有改变已启动服务。日常Zed安装仍是此前调查记录的旧产物，不能把工作树行为归于它。
产品代码只改3文件：

1. `config/semantic-runtime.json:5`：默认预算由4096改null。
2. `src/semantic/coordinator/runtime-config.ts:16`：类型和显式值转换/校验，null直接传给Worker。
3. `src/semantic/coordinator/memory-policy.ts:22`：null直接返回L0并解除旧L3 latch；数值分级逻辑保留。

调用链：`semantic-worker-host.ts:46 semanticWorkerData` → runtimeConfig →
`semantic-worker-runtime.ts:446 readMemoryPressure / :453 sampleMemory` → `levelFor` →
`type-engine.ts:461 applyMemoryPressure` → coordinator。L0不进入L2 trim/L3 eviction；
L3才会释放闲置引用verifier、推进pressure epoch，或在额外实验开关开启时请求主Worker压力替换。
采样定时器与RSS/heap遥测保留，仅观察不等于预算。
RSS口径仍为整个Node PID一次，不叠加其Worker线程RSS；独立Rust索引PID不在预算内。
依据Node官方[process.memoryUsage](https://nodejs.org/docs/latest-v20.x/api/process.html#processmemoryusage)，
已通过Context7在前述调查核验。

## 没有取消的保护与回收

- `maxResidentContexts:null`原本已无默认数量上限，本次没有加新的隐性数量驱逐。
  稳定语义组身份不随普通内容版本或请求递增；合法新组/更大依赖可能需要更多真实状态。
- 配置/SDK域切换：`type-engine.ts:166/173`仍dispose旧coordinator/owner，旧状态不永久挂在新域。
  请求正常结束、失败、取消释放lease；项目/会话关闭仍dispose。
- Worker `dispose`（`semantic-worker-runtime.ts:482`）清定时器、engine和ownership观察；
  engine的verifier/coordinator dispose及既有Registry所有权结清均保留。
- 单个主语义Worker、重型任务串行、单一终态、输入证明、取消、绝对截止时间、
  故障恢复预算/退避/熔断、旧世代隔离与既有有界memo未修改。
- Node/V8堆上限、用户Node参数及系统OOM机制未改；仍需如实暴露真实OOM/崩溃。
  [Node Worker resourceLimits](https://nodejs.org/docs/latest-v20.x/api/worker_threads.html#new-workerfilename-options)
  说明其也不能保证进程不会因全局OOM退出。取消产品RSS预算不是OOM修复证明。
- ADR0028磁盘索引缓存治理保留，和RSS/旧release清理是独立生命周期。
  本轮无Rust修改。前一缓存候选51个dirty文件中49个逐字节保持，另外2个README/ADR目录
  仅增加本政策说明，收据`preceding-work-preservation.json`。

## TDD与对照结果

父版本产品代码在同一受控8GiB RSS、无环境预算条件下，公开LSP返回degraded与
`resource-budget-exceeded`；见 `default-public-red.log`。最小实现后READY。
显式4096MiB同一输入仍在首次准备完成后L3驱逐并报告预算退化，证明不是吞错或删除显式保护。

Mac Node20.19.5，pnpm8.15.9，私有2文件ETS/SDK API24-test fixture、真实打包server/Worker、
原生sidecar SHA `f081d507b45ae99bac44450d9273db3b7f4752b196f95ab188ae622387421ba0`。
SDK为可控最小输入，非Photos真实SDK。完整SHA见 `candidate-identity.json`。

- `coordinator-final.log`：21/21 PASS（配置、无预算大RSS、旧滞回退出、显式压力与活动lease等）。
- `public-budget-and-reuse-v2.log`：所选3/3 PASS，9项名称筛选未运行；不作为全文件通过。
- `typecheck.log`与`manifest.log`：退出0；测试清单仍267个entry，没有靠排除旧用例通过。
- 初次混合测试的rename期望错误完整保留在`public-budget-and-reuse.log`；
  从import本地绑定重命名会合法添加别名，改为从声明发起后精确验证全局编辑，没有改产品语义。

无预算混合串行6轮，每轮编辑新增未保存调用、重复查询、撤销、关闭/重开，合计217请求。
定义位置、完整引用与重命名全部位置/文本、补全/详情与最新overlay均有断言。
每个未变化输入的重复查询Program/输入身份不变；owner始终1，主Worker创建1次，
未出现memory-level2/3事件；末次lease与verifier任务均0，shutdown/exit正常。
这证明没有由本RSS策略造成按请求反复驱逐；普通编辑本来就允许增量更新Program，不要求永远同一对象。

| 操作 | 次数 | 中位数ms | 最大ms |
| --- | ---: | ---: | ---: |
| `arkts/semanticReadiness` | 31 | 12.64 | 22.19 |
| `completionItem/resolve` | 31 | 14.84 | 46.41 |
| `textDocument/completion` | 31 | 26.02 | 77.18 |
| `textDocument/definition` | 31 | 30.45 | 68.10 |
| `textDocument/hover` | 31 | 13.65 | 18.13 |
| `textDocument/references` | 31 | 14.55 | 35.88 |
| `textDocument/rename` | 31 | 15.66 | 25.94 |

该表为普通协议计时外加RSS测试输入及metrics记录的私有小夹具，不能外推30K项目性能。
8GiB只是决策输入，未实际分配；Worker启动时真实Node RSS约52.11MiB。
metrics中的heap为真实Worker isolate：开始约46.15MiB，末次约88.68MiB，
包含构建/循环分配，未执行强制GC或稳定期测量，不据此宣称泄漏或无泄漏。
逐请求、Program身份与原始首/末metrics见`public-mixed-evidence.json`。
500ms是允许波动的体验目标，无新增硬门禁。

## 最终完整检查与跨平台

`check-fast-final.log`：最终候选完整 `pnpm check:fast` **2096/2096 PASS，exit0**；
失败/跳过/取消/TODO均0，Node测试阶段3239841.38ms（约54分钟）。
输入和server/Worker/native产物逐项SHA在全程保持不变，`check-fast-receipt.json`记录最终收据。
完整检查包含既有索引缓存CLI/隔离、公开正确性、取消、故障恢复、配置重放及新增预算回归，
没有用之前的局部通过代替此次完整检查。
Windows10.0.19045.0 / Node20.19.5独立源码副本：21/21协调器、3/3所选公开预算/复用回归PASS；
另外9项名称筛选未执行，不算全文件/全量Windows通过。217次混合请求，owner1、Worker创建1次、
末次lease/verifier任务0。原始 `windows-results/{coordinator,public-budget-reuse}.stdout`、
`results.json`（原始UTF-16）、`results-utf8.json`、`mixed-evidence.json`、`mixed-summary.json`。
隔离位置 `D:\DevSetup\diagnostics\default-unbudgeted-memory-20261029\source`，SDK同私有夹具；
复用了未修改的native SHA `c2dcb9372753bf3f1daf9c11dec478ca856bbbe678871caa4bdbce3738832bb1`。
关键产品源码、用例和preload SHA与Mac一致，Windows重新build，实际server/Worker哈希单独记录在收据；
不把不同平台bundle哈希不同写成相同产物。编译器4.9.5-r10的源码/包与esbuild0.25.9包SHA两端一致，另存`dependency-identity-comparison.json`。
没有安装到用户扩展或操作用户Zed。

Windows小夹具操作分布如下，与Mac一样不是30K项目性能承诺：

| 操作 | 次数 | 中位数ms | 最大ms |
| --- | ---: | ---: | ---: |
| `arkts/semanticReadiness` | 31 | 30.64 | 33.94 |
| `completionItem/resolve` | 31 | 45.81 | 58.65 |
| `textDocument/completion` | 31 | 50.03 | 108.88 |
| `textDocument/definition` | 31 | 61.97 | 131.18 |
| `textDocument/hover` | 31 | 31.94 | 35.69 |
| `textDocument/references` | 31 | 33.51 | 56.16 |
| `textDocument/rename` | 31 | 34.40 | 41.80 |
另补两项Windows独立生命周期诊断，`windows-results/lifetime.stdout`：2/2 PASS，无skip。
复用既有`failed-semantic-build.cjs`观察实际compiler createProgram与Registry引用，
另加受控RSS输入；这些插桩计时不混入上面的普通协议时延表。

| 阶段 | 累计createProgram进入/成功 | 项目Registry引用 | SDK引用 |
| --- | ---: | ---: | ---: |
| 完成初始化 | 1/1 | 2 | 2 |
| 首次打开定义 + 20次热定义 | 1/1 | 2 | 2 |
| 普通内容编辑后首次定义 | 2/2 | 2 | 2 |
| 再10次热定义 | 2/2（断言未增加） | 2 | 2 |
| 配置切换退役旧owner | 2/2 | 0 | 1 |
| 同会话重新准备 | 3/3 | 2 | 2 |
| 正常shutdown | 3/3 | 0 | 1 |

SDK=1是现有共享SDK缓存的pin，不是失效LS项目引用；Worker退出结束该isolate所有权。
不要求RSS立即下降来证明释放。原始`actual-program-lifetime.json`含状态/事件，
这比只看公开generation或进程未崩溃更直接。

连续3次snapshot构建异常后，attempts=1/2/3、completed=0，项目引用每次都是0；
未编辑/未配置推进的第4次构建成功READY。随后注入一次`exit-idle`（fixture明确exit17，非真实OOM），
同会话替代Worker创建后精确跳转、完整准备恢复READY；主Worker创建总数2、恢复完成1，
配置切换再清项目引用至0。原始`failed-program-lifetime.json`、`lifetime.stdout.utf8`。
因此取消默认RSS压力不取消失败lease结清、同版本重试或有限故障恢复。
这些是受控故障回归，不能证明30K现场OOM或同步不返回已解决。
诊断脚本`budget-lifetime-diagnostic.mjs`放在Windows隔离候选根，
完整执行命令/环境见同证据根`windows-lifetime.ps1`；本地脚本副本也保留用于复跑。

Mac/Windows真实30K Zed UI、实际>4GiB工作集与长时内存斜率，本次未重测。
不以合成RSS或此前协议长测冒充真实UI/真实大内存稳定通过。
455文件冷目录3秒性能门槛按维护者既有授权跳过；其历史失败证据保留，不标成通过。

## 复现命令与剩余限制

```sh
node scripts/build-runtime.mjs
node --test --test-concurrency=1 tests/semantic/semantic-coordinator.test.mjs
node --test --test-concurrency=1 --test-name-pattern='RSS budget|no RSS budget' \
  tests/semantic/project-initialization.test.mjs
pnpm check:fast
```

为匹配本次计时使用Node20.19.5；首条命令构建当前工作树，测试自动创建隔离缓存与SDK。
Windows部署脚本/独立source路径/构建身份保留于同证据目录，支持再跑，不改日常安装。

合法工作集可比以前保留更多内存，没有产品RSS封顶；V8/系统仍可能OOM。
30K完整引用/重命名的规模边界、SDK不完整/超时、原生索引内存与全量替换慢等既有问题
仍是独立限制；本次没有放宽规模/超时、截断结果或声称修复这些问题。
旧的无关缓存性能TODO继续暂缓。

本轮预算源码与测试均不超过500行。既有缓存治理改动中的超限迁移债务继续记录：
`crates/index-sqlite/src/lib.rs` 1695行, `crates/index-sidecar/src/main.rs` 712行, `tests/semantic/references-depth.test.mjs` 804行；本轮这些文件逐字节未改。
