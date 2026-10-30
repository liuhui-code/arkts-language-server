# Windows Zed 30K 继续真实 UI 压测

结论：**部分功能验证通过，仍有产品缺陷；预定约60分钟的正式循环未完成，原始终态保留 FAILED。**
本次使用真实 Windows 桌面、Zed 窗口和 ArkTS 扩展，没有合成 LSP 用户请求。
正式混合负载持续 **53分27.386秒**，完成79组宏操作，第80组因测试驱动错误停止。
没有观察到 OOM、Worker退役/重建、重复响应或整机保护停测；不能据此宣称长期稳定或所有功能通过。

[执行计划](../plans/2026-10-30-windows-zed-ui-endurance.md)；[前轮修复报告](2026-10-30-windows-ui-fixes.md)。
前轮33分钟、协议长测与本次时长分别记录。

## 输入与运行身份

- 父提交 `4859f76c46265a885332d7141c99698bf749c61e`，分支 `fix/windows-ui-completion-navigation-recovery`。
  Windows固定候选 `4859f76+working-tree-66495b5c0a31fc36`，不是已合并的新main。
  overlay ZIP SHA256 `66495b5c0a31fc369d9d71dece9e61565d41d1d80c9f6da1524e697023303979`。
- 独立根 `D:\DevSetup\diagnostics\zed-ui-endurance-20261030`；project为真实Photos 30K副本，
  原30287项目文件逐文件核验、30000源码。结束仍30000源码，唯一额外文件是测试私有 `.zed/settings.json`。
- SDK `D:/DevTools/sdk-declarations/openharmony-api24-6.1.1.125`，API24声明1580文件前后SHA一致；
  未安装完整DevEco工具链，`@ohos.uiExtensionHost`缺项保持原状。
- Zed1.25.3 / `8dd255c3eafb5231056fe4e6f601cedd011f1c93`，Node20.19.5；WTSActive/Default交互Session5。
- ArkTS扩展 `0.1.0-local-beta.1`，wasm `d311ff6ea43914aaa8ff2de1ad5ed817da64c958fe055e2f08e2b627bf8e79a8`；
  grammar `700dc7496fcd9ed29ce4a0c68b98d9380b89e738f410edf596cf1f8dbe03a7b1`。
  私有launcher `ab16bda3d03bc67676949fed0c898bdb84eaacb6c2fde420c65c97b5bd1b8c7d`，核验但未调用；
  binary override经过被动stdio观察器，不代表默认安装激活路线通过。
- Zed PID1296→relay22388→server9708→native8180；语义Worker thread1。
  Windows六项运行产物前后哈希一致，见final-metadata/installation.json和input-audit-final.json：

| 产物 | SHA256 |
| --- | --- |
| server.cjs | `6c99b6e8184253a848a72a7384cdd2f631cf3320740dd12df163ae485a6d1324` |
| semantic-worker.cjs | `8cec9b49b3ed7b68a172ac7069fa375bbe3f9021f0c6d9de3445461255eb1ab2` |
| reference-verifier-worker.cjs | `26f6ca26c14e55e4db55fcd1473a9db2864d9838e500a318a666b86045b3592f` |
| native exe | `9fe04072d48cd29f4bb0f287ed4f18dc102590454bf1e410a44dc63f154fbf4d` |
| semantic-runtime.json | `7a6b6c7af7ad332ef93959143916657dd66d35cec0a01036fb661e259e53ff85` |
| standard library | `d6e26a09136c533dccdeff3a0af436ebd257e6b8dc7f55a2743b5744d3a79cba` |

本地工作树在长测期间另有修改：基线15份源/测试中watchdog、overlay-save测试及两份测试manifest最终SHA变化。
未将这些修改部署到本轮Windows候选，也未回退它们；source-identity-before/after.json保存差异。
先前fast2103/2103和Windows新增7/7只是固定候选的历史验证，不冒充本轮重跑或覆盖后来的本地修改。

## 实际执行与停止原因

下表时间为UTC；北京时间加8小时，日期为10月30日。

| 阶段 | 开始—结束 | 实际结果 |
| --- | --- | --- |
| 私有窗口/输入审计 | 窗口17:40:10；审计17:38:59—17:40:08 | 审计后才输入；OS文件缓存未控制 |
| server/Worker启动 | 17:44:30.301 / 17:44:30.430 | 固定server9708/thread1 |
| UI校准 | 17:45:57.231—17:47:33.380 | 4宏/144命令；不代表全会话零错误 |
| 正式混合循环 | **17:49:17.334—18:42:44.720** | **53分27.386秒；79完整宏，第80宏驱动断言失败** |
| 停止后诊断 | 18:49—18:54 | 先封存，再做第二次Redo对照及恢复；详情专项未完成 |
| 正常关闭 | 18:55:50.485 | 全部活动overlay与磁盘相同，仅向自有窗口发WM_CLOSE |
| 所属进程复核 | 18:56:00.359 | Zed/relay/server/native/agent全部退出，无其他所属服务进程 |

