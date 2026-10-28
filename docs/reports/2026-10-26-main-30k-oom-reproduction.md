# 最新 main：Mac Zed 30K Photos OOM 复测

日期：2026-10-26。源码固定为 `17e923f0cb8c430b6a10793a0f3d2f9097febfec`，GitHub main 在开始和收尾均为该提交。
证据根：`.bench/zed-30k-main-repro-20261026/`；本文未特别注明的证据路径均相对此目录。
前次报告：[Mac Zed 30K Photos：OOM 现场与隔离诊断](2026-10-26-macos-zed-30k-oom.md)。

## 结论及未完成部分

**最新 main 下，同目标的定义请求仍失败、Program 构建仍不能在资源界限内完成。此次没有放任运行到原现场约 4GB 的 fatal OOM，不能声称再次证明了原始 4GB 崩溃，也不能声称问题已修复。**

- 普通协议运行：定义 30120.812ms 后返回 `-32603 / Semantic worker unavailable`；随后 references 尚未返回就触及外部 RSS 界限。
- 独立观测运行：计划沿前次脚本执行 33 次定义、再查引用；第 1 次定义在 28089.706ms 时因同一 RSS 界限被中断。其余 32 次定义及 references 未执行，未将失败样本排除。
- 真实 Zed 已实际启动最新 LSP，自动 documentHighlight/codeAction 请求出现 superseded、不可用错误及一次 Worker 换代；**实际连续跳转点击数为 0**。macOS 拒绝辅助功能访问（System Events `-1719`，`AXIsProcessTrusted=false`），所以本轮尚未完成用户要求的真实 UI 连续点击复现。协议结果不替代此验收。
- 本轮没有 fatal OOM 日志。外部保护先停止了两个协议运行；真实 Zed 自动请求场景由取消监督触发换代。后者验证了监督介入，未提供换代后成功跳转的证据。

本轮只取证、安装独立测试副本及新增报告，没有修改产品源码、真实项目或 SDK，没有提交、推送、合并或发布。缓存性能 TODO 继续暂缓。455 文件冷目录 3 秒门槛与本轮无关。

## 版本和实际加载身份

环境为 macOS 26.6.2 / 25G83、x86_64、16GiB。Zed 1.23.3，bundle version `20261012.135353`；运行日志进一步记录 `1.23.3+stable.371.96a1b1b5389efff473fc2306f7f8c690f2e1a417`。
受控复测均用 `/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node`，与前次隔离诊断相同；原用户事故 Node 精确版本仍未测。
本次独立安装使用 PATH 中的 pnpm 8.3.1 和冻结锁文件；不是主分支 CI 的 pnpm 8.15.9。构建后的 LSP/Worker 字节哈希与已验候选一致，安装日志完整保留；本轮没有将此前完整检查结果冒充 30K 验收通过。

包版本仍为 `0.1.0-local-beta.1`，所以不能只看版本名称判断是否更新。独立安装 release 为：

```text
.bench/zed-30k-main-repro-20261026/runtime/libexec/arkts-language-server/
  0.1.0-local-beta.1-5b4eda43ade994771151d1426fc62bb70b5cbb2583e097b1c795f561ed34dbdf/
```

| 产物 | bytes | SHA-256 |
| --- | ---: | --- |
| server.cjs | 933099 | `88797005140b102fd0120dbfc65ae540415ee94f0bd64011f682386b62fd2058` |
| semantic-worker.cjs | 9361990 | `302a6fbe24a803378c9b3eea2982e94e79f1cc259db2b8bff549084b04c0d077` |
| arkts-index-sidecar | 4981840 | `8e9babc3bdaaa32747e5f55df9016dc196431e2baa1250180de1f20301674016` |
| extension.wasm | 323267 | `3776f76d011d2e3b2fafc5df67a6361558704107d51c9bbfa284b4889a5da774` |
| grammars/arkts.wasm | 2166276 | `700dc7496fcd9ed29ce4a0c68b98d9380b89e738f410edf596cf1f8dbe03a7b1` |

源构建与独立安装目录的 LSP、Worker、索引二进制逐项哈希一致。实际 Zed 传输记录 `zed-ui-trusted-restart/wire.ndjson` 的 `server.spawned` 确认 PID 49140、上述 release 路径、Node 26.3.0、server SHA 和真实项目 cwd；不是日常旧包。
独立观测的 `worker.constructed` 和 `worker.module.loaded` 进一步记录真实加载的 Worker 路径及原始字节 SHA，均为上表 Worker 哈希。
扩展目录 fingerprint 为 `eb6016942ed9b39cc1f6687fc11f5ea4c6c0029a83f8f9ab85edcfa5a18474b7`，见 `environment-before.json`。

