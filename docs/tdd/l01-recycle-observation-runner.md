# L01 prepared-suite 回收观察窗口

Parent revision: `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`。保留已有 dirty worktree。

新增真实子进程 LSP 测试：`tests/prepared-suite-l3-cli.test.mjs` 对实际 L3 驱逐后的等长观察窗口提出断言，首次运行 RED（缺少 `post-eviction-observation-*` 时间线）；增加 `runtime.afterEvictionObservationMs` 输入验证与运行逻辑后 GREEN。另新增 `tests/prepared-suite-worker-recycle-cli.test.mjs`，要求显式回收事件、旧/新 threadId、正常诊断及完整引用；首次运行 RED（缺少 recycle 事件），runner 调用双开关控制并等待 ACK 后 GREEN。

验证命令：

```bash
node --test tests/prepared-suite-l3-cli.test.mjs tests/prepared-suite-worker-recycle-cli.test.mjs
node --test tests/test-layer-manifest.test.mjs
```

macOS 外部 RSS 采样器需获准读取子进程 PID；普通沙箱中的两项 CLI 测试因无法取得第一条样本而 FAIL，在获准的相同命令下 **2/2 GREEN**。测试层 manifest 同时纳入新增 CLI 和 Worker 公共 LSP 测试。观察窗口从驱逐见证开始计时；回收所耗时间计入窗口，超时会显式记录 `overrunMs`，不会在回收之后另加隐藏等待。功能默认关闭，生产行为未变。
