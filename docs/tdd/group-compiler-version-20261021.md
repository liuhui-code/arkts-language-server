# 组编译版本与完整文件失效：2026-10-21 实施证据

> 公开审查副本：原始日志、完整原件和运行时快照仅保留本地，见[本地证据与公开边界](../reports/local-performance-evidence.md)。
> 文中的父版本、原执行分支及历史完整检查属于原本地候选，不表示它们是本公开分支的祖先或当前PR检查资格。
> 命令中的 `$NODE20` 是原已执行 Node 20.19.5 绝对启动器路径的公开化表示；复现前请按本机安装设置，不是原样 shell 转录。
> 原记录的 pnpm 8.15.9 缺少独立启动器版本核验，本文不将 packageManager 声明当作实际执行版本证明；公开分支需单独完整检查。

- 授权与边界：[ADR 0019](../adr/0019-stable-programs-and-request-inputs.md)。
- 父版本：`110568e54bc1bb13d6eb891d81ef631bcf1232cc`。
- 执行分支：`codex/stable-program-optimization-20261019`。
- Node：`$NODE20`，v20.19.5。
- 编译器：仓库锁定的 `ohos-typescript@4.9.5-r10`；测试运行真实子进程、
  Content-Length stdio 和 semantic Worker，使用隔离临时模块与最小 SDK 夹具。
- 本片本地证据：[group-version](../reports/local-performance-evidence.md)；
  后续依赖反例：[request-identity](../reports/local-performance-evidence.md)。
- 状态：定向功能与类型检查 GREEN；完整 `pnpm check:fast` 已由主执行任务
  启动，结果另补。本片尚无当前组合的规模性能验收资格。

## 1. 原始 RED：消费无关事件仍触发编译同步

真实模块 A、B 各有独立源码与包清单。初始化后重复查询 A 的定义，修改
关闭的 B 源文件，发送 `workspace/didChangeWatchedFiles`，再查询 A。
先核对精确 Location，随后检查实际编译器的 `isProgramUptoDate` 调用。

```sh
"$NODE20" --test --test-concurrency=1 \
  --test-name-pattern='a retained module consumes an unrelated closed-file edit' \
  tests/semantic/semantic-group-retention.test.mjs
```

[red.log](../reports/local-performance-evidence.md) 记录精确
答案已通过、未创建新 context，但 A 发生一次 `isProgramUptoDate`，断言
`1 !== 0`。隔离 preload 只观察真实 compiler 函数，没有替换答案或将
Program identity 当作同步次数。仅断言 `createProgramEvents=0` 不够：
编译器可能扫描源版本后继续使用原 Program。

[green.log](../reports/local-performance-evidence.md) 中
该调用 **1→0**，新 context 仍为 0，后续重复查询继续保持精确。该日志
使用 test-name 选择器，其余测试被过滤；不能把过滤项计为通过。

同时修正两个独立的失效来源：Host content clock 不再随已证明无关的
空组内 delta 前进；相同成员集合的已见证内容更新，只刷新目录准入版本，
避免全局 catalog revision 再次无条件推动组 Program 同步。

## 2. 不能把根列表当作完整依赖范围

实际 compiler 可以通过相对 import 加载其他模块源码，即使该路径不在
`semanticRootPaths` 中。准备视图最多交付 256 份文本，不能假设真实依赖
一定由 `workspace.documents` 再次覆盖。

公开反例构造 A 的 270 条 re-export 链，末端引用 B 的 `Deep`。实际观察
到 A 有 **271 个项目根、272 个项目 SourceFile**。B 位于原始文本交付窗
之外；修改 B 磁盘文本，再修改其 overlay，精确跳转分别恢复到第 1、2 行。
该案例与另一模块 ambient 更新、缺失 import 新建文件后恢复一起，通过于
[final-related.log](../reports/local-performance-evidence.md)。

每个 LS 的 registry observer 记录实际 acquire/update 返回的 SourceFile
路径。组的可排除范围依据合法根与这个实际输入超集的并集；没有完整连续
delta、没有可靠 tracker、删除或 reset 时继续保守处理，不只按根裁剪。
旧依赖路径暂时留在超集中只会增加保守失效，不会授予额外排除资格。