**main 的 LSP/Worker 哈希与昨天报告中的“候选版本”完全相同。** 本次合并没有加入新的 30K 内存修复；不能把本轮与昨天候选的时差解释成新的优化收益。
日常启动器仍保留旧 release `9a63187c…`、旧 server SHA `aec84852…`，本轮没有覆盖它；见 `daily-installation-preserved.json`。
测试副本与日常安装明确分离，实际运行身份由新进程记录确认。

## 项目、SDK 和原步骤还原

项目使用用户指定的真实夹具目录 `/Users/liuhui/Documents/code/applications_photos_30k`，没有缩小为 288 文件，也没有换符号、SDK或提高内存限制。

- 30000 个 `.ts/.ets`，173645329 bytes；288 个原文件、29712 个复制文件。
- 与前次 `project-source-sha256.txt` 逐个比对，30000/30000 一致；运行前后源码清单也完全一致。
- 前后清单 SHA 都是 `efe5dbc1ddbe32ec9965f6192021c3214a910279e1ec28b8a2531634e2294098`。
- 1938 项原有受 Git 跟踪输入未改变，不可变产品产物未改变。唯一预期变化是独立测试配置中的观测启动器，原件有备份；详见 `input-integrity.json`。

SDK 为 `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，API 24 / component 6.1.1.125。
协议运行显式沿用前次指定路径；真实 Zed 使用 default 选择，也实际选择同一路径和版本，metadata 为 identified。
没有认证其全部声明完整性。`sdk-metadata-closeout.json` 保存收尾 metadata 文件摘要；昨天没有完整 SDK 声明树摘要，不能补称全 SDK 跨日逐字节一致。
固定编译器为产物内 ohos-typescript 4.9.5-r10。

目标固定为：

```text
product/phone/src/main/ets/picker/PickerUIExtensionAbility__copy_002.ets
LSP position: { line: 76, character: 20 }，0-based UTF-16
CLI 定位: :77:21
      params.filterMediaType = wantParam?.filterMediaType as string;
