# Windows索引存储路径实现与验证

日期：2026-11-02。父版本 `e170a768d1d76d2fb88b1d383f4cf7143f85cc3f`。
验证时分支 `feat/index-storage-location-20261102`，当时未提交/发布/合并/部署；
后续用户授权的仓库集成与本次不重测约定见本文末尾。
实现、构建及针对性回归完成；Windows实机仍受SSH阻塞。

## 最终行为

| 项目 | 行为 |
|---|---|
| Windows默认 | `D:\arkts-language-server\index`，目录可创建；不伪造或挂载D盘 |
| 用户配置 | 现有 `ARKTS_INDEX_CACHE_DIR` 非空值优先，Zed通过binary.env传入 |
| 默认D不可用 | 异步真实写/改名/删除自有文件探测失败后，尝试原LOCALAPPDATA目录并明确告警 |
| LOCALAPPDATA为空/未设置 | `<用户home>\AppData\Local\arkts-language-server\index` |
| 显式目录失败 | 不偷偷回退；发送Warning，工作区索引degraded，语义状态不被级联改写 |
| 默认和回退都失败 | 明确列出两个失败，不另选temp缓存 |
| 配置时间 | 启动环境快照，所有root共用一次异步选择；修改配置须重启LS，活跃库不切换 |
| 非Windows默认 | 原macOS Library/Caches、Linux XDG/.cache路径及懒打开行为保持 |
| 管理CLI | --cache-dir > ENV > 平台首选值；preview不写探测，管理回退根应传实际路径 |

警告使用标准 `window/showMessage`、Warning类型，无需客户端回复；
`index.cache.directory.selected` 记录请求根、实际选择和来源；不可用/告警另有结构化事件。
不会在每条查询或每个root重复探测，不用TTL/全清替代当前工作区状态。

## 已核对的范围与调用链

