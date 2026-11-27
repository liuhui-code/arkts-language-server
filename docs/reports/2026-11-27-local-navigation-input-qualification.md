# 普通局部跳转慢：复现、修复及验证

状态：本片实现、功能回归、最终同构建规模/Photos对照与身份核验完成，整体性能事项仍OPEN。
没有提交、合并、推送、部署或重启日常进程。
工作树 `/private/tmp/arkts-query-proof-20261127`，分支
`fix/query-input-proof-cost-20261127`，父提交cc92b50370c0a2471f8315bab2119e59996fd2cb。
继承上一轮0051的未提交候选；该冻结候选2834/2834是前序证据，不当作本轮全量检查。
决策：[ADR0052](../adr/0052-source-bound-local-value-navigation.md)，Proposed。

## 问题与假设

1. 无关成员的前/后核验主导热请求；预测固定目标增加无关文件会增慢。
2. 同请求范围/配置派生重复会放大成本；预测调用栈显示多次非必要组合遍历。
3. 编辑后Program更新可能主要占用；预测编辑样本有显著compiler热点而非仅成员核验。

普通2048/30K串行基线已复现；独立profile的热请求lstat大部分位于
`CompleteMembershipProof.current -> refreshProjectMembership -> ProjectOperationScopes.sameMembership`，
一轮来自prepare，一轮来自原final union。不是重复解析SDK或查询结果缓存突然消失。
当前严格全范围合同使这些观察有正确性目的；局部值定义的实际输入域小于整个项目，
因此以编译器词法证明迁移这个消费者，而非删除全局最终检查。

## 普通协议基线

每档一个独立会话，1首次、3次编辑/撤销后首次、4次热请求，全部精确验证位置。
夹具1个函数文件加N-1空模块，零项目import边；合成SDK partial，不代表真实Photos依赖闭包。
Node20.19.5，编译器及产物hash见每档manifest；默认无RSS预算，无V8/超时/规模修改。

| 源码数 | 首次ms | 编辑中位/最大ms | 热中位/最大ms |
| ---: | ---: | ---: | ---: |
| 2048 | 171.967 | 79.994 / 83.846 | 138.439 / 143.844 |
| 30000 | 1521.973 | 671.466 / 1328.102 | 1347.617 / 1582.933 |

主工作区证据根 `.bench/query-proof-cost-20261127/`；
`measure-definition.mjs`、`baseline-{2048,30000}/operations.ndjson`和`manifest.json`可复跑。
脚本操作标签沿用旧references名称，但实际method明确是`textDocument/definition`，不能误报为引用耗时。
首次/编辑/热来自不同请求，不能将其中位拼成同一次分段。
`profile-30000/`独立剖析含inspector dispatch与明显扰动，不用于性能前后比较或产品队列归因。

## TDD与修复边界

`navigation-red.log`：原四次公开definition返回精确目标，但无关源码lstat768次，断言0失败。
第一版GREEN相同用例0次；类型检查首轮泛型日志转换错误已修正，保留typecheck01失败记录。
复用源owner官方工厂及原取消/资源生命周期；支持边界与反例见ADR0052。
其他查询仍走原全根路线，不宣称全局性能/初始化已解决。

路径替换回归首次发现新Worker入口错误类型不匹配，得到-32603，已改为原有
SemanticResultInvalidatedError。第二次测试却沿用了引用请求的-32801预期；实际导航适配器
`register-navigation.ts`的fallback是[]，`semantic-request-runner.ts`将content-modified记为stale。
修正测试以该已有合同为准：无旧目标、显式outcome=stale、下一请求精确恢复，保留inode/mtime证明。
没有修改公开导航适配器或放宽产品新鲜度；两次失败日志均保留。

光标末尾额外RED为384次无关观察；现在保留原光标的compiler结果，以实际identifier起点
校验同一声明，而非移动光标后偷换查询。该回归及32种值语法的完整项目同输入oracle通过。
void等值表达式支持按明确语法域增加；直接/包装后的函数调用、new、tag仍拒绝，保留外部签名。

