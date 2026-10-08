# L01：L3 后显式 Semantic Worker 回收的 Settings 对照

日期：2026-10-08。结论：**实验切片有可重复的 RSS 收益，但 L01 资源准入与产品时延仍 BLOCKED**。这是仅在 benchmark 双开关下显式触发的控制，不是生产自动回收策略。

## 固定输入与回放

- 真实工程 `applications_settings` checkout `ecc550dfaed880e04e38a2477eb7235cd50475b9`，工作树 clean；工程文件 digest `4becf56cb2ff65cc58bd1ae53b6937b194f9020770ad397e526f3a51b85b0d40`。未复制文件、未改工程边界。
- 当前 server HEAD `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`，dirty build 输入 digest `37c5aab764b9419fb1835747189bb23e905e57e8b3d549e5fc9052e01a53bf57`，`dist/server.cjs` digest `dae9e72e279a1f3fe94bea845b058da9d9b4d72f40a5c96d5e7ba83f04dd9042`；Node `v26.3.0`、`ohos-typescript 4.9.5-r10`、本机 DevEco SDK API24 声明 digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`。这是已授权的 API24 兼容轨，不是 API23 matched-DevEco 结论。
- 两份 [对照 manifest](../../bench/references/manifests/settings-resident-l01-recycle-control-api24.json) / [实验 manifest](../../bench/references/manifests/settings-resident-l01-recycle-probe-api24.json) 仅 `benchmarkId` 和 `ARKTS_L01_SEMANTIC_WORKER_RECYCLE=1` 不同。均启用 `indexed-batched + closure + full SDK`、1024 MiB 策略预算、正常自动诊断、50 ms 请求采样、实际 L3 驱逐见证、10 秒等长驱逐后观察窗口及 5 秒查询后 idle。
- 两个真实目标：先在 `product/phone/src/main/ets/Setting/Home/controller/HomePageMenuManager.ets` 的 `HomeInitData` 使用点 `40:37` 做 definition；再在 `common/src/main/ets/sendable/HomeInitData.ets` 声明 `16:13` 做未查询的 `includeDeclaration=true` references。坐标为零基 UTF-16。
- 六个独立新进程，顺序：control-4 → recycle-4 → recycle-5 → control-5 → control-6 → recycle-6。未强制 GC、未抓 heap snapshot；worker thread RSS 不另加到 Node 进程 RSS。原始曲线和完整 LSP transcript 保存在 `.bench/l01-recycle-{control,probe}-{4,5,6}.json`（本机忽略产物）。先前编号 1–3 的六个原始报告使用修复并发 overlay 丢失缺陷**之前**的另一 build，仅作为历史试验，不纳入下表统计。

复现单轮：

```bash
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l01-recycle-control-api24.json \
  --out .bench/l01-recycle-control-next.json

node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l01-recycle-probe-api24.json \
  --out .bench/l01-recycle-probe-next.json
```

CLI 退出码为 1，因为全部运行均报告 `READINESS_UNSUPPORTED`：当前没有 generation-bound public semantic-readiness contract。这个状态独立于已执行的语义和诊断精确性，不得改写为整体 PASS。

## 结果

| 轮次 | 路径 | 首次 definition | L3 后 refs | 精确结果 | Node 峰值 RSS | 产品树峰值 RSS | 5 s idle Node RSS |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: |
| 4 | control | 3,118 ms | 4,570 ms | definition 1/1，refs 10/10 | 827,162,624 B | 872,804,352 B | 749,387,776 B |
| 4 | recycle | 2,831 ms | 4,571 ms | definition 1/1，refs 10/10 | 568,537,088 B | 615,636,992 B | 509,382,656 B |
| 5 | recycle | 2,872 ms | 4,574 ms | definition 1/1，refs 10/10 | 567,668,736 B | 614,457,344 B | 519,929,856 B |
| 5 | control | 3,049 ms | 4,524 ms | definition 1/1，refs 10/10 | 829,706,240 B | 876,728,320 B | 786,030,592 B |
| 6 | control | 2,844 ms | 4,509 ms | definition 1/1，refs 10/10 | 828,407,808 B | 870,105,088 B | 747,163,648 B |
| 6 | recycle | 2,820 ms | 4,653 ms | definition 1/1，refs 10/10 | 586,035,200 B | 630,546,432 B | 543,006,720 B |

每轮均有两份完整 v1 自动诊断（对应 count 1/0），无超时、OOM、空 refs、重复位置或部分结果。每轮均实见 sequence 1 的 `memory-level3` 驱逐；三次实验均确认旧/新 Worker threadId 为 `1→2`，并在第二请求前完成当前文档/configuration 重放 ACK。此前无 L3 时的显式请求由公开 LSP 测试拒绝；未设置双开关时不注册回收控制。

对照的 Node 峰值中位数为 **828,407,808 B**，实验为 **568,537,088 B**；三对各降 **31.3% / 31.6% / 29.3%**。L3 后、第二查询前 10 秒观察终点的 Node RSS 两组仍接近（control 约 434–440 MB，实验约 431–438 MB）；主要差异发生在随后的 compiler 查询峰值和 idle 尾值，不能说 Worker 替换立刻释放了约 260 MB。refs 中位时延为 **4,524 ms → 4,574 ms**，基本未改善；显式替换另耗约 0.3 秒但发生在等长观察窗口内，不应藏入产品用户请求的端到端指标。

## 判定与边界

这三对反序样本支持：在此固定 Settings/API24、已驱逐且静默的场景，丢弃旧 semantic Worker isolate 与后续较低的**采样**峰值关联，并未破坏测试到的完整引用、定义或诊断。独立的真实 LSP 回归还以未保存 v2 overlay 覆盖了正常替换和 witness 超时两条路径：超时 RED 曾返回空 definition，修复后先把编辑冲刷给旧 Worker 再报控制错误，v2 导航和诊断恢复精确。外部采样请求 50 ms，实测间隔中位约 131–132 ms，故峰值只是下界；macOS RSS 不是 PSS，样本量也不足以宣布长期稳定或 release 门禁通过。该控制无法回答未发生 L3、更多并发请求、100-edit soak、`MenuController` 24 批保守范围、原始 >3 GB 案例及 Windows 的表现。

**L01 保持 BLOCKED，L02 不获生产准入。** 不自动回收、不提高预算、不关闭诊断、不改变 references 默认路径。若继续研究，应在相同公开协议下扩到编辑/并发/长时压力，核算 Worker 替换成本与总进程 PSS；500 ms、原始内存和 semantic-ready 门禁仍未达成。

固定工作树最终验证：获准 macOS 外部 RSS 采样的 `pnpm check:fast` **1327/1327 PASS，0 FAIL**；`git diff --check` 通过，两个 manifest 在最终重建后仍 `PINS_MATCH`。默认受限沙箱的同一测试套件无法读取子进程 RSS，不能把其采样器错误当作语义回归。
