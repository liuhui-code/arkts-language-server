# L06 当前预算政策的真实交互能力对照

日期：2026-10-09。本轮固定构建L06-D阶段功能控制PASS：四进程62/62请求
完整exact、ON/OFF两对完整payload和最新诊断相同、终态pins不变、产品退出0。
后续完整回归发现普通SDK engine热查询探测回归，已停止；本轮pins保留为历史，
修复后的当前构建另行复核。raw报告保留FAIL/READINESS_UNSUPPORTED，不宣称
semantic-ready、稳定P95、最终内存收益或生产准入。

## 当前构建与政策

两轮whole分别发现删除依赖重试、无SDK首次补全的目录身份误拒绝。
真实RED→实际realpath身份最小修复后，当前十五文件联合183/183 PASS，
保留原输入保护、正常诊断、取消和完整结果合同；原始
`.bench/l06-project-path-focused-terminal.log`及
[公开TDD](../tdd/l06-budget-policy-interactive-contracts.md)记录全部失败与定位。
[第一轮](2026-10-09-resident-l06-budget-policy-integration.md)及
[第二轮](2026-10-09-resident-l06-budget-policy-integration-v2.md)的pins保持历史，
本轮重新固定构建、独立冷发现和全部ON/OFF控制，不重盖旧结果。

父HEAD1b910152；Settings HEAD ecc550dfaed880e04e38a2477eb7235cd50475b9、
工作区干净，完整工程源码digest不变。SDK API24/ETS 6.1.1.125、backend
4.9.5-r10、标准库、sidecar、lockfile和memory gates保持，完整pins在
`bench/references/manifests/settings-resident-l06-policy-*-v3-api24.json`。
当前产品输入和产物：

- serverInputSha256：551c107fc799757974771b1b892aed0f58094cd3f0f79f7ea292e9b13c3dde2a
- serverSha256：8030e9f880d67b9dd2e223ac4e558fcfb9b0a0d1db6e63d2798d0f68a25a23d2
- semanticWorkerSha256：8dee7f65913c0ccb4483b29f228f2db67e76414e837825b93322081a67ac3111
- referenceVerifierWorkerSha256：7bda809f65db2686245e2ea96fa94b2177938631c120906cb5b5eccde618565f
- diagnosticVerifierWorkerSha256：9d7b2261006135d93d35488a7b85352cca65dcfc6d16cb0a1fe2a830db35fde7

两侧保持正常1024MiB、原target/hysteresis和选定L03成本回收/压力准入/
transient诊断。R-09、anchor/session reuse、手动与自动Worker替换均关闭；
ON/OFF只切现有L02同内容晋升，trace与timing分进程。未提高预算、preload、
超时、关闭诊断、缩小合法scope或强制GC；生产默认不变。

## 独立完整 oracle 与公开回放

16个新构建独立冷生产stdio进程全部DISCOVERED/VERIFIED、退出0，完整
六类交互、v2 body注释编辑后的hover/诊断及IService6处implementation基线
跨两进程一致；语义payload与此前固定构建也一致。只在验证UUID后移除
随机会话data，resolve使用并保留实际来源句柄，前置completion单独计时。
原始冷报告为`.bench/l06-policy-*-cold-v3-{1,2}.json`，oracles以
`settings-resident-l06-policy-*-v3-api24.json`命名，工程/SDK磁盘未修改。

一轮权限审核在创建hover进程前超时，已确认没有进程/报告生成；仅接续
尚未执行的12个冷任务，使用更小的沙箱权限即可完成，不重跑前四项，不改
任何产品参数或等待期限。四组外部RSS控制使用允许读取进程RSS的环境。

trace每组16项：无关IService暖机、六类未查/稳态、立即v2 body编辑、
编辑稳态及实际L3后的hover完整恢复；timing每组15项为相同非回收序列。
没有冒称trace OFF做了驱逐控制。真实编辑/恢复以hover为代表，其它组合
由17项当前公开交互合同覆盖，不把本轮扩大为L08最终全能力乘全场景矩阵。

| 进程 | exact请求 | candidate准备秒 | Node峰值MiB | 产品树峰值MiB | 实际采样间隔P95毫秒 |
| --- | --- | --- | --- | --- | --- |
| on-trace | 16/16 | 7.344 | 1056.203 | 1225.523 | 134 |
| on-timing | 15/15 | 7.246 | 810.906 | 980.141 | 133 |
| off-trace | 16/16 | 7.596 | 1079.539 | 1249.059 | 133 |
| off-timing | 15/15 | 7.266 | 834.984 | 1004.438 | 132 |

外部RSS统计同一Node PID，Worker线程不重复相加；产品树含sidecar，采样峰值
不替代PSS。两对目标池/pins/完整canonical payload和最新code/range/message/
version诊断深比较一致，62项全部COMPLETE/exact、无blocked。原始报告
`.bench/l06-policy-{on,off}-{trace,timing}-v3-1.json`，直接配对审计
`.bench/l06-policy-control-v3-analysis.json`。回放CLI因readiness门禁退出1，
产品正常退出0；阶段功能PASS与产品readiness FAIL分别保留。

ON trace的首次未查definition与无关暖机实际共用Program1、零createProgram；
OFF首次definition为Program2、一次createProgram。completion/resolve两側分别
实际复用Program1/2、1496工程sources及652 SDK sources。checker变化仍记录，
不把同Program扩大成所有checker身份不变或答案cache命中。

## 完整响应与 L08 接收项

下表是独立trace OFF单次完整响应毫秒，不是稳定P95，不混入trace归因样本。

| 能力 | ON未查 | OFF未查 | ON稳态 | OFF稳态 |
| --- | --- | --- | --- | --- |
| definition | 722 | 1351 | 469 | 483 |
| typeDefinition | 1476 | 1452 | 470 | 483 |
| hover | 502 | 515 | 475 | 473 |
| signatureHelp | 458 | 468 | 469 | 481 |
| completion | 509 | 503 | 480 | 485 |
| completionResolve | 491 | 485 | 478 | 480 |

编辑hover ON 1100、OFF 1098ms；
trace恢复ON 5804、OFF 5902ms。
冷completion仍约14秒；存在>500ms样本，trace恢复Node采样峰值超soft预算，
释放LS后物理RSS不保证立即下降。单次峰值/差异不证明最终内存收益或稳定提速。

L08继续500ms/P95、最终内存、长期edit/pressure soak、完整最终能力矩阵、
DevEco/PSS、100k及跨平台门禁；这些不足不作为L06的前置。错误结果、旧
输入或执行保护缺陷回滚对应实验路径；用既有L02/L03开关回到原完整安全
路径，不能关闭诊断/新鲜度或缩小scope。L06等待E，生产默认推广/发布等待L08。
