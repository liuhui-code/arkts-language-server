# 索引存储路径的TDD与回归记录

父版本：`e170a768d1d76d2fb88b1d383f4cf7143f85cc3f`。
候选：`feat/index-storage-location-20261102` 的未提交工作树；不部署、不发布、不合并。
证据根：`.bench/index-storage-location-20261102/`。本轮测试已获授权，上一轮“不测试”不延续。
Node固定仓库 `.node-version` 的20.19.5；实际编译器4.9.5-r10。
命令均在`.bench/index-storage-location-20261102/worktree`执行；
在其他工作树复跑时先运行该工作树的`pnpm build`，不能沿用旧dist冒充候选。

## 逐切片RED → GREEN

1. 原公开路径驱动表征：
   `node --test --test-name-pattern='resolves explicit and portable' tests/index-adapter.test.mjs`。
   `characterization-platform-paths.log` 1项通过，其余为名称筛选，不能写成整个adapter通过。
2. `node --test tests/index-cache-directory.test.mjs`：
   `red-windows-preferred-directory.log` 实际LOCALAPPDATA路径，期望D根；
   `green-windows-preferred-directory.log` 通过。
   随后把配置路径职责从超长adapter测试移至新文件，保留原sidecar/非Windows/环境覆盖表征，
   `green-path-characterization-extracted.log` 3项通过，原文件856→806行。
3. 新API缺盘回退：`red-windows-missing-drive-fallback.log` →
   `green-windows-missing-drive-fallback.log`。进一步覆盖可写D、ENOENT/EACCES/EPERM/EROFS/ENOSPC、
   无LOCALAPPDATA、显式目录失败不改根、两处失败、真实自有探测清理及原DB/WAL字节保留。
   Win策略使用注入的文件系统边界，明确不是NTFS实机。
4. 标准构建后通过真实child、Content-Length framed stdio运行
   `node --test tests/lsp-index-storage.test.mjs`：
   `red-public-configured-cache-warning.log` 等不到应有的window/showMessage，RED；
   接入异步选择及通知后 `green-public-configured-cache-warning.log` 通过，
   告警包含实际错误配置，同会话变量定义位置精确正确。
   使用显式ShowMessageNotification，未调用实际包内发送request的showWarningMessage。
5. `red-disposed-owner-probe.log`：owner已关闭仍创建目录；
   加准入保护后 `green-disposed-owner-probe.log` 通过。
   并发root只告警一次、准备中关闭不再打开sidecar的对照见 `green-directory-lifetimes.log`。
6. `red-storage-environment-snapshot.log`：准备前外部修改env改变了原会话选择；
   保存启动环境后 `green-storage-environment-snapshot.log` 通过。
7. `red-windows-environment-casing.log`：复制Windows环境后小写变量名丢失，错误选D；
   规范化本功能环境名后 `green-windows-environment-casing.log` 15项通过。
   路径/其他变量大小写保持；LOCALAPPDATA别名与非Windows大小写规则另有断言。
8. 测试清单：`red-test-layer-entries.log` 发现未分类新入口；
   首轮更新还遗漏分层总数，保留 `green-test-layer-entries.log` 中的失败。
   精确更新为286入口（unit118、bundle149）后 `green-test-layer-entries-final.log` 4项通过，未放宽校验。

## Native集成与一次未归因的等待失败

现有Mac native release复制到隔离工作树，SHA见 `native-identity.json`；Rust源码未改，未声称重新构建Rust。
公开LSP验证真实两个workspace的不同key和符号位置、同根GC、活动保护、正常关闭后同目录复用。
另验证管理CLI的显式--cache-dir覆盖不可用ENV目录，preview不创建目录或启动写探测。

第一次 `native-storage-lsp-first.log`：2项中1通过、1达到测试10秒等待上限，
当时没观察到所需两组workspace/symbol结果；未测到产品最终终态。
该轮临时工程被当时清理钩子移除，只保留TAP，内部日志不足，**无法归因**。
随后仅加强测试失败现场保留及stderr诊断；`native-storage-lsp-diagnostic.log`
名称筛选下native一项通过、另一项筛除。
接着完整两项连续串行10轮均通过，见 `native-repeat-{01..10}.log` 与 `native-repeat-progress.json`。
每轮是新进程和新测试缓存根，未清理OS文件/代码缓存，不代表物理整机冷启动。
没有改变产品超时、测试等待上限或正确性断言，没有因复测通过就宣布原等待失败已修复。

## 最终候选检查

`build-final-casing.log`：`pnpm build` 通过。
`typecheck-final-casing.log`：`pnpm check` 通过。
`targeted-final-casing.log`：**83/83通过、0失败、0跳过**，71731.678ms。
覆盖12个测试文件；此前环境大小写补强前一轮 `targeted-final.log` 82/82通过，作为历史收据保留。

```sh
node --test --test-concurrency=1 \
  tests/index-cache-directory.test.mjs tests/lsp-index-storage.test.mjs \
  tests/index-adapter.test.mjs tests/index-catalog-adapter.test.mjs \
  tests/lsp-production-index.test.mjs tests/index-cache-cli.test.mjs \
  tests/lsp-cache-isolation.test.mjs tests/logging.test.mjs \
  tests/test-layer-manifest.test.mjs tests/local-delivery-config.test.mjs \
  tests/workspace-symbol-service.test.mjs tests/lsp-workspace-symbol.test.mjs
```

这里node使用 `/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node`；
pnpm build/check的PATH也选择同版本。不是全仓 `pnpm check:fast`，本轮没有执行该全量门禁。
未改Rust，无新增cargo测试/Native编译；复制的native二进制及适用范围如实记录。
Windows SSH两次8秒连接超时，未运行Windows实机或Zed UI测试；不能把Mac进程中注入win32策略算成实机通过。
最终源码/产物身份 `final-candidate-identity.json`；原工作区保护和交付清单另存于同一证据根。

[配置](../configuration/index-storage.md) · [ADR0041](../adr/0041-windows-index-storage-location.md) ·
[实现与限制报告](../reports/2026-11-02-index-storage-location.md)。
