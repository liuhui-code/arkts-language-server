# R1 conservative references batching — macOS 实测

状态：**正确性原型完成；产品 memory/latency gate 失败；默认仍为 legacy。**

代码父版本为 `b70367964bf7b32e66524b08b4aeb1acde6bd8ff`。测试使用当前未提交构建，
Node v26.3.0、macOS x64、DevEco SDK API 24 / ETS 6.1.1.125，启动入口为仓库
`dist/server.cjs --stdio`。外部进程每 50 ms 采整个 Node PID RSS；transient verifier 是同进程
worker thread，已包含在该 RSS 中且未重复相加。

## 实现

- `ARKTS_REFERENCES_STRATEGY=legacy|batched`，默认 `legacy`；
- `ARKTS_REFERENCES_BATCH_ROOTS=64`，仅限制 candidate roots，不冒充依赖闭包硬上限；
- query 文档和全部 open overlays 固定进入每批；
- 完整 project membership 继续作为准入、结果映射与完整性真值；
- 每个 batch 使用一次性 verifier worker，串行执行官方
  `getDefinitionAtPosition/findReferences`，返回后 dispose LS 并终止 isolate；
- 合并后按既有顺序去重；任一 incomplete/cancel/error 使整个请求失败，不返回部分结果；
- 公开取消回归会在首批完成后取消活动请求，确认后续 batch 不再启动且同进程可完整恢复；
- opt-in trace 仅记录计数、时长与内存数字，不记录源码或完整路径。

## 正确性结果

Gramony / ChatCube / RemoteDesk 的 A（冷 references）、B（completion+definition 预热）、
C（references×10，再做未保存注释后请求）全部完成。共 39 个 responses 分别保持 8、33、71
条引用，每一个 response 都与对应 legacy A1 的 normalized URI/range set 逐项全等；C 的第 11
次未保存编辑也完全一致。没有 OOM、空结果、SDK 错配或 partial-success。

| 工程 | commit | membership | 最大 batch project SourceFile | 最大 Program SourceFile | batches/request |
|---|---|---:|---:|---:|---:|
| Gramony | `0a1ee4b026b6736671f0030ba9859aceaa962298` | 77 | 72 | 696 | 2 |
| ChatCube | `fd729d0f5c607763adc8ce054ad29171c66c78dc` | 263 | 201 | 876 | 5 |
| RemoteDesk | `8edc187868e94ed41634e8a6c4c4c072e3a48679` | 829 | 643 | 1,301 | 13 |

这证明 root working set 已拆批，并不证明实际 import closure 有理想上界。RemoteDesk 最大单批仍
包含 membership 的 77.6%，是收益不足的直接证据。

## 冷请求对照

Legacy 数值取此前同环境三个独立进程 A1；R1 数值取隔离版新进程。峰值为完整会话 Node RSS。

| 工程 | legacy request | R1 request | 倍率 | legacy peak RSS | R1 peak RSS | 峰值变化 |
|---|---:|---:|---:|---:|---:|---:|
| Gramony | 2.879 s | 6.130 s | 2.13× | 431.7 MiB | 539.8 MiB | +25.0% |
| ChatCube | 3.729 s | 16.362 s | 4.39× | 530.8 MiB | 588.9 MiB | +10.9% |
| RemoteDesk | 6.015 s | 51.607 s | 8.58× | 804.6 MiB | 809.6 MiB | +0.6% |

因此 30% peak reduction 和 3× cold latency gate 未通过。

## 预热与重复行为

预热 B 的 R1 峰值为 791.9 / 983.6 / 1,455.9 MiB。completion 当前已建立完整 interactive
Program；虽然 references 前会 dispose resident context，但 V8 不保证旧对象立即回收，再创建
verifier isolate 会形成总进程峰值叠加。legacy warm references 约 53–80 ms，而 R1 仍需要完整
2/5/13 batches，因此 warm latency gate 明确未通过。

同-isolate早期原型在 RemoteDesk C 中峰值升至约 1.98 GB。改为每批 transient worker 后：

| 工程 | 11 次结果一致 | C session peak | 第 1 次 | 第 11 次 |
|---|---:|---:|---:|---:|
| Gramony | 是 | 726.6 MiB | 6.243 s | 6.116 s |
| ChatCube | 是 | 816.3 MiB | 17.573 s | 28.648 s |
| RemoteDesk | 是 | 1,010.3 MiB | 51.500 s | 59.816 s |

RemoteDesk 第 4–11 次请求 RSS 峰值稳定在约 795.5–804.2 MiB；第 10/11 次分别约
804.2/802.1 MiB，未出现持续/叠加的线性增长。上述 session peak 包含第 2 次约 1,010.3 MiB
的更高锯齿峰值。

## 判定

R1 的核心因果实验成立：减少 compiler roots 能减少单批 Program cardinality；transient isolate
能消除跨 batch/request 的不可控保留。但保守扫描全部 roots 会重复装载 SDK/compiler，且单个
dependency closure 仍很大，所以当前实现没有带来产品级峰值收益，延迟明显不可接受。

结论：保留默认关闭的实验路径、测试和观测；不切换生产默认，不发布“5 GB 已修复”的结论。
下一阶段必须先用 ProjectGraph semantic units 与 Rust occurrence/alias/re-export candidates 减少
需要证明的 batches，并继续由官方 compiler 做最终身份验证。

本机原始报告按
`/private/tmp/arkts-<project>-<mode>-bounded-r1-isolated-<mode>.json` 命名；
它们包含请求 transcript、50 ms RSS 曲线、批次 trace 和完整规范化结果，不纳入仓库以避免提交
机器路径及真实工程数据。

在最终磁盘文件身份校验接入后，另以明确的 `batched + 64 roots + trace` 参数重新执行
RemoteDesk 冷请求：51.607 s、峰值 848,941,056 bytes（809.6 MiB）、13 batches、最大
Program/project SourceFile 仍为 1,301/643；71 条结果、已知真实位置与范围校验全部通过。
