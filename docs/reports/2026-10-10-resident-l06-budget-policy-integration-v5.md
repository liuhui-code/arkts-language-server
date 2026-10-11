# L06 当前预算政策的真实交互能力对照

日期：2026-10-10。当前固定构建 L06-D 阶段控制 PASS：四进程
62/62 完整请求通过，两对完整 payload、最新诊断、目标池和 pins 相同，
产品退出 0。随后新完整check:fast1492/1492、退出0及终态身份复核通过；
[L06完成审计](2026-10-10-resident-l06-completion-audit.md)A～E PASS，阶段DONE。
raw 报告仍为 FAIL/READINESS_UNSUPPORTED，最终准入和资源指标属于 L08。

## 修复与当前构建

[公开 TDD](../tdd/l06-budget-policy-interactive-contracts.md)保留第四轮
whole 的1488/1490失败：canonical owner重建仍使用旧ProjectModel见证；
target首次查询因真实false directoryExists窗口的无关父目录变化被误拒绝。
前者在已确认owner变化边界invalidate对应model；后者区分布尔存在性
和内容读取，目录枚举/文件读取保持完整guard，true瞬时读取不能成为负证据。

扩大联合又发现原目录聚合容量合同失败，实际retainedPaths4096；
修复保留真实稳定目录full stamp用于原负child聚合，不重盖cached stamp，
不增容量。当前十九文件252/252 PASS、退出0、无fail/cancel/skip/todo，
615962.51742ms，`.bench/l06-presence-capacity-final-focused-terminal.log`。
L06共19项独立公开case；252还包含既有compiler/registry/tooling测试，
不将它们全部称作公开stdio。所有临时DEBUG已清除，类型/构建通过。

父HEAD1b910152；当前产品输入 f3f22d83f9f5d67c5303de9505a81c469da80e334c3bf5828423969c180a00b5；
server e352097a37ff30fca109172757af649cde44de5beef29cbc60345ca12f8bf5ac；
semantic Worker 297d44a6a8fbe7cefe5f0128dff0302ab3817491e139fd154c5c9935cac19d8b。
Settings HEAD ecc550dfaed880e04e38a2477eb7235cd50475b9、工作区干净；
工程digest 4becf56cb2ff65cc58bd1ae53b6937b194f9020770ad397e526f3a51b85b0d40；
API24/ETS6.1.1.125、backend4.9.5-r10、Nodev26.3.0，SDKdigest
8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4。全Worker/sidecar/stdlib/lockfile/memory gates
pins在 `.bench/l06-current-pins-v5.json` 及本轮不可变清单。
旧四轮输入与报告保持历史身份，不重写或计作当前D/E。

## 完整独立基线与请求

八目标各两个独立冷生产stdio进程，16进程全部DISCOVERED/VERIFIED，
完整payload与上一版一致、正常诊断有观测、退出0，输入前后相同。
包括六类交互、编辑后hover及无关IService六处实现暖机；resolve只有
显式源completion作为单独计时的准备请求，不隐藏刷新或预热目标。

本轮manifest/oracle为
`bench/references/{manifests,oracles}/settings-resident-l06-policy-*-v5-api24.json`；
冷报告 `.bench/l06-policy-*-cold-v5-{1,2}.json`；
控制报告 `.bench/l06-policy-{on,off}-{trace,timing}-v5-1.json`；
逐项分析 `.bench/l06-policy-control-v5-analysis.json`。

选定L03政策保持正常1024MiB、原滞回、成本回收、压力准入及transient
diagnostics。ON/OFF只改变L02同内容晋升，R-09/anchor/session reuse/
Worker自动回收关闭，fullSDK/closure与正常诊断不减。没有生产默认推广。
trace两侧各16请求，timing各15：无关暖机、六类未查和稳态、v2 body
edit hover及编辑后稳态；trace另核验实际L3驱逐后的hover恢复。
编辑/恢复仅代表性hover，不冒充所有能力完整最终矩阵。

两对所有完整语义payload、URI/version/最新诊断、目标池及pins deep-equal；
无error/partial-success，计划分母全部完成。只规范化已校验的opaque
completion UUID，不删除其它语义字段，resolve保持实际源句柄。

实际ON trace暖机及首次definition同Program1、零createProgram；
OFF definition为Program2、一次createProgram。completion/resolve ON1、
OFF2，完整覆盖1496工程及652SDK sources；所有SourceFile复用有记录。
checker序号变化不隐去，不由答案缓存推断LS/Program复用。

## 完整响应与RSS

以下为trace OFF单次完整响应，不是P95、稳定收益或500ms准入：

| 能力 | ON 未查完整响应 ms | OFF 未查完整响应 ms |
| --- | ---: | ---: |
| definition | 672 | 1336 |
| typeDefinition | 1470 | 1458 |
| hover | 504 | 499 |
| signatureHelp | 468 | 465 |
| completion | 507 | 507 |
| completionResolve | 495 | 482 |

body-edit hover ON 1113ms、
OFF 1092ms；
trace恢复 ON 5814ms、
OFF 5767ms。
冷准备、无关暖机与恢复全部保留，不从热查询桶隐藏。

| 进程 | 准备 ms | Node 峰值 MiB | 产品树峰值 MiB |
| --- | ---: | ---: | ---: |
| on-trace | 7307 | 1041.99 | 1211.52 |
| on-timing | 7396 | 804.19 | 972.91 |
| off-trace | 7502 | 1075.82 | 1244.87 |
| off-timing | 7325 | 832.96 | 1002.91 |

外部进程树RSS包含Node/sidecar，不含独立harness/sampler；请求50ms，
实际采样间隔P95为131–133ms。峰值是采样下界，trace超过正常软预算，
LS释放不保证物理RSS下降，自动Worker回收本轮关闭。不能从单次配对
推导最终内存降幅、长期泄漏或PSS；原raw readiness失败保持。

## 冻结和回滚

当前冻结 `.bench/l06-stage-frozen-inputs-v5.json`：
316测试/工具文件，172登记入口（fast166），100历史及当前benchmark
输入，42修改源/测试/工具文件。随后完整check:fast1492/1492、退出0、
无fail/cancel/skip/todo，2039816.131497ms；终态全部冻结身份及四份D报告
初始/postflight pins实际核对一致。不借用252 focused、62真实请求或
失败的旧whole作为完整成功；输出截断/观察缺口在完成审计中明确记录。

关闭opt-in晋升和相关实验政策即可回到既有完整安全路径；新鲜度保护、
取消/版本fences、正常诊断和原预算/超时保持，无新capability或语义owner。
500ms/P95、最终资源收益、semantic-ready、长期soak、PSS/DevEco、100k、
平台与发布统一交L08。
