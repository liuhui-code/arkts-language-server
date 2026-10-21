# 2026-10-21 增量输入所有权与核验优化

> 公开审查副本：原始日志、完整原件和运行时快照仅保留本地，见[本地证据与公开边界](../reports/local-performance-evidence.md)。
> 文中的父版本、原执行分支及历史完整检查属于原本地候选，不表示它们是本公开分支的祖先或当前PR检查资格。
> 命令中的 `$NODE20` 是原已执行 Node 20.19.5 绝对启动器路径的公开化表示；复现前请按本机安装设置，不是原样 shell 转录。
> 原记录的 pnpm 8.15.9 缺少独立启动器版本核验，本文不将 packageManager 声明当作实际执行版本证明；公开分支需单独完整检查。

- 授权：维护者在两轮自审后要求“推进优化目标完成”。
- 父提交：`110568e54bc1bb13d6eb891d81ef631bcf1232cc`；保留此前未跟踪报告和证据。
- 状态：实施和验证进行中。完整响应每次 500ms 的目标保持，尚未取得性能资格。
- 当前工作区分支：`codex/stable-program-optimization-20261019`；不推送或发布。

## Slice 1：实际 compiler snapshot 归属

复现：多个合法模块分别准备后，完整根 Program 通过相同 Registry 复用已有
SourceFile。Host 后续提供内容、版本相同的另一个 snapshot，Registry 仍返回
原对象。lazy 弱索引若绑定未接纳的 snapshot，GC 后会失去映射，尽管真实 AST
仍被 Program 持有。单个无配置项目 400 文件控制组没有复现；不能把它记为 RED。

新增真实子进程 framed stdio 场景：app/noise 两模块、400 个 noise 根，degraded
缺失 import；先 references，再 rename/apply didChange，再 references；在实际
semantic Worker 两次 GC 后，再编辑数值并查引用。精确比较全部 3 个位置。

RED 命令：

```sh
node --test --test-concurrency=1 --test-name-pattern='actual project snapshots' tests/semantic/retained-lazy-source-evidence.test.mjs
```

父 runtime 的 [red-groups.log](../reports/local-performance-evidence.md)：1 项真实失败，未改文件重读 18 次（期望 0）；
另外 3 项仅名称过滤 skip。日志目录 [snapshot-ownership](../reports/local-performance-evidence.md)。
[red.log](../reports/local-performance-evidence.md) 保留单组控制实验，实际通过，不能当成产品失败。

最小实现：每个 LS 的 Registry wrapper 观察实际 acquire/update 返回 SourceFile；
只有生成文本精确匹配已有合法 read record 时，lazy 记录改绑到其真实 snapshot。
沿用 read stamp、token、原 SourceDocument 映射及独立发布终检，不新增强 Program
或永久文本缓存。wrapper 复用同一底层 Registry，trim 后重新接入 observer。

GREEN：同一文件完整 4/4，通过且无 skip/cancel；多组 GC 场景重读 18→0。
128/400/1024 原有实际 Program 根用例仍精确且未改输入文本重读为 0。
[green.log](../reports/local-performance-evidence.md) 包含逐次真实读点观测；这不是普通时延或 20k 性能验收。

LS 原 3097 行债务保持不增长，将成员失败分类提取到现有 query-inputs 模块；
新 Registry wrapper、fixture 和其他新修改手写文件均须不超过 500 行。

## 后续验证

请求身份预算的独立 RED/GREEN 见
[专用记录](request-input-identity-budget-20261021.md)。组版本隔离还需完成无关
关闭源、跨组实际依赖、ambient、失败 import 恢复及 overlay 反例。完成最终
组合后运行全 `pnpm check:fast`，再冻结最终输入做 2048/20000 同条件串行比较。
普通计时与计数/GC 插桩分别报告；此前 sealed archive 保持原字节。

## Slice 2：组时钟隔离的额外正确性反例

组时钟第一组合通过 8/8 完整文件及 28/28 相近回归，原无关关闭文件编辑的
`isProgramUptoDate` 1→0，保持精确答案。该阶段不是最终资格：后续交叉审查
找到了两个必须先关闭的窗口。

1. 一次真实 lazy EIO 后 `projectMembershipSourceUnavailable` 会保持。旧成员
   replace 路径可恢复，新 catalog-only 路径则不恢复。公开组 completion 在
   watcher 后继续漏 `restoredMember`，[recovery-red.log](../reports/local-performance-evidence.md) 真实失败；已有失败状态
   禁止 catalog-only，按原 replace 准备恢复，[recovery-green.log](../reports/local-performance-evidence.md) 通过。
2. A 初始不使用 C，C 编辑后 A 消费了被筛选事件；A 随后新增通过 B 的 270 层
   相对 re-export 依赖，C 位于 256 raw 窗外。A 实际从 1 个项目输入变成 273，
   共享 Registry 却返回 C 旧 AST，definition 错误发布旧 line0 而非当前 line1。
   两个明确前置状态都失败：C 初始未预载、C 初始已预载但未入 A Program。
   [late-dependency-states-red.log](../reports/local-performance-evidence.md) 保留实际 docs/roots 观察与完整响应。

第二个窗口要求全量已见证文件版本/缓存失效与相关组编译时钟分开处理；仅保留
实际输入 superset 不够。修复及新 owner/碰撞反例的最终结果继续记录，不能沿用
此前 8/8 的通过资格。证据分别位于 `group-version/` 和 `request-identity/`。

