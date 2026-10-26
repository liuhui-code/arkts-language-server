# Windows Zed 前台验收：补全详情、编辑应用与跳转

日期：2026-10-25。结论：**本次候选的补全详情功能验收通过；500ms性能和关闭日志仍有遗留。**
这是实际交互桌面中的 Zed UI，所有业务请求由 Zed 自己产生；没有用 LSP 客户端重放替代 UI。
产品代码未改，未合并、发布或更新日常安装。
前置：[补全详情修复报告](2026-10-25-completion-resolve-lifecycle.md)、[ADR 0022](../adr/0022-completion-resolution-lifecycle.md)。

## 实际执行与版本

Windows `ssh windows-pc`；交互任务在用户Session2运行，以限定私有profile/窗口的原生键盘输入执行。
每次输入前验证前台PID属于自有Zed。可选的激活路径也要求鼠标命中自有窗口才能点击，并恢复临时窗口层级；
**本轮没有触发该备用路径**，不把本轮成功归因为已经解决了前次Edge焦点阻断的具体原因。
没有向其他窗口输入，所有私有任务/进程均在结束后清理，真实Photos工作树保持干净。

| 项目 | 本轮身份 |
| --- | --- |
| Zed | 已安装1.25.3；固定ArkTS扩展Wasm SHA256 `d311ff6ea43914aaa8ff2de1ad5ed817da64c958fe055e2f08e2b627bf8e79a8` |
| Node | 20.19.5 |
| 产品候选 | `D:/code/arkts-completion-resolve-20261025` |
| server.cjs SHA256 | `483b685c63f9e7d7448957fb07990271b3d3ee42dc585a0259f31fecb9cb3ed5` |
| semantic-worker.cjs SHA256 | `7d9d8ff20132b443d7cd084fecd1033c8f730f8edf0aebfcd9be3c31907c2e30` |
| 源码 | 父提交 `e35459131366a32c48c10d1d74adef74357cd3dc` 加既有工作树；740项输入仍匹配前轮最终清单 |
| Photos | `a2c993829c46d965abefc5d2143187fa54fa4604`，288个源码，git archive隔离副本 |
| SDK | `D:/DevTools/sdk-declarations/openharmony-api24-6.1.1.125`，API24声明版 |
| SDK状态 | 各会话为partial，缺userFileManager；没有伪造完整SDK/READY，也没有因此阻断本次健康功能 |

显式配置SDK、Node、隔离log/index、原生sidecar和项目`.ts`的ArkTS关联；语义参数沿用默认值。
没有故障注入、放宽校验、延长产品截止时间。真实源码和SDK都未写入。
Windows远端证据目录为 `D:/DevSetup/diagnostics/zed-completion-ui-acceptance-20261025-{a,b,c,d}`。

## 场景与正确性

固定三个真实项目目标，位置均为0基UTF-16：

| 文件 | 符号 | A/D弹窗位置 | C编辑起点，位于this.之后 | 实际输入 |
| --- | --- | --- | --- | --- |
| `common/src/main/ets/default/view/browserOperation/ThirdDeleteOperation.ts` | callback | 32:10 | 32:9 | 选择callback后输入cal，接受补全还原callback |
| `feature/editor/src/main/ets/default/view/PcMainMenuBar.ets` | selectedMode | 36:16 | 36:15 | 选择selectedMode后输入sel，接受补全还原selectedMode |
| `feature/browser/src/main/ets/default/view/photo/RenameMenuOperation.ts` | menuContext | 33:10 | 33:9 | 选择menuContext后输入men，接受补全还原menuContext |

- **A，9条流程**：3文件×3轮，打开→F6→移动候选→关闭弹窗/文件→下一文件，后续重开同一文件。
  真实弹窗截图与目标文件/符号吻合，列表分别含19/6/4项。
- **C，6条流程**：3文件×2轮，实际选择原符号、输入3字符前缀→F6→等待详情→Enter应用→F7跳转。
  用实际Zed `didChange`帧重建文本，6次均精确还原原始源码；接受后的版本确实推进。
  6次显式跳转响应的目标范围均为正确符号，前三次跳转截图已视检。
  编辑中的2339（例如“cal不存在”）是刻意制造的未完成源码状态，不能当成服务异常。
