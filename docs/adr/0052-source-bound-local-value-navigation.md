# ADR0052：局部值跳转使用明确的源文件输入域

- 日期：2026-11-27。
- 状态：Proposed，用户授权实施；独立审阅未完成，不记为 Accepted。
- 关联：NAV-REPEAT-001、NAV-HOT-DIGEST-001；承接 ADR0051。

## 问题与实际证据

ADR0051只迁移声明名查引用，普通definition仍走全项目准备和独立最终核验。
同一局部变量、零import边的隔离夹具，2048/30000源码普通协议热态中位
138.439/1347.617ms，30K编辑后三次中位671.466ms；这是本轮固定前候选的数据。
公开stdio RED的4次跳转确切返回声明位置，同时产生768次无关源码lstat。
独立CPU剖析显示热请求的两轮成员观察为主要热点；剖析显著扰动时延，
inspector dispatch时间不能归为产品排队，CPU包含区间不能相加。

## 决策与最小边界

复用ADR0051同一个有界源owner、实际固定编译器、官方owned/recoverable LS工厂。
在普通definition进入全项目准备前尝试源文件绑定资格；不新增Worker、恢复状态机或结果缓存。
Host固定noLib/noResolve，只提供当前原文。成功的实际词法证明要求：

1. 原文无解析恢复和未知转换语法；沿用0051对ambient、namespace、eval、struct等的拒绝。
2. 查询为identifier，实际checker符号唯一绑定到当前函数体直接let/const声明；
   单一准确声明、无shorthand链接，定义结果严格指向该声明。
3. 只允许已审计的值语法位置：声明名、二元表达式、return、独立值表达式、
   属性/元素访问接收者和索引、调用参数、前后缀一元、void/typeof/await、
   括号/非空/类型断言中的值、箭头表达式体、条件/数组/spread/template值。
4. 调用callee、new、tag、属性名、类型位置、解构及未知位置全部回原完整路线。
   实际fork在函数别名call/tag会追加外部签名，不能仅看单源返回一个定义就授权。

透明包装后的调用也拒绝，不依赖当前编译器是否恰好在括号处停止查签名。
允许标识符末尾光标：保留原光标的真实definition结果，再以实际候选identifier起点证明绑定，
要求定义仍精确指向同一个声明；不能将光标移位后得到的其他查询结果直接冒用。
文本匹配只筛成本，并覆盖名称内部/末尾；实际编译器资格不能由regex授予。

源域入口与返回后各独立进行原目标descriptor读取/hash、路径/物理祖先和overlay权威检查。
底层同字节inode替换仍使旧请求失败；不能用新stat补签旧输入。
Worker使用既有SemanticResultInvalidatedError表达旧结果。公开definition沿既有
registerNavigationCapabilities/SemanticRequestRunner合同返回空目标且记录outcome=stale；
这不同于references的ContentModified错误，不改变二者的历史公开终态。
源overlay映射在捕获与复核之间换物理目标，是同一种输入连续性失败。
共享snapshot使用窄类型SourceOverlayInputChangedError：继承既有SemanticResultInvalidatedError，
同时提供父线程已有的content-modified判别码。保留具体消息，未知异常仍原样失败；
不把该竞态归为内部编译器故障，不重建健康Worker。两条公开路径都必须验证下一请求恢复。
Worker提供自己当前open文档迭代器；每次调用重新取得，不能保留已消耗迭代器或旧请求上下文。
共享源reader的opaque比较key不作为新的引用缓存资格发布；definition没有借用引用结果缓存。
串行mutation屏障、原取消cell、有限同步、终态/世代隔离以及父线程公开响应检查继续生效。
配置/SDK不是该固定源profile的编译输入；其他查询的配置/全命名空间合同没有变化。
无资格时返回原完整路径，不把空结果、partial或未知资格包装为成功。
因此复杂度承诺只针对已证明的查询域：与目标文件体量/AST、路径深度及活动overlay权威检查有关，
不随无关关闭项目源码增加。不是所有查询恒定时间，也不声称对所有语法/声明类型已有资格。

## 生命周期与兼容

references和definition共用一个当前源LS，逐源版本更新，切换文件不累计历史Program。
只抽出共同的源准备/取消/异常释放过程；引用原有声明名准入和proof格式保持不变。
无预算默认不驱逐；显式预算和既有level2/3释放规则不绕过。
构建无当前SourceFile、异常或取消继续退役私有源域，同版本可重试；资源结清失败继续共享quarantine。
不修改deadline、V8、成员上限或默认内存策略，不提前宣告项目READY。

