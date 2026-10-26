# 编辑增量与平台身份统一方案（待审核）

日期：2026-10-22。代码基线：`e35459131366a32c48c10d1d74adef74357cd3dc`。
最初提案阶段只做资料核验、源码审查和隔离函数探针；后续授权的路径实施与诊断另见下文。
Windows 20k性能证据见[原报告](../reports/2026-10-21-windows-zed-20k-validation.md)。

后续授权：用户已确认先修路径，再诊断实际失效，最后讨论缓存优化。
本阶段不执行下文缓存优化或新鲜度合同提案；路径实施见
[TDD记录](../tdd/path-identity-20261022.md)，所有更改保持在独立分支。
取证已进一步区分：打开文档的答案命中沿用revision合同；disk答案命中另需当前READY/input proof。
下文全输入核验成本指实际执行的compiler查询/相应证明，不能泛化为所有缓存命中都会执行。
任何合同是否需要调整，留待当前分层证据完成后再讨论；本阶段没有修改合同。
路径真机补查另发现标准库目录分隔符比较错误，亦纳入相同身份函数修复。
本阶段结果与失效范围见[报告](../reports/2026-10-22-path-fix-and-cache-invalidation.md)。

## 1. 建议与边界

采用现有文档权威上的版本化输入、稳定语义组与长期LanguageService，
以真实依赖和索引分片版本决定失效范围，保留未变组/文件的缓存。
补全、定义、引用结果、Program/AST、磁盘输入证明分别管理，不能共用一个根级失效开关。
平台侧采用统一资源身份服务，分离客户端URI、比较身份和物理身份。

两项不能掩盖的限制：

- 同一真实模块若有20k源码，长期LS仍可能同步全模块Program；共享AST不保证免除内部遍历。
  不按1024文件伪造语义项目。1024只继续作现有保守回退软目标。
- 无通知、任意外部写入也必须在每次回答前发现，与“不再检查所有相关磁盘输入”不能同时保证。
  版本化快照的回答新鲜度必须独立审核，不能用watcher必达或旧stat证明最新磁盘状态。

## 2. 成熟实现参考与适配

1. TypeScript LS按需执行，Host维护文件版本和快照；DocumentRegistry共享SourceFile。
   ScriptSnapshot的change range支持增量解析。沿用本项目固定的ohos-typescript，
   不引入第二个语义引擎，不将构建用的.tsbuildinfo当成引用答案缓存。
2. rust-analyzer把函数体与条目/名称解析等派生数据分开，并通过依赖查询传播失效。
   借鉴失效分层；不能直接把Rust的函数体不影响外部约束照搬到TS推断导出类型。
3. clangd按文件保留动态索引和后台索引，覆盖编辑文件的旧数据，后台缓存未变分片。
   借鉴分片与覆盖；本项目索引仍须服从官方编译器身份和完整性验证。
4. VS Code的URI身份层统一比较键和包含关系；文件系统能力参与大小写策略。
   本地实现还需考虑Windows目录级大小写敏感与不同挂载点，不能全平台统一小写。

## 3. 编辑到答案的具体流程

### 输入与版本

在现有DocumentStore/输入记录内维护文件内容版本、组成员版本、解析依赖版本、
公开语义形状版本，以及编译器/SDK/配置身份。维护实际正依赖、反向依赖、
未解析import及其潜在创建路径、ambient/global影响；不另建文档权威。

每次编辑先应用文本delta，推进该文件版本，更新其解析和索引分片。
文件版本变化必须被所有未来读取者看到，即使当前某组不受影响。
只有实际编译输入、根或配置受影响的组才推进Host project version；其他组保留。
符号身份不能只用名称或绝对文本偏移；跨Program的符号对象也不能直接作为永久身份。

| 编辑种类 | 重做工作 | 可保留部分 |
|---|---|---|
| 局部实现变化，已证明公开形状/绑定不变 | 编辑文件分析、位置及相关索引贡献 | 无关组、其他文件贡献、未受影响答案 |
| import/export、推断导出类型、继承/重载变化 | 真实受影响反向依赖及候选范围 | 有独立排除证据的组/分片 |
| 新建、删除、移动源码 | 成员目录delta、负解析、受影响依赖与候选 | 物理及语义均独立的其他域 |
| SDK、target、编译选项、全局声明变化 | 兼容域内重新准入/更新 | 不兼容域外的独立状态 |
| 依赖未知、事件缺口或不支持语义 | 记录原因并扩大范围 | 不把未知当成无影响 |

不能靠“改的是数字/函数体”直接认定语义形状不变；例如推断literal类型会向外传播。
第一阶段只采用现有编译器和依赖证据可证明的分类，未知保守扩大。

### 结果缓存和引用贡献

替换ReferenceResultCache的根级一刀切规则。完整答案绑定目标身份、配置兼容身份、
includeDeclaration、必查范围及各输入分片的版本证明，不再仅因无关文件编辑删除全部条目。
初期先保留证明独立的组级完整答案，再迁移受支持引用场景的分文件贡献。

