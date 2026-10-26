# 同步编译卡住与受限监督恢复：TDD记录

- 父revision：`e35459131366a32c48c10d1d74adef74357cd3dc`。
- 分支：`fix/windows-path-identity-20261022`；保留Windows路径修复、租约清算等既有改动。
- 本轮开始状态：`.bench/worker-liveness-20261024/starting.diff`、`starting-status.txt`、`source-before.json`。
- 范围：[ADR 0020](../adr/0020-failed-semantic-build-recovery.md)、
  [修复前诊断](../reports/2026-10-24-definition-stall-and-worker-lifetime.md)。不合并、不发布。
- 缓存性能TODO继续暂停；455文件冷目录3秒门槛按用户授权排除，未删除索引或跳过正确性检查。

## 公开接口及故障边界

`tests/semantic/unresponsive-worker-recovery.test.mjs`使用真实子进程、Content-Length stdio及固定compiler。
故障仅由`tests/fixtures/unresponsive-semantic-worker.cjs`预加载器注入，产品没有故障控制接口。
Host根枚举/模块解析、checker bind中的同步不返回均不轮询取消单元；真正发送`$/cancelRequest`。
startup hold只为恢复期间编辑队列实验提供可控窗口，可由测试文件解除；不代表真实无限循环的根因。
故障计数/Date.now偏移只用于验证恢复策略，执行截止与普通计时使用performance.now，不随偏移推进。

所有以下证据均在`.bench/worker-liveness-20261024/`；命令固定Node20.19.5。

回归入口如下。RED对应表内切片实施前、已加入当时新增测试/预加载器的工作区，
不能把父revision单独检出后声称它已经包含这些新增测试；初始dirty源码指纹见`source-before.json`。

```sh
PATH=/Users/liuhui/.nvm/versions/node/v20.19.5/bin:$PATH pnpm build
PATH=/Users/liuhui/.nvm/versions/node/v20.19.5/bin:$PATH node --test --test-concurrency=1 tests/semantic/unresponsive-worker-recovery.test.mjs
```

定位三个关键反例时可在`node --test`之后、测试路径之前分别加
`--test-name-pattern='cancelling a synchronous checker stall'`、
`--test-name-pattern='intermittent failures on unchanged input'`或
`--test-name-pattern='cancelling a half-open caller'`；实际RED结果以对应原始日志为准。

| 切片 | RED | 最小改动及GREEN |
| --- | --- | --- |
| 同步checker卡住后真正取消 | `01-cancel-red.log`：LSP response 3超时 | 父线程watchdog及物理Worker回收；`02-cancel-green.log` 1/1 |
| 超过时间窗口仍连续失败 | `03-consecutive-red.log`：第四次退出没有停止 | 与频率上限独立的连续预算；`04-consecutive-green.log` 17/17 |
| 精确Program返回/checker进入 | `07-phase-red.log`：phase未测 | 固定compiler精确工厂包装+共享计数；`08-phase-green.log` 17/17 |
| 熔断后修复输入 | `09-half-open-red.log`：同会话definition失败 | 受预算约束的单次探测；`10/11`进一步暴露重复配置附带空rootDirty误解锁，`12`修复 |
| 初始化排队/执行计时分离 | `11/12-lsp-recovery.log`：已进入synchronize却被队列截止抢先终止 | 仅未执行命令使用排队截止；`16-lsp-recovery-green.log` 6/6 |
| 第二个根已发送但未执行时取消 | `15-queued-cancel-red.log`：response 4超时 | 调用方取消宽限，内部命令继续有主；`16` 6/6 |
| 取消单元损坏 | `18-corrupt-cell-red.log`：父进程退出1 | 守护端安全读取并退休isolate；`19`校准既有LSP错误码，`23`修正注入器重复损坏问题，`26` 11/11 |
| 恢复输入缓冲界限 | `22-buffer-red.log`：33文件恢复队列未受限 | 32条/4MiB文档文本、同文件相邻全文合并、失败回收；`23-focused.log`对应公开场景GREEN |
| 回归进入fast层 | `24-manifest-red.log`：未归类测试 | manifest及计数更新；`25-manifest-green.log` PASS |
| 无效截止配置不能先创建Worker | `27-invalid-budget-red.log`：已有未登记Worker | 校验移到Worker分配前；`28-invalid-budget-green.log`选中用例PASS |
| 配置属性顺序不能补充恢复机会 | `29-config-order-red.log`：相同内容误解锁 | 使用深相等；`30-budget-order-green.log`两个选中用例PASS |
| 同输入间歇失败夹杂成功 | `31-intermittent-success-red.log`：窗口过期与成功一起补充预算 | 只在新输入上真实成功才重置累计自动恢复次数；`32-focused-all.log` 52/52 |
| 半开请求等待恢复时取消 | `33-half-open-cancel-red.log`：response2超时 | 复用可取消的共享任务等待；`34-focused-final.log` 53/53 |
| 既有异步诊断暂停应合作取消 | 第四轮全量两项失败；`35-async-cancellation-red.log`独立复现2失败 | 仅测试暂停每25ms检查已有取消单元，finally记结束；原断言保留并补同一Worker断言，`36`5/5、`37-focused-v5.log`58/58 |

