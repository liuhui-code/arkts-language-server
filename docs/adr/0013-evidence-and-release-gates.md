# ADR 0013：证据分层、完整响应计时与发布门禁

日期：2026-09-29。状态：**Proposed；不代表产品门禁已通过**。

## Context

缓存热请求、不同 SDK/配置、trace-on 归因和默认产品测量不能混作一个性能结论。结果数量相同也不能证明精确语义。

## Proposed decision

- 保留原正确性、回归和内存门禁，新增 post-ready 500 ms 分桶；最严格的适用门禁生效。
- trace-on 只做归因；产品时延使用 trace-off、独立进程和真实 framed LSP。计时从请求发出至完整终态，包括排队、更新/恢复等待、回退和序列化。
- 首次准备的时间、资源、进度和故障单列；ready 不能来自静默预跑全部基准目标。准备没有内存或后台 CPU 豁免。
- 测量前冻结语料、能力、操作分布、硬件和工具链；ready 后才按固定 seed 选择未查询目标。新符号、新模块、普通编辑和驱逐/重启查询各桶独立报告。
- 正常请求的 error/timeout 算失败；主动取消及故意 ContentModified 使用独立矩阵。PASS/FAIL/BLOCKED/NOT_RUN 分开，环境缺失、样本不足和旧版本 CI 不能成为 PASS。
- 阶段实施和产品毕业分别审查：在精确性、完整性、新鲜度、取消及新路径资源安全通过时，已测得的 500 ms FAIL 不阻止继续下一安全实施切片；该失败仍阻止默认推广与最终发布，不降低其样本或阈值。

## Gate and failure policy

[验收协议](../benchmarks/semantic-ready-acceptance.md) 定义 G-CORRECT、G-READY、G-LATENCY、G-MEMORY、G-LIFECYCLE 和 G-PORTABILITY。精确对照要求零 missing/extra/stale/非法 UTF-16；references 的两种 `includeDeclaration` 都验证，未完成工作不能发布 partial success。

初始准备豁免时延不豁免原 >3 GB 复现、最终 50% 内存目标、DevEco/PSS、post-eviction 或工作区规模门禁。Node PID RSS 只计一次，worker threads 不重复叠加；macOS RSS 不能充当 Linux release PSS。

必需指标不能测量或证据身份不符时发布 BLOCKED；实测失败记 FAIL。不能修改预算、期限、样本或语义范围使其变绿。复用同一报告不能认证不同构建、SDK 或配置。

## Relations

此提案补充 [ADR 0007](0007-semantic-readiness-and-500ms-slo.md) 的验收定义，保留 [原产品内存协议](../benchmarks/product-gate.md) 和 ADR 0001–0006 的未完成门禁。原报告留作历史；新证据写入 reports/raw 摘要，[Ledger](../plans/references-feature-ledger.md) 和 [MoSCoW](../plans/references-moscow.md) 链接当前结论，避免重复追加调查日志。

实施顺序见[执行计划](../plans/2026-09-29-semantic-ready-execution-plan.md)；需求范围见[产品契约](../plans/semantic-ready/product-contract.md)。

## S01 implementation evidence

2026-09-29已加入公开prepared-suite与失败报告，详见[S01唯一证据](../reports/2026-09-29-semantic-ready-s01-baseline.md)。
candidate-ready并不认证semantic-ready；50条已有cache hits与未缓存/编辑慢请求分桶，
缺桶/样本/就绪保持BLOCKED。harness实现不使本ADR的发布技术提案自动Accepted，
也不关闭原内存/新500ms门禁。
