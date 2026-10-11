# L04：同内容晋升后 resident references 的公开组合合同

日期：2026-10-08；父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。
本切片复用既有默认关闭 R-09 路由，**不新增或重写生产快路径**。
最终性能、内存与发布判定仍在 L08；功能合同不能据此降级。

2026-10-09 更新：[L04 完成审计](../reports/2026-10-09-resident-l04-completion-audit.md)
A～E PASS，阶段 DONE；选定预算政策下公开组合 10/10、八进程 52 项
real exact、当前完整 check:fast 1449/1449 及终态身份复核通过。
下文保留各历史切片的构建、分母和当时 NOT_RUN/FAIL，不倒改为当前结果。

## Characterization 与有效 RED

新 [公开 LSP 测试](../../tests/semantic/resident-session-references.test.mjs)
使用真实 Content-Length 子进程和正常版本化诊断。先以不相关 interface
implementation 支付完整合法工程准备成本，再通过 definition 见证同一
Program、打开先前 lazy 的同内容调用文件，最后查询此前未查询的引用符号。
275/276 个合法源码超过初始 256 个 resident script，夹具没有缩小 search scope。

六个机制已由原 R-09、L02、L03 实现，各自第一次执行直接 GREEN，
这是组合 characterization，不伪造行为 RED。新增 test entry 的分层登记
则先出现真实 RED：

```sh
node --test --test-name-pattern='classifies every executable test entry' \
  tests/test-layer-manifest.test.mjs
```

0/1 FAIL：`resident-session-references.test.mjs: discovered test has no layer`。
最小修复将其登记为 `bundle-e2e`，并更新分层数量及明确 assignment 断言；
完整 manifest 测试 4/4 PASS，未豁免 entry 检查。

## 六个合同

- 两种 `includeDeclaration` 都逐 URI/UTF-16 range 比较完整引用集合；
  未打开、与暖机目标无关的调用文件仍包含，独立同名类不混入。
  观察到 matching-fingerprint 晋升不改 generation、两次 definition
  Program sequence 一致；两次 resident hit 均 completeScope/sameProgram、
  零 Program build/零 verifier Worker start，没有 batch 或 answer cache hit。
- v2 增加引用及 2322 错误，v3 移除引用并修复错误；每次编辑立即查两种
  policy，再检查当前版本诊断 code/range。不能用旧集合回答新 overlay。
- 显式 L3 的真实驱逐使 resident proof 失效；完整 indexed-batched fallback
  仍保留未打开调用点和两种 policy，不把 miss 当空结果。显式压力本身
  不触发 L03 的自然压力自动入口。
- 64 MiB 小夹具只用于触发真实自然 RSS L3 和物理 Worker 替换；恢复后
  及新 overlay 的完整引用/诊断精确，无 Worker fatal、正常退出。
  此预算不用于真实工程指标，不修改生产 1024 MiB 策略。
- alias/re-export 的两种 policy 与独立进程的完整 legacy oracle 深比较，
  并显式检查 alias 调用点及同名类排除；resident hit 无 batch。
- 未打开 native ArkTS `struct` 调用文件的 import/constructor 定位完整。
  当前 sourceDocument 是原文、使用官方 ETS parser，不引入旧转换假说。

所有请求保留原公开 protocol，正常诊断未关闭，子进程正常退出。
编辑后的 proof 可因正常诊断重新建立，未强迫所有编辑都 miss；重要的是
完整最新答案及 admission 见证，不把请求时序当作性能干预。

## 验证与边界

七文件组合（新文件前五合同、batch search coverage、same-content promotion、
Worker recycle、candidate snapshot、coalescing、layer manifest）
**53/53 PASS**，0 fail/cancel/skip/todo，68,562.450842 ms；
原始 `.bench/l04-resident-contracts-focused-53.log`。之后 native struct 第六
合同单独 **1/1 PASS**，1,333.547905 ms；不能将前轮组合写成 54/54。
随后包含 L05 的八文件当前组合 **59/59 PASS**，退出 0、
0 fail/cancel/skip/todo，71,849.89502 ms；L04 六合同同时 GREEN。
原始 `.bench/l04-l05-contracts-focused-59.log`；当前登记 293 行、
manifest test 337 行，不改变上一检查点 292/336 的历史行数。

