# ADR0036：编译器源码命名空间证明的有界恢复

- 日期：2026-10-31。
- 状态：**Proposed；授权实现、完整fast2160/2160、最终Mac30K三轮及两份混合短测完成；真实UI阻塞，未记录独立设计评审，不追认 Accepted。**
- 问题：[NAV-INPUT-001](../plans/2026-10-11-query-performance-follow-up-plan.md#nav-input-001)。
- 父提交：`04282ed34ebab7cd01726bb0291af53bd278ff00`，叠加未提交 ADR0037/0035；各候选身份随报告保存。
- [TDD](../tdd/2026-10-31-compiler-namespace-recovery.md)、[最终实施与验证](../reports/2026-10-31-compiler-namespace-recovery-final.md)、[历史失败及定位](../reports/2026-10-31-compiler-namespace-recovery.md)。

## 实际缺口

Main 的动态类型 `import("./nested/Lazy").Lazy` 不等于文本 import closure。
编译器查找不存在的 Lazy 时，私有 witness 实际取得 nested 空目录的负向查找证明。
未通知创建 Lazy 后该证明失效，拒绝当前结果正确；但是准入恢复只检查 package resolver 的 witness，
没有检查编译器消费者自己的证明。resolver generation 不前进，长期 LS 又保留旧证明，后续请求持续 -32803。
ADR0037 与 ADR0035 两个基线均复现；不能把缺口归因于同文本关闭重开优化。

## 现有合同和边界

| 现有决定 | 本次遵守方式 |
| --- | --- |
| [ADR0025 决定1–4、候选9](0025-namespace-proof-domain-recovery.md) | 源码 namespace 的答案和证明一起退役；当前请求拒绝，下一显式请求重载消费者，沿既有 epoch/lease 单一退役点 |
| [ADR0019 决定5/7](0019-stable-programs-and-request-inputs.md)、ADR0025 candidate4/5 | 未通知 SDK/配置变化不因同版本、目录恢复或连续子查询被重新认证；保留命令范围 admission 事实 |
| [ADR0005](0005-index-proof-trust-boundary.md) | 不删负探测、实际物理身份、符号链接或工作区包含边界 |
| [ADR0010](0010-incremental-invalidation-and-overlays.md)、[ADR0035](0035-unchanged-source-authority-transitions.md) | overlay 和磁盘权威、真实源码 delta、同内容时的 Program 保留保持；正常编辑不一律退休整个域 |
| [ADR0037 C/D](0037-navigation-work-and-input-validation.md) | 每次查询的原租约及独立最终联合核验不变，不缓存跨请求 valid=true |
| [ADR0020](0020-failed-semantic-build-recovery.md) | 不另建 Worker、不越过未归还 lease，仍由原 dispose/Registry 生命周期释放消费者 |

这补齐 ADR0025 的消费者覆盖范围，并明确其已有 SDK/配置拒绝合同，不改写历史验收。
草率地让所有私有 proof 失效都推进 resolver 的中间候选，确实破坏了现有 SDK 切换回归；该失败证据保留。

## 决定

1. 每份事实记录其**实际取得来源和加载时的常规源码类型**。配置发现、metadata read 等保持不可自动更新的 load-owned 事实；
   编译器的源码候选、源码读取、目录存在性/枚举可以记录源码 namespace 来源。
   同一事实又被配置层消费时，采用保守的配置约束，不能事后把历史配置证明改标为源码证明。
   已保留与当前观察同为常规源码文件时，变化交给既有delta/snapshot权威读协调，不能仅凭来源是compiler就退休LS。
   仅有实际可证明的absence/directory/type变化才申请namespace恢复；identity不可读不是恢复证明。
   这是新增恢复入口的保守资格条件，不把所有regular→regular变化断言为纯内容变化；同名替换、路径重定向
   等仍由原输入/物理身份合同处理，不能因此跳过证明或承诺未测的无通知别名自动恢复。
2. 健康检查仍验证全部事实。遇到仅源码 namespace 的失效，也先完成其余事实的实际核验；
   任一非源码事实过期、未知失败或见证容量失败，都不得借源码恢复替它取得新资格。
   源码 load-window 的失败须保留来源；后续其他原因不能被第一次失败掩盖。
3. 恢复条件还包括词法与物理工作区包含关系，以及 SDK 词法/物理双域排除。
   缺叶使用已有祖先的实际物理路径推导，不能全路径小写或跳过符号链接验证。
   这些额外恢复边界检查仅在失败路径执行，不给每次健康查询增加一轮全域扫描。
4. 确认以上条件后，在现有 resolver 域推进 generation/inputGeneration，并同步废弃其解析元数据值。
   当前 proof 继续 false，当前请求继续错误；命令 admission 记录本次 rebase，嵌套子准备不能洗掉拒绝。
   DocumentStore 随既有代次规则撤销 closure/membership，coordinator 下一次 prepare 在未借出 lease 时退役旧 LS，
   再实际加载当前输入。没有一个请求内的自动重试循环，没有仅清 witness 或保留旧缓存答案。
5. 旧 witness 的回调只对创建它时的 epoch 有效，不能退休后继 owner。正常成功查询不推进域，
   缺事件恢复不依赖重启 Worker、伪造 watcher 或清空 SDK Registry/索引/所有结果缓存。
   现有“已知源码读失败后由自身权威 snapshot 恢复”的路径保留。
6. 来源元数据随 witness reset/namespace retire/dispose 退出，数量受既有 4096 条事实界限约束；
   不另设 RSS 门槛，不引入永久历史路径集合。容量失效不能伪装成安全源码恢复。

## 参考、取舍和未覆盖范围

Context7 resolve-library-id(TypeScript) 本轮 HTTP 传输失败；官方 tag 源码抓取也失败，未声称读取成功。
以实际安装 `ohos-typescript@4.9.5-r10`、`lib/typescript.js` SHA
`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`
的 `createResolutionCache`、`invalidateResolutionsOfFailedLookupLocations`、消费者
`hasInvalidatedResolutions` 为核验依据，具体行号/摘要存入证据。
借鉴的是失败查找、缓存及实际消费者一起失效，未调用 TS 私有 API 或更换 Harmony resolver。
外部定位链接：[TypeScript resolution cache](https://github.com/microsoft/TypeScript/blob/main/src/compiler/resolutionCache.ts)；
链接仅便于后续审阅，不当作本轮成功抓取收据。

仅重建 LS 会漏掉 DocumentStore closure/membership；仅 reset 证明会认证旧缓存；
每次编辑全清、关闭最终校验、同请求静默恢复、提高阈值或 Worker 换代均不采用。
逐 import 精准失效图仍超出本次范围；未知源码拓扑变化使用现有有界共享 resolver 域，有保守重建成本。
本次新增路径不自动更新编译器持有的 SDK/选择配置证明，保留原有显式输入协调；
package resolver 原有配置事实恢复路径不变。本决定不承诺所有不可证明输入自动恢复。

## 验证与回滚

- 真实子进程 stdio：首次保护性拒绝，后继请求精确类型和 URI/range；完整及 >20K partial 对照。
- 目录原已存在/新创建、保持打开/关闭重开/真实编辑、无通知删除恢复及重复健康查询。
- 同时源码 namespace 与 SDK metadata/declaration 改变，连续请求仍拒绝，配置通知后恢复。
- SDK 配置切换、旧 rename/call/completion proof、源码 authority 协调、实际编译后 SDK 突变、独立最终 fence 保持原断言。
- 突发有效请求与真实取消分开；协议和 UI、短测和正式耐久分开；不以 500ms 单次超标判功能失败。
- 最终候选完整 check:fast；Windows/UI 能力和 30K 原项目对照另列，不用最小夹具替代。

本次源码 witness 来源和恢复回调可一起回滚，不回滚 ADR0037/0035 的其他优化。
任何未通过的中间候选、原 UI 失败及长期验收缺口均保留。

## 扩大回归后的实施修订

13e90ee7中间候选在完整检查遇到5项`changed-source-read-witness`失败后中止，1796.325秒、exit1，
不是完整执行完毕。独立原6项重现1通过/5失败；没有放宽上下文保留或读窗口断言。
原因是来源标签不足以区分“正向源码内容变化”与“命名空间变化”：readiness在新delta实际安装前
核验旧事实，前者也触发了域退休，导致原LS丢失，权威读及故障窗口没有机会执行。

修正版保留原加载的regular-source类型，当前也仍regular-source时不申请namespace恢复，
留给原权威读成功/失败槽及独立终检；确实创建/消失/目录变化仍有限恢复。
原6项及namespace对照26/26通过，修正版Worker
`e2a30dd0ab83ad81c25c146d3315aa4ad7666d5a10b7e57e1ae468953b91a3c0`从头完整check:fast2160/2160，
0失败/取消/跳过/todo、exit0、3469.048秒；805输入零差异。
最终30K三轮交替每轮69完整响应一致；根目录98.619秒、phone/picker模块91.184秒两份独立混合短测完成，
各6轮创建/删除恢复、1Worker/0换代，模块类型/位置/补全编辑强结果对照通过。
75声明构建产物及输入/SDK/原30000源码最终复核一致；三个已核实测试driver重建及初版审计误分类保留。
未知namespace重载约3.1秒、64有效请求最大3783.785ms，未解决的成本/UI/索引/完整范围限制见最终报告。
证据`.bench/nav-input-recovery-v2-20261031/`，原13e90ee7日志/产物不删除或追认为合格。
