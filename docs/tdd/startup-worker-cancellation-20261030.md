# 大项目启动与语义 Worker 取消恢复

日期：2026-10-30。状态：Mac 原候选完整 fast 2106/2106；最终定向回归 Mac 28/28、Windows 24/24。用户批准验证后通过分支/PR 合入 main。
父提交：`4859f76c46265a885332d7141c99698bf749c61e`，保留先前 Windows UI 修复工作树。
本轮起点及 28 份既有修改 SHA、原补丁独立保存于
`.bench/startup-recovery-20261030-o1_kdgda/before.json`、`before.patch`、`before/`。

用户报告：真实三万文件项目初始化期间，语义 Worker 反复重建后不可用；无现场日志。
不把索引 99% 与语义初始化视作同一进度，不预判是普通请求 30 秒截止。

## 首个公开回归

真实 server 子进程和 Content-Length stdio：在实际冷 Program 同步内保留一段有限
1800ms 无检查点工作，期间发送正常 didOpen/didChange。要求共享初始化完成、
最新未保存版本的定义与诊断正确、原有限调用真正返回、仅一个 Worker 且无故障恢复。
夹具只延迟实际编译器调用，不替换产品监督、取消或协议结果。

RED 命令：

```sh
pnpm build
node --test tests/semantic/startup-synchronization-liveness.test.mjs
```

结果：0/1，exit1；`startup-red.log` 保存完整输出。1407ms 后出现
`semanticReadiness / cancellation-deadline / limitMs=1000 / phase=program`，
原 Worker 尚未返回 Program 即被退休，随后恢复线程 2。最终查询正确仍违反
“有限构建不应换代”断言（2 !== 1），证明恢复成功不能代替活性正确。

首片最小修正：共享初始准备遇到普通 open/change/close 仍立即撤销旧结果，
但允许匹配命令已经开始的同步清算；SDK/配置强失效及绝对截止规则暂不改变。
首片 GREEN：1/1，exit0，`startup-first-green.log`；原线程 1 完成准备及最新版本查询。

## 读取取消的相同缺口

第二条公开回归：初始准备后，实际 Program 同步内的同一 1800ms 有限工作遇到
`$/cancelRequest`。旧调用正确返回 -32800，但后继定义 -32603 worker-unavailable，
日志明确 `define / cancellation-deadline / limitMs=1000 / phase=program`。
RED 命令：`node --test --test-name-pattern='cancelling a read during finite' tests/semantic/startup-synchronization-liveness.test.mjs`，
0/1、exit1，完整 `read-cancellation-red.log`。

第二片：对匹配现有 epoch/id 的在途同步，将普通 clientCancelled/contentModified
与物理故障分开；请求依旧取消，已进入的可变同步由原绝对截止监督。同步离开后
恢复原取消交付宽限；settling 不重新授予同步许可。shutdown/损坏 cell 不获许可。
这明确修订 ADR0024/0030 的“普通编辑/客户端取消必须按短静默截止退役”约束，
不是增加数值截止，也不放宽终态/新鲜度/恢复预算。

两项完整文件 GREEN：2/2，exit0，`startup-and-read-green.log`。
在 GREEN 下把首片 Host 的初始化特判收回，统一由 watchdog 的实际同步阶段判定；
后续失效不重置 settling。行为由上述两个公开回归保护。

## 保护回归及三万文件连续输入

首次七完整文件 37/39，exit1，`focused-first.log`：两项原断言要求在同步内按
短取消期限杀线程，与本次明确修订的策略相反。没有延长产品期限；改为保留
既有 2200ms 绝对截止反例，永久 checker 用显式 1500ms 请求截止证明实际退出/重建。
其余初始化、partial、SDK、终态丢失和无限活动反例保持通过。

第二轮完整相关文件 `focused-second.log`：25/27，exit1。所有上述负向保护通过；
另两失败为新规模用例插入 `: string` 后仍使用旧查询坐标、清单分层计数遗漏 +1。
仅修正测试坐标为当前调用位置和清单真实计数，未改产品、阈值或 oracle。
`discovery-red.log` 保留此前未分类入口 RED。

最终新回归与清单完整文件：`scale-and-discovery-green.log`，7/7，exit0。
三万实际测试源（私有 SDK）在冷准备时打开文档，随后四轮各八次连续编辑，
穿插 1400ms 无检查点同步、当前版本定义、2322 出现/撤销与完整引用拒绝。
36 次版本推进超过三次恢复次数，始终一个 Worker、零恢复，正常 shutdown/exit0。
这是公开控制实验，不是实际工程 UI 压测。