正式3923条驱动命令中，实际输入 **2483批次**（1688按键、374点击、421文本输入），25966字符、387截图，
52个分钟桶有实际输入。宏、命令、输入批次和LSP请求不能混称点击次数。
20个原文件/副本跨模块，主要热点Log.info，另有genAlbumsInfo和ScreenManager.getInstance，
不代表20个独立依赖闭包或所有项目符号。PRNG seed202610305339；agent旧静态seed标签不参与随机数，差异保留在seed-provenance.json。

第80宏 `AlbumGridItemNewStyle__copy_027.ets` 原失败是**驱动假设错误**：v46插入换行，v47–67输入
`// UI30K undo redo 80`；两次Undo分别删除注释(v68)、换行(v69)，一次Redo(v70)只恢复换行。
封存后第二次Redo(v71)精确恢复完整注释，再两次Undo并保存(v73)，overlay与原磁盘SHA一致。
截图与输入增量相符，未发现此处LSP文档丢字证据。原formal-result.json不修改为成功，也不补算满60分钟。

详情专项v1因驱动 `.NET SendWait('^{SPACE}')` 无效失败；修正按键表示的独立v2在第2命令被焦点保护拦下：
前台PID4872为系统SearchApp，尚未发补全调用。未争夺用户前台，也不归为Worker故障；SearchApp获得焦点原因未证实。
14个不同符号导航及6个非成员补全上下文仅准备脚本，**未执行**。

## 覆盖及功能结果

| 场景 | 正式执行及校验 |
| --- | --- |
| 阅读/跨模块/快速取消再查 | 7阅读宏、7快速宏；78次目标URI/符号行定义断言和3次genAlbumsInfo断言正确 |
| 原失败保存/撤销 | 7宏：4次原Picker注释补全合法空结果；3次Album编辑保存撤销再保存、跨文件定义正确 |
| 补全/接受 | 13宏，Log.debug选择/Tab插入/恢复正确；**详情另判，见WUI-004** |
| 关闭/重开 | 7宏，开放overlay和外部磁盘修改交错，关闭回退/重开及14次依赖定义正确 |
| 诊断新鲜度 | 7次当前版本2322出现、7次撤销后清除；保留原SDK诊断 |
| 撤销/重做 | 6宏精确恢复；第7次因上述驱动事务假设停测，不算通过 |
| 项目树移动/恢复/删空目录 | 6宏物理路径/SHA正确，18次后继ScreenManager定义正确 |
| 标签/空闲 | 6宏标签批次切换关闭，6次45–90秒空闲恢复、目标检查正确 |
| 全量引用/实现/incomingCalls | 各7次，**全部完整性错误**，不算成功 |
| 重命名/outgoingCalls/不同SDK及内置符号专项 | 未执行，不从热点成功外推 |

外部磁盘写入明确标记uiAction:false，不伪装UI动作。全量范围失败后仍检查后继局部功能，不排除失败样本。
正式6508请求、6508终态、0重复、0未结：5719无协议error、789有error。
其中751份-32800均有终态前真实客户端取消；余下17份SDK位置定义-32803、21份全量范围错误。
正式1279个请求有取消通知，但部分晚于已产生终态，不把通知数当故障数。
**无error不等于语义正确**：487份详情只给通用描述。

## 新确认：WUI-004 补全详情相互取消

正式510次completionItem/resolve：**23份签名增强，487份仅TypeScript method static等通用描述**。
487份在列表出生、请求、响应时文档生命周期/版本均相同，没有终态前的客户端取消。
同区间父日志23次ok/487次superseded，数量吻合；完成日志无LSP ID，不伪称逐ID唯一配对。
截图 `snapshots/formal-1793296157334-completion-details-15.png` 实际选中debug仍为通用描述，同列表d有真实签名。
接受候选成功、result非空不能代替详情正确。

相关调用链：

1. `src/lsp/register-completion.ts:60`查当前item；`:73`调用通用runner，未带item身份。
2. `src/lsp/semantic-request-runner.ts:111`的lane为`${method}:${document.uri}`，`:127`开始最新请求。
3. `src/lsp/request-freshness.ts:41`的start在`:46–49`取消同lane全部前请求，**不同有效item也相互取消**。
4. runner`:166–168`记录superseded并回退null；register-completion`:89`返回原通用item。