`05-mutation-bypass-red.log`、`13/14-queued-cancel-red.log`实际是PASS或未到目标接缝的校准尝试，
不能拿文件名当RED证据。第二根测试最终等待父线程send.returned后才发送取消；此前取消可能在磁盘请求准备阶段结束。
初始300ms准备预算还未等到Worker载入，校准为1500ms后明确进入Host根枚举；未据此调整产品默认预算。
`20-expanded-lsp.log`中的关闭场景校准为既有关闭合同的单一终态（可返回null），没有放宽产品校验。

## 覆盖与最终检查

最终新增15项覆盖：checker卡住取消；慢速连续fatal；输入修复探测；首次准备前Program停滞；mutation截止及恢复中100次全文编辑；
跨根排队取消；损坏取消单元；连续mutation预算；模块解析卡住时关闭；33文件恢复缓冲溢出；探测失败后再修复；
无效启动参数的分配边界；配置属性顺序相等；同输入间歇失败夹杂成功；共享恢复等待期间调用方取消。
与原15项同版本重试、失败Registry余额、实际合作取消、owner隔离、致命退出、配置/SDK和关闭回收回归串行执行。

产品默认：普通请求30s、全局请求120s、准备/最长排队180s、mutation10s、取消宽限1s。
新增回归为速度使用显式缩短预算；独立`controlled-lsp.mjs`使用产品默认截止，单独保留原始帧和耗时。
这些预算是活性保护，不是500ms目标，取消宽限也不替代性能验收。

最终源码完整检查、Windows和Photos结果见[实现报告](../reports/2026-10-24-worker-supervision-recovery.md)。
`final-source-before.json`与检查后清单必须一致；任何源码/测试/脚本变更均需重新评估最终检查。
第一轮全量运行因上述两个收尾缺口由agent主动停止（exit143，`check-fast-interrupted.log`及进程清单保留），
不算完整PASS。修复后重新冻结772个代码/测试/构建输入，再执行完整最终检查。
第二轮发现4个诊断CLI构建一致性失败，保留`check-fast-second-failed.log`，修复生产变换复用并保持严格断言。
第三轮在共享恢复等待的真实取消反例确认后主动中断，保留`check-fast-third-interrupted.log`；不算完整PASS。
最终v4仅把调用方取消与共享恢复所有权分开，未调整产品超时；772个输入重新冻结后再次运行完整检查。
第四轮在约1400项后暴露既有`references-diagnostic-scheduling`的两项失败，主动停止143，日志为`check-fast-fourth-failed-interrupted.log`。
独立RED命令：`node --test --test-concurrency=1 --test-name-pattern='queued completion cancellation|an edit invalidates a definition queued' tests/semantic/references-diagnostic-scheduling.test.mjs`。
两场均为测试专用1800ms异步hold不读取消，phase=request；编辑取消后超过原定1000ms宽限，监督正确退休Worker，打断新版本请求。
V5只修正既有测试暂停的合作取消，未改变普通诊断路径、产品宽限/截止和同步不返回的故障注入。
完整5项调度回归保持原有结果/唯一终态/新版本诊断断言，并新增两个“必须保持同一物理Worker”的断言，避免靠重启通过。
V5合跑58/58 PASS（零skip/cancel/fail），之后重新冻结772个输入、重测Mac/Windows，再重新执行完整检查。
第五轮完整检查发现`completion recovers after module visit mutations and L3 pressure`未发生预期恢复，停止143，保留`check-fast-fifth-failed-interrupted.log`。
`38-pressure-precondition-red.log`独立复现；另一次只在清理时复制日志的诊断保留`pressure-case-before-fix/`。
它证明1500ms测试hold在输入取消后26ms结束，只有1个Worker、没有recovery；并非编译器又卡住，而是V5改掉了故意积压mutation的故障前置。
V6将该私有测试hold保持原来的不合作默认，5项调度测试显式选择`ARKTS_TEST_WORKER_DIAGNOSE_HOLD_COOPERATIVE=1`；普通产品路径仍不启用该hook。
没有删除“必须物理恢复”的压力断言，也没有删除合作取消的“必须保持同一个Worker”断言。
全部正值hold调用点的三组公开LSP测试、原恢复和CLI测试合跑，`39-focused-v6.log`为**73/73 PASS**、零skip/cancel/fail。
V6最终源码重新冻结，后续完整检查及Mac/Windows数据以实现报告的最终结果为准，所有前轮中断/失败均不计PASS。

## Windows扩大验证与失败夹具收尾

