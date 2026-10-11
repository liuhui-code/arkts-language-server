# L08 最终证据入口

父 HEAD：`1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`；继承 dirty 改动保留。
要求来自[执行记录](../plans/2026-10-10-l08-final-validation.md)与
[验收协议](../benchmarks/semantic-ready-acceptance.md)。工具 GREEN 不等于产品毕业。

## 无证据必须明确未运行

公开 CLI 测试：`node --test tests/semantic-release-matrix-cli.test.mjs`。
先添加固定矩阵和一项测试，不先实现 CLI。RED：0/1、退出1，
250.963124 ms；CLI 不存在，stdout 不满足 SEMANTIC_RELEASE_GATE=NOT_RUN。
这是新增开发工具行为的 RED，不是生产 LSP 缺陷。

最小实现输出全部 14 能力/声明策略 × 8 桶 × 3 平台，共 336 格。
每格六门禁与独立匹配 SDK/DevEco 门禁保持 NOT_RUN，releaseEligible=false；
输出采用 wx，不覆盖旧证据。当前切片不接入测量、不能产出 PASS。
后续按垂直切片接真实原始报告，保留缺失、失败与样本分母。

首项 GREEN：1/1、退出0、283.497266 ms。随后登记检查真实 RED：
3/4、退出1，244.248764 ms，新增 entry 尚无 layer；登记 unit-contract 并
同步严格入口174/unit84，不排除 fast、不弱化发现规则。

## 原始 candidate-control 不认证最终 ready

下一公开 CLI 反例先 RED：candidate-only references 输入应进入其声明策略
独立格，保留 42 ms 观测但 ready/latency BLOCKED；0/1、退出1，
226.771384 ms，因为 CLI 尚无 prepared-report 参数。最小接入原始报告，
按输入/SDK/配置/硬件分组，保存完整文件 digest 与实际进程启动/PID 会话
身份；不把相反策略或不同构建的样本合并为 P95。边界报告夹具只证明
工具行为，不是生产语义或时延证据。

两项 CLI/登记联合 GREEN：6/6、退出0、303.905158 ms。
接着 trace-on 反例先 RED：0/1、退出1，223.582952 ms；未单列 attribution
样本。最小实现将 trace mode 加入身份分组，全部样本保留为 requests，
但 productRequests/attributionRequests 分列；trace-on 仅归因分布，不填
产品 observedLatencyMs，不认证最终 latency。

trace-on 加入后联合7/7 GREEN，退出0，389.219018 ms。下个独立反例把
equal=true 与非空 missing 列表同时送入 CLI，先0/1 RED、退出1、
285.457588 ms：错误地只判 BLOCKED。最小实现检查全部现有 exact diff/
duplicate/invalid 列表，矛盾的成功标记也为 correctness FAIL，仍留在分母。

上述工具与原产品门禁/登记联合16/16 GREEN，退出0，1053.347634 ms。
范围/门槛反例再先 RED：删除 Linux 即被接受，0/1、退出1、
226.741848 ms。最小合同校验保护原核心能力、全部8桶/3平台/6门禁及
独立环境项，固定500ms、100请求/5会话、100循环和原内存目标；
不因修改 matrix 文件而缩减产品要求。

最终当前focused：`node --test tests/semantic-release-matrix-cli.test.mjs
tests/test-layer-manifest.test.mjs tests/product-gate.test.mjs`，17/17 PASS、
退出0、1021.495228ms，无fail/cancel/skip/todo。此前独立类型/构建退出0，
git diff --check退出0；新增脚本181行、测试148行，修改登记301/345行。
这是当前工具回归，不借用L07 whole1511宣称新的完整check:fast。
三个新增文档本地链接全部实际存在。当前两真实进程30请求、配对全部
payload/最新诊断/pins和终态不变由独立analysis逐项复核，不由fixture认证。

## 2026-10-11 本机可执行验收：真实receipt与终态失败

父revision仍为1b9101520b0d7d3358e4ce8f27f0bfcc06db902f；继承dirty改动保留。
本轮只改验收合同/工具/测试/文档，不修改生产源码或默认实验开关。
用户确认API24兼容，独立环境项只保留deveco-pss-comparison；
336格、550ms上限/500ms目标、100请求/5会话、100循环及资源目标不减。

所有命令使用/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node。
公开RED以真实名称过滤先执行，过滤项不算整体通过：

- node --test --test-name-pattern='authorized compatible SDK' tests/semantic-release-matrix-cli.test.mjs：
  RED退出1/252.184254ms，L08_MATRIX_CONTRACT_DRIFT、CLI2而非1；
  最小同步授权兼容合同，随后该入口10/10 GREEN/1224.901719ms。
- node --test --test-name-pattern='final release matrix consumes actual' tests/prepared-suite-semantic-readiness.test.mjs：
  真实生产child stdio proof被错误BLOCKED，RED退出1/2392.005117ms；
  最小消费者逐项验证root/backend/完整覆盖/代际/输入/快照/后置pins，
  不再只读verified/PASS标签；两样本仍因100/5不足而latency BLOCKED。