## 功能检查及输入身份

`expanded-final05-controller.json`：UTC 2026-11-27 03:24:32.662—03:32:20.659，
21个文件串行160/160 PASS，0失败/跳过/取消，包括原30K完整成员及全局/路径/取消/恢复回归。
按仓库超长源码迁移合同，随后将既有格式化查询及位置适配原样抽至`formatting-query.ts`；
公开格式化characterization先1/1 GREEN，原函数体仅替换为同一checkpoint注入，位置helper逐字节相同。
`formatting-extraction-provenance.json`记录依据；engine618→575行，仍是迁移债务。
`typecheck06.log`及`final06-focused.log`最终30/30 PASS，0失败/跳过/取消。
该final06阶段相对160项候选只有格式化提取变动；随后final07另外修复下述输入竞态。
原`typescript-language-service.ts`2851行是前片保留的迁移债务。

`candidate-final06.json`冻结1382个代码/测试/配置输入及server/Worker/verifier/native SHA；
`source-final06.tar.gz`和`tracked-final06.patch`可还原本轮候选。
本片没有重跑全量`pnpm check:fast`，前序2834/2834不可冒作本片通过；请求合并前仍须执行。

## Photos对照驱动修正

第一版`photos-local-definition-target-drift.mjs`用第二个同名词定位查询。
插入`void extensionWindow;`后第二个词变成新增void位置，未保持同一调用目标。
原候选只有4/6次进入首版源域，编辑时回退7.82/3.80秒，源域计数断言失败；
`photos-candidate/`保持FAIL_PRESERVE，不能仅提取其中快样本宣称实际项目全部通过。
这是明确支持范围缺口及目标漂移的证据，不是返回了错误定义；当前void语法已由公开oracle回归保护。
最终驱动固定`AppStorage.setOrCreate`的同一参数位置；编辑只增加用例指定语句，
源码、SDK、查询文件/符号和调用目标保持不变，原工程只读、编辑通过内存overlay完成。
此轮原基线初始化145.725秒、候选145.969秒；与历史81秒差异未归因，不据此断言初始化回退或改善。

## 真实观察次数与复用证据

`phase-baseline-30000/`和`phase-candidate-final06-30000/`为独立轻量诊断，均8次精确结果PASS。
旧版每个请求对29999个无关文件在prepare/final各lstatSync29999次，合计59998次，
无关openSync均0。不是再次读取/解析全部源码。
源profile每次lstatSync32、openSync2，无关文件0、实际Program1个源文件/0 SDK。
这32次仍含目标/父路径/descriptor的独立初始与最终取证，不按其他文件是否返回结果来删校验。
两版全会话均5次Program创建、其中3次提供oldProgram（含初始化，不全部算查询创建），
2个LS；因此原增量复用已经在工作，瓶颈不能说成每次从零建Program。
这些是实际Worker的Node FS API调用数，不冒充内核syscall或其排他耗时。
插桩计时不进入普通比较，`phase-counts.ndjson`与`work.ndjson`保留逐请求/逐创建原始记录。

## 收尾发现并修复的输入竞态

子项NAV-SOURCE-AUTHORITY-001：captureReferenceSourceOverlays捕获physical path后，
hasOverlay复核时发现链接换目标，原先抛普通Error；父线程和Worker因此都发出-32603。
这不是SDK不完整或需要重建Program，直接原因是已有连续性失败未采用两端可识别的类型。
`source-authority-race-red02.log`用实际目录链接换目标分别在Worker definition、父线程references复现。
新窄错误继承SemanticResultInvalidatedError并提供父线程content-modified码；未知异常不吞掉。
最新59项公开/缓存/生命周期检查PASS：定义旧请求无目标且outcome=stale，引用-32801，
后续同版本查询精确恢复，Worker始终1个。没有放宽原身份检查或触发新的恢复通道。
首次引用控制继承旧测试策略而未进入hook，原`source-authority-race-red.log`保留；
纠正夹具后两项才真正复现。错误入口命令`final07-wrong-test-entry.log`未执行测试，非GREEN。

