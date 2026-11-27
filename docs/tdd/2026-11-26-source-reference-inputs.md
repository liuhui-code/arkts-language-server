# S3 源绑定引用输入资格 TDD

父提交cc92b503，承接未提交final03（冻结身份见主工作区`.bench/reference-owner-fix-20261126`）。
新worktree `/private/tmp/arkts-reference-inputs-20261126`，分支`fix/reference-input-qualification-20261126`。
ADR0051 Proposed，用户已授权实施；旧候选/原始失败保留，不合并部署。

## 生产者对照

实际ohos-typescript4.9.5-r10，固定编译器SHA见0051。
`source-profile-probe.mjs/json`：完整项目与单源Host对照显示函数别名调用和tag调用额外外部定义/引用。
所以不批准任意使用位置的单源profile，首片只允许真实compiler证明的声明名查询。
固定source-only Host只用于此语义域，其他查询继续原项目路线。

## 公开 RED

```sh
node --test tests/semantic/references-source-input-qualification.test.mjs
```

`source-input-red.log`：完整公开Locations正确，但三次请求对96个无关源码产生2016次实际lstat，期望0。
私有审计fixture用AsyncLocalStorage标记真实Worker请求，排除后台diagnose及初始化；
只观察真实FS调用，不伪造缓存/Program/响应。源码和原始计数保存，不以毫秒阈值判断RED。

## 纵向实现

一次贯穿源输入、Worker/profile、当前root/config revision与发布前独立重新取证；
缓存命中采用同一明确profile，不先发全项目readiness，也不删除已经注册的全局义务。
原namespace缓存和未知/全局路线保持原前后核验。文件别名/overlay权威仍有义务，不能只验一个URI文本。

首轮`source-input-green01.log`不是GREEN：精确请求返回stale，未放宽原断言。
正在补采最少阶段证据以区分路径/版本/receipt失败；实际结果与最终检查后续追加。

## GREEN 与发现的边界缺陷（逐项保留 RED）

证据根为主工作区 `.bench/reference-input-qualification-20261126/`。

- `source-input-green03.log`：精确3/4/3个Locations，实际无关lstat为0。
  `green02-detail/server.log`定位最初stale：输入documents曾为一次性MapIterator，
  首次authority消耗后最终authority读不到目标；改为每次取得新iterator，未删除final fence。
- `source-cache-red.log`：冻结final03真实缓存命中，但仍192次无关lstat；
  新域独立当前/最终源证明后`source-cache-green-and-refactor-characterization.log` 15/15PASS，0次无关检查。
- `source-domain-regressions01.log`：26/26PASS，含资源路径重构前后、协议严格解码、
  项目域SDK AST复用、edit/undo、同size/mtime外部编辑与裸CR公开位置回归。
- `bare-cr-red.log`：有效裸CR位置得到空Locations；共享UTF-16换行索引和cache proof改用同一精确换算，
  CR、LF、CRLF都按协议换行。不是靠调整测试位置规避。
- `source-lifetime02.log`：6/6PASS，真实编译Host读取期间实际$/cancelRequest，
  一个取消终态、同版本B正确、Worker仍1个；函数别名调用/tag完整oracle各5个Locations，
  不能以source-only得到的2个局部Locations冒充完整结果。
- `source-budget-red.log`：受控主线程RSS观察超过用户显式预算，旧新域缓存错误命中1次；
  新域缓存使用既有level2Ratio准入，默认null预算不受限制，无新增固定阈值或驱逐逻辑。
  Worker自身仍由原memory policy决定owner释放及恢复。本测试不宣称实际分配2GiB或测试系统压力。

原S1项目域SDK复用用例保留全部SDK/LS/AST断言；增加显式namespace使其确实走项目域。
新的简单声明用例独立断言实际source Program恰1文件、SDK0、edit/undo使用oldProgram。
不能伪报source-only包含SDK，也不能删除原SDK复用覆盖。
新测试fixture仅在私有临时根启用，按真实编译/Worker入口校准；正常计时不加载fixture。