生产源码输入仍为
`62e6d09180dbc31343d7b24bf03de69176258582efaf7d1efb6cadc1b0153436`，
server `b4e41f3598b38ad5ce24da52d41fa37e020da433a9b4b7f2204000b7e879e2a0`。
本切片只新增合同/登记；新源码 whole 仍 NOT_RUN，请求合并前 fresh
`pnpm check:fast`，不能沿用 L02 固定构建的 1338/1338。

新测试 321 行、registry 292 行、manifest test 336 行。原 proxy 563、
type engine 3576、legacy engine 1068 行迁移债务仍保留且本切片未增长。
真实 Settings 路由对照、L04 其它组合及 L05–L08 仍继续；这里不宣称
semantic-ready、稳定 500 ms、最终资源收益或整个 L04 已完成。

## Resident 准入拒绝原因的公开合同

2026-10-08 后续切片保持既有 R-09、完整 fallback 和所有配置见证门槛，
只在已有 references trace 中增加 `references.resident.proof.rejected`。
prepare、observe、admit 分别说明 inputs、Program 覆盖、配置、overlay
和磁盘身份的实际失败，不通过重新构建 Program 或重盖配置时间戳放行。
trace 默认关闭；回调失败不能影响语义结果、拒绝或完整 fallback。

selective Program 的完整回归先通过；新增 `inputs-incomplete` trace
断言后真实 RED，最小实现后 GREEN。原始
`.bench/l04-resident-admission-reason-red.log`；五文件组合 40/40 PASS，
0 fail/cancel/skip/todo，117,004.576749 ms，
`.bench/l04-admission-proof-focused-40.log`。
原 identifier scanner 移到既有 rename 预检模块，原封保留实现，
并以 rename-depth/completeness 和 L07 alias 合同保护既有行为。

[固定 Settings 准入观测清单](../../bench/references/manifests/settings-resident-l04-admission-observation-api24.json)
源码输入 `1438bf3e41c57e0e8a2d26104f8ee7f008ee0323741f636d28cc042030d745dd`，
原始 `.bench/l04-admission-observation-1.json`：2/2 请求 exact、正常诊断 PASS，
首次 implementation 13,359.618172 ms，先前未查的 HomeInitData references
3,868.077834 ms。暖机后 observe 和 references admit 均是
`configuration-unproven`；后者 RSS 782,802,944 B、memoryLevel=level1。
之后的 L3 诊断和驱逐不是此前热路由 miss 的原因。suite 仍因
`READINESS_UNSUPPORTED` 退出 1，不把两个 exact 请求改标整体 PASS。

接着通过同一个公开子进程增加 dangling relative module lookup。
references 必须与独立 legacy 进程一致、拒绝 resident、走完整 batch，
并报告 Poison.ts 的 `configuration-identity-unavailable`。该断言先
0/1 FAIL，2,612.594661 ms，原始 `.bench/l04-configuration-first-failure-red.log`；
最小见证回调后 1/1 PASS，2,873.090256 ms。
LoadedConfigurationWitness 只记录第一次不可证明的原因和 retainedPaths；
原路径上限 4096、before/after 检查、revision 和失效语义均保留，
没有新增配置 cache、checker、owner、预算或 capability。

当前五文件完整回归 41/41 PASS，0 fail/cancel/skip/todo，
86,178.360814 ms，原始 `.bench/l04-configuration-proof-focused-41.log`。
源码输入 `ebf00768ba625c0ea4b8552b84b3cfde495b8969b73ec75f56c7ff452a8e50e1`，
新建[配置首次失败清单](../../bench/references/manifests/settings-resident-l04-configuration-first-failure-api24.json)，
不修改上一清单的固定输入。见证 112、resident state 212、type-engine 498、
batch coverage test 478 行；language-service 3504 行，低于切片前 3505 行，
仍属迁移债务。最终 L08 验收和完整新源码 whole 均未由本切片关闭。

本检查点 `pnpm check:fast` 的 TypeScript 检查及 build 已通过；沙箱内
外部 RSS 用例失败，直接 `ps` 探针退出 127、`operation not permitted`。
该次完整检查被显式 SIGINT 中止、退出 1，记 INTERRUPTED / NOT_PASS；
部分原始输出 `.bench/l04-configuration-check-fast-sandbox-interrupted.log`，
不推算完整测试分母，不以 focused PASS 替代合并前 fresh 完整检查。
随后获权复跑原外部 RSS 单用例 1/1 PASS、退出 0，4,710.201107 ms；
这关闭采样环境复现，不代替完整 `check:fast`。

