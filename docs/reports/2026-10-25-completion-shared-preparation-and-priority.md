# 编辑后补全：同步取消与前台调度修复

日期：2026-10-25。决策：[ADR0023](../adr/0023-completion-cancellation-and-synchronization.md)。
前置：[4秒补全拆解](2026-10-25-edited-completion-latency-breakdown.md)。
本轮实现并验证两项已证实缺口；缓存失效/引用性能 TODO 继续暂停，未推送、合并或发布。
实现、普通UI对照、Windows回归及Mac完整检查已完成；**500ms仍未达标，首轮初始化超时仍保留**。

## 采用的方案和边界

TypeScript [4.9.5官方同步实现](https://github.com/microsoft/TypeScript/blob/v4.9.5/src/services/services.ts#L1350)
和[5.9.3相同边界](https://github.com/microsoft/TypeScript/blob/v5.9.3/src/services/services.ts#L1798)
要求原地更新 Program 时避免中途取消。我们原先在 snapshot/依赖回调里检查请求取消，
会打断这一过程，继而触发 ADR0020 的安全退休。共享 AST 尚在，旧 LS 的语义状态却必须重新准备。

[clangd](https://clangd.llvm.org/design/threads)把过期读取与更新生命周期分开，合并连续更新，并对前台工作调度；
[rust-analyzer](https://rust-analyzer.github.io/book/contributing/architecture.html#cancellation)通过不可变快照及 revision 取消计算。
后者的 unwind 安全性不能直接套到当前可变 TypeScript Program，clangd 允许旧 preamble 的合同也未采用。
本轮采用同步完成边界和有界补全优先，保持当前完整输入/新鲜度检查。
Context7 resolve 工具连接失败，以上依据均来自官方源码/文档。

实际实现：

1. `SemanticCancellationScope` 只在同步 `getProgram()` 调用栈内暂缓协作取消；请求 cell 不清零，
   不跨 await，不保护后续语义查询。同步前已取消则不开始，同步后立刻取消旧调用。
2. `recoverableLanguageService` 的同步后取消检查在失败清算 catch 之外。
   成功的 Program/checker 归原 owner 持有；真实同步异常仍 dispose、结清租约或 quarantine。
3. 补全在第一条 global 请求之前的诊断/交互读取前缀中取得一次越过机会。
   最老请求随后必须运行，防止诊断/高亮/预取饿死；mutation 和 global 屏障不变。
4. 父线程 watchdog、原取消宽限、执行截止和恢复预算不变。
   构建真正卡死或不能在现有宽限内结束时仍受控终止/恢复，不允许后台无限运行。

没有跳过校验、返回旧版本答案、扩大超时、添加第二个 compiler owner 或新配置开关。
本轮不承诺取消任意大型同步构建都能即时响应，也不把所有缓存/规模成本宣称解决。

## 代码与环境身份

| 项目 | 身份 |
| --- | --- |
| 源码父提交 | `e35459131366a32c48c10d1d74adef74357cd3dc` 加工作树；分支 `fix/windows-path-identity-20261022` |
| 生产修改 | `src/semantic/semantic-cancellation-scope.ts`、`src/semantic/semantic-request-lanes.ts`、`src/semantic/backends/ohos-typescript/recoverable-language-service.ts` |
| 最终输入 | `.bench/completion-shared-preparation-20261025/final-validation-inputs-v3.json`，747项源码/测试/构建/配置 |
| 新 server SHA256 | `88797005140b102fd0120dbfc65ae540415ee94f0bd64011f682386b62fd2058` |
| 新 Worker SHA256 | `302a6fbe24a803378c9b3eea2982e94e79f1cc259db2b8bff549084b04c0d077` |
| 旧 server SHA256 | `483b685c63f9e7d7448957fb07990271b3d3ee42dc585a0259f31fecb9cb3ed5` |
| 旧 Worker SHA256 | `7d9d8ff20132b443d7cd084fecd1033c8f730f8edf0aebfcd9be3c31907c2e30` |
| 编译器 | `ohos-typescript@4.9.5-r10`，安装的原文件未修改 |
| Windows 隔离候选 | `D:/code/arkts-shared-sync-20261025`；依赖来自此前固定安装，产物由本轮源码构建 |
| Windows 测试元数据 | 隔离目录本地空提交 `8f2aa39d68a2105f17cda3f9e5e6c62452c9b9bc`，仅供夹具身份核验，不是产品源码版本 |
| 真实 UI | Windows Zed1.25.3、Node20.19.5；Mac只运行仓库检查，两端数据不混合 |
| Photos | `a2c993829c46d965abefc5d2143187fa54fa4604`，288个项目源码，git archive私有副本 |
| SDK | `D:/DevTools/sdk-declarations/openharmony-api24-6.1.1.125`，partial，缺userFileManager；不声称完整READY |

## 回归：从失败到修复

详见[TDD逐轮记录](../tdd/completion-shared-preparation-20261025.md)，本轮证据根为
`.bench/completion-shared-preparation-20261025/`。

- 编辑补全在 snapshot 中进入可控暂停，真实发送取消。原候选构建正常返回计数1而期望2，RED；
  修复后同步完成、旧请求只有一个取消终态，下一条同输入补全/readiness没有新建 Program。
- 较新编辑发生在同步中：旧 completion 精确返回既有合同的空列表，随后补全包含新别名 currentAlias，
  定义指向真实 Unopened.ets；配置退休后项目 Registry 租约归零。
- 诊断后夹着高亮、类型定义、补全：原候选先执行待排诊断，RED；修复后首补全先返回，
  第二补全须等待该诊断，两个当前诊断均发布。
- 原全局屏障、待执行请求取消、mutation失效、真实构建异常、资源清算异常和同步不返回恢复回归保留。
  真实异常叠加取消的夹具显式注入 snapshot 失败，不再依赖打断原子同步来制造失败。
- SDK 65边图：在第64边触发取消，完成原地同步后于下一个检查点拒绝调用，下一请求仍能得到 terminal 成员。
  临界区之外的有界扫描取消继续由原测试覆盖。

Mac相关扩大回归：首次55项54 PASS/1 FAIL（新增文件清单计数），后续19项18 PASS/1 FAIL（测试误解既有空列表合同），
均保留原日志并修正测试。同步/扫描合同调整后，完整原22项GREEN，再提取独立SDK测试与公共harness，
提取后28/28 PASS。没有用 name-pattern 中跳过的用例声明整文件通过。

Windows逐轮不隐藏失败：

| 轮次 | 结果 | 实际原因/处理 |
| --- | --- | --- |
| 初轮 | 44 PASS / 5 FAIL | 2项组件夹具无盘符URI，3项隔离目录无Git元数据；修正夹具并建立仅本地测试元数据 |
| 补验 | 46 PASS / 3 FAIL | 归档漏带config/memory-release-gates.json，身份核验失败；补全原配置文件 |
| v3 | 49 PASS / 1 FAIL | SDK图夹具把Windows反斜杠直接写入properties，SDK路径被转义破坏，未实际进入依赖图 |
| SDK单项 | 1/1 PASS | 只改夹具为正斜杠，保留第64边触发、正常完成、取消及新查询全部断言 |
| v4最终 | **50/50 PASS** | 零fail/skip/cancel/todo，完整原始日志`windows-regressions-v4.log` |

性质区分：上述三轮Windows失败属于测试夹具/同步完整性错误，不冒充产品故障；
它们仍是失败运行，不能以最终GREEN将其追认为通过。产品未删除路径身份校验或下调正确性断言。
此前超500行的 `typescript-cooperative-cancellation.test.mjs` 本轮从1430行缩减到1267行，
提取SDK取消职责及64行测试harness；仍超限的1267行是剩余迁移债务。

## 独立 Windows UI 观测

沿用原六条场景：三文件各两轮，选择原字段、输入三字符前缀、F6、Enter接受、F7；位置是0基UTF-16。
所有请求由真实Zed产生，没有主动LSP重放或故障注入。第二轮为关闭重开后的再次编辑，不等于答案缓存命中。

| 文件/符号 | 编辑起点 / 手动查询位置 | 输入 |
| --- | --- | --- |
| `common/src/main/ets/default/view/browserOperation/ThirdDeleteOperation.ts` / callback | 32:9 / 32:12 | cal |
| `feature/editor/src/main/ets/default/view/PcMainMenuBar.ets` / selectedMode | 36:15 / 36:18 | sel |
| `feature/browser/src/main/ets/default/view/photo/RenameMenuOperation.ts` / menuContext | 33:9 / 33:12 | men |

观测模式另开queue/reference trace及只读父进程Worker消息观测；普通计时不打开这些选项。
以下值包含诊断日志开销，不代替普通运行：

| 文件/轮次 | 补全RPC ms | 入队至post前 ms | post至Worker响应 ms | 实际Program/checker新增 |
| --- | ---: | ---: | ---: | --- |
| ThirdDeleteOperation / 首次 | 680.909 | 20.452 | 635.422 | 1 / 1 |
| PcMainMenuBar / 首次 | 930.927 | 302.220 | 606.091 | 1 / 1 |
| RenameMenuOperation / 首次 | 741.000 | 123.591 | 608.547 | 1 / 1 |
| ThirdDeleteOperation / 重复 | 479.393 | 155.335 | 319.007 | 0 / 0 |
| PcMainMenuBar / 重复 | 714.725 | 139.345 | 571.294 | 1 / 1 |
| RenameMenuOperation / 重复 | 336.631 | 57.778 | 275.698 | 0 / 0 |

中位697.817ms、最大930.927ms，**4/6超500ms**。Worker整体包含同步、校验、IPC等，不是纯compiler CPU。
各互不重叠区间及剩余外层差额在 `ui-observed/analysis.json`，没有重复相加sendReturned重叠。

真实取消证据：Worker60，ThirdDeleteOperation版本7，自动completion被客户端取消，
实际Program开始/返回均+1、checker均+1、同步均+1；原故障样本为Program+1/返回+0。
该取消响应518.963ms，随后同输入手动补全Worker处理319.007ms、Program/checker均无新增。
原始记录 `ui-observed/cancelled-successful-sync.json`；没有只用observed/READY标志推断。

本轮该运行grouped compiler-build成本为152–244ms，没有再出现原样本2817ms峰值。
该指标是嵌套的fork grouped事件，不能与Worker整体耗时相加，也不是独占解析毫秒数。
同规模Program文件仍按组：项目约138/174/171，加279个SDK及52个其他文件；新编辑正常更新Program，
SDK SourceFile279/279复用。没有通过减少合法语义覆盖换速度。

6次接受后的源码与原文精确一致，6次F7位置正确；16条详情响应无错误，全部RPC取消都能匹配先前真实取消帧。
一个语义Worker、没有Worker恢复；日志采样最大RSS约734MiB，属同一Node进程，不能再加算Worker线程RSS。
这不是连续内存峰值或长期内存验收。F7中位1121.363ms、最大1297.981ms，仍需普通对照核验，不能宣称跳转性能改善。

初始化51748.825ms，partial状态限制不变。另一个较早普通候选会话在采集器180秒内未见初始化终态，
业务六次操作未执行，记录在 `ui-normal-failed/`；不把它删除后宣称全场景通过。
两者的初始化波动未取得独占CPU/I/O归因证据，不猜测为缓存、系统负载或本补丁造成。
观测会话结束后的强制私有进程清理留下Zed `cannot read LSP message headers`，属于收尾日志，未声明修复。

## 最终普通对照和全量检查

旧候选普通UI → 新候选普通UI，串行、各新profile/Photos副本；没有排空OS页缓存。
两轮Photos全部初始文件哈希与SDK全部文件哈希逐项一致，查询/输入/版本也逐项匹配。
普通模式只保留被动stdio relay，没有额外queue/reference trace或Worker preload。
数据在`ui-baseline/`、`ui-normal2/`及`ordinary-comparison.json`；不与独立观测混算。

| 文件/轮次 | 旧版补全ms | 新版补全ms | 旧版F7 ms | 新版F7 ms |
| --- | ---: | ---: | ---: | ---: |
| ThirdDeleteOperation / 首次 | 871.870 | 738.786 | 951.252 | 974.138 |
| PcMainMenuBar / 首次 | 1856.094 | 807.603 | 1376.259 | 1151.346 |
| RenameMenuOperation / 首次 | 5651.636 | 690.181 | 1239.627 | 1046.240 |
| ThirdDeleteOperation / 重复 | 1416.926 | 299.427 | 659.502 | 640.863 |
| PcMainMenuBar / 重复 | 5453.014 | 605.459 | 1017.655 | 1098.196 |
| RenameMenuOperation / 重复 | 5327.380 | 414.963 | 694.153 | 688.062 |

| 观察对象 | 旧版中位/最大ms | 新版中位/最大ms | 结论范围 |
| --- | ---: | ---: | --- |
| 全部6条编辑后补全 | 3591.737 / 5651.636 | **647.820 / 807.603** | 描述性下降81.96% / 85.71%；仍4/6超过500ms |
| 首次文件编辑，3条 | 1856.094 / 5651.636 | 738.786 / 807.603 | 初始化已完成后的首次目标编辑，不是SDK冷解析 |
| 关闭重开后再次编辑，3条 | 5327.380 / 5453.014 | 414.963 / 605.459 | 不是最终答案缓存命中证明 |
| 接受后的6条F7 | 984.454 / 1376.259 | 1010.189 / 1151.346 | 未建立跳转中位收益，6/6仍超过500ms |
| 项目初始化，每版1条 | 48005 / 48005 | 48919 / 48919 | SDK partial；与早先失败会话分开保留 |

两轮各16条详情均无错误、所有RPC取消都匹配真实取消，均只有一个语义Worker、没有Worker重建。
两轮所有接受均恢复原始源码，F7都指向正确符号。新版普通+观测共32条详情无错误。
小样本、固定顺序的一对运行支持该场景改善，不是统计显著性、正式P95或全项目500ms资格。
较早的180秒初始化失败仍属于本轮会话分母：新版2个成功会话、1个未完成会话，不称全部会话通过。

四个私有UI会话最终清理后进程0、任务0，真实Photos干净。Windows核对最终747项输入无差异，
server/Worker/native/compiler哈希与记录一致，见`final-windows-audit.*`。
观测和普通会话的进程强制清理可能留下Zed header/window关闭日志，保留在各自zed.log，不将其认作已解决。

Mac最终完整 `pnpm check:fast`：**2039/2039 PASS**，fail/cancelled/skipped/todo均0，退出0。
Node20.19.5，Node测试耗时3335816.410ms，约55.6分钟；包含strict、正式构建和完整fast层执行。
原始日志`20-final-check-fast.log`，未以此前2035项或局部通过替代本轮结果。
固定747项输入检查前后无变化，Mac/Windows server及Worker哈希一致，最终核验见`final-identity-audit.json`。
收尾`git diff --check`通过。本轮未改Rust，未重新宣称release/大规模/长期内存资格；日常Zed安装未替换。

普通沙箱下的首轮全量有原生进程采样`spawn EPERM`，保留29条失败headlines及原始日志；
取得所需进程权限后重跑。期间因修正跨平台测试输入而主动停止的检查只算中止运行，不算全量通过。
455文件冷目录3秒性能门槛继续按用户授权排除，不据此删除任何正确性/完整性测试。

剩余项：新版普通补全4/6仍超过500ms、F7 6/6超过500ms；未细分的输入校验/I/O/查询成本不猜测归因。
首轮普通初始化180秒未完成、SDK partial、更大规模和长期资源行为均未借本次测试关闭。
根级引用缓存失效、无关组Host版本推进、全局Program更新及两轮全范围核验的既有TODO继续暂停。

## 复现与证据

```sh
pnpm check:fast
node --test --test-concurrency=1 tests/semantic/failed-build-recovery.test.mjs tests/semantic/completion-foreground-scheduling.test.mjs
python3 .bench/completion-shared-preparation-20261025/analyze-ui.py .bench/completion-shared-preparation-20261025/ui-observed
```

`.bench/completion-shared-preparation-20261025/`保存全部RED/GREEN、最终输入清单、每轮Windows日志，
各UI目录的`wire.ndjson`、`edit-result.json`、`ui-events.ndjson`、`edit-scenario.ndjson`、截图、server与Zed日志。
`remote.py`和各`*-start.ps1`、`*-close-export.ps1`保存实际SSH命令与私有任务流程，receipt保存UTC和退出码。
脚本拒绝覆盖既有会话，复跑须换新目录/任务后缀；不要在真实Photos中生成测试编辑。
