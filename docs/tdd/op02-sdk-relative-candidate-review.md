# OP-02：SDK 相对候选探测实验与不采纳决定

日期：2026-10-15（运行 UTC2026-10-14）。父修订
`a111235bc4bfcb55b126752f95b3ba095f2996af`；分支 `codex/op00-query-attribution`。
结论：新增 SDK 候选缓存 **未采纳、已撤回**；保留公开输入保护回归和候选顺序职责提取。
此前目录存在性复用与六项默认优化不变。OP-02／OP-06／L08 仍 IN_PROGRESS。

## 原完整失败与有限归因

修正 pin 输出后的真正完整 `check:fast` 为1750/1751、1FAIL、exit1，零注解，
2993941.218021ms；不是完整 GREEN。唯一失败为403文件引用的 id4 含声明查询，
原20秒期限不变。id2不含声明已完成18289.03ms，id3缓存0.88ms；不是此前的id2失败。
完整原log SHA `7bf4fbb168fb1e3ede0b4e275cfb7b458af5e602aa935a53ca1f03109fa8b659`，
独立audit SHA `02abc8b46dc0822b6ec8f5ded310e32a7dabf92d512d49158ec94df5046d767b`。
来源 `.bench/op06-pin-output-corrected-whole-v1/whole*`，全部输入／源码／产物身份稳定。

对原PID95936／原时窗的只读记录保留在
`.bench/op06-403-whole-default-log-observation-v1.json`，SHA
`f4b676168c9e277bdd11b4c426f4405243c71c409357bf3f678b6a22e07adad6`。
id4独立anchor定义0、2732.95ms，然后进入完整回退；记录不能证明超时唯一原因。

随后一次原用例 trace 控制1PASS、2个明确name filter、exit0，没有复现失败。
每个逻辑引用均7个顺序transient批次，roots为65/65/65/65/65/65/19，成员403。
每批保留255个SDK SourceFile／10741499 UTF-16 code units。
两请求ProgramReady字段合计13414.386055／13458.749077ms，query约107／110ms。
阶段字段可能重叠，不相加成独占CPU；批内对象复用不是跨批次保留LS的证明。
trace log SHA `f8fe2131a98bd350d86efd75e5007a0bf4f5fdb6664200234dea25c4e2016995`。

一次私有原生观察进一步发现：15个实际Worker中，`@ohos.base`的四个缺失后缀
每Worker各168次真实lstat尝试，存在的`.d.ts`为86次、anchor87次。
这是Worker生命周期尝试数，不是内核I/O、RPC独占耗时或正常计时。
原log SHA `61745c44b3a14603e997b444dd90906447c63e1b655ca3fc33ce0e9d78e01a45`。
原SDK、scope、预算、瞬态生命周期和请求期限未修改。

## 表征、公开RED→GREEN与实验范围

先通过源优先级、SDK祖先边界和词法symlink三个原用例表征，再提取
`typescript-relative-module-candidate.ts`；提取后同3PASS／43name filter，exit0。
相对候选顺序、overlay优先、installedSourcePath物理校验及失败分类不变。
表征log SHA `64b08056bd40546fbd712ffd9a7c7699a2ed6b4aa52b45106d93e89249a8b18f`，
提取后log SHA `b93f58e2d4a0d4dd3e29003f0b0e367c01d392e3bd37cc10fa328868c3f2f3f1`。

真实私有SDK的20个声明相对导入同一SharedBase，生产LSP完整定义／最新诊断正确。
观察器首RED缺preload，是工具设置失败，不是生产语义问题；补上实际native转发后
1/1 GREEN，默认和关闭均80次真实探测。没有伪造文件查询返回值。

随后新增同步查询探测上界断言：RED0/1、exit1，1439.887125ms，实际80次。
命令为Node20 `--test --test-reporter=spec tests/semantic/sdk-candidate-proof-reuse.test.mjs`。
原实验入口现仅在冻结归档中，正式保留入口改为下述输入保护测试。
RED log SHA `7c4c4ae6ed7d71c5bfe901ae3f536ed7fae062fbed8d8af2c9e93fb5bee0cb03`，
audit SHA `faf59793f5ef2d2014675479b75f8128fb362ceb37d40198bfef81b1575e4ec8`。