Windows例：列表294于17:50:14.032Z产生；resolve301(e)、302(e)、303(error)…交错，
302在301应答前进入、303又在302应答前进入，期间未编辑、没有这些ID的取消。
这与编辑器预取多个详情冲突，不是SDK缺项或所有缓存失效。

独立最小**Mac公开stdio**对照：两个有效item串行均有签名；无编辑/取消的并发请求，第一个变通用、第二个有签名。
原一次RED及后续固定辅助Mac产物的3次串行运行均同样RED，串行控制均通过。
Mac Node26.3.0，server b2dcee6c…/Worker08f48ad3…与Windows不同；前后完整SHA见concurrent-details-mac-repeats.json，
不混称Windows UI回归。该RED未修产品，也未加入原fast已通过的样本数。

最小后续修复方向：详情身份包含item句柄及文档生命周期；同item重复可合并，不同有效item保留独立消费者；
编辑/关闭仍取消相关文档工作，保留旧句柄栅栏、背压、公平性。
回归需覆盖不同item并发、同item重复、单消费者取消、编辑/关闭重开、过期句柄和真实Zed预取。
本轮**未改产品**；调度优先级不能代替请求身份修复。

## 时延与导航长尾

正式**无协议error**的wire往返毫秒，包括Zed自动请求；不是可见UI绘制完成时间。
驱动的逐字输入、固定等待和截图不能算服务器耗时。被动观察/trace成本未独立测量。

| 操作 | 样本 | 中位数 | p95 | p99 | 最大值 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 补全列表 | 498 | 46.20 | 288.73 | 1496.87 | 1944.20 |
| 定义 | 1452 | 53.10 | 1242.44 | 2300.06 | 4923.07 |
| 详情全部，含487通用回退 | 510 | 14.16 | 472.26 | 1036.87 | 1434.55 |
| 真正签名增强的详情 | 23 | 640.10 | 1103.59 | 1104.45 | 1104.45 |
| hover | 17 | 331.36 | 632.71 | 632.71 | 632.71 |
| 自动documentHighlight | 1040 | 1069.69 | 14553.91 | 27358.30 | 35708.71 |
| 自动codeAction | 934 | 1350.42 | 29718.96 | 40034.13 | 43937.07 |

24/498列表、205/1452定义成功请求超过500ms；500ms仍为软体验目标，不因偶发超标判功能失败。
详情14ms中位因大量回退而偏低，不能当优化成功。后台35–44秒终态是未闭环长尾（WUI-005），
不证明前台UI连续冻结同样时长，结果可见性/精确归因未测。

**WUI-003仍有混合导航长尾**。移动恢复定义889：零基53:20→ScreenManager81:9正确，wire4543.630ms；
父准入至send返回4163.157ms，占91.6%；Worker接收至派发0.381ms。
到达时highlight438在途，随后typeDefinition439/highlight440先于define441，均epoch1/revision222，无中间mutation。
附近1262/1056/1050ms的compiler-build属于交错工作，不能全算本F12构建后再与wire相加。
实际bypass计数未测，不声称已确认具体公平分支。受控队首GREEN不等于混合排队全部解决。

最慢成功定义6358/4923.073ms返回SDK组件声明；同毫秒17个准入候选，日志不能唯一关联队列项，
不强行给它拆占比，两份附近Program成本也不能直接相加归因。
索引ready前/后成功定义中位80.13/52.48ms、最大1667.69/4923.07ms，列表中位47.71/45.85ms。
这是不同混合样本的分段观察，**不是控制变量的冷热/缓存A/B**；实际结果缓存命中未测。

## 初始化、Program、Worker与资源

LSP进度99%于17:44:37.916Z开始，消息Indexing 30000/30000 files; skipped 0 entries，
17:52:25.122Z end，**停留467206ms**。初始native replace完成464209.919ms，
其中commit.start→commit.end约330016ms，是实际测得区间；不能当Node Program卡住或Worker崩溃。
期间局部UI仍可运行。本次未复现99%后Worker崩溃，但长初始化仍存在。

17:44:47.026Z语义准备报告 **degraded/project-membership-incomplete**；native随后ready、索引30000文件，
不使完整语义覆盖自动READY。全量引用/实现/调用缺口保持。
正式完成观测的Program项目文件92–153、SDK源文件281–283、总425–488，不能把30000索引输入当全部进入Program。
正式完成观测188个不同programSequence；整会话223条compiler-build成本事件，不等同新分配223份长期驻留Program，
也不保证捕获所有未返回/失败构建。