## 实际 Photos 三万文件与安装 SDK

`real-project-qualification.mjs` 使用真实 Photos 扩展到三万源码的独立副本，
完整 30287 输入与原工程逐项 SHA 相同；不改原工程或日常 Zed。
SDK 为本机 DevEco 选择的 OpenHarmony，2083 份声明；未启用 RSS 预算或 NODE_OPTIONS。
启动即发送打开/连续编辑，实际准备约 12994ms，返回真实 membership partial/degraded；
不把该状态改成全工程 READY。

原生索引真实到达 99%/30000 文件时，12 轮编辑、真实取消、完整定义位置、hover、
补全/详情以及新 2322 诊断出现/撤销均完成，共 58 次记录操作。
结果 `PASS_LOCAL_FUNCTIONS`，一个语义 Worker、零 unresponsive/恢复，shutdown 回复且 exit0。
全部原始 stdout、客户端消息、stderr、服务/Worker 指标及逐次响应保存在 `real-project-run/`。
该轮关闭时索引仍 99%，不声称索引提交完成，也不是 Zed UI 或用户原现场的实测。

`real-project-final-audit.json`：原工程/隔离副本各 30287 输入、2083 SDK 声明、
4 项运行产物全部 SHA MATCH。源码查询坐标/完整预期来自真实源文件，不复制 LSP 回答。
没有调整产品超时、默认内存/V8、完整范围合同或恢复次数。

## 当前整轮

`pnpm check` 通过。`pnpm check:fast` 已终态 2106/2106、exit0，
零 fail/cancelled/skipped/todo，3121159.211308ms；完整输出 `check-fast.log`，
终态 `check-fast-final-receipt.json`。新增入口已加入 bundle-e2e，登记 271 总入口、263 fast。
源码 SHA 收据为 `check-fast-source-before.json`（整轮开始后、首 103 个通过标题时采集，
非启动前冻结证明）；整轮期间未改产品/测试输入。终态核对 783 份源/测试/脚本 SHA 全部 MATCH，
4 项构建产物与实际 Photos 运行时相同。原 28 份工作树文件中 21 份原字节保留，
7 份仅作本轮相关修改；无其他覆盖或缺失，见 `pre-existing-work-audit.json`。
本轮不借历史 2103/2103，也不以 Mac 完整回归代替未运行的 Windows、真实 UI 或用户原现场。

后续按一条失败回归、一项最小修复推进。真正同步停滞、绝对截止、关闭、
旧结果撤销和有界恢复必须保留。不得靠增加超时、默认内存预算或吞错修复。

## 用户批准后的 Windows 复验与测试计时边界

原代码外发自动审批拒绝后，用户明确批准传输、验证及通过 PR 合入 main；没有绕过审批。
上传隔离包 999 文件，SHA `572efa673d0ba6adf8b3b0eab5b2af7c14b53e487d839658d3df9d116110e572`。
Node20.19.5 首轮三文件 22 PASS/1 cancelled、exit1，保留 `windows-focused-original.log`。
私有阶段探针未改产品：30K 文件创建占 66075.54ms，初始化回复 66099.5ms、
准备完成 72249.6ms、首轮定义 73915.2ms，第二轮到原整体 75000ms 截止而取消。

