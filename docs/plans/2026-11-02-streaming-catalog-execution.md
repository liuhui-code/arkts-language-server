# 有界 catalog 流式执行清单

日期：2026-11-02。状态：**最终主仓native259PASS/1FAIL/1原ignored，原失败保留，唯一child诊断通过；允许draft待fresh完整CI，不是整合全绿**。
决策与完整合同见[ADR0042](../adr/0042-bounded-catalog-streaming.md)。
只在既有[Feature Ledger](references-feature-ledger.md)更新R-01/R-02/R-20，不另建ledger。
独立基线5e9ecf0；累计patch静态应用到主仓e69c7eb，124native/Cargo输入一致。
逐项证据和未测范围见[实现/TDD报告](../reports/2026-11-02-streaming-catalog-implementation.md)。

## 里程碑（勾选不代表产品毕业）

- [x] **M0 基线/characterization**：生产二进制与源码身份冻结；公开API生命周期RED→GREEN、
  完整查询/9表/源码oracle及既有取消/发布/reuse回归已有收据。
- [x] **M1 force机制实现**：轻量URI manifest、4persistent单项槽、单writer；慢writer/慢首URI、
  4高膨胀文档/近2MiB源/超大分块已测。保留64文档/32768行/8MiB及4096元素/4MiB边界。
  不是总heap/RSS硬cap：writer/lookahead之外至多4完整单项展开，紧凑metadata O(N)。
  单对30K峰显降但READY慢34.31s；吞吐归因/重复配对验收仍未完成。
- [ ] **M2 全部失败与发布验收**：已测满结果槽取消join、panic、源同length/mtime换字节、
  固定parent竞争、旧reader和既有发布/恢复回归。SQL/磁盘/平台故障全部退出条件、
  Windows/真实项目/UI未逐项完成，不笼统勾选；全部SQL校验与finalfence未删。
- [ ] **M3 冷热完整验收**：功能已实现并验证：新complete-scan域、cold单parse流写、hot0parser/
  0worker/同physical无bulk写、miss二读witness与最终SHA；扫描I/O错误和正常skip有正反用例。
  独立fullRust重跑259PASS/1原ignored，后加hotcancel+denseoracle focused4PASS，release烟测通过。
  512资格10runs通过但miss单次1.958→7.778s更慢；30K cold/hot四runs计数/query/hash/exit0通过，
  cold289.835→247.097s、hot14.949→1.750s仅单对，主要cold差额在校验；miss/force30K未跑。
  固定512 AB/BA12进程通过但miss方向混合（46.655/6.945与5.983/2.859s），不称修复/一致回归。
  最终主仓100K warm-removal成本失败，不能用这些通过覆盖；全部性能验收未完成。
- [ ] **M4 决策与交付**：本轮明确defer文件级缓存/事实复制/变更集增量/分片，保留hash-first完整代。
  先定位100K和512miss成本；范围决定不等于M4交付，无schema迁移。
  完整Node整合check:fast、目标HEAD完整CI、Windows/真实UI仍待；不得称方案全部完成。

## 必须保留的观察与失败

- 首次全量cache_gc既有用例protected≠observing，原因未知；单独和全量重跑通过不等于修复。
- M1一对30K全进程采样最大RSS3,015,224→104,096KiB（约102MiB），READY293.040→327.349s；
  不是102MiB硬界或整体提速，不将M3功能实现当成该34.31s回归的修复。
- 生产输入冻结，RED/夹具错误/环境错误/失败/重跑分别记录，不相加重复计数。
- 主仓Node20 check/build及14完整文件38/38 PASS、fmt/clippy PASS；最终native259PASS/1FAIL/1原ignored。
  100K cold32679.111ms、warm removal113042.933ms违反removal≤cold，原始失败保留，未重跑/调阈值。
  1447源与84runtime pins末次全一致；只读确认旧replace_all路径未改；唯一一次child诊断cold48485.075ms/warm removal7660.407ms通过。
  原失败不覆盖、不解释；诊断收口不再重跑，允许draft发布待fresh完整CI，不称ready-to-merge。
  完整local check:fast和目标HEAD CI未跑，不沿用旧绿CI。
- 不新增默认RSS预算/自动retry，不删除quick_check/FK/FTS，不改会话根。