| 资源口径 | 采样峰值 |
| --- | ---: |
| server Node进程WorkingSet | 733.07MiB |
| Worker报告的同Node RSS | 744.80MiB，采样时刻不同，不与上行相加 |
| Worker isolate heapUsed | 709.81MiB |
| native进程WorkingSet / PrivateBytes | 3438.27 / 3851.89MiB，不相加 |
| Zed主进程WorkingSet | 176.28MiB |

Worker线程共享进程RSS，未重复计算。10分钟桶Worker heap中位548.9/563.3/555.7/566.0/544.2/557.2MiB，
本窗口未见持续单调增长；实际依赖/上下文有变化，不据RSS回落或53分钟排除泄漏。
1442次OS资源采样、7539条Worker内存记录保留；系统可用物理内存最低4.10GiB、磁盘最低33.16GiB。
RSS预算/NODE_OPTIONS未配置，没有2/4GiB Node停测线；未改V8、超时、产品策略。
既有整机15%可用物理内存/1GiB磁盘保护未触发。

整会话1次Worker started、0退役/恢复/替换。native有5次replace开始、4次完成，是SQLite替换代次，**不是Worker换代**；
第5次未见完成前关闭，保留截断证据。全新index的两次自动GC均扫描1、保护活动1、删除0，
只证明活动缓存保护，未测试历史缓存批量回收。
结束只读index共10919880014字节（约10.17GiB），DB5438656512、WAL5470573112、SHM10649600字节；
全部保留，不拆删WAL，也不把有效项目缓存当泄漏或清理失败。

最终19份活动overlay、原30287输入、SDK1580文件、Windows六产物、三份日常安装/配置均MATCH；无意外新增项目文件。
仅向核验后的自有窗口发WM_CLOSE；shutdown6755在18:55:52.091Z发出、18:55:52.891Z应答，wire799.306ms。
未捕获exit通知/子退出码，不补写exit0；OS复核所属进程全部消失，未kill。两份专属停止任务导出XML后移除。

## 证据、命令与限制

本地 `.bench/windows-zed-ui-endurance-20261030/`；Windows同名独立根保留。

- formal-failure-sealed.zip：停测后、追加诊断前封存，seal-manifest保存每文件SHA/前后长度；不是跨文件原子快照。
- final-ui-evidence.zip：66559836字节，SHA256 `db97008630e9116cffcecad4de01747a047a3fc39dc08a645247da62852d170e`；
  解包ui-final-closed/，含410截图、逐次命令、wire/stderr、Worker/native/资源轨迹及失败终态。
- zed-profile-logs/、final-metadata/、owned-task-cleanup.json：Zed原日志、身份/完整性/回收凭据。
- formal-details-summary.json、current-details-lifetimes.json、concurrent-details-mac-repeats.json及四份RED日志：详情缺陷。
- request-889-timeline.stdout、request-6358-timeline.stdout：排队证据及无法唯一关联的边界。
- program-observations.json、resource-time-buckets.json、latency-by-native-ready.json、ui-final-closed/resources.csv：统计输入。
- ui-endurance-controller.cjs、zed-ui-agent.ps1、ui-targets.json、formal-plan.json及executed命令：可复查真实动作。
  重跑必须新独立根、重新审计，先修驱动两事务Redo假设；不覆盖原FAILED/失败脚本。

本轮实际使用的离线分析/最小复现命令，RED为诊断失败证据，不算测试通过：

```sh
python3 .bench/windows-zed-ui-endurance-20261030/analyze-ui.py .bench/windows-zed-ui-endurance-20261030/ui-final-closed
node .bench/windows-zed-ui-endurance-20261030/analyze-details.cjs .bench/windows-zed-ui-endurance-20261030/ui-final-closed/wire.ndjson
node --test --test-reporter=spec .bench/windows-zed-ui-endurance-20261030/concurrent-details-repro.test.mjs
```

WUI-004、WUI-003及WUI-005继续开放，关联[既有待办](../plans/2026-10-11-query-performance-follow-up-plan.md)。
未测试不同符号/非成员补全、重命名、完整SDK、默认launcher激活、真实两小时UI耐久，不宣称通过。
未来新会话观察器改为独立实例目录并通过隔离自测；当前server/relay未重启，原observer备份及SHA变更收据保留，
本轮没有额外LSP实例。它是证据工具变化，不是产品修复，成本未独立测量。
本轮未改产品、未合并/发布、未清理真实缓存。