- node --test --test-name-pattern='certifies immediate body edits' tests/prepared-suite-semantic-readiness.test.mjs：
  新编辑receipt被错误BLOCKED，RED退出1/2730.721605ms；
  记录实际发送overlay的path/version/text摘要并独立核验，不改计时、
  不预跑目标，不以旧generation或不同overlay认证新请求。
- node --test --test-name-pattern='recorded Windows path convention' tests/semantic-release-matrix-cli.test.mjs：
  RED退出1/117.059504ms，host路径解释false而非true；
  Context7核对Node20的pathToFileURL windows选项后，按报告平台解释路径。
  这只是归档解析fixture，不是Windows实机产品证明。
- 同一Windows解析特征加入成对缺失backend字段的反例，先实际RED
  退出1/124.335959ms；禁止undefined==undefined冒充相同backend身份，
  最小要求非空packageVersion和实际compiler hash。
  其它缺proof/旧origin/coverage漂移/postflight漂移/错overlay反例首次
  GREEN如实记录，不伪造RED。5真实生产fixture child×20 definition观测
  证明工具识别100/5分母，但不代替真实工程或整336格毕业。

最终联合命令：node --test tests/semantic-release-matrix-cli.test.mjs
tests/prepared-suite-semantic-readiness.test.mjs；23/23、退出0、
33239.940427ms，零fail/cancel/skip/todo。新增consumer70行，
readiness85、CLI189、producer459、prepared测试482、matrix测试274；
未增长/修改既有超500行生产文件，继承迁移债不在本轮消失。

首个whole因发现成对缺失backend守卫漏洞而在修复前明确中断，
退出130/INTERRUPTED、无完整统计；不计PASS。漏洞修复后冻结第二轮：
env PATH=/Users/liuhui/.nvm/versions/node/v20.19.5/bin:$PATH pnpm check:fast。
完整1580项、1579 PASS/1 FAIL、根退出1、2504452.298559ms、
零cancel/skip/todo。唯一失败为references-completeness的403文件
rewritten struct用例：response 4、includeDeclaration=true、原20秒超时。
之后原名称过滤隔离1/1 PASS、2项过滤、28280.212168ms；
没有改timeout，不覆盖whole FAIL，未声称已确认或修复根因。
第5段观察输出截断保留，根完整统计不是逐字完整stdout声明。

后续全部串行执行，不和whole并发：
5独立真实会话各44请求，共220/220 exact/诊断/正常退出/不变pins；
同身份rename/incoming各100重复样本，P95分别365.554482/
763.936785ms，incoming98/100>550ms。真实ready仍FAIL，所以它们仅
开发控制，不认证正式ready/SLO，不重标历史失败。

legacy+选定内存开关soak：107计划/102执行；11 COMPLETE、91 ERROR，
100编辑中9完整/91原-32803预算拒绝，5压力场景因缺前置完整快照未执行。
选定完整indexed开关soak：107计划/103执行；102 COMPLETE、1 ERROR。
100编辑100完整exact、P95=5557.791796ms；首轮构造器查询预算拒绝，
267 oracle位置没有结果；5次L3均applied，1次观察驱逐并恢复exact、
4次EVICTION_NOT_OBSERVED而未测恢复。两个report均FAIL而launcher退出0，
不把工具正常退出当成门禁通过。trace-on全部只作归因。
legacy峰值1896562688/静置1632247808 bytes（60点）；
indexed峰值1288159232/静置440610816 bytes（68点），均10秒/resident=0；
不冒充PSS或同策略性能改善。

原macOS 3cold/10warm/5stress流程：默认10k及同一选定开关10k/100k
三次独立调用均在L3后completion返回-32603、Semantic worker restart
required，退出1；无完整资源报告，不补造缩放比例或18-run PASS。

全部7 prepared报告进入最终矩阵：336格中8有观测、424格内请求，
220产品/204归因；额外压力专用桶1条保持原分类。CLI1/FAIL、
releaseEligible=false。retainedCapabilityRegression接口未接whole导入，
仍NOT_RUN占位；本轮实际whole FAIL在独立state明确，不用占位覆盖失败。

在写文档前两次后置核验均保持11组向量全等，包含1586仓库输入、
179登记/172fast、5产物/20harness、固定工程/SDK/Node与本地main引用。
两个fixture全部10006/100007文件字节/路径摘要也全等。
.bench/l08-local-acceptance-v2-current-state.json索引原始报告与SHA；
.bench/l08-local-acceptance-v2-matrix.json为实际消费结果。
临时64行launcher已归档并移除；无生产探针、SDK/工程写入或外部服务启动。
本机执行批次已收尾，L08仍IN_PROGRESS/FAIL，未合main。