编辑文件产生新贡献时整体替换旧贡献，包括删除标记；绝不union新旧位置。
其他文件贡献仅在绑定、依赖、位置版本和排除证据都有效时复用。
位置变化须重新计算或经已验证的UTF-16映射，不能直接返回旧range。

完整性不能仅检查旧答案中的四个文件：原来没有引用的文件也可能新增引用。
须同时更新候选索引分片与排除证明；未解析import恢复、继承和ambient影响都参与撤销。
不能证明的情形走官方完整搜索，不能以空集、部分Locations或旧结果冒充完成。

### Program与搜索路由

继续按workspace/product/module/target及编译兼容身份维持长期LS，SDK AST共享。
初始化准备合法组；普通编辑更新原LS，不因编辑/查询/候选数创建新组或销毁全部组。
组间按真实依赖传播；索引候选只在原有完整性门禁成立时收窄验证工作。

当前retainedOnly优先路由可能在候选选择前同步20k全局owner。
建议区分“借用已就绪owner”和“为一次引用同步大owner”：有合法候选覆盖证明时，
先比较可复用组状态，避免无条件预付全局更新成本。冷owner不能由探测隐式创建。
没有覆盖证明则保留完整控制路径，并记录触发原因和实际范围。

固定编译器公开findReferences(fileName, position)没有候选文件参数。
因此“只更新一个文件”和“完整引用只搜一个文件”是两件事；单模块20k仍可能有规模成本。
不能靠改Host根列表或把文件硬切1024来声称语义等价。

更深入的编译器派生引用分片需要独立可证伪实验，覆盖constructor、继承、alias、重载等
原有失败案例。ADR0008的S02/S03仍FAIL/BLOCKED；本方案不启动已暂停实验或接入失败producer。
候选索引和完整答案缓存的改造也不得绕开ADR0005。

## 4. 校验如何减量：必须单独决定新鲜度合同

现有ADR0019要求当前输入证明及独立最终全输入核验；旧实现因此保留两轮N级身份检查。
在不修订此合同的阶段，只能做调用去重、共享输入和减少实际语义范围，不能承诺消除N级核验。

建议审核的后续合同是“针对工作区已同步版本回答”：

- 请求捕获现有权威中的不可变输入视图；打开文档严格对应已接收的LSP版本。
- 磁盘内容由文件事件、显式刷新和后台补偿扫描导入版本库；查询不再声称感知所有尚未通知的外部写入。
- 同一请求中的文本/路径/SDK视图固定；文件新变化生成下一版本，不原地污染本次快照。
- 发布围栏检查所消费组/分片的版本和配置代次；相关变更撤销旧请求，无关变更可保留答案。
- 对新读取、变化路径和物理别名仍做读前后身份守卫；成员/负解析的变化检查不可省略。
- watcher故障、未知文件名、目录移动、事件缺口、网络共享恢复等触发域级重同步。
  无法证明健康时扩大同步范围；补偿扫描不是即时发现外部写入的保证。
- rename额外核验所有计划编辑的文件版本/内容，保留原有取消、事务和发布保护。

这与当前“未通知磁盘变更也应即时撤销答案”的测试合同存在差异，必须明确修订ADR并审核，
不能以优化名义默默削弱。若保持原合同，严格全输入核验仍是必要成本；
普通文件系统没有提供可由一次常数时间检查替代任意外部写入检测的保证。

SDK按固定内容/版本身份共享和准备；SDK变化重建兼容域。若SDK可能被外部原地修改，
同样受上述新鲜度限制，不能只相信安装目录名或永久复用而不识别版本变化。

## 5. 兼容性审查发现

隔离探针：`.bench/20261022-incremental-compatibility-review/probe.mjs`。
命令：`node .bench/20261022-incremental-compatibility-review/probe.mjs`。
原始输出同目录`results.json`。Mac Node26.3.0运行源码函数，不是Windows端到端验收。

| 发现 | 证据与影响边界 | 分类 |
|---|---|---|
| Native工作区D:/d:不一致 | 原Windows公开初始化成功，Node严格字符串比较拒绝，catalog为0 | 已确认产品故障 |
| Worker根判断直接比较URI pathname | 两个入口对D:/d:及Photos/photos都返回false，同大小写返回true | 已复现函数错误；LSP端到端影响待真机补测 |
| isInside误收父目录 | root=/tmp/compat-review/workspace，candidate=/tmp/compat-review，relative=..却返回true | 已复现跨平台边界判断错误；未证明数据泄露 |
| Windows全路径统一小写 | resolved-path-containment与physicalScopeKey按OS折叠所有路径 | 大小写敏感目录有误合并风险，未作该文件系统实测 |
| UNC网络路径 | Worker显式要求host为空，现有测试明确拒绝非空host；Rust Windows encoder还手工拼接URI | 当前不支持/编码风险，不冒称本次已触发故障 |

