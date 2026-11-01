# ADR0037：跳转需求、容量失败证明与同步输入验证范围


> 集成编号说明：本轮未提交实验原称ADR0034。远端PR #109已先合入ADR0034-private-catalog-publication，
> 因此本提案在合并前改号0037；既有实验、日志和候选哈希不变。ADR0035/0036保持原编号，
> 不改动已发布的私有catalog决策。

- 日期：2026-10-31；实施开始于2026-10-30。
- 状态：**Proposed；维护者已明确授权按方案实施，当前候选已实现；不追认独立评审或全量UI通过。**
- 关联：[ADR0032](0032-completion-item-identity-and-inferred-roots.md)、[ADR0033](0033-client-navigation-ownership-and-ui-input-context.md)、
  [实施计划](../plans/2026-10-30-navigation-work-reuse.md)、[21.562秒证据](../reports/2026-10-30-definition-21562ms-breakdown.md)。
- 父提交：`04282ed34ebab7cd01726bb0291af53bd278ff00`；不自动合并、发布或部署日常Zed。

## 证据及问题边界

真实Windows会话请求570的21562.433ms中，21292.850ms发生在父端准入至发送Worker。
Zed约12ms发送32个definition及32个typeDefinition；前方另有高亮/codeAction，定义和类型定义没有逐ID取消。
本条定义阶段62.081ms且Program零重建。前序一项约4057.663ms后失败，原现场缺少其完整内部阶段，
不能把这4秒全部追认为目录扫描。真实F12另有16427.801ms，不能将自动请求最大值等同一次F12。

本轮独立公开stdio反例：

- 三个相同位置定义实际dispatch三次；现有合并器只接入引用/详情，导航未接入。
- 20003源码容量partial，三次缺失定义使noise目录枚举2→5，单次约436–449ms；仍返回完整范围不可用。
- 配置见证同一路径在同一读取中重复验证；只扩大查询内部共享仍遗漏准备阶段的核验。
  必须共享准备事实，但不能把最终验证移到Program租约释放之后。

原真实UI、机制反例、Mac原64位置协议重放分别记录；重放不是新UI验收。

## 官方机制及适配

Context7本轮resolve TypeScript成功；对`/microsoft/typescript/v4.7.4`的查询包含旧测试基线，
只采用LanguageServiceHost概念，不将其示例或TypeScript7 Go接口当作实际4.9.5-r10实现。
实际函数与构建身份通过已安装`ohos-typescript@4.9.5-r10`源码及bundle核对。

