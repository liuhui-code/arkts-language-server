# 2026-10-31：编译器源码命名空间恢复修正版验收

> 合并准备说明：远端先合入PR #109（8c0f38d），使用ADR0034记录私有catalog发布。
> 本轮未提交的导航提案因此从实验编号0034改号[0037](../adr/0037-navigation-work-and-input-validation.md)，0035/0036不变。
> 下列2160项及30K测量固定在04282ed父提交和e2a30dd0候选；其中原生索引并不包含PR #109，
> 不将旧数据冒充集成后版本。集成后的检查/CI与合并身份另见PR收据；本报告的“未提交/未合并”为采样时状态。
> Linux CI 的夹具失败及确定性 RED/GREEN 修正见[集成记录](../tdd/2026-10-31-navigation-integration.md)。

## 当前状态

修正版公开定向26/26通过，完整`pnpm check:fast`2160/2160通过，0失败/取消/跳过/todo、exit0。
最终30K三轮交替对照，以及根目录、phone/picker模块两份混合短测均已在完整检查后串行完成。
真实UI仍受Windows连接和Mac辅助功能权限阻塞，不能以协议替代。

## 身份及历史失败

- 分支`fix/navigation-request-work-reuse-20261030`，HEAD `04282ed34ebab7cd01726bb0291af53bd278ff00`。
  保留未提交ADR0037/0035及其他现有工作；没有提交、合并、push或日常Zed部署。
- 最新证据`.bench/nav-input-recovery-v2-20261031/`，805输入的哈希及`source/`副本，冻结`candidate/dist`。
- server `2841a8263fb5acbf74f25b55e0eff640d82f4618c5efc24fd73da9922ebd79ae`。
- Worker `e2a30dd0ab83ad81c25c146d3315aa4ad7666d5a10b7e57e1ae468953b91a3c0`。
- Mac26.6.2/x86_64，Node20.19.5，实际pnpm8.3.1（仓库声明8.15.9）。
- SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，API24/6.1.1.125；3956相关输入冻结。
  实际ohos-typescript4.9.5-r10，typescript.js SHA
  `af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`。

原始NAV-INPUT-001 RED、13e90ee7中间候选、其30K短测及完整检查失败保存在
[历史实施报告](2026-10-31-compiler-namespace-recovery.md)和`.bench/nav-input-recovery-20261031/`。
13e90ee7在已知源码读回归出现5项失败后主动中止，1796.325秒、exit1；不是完整跑完，未执行尾段保留。
其69响应一致/局部恢复不能使这个候选合格；旧计时不得冒充e2a30dd0的新计时。
中止的测试进程组无残留，后继脚本因该失败未运行。

## 根因和最终实现边界

原NAV-INPUT-001是compiler私有负查找证明遗漏恢复所有权：创建动态import类型依赖后，
保留的空目录证明过期，但package resolver自己的证明未变；只检查后者不会推进代次，持续-32803。
修复应拒绝当前过期请求，并让后继显式请求实际重载，不依赖watcher必达或Worker重启。

扩大回归发现来源标签还不够：400份filler后的ZZModel由原LS持有正向源码事实，
已通知body delta进入后，readiness在权威源码读安装之前先核验该旧事实。
13e90ee7把这个内容变化也当作namespace退休，context2≠1，四个读窗口注入没机会执行。
独立原6项再次1通过/5失败，证明不是完整测试间污染；原断言未修改。

[ADR0036](../adr/0036-compiler-source-namespace-recovery.md)在原ADR0025/0019/0005/0010及0037/0035约束内补齐：

1. 记录实际来源及原加载时regular-source类型；仍为常规源码的正向变化留给原delta/snapshot稳定读，
   包括失败读槽、读中变化及独立终检，不提前退休LS。
2. 只有可证明的创建、消失、目录/type变化才申请namespace恢复；identity不可读不算资格。
   仍须其他所有事实当前，词法/物理workspace内且SDK双域排除；SDK/选择配置旧证明不能搭便车更新。
3. 现有resolver代次同步废弃解析元数据及旧消费者资格，命令admission记住rebase；本次请求仍拒绝。
   下一请求按原closure/membership代次和coordinator未借出lease退役点重载，旧witness不能退休新epoch。
4. 健康查询及已观察普通body delta不走这个恢复；不清SDK Registry/索引/所有结果缓存，不改RSS/V8/超时/规模阈值。