## 容量原因和缺失祖先共享

配置首次失败清单的独立真实回放
`.bench/l04-configuration-first-failure-1.json` 已确认首个原因为
`configuration-witness-capacity`，retainedPaths=4096，路径为当前 server
checkout 的 `node_modules/assert.d.ts`。后续 admit/miss 仍在 level1，
RSS 795,385,856 B。2/2 请求 exact、正常诊断 PASS、输入前后不变、
shutdown/exit 0；整体 suite 保留 READINESS_UNSUPPORTED / FAIL。
这定位了容量问题，不把后来的诊断 L3 误作最初拒绝原因。

公开最小用例在同一个不存在的 Absent 目录下查询 800 个不同模块。
原见证真实 0/1 FAIL，7,836.661952 ms，原始
`.bench/l04-absent-ancestor-sharing-red.log`。每个负面 lookup 已通过
实际 lstat 遍历观察到第一个缺失祖先，它足以证明所有后代不存在。
最小实现将这些见证归一到该祖先的实际身份；直接文件/目录和 symlink
身份仍各自保留，原始 lookup 的 before/after 全量 guard 不变。
4096 条上限、64 层祖先上限、1024 MiB 策略和生产默认均未提高。
未增加 cache、checker、owner、后台准备或文件系统读取。

容量用例 1/1 GREEN，6,459.085885 ms；随后添加未通知的空祖先目录
创建 characterization，旧 proof 必须拒绝、完整结果与独立 legacy
进程相同，1/1 PASS，14,401.889748 ms。六文件当前组合
43/43 PASS，0 fail/cancel/skip/todo，90,316.600097 ms，
原始 `.bench/l04-absent-ancestor-focused-43.log`。
源码输入 `92d60d7be9ad3b94913ac17eb9bf0eb64133d9cfdac225076a75857785962260`；
见证 117、batch coverage test 497 行，已有 service 3504 行未增长。
当前类型检查和 build PASS，完整新源码 whole NOT_RUN。

[缺失祖先共享清单](../../bench/references/manifests/settings-resident-l04-absent-ancestor-sharing-api24.json)
使用新固定输入，不改旧 pin。原始
`.bench/l04-absent-ancestor-sharing-1.json` 仍是 2/2 exact、正常诊断 PASS、
输入前后不变和正常退出，但首次容量拒绝移到
`/Users/liuhui/node_modules/crypto.ets`，retainedPaths 仍为 4096；
admit/miss 为 level1、RSS 780,836,864 B。先前未查的 references
仍走一个完整 batch，完整响应 3,774.694315 ms，**零 resident hit**。
此干预只关闭重复缺失祖先的浪费，尚未消除真实 Settings 容量拒绝，
不能宣称原始问题已修复或真实热收益。该单次 trace-on 回放不作 P95
或最终内存收益；整体 READINESS_UNSUPPORTED / FAIL 保留。

下一切片检验已经直接观察到的目录身份能否证明其实际负面 child lookup，
以共享现有证明而非提高容量；独立路径、目录变化和 symlink 的安全
拒绝仍需公开回归与同输入真实回放。这个 L04 未解点不冻结其它独立
能力工作，也不把整体 semantic-ready 和 L08 门禁重设为阶段前置。

## 直接加载目录的负面查询证明共享

2026-10-08 后续最小干预只共享同一个 LoadedConfigurationWitness 已直接
加载的目录证明。当真实负面 child lookup 的父目录完整身份与该已加载
身份相同，原目录见证已经保护该次缺失决定，不另占路径槽。实际 child
lookup 的 before/after guard 仍执行；目录、symlink 或输入变化仍拒绝。
不重新盖旧配置时间戳，不增加 Map、checker、owner、后台准备或读取，
4096 条路径、64 层祖先和 1024 MiB 策略均保持。

首个 relative-import 夹具只探测文件，没有直接加载目录证明；它的
容量失败保留在 `.bench/l04-observed-directory-sharing-red.log`，但不作为
此假说的正确 seam 或成功证据。改用与真实 node_modules 路径一致的
非相对包解析：800 个不存在的包、实际存在的 node_modules，先暖机，
两种 references policy 均与独立 legacy 进程完整比较。
旧输入 `92d60d7be9ad3b94913ac17eb9bf0eb64133d9cfdac225076a75857785962260`
真实 0/1 FAIL，8,852.98833 ms，原始
`.bench/l04-node-directory-sharing-red.log`。最小干预后 1/1 PASS，
6,824.277655 ms；随后未通知地改变该直接观察目录，旧 proof 必须 miss，
完整 fallback 与独立进程相同，1/1 PASS，16,168.290787 ms。
这些夹具时长不作产品性能对比；缺失包/小 SDK 不代表总体 semantic-ready。

