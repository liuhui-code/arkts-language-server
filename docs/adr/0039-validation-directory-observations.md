# ADR0039：输入核验的目录内容复用与物理路径观测

- 日期：2026-11-02。
- 状态：**Rejected；保留已实施的独立实验及收据，不纳入本轮正式修复。未追认评审、UI 或合并通过。**
- 问题：[WUI-003 / #103](https://github.com/liuhui-code/arkts-language-server/issues/103)。
- 关联：[0037](0037-navigation-work-and-input-validation.md)、[0036](0036-compiler-source-namespace-recovery.md)、
  [0027](0027-completion-details-diagnostic-priority.md)、[实施计划](../plans/2026-11-02-wui003-burst-navigation.md)。
- 父版本：`b57ad075a80fdc2169189ba7da17fc6bb98a0866`。本轮不部署、不提交合并。

## 2026-11-02取舍结论

三轮对照仅改善约10%，64条有效独立请求仍有秒级队尾；首次只做阶段枚举的候选反而变慢。
跨请求目录内容复用还新增了“目录元数据足以证明精确名称集合”的边界，纳秒表示并不保证所有卷的实际精度，
Windows本轮无法真机验证。未确认该候选在NTFS有实际错误，但无需为少量收益扩大这项兼容性证明负担。
正式修复收敛为[ADR0040生产端背压](0040-client-context-request-backpressure.md)，保留全部请求及原服务器核验。
辅助源码、测试、bundle归档于`.bench/wui003-burst-20261102/server-directory-prototype/`，原始失败和全部测量不删除。
下面保留原方案与验证标准，不能读作最终产品行为。原0037的逐请求校验保持不变。

## 已测问题与边界

原 Windows 21.562 秒定义请求有 21.293 秒处于父端队列；并非该请求重新构建 Program。
当前 main 已有前台有限优先和精确请求合并，但 64 个不同方法/位置的有效请求不能合并成同一个答案。
Mac 相同隔离 30K 输入重放仍有秒级队尾。独立插桩记录每请求约 654 次配置身份读取、约 37ms，
原始 compiler 查定义通常不到 0.4ms。不得把整段队列时间称为 compiler 慢或照搬旧 Windows 归因。

第一个只共享阶段内目录枚举的候选减少了 realpath，却使 30K 突发变慢；原始失败保留。
所以“减少调用数”不是验收，需要普通计时、完整响应和插桩分别对照。

## 参考实践与适配

- [TypeScript CachedDirectoryStructureHost](https://github.com/microsoft/TypeScript/blob/main/src/compiler/watchUtilities.ts)：
  复用目录内容，文件/目录变化更新或失效，失败走原 Host；借鉴缓存归属和失效，不复制其大小写折叠。
  [上游卷大小写问题 #55427](https://github.com/microsoft/TypeScript/issues/55427)是反例，不能全路径小写。
- [VS Code tsserver 请求队列](https://github.com/microsoft/vscode/blob/main/extensions/typescript-language-features/src/tsServer/requestQueue.ts)：
  优先级受 fence 约束；不把不同请求自行判为过期。本项目已有调度/取消合同保持。
- [clangd 线程模型](https://clangd.llvm.org/design/threads)：共享 AST 操作串行，读取服从先前写入。
  不用并发访问同一个 TypeScript Program 或增加 Worker 来隐藏累积输入核验。
- [Node 20 文件系统 API](https://nodejs.org/docs/latest-v20.x/api/fs.html#stat-time-values)：
  BigIntStats 提供纳秒表示的 mtime/ctime，实际精度由文件系统决定；不是原子文件系统快照承诺。
  依赖 API 可用于 Node >=20；当前性能对照运行 Node 26.3.0，安装编译器仍为项目固定的 ohos-typescript。

Context7 的库解析两次传输失败，未获取其正文；以上官方源码/文档是回退依据，未将其行为冒充本项目保证。

## 决策

1. 将可复用内容与有效性证明分开。Worker 内有界 LRU 只保存真实枚举得到的精确 regular 文件名集合，
   按物理目录键及 dev/ino/mode/size/mtimeNs/ctimeNs 匹配。每次使用先重新 stat、native realpath、
   枚举或取内容，再次 stat 确认读窗口；绝不保存跨请求的 `valid=true`、文件身份或结果。
   不依赖 watcher 准时送达；目录改变时重新读取，仅实际观察的目录参与，不遍历整个项目树。
2. 同一个同步核验阶段可复用已观测的目录物理路径。普通文件必须匹配目录实际枚举的精确拼写；
   叶子 symlink、短名、大小写别名、未知类型走原 native 路径。目录路径也保留原始大小写。
   每份文件的 lstat/stat、文件内容和原 load-owned identity 比较继续执行。
3. 实际加载前后的 guard 不选择该优化；只有 requestFileIdentity/requestConfigurationIdentity
   的核验回调可以使用。准备观测交给原查询，随后清空阶段；最终 union 扫描仍从全新文件身份开始。
   最终消费过的目录还须重新核验 owner、canonical 路径及实际使用的精确 regular 名称，然后才返回结果，
   所有步骤仍在原语义租约内部。查询后的代码不能创建未闭合的目录观测。
4. 无关目录成员变化不独立判定失败：重读后只要求被使用的目录/文件仍成立。
   原 Host 实际枚举过的 SDK/配置目录仍按原 load-owned witness 校验，不放宽该合同。
5. 内容 LRU 的字符串/Map 元数据保守计费上限 32MiB；单阶段引用继续计入原有 32MiB 元数据预算。
   这两者不是 RSS 策略。超出后回到普通读取，不驱逐 Program、不改结果范围、不停止请求。
   无文件描述符、任务、监听器或 Registry 租约；Worker 结束释放，LRU 仅有界保留名称数据。

## 关系、取舍与不变量

0037 的文件身份、结果和 final fence 仍逐请求；新增的跨请求对象仅为已读取的目录**内容**。
其当前证明每阶段重做，不能以“目录内容缓存命中”声称省略最终磁盘校验。
0036 的旧请求失败/后继恢复、SDK/config 原始加载证明和 0027 的 fairness/mutation fence 不改变。
0033 的客户端导航所有权另案处理；标准 definition 请求不携带可靠 F12/自动请求来源，服务端不能猜测并丢弃。

拒绝 TTL、仅靠 watcher、删除 symlink 校验、增加超时/上限、改 LIFO 猜用户意图及并发共享 Program。
批量查询事务会改变逐请求原租约内的最终验证、取消和终态合同，本轮不暗中引入。
代价是仍逐文件检查有效依赖闭包，64 个有效独立请求仍有串行总成本；不承诺请求数量无关或全量 30K ready。
纳秒表示不能改善低精度/不一致的远程文件系统元数据，保留与已有磁盘证据模型相同的文件系统观测限制。

## 验证标准

- 真实 framed stdio LSP，在 24/96 实际 SDK 输入下，逐文件新鲜检查都保留；完整路径解析不再随同目录文件数重复；
  热态目录无变化时不重新枚举内容，不使用新壁钟硬门限。
- 编译器实际返回后 SDK 字节、目录换向/大小写、最终文件观测后的 namespace 换向须拒绝旧结果；
  无关成员对照、配置后恢复、取消、独立请求、前后台公平性与 mutation 顺序继续通过。
- 同 30K/SDK/Node/请求顺序，多轮普通计时与独立插桩分别记录全部结果、排队、I/O、Program/Worker、内存。
  初始 degraded、完整范围失败和无法执行的 Windows/UI 验收独立列出，不能算通过。
- 最终候选运行适用完整检查。500ms 是允许波动的体验目标；455 冷目录 3 秒门槛沿用已授权例外。