## 历史ADR关系与替代方案

- 0037/0044/0048：保留独立最终观察和原始加载身份；仅对新的正向源profile限定所需输入。
- 0047/0051：引用结果缓存及命名空间profile不扩大；本片definition不新增结果缓存资格。
- 0018/0019/0023/0031/0049：长期owner、同步turn、取消、mutation与Worker恢复合同不变。
- 0029：默认RSS预算仍未配置；本片不增加隐含阈值。
- 全根watch/TTL有效标志：无法发现无通知改动，不采用。
- 为所有definition缩成单源：别名call/tag外部签名是实证反例，不采用。
- 只优化逐叶子字符串/Map：仍有全成员系统调用，不能解决本例随无关规模增长，另列全局路径工作。

## 验收

先公开LSP RED，再GREEN；普通目标位置和编辑/撤销/重复结果精确且无无关源码观察。
同输入同会话完整项目oracle对照，支持域必须完全相等；call/tag必须仍返回外部签名。
覆盖缺失源重试、真实共享取消、迟到结果、物理目标替换、磁盘未通知修改、overlay/关闭重开。
复验0051引用及原全局/路径/final输入合同，记录最终候选身份、普通2048/30K计时和独立插桩计数。
500ms是体验目标，不据单次超标失败，也不承诺所有全局路径已优化。
初始化、全局引用/重命名、真实Zed/Windows/耐久仍分别记录，不由本片协议成功替代。

## 来源和适用范围

Context7 resolve本轮HTTP transport失败，未声称取得其文档。
[官方Language Service设计](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API)
说明按需处理及长期Host；[v5.9.3 goToDefinition](https://github.com/microsoft/TypeScript/blob/v5.9.3/src/services/goToDefinition.ts)
是机制参考，不视为本项目fork相同API/实现。
实际生产者是ohos-typescript4.9.5-r10，SHA256
`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`；
本地typescript.js第142067—142175、142324—142349、142420—142428行显示
getSymbol、额外调用签名、shorthand、对象字面量等分支。固定fork源码与公开oracle是资格依据。
原始证据在主工作区 `.bench/query-proof-cost-20261127/`，不是真实UI结果。

## 实施验证历史

- 首个公开RED：四次精确返回声明，但无关叶子观察768次；GREEN为0。
- 末尾光标RED：仍384次无关观察；修正实际光标结果与候选token证明后为0。
- 值位置oracle RED：void位置仍走完整路线；补明确值域及包装调用拒绝，32种同输入对照通过。
- 160/160扩展回归零跳过；其后按源码尺寸合同原样抽出既有格式化适配，
  原公开格式化行为先GREEN、迁移后GREEN，最终候选相关30/30与类型检查通过。
  不把前序0051的2834完整门禁当作本片全量门禁；本片未请求合并，check:fast须在请求合并前执行。
- 最终普通规模/Photos控制以报告和冻结final06身份为准；原目标漂移的Photos失败保留。

最终收尾补证发现上述overlay竞态在父线程/Worker均误报-32603。
真实隔离目录链接在源authority的两次观察之间换目标，公开RED两项确认；
共享typed连续性错误修正后，最新final07类型检查及59/59相关回归通过，0跳过。
第一次references控制继承夹具residentFastPath=0，未进入目标分支，记录为驱动失败；
移除该覆盖后两条实际分支均RED→GREEN，不把未触发hook当产品复现。
一个写错测试入口的命令也保留，未执行测试；之后真实入口59项PASS。
最终性能认证改用冻结final07，final06仍保留为先前对照，不跨构建混合统计。

目录链接夹具使用Node20.19.5的fs.symlinkSync，Windows使用绝对目标的junction，Mac使用目录symlink；
[官方版本文档](https://nodejs.org/download/release/v20.19.5/docs/api/fs.html#fssymlinksynctarget-path-type)。
Context7 Node resolve也因HTTP transport失败；目前实际执行为Mac，Windows分支未实测。

最终认证：final07三轮30K，首次中位24.090ms、编辑7.820ms、热5.640ms；
最新2048为23.185/7.648/5.865ms。真实Photos只读组件首次20.068ms、编辑12.007ms，
初始化88.403秒且仍partial；旧固定对照外部210秒保护FAIL保留，不是一次完整通过对照。
最终1384输入和运行产物hash已核验；测试清单尺寸修正后层/顺序保持相等、4/4GREEN，产物未改变。
细节与边界以[最终报告](../reports/2026-11-27-local-navigation-input-qualification.md)为准。
Proposed状态不变；尚未运行本片完整check:fast，不合并部署。