V6的50项组合命令在前35项区域后600s超时；核对完整TAP发现其中“whole-module top-level caller”实际有1项名称断言失败，不能只读取末段通过行。
实际`name`为TypeScript标准的`C:/.../ZTop.ets`，测试以`path.join`错误预期Windows反斜杠；URI和其余字段没有因此删除或放宽比较。
独立8项文件和单项选择均重现超时。libuv快照、spawn来源及分段LSP帧确认该失败留下一个已初始化但未收到shutdown/exit的服务器。
`windows-v6-cleanup-root-cause.log`捕获先删除fixture时SQLite `symbols-v2.sqlite3`的`EBUSY`。
实际Node20内置源码`runHook`717–732按注册顺序运行，第一项hook抛错即停止，后注册的session.close因此未执行；源码副本随证据保存。

先做清理独立对照：`resident-call-cleanup-copy.mjs`保留原错误名称断言，仅改为fixture统一拥有sessions、逐一await关闭后再删目录，并汇总清理异常。
Windows单项仍正确失败1（选择导致7项skip，不计完整通过），但**2093.954ms自然退出**，不再触发30/180/600s外层终止。
之后V7将精确预期按分隔符规范为`/`、保留全部Graph/URI/range/name断言；该fixture的统一清理同样纳入仓库，不吞EBUSY或靠重试删除通过。
V7合跑`40-focused-v7.log`为**73/73 PASS**，零skip/cancel/fail。
V7相对V6只改变该测试文件，重新build后83项产品产物逐字节不变，详见`v7-product-runtime-equivalence.json`。
Mac V6逐次实测对应相同最终产品runtime；Windows V7重新执行50项和Photos整组。
此前V6完整检查虽未观察到失败，也因最终测试文件变更而停止143，保留`check-fast-sixth-superseded.log`，不记为完整PASS；V7从头运行最终完整检查。


## V8：Windows真实往返路径边界

V7组合50项自然结束，49通过、1失败（`windows-v7-recovery-first.log`），全部10项Photos/故障/GC独立命令退出0。
统一清理消除了测试进程挂起，但同一个模块项从incomingCalls原样传给outgoingCalls仍返回-32801；这是实际产品缺陷。
`mapCallHierarchyItem`把compiler `item.file`转换成`path.resolve`，但
`currentWholeFileCallHierarchyItem`把`SourceFile.fileName`原样作为内部path；Windows前者为原生分隔符，后者为`/`。
`sameCallHierarchyItem`把左侧path与`path.resolve(right.path)`精确比较，导致合法项被误判过期，显示name本身相等。

最小修复在整文件语义项的输入边界同样`path.resolve(sourceFile.fileName)`；显示名称保持compiler原值，
不把文件名转小写，不删除URI/名称/选择范围/完整范围/源码新鲜度核验。公开用例仍检验伪造名称、类型和完整范围必须拒绝。
V7父输入/产物清单保留；第七轮全量检查因该确认缺陷停止143，保留`check-fast-seventh-superseded.log`，不算完整通过。
V8重新build，772源码输入只变该helper；83项运行时中3个Worker bundle变化，因此Mac及Windows普通/故障/GC测量全部重新执行。
V7仅改测试时与V6产物相同的结论不能继续用于V8最终性能数据。
最终GREEN及全量结果见实现报告和原始日志，尚未结束的命令不算通过。

V8 Mac合跑`42-focused-v8.log` **73/73 PASS**；Windows `windows-v8-recovery-final.log` **50/50 PASS**，均零skip/cancel/fail/todo，命令自然退出0。
同一公开用例同时保留伪造模块项的拒绝断言；没有用取消校验或大小写折叠取得GREEN。最终全量检查仍须独立完成。


## 最终V8 GREEN

冻结后的整套`pnpm check:fast`正常退出0：**1984 tests /1984 pass /0 fail /0 cancelled /0 skipped /0 todo**。
执行时间2026-10-23 22:16:15.724Z至23:07:26.790Z，整条命令3071107.428ms；原始Node阶段3062270.183ms。
772项源码、76项正式生产产物前后SHA逐一一致；包括最终Windows路径修复和失败fixture资源关闭顺序。
原83项目录清单中的SDK测试driver在`sdk-discovery.test.mjs`重建后SHA改变，完整diff和初末字节保留；
生产入口/标准库manifest定义的76项均一致。源码没有变化，不将测试输出差异包装为83项全部一致，也无需因其重跑产品检查。
Mac73项焦点、Windows50项公开回归均零skip/cancel/fail；Mac10、Windows11条串行实测命令全部正常退出0。
Rust路径合同1/1和最终release sidecar构建通过。原始日志为`check-fast-final.log`，真实退出及计数在`final-check-result.json`。
前七轮所有失败/中断、Windows清理对照和V7真实产品失败均保留，不改记成功。
455文件冷目录3秒门槛按用户授权未执行，不包装为通过；没有运行独立large/发布矩阵。
最终报告保留Windows普通10/45超过500ms、故障后冷查询秒级、自然degraded和原现场未复现等限制。
未提交/推送/合并/发布；最终源码、文档、逐次数据和复现脚本随证据封存。