1. [cache-directory.ts](../../src/index/cache-directory.ts)：原环境覆盖，新增Windows首选D与准备/探测。
   绝对 `D:\` 避免盘符相对路径；仅本功能配置名按Windows规则规范化，文件路径不折叠大小写。
2. [index-storage.ts](../../src/composition/index-storage.ts)：会话级环境快照、共享Promise、一次告警和GC实际根；
   [production-services.ts](../../src/composition/production-services.ts)把同一owner交给索引及维护。
3. [DefaultWorkspaceSymbolService](../../src/workspace/default-workspace-symbol-service.ts)：后台等待存储准备；
   独立语义初始化不等待它；关闭/取消后不继续打开新sidecar。
4. [workspace-index-initialization.ts](../../src/lsp/workspace-index-initialization.ts)：警告通知、进度及索引终态；
   未改SDK/Program/Worker状态机或恢复预算。
5. [workspace-uri-identity.ts](../../src/index/workspace-uri-identity.ts)与
   [sidecar-workspace-index.ts](../../src/index/sidecar-workspace-index.ts)：沿用真实目录及工作区身份核验。
6. Rust [cache_location.rs](../../crates/index-sqlite/src/cache_location.rs)：canonical workspace URI→SHA256 key，
   仍是 `<root>/workspaces/<64hex>/`。不改key、版本盐、DB schema或并发租约。
7. [Zed扩展](../../editors/zed/src/lib.rs)已有LspSettings.binary.env，无需修改扩展代码或新增初始化配置入口。

根下包含 `symbols-v2.sqlite3` 逻辑库、`catalog-state.sqlite3`、私有 `catalog-*.sqlite3`，
相应WAL/SHM、`catalog-publication.lock`、`cache-use.json`、`.leases`及GC锁/状态/退役区。
所有常驻索引跟随实际选择。GC只读身份核验的有界副本仍按原机制放OS temp，
项目/SDK源码、日志、安装release、Zed自身数据及语义内存缓存不搬移。

旧根既不复制也不清空，新根首次建库、同根后继会话复用；旧库可由重新配置旧根继续使用。
本轮没有对用户原缓存执行preview/clean、迁移或删除，只在隔离目录验证。
正常维护仍遵守[ADR0028](../adr/0028-index-cache-lifecycle.md)的活动/身份/WAL保护，
维护使用当前实际根，不扫描因迁移而遗留的其他根。

## 配置例子

```json
{
  "lsp": {
    "arkts-language-server": {
      "binary": {
        "env": { "ARKTS_INDEX_CACHE_DIR": "E:/ArkTSCache" }
      }
    }
  }
}
```

重启语言服务后生效。绝对路径推荐；不自动展开JSON中的 `%VAR%` 或 `~`。
完整优先级、PowerShell、回退目录管理及范围见[配置说明](../configuration/index-storage.md)。

## 验证结果与边界

证据根 `.bench/index-storage-location-20261102/`；
[TDD记录](../tdd/2026-11-02-index-storage-location.md)列出全部RED/失败/最终命令。

| 验证 | 实际结果 |
|---|---|
| 最终build / typecheck | pnpm build、pnpm check通过，Node20.19.5 |
| 最终针对性回归 | 12文件，**83/83通过，0失败，0跳过** |
| Win32策略模拟 | D可写/缺失/权限/只读/空间不足、ENV优先/大小写、fallback及两处失败；不是NTFS实机 |
| Mac真实文件系统 | 自有写/改名/清理，既有DB/WAL字节保留，配置路径空格/Unicode，非Windows路径保留 |
| 公开child LSP | 无效配置发Warning；同会话定义目标/范围正确；无额外告警请求等待 |
| Mac真实native | 双root分库/符号位置正确、GC同根与活动保护、重启key目录复用、正常shutdown |
| 管理命令 | 显式--cache-dir覆盖无效ENV文件路径；preview不创建目录、不做写探测 |
| 生命周期 | 并发根一次准备/告警，准备中关闭不打开sidecar，关闭后不建目录，env不随外部修改漂移 |
| 既有回归 | adapter/catalog、配置传递、隔离、日志、清单、workspace符号与生产组合均纳入最终83项 |
| Windows实机/UI | 两次ssh windows-pc，192.168.31.14:22在8秒连接窗口超时；**未执行** |
| 全量check:fast / Rust构建 | 本轮未执行，不冒称通过；Rust源未改，native是精确复制的既有Mac release |

一次初始native用例在测试10秒等待上限前未观察到两组符号，保存 `native-storage-lsp-first.log`。
它没有测到产品最终终态；旧测试清理钩子已删除该临时工程，缺少内部阶段日志，原因**未证实**。
随后加强失败留存，未改产品或等待上限，筛选native一次通过，再完整串行10轮20项均通过；
最终候选包括CLI补充和环境名修复后的83项全部通过。保留该失败，不把“未复现”写成已经修复。
本次不是30K性能、Zed UI或长时间耐久验收，也不修改500ms体验目标或任何RSS/堆/超时/成员阈值。

## 身份与交付

最终 `final-candidate-identity.json` 保存源码及测试哈希、分支/父版本、环境与产物：

- server SHA256：`7b15dcb5a7a435fcc9c4cd77510f65bb05038cc4c7a7371cce1bc298805ffb67`。
- Worker SHA256：`00f3c343f73c314abb95eb9d77fda7476456acafadf784d71ba5ec6519b50ed4`，与本轮起点相同。
- native SHA256：`b0e248683f3c1f6681a77e98e5098ac351c2e1c4857feebd98ba1fe463f6d12d`，
  从原有release逐字节复制到隔离工作树；不声称是此次新构建或Windows二进制。
- 测试SDK是仓库conformance夹具，非Windows Photos实际SDK；编译器4.9.5-r10。

新增源码/测试≤500行，`default-workspace-symbol-service.ts`428行；
历史 `tests/index-adapter.test.mjs`856→806行，仍列为迁移债务。
主工作区的其他工作按开始时逐文件SHA保护；交付/保留收据位于证据根。
[ADR0041](../adr/0041-windows-index-storage-location.md)保持Proposed，不伪造人工审批。
实现验证阶段未提交、push、合并、安装或重启用户进程；部署/Windows实机验证仍需后续实际执行。

## 2026-11-02仓库集成记录

用户随后明确授权只将本任务18个相关文件按本仓库分支/PR流程合入main，保留其他未提交工作。
**本次不运行测试、不重新构建、不重复功能验证**；仅核对Git状态、差异、远端规则及合并结果。
上文build/typecheck、83项及10轮复测均为已有历史收据，不能写成本次新增通过。
提交、PR及main合并标题带`[skip ci]`，避免在流程允许时触发测试构建；不修改CI规则或绕过分支保护。
如远端必需检查与不测试要求冲突，应保留PR并报告实际阻挡，不以管理员参数强行合入。

Windows真实文件系统/Zed UI仍未验证，策略模拟不替代实机。
`native-storage-lsp-first.log`中测试10秒等待失败及未归因状态完整保留，后续通过不证明它已解决。
本次不纳入临时缓存、构建产物或其他任务的改动，不迁移/删除真实索引，不部署或重启日常Zed。
Git提交、PR、main及原工作区保留收据写入`.bench/index-storage-main-integration-20261102/`。
