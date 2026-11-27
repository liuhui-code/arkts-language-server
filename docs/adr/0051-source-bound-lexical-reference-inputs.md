# ADR0051：源文件绑定的局部声明引用输入资格

- 日期：2026-11-26。
- 状态：Proposed；用户授权的本片实施与完整门禁已验证（2834/2834，零跳过）；不是独立审阅通过，尚未 Accepted。
- 前序：ADR0050/S0–S2，冻结final03；整体性能事项仍OPEN。
- 事项：NAV-HOT-DIGEST-001、NAV-REPEAT-001。

## 为什么需要下一片

0050保住了LS/Program，却保留了所有全根输入消费者。30K普通协议编辑引用中位仍2728.82ms；
真实Photos组件2994.49ms，其中compiler回调190.91ms，其余准备/核验及未归因区间不能全算作扫描。
继续只在后段复用AST不会完成输入资格迁移。原完整check:fast2816PASS/1FAIL保持失败；
30003初始化progress60s超时在独立原例/原文件中未复现，原因未闭环，不能顺带宣称解决。

## 生产者边界与反例

实际安装ohos-typescript4.9.5-r10，compiler SHA
`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`。
其typescript.js的getSymbolScope/getReferencesInContainerOrFiles按语言绑定限制搜索容器。
但getDefinitionAtPosition还有上下文语义：实际最小对照中，函数别名调用和tag调用在完整项目
会产生额外外部定义；单文件无解析Program会错误地只看见局部变量。
证据：`.bench/reference-input-qualification-20261126/source-profile-probe.{mjs,json}`。
因此“不解析SDK/依赖”不是所有lexical-block查询自动享有的权限。

首个独立profile只准入**声明名本身**的严格函数体单一直接let/const变量。
沿用实际compiler的单声明、精确定义锚点、无shorthand链接及原文/范围证明；
另外拒绝错误恢复、ambient/namespace、decorator、struct/转换语法、JS/TSX等未知域。
调用/使用位置、属性、导出、别名、解构及不支持形态保留原0050/全局路径。
纯文本提示只筛成本，不能证明资格；不能把本profile扩大成所有引用优化完成。

## 决策

### 固定且独立的编译输入profile

在既有semantic Worker/backend生命周期内增加一个源绑定查询owner，使用实际固定编译器的LS。
profile固定原始TS/ETS解析模式、target及module选项，noResolve/noLib，Host只提供当前源文件，
不允许读取SDK、项目源或目录。它执行的是上述局部声明的绑定引用，而非缩小完整项目Program冒充全局。
首个版本仅在实际compiler证明成立后发布。SDK/项目配置不是这个固定profile的编译输入，
而非把曾经加载的SDK/config事实清空后宣称仍然有效。改变profile语义必须改变版本。
需用完整项目oracle/不同配置及反例验证语言独立性；若无法成立，拒绝该profile，不放松旧合同。

所有源语义服务也必须通过现有 `registry-pool.createOfficialSourceReferenceService`，继而进入
统一 `recoverableLanguageService`。这个入口选择私有Registry、不附SDK/export provider，但不另造LS构造器、
租约journal、同步/语义阶段观测或quarantine状态机。唯一原始createLanguageService点的架构断言保留。
Host取消只使用原当前job Host token，尊重有限同步提交；同步外的查询/发布再检查原始取消cell/signal。
原始取消标记不清除，监督端截止时间保持有效。

复用一个成功owner/LS，连续源版本正常更新Program。单Worker只保留当前源工作集；
切换文件允许普通语法重建，不累计历史roots，不另建缓存/进程监督管理器。
Host回调绑定当前同步turn；终态后撤销job上下文。异常/取消或构建未得到当前SourceFile时清掉本owner及私有Registry域，以保证同版本重试；
后者必须覆盖Host暂不可用但编译器返回空Program且已提交版本的情形，不能永久只走慢回退；
正常关闭dispose，先由原owned Registry结清租约；结清不确定必须进入共享quarantine/Worker退役，
不能通过丢弃私有对象或新建LS绕过。Worker死亡由原监督器/预算处理；不引入默认RSS预算或新重启线路。

### 独立输入证明与完整消费者迁移

固定profile资格不同于全局READY和旧namespace资格，不伪造任何全局状态。
输入须绑定真实query/声明范围、原始文本hash、server-owned overlay/disk版本、编译器/profile身份。
首片仅接收实际存在、物理目标仍在根内的源文件；缺失新文件/物理逃逸回原路径，不在这里补签缺失证明。
原始目标路径、符号链接/父路径证明继续校验；磁盘源用原有descriptor前后guard读取，
不能在计算后拿当前stat给旧源码补签。overlay仍权威，底层路径更换及读窗口竞态不能掩盖。

请求进入时捕获当前源输入及既有root/config revision，返回后独立重新取证并比较，失效/取消为旧请求终态。
仅该profile完整成功后，允许不产生全根namespace；不得先注册全根义务再把它从final union删除。
不支持时进入原全根before/after准入，原图、SDK/config、负查找、namespace及final仍全部执行。

消费者必须一起迁移：

| 消费者 | 新profile | 旧/未知profile |
|---|---|---|
| request entry | 先独立源准入/实际证明 | 原完整readiness准入 |
| cache hit/store | 显式版本profile+原源证据，独立当前/最终检查 | 原namespace/global资格 |
| Worker/owner | 不调用prepareCompleteProjectWorkspace或伪造membership.complete | 原group/全根准备 |
| coverage | compiler原文声明绑定与有限容器，全部Locations在界内 | 原完整范围/索引排除证明 |
| publication | 原源身份/版本、取消、世代/root revision最终核验 | 原独立全输入union |