```

原始用户事故没有完整 UI 输入录像或逐请求 URI/输入时间；前次依靠事故后 Zed 状态及行列匹配得到此文件，不能升级为原始请求 id 71 的直接证据。
前次控制复现 `old-real-picker-sequence/actions.ndjson` 明确包含 **33 个 serial definition，随后一个 references（includeDeclaration=true），逐个等待响应，没有人为 sleep**。
本轮保存为 `original-reproduction-plan.json`（34 个请求）。这是可重放的控制序列，不是原始 UI 的精确点击节奏；原事故完成日志的时间戳不能冒充输入时间戳。

## 协议复测：逐次结果

每个运行都创建新 LSP/Worker、新索引缓存目录，语义会话为冷态；文件系统页缓存未清空且此前做过输入校验，不能称 OS 冷缓存。
各运行串行，未并发施压。没有 `--max-old-space-size` 覆盖。独立观测测得主/Worker 默认 heap limit 均为 4192MiB。
外部父进程沿前次界限：每 400ms 读取 RSS，Node RSS 超过 1536MiB 或运行达到 90s，停止自己启动的语言进程。采样可能越过界限少量，不是新产品参数或通过标准。

| 运行 | initialize 响应 | 语义初始化 | 首次定义 | references / 序列终点 |
| --- | ---: | --- | --- | --- |
| protocol-baseline-plain | 62.444ms | 2765.093ms，degraded | 30120.812ms，`-32603` | 已发送，463.499ms 后因外部停止而中断，无响应 |
| protocol-sequence-observed | 69.969ms | 2007.933ms，degraded | 28089.706ms 后因外部停止而中断 | 其余 32 次定义和 references 未发送 |

普通运行严格沿用前次 `run-current-plain.mjs` 的准备顺序：initialize → 等 semanticPreparation terminal → didOpen → definition → references。
独立观测沿用前次 `run-case.mjs` 的序列准备顺序：initialize → didOpen → 33 次定义 → references；所以初始化与首次请求存在重叠。
它增加阶段/堆观测，不能把两行时差当成插桩开销或优化收益的单变量测量。

协议耗时从 driver 发起 `session.request` 到响应 Promise 完成或运输中断；包含等待、处理及传输。表中中断耗时不是成功响应时延。
整个普通/观测实验分别 35399.474ms / 30108.290ms，另包含启动与停止清理；不与请求时延重复相加。
完整请求/响应在 `actions.ndjson`、`server-stdout.raw`、`stderr.raw`；`protocol-summary.json` 只是有界摘要，不冒充完整消息正文。

## Program / checker 和 Worker 证据

普通运行在 30 秒监督点记录：`method=define, reason=execution-deadline, phase=program`，
Program starts/returns=1/0、checker starts/returns=0/0、synchronize starts/returns=1/0。
第一条定义因此失败。这一运行只有一个 `semantic.worker.started`，未观察到第二个物理 Worker 启动；不能将恢复尝试记成恢复成功。

独立观测运行通过私有 preload 观察原函数调用、解析计数和 SharedArrayBuffer，保留原返回值，不注入故障或跳过 prepare，不改磁盘上的产品文件：

| 项 | 实际观察 |
| --- | --- |
| membership | 20000 paths，2457452 path bytes，partial / path-count-limit |
| Program 入口 | 282 total，280 project，2 external |
| Program / checker | 1 次 Program 开始，0 次返回；0 次 checker 开始 |
| 最后解析检查点 | 8900 次 SourceFile parse，8761 个不同项目文件、139 个项目外文件 |
| Host 快照 | 同检查点 8900 次调用、8900 个不同路径；不是磁盘 read 次数 |
| Worker 堆 | 检查点观测峰值 1365.800MiB；主 isolate 12.881MiB |
| Worker 生命周期 | 1 次构造，0 次重建；外部 SIGTERM 结束整个进程，未取得独立 worker.exit 回调 |

30000 个磁盘源码、20000 个 membership、280 个 Program 项目入口、至少 8761 个已完成解析的项目文件是不同口径。
Program 从未返回，最终 SourceFile 数未测；检查点后的解析和瞬时堆峰值也未测。
本轮证据支持“仍在 Program 展开/构建期间增长”，不把它标成 checker 卡死、已证明死循环或已证明永久泄漏。
没有完整 heap snapshot/retainer 分布，不能把所有字节归给 AST、SDK 或缓存。

## 真实 Zed：有效加载、自动请求及 UI 阻挡

保留三次启动尝试，不将未启动语言服务的尝试记成通过：

| 目录 | 结果 |
| --- | --- |
| zed-ui | 打开原项目与目标位置，但独立 profile 尚未信任项目；Zed 明确等待信任，LSP 未启动 |
| zed-ui-trusted | 已复制原项目的单条已有信任记录，但 macOS 把第二次启动转交已有 Zed 实例；LSP 未启动 |
| zed-ui-trusted-restart | 正常退出唯一的测试实例后启动已信任配置；真实 Zed 成功加载新版 LSP |

没有设置全局“信任所有目录”。只读取日常库中该项目已存在的一条信任记录并复制到测试库；日常数据库未修改。
为恢复测试状态仅复制不含未保存内容的测试 workspace，未复制用户其他编辑器内容；`ui-trust-setup.json`、`ui-graceful-restart-preflight.json` 保存证据。
正常退出使用应用自己的 quit，没有强杀 Zed、没有 saving=no；当前测试 Zed 窗口继续保留。

有效 UI 场景从 CLI 启动到真实 LSP spawn 为 2560ms；initialize 请求/响应为 153.564ms，语义初始化 2198.772ms，状态 degraded / project-membership-incomplete。
这些区间并非互斥，自动请求可能与初始化重叠，不能相加为独占阶段总耗时。
真实客户端两次 didOpen 的文本 SHA 均与磁盘目标一致，position=76:20；保存的 UTF-8 offset 3377 也对应此 UTF-16 位置。
客户端实际发出 didOpen → didClose → didOpen，无 didChange；其 UI 内部产生原因本轮未测，不能冒充用户主动关闭重开。

| 真实 Zed request id | 操作 | 传输观测耗时 | 结果 |
| --- | --- | ---: | --- |
| 2 | documentHighlight，76:20 | 5136.925ms | []，产品日志 outcome=superseded |
| 3 | codeAction | 4970.653ms | []，产品日志 outcome=superseded |
| 4 | documentHighlight，76:20 | 883.633ms | -32603 / Semantic worker unavailable |
| 5 | codeAction | 716.352ms | -32603 / Semantic worker unavailable |

真实客户端还发出两条 `$/cancelRequest`。监督日志明确为 `method=diagnose, cancellation-deadline`，phase=program，Program 1/0、checker 0/0。
Worker started 为 thread 1、thread 2 两次，确认一次换代；未直接记录 UI 运行中的物理 exit 回调或并存峰值，不能用启动事件虚构这些计数。
换代后没有成功 definition/references 样本。已响应 superseded 不能算语义成功；也不能仅凭两条客户端 cancel 给某个内部 diagnose 命令指定因果归属。

原生 UI 工具仅提供浏览器，Mac fallback 则被系统拒绝辅助访问：`osascript -1719`、Swift `AXIsProcessTrusted=false`，标准授权提示后仍为 false。Zed 窗口截图也未成功。
已请求用户开启权限，没有收到就绪确认。**没有注入任何虚拟 LSP definition 来冒充点击，实际点击 0 次、definition 0 次、references 0 次。**
本次实际 UI 仅覆盖打开、初始化及自动请求。记录包括 `wire.ndjson`、双向原始帧、`ui-actions.ndjson`、完整服务日志及 Zed.log。
传输 tee 不创建请求、不改帧/参数；会同步写观测文件，UI 表中的耗时包含该 I/O，不称无观测开销的基准。

## RSS、堆和增长趋势

单位 MiB。每个 PID 的 RSS 只算一次，Worker 线程共享 Node RSS，不按线程重复求和；不同进程 RSS 之和仍可能重复包含共享映射页面，不能称物理独占内存。

| 运行 | Node RSS 采样峰值 | 原生索引独立峰值 | 同次采样 Node+索引峰值 |
| --- | ---: | ---: | ---: |
| 普通协议 | 1537.113 | 2923.363 | 4352.402 |
| 阶段观测协议 | 1546.953 | 3031.367 | 4578.320 |
| 真实 UI 自动请求 | 471.867 | 3025.250 | 3208.402 |

各进程独立峰值不保证同时发生，因此不能直接相加替代第三列。UI 的 Zed/proxy/CLI 未混入 Node+索引列；完整进程树峰值为 3449.371MiB，Zed 单进程峰值 172.898MiB、tee proxy 52.004MiB，另见原始资源 CSV。
外部保护沿前次只作用于 Node RSS；约 3GiB 的原生索引占用单独揭示，前次没有测它，不能声称它相对昨天上涨了多少。

普通协议最近实际采样的趋势如下，不做插值；相对首个资源采样：

| 时间 | Node RSS | 原生索引 RSS |
| ---: | ---: | ---: |
| 4.800s | 311.988 | 724.938 |
| 10.019s | 537.574 | 1451.371 |
| 14.838s | 753.301 | 2004.785 |
| 20.034s | 993.980 | 2914.785 |
| 30.060s | 1390.102 | 2808.871 |
| 33.251s | 1537.113 | 2815.289 |

UI 换代后，Node 在 19.888s 的实际采样为 183.863MiB，结束前为 182.973MiB；索引结束前仍为 3025.250MiB。
这只说明本次换代后的进程观测，没有证明所有缓存/租约无残留或长期无泄漏。
UI/普通协议内置 Worker checkpoint heap 最大值仅 45.651/46.971MiB；阻塞期间无法持续采样，不能将其当作 Worker 堆峰值。独立观测的 1365.800MiB 才覆盖大量解析中的检查点，仍非绝对峰值。

两次协议均因 RSS 保护停止，均没有 fatal OOM；UI 在约 86.065s 显式终点停止自己的 LSP/索引，Zed 窗口保留。终点后的 cannot read LSP headers 是测试主动停止的结果，未计成自然 OOM。
`process-cleanup-audit.json` 确认 7 个本轮语言/索引/tee PID 均退出；预先存在的非本轮 PID 71918 没有触碰或计入统计。收尾系统 memory_pressure 查询 free percentage=67%。

## 与昨天对照及判断

| 对照 | 已有证据 | 本轮可以得出的结论 |
| --- | --- | --- |
| 原用户 4GB OOM | PID 61048，旧主线程包，约 4088MB GC 后 fatal；完整 UI 顺序缺失 | 本轮未放任到该崩溃，不能称精确 UI OOM 重现或已排除 |
| 旧包 controlled picker sequence | 512MiB old-space，33 次定义全空后 references，约 7.011s 实验 SIGABRT | 堆预算、编译器和架构不同，不比较成功时延/改善倍数 |
| 昨候选默认堆 plain | 同 LSP/Worker SHA，约 30.983s 实验触及 1553.398MiB Node RSS，无定义响应 | 本轮同类失败仍在；此次定义先触发 30s 监督后才停止，不是功能通过 |
| 昨候选默认堆 observed | 定义 30122.178ms 错误，Program 1/0、checker 0/0 | 本轮普通定义 30120.812ms，仍停在 Program；不能认为 main 解决了该成本 |

与昨天候选的可比性仍受真实路径与隔离副本路径不同、OS 缓存/负载未固定、观测方式及序列准备顺序影响。无多轮同条件中位数/最大值结论，未作复杂度或泄漏斜率推断。
当前可确认的瓶颈仍是 partial membership 下宽入口 Program 展开，且原生索引占用也大；调用链沿用前报告及相同产物 SHA 的证据。
监督截止时间/取消换代改善了失控时的边界，但本轮没有证明正确查询可用，更没有把恢复视为内存问题根治。

## 复现与证据入口

从仓库根执行，runner 拒绝覆盖既有 tag；此元数据和不可变安装包固定为上述提交。将来测新 main 必须重新构建并更新身份，不能复用旧元数据冒充最新。

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node .bench/zed-30k-main-repro-20261026/run-replay.mjs baseline-plain fresh-plain
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node .bench/zed-30k-main-repro-20261026/run-replay.mjs sequence-observed fresh-sequence
python3 .bench/zed-30k-main-repro-20261026/summarize.py
```