当前全量与规模验收尚未完成；此前完整gate的1次初始化超时仍保留为失败，不能用本节局部GREEN替代。


## 最终恢复边界与候选

`input-boundary-regressions01.log` 完整46项44PASS/2FAIL原样保留。
两失败是取消早终态/Worker drain观察顺序、fs.utimes Date毫秒截断的驱动前提错误；
未更改产品时序或相等断言。`source-lifetime03.log` 9/9PASS。
最终又以真实编译器Host一次返回undefined补测：`source-unavailable-red.log` 第二次同版本请求
仍无source-owner成功（0≠1），虽然原完整回退给出了正确Locations。
原因是空Program/缺SourceFile未抛异常，却保留了已提交project version的LS。
最小实现将此状态也dispose私有域，恢复B；不更改主监督/超时/预算，不输出空成功。
这是受控Host暂不可用验证，不宣称真实Photos有此故障。
`build05.log` 后 `final-source-focused02.log` 24/24PASS、0skip；
包括目标源关闭重开、未通知无关源码修改/新增不污染局部证明、声明策略true/false分离。
此后产品/测试冻结；旧普通/插桩结果的hash保留，最终相同输入验证单独记在final前缀目录。
最终全量检查仍需独立收取，不从final03或本24项继承通过。


## 第一轮完整门禁与统一工厂校正

`s3-check-fast.log` 首轮发现semantic-capability-matrix原唯一工厂断言2≠1。
在1369条已报告PASS后停止本轮，`first-s3-stop-reason.json`和原完整输入/archive保留；
这是FAIL后未完成的门禁，不能报告1369/1370全量或与下一轮相加。
SourceReferenceOwner改用现有registry-pool私有源profile入口→recoverableLanguageService。
唯一raw LS构造点断言不变；复用owned Registry、有限同步、分阶段观测、清理/共享quarantine。
取消Host回调遵循原job Host token；同步外仍检查原始signal，不清取消位。
`official-owner-focused01.log`46/46PASS、0skip。
新增源域取消+释放故障组合：control01误只给SDK Registry装hook；control02/03明确捕获旧夹具
硬编码binder参数options，而实际bundle为options2的加载失败。不是实际源域故障已复现。
`unresponsive-semantic-worker.cjs`保持唯一固定函数和双标识符参数匹配，允许bundler重命名；
control04真正进入源域，实际释放1→0后抛异常、明确SourceReferenceOwner.dispose调用栈，
取消只有一个终态，恰一次Worker恢复，峰值1，新未保存版本精确4个Locations。
原始控制记录复制到`source-ownership-controls/`；后续全量记录report.observations.sourceReleaseFault。
扩大聚焦回归与官方工厂最终普通/插桩/Photos复验、全量门禁在official-owner-round2独立执行。
旧快速数字属于旧构建，最终身份/时延以新轮为准，不能继承为同一产物。

官方工厂round2完整check:fast最终2830PASS/4FAIL/0skip（2834），1375输入未变。
4条来自另一旧hook硬编码projectSourceRole的options参数，实际bundle为options2，尚未进入目标阶段。
未在运行中改输入；完整结束后修正同函数/三参数唯一定位，保留原全部断言与等待值。
原initial-scope-retry.test.mjs五项5/5PASS、0skip，角色复用、SDK替换和单事实更新计数均正确。
一次错误相对证据路径导致修正未应用的失败尝试单独保留，不冒充GREEN。
唯一后续输入变化为此fixture，所有上轮结束产物及计时server/Worker/native hash相同。
正式计时可依身份复用；final-gate-round3完整检查独立执行，旧FAIL保持原样。

最终独立 `pnpm check:fast` 2834/2834 PASS，0失败/跳过/取消，退出0；
UTC 2026-11-26 18:28:15.664—19:44:17.525，1375冻结输入未变。
`final-gate-round3/final-verification.json`核验server/Worker/native与正式计时一致，
编译器固定，Photos原文件未变。原30003成员完整用例40.293秒PASS；历史初始化超时未改标签。
本片GREEN不替代UI/Windows/耐久，不关闭初始化及全局查询性能事项；无合并部署。
