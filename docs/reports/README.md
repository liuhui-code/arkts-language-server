# Generated reports

This directory owns machine-readable spike and benchmark reports referenced by
the official semantic-backend execution plan. Reports must record their exact
backend revision, SDK digest, command, and environment identity. Do not commit
upstream checkouts, caches, or unbounded raw logs here.

## Query performance comparisons

- [checkpoint-23递增文件规模复核（2026-10-20）](2026-10-20-checkpoint-23-scaling-review.md) — 复用42场/7档/273组完整对照，核验149份封存输入；补齐13个状态的中位数和最大值、Program与未import源口径、结果缓存命中。23多档提速，rename/首次引用仍随实际Program明显增长，尚无增长成本下降证据；未新增性能运行。
- [Mac Photos checkpoint-23（2026-10-20）](2026-10-20-stable-program-checkpoint-23.md) — SDK Host实际snapshot复用；54场正常546组完整结果一致，超标14→9，原Photos312次全达标；18场独立trace确认SDK复读305/255→0且终检保持。Photos+512和2048仍FAIL500，72场/7797成员归档校验完成，全fast待验。
- [Mac Photos checkpoint-22（2026-10-20）](2026-10-20-stable-program-checkpoint-22.md) — 54场正常/18场独立trace，546组完整结果一致；原Photos312次全≤500ms，但扩大规模后13/546次超标。实际Program范围、SDK Host复读与解析分开计数，剩余弱snapshot/依赖发现成本及完整原始证据保留，全fast待验。
- [Mac Photos checkpoint-21（2026-10-20，不可采用）](2026-10-20-stable-program-checkpoint-21.md) — 正常三对新版312次全≤500ms、完整结果一致；后续公开恢复回归确认不可采用，全fast在856个通过标题后中断。原数据和失败保留，22修复后重新验证。
- [Mac Photos checkpoint-16（2026-10-20）](2026-10-20-stable-program-checkpoint-16.md) — 引用发布围栏修复，86/86相关回归、15/15工作区公开检查；三对七文件工作流105次全部≤500ms，对照18次超时。固定首次改名引用517–545ms仍FAIL；144组完整结果一致。16场原始数据及1163成员归档、严格身份核验成本和关闭文件重建4→0证据保留，全fast1918/1921、3项失败。
- [Mac Photos checkpoint-15（2026-10-20，不可采用）](2026-10-20-stable-program-checkpoint-15.md) — 初始化事实使主目标三轮39次全≤500ms，首次引用中位数534→457ms；七文件仍6/35慢。后续冻结控制确认预载外文件可能返回陈旧引用，撤销可采用资格；190项原始归档、完整签名比较、delta缺失路径及失败控制保留。
- [Mac Photos 稳定Program优化 checkpoint-14（2026-10-20）](2026-10-20-stable-program-checkpoint-14.md) — 冻结旧/新各三轮，78/78预设功能断言通过；首次引用中位数7407→537ms，新版三次528–556ms均未达500ms。独立trace确认首次引用仍有305次SDK proof文本读取；108项原始归档、完整输入哈希、有效RSS与失败回归保留。
- [Mac Photos 稳定Program优化 checkpoint-9（2026-10-20）](2026-10-20-stable-program-checkpoint-9.md) — 冻结旧/新各三次串行进程，78/78精确；改名首次引用中位数7676→439ms，仍有一次524ms，500ms未验收。保留正常逐次响应、单独trace、有效进程树RSS、原始归档及复现脚本；规模/随机文件/压力资格待补。
- [Mac Photos 规模敏感性诊断（2026-10-19）](2026-10-19-mac-photos-scaling.md) — 50 个规模/环境夹具，238 个有效会话、2722 次操作；基线 874/1727 次 >500ms。固定依赖、有效根、字节/AST、扇出/深度和引用数量对照，另列仓库外 Photos 与 READY；保留调用链、逐次数据、计数补采及复现脚本，未改产品代码。
- [Mac Photos 真机测试（2026-10-19）](2026-10-19-mac-photos-validation.md) — 3 轮 477 次功能检查通过，224 次 >500ms；逐次输入/状态、原始协议、独立内部阶段追踪及接受编辑链路均保留。
- [Windows Photos 真机测试（2026-10-19）](2026-10-19-windows-photos-validation.md) — 3 轮 477 次操作，293 次 >500ms；盘符身份误判与 SDK 缺失声明已复现。断连后的原始数据取回和额外接受编辑链路待完成。
- [OP04 warm-overlay reference comparison (2026-10-13)](2026-10-13-op04-warm-overlay-reference-comparison.md)
  — same-build trace-off Settings/API24 OFF/ON and reverse controls:24 exact
  requests,16 full diagnostics. Edited references5.56–5.97s→2.12–2.25s;
  observed peak RSS decreases but idle RSS rises. The explicit experiment stays
  default-off. Subsequent400 edits/416 exact requests/408 diagnostics do not
  sustain that gain; the original RSS clock-order failure is retained. A separate
  bounded trace witnesses L2/L3 loss of warm eligibility; future monotonic RSS
  capture passes public regressions. Adoption, resource/recovery calibration,
  fresh whole and L08 remain open.
- [OP02 request-local input hash reuse comparison (2026-10-12)](2026-10-12-op02-input-hash-reuse-comparison.md)
  — frozen source `3d6cc93f…`; six diagnostic owner/twelve normal LSP sessions,
  90 exact requests. Native hash calls1031→255, fresh disk guards unchanged;
  timing improves in five of six new-target pairs but RSS has no consistent gain.
  Raw DEGRADED/FAIL and original measurement identity are preserved. Pure-hash
  slice adoption closed on2026-10-15 with current direct SDK/nested-overlay guards
  and84 related passes; module/directory combination and new tool-head whole remain open.
- [OP01 resident-first routing comparison (2026-10-12)](2026-10-12-op01-resident-first-comparison.md)
  — current source `7816d51d…`; 12 timing/four independent trace sessions, 80 exact
  requests. Five of six new-target pairs improve, one reverses; edited queries
  remain seconds and RSS has no consistent gain. Raw readiness remains DEGRADED/FAIL;
  routing-slice adoption closed on2026-10-15 after unchanged protection files and
  frozen production1757/1757 were audited. New tool-head whole and final L08 remain separate.

## Archived research

- [ArkTS query-performance deep research (2026-10-11)](2026-10-11-arkts-query-performance-deep-research.md)
  — user-provided `deep-research-report.md`; content preserved, with only a final
  newline added. The code findings and future work are reviewed in the
  [query-performance follow-up plan](../plans/2026-10-11-query-performance-follow-up-plan.md).
  Illustrative figures remain examples; the archive does not supersede existing
  ADRs or the agreed L08 550 ms acceptance threshold.