真实 UI 命令记录在对应 `ui-actions.ndjson`。重试 UI 需先解除 Mac 辅助功能阻挡、确认现有 Zed 实例/未保存编辑，再使用新 tag、独立 profile 及同一单项信任状态；不要删除旧 stop.flag 或复用旧输出覆盖证据。该流程尚未完成连续跳转验收。

- `environment-before.json`、`github-main-closeout.tsv`、`input-integrity.json`：版本、完整项目输入及不变产物。
- `original-reproduction-plan.json`：前次 34 请求控制序列及原始 UI 节奏的未测边界。
- `protocol-*/result.json`、`actions.ndjson`、`server-stdout.raw`、`stderr.raw`：逐次成功/错误/中断，不删除失败样本。
- `protocol-sequence-observed/observations-*.ndjson`、`roots-1-1.json`：Program、checker、解析、堆及真实 Worker 字节身份。
- `zed-ui-trusted-restart/wire.ndjson`、双向 `.raw`、`logs/`、`Zed.log`：真实客户端、阶段及换代；不能与协议重放混同。
- 各运行的 `resources.ndjson` / `resources.csv`、`summary.json`、`process-cleanup-audit.json`：逐次 RSS、统计口径和清理。

取证准备中，旧清单的“路径 SHA”格式曾按反向格式解析失败，发生于运行前，未计为产品样本；首次收尾断言也把预期的测试启动器替换列为变化，原观察保存在 `input-integrity-initial-launcher-observation.json`，随后明确区分可变观测启动器与不变产品产物，没有把变化悄悄抹去。

