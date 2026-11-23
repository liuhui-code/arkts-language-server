# 30K热查询：证明扫描与作用域路径元数据

日期2026-11-20。状态IN_PROGRESS；没有合并、发布或部署。原Photos与日常Zed未修改。
证据E：主仓库`.bench/repeated-query-proof-plan-20261117/implementation-20261118/`。

## 源码与候选身份

父提交1e3886df3c4d27755a53c073462f1456b0a3de7e；保留此前全部优化与历史失败。
X位于`/private/tmp/arkts-open-save-membership-20261120`，Worker
65cc5a1eb5d4ccf57553975b04a33653baf4f63a5df12797c74256a73603acfc。
X实际完整pnpm check:fast在07:00:19.676Z结束，2749/2749PASS、零skip/cancel，
1028源码输入前后不变、Worker哈希不变，见`open-save-membership-final-check01.{json,log}`。
这不会覆盖V历史2737/2738失败，也不能用于证明后续Y完整通过。

Y是从X完整复制的隔离源码目录`/private/tmp/arkts-scope-projection-20261120`，
未创建新Git提交；不是另一个伪造提交身份。Worker
879239c186a12489802470c54b7c30b41a3f738973fc38535a4d7d236a7bc94f。
1030源码输入与76运行资产见`scope-projection-source-freeze01.json`和
`runtime-scope-projection-v1-identity.json`。Y改动四个产品文件、两个已有测试文件及一个fixture。
Native800e6628、Node20.19.5、compiler4.9.5-r10保持不变；原Photos30K/eligible29995，
SDK24与项目20不匹配，SDK partial，完整引用/重命名资格仍未闭环。

## 最小诊断及被排除的假设

`hot-proof-boundaries-public01.test.mjs`使用实际stdio子进程，N100/400，各3次精确typeDefinition，
2/2控制PASS。认证0.03–0.32ms，不能将其他prepared-query成本归给认证。

原30K `hot-proof-photos-diagnostic01`4次精确定义，认证0.1–0.45ms、
engine.assertCurrentInputs约1–1.6ms；资源采样因sandbox ps EPERM失效、postflight未执行，
整体FAIL保留。额外获准只读ps确认PID12732已不存在，不能补造缺失的运行期RSS。

02/03在允许资源采样的隔离测试驱动运行，未关闭产品或资源保护。两轮4次精确结果、
Native READY、原60s SQLite结构/FK检查PASS、所有实际采样owned PID关闭。见原result.json。
两轮均为插桩诊断，并与X完整检查部分重叠，不是普通性能对照、UI或耐久验收。
02证明大于等于128事实的单个witness扫描没有命中，排除“某个巨型认证witness”解释。
03转而聚合实际scan入口（未逐路径打印）：三次热Worker约2988/3050/3047ms，
query witness scan各79057次、约639/652/644ms；final各273270次、约839/856/851ms。
这些区间嵌套于graph/final等父区间，不得与父区间相加。
scan入口包含已有观察的比较或空集合，不等于物理读取次数、独立owner数或不同路径数。
仍待统计事实宽度、唯一owner、memo命中和raw IO，不能据27万次断言27万次lstat。

## NAV-SCOPE-PATH-METADATA-001

直接路径：SemanticGroups.select -> ProjectOperationScopes.project -> allowed.map(resolvedPathIdentity)
和ScopeDependencyGraph.nativeSafe -> allowed.every(resolvedPathIdentity)。
组成员没变仍每次规范化整组，再分配Map。此前30K投影exclusive self约230ms，
但其中包含其他工作，本修复不能承诺全部230ms收益。

公开RED命令（Y产品仍为X旧Worker）：
`node --test --test-name-pattern='hot navigation reuses immutable group' tests/semantic/navigation-group-membership-reuse.test.mjs`。
`scope-projection-public-red03.log`实际两次定义位置正确，热查询396个无关文件规范化792次，
成本断言FAIL。red01为驱动cwd错误/选择0测试，red02为错误hook形参导致fixture启动失败；
两者保留且均不是产品RED。

