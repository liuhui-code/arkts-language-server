# 补全详情频繁报错：根因与修复

日期：2026-10-25。范围 ZUI-01；用户授权定位并解决。实现位于当前工作树，
未合并、推送、发布或替换日常 Zed 安装。继承的 SDK、路径及 Worker 恢复修改均保留。
决策见 [ADR 0022](../adr/0022-completion-resolution-lifecycle.md)，
RED/GREEN 过程见 [TDD 记录](../tdd/completion-resolve-lifecycle-20261025.md)。

## 根因：正常的详情请求失效被当成参数错误

这不是由 Windows 盘符、SDK 缺项或 Worker 崩溃导致的这一类错误。
已保存的真实 Windows Zed UI 有 **41 次** `completionItem/resolve` -32602：
29 次关闭在先、3 次在途关闭、9 次目标没变而其他文件发生 mutation。
它们使用原列表 data，只有88个句柄，未触及512上限。
来源：[原 UI 报告](2026-10-24-windows-zed-ui-validation.md)、
[两端普通/插桩对照](2026-10-24-zed-cross-platform-causes-and-coverage.md)。

本轮再次读取 Windows 默认 Zed/扩展日志；其内部最后记录仍为10月24日，
没有将该磁盘日志误称为10月25日的新现场。保留
`.bench/completion-resolve-20261025/windows-node-logs-file.stdout`。
默认日志尾部没有 URI/句柄级新证据；详细归因依靠已捕获 UI 帧及可重复的公开 LSP 对照。

| 原路径 | 实际顺序 | 为什么报错 |
| --- | --- | --- |
| 关闭后晚到 | Zed 保存列表并异步取详情 → didClose → store 删除句柄 → 旧列表再 resolve | 前置 find 返回空，直接抛 InvalidParams |
| 无关文件事件交错 | 目标版本/句柄不变 → resolve 已在途 → 同根别的文件 open/close → supervisor 使在途结果 content-modified → runner 返回 null | adapter 把正常 null fallback 再抛为 InvalidParams |
| 目标在途关闭 | runner 的新鲜度 fence 丢弃结果 → null fallback | 同样被改抛成 InvalidParams |

无关 mutation 结束后，同一个未被删除的句柄又能成功 resolve，说明第二条路径
不是句柄丢失。上述三条在 Mac 与 Windows 均有普通生产 Worker 复现。
真实客户端取消是独立的 -32800；未把它误诊为“未知补全项”。

Zed 循环异步 resolve 多个可见项，任务保留列表和 buffer snapshot；关闭弹窗/文档
不保证所有详情请求已经停止。Zed 将 RPC 错误记为 ERROR。因此只换一个错误码
仍会污染日志，必须在服务端区分普通过期与真正无效请求。

## 调用链与责任

1. [registerCompletionHandlers](../../src/lsp/register-completion.ts)：公开
   `textDocument/completion` 取列表并存句柄；`completionItem/resolve` 查找上下文。
2. [CompletionResolutionStore](../../src/lsp/completion-resolution-store.ts)：
   旧实现用“语义上下文是否存在”同时判断“是否为本服务签发的条目”，混淆两种生命周期。
3. [SemanticRequestRunner.run](../../src/lsp/semantic-request-runner.ts)：
   文档版本/请求序号/client-cancelled/current-input guard；过期返回方法 fallback。
   [disk-source request](../../src/lsp/disk-source-request.ts) 保留磁盘源身份核验。
4. [SemanticWorkerEngine.resolveCompletion](../../src/semantic/semantic-worker-proxy.ts)：
   生产 Worker 请求，经 [workerDocumentRequest](../../src/semantic/semantic-worker-document-request.ts)
   和 root supervisor 调度；[invalidateRequests](../../src/semantic/semantic-worker-supervisor.ts)
   在 root mutation 后丢弃在途旧世代结果。
5. adapter 旧实现把 null 解释为未知/过期参数，造成错误升级。
   **本次修复在 LSP completion adapter/store/mapper，不删除 Worker 的新鲜度校验。**

SDK 输入质量、Program 重建和恢复状态机不是本次 -32602 的必要条件。
两文件最小夹具即可触发，且健康对照成功；没有用 Worker 重启、延长超时或吞掉所有异常处理它。

## 实现

- 签发条目和可用于补详情的语义上下文分开。编辑/关闭立即解除存储对上下文的引用，保留小的原始列表项；
  过期、在途被丢弃等普通情形返回原项，不增加文档、命令或自动导入编辑。
- 已经在途的 handler 仍可能持有局部快照，随请求终态解除；没有宣称立刻 GC、抢占同步编译或解决所有内存问题。
- 关闭重开即使 version 又为0也不会复活旧上下文；await 后检查 record 对象身份，
  淘汰或 dispose 也解除在途 handler 的上下文引用。