- **D，6条流程**：保持目标文件打开，在详情任务期间打开/关闭另一个文件，再回目标补全。
  补齐前次真实UI错误中的“目标未变，别处mutation”路径。

| 会话 | 成功详情响应 | 详情RPC错误 | 目标关闭后晚到 | 请求区间含无关mutation且目标未变 | 语义Worker启动 |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 150 | 0 | 16 | 0 | 1 |
| C | 16 | 0 | 0 | 0 | 1 |
| D | 77 | 0 | 23 | 11 | 1 |
| 合计 | **243** | **0** | 39 | 11 | 每会话1次，无重建 |

关闭后晚到、编辑后的旧条目及D中的11条无关mutation交错均安全返回原始条目，没有新增编辑。
所有详情响应的不可变字段与原始签发列表一致。时间区间重叠来自协议帧，未插桩到内部独占阶段，
不把某一条响应具体命中了哪个内部guard当成已测结论。

## 取消和错误：不能称为所有日志均无ERROR

成功会话A/C/D的业务RPC中另有**46次-32800**：C为39次，D为7次。
逐条均匹配到响应之前真实发出的`$/cancelRequest`，没有未匹配的取消错误，没有详情取消错误。
C的39条分为codeAction14、completion13、documentHighlight12；取消帧到响应中位9.202ms、最大245.958ms。
不能把这些响应写成成功语义结果，亦不计为Worker故障或新鲜度失效误报。

服务结构化日志未见error/warn；三个成功会话均未发生Worker重建。
交互阶段没有发现补全详情错误或“无法找到源文件”。但完整Zed日志有以下**3条收尾异常**，全部保留：

| 会话/本地时间 | 日志 | 阶段与已知边界 |
| --- | --- | --- |
| A，11:40:39 | GPUI `window not found` | 与Alt+F4关闭自有窗口同阶段；未定位Zed内部根因 |
| C，12:31:48 | LSP `cannot read LSP message headers` | 六条业务流程已于12:23:57结束；在身份验证后强制清理自有进程期间出现，不能倒填成交互时业务报错 |
| D，12:47:52 | GPUI `window not found` | 与本轮关窗同阶段；未定位Zed内部根因 |

因此结论限于补全/编辑/跳转正确性，**没有宣称Zed所有关闭日志问题已解决**。
A的旧被动relay使用child exit事件结束，末帧仍留shutdown未配对；C/D改为close事件等待流结束，
但C最终采用受控进程清理，不能据此认证完整LSP shutdown/dispose。正常协议关闭的独立证明仍见前轮公开回归。

## 时延：500ms仍未达标

下表为被动relay观察到完整请求至完整响应的时间，包含observer开销。
不包含键盘至像素绘制，不等于纯服务器CPU时间；A/C/D不混成一个冷/热中位数。
每会话独立启动，没有清OS页缓存；repeat不是已证明的结果缓存命中。

| 观察对象 | n | 中位ms | 最大ms | 超500ms |
| --- | ---: | ---: | ---: | ---: |
| A 补全列表 | 9 | 897.411 | 1212.100 | 9 |
| A 补全详情 | 150 | 24.879 | 288.801 | 0 |
| C 实际接受的编辑后列表 | 6 | 1225.261 | 4018.623 | 6 |
| C 补全详情 | 16 | 155.926 | 363.302 | 0 |
| C 显式F7跳转 | 6 | 585.069 | 798.368 | 5 |
| D 列表，包括被取消样本 | 12 | 533.038 | 1189.245 | 6 |
| D 补全详情 | 77 | 4.256 | 646.089 | 4 |

C不以全部24条列表请求的209.541ms中位数替代真正被接受的6次列表；其中13条取消、另外5条自动请求。
六条核心操作逐次值：