final07相对final06仅此typed错误及其回归变化；`typecheck07.log`、`final07-focused.log`为
最终59/59、0失败/跳过/取消。最终认证身份改为`candidate-final07.json`（1383个输入）及
`source-final07.tar.gz`/`tracked-final07.patch`。前06性能保持独立，不混成07多轮数据。

固定目标旧版`photos-baseline-fixed-target/`触及原210秒外部观察保护：初始化190.129秒，
完成首次/热/编辑三个正确查询6291.7/3354.7/3944.1ms后被SIGTERM保护停止。
控制器保持FAIL_PRESERVE，result中的RUNNING不是成功；没有产品timeout或OOM证据。
final06独立新候选初始化176.241秒、6/6结果正确，首次38.36ms，编辑/撤销22.89/21.81ms，
热8.83/8.81/9.35ms。最终07继续同保护独立复验，不提高保护阈值掩盖基线失败。

协议夹具沿用selectedL03Policy，显式关闭测试Worker压力回收等开关，不是日常部署全默认验收。
默认RSS预算未配置，无新增V8/产品截止时间/规模调整。最终07另外移除这些策略覆盖做默认策略短测；
SDK、日志、缓存路径仍按隔离测试配置，不能称真实Zed UI。

## 最终final07普通计时

`measurements-summary-final07.json`统一汇总逐次原始数据。每构建30K三个串行独立会话，
每会话1次初始化后首次、3次编辑/撤销后首次、4次热查询；不是冷启动端到端时延。
未将final06样本混入final07。旧版是固定0051最终候选，产物hash与原冻结身份对应。

| 源码档位/候选 | 首次中位/最大ms（n） | 编辑后中位/最大ms（n） | 热中位/最大ms（n） |
| --- | ---: | ---: | ---: |
| 2048旧版 | 171.967/171.967（1） | 79.994/83.846（3） | 138.439/143.844（4） |
| 2048 final07 | 23.185/23.185（1） | 7.648/8.922（3） | 5.865/6.551（4） |
| 30000旧版 | 1849.421/2648.378（3） | 867.286/1328.102（9） | 1800.131/2622.991（12） |
| 30000 final07 | 24.090/24.199（3） | 7.820/9.558（9） | 5.640/6.859（12） |

每个请求都校验准确声明URI/范围；每会话正常退出，只有1次semantic Worker启动。
所有新查询都有实际单源Program观测、无结果缓存命中；热态主要是LS/Program复用，不是返回缓存DTO。
2048每版1个会话，不能冒作3会话；30K每版3会话，n为操作数而非独立项目数。
固定有效目标增加无关文件时，新域没有旧版的成员观察增长；不能从这两档推出所有语言任务的复杂度。
真实依赖闭包增长、目标文件增长或活动overlay增加仍可能增加成本。

`final07-default-policy-30000/`移除selectedL03Policy的策略覆盖：8/8精确查询通过，
首次24.263ms、编辑中位7.800/max9.016ms、热5.733/6.371ms，单Worker。
SDK/缓存/日志仍为隔离夹具；新功能本身不要求用户新增开关，默认无RSS预算不变。

前final06有一条客户端端到端148.937ms，服务端同次request.completed仅8.34ms，
差额在服务端请求计时之外，未再细分；不能归因为符号搜索或重复扫描。
该样本原样保留，未纳入后修复的final07统计，也没有据它修改任何阈值。

## 最终实际Photos固定目标组件