## 3. 审查发现的恢复 RED：不可用源码状态被保留

初始方案的 catalog 快路保持 `projectMembershipSourceUnavailable`。
原完整 membership 更新会重新准备并清理此状态，快路可能阻止实际恢复。

公开案例在 A 的 256 文本窗之外放置全局 `Recovered` 类，仅在真实 lazy
磁盘读取时注入一次 EIO。A 初始 Program 确实缺少该输入；后续全根 owner
读取成功，不能据此认为 A 已恢复。修改独立 B 并通知同成员 catalog 更新，
再次补全 A：

```sh
"$NODE20" --test --test-concurrency=1 \
  --test-name-pattern='a transient group source read failure' \
  tests/semantic/semantic-group-retention.test.mjs
```

[recovery-red.log](../reports/local-performance-evidence.md)
中依然缺少 `restoredMember`，不是超时。最小修复为：**已有 source-unavailable
时禁止 catalog-only 快路，回到原完整更新与编译同步路径**，没有只清 flag
冒充恢复。[recovery-green.log](../reports/local-performance-evidence.md)
及最后完整组合均通过。

## 4. 后续依赖 RED：不能丢掉当前组未使用文件的版本与快照失效

另一公开序列专门检查“现在无关，以后成为依赖”的情况：

1. A 初始独立，实际 Program 只有 1 个项目文件。
2. C 已被其他 owner/共享 Registry 读取；修改 C，使 `DeepLeaf` 从第 0 行
   移到第 1 行。A 消费事件，仍不加载 C。
3. 编辑 A，新增经 B 的 270 条 re-export 链首次引用 C。
4. 此时 A 的原始交付文本为 256 份且不含 C，实际 Program 有 **273 个项目
   文件、1 个 A 项目根**，因此覆盖的是实际深依赖而非根数量变化。

分别验证 C 初始化时不在文本窗内、以及 C 已预载为 resident 但未进入 A
Program 的两种前置状态。保留路径分别使用 `c/.../Query.ets`、
`aa/.../Query.ets`，后者词法靠前以进入初始化预载窗。

[late-dependency-states-red.log](../reports/local-performance-evidence.md)
中两种状态均 **成功返回旧第 0 行**，预期为当前第 1 行，属于错误答案。
不能把它描述为单纯缓存未命中或性能退步。只过滤组内 delta，会遗漏 C
的文件版本、旧 resident、lazy 与 admission 失效；未来首次加载时可撞到
共享 Registry 的旧同版本 SourceFile。

修复后 [late-dependency-states-green.log](../reports/local-performance-evidence.md)
两种状态 **2/2 GREEN**，返回当前第 1 行，仍保持 A 项目根为 1。

```sh
"$NODE20" --test --test-concurrency=1 \
  tests/semantic/group-late-dependency-version.test.mjs
```

后续 characterization 还验证压力确实将 A 的 owner 从 1 换为 5，C 的
admission token 被测试夹具保留为旧值，但真实物理身份和字节仍变化；
开启、关闭 lazy cache 的两种状态都返回当前第 1 行。
[cold-characterization 日志](../reports/local-performance-evidence.md)
记录 `tokenCollisionReads=2`、当前 273 个项目输入。这份日志只选择两个
新 owner 案例，另两项为 test-name 过滤，不能称四项完整通过。

早期 [late-dependency-extended-green.log](../reports/local-performance-evidence.md)
虽然文件名含 green，实际只有 2/4，两项等待 `arkts/semanticPreparation`
通知超时。该失败输出保留，不作为产品 RED 或通过证据；其后有上述两个
新 owner 的独立成功运行。本文没有对早期超时作未经核实的阶段归因。

该 token 注入只冻结准入 token；没有同时伪造磁盘身份和所有实际读取。
因此它证明冷 owner 的版本不能仅依靠 token，没有证明任意不可观察磁盘
变化的可检测性，也没有授予跳过最终核验的资格。

## 5. 最终实现：完整文件事实与相关编译失效分开