原 batch coverage 文件 497 行；在已有公开 characterization GREEN 下，
将完整 fixture/replay 职责移到
[共享回放夹具](../../tests/support/reference-coverage-replay.mjs)，不机械拆测试。
抽取前后原负面祖先合同分别 1/1 PASS，14,532.554768 / 16,959.192732 ms。
第一轮七文件默认并行组合为 45/48 FAIL：一个取消回调漏导出 positionAt，
两个默认 SDK rename 首个请求超时。原始
`.bench/l04-node-directory-focused-parallel-48-fail.log`；没有提高超时、
删除用例或把失败重标。positionAt 由同一夹具导出后取消合同单独
1/1 PASS，3,473.179472 ms。后续采用仓库 check:fast 的串行方式完整复跑，
并行启动超时仍作为独立失败保留，不据串行结果断言其原因已证明。
串行七文件组合 48/48 PASS，0 fail/cancel/skip/todo，173,400.950955 ms，
原始 `.bench/l04-node-directory-focused-serial-48-pass.log`；未缩小测试分母。

当前源码输入
`8ff3938baaf6d4b9fa8f4b32d00f359fb28d5eda51317456c92443cddffb53ac`，
[新真实回放清单](../../bench/references/manifests/settings-resident-l04-observed-directory-sharing-api24.json)
保留原工程/SDK/oracle/flags，只固定新源码产物，不修改旧 pin。
见证 128、batch coverage 368、共享夹具 154 行；既有 service 3504 行未增长。
类型检查及 build PASS，完整新源码 whole NOT_RUN；真实机制复核见下。

## 两种声明策略的真实命中

两个独立 Settings/API24 新进程使用同一 8ff3938 源码检查点、完整 SDK、
原 1024 MiB 策略及正常诊断。先以无关 IAboutDevicePageCtrl implementation
支付完整准备，再查此前未查询的 HomeInitData references；未预跑引用
目标，不用同快照答案 cache 代替新符号。

不含声明的[固定清单](../../bench/references/manifests/settings-resident-l04-observed-directory-sharing-api24.json)
原始 `.bench/l04-observed-directory-sharing-1.json`：2/2 请求 exact，
references 9/9，完整响应 1,307.06058 ms。含声明的
[独立清单](../../bench/references/manifests/settings-resident-l04-observed-directory-sharing-with-declaration-api24.json)
原始 `.bench/l04-observed-directory-sharing-with-declaration-1.json`：2/2
请求 exact，references 10/10，完整响应 1,212.20266 ms。
两者均见一次 `references.resident.hit`，sameProgram/completeScope=true，
verifierWorkerStarts/programBuilds=0，零 batch 和零 proof rejection。
两份正常 v1 诊断都为空，输入前后不变、shutdown/exit 0、failure=null。
暖机 implementation 各为 18,154.207749 / 18,440.907404 ms，准备成本
明确计入原始记录，没有藏进 ready 或伪装成点击时延收益。

这两次原始复现不再出现容量触顶，证明现有完整 LS 的热路由实际可用，
不是仅有小夹具 GREEN。hit 时 Node RSS 为 804,753,408 / 803,311,616 B；
这些瞬时数值不是峰值/PSS/长期内存收益。两次完整响应仍 >500 ms，
trace-on 单次样本不能宣称 P95 或稳定时延达标，也不能将不同旧构建
的失败样本合并成因果分布。顶层 suite 均因 READINESS_UNSUPPORTED
保留 FAIL、latency/memory BLOCKED；没有 generation-bound 公开 ready
契约、最终内存、soak 或跨平台产品毕业。L04 仍 IN_PROGRESS。

路径槽浪费来自把多个实际负面查询当作独立证明；此修复只复用已加载
且完整身份未变的目录证据，不抛弃安全检查、不增预算或引入第二缓存
owner。后续继续统一预算/成本准入及版本化就绪；该未完成项不冻结
L05–L07 的独立功能切片，整体产品判定仍在 L08。