`photos-candidate-final07/`：实际隔离Photos源成员29995，SDK路径
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，包API24/6.1.1.125，
项目目标API20，semanticState仍partial/sdk-inputs-incomplete。不是Program装入29995文件。
Node20.19.5，固定ohos-typescript4.9.5-r10；源码、编译器、SDK包hash见result及最终verification。
只读目标`product/phone/src/main/ets/picker/PickerUIExtensionAbility__copy_003.ets`，
`extensionWindow`，固定`AppStorage.setOrCreate`参数处；声明位置零基43:8—43:23。
版本1原文、版本2增加`void extensionWindow;`、版本3撤销；每个版本随后重复一次。

| 操作 | final07组件ms |
| --- | ---: |
| 初始化 | 88402.777 |
| 原文首次/重复 | 20.068 / 5.147 |
| 编辑后首次/重复 | 12.007 / 4.379 |
| 撤销后首次/重复 | 8.940 / 4.580 |

6/6结果精确，实际源域Program1、SDK0；项目/目标源文件前后未变，编辑只在overlay。
同目标旧版固定对照只完成3个查询便触及外部210s保护：其6291.7/3354.7/3944.1ms
是对应首次/热/编辑各一个有效样本，不算完整会话PASS，也不能伪造旧版三轮Photos中位数。
初始化跨本轮88—190秒波动未归因；本片没有优化初始化，不把现象说成已解决。
这是生产语义组件+当前源输入权威port验证，没有LSP父线程、Native并发或真实UI点击。

## 资源与最终核验

30K三会话Node采样RSS峰值：旧560.04—600.62MiB、新330.80—402.37MiB；
其余后代采样峰值旧57.79—62.32MiB、新61.02—61.91MiB。
按同一采样点求进程树RSS之和的峰值旧621.18—655.63MiB、新392.71—463.39MiB。
1秒采样包含初始化，可能遗漏短操作峰值；Node RSS已包含Worker线程，不能再加一份Worker RSS。
进程树RSS之和不是去重物理内存；独立Worker RSS、连续heap峰值、空闲泄漏趋势未测。
不据这些短会话宣称长期内存/OOM问题已解决，默认无RSS预算、V8/产品超时均未改。

最后测试注册清单502行违反尺寸合同，提取连续六项导航证明回归至
`navigation-input-test-entries.mjs`，原层/条目/执行顺序逐项相等，清单498行、4/4注册检查PASS。
未重新构建，因为只有测试注册元数据变化；运行产物与全部final07测量逐字节一致。
`candidate-final07-registered.json` / `source-final07-registered.tar.gz`记录最终1384个输入；
`final-verification.json`核验所有输入/产物、组件源码、编译器与原Photos目标及SDK包hash。
主工作区仍main/cc92b503，原两项用户文档改动保持原样，无提交/合并/部署。

复现（先在对应隔离候选构建，保持Node20.19.5和依赖锁定）：

```sh
node .bench/query-proof-cost-20261127/measure-definition.mjs /private/tmp/arkts-query-proof-20261127 /private/tmp/arkts-query-proof-20261127/dist/server.cjs /private/tmp/navigation-new-run 30000
QUERY_DEFAULT_POLICY=1 node .bench/query-proof-cost-20261127/measure-definition.mjs /private/tmp/arkts-query-proof-20261127 /private/tmp/arkts-query-proof-20261127/dist/server.cjs /private/tmp/navigation-default-run 30000
python3 .bench/query-proof-cost-20261127/summarize.py
```

完整命令、普通/插桩场景和Photos控制器在同证据根中；各输出目录必须是新目录。
所有历史失败保留；本片不含Zed/Windows/UI/耐久验收，也未重跑全量check:fast。

## 尚未关闭

此片限定函数体直接let/const的已证明值定义。参数、成员、导入/全局符号、类型跳转、
未列入的语法/错误恢复/struct等仍走完整路线，其全成员核验及依赖成本没有消失。
引用的非声明位置与全局引用/重命名性能没有被本片definition结果替代。
源权威检查仍随活动open overlays和目标体量增长，不承诺全部项目/工作集都低于500ms。
实际SDK保持partial；初始化、SDK匹配、历史初始化长尾、真实Zed/Windows及新耐久仍OPEN。
