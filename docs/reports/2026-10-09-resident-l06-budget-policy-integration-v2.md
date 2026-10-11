# L06 修复后预算政策的真实交互能力对照

日期：2026-10-09。本报告固定构建的L06-D阶段功能控制PASS：四进程62/62请求完整exact，
ON/OFF两对完整payload及最新版本诊断一致，输入pins不变、产品退出0。
后续whole发现无SDK首次补全的目录身份误拒绝，已由公开7项合同修复验证，
但产品身份改变；本报告保留原pins，当前构建D/E须重新验证。raw报告仍为FAIL及
READINESS_UNSUPPORTED，不宣称P95、最终资源收益或生产准入。

## 修复与固定输入

首次完整回归发现取消后的删除依赖重试误拒绝，定向真实RED→路径身份
最小修复GREEN。修复后十四文件联合176/176 PASS，保留取消/删除delta、
package/SDK新鲜度、链接/逃逸、完整交互和L03政策。原始见
`.bench/l06-path-witness-focused-terminal.log`及
[公开合同记录](../tdd/l06-budget-policy-interactive-contracts.md)。
[修复前62项报告](2026-10-09-resident-l06-budget-policy-integration.md)和其pins
保持历史身份；本轮重新构建、发现oracle和运行全部对照，不借用旧分母。

工程HEAD为ecc550dfaed880e04e38a2477eb7235cd50475b9、工作区干净；
API24/ETS 6.1.1.125、backend 4.9.5-r10及父HEAD1b910152保持不变。
当前产品输入与产物：

- serverInputSha256：c0200935a9fe93c27082198e53d03adf316529759a716897a03125890f95e440
- serverSha256：cc226afaf43d12981415c211cec0a548e5777b24a921ba23e4e8a234e60aa1ed
- semanticWorkerSha256：f22aa8ead53077d50647f73a12bb68f6c96aee588c88f0d67c19a37ffcd57f6e
- referenceVerifierWorkerSha256：31576a4a855c40faee969b6079b3b0c8eb407ebc570fea764ff7cf349b219edd
- diagnosticVerifierWorkerSha256：8442b151680f6442489c57e0db20a6b34d05167785118dde4bc5698f284244e2

SDK声明digest、标准库、sidecar、lockfile、memory gates及完整工程源码
同样固定，所有冷发现/回放终态复核一致。清单为
`bench/references/manifests/settings-resident-l06-policy-*-v2-api24.json`。
正常1024MiB、原target/hysteresis、选定L03成本回收/压力准入/transient诊断
在两侧相同；R-09、anchor/session reuse及手动/自动Worker替换仍关闭。
ON/OFF仅切换现有L02同内容晋升，正常诊断不静音，不改超时或合法scope。

## 独立完整基线与范围

16个新构建独立冷生产stdio进程全部DISCOVERED/VERIFIED、退出0，六类
交互、v2未保存body注释后的hover/诊断及无关IService的完整6处实现均
跨两进程一致。与修复前的全部语义payload也一致；随机completion UUID
仅在验证形状后移除，resolve返回实际来源的同一句柄，前置completion
单独披露和计时。工程及SDK磁盘未修改。原始冷报告为
`.bench/l06-policy-*-cold-v2-{1,2}.json`，新oracle路径以`-v2-api24.json`结尾。

trace每组16项覆盖暖机、六类未查/稳态、立即v2编辑与编辑稳态、实际L3
驱逐后的hover完整恢复；timing每组15项为相同非驱逐序列，未冒称trace OFF
运行了回收控制。真实编辑/恢复采用代表性hover，其余输入/恢复组合由
当前17项公开交互合同覆盖，不将其称为最终每能力乘每输入完整矩阵。

| 独立进程 | exact请求 | candidate准备秒 | Node采样峰值MiB | 产品树采样峰值MiB | 实际采样间隔P95毫秒 |
| --- | --- | --- | --- | --- | --- |
| on-trace | 16/16 | 7.625 | 1049.539 | 1218.664 | 132 |
| on-timing | 15/15 | 7.486 | 806.535 | 975.883 | 134 |
| off-trace | 16/16 | 7.529 | 1073.207 | 1242.484 | 134 |
| off-timing | 15/15 | 7.864 | 842.770 | 1011.379 | 135 |

外部RSS只统计同一Node PID，Worker线程不重复相加，产品树另含sidecar；
不以RSS替代PSS。两对目标池、pins、完整canonical payload和最新code/range/
message/version诊断相同，62项全部COMPLETE/exact、无blocked。原始为
`.bench/l06-policy-{on,off}-{trace,timing}-v2-1.json`，直接配对审计为
`.bench/l06-policy-control-v2-analysis.json`。CLI因readiness门禁保持退出1，
产品正常退出0；功能门禁PASS与最终产品FAIL分别记录。

ON trace未查definition和无关暖机实际共用Program1，零createProgram；
OFF未查definition为Program2、一次createProgram。两側completion/resolve
分别使用Program1/2，实际1496个工程sources、652个SDKsources完整复用。
checker身份变化仍保留，不把Program复用扩大为所有checker不变或答案cache。

## 单次完整响应与 L08 风险

下表仅为独立trace OFF单次完整响应毫秒，不是稳定P95，不混入trace样本。

| 能力 | ON未查 | OFF未查 | ON稳态 | OFF稳态 |
| --- | --- | --- | --- | --- |
| definition | 682 | 1488 | 466 | 534 |
| typeDefinition | 1445 | 1612 | 466 | 526 |
| hover | 501 | 557 | 468 | 534 |
| signatureHelp | 461 | 511 | 474 | 531 |
| completion | 518 | 562 | 482 | 531 |
| completionResolve | 488 | 539 | 469 | 530 |

编辑hover为ON 1125、OFF 1192ms；
trace恢复为ON 5817、OFF 6116ms。
冷completion仍约14秒。存在>500ms样本，trace恢复峰值高于soft预算，
释放LS后物理RSS不保证立即下降；采样峰值较低不构成最终内存收益证明。

L08接收500ms/P95、内存目标、长时edit/pressure soak、完整最终能力矩阵、
DevEco/PSS、100k及跨平台风险；这些不足不阻塞L06功能收口。生产默认
仍关闭，回滚使用既有L02开关和原完整安全路径，不能以关闭诊断、输入保护
或缩小scope当回滚。L06完成等待E，默认推广/发布等待L08。