仅把三万文件用例的文件准备/清理外层设为 180000ms；实际语义部分移入
`await t.test(..., { timeout: 75000 }, ...)`，保留原 75s 限制、全部断言、四轮输入、
规模和注入点。[Node20 官方 node:test](https://nodejs.org/docs/latest-v20.x/api/test.html#contexttestname-options-fn)的父/子 timeout 独立，父端 await 子测试；
未增大任何产品截止。`test-fixture-portability-delta.json` 记录这一唯一源/测试差异。

最终 `pnpm check` 及 Mac 三恢复文件＋入口清单 28/28，exit0，120430.598ms；
Windows 同三个恢复文件 24/24，exit0，185750.165ms，均零 fail/cancelled/skipped/todo。
原 Mac 整轮 2106/2106 保留原版本身份；最终用例新增一个子测试，完整最终资格须看
本次 PR 的 `pnpm check:release`（先执行 `pnpm check:fast`），不借旧计数。
17 项相关代码/测试与 17 项文档从已验证快照拷入独立 worktree；
并行的 completion-resolve 及后续输入缓存工作不纳入本次提交。

## Windows 实际工程最终资格

`windows-real-project-qualification.mjs` 复用 Mac 的源码推导 oracle 和公开 stdio 操作，
在 Windows 已有 Photos 三万源码工程的独立副本运行；不动日常工程/安装。
API24 `6.1.1.125` SDK 1580 声明，30287 输入；取消、编译、索引与语义监督均为真实产品。
42.198s 内完成 12 轮、58 次记录操作，`PASS_LOCAL_FUNCTIONS`；实际初始准备 14.319s、
membership degraded，索引 99% 时功能保持正确，1 Worker/0 恢复、shutdown 回复及 exit0。
无注入等待、NODE_OPTIONS 或 RSS 预算；详情仅验证合法返回/标签，不声称每份均 enriched。
前后原工程与副本各 30287、SDK 1580、999 运行输入、native 均 SHA MATCH。
三个 JS bundle 与 Mac 原整轮/实际工程运行相同；测试计时版仅改变测试文件。
原 Windows 首轮失败和私有阶段探针不覆盖；最终证据保留在 `windows-final-evidence/`，
取回归档 SHA `e1c8553056803f45af72722f602f0b86cb077451fa7c254db8cc95e7e3e77ad2`。
本轮不替代真实 Zed UI、索引 commit 完成、PSS/soak 或用户原现场日志证明。

## 首次最终 CI 的读取窗口测试竞态

父 `b97b9eacf1f99e71603824182c324602b2ade416`，
[CI 40981352593](https://github.com/liuhui-code/arkts-language-server/actions/runs/40981352593)
执行 `pnpm check:release`：fast 2106/2107、exit1、零 cancelled/skipped/todo。
唯一失败为 `changed-source-read-witness.test.mjs` 的 `mutation=read-window`：
预期 -32803，实际返回当前磁盘的 `markerEnd`。Windows 安装 CI 通过；fast 失败后的其他 release 步骤未运行。
完整官方 job 原始日志为 `ci-linux-direct.log`，SHA
`39293dd1ee611938042d6c621eae794448c000bbfa1098a92a64df358c3b8b18`；首次整轮失败不覆盖。

原文件本机完整 6/6 未复现，不据此忽略 CI。私有只读调度探针在通知与补全之间留 1200ms，
保持所有原断言，公开 stdio 再次 RED：0 PASS/1 FAIL/5 名称过滤，exit1。
真实队列记录先派发 version2 `diagnose`，它触发并拒绝变化中的读取证明；
后续 version2 `complete` 重新读取并返回 `markerEnd`。这是有效最新内容，原测试把
“任一自动读取遇到注入”错误等同于“目标补全必须遇到注入”。收据 `read-window-background-probe.*`。

仅把已有 drift/namespace 变体的私有诊断延迟 5000ms 同样用于全部 read-window 变体；
目标补全先消费注入窗口，原 -32803、真实文件/线程、恢复内容及 namespace 断言均保留。
相同 1200ms 探针 GREEN：1 PASS/5 名称过滤、exit0，实际派发为 complete(version2)，
返回 -32803；完整文件 GREEN 6/6、exit0、零注解，15382.930ms。
没有修改任何产品源码、截止或准入合同。本次提交因此另含这一项已有测试时序修正，
生产代码仍与先前 Mac/Windows 实际工程运行相同；最终完整资格等待新 PR CI。

Windows 新文件补充复验先为 5/6、exit1：namespace 注入在实际描述符尚未关闭时
执行 unlink→mkdir，未能写出注入收据；原 32803 断言已通过，不能拿这份错误冒充
真实目录切换已验证。原输出 `windows-read-witness-first.log` 保留。
私有夹具改在真实 close 后、外层 `observeChangedSourceRead` 的后置 lookup 前执行
同样目录替换，并在注入 I/O 前移除描述符跟踪，避免编号复用；不伪造 stat、回复或目录证明。
原 namespace 变目录、实际 lookup caller、sticky 拒绝与恢复断言全部不变。
先以原六项 GREEN 表征后整理跟踪清理，最终 Mac 6/6、exit0、15112.739ms，
Windows Node20.19.5 6/6、exit0，均零 fail/cancelled/skipped/todo；999 输入前后 SHA MATCH。
最终夹具 SHA `7b2b08e7ecc9b876a79162eaf30840fbff5852aa92ad275adae1cd8ef38beb6a`，
测试文件 SHA `e154b1acff91ea5483237465143028c47583f0512a44692a52cc8977fb6e83b6`。
完整最终 CI 仍须重跑；Mac 原整轮后仅三个测试/夹具文件有差异，生产源码和运行 bundle 不变。