相对13e90ee7只修改`src/project/loaded-configuration-witness.ts`；实现338行。
其他ADR0036调用点及ADR0037/0035优化保留。历史9份相关ADR原文未改；源码/运行时receipt独立记录。
仍使用现有有界共享resolver域，namespace重载有保守成本；不宣称已是逐import精准失效。

## 回归与检查收据

```sh
pnpm build
node --test --test-concurrency=1 \
  tests/semantic/changed-source-read-witness.test.mjs \
  tests/semantic/unnotified-import-type-recovery.test.mjs \
  tests/semantic/resolution-namespace-lifecycle.test.mjs
pnpm check:fast
```

`known-source-red.log`6项中5失败；`known-source-and-namespace-green.log`26/26。
包括真实输入改动、真实公开协议，以及明确标注的读中故障注入；不把注入当自然现场。
完整检查`final-check-summary.json`：2026-10-31T03:22:13.329Z至04:20:02.423Z，
3469.048秒；Node测试体3460375.495ms、2160/2160、1 suite，0失败/取消/跳过/todo、exit0。
805源码/测试/脚本/配置输入零差异。此为e2a30dd0新收据，未沿用旧版2152或13e90ee7定向42项。

## 30K与真实UI

后继串行驱动`after-check-replays.py`仅在本修正版完整检查exit0后执行：

- 原Photos隔离副本30000源码，原7份overlay/64不同method+位置，前版ADR0035与新候选各3轮。
  逐份69完整响应比较，记录分方法/各轮分布、排队、Program、RSS/heap/native及正常关闭。
- workspace根的独立动态类型夹具，6轮无通知创建/删除、编辑撤销/关闭重开/补全详情/空闲恢复。
- `product/phone/src/main/ets/picker`实际模块内相同生命周期，交替number/string且声明行号递增，
  精确检查hover、定义URI/range及补全详情的类型和textEdit，避免旧AST碰巧返回相同位置也通过。

两份附加夹具实际源码30001/30002，原30000份源码不修改，结束清理测试新建目录并校验原源码。
每份都是单独短会话，不累计为正式耐久；两份分别98.619秒、91.184秒，不能合称一个连续会话。

### 最终30K时延与结果

三轮每轮69完整响应逐字段一致，旧/新合计414功能响应；每轮原有完整范围错误仍是错误。
固定旧UI请求驱动，不改文件/符号/位置/7份overlay/64不同查询key；没有并行仓库测试。
下表生命周期为三轮中位与最大；突发中位是三轮各64样本中位的中位，最大为三轮总最大。

| 操作 | 前版中位/最大ms | e2a30dd0中位/最大ms |
| --- | ---: | ---: |
| 语义初始化通知 | 11754.618 / 11976.174 | 11745.608 / 12329.009 |
| 首次局部定义 | 72.029 / 74.244 | 70.426 / 73.257 |
| 热重复定义 | 61.560 / 62.524 | 60.264 / 61.065 |
| 编辑后定义 | 314.353 / 377.875 | 305.264 / 305.728 |
| 撤销后定义 | 310.484 / 312.787 | 314.849 / 316.050 |
| 同内容关闭重开后定义 | 164.209 / 171.941 | 165.691 / 166.158 |
| 64不同有效请求突发 | 1982.735 / 3811.389 | 1957.068 / 3783.785 |

这未证明突发成本改善，微小差异不能当作优化收益。新版parent admission→send中位1878.074ms、
最大3702.501ms；Worker receive→dispatch中位0.129ms、最大0.689ms。
主要可测等待在父端单一同步消费者串行准入；该区间还含准入/状态/屏障工作，不全称纯排队，
剩余时间不是独立测得的checker耗时。受控FIFO及method/URI校验关联每个ID，限制见每轮`burst-stages.json`。
64个不同且未取消的合法请求不能被服务端latest-wins丢弃；60取消/4保留的公开回归已包含于全量2160项。

两份动态依赖短测各78记录动作/64公开请求：各51份当前成功结果、11份预期保护性-32803、
2份全量引用/重命名已知限制-32803，不把错误算成功。各6轮创建、6轮删除都能在后继查询恢复；
每份1Worker/0换代，13context创建/12次resolution-generation-change退役，退役时leaseCount均0。
模块内返回类型依序number/string/number/string/number/string，定义行号依序1–6；
补全详情同样为当前类型，textEdit精确为Main零基2:31–2:36的value替换，不是仅检查label。