- [VSCode导航状态取消](https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/gotoSymbol/browser/goToCommands.ts#L111)：
  请求绑定编辑状态，结果应用前再检查取消。用于ADR0033的客户端边界，不声称本扩展能改Zed核心。
- [VSCode请求队列](https://github.com/microsoft/vscode/blob/main/extensions/typescript-language-features/src/tsServer/requestQueue.ts)：
  优先级和编辑屏障独立；[按seq取消](https://github.com/microsoft/vscode/blob/main/extensions/typescript-language-features/src/tsServer/server.ts#L173)
  可删除排队项，或取消在途操作。
- [clangd调度](https://clangd.llvm.org/design/threads)：失效读取取消、连续更新合并、输入顺序与AST归属。
  不照搬每文件线程，不并发共享当前可变Program/checker。
- [TypeScript按需计算](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API)、
  [rust-analyzer增量与快照](https://rust-analyzer.github.io/book/contributing/architecture.html#cancellation)：
  借鉴稳定输入与需求生命周期，不能据此把本项目未通知的磁盘变化视为不可能。
- [LSP取消](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/specification.md)：
  每ID独立终态；标准definition参数没有F12/自动链接的可靠区分。

## 决定

### A. 共享等价计算，保持独立请求

导航统一注册模块接入现有InFlightRequestCoalescer，不新建结果缓存。
键由方法/URI、workspace、文档版本和精确UTF-16位置组成；disk保留原权威源解析和最终校验。
定义与类型定义不共享结果，不同位置不互相替代。每个消费者保留自己的取消与唯一终态；
只有最后一个消费者离开才取消底层工作，等待任务真实结清。

导航的在途失效scope为workspace：依赖、配置、编辑及关闭事件撤销旧订阅，最后订阅撤销同步移除旧操作键。
因此同源版本不变、或关闭后以同版本重开，也不能加入旧输入的在途计算。
不新增跨请求完成结果缓存，不顺带修改暂停的引用缓存失效TODO。

### B. 只复用有见证的容量失败

成员枚举器在原目录关闭验证完成后，交出真实path/physicalPath及BigInt dev/ino/mtime/ctime观察。
捕获不增加另一轮realpath，避免破坏原有物理源根扫描界限。
仅`path-count-limit`/`path-byte-limit`保留容量失败证明；验证现有目录真实路径及前后身份，
并要求支撑失败的overlay-only成员仍存在。已由磁盘枚举证明的成员，不因打开同文件overlay而重扫。
目录事实元数据受现有成员路径字节额度约束，溢出回到原枚举，不创造新的产品RSS限制。
注入的路径迭代器没有真实目录见证，不获得此证明。

定义局部结果为空时，在完整准备/预载前检查该失败证明。仍有效就返回原完整范围不可用错误，
不把未知符号变为截断空成功；不扩大入口/Program或预读无关源码。
目录增删/重命名、链接身份、配置代次或必要overlay变化使证明失效，走原重试。
`source-unavailable`/`enumeration-error`不缓存为容量失败，原文件内容修复即使目录mtime不变也可重试。
显式全量引用/重命名等仍走原完整性路径；此次不提高20K规模上限。

### C. 一个同步导航操作交接证明，原租约内完成最终核验

withSynchronousInputPreparation只包围无await的导航适配调用。
准备期间的原始配置/命名空间事实加入同一验证范围；实际引擎查询仍在现有语义租约中执行。
withRequestInputValidation继承这些事实与首次观察，在其原位置清空观察缓存，再进行全新最终union scan。
最终阶段暂时关闭准备/已验证结果复用；每个owner的代次与revision仍需匹配。
租约返回前完成最终核验，不把这一步延迟到外层导航适配器退出。

只对验证扫描共享同path/mode的实际lookup结果；actual load的before/after guard始终直接读取。
复用与已有文件身份观察共同计入原32MiB请求元数据额度，溢出普通读取。
成功、失败、取消及完整范围回退均清除范围；不同请求无TTL、无“版本不变就认定磁盘不变”。
原生realpath、符号链接、缺失父目录、SDK及磁盘字节终检保持；文件名大小写保持原规则。

### D. 保留调度和客户端边界

既有foreground/completion优先级、有限公平、mutation/global屏障与Worker监督预算不变。
同一方法中的不同有效位置仍需分别处理；这些请求全部未取消时，单Worker仍有总服务成本。
服务端不能猜测F12，也不通过重启Worker、提高上限或丢弃合法任务“解决”排队。
Zed自动需求取消与晚到结果不抢焦点仍归ADR0033，未实现即明确OPEN。

## 拒绝方案

- 恢复同method+URI latest-wins：再次误取消独立F12。
- 只接合并器就称原64个不同位置全部优化完成：不同位置不等价。
- 所有partial永久缓存、只按mtime/年龄重试或每次清空全部缓存：无法证明恢复和边界。
- 直接删除每次请求的最终校验、跨请求复用“有效=true”：丢失无通知变更保护。
- 将整个异步请求包进一个全局验证范围，或在Program租约释放后补终检：错误生命周期及并发隔离。
- 抬高队列、超时、规模、RSS/V8阈值，或每次创建Worker：不解决总服务成本。

## 验收

公开child-process/stdout framed transcripts覆盖：相同/不同位置与方法、单消费者/全部取消、
依赖与配置变化、同版本关闭重开、disk来源、异常SDK修改后的拒绝与恢复。
原始SDK在编译器已产生定义后才真实修改，旧定位即使看似正确也必须被最终围栏拒绝。
容量partial覆盖真实20003文件枚举、无通知目录删除/新增声明恢复、同inode不可读源码修复。
已有路径/源根扫描边界、命名空间生命周期及输入证明用例保持，不放宽断言制造GREEN。
最终check:fast、固定输入三轮对照与UI覆盖分别报告；455冷目录3秒门槛继续按用户授权跳过。
500ms仅为体验目标，持续多秒排队、未知SDK与完整30K功能限制不作为成功。

## 实施收据（2026-10-31）

公开相关回归103/103；最终`pnpm check:fast`2147/2147，exit0、无取消/跳过/todo。
800份冻结源/测试/配置与最终产物SHA一致，完整日志及身份见
`.bench/navigation-work-reuse-20261030/final-check-summary.json`。
固定驱动、SDK和隔离30K项目的三轮交替协议对照，69份完整响应逐字段一致（含原有错误）；
最坏定义6466.262→3563.904ms。原64请求键全部不同，不能将此收益归于请求合并。
关闭重开未改善，初始化degraded、全范围错误及索引未完成如实保留。
[实施报告](../reports/2026-10-31-navigation-work-reuse.md)分别列出结果、资源和未覆盖项。
Windows/真实Zed UI未重验，ADR0033仍OPEN；此实施收据不等于独立评审或Accepted。

后续[ADR0035](0035-unchanged-source-authority-transitions.md)专门处理关闭重开时的同输入compiler版本；
不改变本记录的独立消费者/旧生命周期失效、容量证明及每请求最终围栏。上述2147收据仅覆盖原冻结候选。
