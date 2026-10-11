# L06 当前预算政策的真实交互能力对照

日期：2026-10-10。本轮固定构建 L06-D 阶段功能控制 PASS：四进程
62/62 完整请求通过，ON/OFF 两对完整 payload、最新诊断、目标池及 pins
相同，产品退出 0。后续完整回归1488/1490、退出1：target首次查询和
canonical owner重建误拒绝。修复改变输入身份，本轮保持历史，当前构建另行
核验；阶段尚未完成，不以本轮D或focused替代新的完整回归。
raw 报告仍为 FAIL/READINESS_UNSUPPORTED，不能据此宣称最终准入。

## 当前构建与回归修复

第三轮 whole 发现普通 SDK engine 的 100 个新 importer 产生 1600 次
配置路径探测，原合同要求 0。直接 engine 按 generation 固定 SDK；
显式 witness 管理的生产 registry 与 resident 路径继续核验已加载配置。
最小修复后原合同 GREEN，当前十六文件联合 194/194 PASS、退出 0、
无 fail/cancel/skip/todo，440171.248804 ms；原始
`.bench/l06-sdk-boundary-focused-v4-terminal.log`。
[公开 TDD](../tdd/l06-budget-policy-interactive-contracts.md)保留三轮 whole
失败、有效 RED/GREEN 和工具输出截断记录；旧结果和 pins 不重写。

当前 serverInputSha256：9c5f9801b7e2d650056a7dc43e9b0cacbbeaad0b5426189844879cc376fd0dd6；
serverSha256：49b6bf032bb45dbc2ae1a78fcf90eec3b383bd37afd12e6a9098f00c25a69624；
semanticWorkerSha256：6bf6b55ba7fc6be1c66d3f102929474d268866bf313595a5af72707f4d6afc41。
Settings HEAD ecc550dfaed880e04e38a2477eb7235cd50475b9、工作区干净，
工程 digest 4becf56cb2ff65cc58bd1ae53b6937b194f9020770ad397e526f3a51b85b0d40。
SDK API24/ETS 6.1.1.125、backend 4.9.5-r10、Node v26.3.0，
SDK digest 8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4；
sidecar、标准库、lockfile、memory gates 及所有 Worker 完整 pins 见
`.bench/l06-current-pins-v4.json` 和本轮不可变清单。

选定 L03 政策仍为正常 1024 MiB、原滞回、成本感知回收、压力准入及
transient diagnostics；ON/OFF 只改变 L02 同内容晋升。R-09、anchor、
session reuse 和 Worker 自动回收关闭，full SDK/closure 不缩小，诊断不静音。
实验及生产默认均未推广。

## 独立完整基线和真实请求

八目标各由两个独立冷生产 stdio 进程发现/核验，共 16 个进程全部通过，
完整 payload 与前轮一致；包含六种交互能力、编辑后的 hover 及无关
IService 暖机的六个实现。工程、SDK、产物前后 pins 相同，诊断均有正常
观测，产品退出 0。resolve 的源 completion 是显式、单独计时的准备请求，
没有隐藏刷新、预热目标或篡改会话句柄。

本轮文件为 `bench/references/manifests/settings-resident-l06-policy-*-v4-api24.json`
及相应 v4 oracles，冷报告为 `.bench/l06-policy-*-cold-v4-{1,2}.json`。
四份控制报告为 `.bench/l06-policy-{on,off}-{trace,timing}-v4-1.json`。
trace 两侧各 16 请求，timing 各 15：无关 implementation 暖机、六类
未查目标、六类稳态、v2 body edit 和编辑后稳态；trace 额外核验真实 L3
驱逐后的 hover 恢复。编辑/恢复是代表性 hover，不冒充所有能力完整矩阵。

两对目标池、每个完整语义 payload、最新 URI/version/诊断集合及 pins
deep-equal；请求无 error/partial-success，16/16 和 15/15 均完成。
只规范化校验有效的 opaque completion UUID，不删除任何语义字段。
当前分析 `.bench/l06-policy-control-v4-analysis.json` 为 PASS。

实际 trace：ON 暖机/首次未查 definition 为同一 Program 1，createProgram 0；
OFF definition 为 Program 2，createProgram 1。completion/resolve ON 1、
OFF 2，均完整覆盖 1496 工程 sources 和 652 SDK sources，复用见证与最新
输入核验齐备。checker 序号变化有记录，不宣称同一 checker 或答案缓存命中。

## 响应成本与内存

以下为 trace OFF 的单次完整响应，不是 P95 或产品 SLO：

| 能力 | ON 未查完整响应 ms | OFF 未查完整响应 ms |
| --- | ---: | ---: |
| definition | 672 | 1340 |
| typeDefinition | 1430 | 1455 |
| hover | 497 | 505 |
| signatureHelp | 454 | 464 |
| completion | 497 | 500 |
| completionResolve | 484 | 491 |

body edit hover ON 1098 ms、
OFF 1103 ms；
trace 恢复 ON 5762 ms、
OFF 5762 ms。
准备、暖机和恢复全部记录，不从热查询时间中隐藏冷准备。

| 进程 | 准备 ms | Node 峰值 MiB | 产品进程树峰值 MiB |
| --- | ---: | ---: | ---: |
| on-trace | 7419 | 1051.01 | 1220.68 |
| on-timing | 7321 | 809.50 | 978.61 |
| off-trace | 7110 | 1200.79 | 1370.03 |
| off-timing | 7514 | 1197.01 | 1366.11 |

RSS 为外部进程树采样，产品峰值包含 Node 和 sidecar，不包含独立 harness/
sampler；请求 50 ms、实际采样间隔 P95 131–132 ms。单轮 OFF 峰值
明显更高且超过正常软预算，不能推导稳定收益、PSS 或长期物理内存回收。
释放 LS 不保证 RSS 立即下降，自动 Worker 回收在本轮关闭。

## 冻结和回滚

当前冻结 `.bench/l06-stage-frozen-inputs-v4.json`：
315 测试/工具文件、172 登记入口（fast 166）、80 历史与当前 benchmark
输入、40 份修改源/测试/工具文件；完整 check:fast 正在运行，仍待终态
GREEN、身份复核与 A–E 完成审计，不用 focused 或旧 whole 替代。

关闭 opt-in 晋升及相关实验政策即可回到已有完整安全路径；未改公共
capability、语义 owner、取消/版本 fences、正常诊断、预算或超时。
500 ms/P95、最终内存收益、semantic-ready、长期 soak、PSS/DevEco、
100k、平台和发布评审统一留给 L08。