Worker相关函数在`semantic-worker-uri.ts`与`semantic-worker-input-guards.ts`重复。
目录边界错误位于`core/workspace/physical-path-identity.ts:isInside`；
`document-store.ts`的加载、嵌套根及失效逻辑调用该函数，需按真实接口补回归确认具体影响。
已有中文/空格URI探针通过，兄弟目录Photos2正确拒绝，不能宣称全部路径处理均有错误。

## 6. 统一平台身份方案

在现有身份模块上收敛成一个明确所有者，避免各调用方继续拼写比较规则：

- 保留clientUri供响应和展示；内部使用稳定资源ID/比较键；物理位置另记realpath及可用文件身份。
- URI解码/编码走标准接口，只在边界规范化一次；内部Worker继续严格验证已规范化协议。
- 协议明确本地盘符URI、UNC authority及扩展长度路径的规则，Node/Rust共享同一份golden vectors。
  盘符字母采用统一形式，不把整个文件名强制小写或改Unicode规范化形式。
- 文件/目录大小写策略来自实际文件系统/目录能力，未知保守处理；不能仅凭win32/darwin判断。
  不同挂载点、目录或提供者可有不同策略，能力变化须撤销受影响比较缓存。
- 统一sameResource/isWithinRoot/rebaseToClient；包含判断覆盖相等、..、../、跨盘、UNC share边界。
  词法包含与物理包含分开，不能仅靠字符串前缀或词法normalize证明symlink/junction边界。
- 对未保存文件用已验证父目录加叶名处理；缺失身份不能证明两个范围互不相关。
- 文件身份重建、原子替换、case-only rename及junction重定向使受影响别名记录失效。
  不按inode永久合并不同导入上下文的语义身份，hardlink也可能有不同模块解析上下文。
- Native握手先证明服务目录等价，再建立workspace/session身份；后续消息使用协议约定身份，
  不删除身份检查。持久缓存身份格式若变化，版本化迁移，保留旧证据。

UNC需要文件访问、监听、路径编码、Worker、索引与客户端同时支持才算闭环，
不能只放开host验证。原生权限/文件锁等异常保留结构化错误，不吞成空结果。
另将Zed缺省failureHandling的能力协商纳入客户端矩阵；不能假定客户端支持事务回滚。

## 7. 执行顺序和验收（未执行产品实现）

1. 兼容性正确性：公共LSP RED覆盖盘符/路径大小写和父目录边界，补Node/Rust共享向量；
   先解决本次已证实错误，再验证大小写敏感Windows目录、APFS两种模式、UNC及junction。
2. 失效分层：先把无关组编辑从结果缓存/Host版本失效中排除，保留未知依赖回退。
   回归必须在以前无引用文件中新增引用，防止只检查旧Locations形成假完整。
3. 受支持查询的候选/贡献复用：保留官方完整路径作oracle；原失败语义不得直接迁移。
4. 独立审核版本快照新鲜度合同；通过后才替换每次两轮全输入核验，ADR0004/0019明确修订，
   ADR0010从提案按验证范围推进。发布围栏、取消和源文件权威继续保留。
5. 单模块与多模块分别测2048/8192/20000，真实Zed及串行协议分开；固定SDK/代码/目标，
   测编辑首次/重复、真正close/reopen、定义与rename，记录median/max及失败，不丢慢样本。

额外反例包括：新增/删除/移动引用、导出推断类型、ambient/global、继承/重载/alias、
未解析import恢复、overlay关闭、同size/mtime外部替换、nested root、事件延迟/缺失、
symlink/junction更换和请求中途变更。新合同与原合同的差异必须分别报告。

同时记录实际Program输入/构建/Parser次数、身份检查次数、候选与批次数、原始I/O、
独占阶段及唯一PID内存。500ms仍是目标，无实测不承诺收益；degraded与READY分别验收。
实现后运行pnpm check:fast和相关平台/原生检查；455文件冷目录3秒项继续遵从用户授权跳过，
与本轮其他正确性和性能验证无关。

## 官方资料

Context7两次连接失败，改查下列官方文档/源码；不采用第三方教程作为技术依据。

- [TypeScript Language Service API](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references)
- [rust-analyzer Architecture](https://rust-analyzer.github.io/book/contributing/architecture.html)
- [clangd Index](https://clangd.llvm.org/design/indexing)
- [VS Code UriIdentityService](https://github.com/microsoft/vscode/blob/main/src/vs/platform/uriIdentity/common/uriIdentityService.ts)
- [VS Code ExtUri](https://github.com/microsoft/vscode/blob/main/src/vs/base/common/resources.ts)
- [Node filesystem behavior](https://nodejs.org/learn/manipulating-files/working-with-different-filesystems)
- [Node20 fs.watch caveats](https://nodejs.org/docs/latest-v20.x/api/fs.html#caveats)
- [Microsoft Windows directory case sensitivity](https://learn.microsoft.com/en-us/windows/wsl/case-sensitivity)