- 存储仍最多512项。超过容量的已签发项通过会话内认证票据恢复原始不可变字段，
  不保留无界历史、不访问编译器；可选 detail/documentation 丢失时省略。
  票据仅证明原列表字段，不能作为新鲜度或执行编辑的权限。
- 当前详情只修饰原始列表条目，保留 label、排序、过滤、插入和主 textEdit；
  新的附加编辑仍核验 URI/version，所有输入证明保持原合同。
- 伪造/外会话句柄 -32602、真实取消 -32800、未证明的工作区输入 -32803、
  后端故障 -32603、shutdown -32600 等继续独立验证。

关键文件：[注册与处理](../../src/lsp/register-completion.ts)、
[有界上下文存储](../../src/lsp/completion-resolution-store.ts)、
[会话票据与不可变字段投影](../../src/lsp/completion-item-ticket.ts)、
[详情映射](../../src/lsp/completion-mapper.ts)。
主 server 从596降至500行；原 reliability 测试883→337行，拆出的完成/详情测试各≤500行。
能力矩阵测试796→487/325行。支持矩阵970→936行仍是既有迁移债务；本次提取补全证据责任，未扩大该文件。

## 版本和环境

分支 `fix/windows-path-identity-20261022`；父提交
`e35459131366a32c48c10d1d74adef74357cd3dc`，包含继承工作树，不能只凭父提交重现候选。

| 项目 | 固定身份 |
| --- | --- |
| 最终产品 server.cjs SHA256 | `483b685c63f9e7d7448957fb07990271b3d3ee42dc585a0259f31fecb9cb3ed5` |
| semantic-worker.cjs SHA256 | `7d9d8ff20132b443d7cd084fecd1033c8f730f8edf0aebfcd9be3c31907c2e30`，本切片未改变 |
| 两端 Node | 20.19.5 |
| 实际编译器 | ohos-typescript 4.9.5-r10，原始 SHA256 `af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc` |
| Photos | `a2c993829c46d965abefc5d2143187fa54fa4604`，288个源码；git archive 隔离副本 |
| Mac SDK | DevEco 内置 OpenHarmony API24 / 6.1.1.125，含 loader/runtime declarations |
| Windows SDK | `D:/DevTools/sdk-declarations/openharmony-api24-6.1.1.125`，声明版；与 Mac SDK 内容不等同 |
| 客户端能力 | 从真实 Windows Zed1.25.3捕获的完整 capabilities，保存在测试 fixture |

所有语义参数使用产品默认值；只显式选择 SDK、隔离 log/index、原生 sidecar 和 Node。
Photos 两端均 SDK partial，缺 `@ohos.filemanagement.userFileManager`，没有用补桩伪造全项目 READY。
实际 Program 文件数/内部阶段耗时/内存峰值本次**未测**，本轮验证详情生命周期，不是规模性能认证。

## 验证与数据

定向回归 `18-regression.tap` **60/60**；票据/主编辑/故障合同 **7/7**；
证据矩阵与测试清单 **19/19**。Windows 生产 Worker 生命周期 **5/5**。
取消场景要求恰好一个 -32800，随后仍能正常补详情；自动导入场景实际应用新编辑、检查诊断及定义结果，
随后旧条目不得再返回其自动导入编辑。未通知依赖变化仍必须 -32803。

Photos 每端3轮串行、每轮7次查询，共21条；仅公开协议重放不冒称 UI。
位置：`common/src/main/ets/default/view/browserOperation/ThirdDeleteOperation.ts`，
callback，补全0基 UTF-16 `(32,9)`。每轮：列表 → 新鲜详情 → 详情在途打开
RenameMenuOperation → 详情在途关闭它 → 同句柄健康详情 → 关闭目标后详情 → version0重开后用旧 enriched item。
每次请求、时序、URI/位置、原始条目及响应均保存在 operations.json/wire.ndjson。

| Photos 公开操作，3轮 | Mac 中位 / 最大 ms | Windows 中位 / 最大 ms |
| --- | ---: | ---: |
| 列表 | 319.250 / 320.539 | 420.196 / 486.732 |
| 首次新鲜详情 | 266.261 / 286.232 | 351.196 / 485.443 |
| 无关 open 交错后的安全返回 | 13.158 / 24.795 | 20.713 / 24.403 |
| 无关 close 交错后的安全返回 | 16.388 / 18.573 | 21.174 / 21.237 |
| 事件结束后同句柄详情 | 86.909 / 111.072 | 169.989 / 170.135 |
| 目标关闭后晚到详情 | 1.793 / 2.152 | 1.796 / 1.844 |
| 目标同版本重开后旧详情 | 1.640 / 2.122 | 2.900 / 5.785 |

两端各21条无 RPC error，各仅一个 semantic.worker.started，无恢复/重建；正常 shutdown/exit=0。
初始化到 preparation：Mac20,788ms、Windows56,942ms，均 partial，不能从详情请求小于500ms推导初始化或全部功能达标。
这些是客户端完整响应（含传输/记录）时间，不是 UI 键盘到像素时间，不与插桩/冷进程统计混合。