沿用既有bounded ReferenceResultCache；proof元数据计入原字节额度；root级事件失效保留。
显式RSS预算仍沿用原level2Ratio准入与Worker压力策略；默认null无固定阈值。缓存命中也不得绕过显式预算，
不增加独立驱逐状态机、产品阈值或Worker恢复预算。
旧namespace凭据不能自动转换为新profile；缓存DTO不持有AST/LS/SQLite reader。
跨文件无通知新增全局引用反例仍走旧完整路线，不能因Program旧读集较小就省略全范围检查。

## 与历史ADR的关系

- 0004：完整结果、root失效、缓存额度保留。
- 0018/0019/0050：项目语义组及长期LS保留；本profile为不同、明确有界的语义任务，不是第二套项目状态机。
- 0047/0048：仅对新profile显式修订“必须全namespace”的首片边界；全局/旧receipt历史约束不改。
- 0037/0044/0045：原始加载证据和独立最终检查保留；不以新鲜stat修补旧输入，不靠watcher/TTL授权。
- 0023/0031/0049：同步turn、mutation屏障、取消/drain、ticket/世代及共享恢复预算不变。
- 0029：默认无固定RSS预算不变。455冷目录3秒门槛沿用用户豁免，其他检查不跳过。

## 备选与取舍

继续全根fence：安全但每次仍随N增长。只检查旧Program读集：全局引用有漏结果反例，不采用。
任意单文件/noResolve查询：实际函数别名/tag反例已推翻，不采用。
另写名字扫描器：无法代替真实语言绑定，不采用。watch/epoch替代磁盘：不符合合同，不采用。
现有项目LS中记录精确读集仍可改善更一般查询，但其图/排除/配置依赖要独立迁移，不能冒充本profile已覆盖。
代价：声明以外仍可能慢；当前源大文件仍有解析/绑定成本；首次owner可创建LS，成功后复用。

## 执行与验收

先公开child LSP RED：相同目标/有效闭包，增多无关文件后，严格声明查询不应扫描无关源码；
精确edit/undo、首次/热/磁盘/关闭重开均正确。记录实际lstat/read、Program成员/构建及profile，不只计耗时。
随后最小完整迁移，再验证：函数/tag别名完整回退、shorthand/解构/属性/namespace/decorator拒绝，
全局无通知新增引用、原始路径替换/同字节retarget、磁盘同size/mtime、未保存内容、SDK/config事件，
A取消后B复用、迟到结果、异常同版本重试及dispose；前台混合请求/背压不被绕过。
冻结产物后2048/30K、真实Photos分别串行计时，普通与插桩分开；不承诺未测500ms。
最终完整check:fast及原失败补证须记录，UI/Windows/耐久不由协议成功替代。
本轮不提交/合并/发布/部署；Proposed不代表独立评审接受。

## 来源

Context7 resolve尝试失败（transport HTTP），未假装取得文档。
[TypeScript LS API](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API)：按需、Host快照和长期服务。
[TypeScript v5.9.3 references源码](https://github.com/microsoft/TypeScript/blob/v5.9.3/src/services/findAllReferences.ts)：范围选择的主流参考；
实际行为以本地固定4.9.5-r10源码及对照为准，不把版本不同的实现视为相同API。


## 实施校正历史

首轮完整门禁发现直接createLanguageService使唯一构造点断言2≠1。该候选失败，1369条已报告PASS
不是完整计数；为修复停止该轮，保留源码归档/原日志/停止原因。不修改断言放行第二构造点。
现实现复用上述统一工厂；46项聚焦回归通过，原资源释放/有限同步/取消/隔离恢复合同一起验证。
补测新源域本身的取消+释放后异常：实际租约1→0、调用栈属于SourceReferenceOwner.dispose，
恰一次共享恢复、Worker峰值1，未保存新版精确4个Locations。受控注入不冒充真实Photos现场故障。
组合夹具先因只观测SDK Registry未命中私有域，以及bundler将options改名options2而失败；原证据保留。
修正注入归属与唯一函数/双参数定位，不弱化缺失hook失败条件，不修改产品等待/超时。
最终候选重新独立完整门禁；Proposed状态和独立审阅要求不变。

## 最终验证（2026-11-27）

`final-gate-round3/s3-check-controller.json`：独立 `pnpm check:fast` 2834 PASS，
0 FAIL、0 skipped、0 cancelled；UTC 2026-11-26 18:28:15.664 至 19:44:17.525。
冻结1375个代码/测试/配置输入未变，运行产物与正式普通计时相同，Photos源文件前后哈希相同。
原30003源码完整成员引用/重命名用例本轮40.293秒通过；不据此消除历史60秒初始化长尾失败。
普通30K单会话局部声明查询：编辑/撤销后三次中位11.384ms、最大13.022ms；
四次热查询中位5.126ms、最大5.931ms。实际Photos只读语义组件编辑11.022ms，
初始化81.376秒；组件不是公开LSP或UI。初始化、其他查询域及Windows/UI/耐久仍待验证/优化。
本片完成不代表整体性能事项关闭；没有提交、合并、部署或改变默认内存预算。