| phone/picker模块操作 | n | 中位ms | 最大ms |
| --- | ---: | ---: | ---: |
| 创建后后继恢复 | 6 | 3097.481 | 3105.624 |
| 删除目录后后继查询 | 6 | 3084.529 | 3153.856 |
| 恢复后定义 | 6 | 78.636 | 91.694 |
| 补全列表 | 6 | 66.949 | 122.782 |
| 补全详情 | 6 | 37.708 | 77.525 |
| 未保存编辑后hover | 6 | 161.457 | 196.118 |
| 撤销后hover | 6 | 150.811 | 156.877 |
| 关闭重开后hover | 6 | 30.474 | 32.388 |

模块场景另有一次删除后的首请求3324.925ms，结果正确；paired请求及后台诊断会影响“哪个请求承担重建”，
不能只挑后继行隐藏它。根目录恢复中位3091.692ms/最大3158.205ms，删除后3103.502/3182.687ms。
这解决持续拒绝，不解决保守域重载的约3.1秒成本。更细扫描/读取/解析/分批计数本次未独立插桩，
不能从这些总数推断具体热点占比或渐进复杂度，也未新增递增规模实验。

语义初始化complete仍为degraded/project-membership-incomplete，不能称全局READY。
原请求典型Program505文件=108项目+284SDK+113其他、roots110；模块夹具Program371=2项目+256SDK+113其他、roots3，
均不等于磁盘30000/30002文件全部进入Program。grouped build事件不是实际构建次数；跨owner解析次数未单独测。

### 资源、索引及最终身份复核

phone/picker单会话采样峰值Node RSS974204928字节、Worker heap834496568、native RSS3712057344、
单样本进程树RSS和4634255360。根目录分别932270080、795480024、3712753664、4619096064。
Worker heap属于Node PID，不另加RSS；各项峰值不必同一时刻，树RSS和不是PSS。
两份资源保护均无事件，正常shutdown/exit0，无自有native残留；不凭短会话/RSS回落断言长期无泄漏。
只测本测试进程，未采Zed交互资源。产品内存/V8/截止时间未变，测试无固定2GiB/4GiB停止线。

两份索引最后都为99%、30001/30001，无progress end；会话正常关闭，未证明永久挂起、崩溃或完整提交。
这是保留的索引限制，与语义初始化通知和Worker生命周期分开。

`final-audit.json`：805当前输入及805保存副本、3956 SDK输入、原30000源码均零差异，新增probe已清理，
冻结83文件全部未变；当前75个build-runtime声明产物与冻结版本逐字一致。
目录另有测试/辅助产物，其中harmony-project-model、project-resolver、sdk-discovery三个driver被各自测试重建。
初版审计误把前两者视为产品差异而失败，原`initial-final-audit.*`保留；经实际entryPoints、标准库清单、
测试buildSync来源及src无引用核实后，审计区分所有权，未恢复文件或修改产品断言来换通过。
其他未声明文件如有变化仍拒绝，三个driver不参与实际LSP/Worker入口。最终审计exit0。

复现与逐次证据：`run-serial-verification.py`、`photos-namespace-session.mjs`、
`photos-module-namespace-session.mjs`、`candidate-source-freeze.json`/`source/`、
每会话`operations.ndjson`/`client-wire.ndjson`/`stdout.raw`/`logs/server.log`/`worker-memory.ndjson`/`process-resources.ndjson`。
分轮/分方法p50/p95/p99及最大见`comparison.json`，模块与资源见`module-and-resources.json`，
由`analyze-results.py`及`analyze-module-and-resources.py`复算。结束状态`post-check-replays-complete.json`exit0。

Windows初轮两次及修正版复查SSH192.168.31.14:22均超时；Mac沙箱外辅助功能复查仍false，
Zed窗口访问被osascript拒绝（初轮-1728，修正版count windows复查-25211）。
本轮证据`windows-connectivity.log`、`macos-ui-permission.log`、`macos-zed-accessibility.log`；
继续UI需要恢复Windows连接，或在系统设置→隐私与安全性→辅助功能
允许当前自动化宿主/对应终端。未绕过权限、未关闭用户窗口或丢弃编辑。

64有效请求的排队、未知namespace保守重载、native99%、既有SDK超时及30K完整引用/重命名缺口
仍须如实单列，不用局部恢复关闭这些问题。500ms仅体验目标；455冷目录3秒独立门槛沿用用户授权未执行。
