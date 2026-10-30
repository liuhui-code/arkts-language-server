# ADR0031：读取取消与可变编译同步的生命周期分离

- 日期：2026-10-30。
- 状态：Accepted（2026-10-30）；已按用户授权经 [PR #105](https://github.com/liuhui-code/arkts-language-server/pull/105) 合入 main，提交 `f78952f`。未替换日常安装。
- 父提交：`4859f76c46265a885332d7141c99698bf749c61e`，保留既有 Windows UI 工作树。
- 证据：[启动与取消 TDD](../tdd/startup-worker-cancellation-20261030.md)。

## 问题

用户报告真实三万文件工程初始化时反复换代，最终语义服务不可用；没有该现场日志。
公开子进程回归已证明同类机制：实际冷 Program 内有限 1800ms 无检查点工作，
普通 didOpen/didChange 或客户端取消在 1000ms 后触发 cancellation-deadline。
初始准备重建 Worker，或后继定义返回 worker-unavailable。原有限调用不是死循环。
该反例不证明用户现场的每次退休原因，也不把索引 99% 与语义准备合为一条链。

## 成熟机制与适配

Context7 查询先选 `/microsoft/typescript`；main 返回新 Go/snapshot API，与固定
4.9 分支不符，版本查询亦未返回具体同步实现，因此以安装的
`ohos-typescript@4.9.5-r10` 及官方
[TypeScript 4.9.5 services.ts](https://github.com/microsoft/TypeScript/blob/v4.9.5/src/services/services.ts#L1350)
核对边界：同步会修改旧 SourceFile，须先完成 Program/checker 一致性，再检查取消。
[clangd 调度](https://clangd.llvm.org/design/threads)将更新、已取消读取和有效读取分开，
合并连续更新。此处复用现有单 Worker、mutation 合并及版本围栏，不引入另一套调度器。
不照搬 clangd 独立补全线程、旧 preamble 或 TypeScript 7 snapshot API。

## 决定

1. 请求取消立即撤销旧结果；取消 cell、supervisor stateGeneration 和响应前最终证明不变。
2. 父端仅在共享进度的 epoch/commandId 与已开始命令匹配，且 phase 为
   synchronize/program/checker 时，允许普通 clientCancelled/contentModified 清算已经进入的同步。
   不再把该同步内的一秒静默直接当作物理 Worker 故障；活动计数不作为健康证明。
3. 仍从原 started 执行绝对截止：普通请求 30s、完整查询 120s、初始准备 180s。
   不因输入更新、活动、重复取消或重试更新起点。真正不返回仍强制退役并使用原恢复预算。
4. 收到同步完成事件，或父端首次观察离开同步后，转 settling，并应用原取消交付宽限。
   后续输入不能重新授予已完成的同步清算或重置交付宽限；丢终态仍须物理恢复。
5. shutdown、损坏取消 cell、真实构建/清算异常仍沿原有有界关闭、故障和 quarantine 路径。
   父端退休立即停止 watchdog，按原关闭截止终止；不等待完整的准备截止。
6. 后继 mutation 仍按原顺序应用并合并；新读取必须证明当前输入。完成旧同步不等于
   接受旧答案，也不把取消终态当成可补充恢复预算的健康成功。

## 与旧决定的关系

细化 ADR0023 的同步生命周期，将其父端监督与 Worker 内已经存在的取消屏蔽对齐。
明确修订 ADR0024 的“无检查点即按短取消宽限退休”和 ADR0030 的
“普通编辑/客户端取消必定硬中断”部分。旧反例和验收历史保留，保存通知只是该规则的特例。
同步以外仍执行原短取消截止；绝对期限、内存策略和最大恢复次数均未更改。

## 验收与边界

真实 server 子进程、Content-Length stdio 验证：启动输入交错、客户端取消、
最新未保存定义/诊断、超过恢复预算次数的有限交错、单终态、永久同步、丢终态、
关闭和熔断。另以三万文件工程及实际 SDK 复核，记录来源与现场证据差别。
本决定消除一种不必要换代，不承诺所有真实 OOM、绝对执行超时或索引慢均已解决。

用户批准后的 Windows Node20.19.5 最终恢复回归 24/24；Mac 最终定向 28/28。
Windows 真实 Photos 三万源码隔离副本、API24 SDK 1580 声明，在索引真实 99% 时
完成 12 轮/58 请求，1 Worker/0 恢复、shutdown 回复及 exit0；前后 30287 输入、
SDK、999 运行输入及 native SHA 全部一致。Mac 同场景 SDK 为 2083 声明。
二者均是实际工程公开协议资格，未冒充用户原现场或 Zed UI 验收。
最终合入须通过本次 PR 的 canonical release gate；原 Mac 2106 整轮与最终新增
子测试的计时夹具版本分别记录于 TDD，不互相替代。

最终提交 `844db34` 的 [canonical release gate](https://github.com/liuhui-code/arkts-language-server/actions/runs/40986247913)
已通过：Linux fast 2107/2107、零 fail/cancelled/skipped/todo，后续 release 检查及 Windows 安装任务均成功。
合入提交 `f78952f` 与该受检提交具有相同完整树；首次 CI 2106/2107 失败及两项测试夹具修正仍保留于 TDD。
