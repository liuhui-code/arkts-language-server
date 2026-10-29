# 索引缓存治理与显式RSS预算：合并候选验证

日期：2026-10-29。基线main与功能分支父提交均为
`9d47e550ee7c0a3ba9e0e889f62e04bb9fd4a78a`。
维护者本轮明确授权提交、推送功能分支、经PR/CI合并main；未授权部署日常Zed、重启用户进程或删除真实缓存。
此前两份实现报告中“未提交/未合并”描述的是首次验证阶段，后续交付状态以本次PR及最终交付收据为准。
本报告不是发布/真实UI/任意大内存工作集验收证明。

## 提交范围

- [ADR0028](../adr/0028-index-cache-lifecycle.md)：测试缓存隔离、workspace使用权、legacy预览与保守登记、
  活动/离线保护、DB/WAL/SHM整组退役、失败重试、闲置/显式容量治理及独立后台维护。
- [ADR0029](../adr/0029-opt-in-rss-memory-budget.md)：未配置预算时无默认固定RSS压力降级/驱逐；
  显式正数MiB预算保留原策略，正常所有权清理、故障恢复与V8/系统机制不变。
- 必要实现、公开LSP/Node/Rust回归、README、TDD、调查与上述记录的引用依赖一并提交。
  运行版本身份/release回收文档仍为Proposed，未实施其握手、告警或release回收。
- `docs/reports/2026-10-28-zed-30k-init99-investigation.md`是未被本次文档依赖引用的既有调查稿，
  保留在工作区，不纳入本次提交。`.bench`、缓存、SDK、构建产物和日志不提交。

## 验证输入和必要补充

已有最终Mac Node20.19.5/pnpm8.15.9 `pnpm check:fast`：2096/2096 PASS，
失败/取消/跳过/TODO均0；完整证据与SHA见
[默认无预算报告](2026-10-29-default-unbudgeted-memory.md)。
同步后远端main未前进，无合并冲突，65个原工作树文件与该最终记录一致。

合并前额外执行canonical CI要求的Rust fmt/Clippy：首次Clippy因三个collapsible-if诊断失败。
修复前已运行25项缓存公开CLI/使用权/策略/安全回归作为行为刻画，全部通过。
随后仅将`cache_gc/decision.rs`和`cache_gc/mod.rs`嵌套条件等价写成短路let-chain；
条件顺序、错误上报与清理边界不变。集成测试`cache_gc.rs`对共享protocol fixture中有意未使用的
方法使用带reason的局部`expect(dead_code)`，延续仓库共享fixture惯例；没有关闭Clippy或降低`-D warnings`。

这三处是完整Node检查后唯一的代码调整；没有再改Node、预算策略、输入校验、超时/内存/规模阈值。
重新release编译的原生sidecar SHA仍为
`f081d507b45ae99bac44450d9273db3b7f4752b196f95ab188ae622387421ba0`，
与2096次全量验证时逐字节相同；server/Worker输入及产物也保持原SHA。
不把此前Windows源码验证改写成这些源文件整理后的重新真机执行；远端CI仍须验证本PR确切提交。

| 合并前检查 | 实际结果 | 原始证据（`.bench/merge-cache-and-rss-20261029/`） |
| --- | --- | --- |
| 既有完整`pnpm check:fast` | 2096/2096，exit0；相同Node源码及运行产物 | 前述报告的`check-fast-receipt.json` |
| 整理前缓存行为刻画 | 25/25 PASS | `cache-characterization-before-lint-fix.log` |
| `cargo fmt --all --check` | PASS | `cargo-fmt-final-v2.log` |
| `cargo clippy --locked --workspace --all-targets -- -D warnings` | PASS | `cargo-clippy-final-v2.log` |
| `cargo test --locked --workspace --all-targets` | 212 PASS /0 FAIL /1 ignored | `cargo-workspace-final-v2.log` |
| `cargo build --locked --workspace --release` | PASS | `cargo-release-final-v2.log` |
| 新release上的Node/公开LSP焦点 | 39/39，0 FAIL/skip/cancel/todo | `final-native-node-focused.log` |
| 历史Windows验证 | 缓存native23项、Node6项；预算21+3项、生命周期2项，范围见两份实现报告 | 沿用原收据，不冒充本轮重新运行 |

Node焦点命令：

```sh
node --test --test-concurrency=1 tests/index-cache-cli.test.mjs \
  tests/lsp-cache-isolation.test.mjs tests/semantic/project-initialization.test.mjs \
  tests/semantic/semantic-coordinator.test.mjs
```

唯一ignored为此前已获维护者授权跳过的455文件冷目录3秒性能项，未标成通过。
本次没有删除该测试、修改canonical release gate、放宽断言或绕过远端保护。
PR须观察原仓库CI，包括`validate`和`windows-install`；其最终结果由GitHub确切head SHA绑定，
不由本地/历史通过代替，也不在此提前写成成功。

## 边界与遗留

真实30K Zed UI、实际>4GiB工作集耐久、30K完整引用/重命名、SDK超时/不完整、
原生索引内存及全量替换慢仍是独立限制；合成8GiB RSS测试不能证明真实OOM已解决。
500ms是允许波动的体验目标，不新增硬门禁。原真实缓存仅只读preview，未批量删除或部署自动维护。

既有超限迁移债：`crates/index-sqlite/src/lib.rs`1695行、`crates/index-sidecar/src/main.rs`712行、
`tests/semantic/references-depth.test.mjs`804行；本次候选已提取相关职责并缩小文件，合并整理不再增长。
新增源码/测试均不超过500行。