本轮真实连续点击仍受系统 UI 权限阻挡。除此之外，没有为诊断去实施缓存优化或其他产品修复。

## 后续详细归因补证（2026-10-26）

详见 [main 30K：不可用详细归因](2026-10-26-main-30k-unavailable-root-cause.md)，新增证据为 `.bench/zed-30k-unavailable-cause-20261026/`。

- 普通 definition 先触发产品 30s execution-deadline，随后外部 RSS 保护才中断 references；33 次序列则先被外部 RSS 保护停止，第一个 definition 没有 LSP 错误响应。这两种终态不可混同。
- 真实 Zed id 4/5 的完整错误均为 -32603，data 字段缺省；两条响应在 04:43:05.366，新 Worker 直到 04:43:06.734 才启动，因此不能称“重建后仍不可用”。原真实 UI 没有恢复后重试样本。
- 同输入、同公开 LSP 生命周期的独立协议重放抓到：didClose mutation 先将活跃 diagnose 标为 content-modified；同步 Program 在取消提交屏障内未于 1s 内结清，父监督器退役旧 Worker；尚未 dispatch 的新高亮/codeAction 随旧队列被拒绝。没有触及恢复熔断，只换代一次。
- 补测中恢复后的同目标 definition 成功（4803.219ms），重复成功（50.296ms）；新 Program 为 87 个项目入口、421 个 SourceFile。旧 Program 有 280/281 项目入口，含 109 个复制/原始 CommonComponents barrel。该结果仅证明协议会话局部恢复，不能替代真实 UI 连续点击或全项目 READY 验收。
- 独立细分运行的截止前 29481ms 构建前缀中，FS 调用占 53.79%、解析占 22.61%、模块解析自身占 16.55%；已解析 7467 个项目文件，native realpath 调用 186768 次。checker 尚未进入；未将 Program 未返回或高 RSS 直接归因为 OOM/死循环。

原运行的失败状态、未完成 UI 验收和所有原始数据保持不变；本次仅补诊断、脚本与报告，没有实施产品修复、缓存优化或合并。

2026-10-27后续：修复与最终工作树候选的规模/协议验证见[实施报告](2026-10-26-30k-optimization-execution.md)。
本报告的旧制品、失败、外部保护与UI权限限制仍按原记录保留；后续2050/2050 fast不追认这些样本通过。