| 状态/数据 | 具体职责 |
| --- | --- |
| `WorkspaceEngineEntry.appliedContentRevision` | registry 层独立消费者游标，仍消费完整连续事件 |
| `TypeScriptContentVersions.receivedRevision` | Host 上次接收的输入代次，允许确认 catalog 更新的 `fromRevision` 连续 |
| `TypeScriptContentVersions.revision` | 当前 Program 的内容时钟；已证明无关的空组内 delta 不推进 |
| `contentChangedPaths` | 从同一原始连续 span 派生的全量路径元数据，供全部文件版本及旧状态失效；不是第二事件权威 |
| `changedPaths` | 合法根与实际 compiler 输入范围内的相关路径，用于 Program 同步及当前输入交付 |
| membership revision | 完整目录准入权威，始终更新；结构变化、未知 span、partial、删除、reset 和 source-unavailable 保持原完整更新 |

所有已见证变更路径都更新单文件版本并清理旧 script、lazy、admission。
已经证明当前无关的 resident 移除不推进 Program generation；相关移除仍
推进。否则即使更新新文件版本，也可能给旧 resident 文本贴上新版本。

源码位于 [type-context-reset.ts](../../src/core/types/type-context-reset.ts)、
[typescript-compiler-inputs.ts](../../src/core/types/typescript-compiler-inputs.ts)、
[typescript-content-versions.ts](../../src/core/types/typescript-content-versions.ts)
及现有 [LS Host](../../src/core/types/typescript-language-service.ts)。

lazy disk 版本绑定已知文件内容标记、当前准入 token、**实际已读取源码 SHA**。
在锁定编译器的 `getOrCreateSourceFileByPath` 中，`getScriptSnapshot` 先于
`getScriptVersion`；SHA 已由实际读取计算，不新增文本 I/O。只查询 token
的 existing catalog Map，不新增磁盘身份扫描。已知内容标记仍保留，以免
把已通知的实际字节变化仅用 stat/token 判同。

[typescript-lazy-snapshots.ts](../../src/core/types/typescript-lazy-snapshots.ts)
允许无 I/O 查询强记录或 compiler-owned 弱记录的 SHA；再用单条
`(path, token, SHA)` 元数据交接刚返回的 snapshot，覆盖缓存关闭及单文件
超缓存预算的情况。交接不持有源码、snapshot 或 AST；forget、clear、trim
清理交接。没有 SHA 时用 `unloaded` 版本保守触发同步，不授予当前性证明。

lazy observed/promotion 与 Host 使用同一版本构造；非 promotion resident
保持原 SHA 版本。弱记录能持续复用依赖 registry observer 将其绑定到
编译器实际持有的 snapshot；不能假设编译器接管 Host 提供的每个同版本
snapshot。源码 SHA 版本与实际 snapshot 归属解决的是不同问题。

## 6. 输入 tracker 预算、压力与范围限制

tracker 只保存路径元数据，不持有 AST/源码，最多 **32768 条路径、8MiB
UTF-8 路径 payload**。该值不包含 Set、字符串对象等额外开销，不是精确
heap 或 RSS 上限，不能与默认 4096MiB 进程压力预算混为一谈。

达到任一限制会清空路径表并使 `knownPaths()` 返回 `undefined`；之后完整
保留事件范围，直到 recycle/dispose 重置。禁止截断后仍声称输入完整。
公开 overflow 案例仅在隔离 preload 中将容量降为 1，确认精确结果保持且
保守同步确实发生；没有新增产品配置开关。

trim 使用新建且尚无 Program 的 LS；首次查询自然构建合法根及依赖并由
observer 重新登记，空 tracker 不是对存活旧 Program 的依赖排除证明。
普通局部编辑不会随意清空存活 LS 的实际输入记录。

本片保留配置与正负解析见证、原始读前读后守卫及独立最终联合核验。
新文件满足原缺失 import、ambient、跨根依赖、overlay、关闭回到磁盘权威、
删除及不明历史仍有公开反例，不能把“未在当前 roots 中”当作无关证明。

## 7. 最终定向验证与尚未完成的部分

