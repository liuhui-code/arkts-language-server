# 全量 catalog 私有构建实施记录

父版本：`04282ed34ebab7cd01726bb0291af53bd278ff00`。
分支：`fix/catalog-private-build-20261030`。
决策：[ADR 0034](../adr/0034-private-catalog-publication.md)。

用户确认普通编辑已经增量，要求推进其余计划；沿用“不运行测试”的执行约束。
首个存储用例和 LSP 进度用例先于实现编写，其余用例随切片补充；没有执行失败命令，
因此 **RED、GREEN 均为 NOT RUN**。
不声称完成 TDD 运行闭环，不以编译检查替代行为验收。

| 切片 | 公开接口及行为 | 待执行命令 |
| --- | --- | --- |
| 私有构建 | CatalogStore 查询只看到完整旧/新库；取消、坏数据、并发增量写入不覆盖旧库 | `cargo test -p arkts-index-sqlite --test catalog_publication` |
| 大文档 | 一份引用很多的文件也在完成前报告已提交行，不形成整文档巨型事务 | 同上 |
| 复用 | 相同输入推进 generation；普通增量编辑使复用失效 | 同上 |
| 查询一致性 | 新库发布及后续增量保持 FTS、exports、references 和 class facts 与内存实现一致 | `cargo test -p arkts-index-sqlite --test catalog_query_parity` |
| 缓存回收 | 真 GC 子进程保护 namespace lease 和不认识 lease 的 SQLite reader，关闭后才回收整组 | `cargo test -p arkts-index-sidecar --test catalog_cache_gc` |
| native 协议 | 真子进程 NDJSON 响应、私有激活可取消、阶段序号、重启读取已发布库 | `cargo test -p arkts-index-sidecar --test catalog_publication` |
| LSP | 真子进程 Content-Length stdio 显示存储阶段和耗时，发布前无数字百分比，之后仍可查询 | `node --test tests/semantic/catalog-storage-progress.test.mjs tests/lsp-workspace-symbol.test.mjs`（先准备运行产物） |

静态检查：TypeScript `tsc --noEmit`、Rust `cargo check --offline` 和包含测试目标的
`cargo check --offline -p arkts-index-sidecar -p arkts-index-sqlite --tests`。
这些命令只检查类型/编译，不执行测试。最终检查结果在本记录结尾更新。

既有 characterization：`catalog_reset_contract`、reference/class-binding contract、
`ndjson_protocol` 的原子激活/查询隔离/恢复用例、`lsp-workspace-symbol` 的 framed progress。
普通增量 API 保留，提取的 ordinal helper 默认仍使用 offset=0 且不忽略 identity 冲突。
原超大 `ndjson_protocol.rs` 的激活响应性用例移入独立 transcript 文件并更新取消预期。

尚待执行：以上用例、缓存 GC 安全回归、check:fast、完整 Rust 回归，以及真实 30K 项目
冷启动、热启动、强制重建、查询并发、双窗口、取消、进程强杀、磁盘满、Windows 打开
句柄场景。需要记录总时间、各阶段耗时、DB/WAL/峰值磁盘、内存和结果一致性。

文件规模迁移：`index-sqlite/src/lib.rs`、`index-sidecar/src/main.rs`、
`sidecar-workspace-index.ts`、`ndjson_protocol.rs` 仍超过 500 行，但均缩小并提取了
明确职责；扫描器收敛至 500 行，新文件保持不超过 500 行。

最终静态检查（均 exit 0）：

- `../../node_modules/.bin/tsc --noEmit -p tsconfig.json`。
- `cargo check --offline -p arkts-index-sidecar -p arkts-index-sqlite --tests`，只编译测试目标，无用例执行。
- `cargo build --offline --release -p arkts-index-sidecar`，优化产物编译/链接完成，未启动二进制。
- 变更 Rust 文件 rustfmt；变更 JS/测试/manifest 的 `node --check`；`git diff --check`。
- 新 source/test/script 文件均 ≤500 行；既有债务：lib.rs 1695→1647、main.rs 712→615、
  sidecar-workspace-index.ts 1321→1168、ndjson_protocol.rs 2545→2436。

服务日志按阶段族变化或每 10 秒记录 storage 摘要；细粒度批次/checkpoint JSONL 可通过
`ARKTS_INDEX_CATALOG_BUILD_TRACE_FILE` 留证，不把大量默认 stderr 输出变成新的管道背压。
旧 SQL 单事务 trace 仍适用于直接 SqliteStore.replace_all，产品全量构建改用新 trace。
诊断 observer 同步改为解析发布文件，其公开回归用例已更新但未执行。

测试命令、check:fast、真实大项目、Windows、故障注入及 CI：**NOT RUN（按用户要求）**。
没有将测试目标的编译成功记作测试通过，未记录不存在的 RED/GREEN 收据。
