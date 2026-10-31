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
