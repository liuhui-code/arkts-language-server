# 语义工作集审视执行清单

日期：2026-11-03。基线：`298d65f5d7f796c347fe8be5c739e428066489d8`。
设计：[ADR0043](../adr/0043-semantic-working-set-evidence.md)，**Proposed**。
本清单只记录本轮局部推进，沿用 L08/OP 归属及唯一 [Feature Ledger](references-feature-ledger.md)，不替代历史执行计划。

## 已完成与未完成

- DONE（静态）：核对 AGENTS、domain、architecture、ADR0019/0029/0038/0042、初始化/驻留与 SDK export 所有权。
- DONE（M1局部）：真实取消交付窗口RED→最小回滚GREEN，三新增例通过、九完整文件101/101；Node20check/build/diffcheck通过，2216/2216输入一致。
- NOT_RUN：M2被动工作集观测、M3策略实验/真实内存性能、完整check:fast与目标HEAD CI。本地缺WASM，不能称完整验证checkout。
- BLOCKED（现场归因）：用户运行版本、进程树/PID、实际 SDK/target、复现序列和内存曲线尚未取得。
- 提交前验证快照：代码默认未改、当时尚未发布；后续发布与完整CI以新PR收据为准。未合并或部署，ADR仍Proposed，R项毕业状态不变。

## M0：既有状态审计与口径

- [ ] 确认集成父 SHA、工作树变更、产物/编译器/SDK digest、Node/OS、product/target 与有效配置。
- [ ] 记录 LSP、native sidecar 和所有相关子进程的 PID/启动/退出；同 PID Worker RSS 不重复累加。
- [ ] 由原 runner 给 cold/initial-ready/idle/first/unseen/edit/switch/reopen/recovery 的同时间轴采样。
- [ ] RSS 汇总仍可能重复跨 PID 共享页，不称去重物理总量；PSS 可得时记录来源与比例分摊口径。isolate heap/external 单列，heap统计不称精确live对象大小。
  记录采样间隔与丢样，不把采样最大值称精确峰值。
- [ ] 建立固定完整查询/diagnostic/READY oracle；记录成功、degraded、失败、取消及操作完成时点。

退出：可复现输入和证据目录可审计；若只有合成夹具，明确不代表用户现场，不妨碍独立所有权 TDD。

## M1：交付前取消清理，局部验证完成

复用既有Registry所有权接口与仅测试preload，未先建设长期telemetry。
完整命令、输入hash与失败历史见[本片TDD](../tdd/2026-11-03-sdk-construction-cleanup.md)。

- [x] 完整 `index.getProgram()` 返回后、`index.current()` 前设仅测试门；轮询原Host token，不改取消cell/deadline。
- [x] 真正原checkpoint取消、串行readiness(false)清算屏障、未增context-create证明未交付窗口；基线sdkRefs2 != 正常pin1为RED。
- [x] 最小initial warmup失败回滚：安全dispose后抛原错误；清理失败保留AggregateError、原quarantine和Worker退役。
- [x] 三次取消同Worker SDK refs2→1、精确重试、无重试关闭、release-after-effect清理不确定性与恢复均GREEN。
- [x] 最终九完整文件101/101、零fail/skip/cancel/todo、exit0、169450.868539ms；Node20check/build/diffcheck通过，2216/2216pins一致。

原始完整baseline20/21首case10s未知超时保留；其一次21/21重跑不覆盖原因。
错误前置refs2是旧已注册健康index的正常保留，不算产品RED；1009ms的response-before-release门及其候选失败被废弃并保留。
最终原token门基线11ms且无恢复，候选正常取消维持同Worker；这些是机制证据，不是性能验收。
M1只退出本缺口，不把每请求健康owner清零作为目标，不升级M2/M3、完整CI或用户现场根因。

## M2：按需补最小被动所有权证据

只在 M1 或现场归因仍缺证据时开展；先选能解答当前问题的少量字段，不承诺一次建设完整监控框架。

- [ ] 复用现有 metrics/runner，只补缺少的 ownerRole、main/sdk-export Program、初始化阶段与 Registry keyed lease 事实。
- [ ] 真实 framed-stdio 多组夹具要求缺失收据先 RED；记录真实命令/父版本，不提前填写结果。
- [ ] 沿实际 factory/Program 返回/交付/释放边界 GREEN；不调用额外 getProgram/getTypeChecker。
- [ ] 观测不强持有编译对象或源码；计数/日志有界，失败不改变语义，stdout 仅协议。
- [ ] off/on 完整结果、READY proof、context 创建、SDK解析复用相同；只读 status/采样不建 Program。
- [ ] 五组加根 owner 与最后组首查复用保留；main/sdk-export 分别计量，同实体多用途不重算。

退出：可解释实际 owner/Program/lease，而非 projectFiles membership 和带副作用抽样；实现公开回归 GREEN。

## M3：固定对照与下一决策

- [ ] 单模块大闭包、多组共享依赖分别固定输入；包含所有 ambient、未打开调用方和反向依赖。
- [ ] 分别测 cold、first、unseen-group、hot、edit、group-switch、close/reopen、SDK/target切换与恢复。
- [ ] 完整 references 两种声明策略、rename、补全/SDK自动导入及当前 diagnostics 保持精确。
- [ ] 取消/失败/恢复、反复切组与会话退出记录 LS/Program/lease 收敛及整个进程树曲线。
- [ ] 性能只比较 trace/probe-off 固定对照；独立 probe-on 用于归因，heap/GC诊断不混合。
- [ ] 保存每个慢样本、失败、未执行项；只给样本能支持的结论，不以有利重跑或 hot-only 结果采用默认。
- [ ] 若证据支持延迟准备/有限热集合，独立修订 ADR0019/0029；SDK export 复用需独立审视 ADR0038。
  完整根 owner 迁移单独证明，不随延迟组准备删除；不盲定 TTL/容量/默认 MB。

退出：给出机制、完整工作流收益/代价、未解决边界及采用/拒绝/继续研究建议；不是自动采用。

## 整合与验证记录合同

每片先 characterization/RED 再最小 GREEN；记录命令、父 SHA、退出码、失败/跳过/取消数与最终输入身份。
LSP 只以真实子进程 Content-Length stdio 验证。新手写源码/测试/脚本≤500行，旧超限文件不增行并提取内聚职责。
最终候选运行相关完整文件、types/build 与 `pnpm check:fast`；若后续有 Rust 改动，补 focused cargo test 与相关 release build。
后续获得发布授权才走 draft PR 与目标 HEAD 完整 CI；旧 SHA/局部通过不能覆盖新候选。
本轮实际执行范围仅上述M1收据；完整check:fast/目标HEAD CI尚未执行，不能沿用旧2096等通过数或以101/101代替。

默认主 Worker1、maxResidentContexts null、RSS budget null不变。455豁免、历史失败、ADR0042剩余验证与L08资格不变。
500ms沿用当前体验口径，不增加新的硬线/默认内存线，不为了实验取消完整引用/rename、ambient、SDK身份、overlay或联合终检。

## 待补的最小现场材料

1. 实际运行构建/版本、OS/Node、SDK与product/target；可用时提供启动命令/有效配置。
2. 高内存对应哪个PID或进程树，数字是RSS、私有工作集还是其他口径，发生在什么操作阶段。
3. cold→首次查询→编辑→切组→关闭重开后的曲线，以及相关完整响应/diagnostics。

缺上述材料不阻塞静态设计或独立缺陷TDD，但阻塞“用户现场根因已定位/真实内存收益已证明”的结论。