| 文件/轮次 | 编辑后列表ms | 显式定义ms |
| --- | ---: | ---: |
| ThirdDeleteOperation，首次 | 4018.623 | 515.651 |
| PcMainMenuBar，首次 | 1200.770 | 798.368 |
| RenameMenuOperation，首次 | 1249.752 | 742.465 |
| ThirdDeleteOperation，重复 | 897.435 | 432.970 |
| PcMainMenuBar，重复 | 3919.073 | 633.835 |
| RenameMenuOperation，重复 | 1024.860 | 536.303 |

D的4条慢详情：id54/barScale646.089ms、id67/onCompleted552.599ms、
id167/barScale596.576ms、id202/onCompleted545.637ms。完整URI、源条目、顺序与状态见`resolve-operations.json`。
C最初两个后台codeAction/highlight请求约32.8/33.0秒后被取消；这些请求区间跨越初始化，
没有内部独占计时，也没有当作成功交互结果。各成功会话的慢样本保留在`slow-rpc.json`。

内部排队、Program更新/解析、输入校验及结果缓存命中本轮未分别计时，实际Program文件数和内存峰值也未测。
**不根据上述UI耗时猜测归因或宣称缓存/规模成本已解决。** 缓存性能TODO继续暂缓。

随后进行的同产物独立观测见[编辑后补全耗时拆解](2026-10-25-edited-completion-latency-breakdown.md)。
该复测的3999.476ms补全中，3799.583ms在调度队列等待，Worker处理197.404ms；
前序真实取消中断同步，后续诊断重新构建Program/checker、整体占用3074.037ms。
AST复用成立，但取消恢复和前台调度的端到端性能仍未解决。
这是独立诊断样本，不能把其精确比例倒填为上表原始4018.623ms的独占阶段。

## 保留的失败样本B

B也是同产品候选的真实编辑运行：首条callback编辑、接受、跳转成功，列表3980.069ms，定义632.863ms；
第二条采集截图时UI Automation空矩形含Infinity，PowerShell生成非法JSON，Node解析失败。
这是采集器故障，退出1，不能计为整轮PASS，亦没有把其真实慢样本删除。
修复只在隔离脚本中将非有限矩形值记null、只读取完整NDJSON行；随后C在新副本完成全部6条。
B原始`edit-failure.json`、非法JSON、wire、截图和执行退出码均保留，未覆盖。

## 证据与复现

本地证据根目录：`.bench/zed-ui-acceptance-20261025/`。

- `run-a-final/`：9条原始UI流程，150条详情，含`completion-result.json`和实际弹窗截图。
- `run-b/`：采集器失败样本，保留完整原始数据。
- `run-c-final/`：6条编辑/接受/跳转流程，`edit-result.json`、`wire.ndjson`、`zed.log`与跳转截图。
- `run-d/`：无关文件交错流程、77条详情及11条目标不变的交错证据。
- 各成功目录的`analysis.json`、`resolve-operations.json`、`slow-rpc.json`保留逐次统计及慢请求完整参数。
- `acceptance-summary.json`汇总，`final-audit.stdout`核验任务/测试进程为0、真实Photos干净。
- `ui-tools*/`、`start-test*.ps1`、`remote.py`、`analyze.py`保留实际复现脚本；截图不代替协议结果。

复现为SSH上传对应`ui-tools*.tar.gz`，调用`remote.py start-test*.ps1 UNIQUE_LABEL 300`。
脚本拒绝覆盖已有profile/项目副本/证据目录；复跑须更换目录后缀和任务名。
`analyze.py LOCAL_RUN_DIRECTORY`可重新核对原始帧。每次输入、具体编辑、顺序和PID记录在`ui-events.ndjson`及scenario文件。

本轮只增加验收脚本/报告，产品740项输入与此前清单匹配；沿用此前2035/2035完整fast结果，
没有冒称本轮又运行了完整fast。455文件冷目录3秒门槛继续按原授权排除。
日常Zed安装未替换；未合并、推送或发布。更大规模、完整SDK READY、所有UI功能及关闭问题不在本次完成声明内。
