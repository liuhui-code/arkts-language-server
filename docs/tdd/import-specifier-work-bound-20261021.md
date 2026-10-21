# 2026-10-21 import 提取扫描范围

> 公开审查副本：原始日志、完整原件和运行时快照仅保留本地，见[本地证据与公开边界](../reports/local-performance-evidence.md)。
> 文中的父版本、原执行分支及历史完整检查属于原本地候选，不表示它们是本公开分支的祖先或当前PR检查资格。
> 命令中的 `$NODE20` 是原已执行 Node 20.19.5 绝对启动器路径的公开化表示；复现前请按本机安装设置，不是原样 shell 转录。
> 原记录的 pnpm 8.15.9 缺少独立启动器版本核验，本文不将 packageManager 声明当作实际执行版本证明；公开分支需单独完整检查。

Git 父提交：`110568e54bc1bb13d6eb891d81ef631bcf1232cc`。RED 使用本轮 P0
工作区已构建 runtime，不是声称原始父提交树；确切产物 SHA 保留于
[red-runtime-sha256.txt](../reports/local-performance-evidence.md)。

公开场景为真实子进程 framed stdio：`Main.ets → Graph.ts → Unopened.ets`。
Graph 继承实际 Leaf 字段并附加 16KiB 无引号空白。先验证完整规范化补全业务
payload 和 definition URI/range，再检查 semantic Worker 内实际正则输入长度。
preload 精确匹配旧 regex source/flags 和夹具标记，只记录 codeUnits，原样调用
原生 `String.prototype.matchAll`，不消费或改变 iterator，不写协议 stdout。

RED / GREEN 命令，固定 Node 20.19.5：

```sh
node --test --test-concurrency=1 tests/semantic/import-specifier-work-bound.test.mjs
```

RED [red.log](../reports/local-performance-evidence.md)：语义断言通过，仅工作量断言失败；两次输入均为 16494 code units，
最后引号结束位置为 73。最小实现提取 `import-specifiers.ts`，在运行原正则前
截断到最后一个 ASCII 单/双引号（包含它）；没有引号时直接返回空列表。
GREEN [green.log](../reports/local-performance-evidence.md)：完整 1/1、无 skip/cancel，相同语义响应、两次输入均为 73。
build、types 通过。日志和构建 SHA 保留于同一目录。

每个成功匹配必须以引号结束，当前正则没有尾锚点、lookaround 或观察匹配末尾
之外内容的条件，因此删除无引号后缀只移除必定失败的搜索分支。顺序、重复、
capture 和原有错误语法处理均保留；match.input 会改变，但调用方仅消费 capture。
未来若改变正则断言，必须重新审查。未引入新 scanner、TypeScript 主线程依赖、
路径解析缓存或新鲜度策略变化。

计数证明减少传入正则的字符范围，不能证明具体回溯次数或普通毫秒收益。该片
仍不能解决引号区间内部的坏输入复杂度，也不保证所有输入更快。普通运行另测。

`document-store.ts` 1774→1773 行，提取职责保持旧超限文件行数下降；新 helper
9 行、公开测试 52 行、fixture 21 行。原有超限仍为迁移债务。

测试清单先记录真实未分层 RED [manifest-registration-red.log](../reports/local-performance-evidence.md)，再加入 bundle-e2e，
同步总数 232 / bundle 112，并断言新文件归属。完整清单契约 4/4 GREEN，
[manifest-green.log](../reports/local-performance-evidence.md)。这不替代最终同版本完整 `pnpm check:fast`。


## 最终同候选完整检查（2026-10-21）

冻结candidate-v2（manifest SHA256 `8c4f61823603b4ba64289d9d010d6738205ba53672a3be0d9a8fa3b81e7fb8a3`）
完整 `pnpm check:fast` 已通过1943/1943，失败/跳过/取消均0；Node20.19.5；pnpm 启动器版本限制见本页公开边界。
源码、全部仓库输入在运行期间不变，生产runtime与实测候选前后相同。
日志SHA256 `78019639e431abf47d6c0ecb8bb1fb914fe985429e7913804ecde6e37a3919a2`，
收据在[qualification.json](../reports/local-performance-evidence.md)。
本段是检查后的证据更新，运行时文档快照在[运行时文档快照](../reports/local-performance-evidence.md)；产品输入未变。
500ms及完整架构目标仍未完成；普通规模、内存负收益和限制见
[最终报告](../reports/2026-10-21-incremental-input-optimization.md)。