实现：SemanticGroups.discover发布冻结的已有组paths；新scope-path-metadata.ts以该不可变绝对路径数组
为WeakMap键，保留词法identity/file条目及原Map后出现拼写覆盖规则。
ProjectOperationScopes.project和ScopeDependencyGraph.nativeSafe共同消费元数据。
重复身份的所有原拼写仍保留在entries，Native omission检查不会因Map去重漏掉别名。
可变数组、相对路径不缓存；保持Windows只折叠盘符、保留文件名大小写。
无文本、AST、Program、磁盘观察或跨请求valid缓存；组/配置目录释放后弱键可回收。
所有membership/source/binding/SDK/current/final核验及取消点保持原逻辑。

GREEN：`scope-projection-public-green01.log`22/22PASS、零跳过；同一热查询792→0，精确位置不变。
`scope-projection-expanded01.log`55/55PASS、零跳过，涵盖源provenance、保存/撤销、图增量、
最终成员、关闭重开、partial、格式与生命周期。typecheck PASS。
Windows盘符期望修正后的路径合同4/4重跑PASS（包含于22，不额外累计为新用例）；
只是Mac运行的跨平台代码合同，未宣称Windows实测。

## 普通对照与最终门禁

`scope-projection-cost-series01`基线X完成28次精确定义及补全/详情/class-symbol，
但dataDB integrity_check原60s超时，controlDB PASS；原FAIL、所有日志保留，进程CLOSED。
这既不是产品OOM，也不能宣称整轮通过。未修改SQLite截止或断言。
独立`scope-projection-cost-series02`只在基线属于该单一超时、输入未变且已CLOSED时继续Y观察，
保留基线FAIL；预计整体COMPLETED_WITH_FAILURES，不把功能/时延观察改名整体PASS。
两版本使用原30K输入/SDK、默认closure、关闭后重用Native缓存，OS缓存未清。
当前控制器18217，Y完整检查控制器1718等待串行对照终态；检查尚未运行/完成，不能沿用X通过。

剩余：Y普通收益、最终完整检查、受控规模/真实依赖/密度矩阵、初始化约80秒主成本、
证明组合热点与原SQLite60秒波动、Windows/UI/耐久和SDK完整资格。
500ms仍为体验目标。未采用B方案watch-only边界，也未改变ADR0006对已运行同步诊断的约束。


### 普通对照终态与新完整检查（本段覆盖前述运行中状态）

scope-projection-cost-series02已结束COMPLETED_WITH_FAILURES；基线失败保持原样。
候选会话28精确定义、补全及详情、class-symbol、Native READY、SQLite结构/FK及CLOSED均通过。
基线/候选初始化76975/78382ms，首次5105.741/5027.557ms，
热中位2646.605/2528.917ms，最大2718.702/2534.108ms。
一次配对热中位变化-4.45%，仅表示本次观察，不能承诺稳定百分比或消除2.5s热成本。
原始逐次数据、摘要见scope-projection-cost-summary01.json及两会话result.json。
Y自身完整pnpm check:fast已实际启动，PID20222，tool handle1718；非仅等待控制器。
完整源码1030项冻结，不在检查期间改动；结果尚未完成。未运行Rust测试/重建（本轮无Rust变化）。


### 09:14Z当前全量终态与环境更正

Y源码副本缺Git导致的check02已封存为环境FAIL并停止。完全相同1030源码迁入正式隔离Git工作树
`/private/tmp/arkts-scope-projection-git-20261120`，check03真实全量2752/2752PASS、零skip/cancel，
源输入与Worker8792前后不变。该结果覆盖代码门禁，不能替代原SQLite失败、UI或耐久。
最终规模矩阵已启动。证明owner、初始化更细分解及环境审计见
[后续报告](2026-11-20-initialization-role-and-binding-cost.md)。
