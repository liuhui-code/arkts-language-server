# 有界 catalog 流式执行清单

日期：2026-11-02。状态：**已授权计划；实现与验证待完成**。
决策与完整合同见[ADR0042](../adr/0042-bounded-catalog-streaming.md)。
只在既有[Feature Ledger](references-feature-ledger.md)更新R-01/R-02/R-20；本清单不是新ledger。
整合输入为PR112 `5e9ecf0` 与main `c5577bb`。首片TDD在独立工作区准备，尚未集成。

## 里程碑

- [ ] **M0 基线/characterization**：固定生产输入、公开查询/表计数/源码oracle；
  记录旧实现payload累计RED和取消/发布/reuse既有行为。每片写明父revision和实际命令。
- [ ] **M1 force流水线**：轻量URI排序manifest、最多4解析worker、单writer；
  byte/row所有权含inflight、待交付、reorder及writer。证明慢writer/慢首项不无限积累，
  超大完整解析例外可排空；保留64文档/32768行/8MiB及4096元素/4MiB写入边界。
- [ ] **M2 失败与发布**：满队列取消、worker panic、SQL/磁盘失败、同mtime/length换字节、
  并发起点变化、旧reader、强杀/重启均不得暴露半库；保留完整SQL校验和source/final fences。
- [ ] **M3 冷热兼容**：静态输入纯度复核与公开失效测试后，优先manifest/hash-first，
  完整键热命中免解析且不全量写库；miss重读只解析一次，未证纯度则显式保守回退。
  新完整扫描资格域仍待实现；正常ignore/扩展/symlink/政策skip与真正扫描错误有正反用例，
  旧无资格指纹不得直接免解析复用。分别记录cold/force/miss/hit实际读取、解析、写量。
- [ ] **M4 决策与交付**：按miss成本证据决定是否另片引入内容寻址每file缓存/变更集；
  不自动迁移schema或上不可变shard。最终同输入focused Rust/release/fmt/strictClippy、
  pnpm check:fast和目标HEAD完整CI终态明确，逐项报告未测平台/产品门禁。

## 验收记录规则

每一完成项链接TDD/报告：原始RED、最小GREEN、后续回归、输入hash、最终提交及失败收据。
机制证据、性能观察和产品验收分开；RSS峰未降就不能宣称降峰，热命中不能退化成全量写库。
不新增默认RSS硬预算/自动retry，不删除quick_check/FK/FTS，不改会话存储根。
本次文档追加与此前整合候选Node20 check/build、11文件79/79及2181输入hash一致收据分开；
那些收据不覆盖尚未实现的流式方案。云Linux合成不等于Windows/真实UI验收。
