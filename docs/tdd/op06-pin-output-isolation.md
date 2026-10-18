# OP-06：诊断 Worker pin 用例的独立输出与原证据保留

日期：2026-10-15（运行 UTC2026-10-14）。状态：本修正相关 GREEN；OP-06 / L08 IN_PROGRESS。
父修订 `a111235bc4bfcb55b126752f95b3ba095f2996af`，分支 `codex/op00-query-attribution`。
不修改生产逻辑、原期限、原始资源保留/覆盖拒绝或诊断 Worker pin 合同。

## 真正完整回归的 RED

[目录成本切片](op02-request-directory-presence.md)后新公开collector整轮已终态：
1750/1751、1FAIL、actualexit1/signal null、零skip/cancel/todo，2933729.298103ms。
UTC2026-10-14 19:20:45.780→20:09:54.034，三个fast layer/193入口。
原始证据 `.bench/op02-directory-current-whole-v1/whole*`，log SHA
`b3111397832fd79ec48a404b48e6dbe9ebebd9197c636c2b17110205d5580a22`；
独立terminal audit SHA `48234d0b233bdde6ec0a201dab29bf7dfccd905ccbf7b32ecc4efe5a169fdfdf`。
证据完整性PASS与实际回归FAIL分开；原pnpm PID98709和collector98680均已退出。

唯一失败在`prepared-suite-diagnostic-worker-pin-cli.test.mjs:40`：
第三次调用应产生独立pin成功报告，却返回`PREPARED_SUITE_INVALID=OUTPUT_EXISTS`。
用例删了首次report，但未删新保留的`report.json.rss.jsonl`；未pin调用仍按原合同
正确拒绝，后续已pin调用被原始文件覆盖保护挡住。不是诊断语义或查询期限缺陷。

原整轮9FAIL对应的九个父/子case在本新整轮有逐项正向PASS，未放宽5s/20s：
bundle/外部CLI/父case、两个版本诊断、两个文档生命周期、403文件引用和
auto-import编辑诊断。403 case35072.962442ms、auto-import4786.156136ms
是用例总时长，非单请求P95。旧FAIL不改写，也不证明其唯一原因就是目录优化。

## 冻结期间的隔离反馈与最小落回

运行中不改任何权威源码/文档。原用例复制到明确私有`.bench`，仅转换两个import
到实际项目路径；依然调用原公开CLI/真实stdio协议fixture与外部OS sampler。
它验证pin/原文件合同，不证明生产诊断Worker实际运行、真实项目或PSS。
原版隔离0/1、exit1、1809.221282ms，再次复现同一OUTPUT_EXISTS：log SHA
`4df521ff5ee5e3ba5451078a8bdeb7aec53bf9c654b1b62c419782c8a0ff836a`。
只改为独立输出且不删除首份报告/原RSS，隔离1/1、exit0、2151.256749ms：log SHA
`c9d0a90b94a2e803ec7844db394cef513cf7bd49393f2f57db49e1e4abe1f84c`。
两份源档/实际退出独立audit SHA
`16b0a393cad73cde320552fe903773d71c5278548ec2b48ecc6abe3a64d962e5`。

完整终态审计后核对原目标SHA b04b184b、候选patch SHA bdbf6996和原进程不存在，
才用apply_patch落回一个测试文件。现在113行；原报告与原RSS逐字节保持相同，
首次/新报告各自核对原文件hash，资源文件名不同。所有pin mismatch/完整结果/
READINESS_UNSUPPORTED/原退出断言保留，没有删除已有原raw或关闭覆盖保护。

主工作树四文件完整相关回归15/15、exit0、零注解、6809.568474ms，
UTC20:11:39.043→20:11:52.626，源码/构建/SDK前后不变、原测试PID已退出。
`.bench/op06-pin-output-path-main-focused-v1*`，log SHA
`15b1f19715a1e824abaa01be23225763fae6182933d339bead020275344d6a70`；
独立audit SHA `4d415c33627f0ccae348baabed0d589bef0b38c7851592aac0605ece61730fb0`。
覆盖pin、原raw留存/覆盖拒绝、资源消费者和库存；不是完整1751项GREEN。

## 身份与后续完整范围

原whole冻结1690文件/repo SHA719a57f9，source archive SHA
`21c3df3c33032d3c6fb1e549e4fd3f49806e1603861220cc20ab5e548c0f9db0`；
修正相关冻结1690文件/repo SHA86c1baa8，source archive SHA
`1dfe122cf5c656631a12773c8a9ddcffcc5b1ea9fd76acdf9a4b30396939f48e`。
生产input2303c3e7、servere832f9b6及三个Worker、原SDK/sidecar/backend均未改。
库存仍200/unit97/bundle88/fast193。没有Rust/预算/六默认/scope/SDK修改。

下一步冻结修正后的源码/文档，以原check:fast执行新完整回归；原1750/1751
保留，不用相关15或隔离1借用完整GREEN。对应功能修正之外，原OP-00–05
资格/采纳、正常资源/OOM/nativeLS/Registry/≥100交替循环、客户端/三平台/
DevEco-PSS/历史>3GB与50%、全部正例与336格仍需完成。当前Docker只读查询
虽exit0但ServerErrors说明daemon不可连接，无可用Linux/PSS证明。
OP-06/L08未毕业，未合入/push，最终550ms及内存合同不变。

下一whole前余量约1.1GiB；核实两个旧自有成本对照已TERMINAL/PASS、四个旧PID
不存在、lsof无打开文件后，仅删除指定两个完整DB/WAL/SHM缓存组的六文件，
1110129416 bytes。16份原始日志/报告前后hash相同，数据集未删；无逐字节备份，
可从输入重建。cleanup receipt SHA
`597ea04fdfe8aff933182fc6418f972756780beadd617a3f66c590b839b247f4`。
随后磁盘约2.2GiB；仅执行前空间保障，不作旧超时或内存收益归因。

## 修正后完整回归终态

该新whole已1750/1751、1FAIL、exit1、零注解，2993941.218021ms；pin用例通过，
唯一失败转为原403文件含声明id4的20秒超时。全部输入／仓库／产物身份稳定。
完整log SHA `7bf4fbb168fb1e3ede0b4e275cfb7b458af5e602aa935a53ca1f03109fa8b659`，
audit SHA `02abc8b46dc0822b6ec8f5ded310e32a7dabf92d512d49158ec94df5046d767b`。
不能借pin修复或后续隔离PASS宣称整轮修复；后续有限归因与不采纳实验见
[SDK相对候选审计](op02-sdk-relative-candidate-review.md)。全部原L08范围继续。