完整 `pnpm check:fast`：**exit=0，2,035/2,035 PASS**；fail/cancelled/skipped/todo均为0。
Node测试用时3,334,512ms；包含类型检查、构建和完整fast测试，release sidecar构建成功。
第一次受限运行 `22-check-fast.log` 被停止：进程/RSS采样 spawn EPERM，以及测试拆分后证据路径未更新。
证据路径和对应负向错误信息已修正，矩阵测试重新 GREEN；重跑 `27-check-fast.log` 使用所需进程权限。
产品源码及两端 bundle 在最终运行期间未改。运行后输入核对只有一个测试文件删除了多余EOF空行，
没有改测试语句；最终清单为 `final-validation-inputs-v3.json`（740项，SHA256
`80e51e11b931c77959d41346c7fecf28d4878f8e4a59ff456f0a92123ba2e416`），
差异记录在 `final-input-adjustments.json`，相关矩阵/清单额外重验19/19。
这不是455文件门槛的豁免，也未删除其他检查。455文件冷目录3秒门槛继续按用户此前授权单独排除。

## 真实 Zed UI 状态与限制

后续进展：本报告下面保留前次被阻断的历史。随后已经完成实际前台验收，
见[Windows Zed前台验收](2026-10-25-windows-zed-foreground-acceptance.md)：243条详情零错误，
覆盖编辑接受/实际跳转及无关文档交错；500ms性能和关闭日志仍有遗留，不能称为所有UI问题已解决。

Windows 新建专用 profile、Photos 副本、固定扩展 Wasm和被动 relay；不修改日常安装。
三次独立 UI 尝试均实际启动服务，但首次F6输入被“自有窗口必须在前台”的保护拦住，
**没有完成一次 UI 补全，不能计为 UI PASS**。第一次立即核验焦点；第二次增加2秒有界观察；
截图发现新建项目的信任提示，第三次补了仅针对隔离副本的确认并记录实际前台 PID。
第三次保护失败时 expected Zed PID=20428，actual=17708，查询到的进程是同Session2的 **msedge**。
这是可观察的测试环境阻点，不据此推断用户操作或某个 Windows 焦点策略，也没有向 Edge 发送输入。
所有尝试分别保留；自有 profile 关闭后仍驻留的进程按profile、创建时间和后代身份清理，计划任务删除。
不把强制清理当作产品正常 dispose 的证明；正常 shutdown 证明来自上述两端公开协议运行。
真实 UI 修复效果仍未闭环，仅协议结果不能替代它。

另对原真实 Zed 流量的88个签发项、68次详情往返核对了票据覆盖的不可变字段，
全部原样保留；`zed-original-field-roundtrip.json` 保存结果。这验证该已捕获客户端的字段往返，
没有宣称覆盖所有客户端或替代本轮 UI 成功。

## 证据与复现

证据根目录 `.bench/completion-resolve-20261025/`：

- `before-inputs.json`、`candidate-final-tracked.diff`、`final-validation-inputs-v2.json` / `v3.json`、`final-verification.json`：修改前/候选/输入哈希及终态。
- `04-close-red.tap`、`10-eviction-red-corrected.tap`、`15-immutable-red.tap`：三条有效 RED。
- `18-regression.tap`、`19-ticket-boundaries.tap`、`26-matrix-and-manifest-green.tap`、`27-check-fast.log`、`28-final-matrix-and-manifest.tap`。
- `mac-lifecycle/*/{wire.ndjson,operations.json,logs}`；`mac-photos/{report.json,operations.json,wire.ndjson}`。
- `windows-validation/windows-lifecycle.tap`（原始UTF-16）、`windows-lifecycle/*`、`windows-photos/*`。
- `windows-ui-1-complete/`、`windows-ui-2/`、`windows-ui-3/`、`windows-ui*.receipt.json`：UI失败及独立复测，诊断脚本失败与产品错误分别记录。
- `photos-resolve.mjs`、`windows-validate*.ps1`、`ui-tools*/`、`remote.py`：复现脚本。

```sh
PATH=/Users/liuhui/.nvm/versions/node/v20.19.5/bin:$PATH pnpm build
node --test --test-concurrency=1 tests/semantic/completion-resolve-lifecycle.test.mjs
node .bench/completion-resolve-20261025/photos-resolve.mjs OUTPUT PHOTOS_REPOSITORY SDK_OPENHARMONY
pnpm check:fast
```

Windows 候选为 `D:/code/arkts-completion-resolve-20261025`；执行脚本保存 Node路径、SDK、SHA及退出码。
报告和 Git diff 可审查，原始 `.bench` 证据保留本地，未对外发布原项目/用户日志。

缓存失效性能 TODO、初始化/规模/500ms目标、未补齐 SDK、Zed rename协商问题不在本次完成范围。
