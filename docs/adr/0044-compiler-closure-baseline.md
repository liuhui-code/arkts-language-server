# ADR0044：compiler closure 的阶段归因基线

- 状态：Proposed。2026-11-03 环境回滚后**重新构建**，不是原始制品恢复。
- 基线：main `298d65f5d7f796c347fe8be5c739e428066489d8`；独立分支 `feat/closure-phase-rebuild-20261103`。
- ADR0043属于独立SDK清理工作，不覆盖它。ADR0039仍Rejected。
- 本片承接ADR0019、0024、0029、0031、0037、0038；不改产品范围、witness、取消、期限、恢复或内存政策。
- 新执行记录：[TDD](../tdd/2026-11-03-compiler-closure-baseline.md)；状态：[Feature Ledger](../plans/references-feature-ledger.md)。

## 问题与归因边界

现场报告约23K memberships、createProgram长时间未返回、definition超过30秒执行上限及后续Worker不可用。
本片没有原始现场项目、SDK或完整日志，不能把Linux合成实验冒充Windows现场复现。
目录membership、Program roots、实际SourceFile闭包必须分开；SDK export、main Program、checker、输入围栏与终态必须分别记录。
通用unavailable或低RSS不能单独证明OOM、无限循环或同一命令执行900秒。

## 诊断合同

1. CLI只生成私有合成项目与最小SDK，不接受用户项目目录。使用真实子进程及Content-Length framed stdio。
   同一物理文件树按off→on执行，每次新进程；必须使用不存在的输出目录，不能覆盖旧证据。
2. 不修改原runtime artifact。启动测量前按实际semantic Worker bundle AST插入回调，明确签名必须各匹配一次，先做语法检查。
   preload核对原Worker、独立诊断bundle、observer SHA，只替换目标文件的编译字节，保留原filename/标准库位置。
   保持原strict directive、this、arguments、参数默认求值、返回及异常。其它Worker不插桩。
3. 默认只观测实际command/prepare/owner/createProgram/phase边界。只在真实返回的Program上读取已有sources/text计数。
   不新增getProgram/getTypeChecker/prepare等语义采样。readonly readiness是明确的公开回归步骤，不能冒充无额外RPC的现场操作序列。
4. `--io on`是独立重诊断，不将其时长当作产品性能。I/O按load-guard、source-boundary、installed-source、validation、final-fence和other区分。
   relative candidate命中按Program区间计数；distinct installed候选是Worker累计尝试，包括不存在/被拒目标，不等于成功安装数。
   最内层职责决定计数分类，但validation/final-fence内的lookupIdentity不误计为load guard。
5. aggregate trace不输出源码、完整路径、错误原文或可复用路径哈希。Program/host用WeakMap编号。
   候选去重仅在内存保存随机盐SHA，最多65,536项；事件最多4,096/Worker，reader最多16MiB/16,384项。
   error.name只读取一次，匹配固定白名单；任意getter异常不替换原抛出对象。sink/容量/observer失败明确标不可用，不改变原语义结果。
6. trace需要真实ready及command收据。Program终态必须匹配活跃Worker/epoch/command和buildId；缺失、重复、错配不能认证完整。
   未收到返回收据不捏造sources或返回时长；外围phase与watchdog收据应共同解释，不能仅从缺失推断编译器必然未返回。
7. 保留默认request30秒、global120秒、preparation180秒；清除继承ARKTS环境和NODE_OPTIONS，仅设置受控SDK/cache/log/sidecar。
   report.deadlines是本固定基线的合同值，不是运行时探测；实际watchdog的reason/epoch/command/phase/elapsed/limit/starts/returns单独保留。
8. 比较完整preparation、readonly status、definition payload、failure和shutdown；只忽略新进程随机semanticGeneration。
   输入与10项artifact/诊断脚本前后复核。PASS还须两次精确定义、有效readiness、成功shutdown及exit0；相同错误只有parity，不是成功。
   所有report都releaseEligible=false。诊断不完整、输入/制品漂移和真实语义失败分别报告，不删除失败。

## 解释限制

- 只观测semantic Worker，不覆盖reference/diagnostic verifier；无进程树RSS/PSS、精确heap归属或全部存活Program统计。
- createProgram elapsed不含返回后聚合；外围phase仍含观察成本。off→on、共享机器和未清空OS缓存不提供统计性能结论。
- 未单独启用父端queue tracing，不把LSP总时间减Worker时间直接称排队时间。
- 最小SDK不代表真实SDK复杂度。本片main不包含未合并PR115/116，不认证它们、Windows原生路径或真实UI。
- CLI固定自身repo root，不能通过参数指定其它runtime或复用既有fixture；跨候选同物理输入验证应另用明确指定artifact的公开stdio脚本。

## 重建与验收

原始工作树、patch、测试日志与测量目录在回滚中丢失，不能继续作为可审计的本轮文件证据。
六脚本首先按上下文重写并匹配此前保留SHA；新回归又发现畸形shutdown同时含result与error的诊断判定缺口，
本轮在RED之后补上显式拒绝，并拒绝伪造/畸形/超量status marker提升缺失trace的资格；
故helper当前SHA与历史不同，其它五脚本仍匹配。历史校验不是新执行收据。
新RED及31/31完整关键回归已记录；新宽图保持baseline同一freshness失败，精确roots/sources与终态有新收据。
本轮完整check:fast未跑，原始grammar资产仍缺失，Windows验证未做；不借用丢失旧日志认证。
发布、策略变更、产品毕业及恢复丢失旧测量均不在本片交付声明内。
