# IDX-V1-ENV-004：规模插桩验证被系统休眠打断

此项是测试环境中断，不是已证实的产品初始化死锁。原失败不删除、不改为 PASS。

## 时间线和证据

固定旧版298d，`unrelated-20000-baseline-0-profile-cold`：初始化观测最终报
`semantic preparation missing terminal`，查询操作数0。Native已报告20000文件 ready；
Node SDK准备日志存在，不能据此断定编译器卡死。最终 shutdown ACK、观察到 code0、无保护终止，
三份数据库后检通过。没有 OOM、watchdog 或 Worker 重建证据。

系统 `pmset` 在2026-11-08 21:14:44 +0800明确记录 Clamshell Sleep，持续63秒；
21:15:47短暂唤醒后，21:15:52再次进入睡眠。与该会话13:14:25–13:16:46 UTC重叠。
墙钟与单调耗时差异只是旁证，归因以系统记录为准；不将整个未测区间分配给编译器。

原始证据：`.bench/index-versioned-maintenance-20261104/scale-tail-evidence-20261108/power-2113-2116.log`，
`final-acceptance-10/scale-runs/unrelated-20000-baseline-0-profile-cold/result.json`。

用户确认保持唤醒后，用同一77文件旧运行包、SDK、20K夹具及相同17项查询，另建隔离冷缓存再暖开：

| 会话 | 初始化及准备 ms | 查询 | 关闭 |
| --- | ---: | --- | --- |
| 独立冷重试 | 27137.14 | 17/17 PASS | NORMAL，无保护干预 |
| 同一新缓存暖重试 | 24940.04 | 17/17 PASS | NORMAL，无保护干预 |

收据：`sleep-interruption-20261108/diagnosis.json`；两份 `retry-baseline-unrelated20k-*/result.json`。
原中断 FAIL 仍计入全部尝试；成功重试只用于该对照坐标，不抹除失败，也不是SDK完整性证明。
复测与全部剩余会话仍需按时间窗口核查系统休眠，不能将休眠时间算作连续耐久负载。
没有修改电源设置或产品超时；既有无关 caffeinate 进程原样保留。

## 续跑边界

`final-acceptance-11/continue.py` 在读取旧收据后核对最终完整检查、冻结源码、驱动/静态输入、
79个候选运行文件、77个旧运行文件及SDK metadata。复用96个已完成普通会话和10个有效插桩会话，
补上述冷暖重试，再按原顺序串行执行剩余20个插桩坐标。原收据完全不改。
续跑策略测试先RED（模块尚未实现），后3/3 GREEN；未知失败不跳过，只有原明确证明的旧版容量拒绝
可按既有严格策略保留FAIL并继续。候选没有例外。

之后在原始隔离Photos的全量一致副本开展7200秒单会话混合协议耐久；运行时继续使用完全相同的
`final-acceptance-10/runtime`，无产品重编译或部署。原始Photos、日常Zed和真实缓存均不修改。
**当前为运行中，尚未完成耐久；不是实际Zed UI验收。**
