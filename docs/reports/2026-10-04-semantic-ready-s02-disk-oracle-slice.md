# S02：原路径磁盘输入的 stock-oracle 前置切片

日期：2026-10-04。父修订 `c4df943e5ff9dc1d724bb2aee75d7c4a197efcf4`；
保留已有未提交改动。**本切片不是 Settings 语义等价实验：S02 FAIL，S03 BLOCKED。**

既有 S02 spike 只接受把源码正文内嵌在 JSON 的小 fixture，并以 JSON 所在
目录为 compiler project root。将真实 Settings 文件复制进 fixture 会改变
路径、工程边界与解析条件，不能作为真实工程证据。公开 CLI 测试先 RED：
`node --test tests/semantic-facts-disk-oracle.test.mjs` 因 schema-v2 磁盘输入被拒。
最小实现让 **`--mode oracle` 独占**读取磁盘 manifest，manifest 仅列原始
`workspaceRoot`、`sdkRoot`、相对文件名和这些**列出文件**的
`listedSourceSha256`；不把源码正文写入 manifest，不写入或复制工程文件。
读取前检查源文件路径未逸出 workspace，读取后重算摘要，不匹配即拒绝。
`extract`、v6 hook、生产 LSP 路径及默认策略均未修改。

当前磁盘模式仍使用现有 `createSpikeProject` 简化 Host：没有加载 API24 SDK
ambient declarations、Harmony package resolver、ProjectGraph membership 或生产
compiler options。`sdkRoot` 目前只用于输入存在性检查，**没有进入 Host**。
因此 oracle 输出明确标记 `HOST_PARITY_NOT_MET`、`sdkUsedByHost:false`、
`productionApproved:false`。此时即使输出 `COMPLETE` Locations，也只能说明
列出文件在简化 Host 中的 stock compiler 结果，不能充当 Settings/API24
或 DevEco 的语义 golden。`listedSourceSha256` 不是整个 workspace、SDK 或
依赖图的摘要；绝不据它宣称完整快照。

GREEN：`node --test tests/semantic-facts-disk-oracle.test.mjs
tests/semantic-facts-spike.test.mjs tests/test-layer-manifest.test.mjs` 为 17/17 PASS；
`pnpm check` 与 `git diff --check` PASS。新 CLI 测试还拒绝摘要失配与内联
源码副本。测试文件已纳入 `unit-contract` 层；本切片未重跑完整
`pnpm check:fast`，没有提交、推送或合并。

下一硬门不是把 Settings 文件列表填进这个 schema 后直接跑 v6，而是先让
提取器与 stock oracle 消费**同一原路径工程 Host**：锁定 Settings commit、
SDK 声明摘要、产品／target、有效源码 membership、Harmony resolver 与编译
选项，核对现有真实 LSP oracle 的 URI＋UTF-16 集合，再启动 hook 提取。
当前 v6 仍会在 fixture 的别名变量 `new Alias()` origin 上 fail-closed；
Settings 是否触发同形状、资源成本如何，均尚未实测。