实验只在既有同步query内复用已真实见证的SDK候选布尔值，最多32条／32K code units；
finally清空，超限普通查询，不跨请求、LS或Worker保存。load-window／结束fence和
物理边界不缓存，沿用原开关，不增owner、SDK AST、预算或版本门禁。
GREEN1/1：默认4／关闭80，完整结果／诊断一致，log SHA
`ceacec2ae5dd0ca87925e198c7c5dbe739c415ae14619b2fb51e673476e4a7e2`。
后续真实文件创建两模式均-32803、无旧result；SDK副本切换后完整定义／v2诊断恢复。

库存RED3/4后明确登记，实验七文件62/62、exit0、零注解，94780.745503ms。
包含负叶加载窗口、取消、同大小同mtime、SDK切换、源边界及transient隔离。
log SHA `cf70c714cb0e2119df48bbe0ee1569624930e26a1bf581238f63e0a019e5ed93`，
audit SHA `b20c6075e9b43886ccc1cf7843fe5693b2329b24650b2970a32550e5abb3f264`。
一次原403诊断控制1PASS／2name filter：15个Worker的缺失后缀探测均168→4，
完整SDK／成员／14批与1anchor保留；audit SHA
`755fd3719b8dbd41f753d83d65df5df8a1c9986a4b2f350ff0794620a606960f`。
原始源码、SDK、观察器字节及完整原log保留，不将诊断控制当正常性能收益。

## 固定正常对照与不采纳

关闭trace／profiler／preload，固定OFF→默认→默认→OFF四独立真实进程，一次无重试。
原403文件／完整2或3个Location的UTF-16 oracle／20秒期限均保持，16次完整结果相等。
比较的是整个当前模块查找组合对完全关闭，不把差值全归给新增SDK候选。

| 顺序 | 模块复用 | 不含声明首次 ms | 含声明首次 ms |
| --- | --- | ---: | ---: |
| 1 | OFF | 15248.13 | 17444.70 |
| 2 | 默认 | 16911.83 | 18414.59 |
| 3 | 默认 | 16560.04 | 18020.81 |
| 4 | OFF | 16348.75 | 17984.89 |

默认两次均更慢；本批不支持稳定净收益，不追加有利采样，也不宣称SDK缓存为唯一慢因。
每组原测试关闭LSP使用SIGTERM，只认证test-runner原生exit0与LSP PID已消失，
不认证LSP退出码、LS dispose、Registry释放或物理回落。
request.completed Node RSS不是外部产品峰值或PSS。四组原数据和终态独立审计：
`.bench/op02-sdk-candidate-normal-abba-v1/terminal-audit.json`，SHA
`04a30c6afb3940945cba2c43e44f255f94b10d646224b6ab5848ce50f79a0bca`。

按计划净收益不足不采纳：撤回新增SDK候选Map，保留此前官方解析／目录复用及六默认。
原RED、实验GREEN、全部慢样本与源码归档保留，不能借其GREEN认证撤回后的新源码。
正式测试 `tests/semantic/sdk-relative-input-guard.test.mjs` 保留实际负向加载观察、
后续创建拒绝和配置恢复；删除的是未交付候选的优化上界，不放宽任何原语义／期限合同。

## 当前交付与下一切片

撤回后重新strict／build／diff通过；八文件65/65、exit0、零注解，138715.730974ms。
原403用例34084.033129ms是整个case，不是单RPC时延；不改写原完整id4超时。
当前log SHA `c300ef7e4eeb5cebe32762fa7da8cf8c1381267779751ff9a8accb9351d72813`，
audit SHA `6db630dad6375ec5be53659509cadf1e8066865aedc2b26cb44a5e57316b000f`。
冻结1694文件／repo SHA9a1ef26b，source archive SHA
`a23f9b0e7e19eb0742b1363377b74f5a9097d47a563a24b9f31c560e4d07a230`。
当前production input217fc0c0与实验b5af2f11分开；三个Worker产物已改变。
sidecar／SDK／backend不变；库存201，unit97／protocol8／bundle89，fast194。
handwritten helper24／observer23／保留测试77／query模块50行；旧core3274→3260，
仍为超500行迁移债，不据此免除后续职责提取。

下一步针对已观测的冷Program准备主成本提出最小、可证伪切片，而非继续堆探测缓存。
遵守ADR0003每批transient终止，不偷偷保留LS／SDK AST或增加并发。
当前完整回归仍未GREEN；原OP-00–06资格／采纳、资源／生命周期／≥100循环、
客户端／三平台／DevEco-PSS／历史3GB与50%／完整正例和336格保持原范围。
未合入／push，无L08毕业；最终550ms／内存不阻塞前序切片功能验收。
