# Worker 状态机诊断用例

这些用例最初用于 v8 方案审查，原包包含已确认 RED。原始失败数据保持封存。
当前五个 `.audit.mjs` 是正式快测的兼容入口，断言已迁入 `tests/semantic/worker-*.test.mjs`。
新增所有权、退休边界和父进程编译器隔离后，共八个正式入口、30 项公开回归，不以 skip/todo 规避失败。
当前实现、最终验收及未验证边界见 [实施报告](../../docs/reports/2026-10-24-worker-state-contract-implementation.md)。
本轮不发布或合并。

在仓库根目录执行：

```sh
ARKTS_AUDIT_EVIDENCE_DIR="$PWD/.bench/state-boundary-repro-001" /Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 tests/audits/*.audit.mjs
```

每次使用新的证据目录，防止覆盖。封存的原 v8 包退出 1：22 项，10 PASS、12 FAIL、0 skip/cancel/todo；这是历史诊断结果。
实际输入、命令、最终代码指纹和原始数据在 `.bench/state-machine-boundaries-20261024/`。

| 文件 | 公开行为和边界 |
| --- | --- |
| recovery-replay.audit.mjs | 两文件重放；快照前后关闭重开、版本重置；关闭回磁盘；A→B→A 的依赖新鲜度 |
| recovery-replay-model.audit.mjs | 穷举两个文件、长度 3 的 8 种编辑顺序，独立文本模型计算 UTF-16 精确位置，包含 CRLF 与非 BMP 字符 |
| registry-cleanup.audit.mjs | 无 release 故障对照、实际副作用前/后抛错，以及真实客户端取消与清算失败叠加 |
| worker-retirement.audit.mjs | 未确认退出时 terminate 失败、退出后报错、终止 Promise 未完成期间的取消与恢复 |
| recovery-configuration.audit.mjs | 恢复时切换 SDK 精确目标；准备时切换配置撤销旧 READY，修复配置后恢复 |

所有查询通过真实子进程 Content-Length stdio。故障仅由独立测试预加载器注入，生产环境不加载这些文件。
SDK 为临时最小夹具，使用实际固定编译器，不能将结果外推为完整 SDK/Photos/Windows 真机验证。
生命周期测试的 before/after terminate 拒绝是额外防御性故障；Node 正常实现以 exit 兑现 Promise，尚未自然复现这种拒绝。
封存 v8 的 pre-effect 旧 Worker 由测试清理器兜底，不能算产品已回收。
当前回归要求产品关闭后零物理语义 Worker；出现 `audit-forced-orphan-cleanup` 即失败。

每个场景保存原始 LSP 帧、stderr、Worker 收发/创建/退出、公开响应和操作耗时。
`arkts/stateAuditBarrier` 是故意未实现的请求，预期 -32601 仅作为父端消息顺序屏障，不是生产错误。
原始 Worker 日志中的 RSS 是共享进程 RSS，不按线程相加，也不由 Registry 租约份数推断字节数。

最小 URI 因果对照包来自前轮 `.bench/state-machine-audit-20261024/same-document-coalescing/`，
只在隔离生成包加入 URI 相等，正式运行包不变。执行记录 `same-uri-final.tap` 的 13/13 仅证明该重放子集。
详细结论与实施合同见 `docs/reports/2026-10-24-state-machine-boundary-validation.md`
及 `docs/plans/2026-10-24-worker-recovery-state-contract.md`。
