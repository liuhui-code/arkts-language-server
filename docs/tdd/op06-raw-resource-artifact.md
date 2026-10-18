# OP-06：原始 RSS 文件留存与发布证据绑定

日期：2026-10-15（运行 UTC2026-10-14）。状态：本切片相关 GREEN；OP-06 / L08 IN_PROGRESS。
父修订 `a111235bc4bfcb55b126752f95b3ba095f2996af`，分支 `codex/op00-query-attribution`。
落实[后续计划 OP-06](../plans/2026-10-11-query-performance-follow-up-plan.md#op-06-最终验收工具与-l08-完成审计)的原始资源文件绑定，不是完整发布判定或内存收益。

最新完整回归1750/1751的唯一输出冲突及[pin独立输出修正](op06-pin-output-isolation.md)
已保留原RED、隔离反馈和主工作树15/15；仅修正重复调用用例，不删原报告/raw、
不关闭覆盖拒绝或pin保护。修正后的新完整检查仍待执行，不借相关GREEN授予发布。

## 公开合同

既有 `replay-references.mjs --prepared-suite FILE --out REPORT.json` 现在保留
`REPORT.json.rss.jsonl`：复制已经停止的外部 sampler 原字节，不重新序列化、
排序、补时钟或过滤样本。报告增加 `memory.rawSamples: { file, sha256, byteLength }`，
file 是同目录 basename；临时目录清理后仍可复查，移动报告与文件不需改写内容。
已有 report/raw 输出在服务器启动前拒绝，原字节不覆盖；实际写入仍使用 `wx`。

既有 `assert-semantic-release.mjs --prepared-report REPORT.json` 按报告目录重读
文件，核对完整字节长度/SHA、UTF-8、全部 JSONL 记录和报告 samples，随后继续
原进程计数、峰值、间隔及成对完成时间检查。非法绝对/跨目录/Windows drive-relative
路径、缺文件、损坏声明、哈希或内容不符明确 FAIL，已完成的查询行不删除。
旧 embedded-only 报告仍保留内部一致性观察，明确 `MEMORY_RAW_ARTIFACT_NOT_BOUND`，
不补造历史 raw 身份。RSS 一致或文件绑定通过不等于 PSS：memory 仍 BLOCKED，
releaseEligible 仍 false，未改变 550 ms、预算、owner、SDK/scope 或六项默认。

## 原始 RED → GREEN

完整回归运行时项目全部源码保持冻结；在隔离副本
`/private/tmp/arkts-op06-resource-binding-RnlWtP` 用同一公开 CLI 逐项建立 RED，
每项最小 GREEN 后才加下一项。TDD 记录保留实际命令、父修订、原退出、根计数、
前后 source archive 和 hash；合成 query/RSS 只资格消费者，不是产品测量。

| 公开反例 | 原始证据前缀（`.bench/`） |
| --- | --- |
| 修改原字节却仍被忽略 | `op06-resource-binding-scratch-{red,green}-v1` |
| 新哈希正确但原曲线与报告不同 | `op06-resource-binding-content-scratch-{red,green}-v1` |
| 非法 UTF-8 被静默替换成合法 JSON 字符 | `op06-resource-binding-utf8-scratch-{red,green}-v1` |
| 旧报告缺原文件身份却没有明确未绑定理由 | `op06-resource-binding-legacy-scratch-{red,green}-v1` |
| Windows drive-relative 名称未明确拒绝 | `op06-resource-binding-portable-path-scratch-{red,green}-v1` |
| 采集器清理临时目录后原 JSONL 丢失 | `op06-resource-artifact-collector-scratch-{red,green}-v1` |
| 原 raw 存在时仍启动真实服务器才拒绝 | `op06-resource-artifact-overwrite-scratch-{red,green}-v1` |
| 两个新入口未登记库存 | `op06-resource-artifact-inventory-scratch-{red,green}-v1` |

另有合法 raw、缺失/损坏/路径控制及实际 sampler→公开消费者互操作表征。
采集端使用真实 OS RSS 与真实 stdio 子进程，但语义服务器为协议 fixture；
它不是正式产品语义/PSS/时延。unsupported 分支是明确失败保护，未执行的
Linux/Windows 不改标通过。隔离最终四文件24/24、零注解、身份稳定，独立 audit
SHA `eaf5fc292d24127486b976a3f197cee83a9ab17e9f816d5547f51a3e0b96ba0f`。
初次控制器 shell 引号导致 SyntaxError、未启动测试的调用也未充作 RED。

## 真实完整回归及落回项目

修改前真正公开 collector 的完整 `check:fast` 已终态：1727 项中1718 PASS / 9 FAIL，
exit1/signal null，零 skip/cancel/todo，3328939.018002 ms。三 fast layers/189入口，
UTC16:28:01.513→17:23:45.461。证据完整性独立 PASS，但实际回归 FAIL，二者分开。
`.bench/op06-public-collected-current-whole-v1/whole*` 的 log SHA
`2034a44872dcdc0b6df7d983dcf6051e199b9ad64e004dbc5b02eb65d91a36d6`，
terminal-audit SHA `8b986396ef17f9628fcd792ee7ea4aba93d8e069050db77d3a7a5bf253c61471`。
1680文件 source archive SHA `72c11af51a1c558dc461e61c509ee7ed03f66e31ce83f07437b20400dd80cf32`，
全部 source/SDK/产物前后一致；真实根 PID29572 已退出，没有重启旧任务。

失败为冷启动完成/诊断的原5秒、403文件引用的原20秒，以及 auto-import 编辑后
诊断的原20秒。conformance 父项和两个子项都计入根9 FAIL。最后一项用小型 SDK
fixture，不能将所有失败归为真实 SDK 冷启动或某个开关；唯一原因 NOT_PROVEN。
原1711/1712和其它历史失败不覆盖。

终态审计后按8个原文件 SHA 检查落回候选补丁，未覆盖并行改动。项目内七文件
73/73、exit0、零注解、48322.804578 ms，全部构建/SDK/repo身份稳定。
`.bench/op06-resource-artifact-main-focused-v1*`，log SHA
`e94cef678b8ab7f41e58442a186a779755a7008104934bf76c9d17e4188b91f3`，
独立 audit SHA `ad449f9816f9250bbf13859acb86d4c1653033f9dfc5d3d13d510abfb3b12abf`。
库存196→198、unit94→96，fast191入口；新脚本/测试及所改文件82–477行，均≤500。
生产 input `1bc4e318…` 与 server `e832f9b6…` 未变；没有 Rust/生产 owner/policy 改动。
Node20 `pnpm check` 和 diff 检查通过；此73相关不是新完整 GREEN。

## 有限复现与剩余工作

auto-import 原用例正确单跑1 PASS/8名称过滤、原期限不变，4870.883239 ms，
没有复现；首次 `--import` ESM 路径配置失败63.925081 ms保留，服务器未启动，
不是产品故障。原失败五个完整文件的预声明一次序列24/24、零注解，
128162.912185 ms，原SDK/期限及所有身份不变，亦未复现。
`.bench/op06-current-whole-failures-native-short-sequence-v1*`，log SHA
`ce8ed70ad58e9e5ebebeb61b5ddb126df2c9ba58a858027ba01af747a9b12e13`，
独立 audit SHA `288f7db3530f3e27b3d682d2c34e0b7218e17153a2be7ae71372e239d673bf23`。
私有观察脚本只在测试客户端失败后保存未消费通知/完整 fixture/日志；两次正确
调用都通过，未产生新的故障 capture，不能补填原 whole 的丢失报文或宣布修复。

继续建立更短可靠的原失败反馈环与归因，原9 FAIL不改写、不重复整轮碰运气。
本切片尚缺原始资源覆盖/实际 OOM、native LS/Registry/物理释放、≥100交替循环、
产品 workflow/portability、独立 DevEco/PSS、全部证据正例 releaseEligible=true 和
原336格矩阵。OP-00–05按各自合同独立推进；不以550 ms/PSS阻塞前序阶段。
OP-06/L08不标DONE；没有新完整GREEN、PR合入或push。
