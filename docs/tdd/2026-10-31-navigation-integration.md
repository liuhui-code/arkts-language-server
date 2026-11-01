# 2026-10-31：导航候选集成与 CI 夹具修正

集成父版本 `70a376357816a171829e5b30ee7d0cd3d4f8a6f7`，树
`664395b7ec159d2de24c2a4e4b0c1bea506d88f0`。
它包含原候选 `f42ab76` 和远端 main `8c0f38d`（PR #109）。
GitHub 合并检查树与本地检查树一致，证据为
`.bench/navigation-main-integration-20261031/ci-tree-identity.json`。

导航提案原实验编号0034与已发布私有 catalog ADR 冲突，合并前改为
[ADR0037](../adr/0037-navigation-work-and-input-validation.md)；0035/0036及历史收据保持。
本次夹具修正不引入新产品决策、不追认 ADR Accepted。

## 首轮 CI RED

[run 41175967802](https://github.com/liuhui-code/arkts-language-server/actions/runs/41175967802)
在 Linux 执行 `pnpm check:release`，其中完整 `pnpm check:fast` 为
2159/2161，2失败、0取消/跳过/todo；后续 release 步骤未执行。
Windows 安装、重复安装及已安装 LSP 冒烟通过，不是桌面 UI 验收。

原始完整 job 日志为 `.bench/navigation-main-integration-20261031/ci-release-raw.log`。
首次 `gh run view --log-failed` 下载内容不完整，另行保留，以上结论取完整 job 日志。
失败均在测试端；不能用 Mac 的先前通过替代 Linux 结果。

### 超大源码先枚举，缺少初始化锚点

`navigation-partial-membership` 原用例假设初始化总能先收集到正常源码，
固定断言 `project-membership-incomplete`。实际扫描遇到超大源码即停止，
若尚无成员，`prepareInitialWorkspace` 没有锚点，报告应为
`workspace-sources-unavailable`；已有锚点才报告 membership 不完整。
原 CI 未输出 preparation 全文，不能声称直接观测到其目录顺序。

通过真实 child-process stdio、只调整私有夹具的目录枚举顺序，在 Mac
强制 `Repair.ts` 先出现，稳定复现相同断言失败并捕获实际报告。
`controlled-red.log` 和 `worktree-repair-red.log` 记录 RED；
独立工作树首次路径设置错误另存 `worktree-repair-setup-error.log`，不计作功能 RED。

修正让同一公开用例分别确定性覆盖正常源码先出现和超大源码先出现：
精确断言两种初始原因；打开 Main 建立权威锚点，再显式 preparation，
仍精确断言 `project-membership-incomplete`。随后失败定义仍必须 -32803，
原路径既有文件内容修复、目录 mtimeNs 不变后必须得到完整精确 URI/range，且只有一个 Worker。
没有接受任意错误、删掉断言或改产品大小/超时阈值。

### 在途压力用例读取尚未完成的 JSONL

`semantic-l3-reference-admission` 的 `events()` 将实时文件所有非空片段
立即 JSON.parse，包含没有换行的尾行。CI 在 `waitForEvent` 此处出现 SyntaxError。
原服务文件未作为 artifact 保存，不能逐字证明原 CI 是尾行还是其他损坏；
受控未完成尾行稳定复现同类异常，足以证明读取器不符合实时 JSONL 边界。

先在原读取器增加最小 characterization：完整行后接半行应只返回完整记录，
补齐换行后返回第二条，损坏的完整行仍抛 SyntaxError。
`worktree-log-reader-red.log` 为确定性 RED；随后复用现有
`completeLogEvents`，不隐藏损坏完整记录、不改 LSP 压力/取消/结果断言。

## 验证命令与边界

```sh
node --test --test-name-pattern='source-unavailable' tests/semantic/navigation-partial-membership.test.mjs
node --test --test-name-pattern='in-flight pressure transcript polling' tests/semantic/semantic-l3-reference-admission.test.mjs
node --test --test-concurrency=1 tests/semantic/navigation-partial-membership.test.mjs tests/semantic/semantic-l3-reference-admission.test.mjs
```

定向 RED/GREEN 的其他用例因 name pattern 未执行，不能写成全量无 skip；
两份完整文件20/20通过、0失败/取消/跳过/todo、exit0，96150.124ms；
最终收据为 `worktree-focused-green.log`。新增两项用例，不增加测试文件或改变分层清单。
最终候选完整检查及 CI 结果在 PR #110 收据独立记录；本记录不预报尚未发生的通过。
生产 TS/Rust/运行配置未改，server/Worker/native 与集成候选相同，
继续使用已冻结候选及 SDK 身份，历史2160项和30K原始数据不改写。

真实 Zed UI、正式耐久、SDK 超时、完整30K引用/重命名及多秒长尾仍未闭环。
500ms仅体验目标；455冷 catalog 3秒门槛保持用户授权豁免，其他正确性检查不豁免。
本轮没有日常 Zed 部署、重启用户进程或删除真实缓存。

## 2026-11-01：实际 release 检查收尾

以上“生产 Rust 未改”限定于 `39b800a` 的夹具修正。
其 [CI 41179730655](https://github.com/liuhui-code/arkts-language-server/actions/runs/41179730655)
已完整通过 `pnpm check:fast`2163/2163、0失败/取消/跳过/todo；Windows安装检查通过，
但随后 Clippy 因 PR #109 的 Rust 代码失败。Mac `70a3763` 的完整检查2161/2161通过，
3525.066秒；这两个收据均不等于最终 release 全绿。

`bd15469` 完成最小整理：数据库租约条件作保留短路顺序的等价化简；
激活阶段以一个具名结构传递原参数；只有冷错误路径把进度和消息装箱，
线程仍解包并发送原有失败终态；查询一致性用例改用借用切片。
不改状态转换、协议、数据库身份、发布/取消次序或错误内容，不增加 lint 豁免。
`catalog.rs`仍500行、`catalog_worker.rs`347行，无超限增长。

整理前的公开保护：GC/外部SQLite reader1项、发布/取消/重启2项、
失败后保留旧代1项、完整查询一致性1项均通过。
`rust-*-characterization-before.log`及`rust-query-parity-before.log`保留原始收据。
整理后完整 Clippy、Rust普通集221项（0失败、1项默认ignored）、workspace release构建、
Zed查询文件校验、扩展格式和WASM release构建均通过。
本地未执行独立455文件冷目录3秒门槛，沿用用户授权豁免；没有豁免正确性检查。

测试准备的失败也保留：

- 嵌套工作树使 Cargo 找到外层workspace，扩展格式检查无法加载；
  移到`/private/tmp/arkts-navigation-integration-20261101`后通过，2099受管文件哈希零差异，
  不改产品manifest。证据`worktree-relocation.json`、`zed-fmt-final.log`及`zed-fmt-relocated.log`。
- 共享`dist`链接被便携产物安全检查正确拒绝，首轮6/7；
  改用真实产物及隔离冻结依赖后完整7/7、0失败/取消/跳过/todo，42312.827ms。
  不放宽符号链接/路径安全校验。原拒绝见`artifact-relocated.log`，
  GREEN见`artifact-materialized-final.log`。
- 共享依赖曾让安装测试改写主工作树依赖链接及构建路径标签；差异和首次恢复审计失败保留。
  离线按原冻结依赖恢复后，四个生产入口均与原集成哈希一致、主工作树无受管改动，
  见`local-build-path-drift.json`、`primary-runtime-restored-audit.json`、`primary-runtime-restored-v2.json`。

大项目发布层1/1通过：固定455文件冷catalog3937.85ms（仅记录），暖查询3.49ms，
30样本重复查询P95为2.99ms；`large-materialized-final.log`。
未将3937.85ms称为通过3秒门槛，未为它追加SQL/路径/页缓存优化。

最终本地产物：server `bc877f7d0fbe88e8e312bc22b0518cff42cf17b4b2a8a8b2a99d656e4d08dbe2`；
Worker `e2a30dd0ab83ad81c25c146d3315aa4ad7666d5a10b7e57e1ae468953b91a3c0`；
native `39166144329c572f7608c1298e492c212aa6bf3b353cb4610d96c4f68bdaa0c5`。
Node20.19.5、本地pnpm8.3.1；最终CI按仓库pnpm8.15.9重新验证。
证据根仍为`.bench/navigation-main-integration-20261031/`，Rust修改本体
`rust-lint-final.patch`的SHA为`23f039013e2d084b3cbfd15f8d7d84bce17d11dbf34d7f5d1eeb001b28798060`。

最终提交的CI及新增30K串行协议兼容性复核见PR #110后继收据，
本文件不预报尚未产生的通过；已有30K历史计时身份不改写。
真实UI、正式耐久、SDK超时、完整引用/重命名、多秒长尾等限制继续保留。