```sh
"$NODE20" --test --test-concurrency=1 \
  tests/semantic/semantic-group-retention.test.mjs \
  tests/semantic/group-closed-input-delivery.test.mjs \
  tests/semantic/semantic-group-planning.test.mjs \
  tests/semantic/semantic-context-lifecycle.test.mjs \
  tests/semantic/duplicate-disk-notification.test.mjs
pnpm check
```

- [final-related.log](../reports/local-performance-evidence.md)：
  **37/37**，含完整组文件 9 项和四个相关完整文件 28 项，零 skip/cancel。
- [final-types.log](../reports/local-performance-evidence.md)：
  `pnpm check` exit0。
- [final-input-regressions.log](../reports/local-performance-evidence.md)：
  主执行任务追加三个完整 P0 输入文件 **16/16**、零 skip/cancel，覆盖实际
  compiler snapshot GC、8250 输入共享和独立终检；不是本片 37 项的替代。
- 全 fast 命令、源码前置哈希及运行状态由
  [check-fast-status.json](../reports/local-performance-evidence.md)
  与 [check-fast.log](../reports/local-performance-evidence.md) 记录。
  本文写入时未取得结束结果，主执行任务后续补充。

当前并未迁移全局引用完整性证明、逐组搜索聚合和 root READY 的所有消费者。
references 的完整驻留 owner、全根 rename/implementation 等仍可能使用大
Program；不能从 A/B 局部编辑反例推广为 2 万文件引用已只更新单个小组。
目录/依赖准备、Program 自身同步、统计和最终核验仍可能随实际输入增长。

本片没有冻结当前候选重跑 2048/20000 文件同条件性能矩阵，没有新的普通
请求时延分布或进程树内存结果。测试总执行时间不等于一次 LSP 操作时延。
**每次完整响应 500ms 尚未证明**；旧慢操作、规模增长、大规模和 degraded
限制仍保留，不能宣称解决。完整 fast 与性能结果由后续报告补充。

## 8. 行数与迁移债

冻结检查时的物理行数如下；新 helper/fixture 都在 500 行以内。

| 文件 | 行数 |
| --- | ---: |
| `typescript-language-service.ts` | 3096，父版 3097；仍有超限迁移债 |
| `type-engine.ts` | 500 |
| `type-context-reset.ts` / `typescript-content-versions.ts` | 78 / 35 |
| `typescript-compiler-inputs.ts` / `typescript-query-inputs.ts` | 63 / 42 |
| `typescript-lazy-snapshots.ts` / `semantic-workspace-view.ts` | 164 / 65 |
| `semantic-group-retention.test.mjs` / `group-late-dependency-version.test.mjs` | 471 / 90 |
| `semantic-group-version-counter.cjs` / `semantic-group-source-read-failure.cjs` | 28 / 21 |
| `semantic-group-input-workspace.mjs` / `group-late-dependency-inputs-counter.cjs` | 36 / 49 |

已将文件输入跟踪、catalog 更新判定和完整内容失效提取到内聚 helper，
membership/source-unavailable 验证提取到现有 query-inputs 模块；未把超限
LS 文件视为允许继续增长的例外。本记录不重写旧总 ledger 或旧封存证据。


## 最终同候选完整检查（2026-10-21）

冻结candidate-v2（manifest SHA256 `8c4f61823603b4ba64289d9d010d6738205ba53672a3be0d9a8fa3b81e7fb8a3`）
完整 `pnpm check:fast` 已通过1943/1943，失败/跳过/取消均0；Node20.19.5；pnpm 启动器版本限制见本页公开边界。
源码、全部仓库输入在运行期间不变，生产runtime与实测候选前后相同。
日志SHA256 `78019639e431abf47d6c0ecb8bb1fb914fe985429e7913804ecde6e37a3919a2`，
收据在[qualification.json](../reports/local-performance-evidence.md)。
本段是检查后的证据更新，运行时文档快照在[运行时文档快照](../reports/local-performance-evidence.md)；产品输入未变。
500ms及完整架构目标仍未完成；普通规模、内存负收益和限制见
[最终报告](../reports/2026-10-21-incremental-input-optimization.md)。