后续组合已关闭上述两个窗口：完整已见证路径以 `contentChangedPaths` 携带到
现有 LS，失效单文件 script/lazy/admission；只对实际相关输入推进编译时钟。
lazy 版本绑定实际已读 SHA、准入 token 及已消费内容标记，查询版本不另做 IO。
仅 token 或当前组过滤后的文件版本均不足以代替实际文本身份。

最新结果：组相关完整 37/37、types GREEN；深依赖两状态完整 2/2，旧 line0→当前
line1。另两项压力恢复/cache-disabled characterization 通过，但未记录压力后 C
Registry refcount，不宣称证明了旧 C 仍存活的冷 owner 碰撞保护。工具中的重复
notification await 失败另留存，不算产品初始化超时。详情见
[深依赖记录](group-late-dependency-version-20261021.md)。

最终输入相关三个完整文件 16/16、无 skip/cancel，[final-input-regressions.log](../reports/local-performance-evidence.md)
含原 8250 终检、GC 及 READY/degraded SDK 读事实复用；watchdog 未扩大。
首次全 `pnpm check:fast` 在固定 Node20.19.5 执行时（pnpm 启动器版本限制见本页公开边界），collector CLI
成功凭据用例实际退出 2；该次在首个失败后停止，剩余未完成，不能作为全量资格。
日志保留为 [check-fast-attempt-1.log](../reports/local-performance-evidence.md)，终态及源输入 SHA 保留为
[check-fast-attempt-1-status.json](../reports/local-performance-evidence.md)。
本次产品/测试/脚本 SHA 未变，但测试期间安排过报告写入；collector 会对所有
`git ls-files -co --exclude-standard` 输入（包含文档）做前后比较，因此存在干扰。
原失败临时凭据已被测试清理，无法直接确认当时的 `repoStable` 值；不把该解释
当作已经测得的唯一原因。完全停写后原样单独复跑成功，日志 [collector-isolated.log](../reports/local-performance-evidence.md)
为 1 PASS、12 名称过滤 skip；不替代完整资格。下一次连文档也冻结，并额外记录
全仓库前后 SHA。正式规模性能仍待完成，不把定向 GREEN 当完整资格。

第二次全量在全仓库 SHA 完全相同的情况下，通过原 collector 失败用例，但
`semantic-release-regression-cli.test.mjs:320` 写临时源码归档出现真实 `ENOSPC`。
记录为 [check-fast-attempt-2.log](../reports/local-performance-evidence.md) / [check-fast-attempt-2-status.json](../reports/local-performance-evidence.md)；遇错后停止，
其余未完成，未认证通过。仓库输入共约 339MB，多份 base64 临时归档同时保留，
当时约 4.8GiB 余量不足。没有更改产品、测试、超时或检查范围。

停止负载后，仅对 [*.sqlite3](../reports/local-performance-evidence.md) 做 macOS
文件系统透明压缩，214 个文件逐一验证副本 SHA、大小、mtime、权限及原文件
未被并发改写，再原子替换并二次验 SHA。路径和全部字节不变；SDK、runtime、
报告、原始响应及 sealed archive 未改。释放 7,129,247,744B，可用约 11.4GiB；
逐文件校验账本为 [index-transparent-compression.ndjson](../reports/local-performance-evidence.md)。后续再次完整重跑，
不将前两次中断运行拼接为通过。

第三次完整运行正常结束，1942 tests、1941 PASS、1 FAIL、0 skip/cancel/todo；
源码及全仓库前后 SHA 均相同。唯一失败是新增深依赖测试进入清单后，清单契约
仍硬编码总数 230／bundle 数 110。完整 RED 为 [check-fast-attempt-3.log](../reports/local-performance-evidence.md)，
[manifest-counts-red.log](../reports/local-performance-evidence.md) 另保留修总数后暴露分层数的 RED。同步为 231／111，
明确断言新文件归属 bundle-e2e，完整 `tests/test-layer-manifest.test.mjs` 4/4 GREEN，
日志 [manifest-green.log](../reports/local-performance-evidence.md)。此修复仅改测试期望，不改产品。

为避免下一次发现性能问题后再修改产品而重跑同一长回归，顺序调整为先冻结
候选做正式串行规模测量，明确资格 pending；随后对最终同版本完整复验，
以 source manifest 相等及实际完整成功终态补足资格。冻结时附第三次真实失败
日志，不把它命名或解释为通过；最终全量通过前不请求合并、不发布通过结论。


## 最终同候选完整检查（2026-10-21）

冻结candidate-v2（manifest SHA256 `8c4f61823603b4ba64289d9d010d6738205ba53672a3be0d9a8fa3b81e7fb8a3`）
完整 `pnpm check:fast` 已通过1943/1943，失败/跳过/取消均0；Node20.19.5；pnpm 启动器版本限制见本页公开边界。
源码、全部仓库输入在运行期间不变，生产runtime与实测候选前后相同。
日志SHA256 `78019639e431abf47d6c0ecb8bb1fb914fe985429e7913804ecde6e37a3919a2`，
收据在[qualification.json](../reports/local-performance-evidence.md)。
本段是检查后的证据更新，运行时文档快照在[运行时文档快照](../reports/local-performance-evidence.md)；产品输入未变。
500ms及完整架构目标仍未完成；普通规模、内存负收益和限制见
[最终报告](../reports/2026-10-21-incremental-input-optimization.md)。
