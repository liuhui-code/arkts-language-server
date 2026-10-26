# Worker 状态机第二轮边界验证

日期：2026-10-24。延续[第一轮自审](2026-10-24-state-machine-completeness-and-tdd-audit.md)。
本轮完善测试和具体方案，**没有实施产品修复、部署 Windows 或合并**。

## 结果

最终正式原包诊断：**22 项，10 PASS、12 FAIL、0 skip/cancel/todo，退出 1**。
12 个失败不是 12 个独立根因：8 个属于重放丢更新，3 个属于清算自身失败，1 个属于额外注入的终止失败防护边界。
只补 URI 相等的隔离生成包：**13 项重放/模型用例全部 PASS**。
测试层清单检查 **4/4 PASS**；未重新运行整套 pnpm check:fast，不将已知 RED 诊断纳入绿色验收计数。

| 场景 | 当前原包 | 关键事实 |
| --- | --- | --- |
| 两文件在恢复快照后更新 | RED | Main 新版本丢失，连续定义为空，准备仍 READY |
| A→B→A，最后查询 A | RED | A 版本正确，B 更新丢失；连续两次非空结果却指向 B 旧范围，READY |
| 快照后关闭重开、版本重置为 1 | GREEN | 精确定位新打开内容中的目标，重复查询一致 |
| 快照前关闭重开、版本重置为 1 | GREEN | 确认新 Worker 尚未分配时提交事件，最终精确结果正确 |
| 重放时关闭未保存文档 | GREEN | 查询正确回到磁盘内容，未沿用旧未保存文本 |
| 恢复时切换 SDK | GREEN | 精确定位到新 SDK 的声明文件/范围，SDK 输入证明变化 |
| checker 暂挂期间配置改为无效 SDK | GREEN | 重叠准备 -32801，随后 degraded，恢复配置后 READY |
| 部分初始化失败，无 release 异常 | GREEN | 同版本重试 READY，最终项目 refs 0，共享 SDK pin 保留 |
| release 在实际生效前抛错 | RED | 同输入重试三次 -32803；同 SDK 重建后余额 5，退休后仍 2 |
| release 实际生效后抛错 | RED | 被释放项 refs 1→0；同 SDK 重建后余额 4，退休后仍 1 |
| 真实客户端取消＋release 生效后抛错 | RED | 调用方一次 -32800，清算异常真实发生；三次重试 -32803，最终仍 2 份项目余额 |
| terminate 在生效前拒绝，随后输入变化 | RED，防御性故障 | 没有旧 Worker exit 就创建新 Worker，峰值 2；查询甚至能成功 |
| 确认 Worker exit 后再报告终止错误 | GREEN，防御性对照 | 后续探测可用，峰值 1 |
| terminate Promise 持续 pending，等待者取消 | GREEN | 调用方一次 -32800，退出前没有新 Worker，解除暂停后正确恢复 |

此外穷举两文件三次编辑：AAA、AAB、ABA、ABB、BAA、BAB、BBA、BBB。
原包只有 AAA/BBB 通过，六个混合顺序均失败；URI 隔离对照全部通过。
模型从客户端已接受的完整文本/版本计算期望位置，未复用产品日志合并或候选选择逻辑。
A 编辑加入 CRLF，B 编辑加入非 BMP 字符的行内注释；使用 JavaScript 字符串的 UTF-16 单元计算精确查询与目标范围。
这是该有界集合的穷举，不是任意事件序列、所有 Windows 路径或编译器失败的形式化证明。

## 环境和输入

- HEAD `e35459131366a32c48c10d1d74adef74357cd3dc`，分支 `fix/windows-path-identity-20261022`，保留全部已有 dirty 工作。
- macOS 26.6.2 / 25G83、Node v20.19.5（x64）、实际安装 compiler `4.9.5-r10`。
- compiler SHA256 `af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`。
- 正式 server SHA256 `9b6bc5babc2196d80e1e12191240fbe1d37841478c87af772bdf018a66b9eb67`。
- 正式 semantic Worker SHA256 `1a751730f41463e46a028c5d8b54220f04fbc675b7af3b57ad74250457c73635`。
- 772 项原有输入与四个主要正式运行包维持前轮字节；本轮新增八个诊断测试/支持/fixture 文件，独立冻结前后清单。
- 临时最小 SDK：API 24 元数据、1 个 SDK 声明、52 个标准库；项目 2 文件，清算场景额外增加 Spare。
  SDK 切换场景使用两个独立最小 SDK 壳。不是完整 SDK、Photos、2 万文件或 Windows 真机运行。

每项通过真实子进程 Content-Length stdio，串行执行。原始请求保留具体全文编辑、文档版本、符号、位置、顺序和前置状态。
测试使用显式缩短的请求/修改/取消保护预算，受控暂停有单独进入与释放证据。记录的时长是诊断操作时长，不能当作默认 500ms 性能验收。
Registry 份数不换算为内存字节；本轮未测 AST WeakRef、GC 或 RSS 回落，Worker 的共享进程 RSS 不按线程求和。

## 新鲜度反例：非空结果同样可能是错的

原包 `dependency-overlay-aba`：打开 Main/Unopened v1，触发 Main v2 的 mutation ACK 暂挂。
替换 Worker 在快照后启动暂停，再依次交付 Main v3、Unopened v2、Main v4。
Unopened v2 在函数前加一行注释；Main 最终版本只加注释，仍调用 neverQueried。

查询 Main LSP `(2,23)`。正确声明范围是 Unopened `(1,16)–(1,28)`；实际连续两次返回 `(0,16)–(0,28)`，期间准备 READY。
重放发送记录只有最后 Main v4 留在队列，Unopened 仍是快照 v1。
`SemanticWorkerRecycle.defer` 的 root-only 合并丢失依赖更新；查询源版本检查只核对 Main v4，无法发现 B 丢失。
所以测试必须检验目标范围/文本及相关输入，不能仅断言“非空”“同 URI”“没有错误”或 READY。

调用链与首轮一致：`run-language-server.ts:288` → `semantic-worker-proxy.ts:174` →
`semantic-worker-mutation-tracker.ts:21` → `semantic-worker-recycle.ts:106/142` → `semantic-worker-host.ts:109`。
这仍是同一个日志合并缺陷，不把八种失败重复计成八个根因。

## 清算副作用和调用方取消必须分开

本轮新 fixture 在 Registry 的 acquire 路径记录实际项目 canonical key；不再另造 release 路径判断。
before/after 模式都断言 fault 已消耗，并保存实际 key、线程、原始 refs 前后值。
after 样本明确记录被释放项 refs 从 1 降为 0，再抛出异常，owner 账本尚未来得及扣减。

| 最终原包清算样本 | 初始异常后项目 refs | 同 SDK 重建后 | 再退休当前 owner 后 |
| --- | --- | --- | --- |
| 无 release 异常 | 0 | 3 | 0 |
| release 生效前异常 | 2 | 5 | 2 |
| release 生效后异常 | 1 | 4 | 1 |
| 真实取消叠加生效后异常 | 2 | 未单独采样 | 2 |

取消样本的具体余额以该轮原始计数为准，不能把普通 after 样本的 1 份机械外推到取消路径。
所有最终当前 owner 退休后 SDK refs 均为 1，是有意保留的 pin。
同 SDK 配置重建可以恢复公开查询，却不能清掉旧 owner 余额；三个同输入准备重试仍失败。

相关代码：`recoverable-language-service.ts:29` 先清 current，`:39/43` 锁定清算失败；
`owned-document-registry.ts:35/54` 只有成功返回才扣账，循环遇异常停止。
账本不扣减并非应简单“补 decrement”的错误：释放是否已生效确实可能不确定，强行重试可双 release。

取消样本还揭示方案的重要约束：`semantic-worker-runtime.ts:270` 优先选择 client-cancelled，
`RootSemanticWorkerSupervisor.#settleRequest` 在 `:664` 先按 cancelCell 结算，再看 response.error。
**仅把清算错误映射成 restart-required 仍可能被调用方取消覆盖，不能据此认为已通知监督恢复。**
采用独立于请求终态的内部故障通知，并在 Worker 内停止污染域的进一步准入，才是完整修复边界。
客户端仍保留一次正常取消响应，资源退休责任由监督者另行持有。

## 退出未知的防御性故障

Node 官方[20.19.5 Worker 文档](https://nodejs.org/download/release/v20.19.5/docs/api/worker_threads.html#workerterminate)规定 terminate Promise 在 exit 事件时兑现。
本机对应内置源码亦为 stopThread 后注册 exit resolver，已经退出时直接 resolve；没有普通 Promise reject 分支。
Context7 本轮 resolve 因 HTTP transport 失败，改用官方文档和本机固定版本内置源码，证据为 `research.json` 与 `node-v20.19.5-internal-worker.js`。
因此不能把注入的 before/after 拒绝说成 Node 自然缺陷或 Windows 原因。

额外故障模型仍暴露所有权问题：`semantic-worker-host.ts:155` 在退休前清 #worker，
`:168` 的 finally 在任何结果下清 #retiring；terminate 生效前异常时旧 Worker 没退出。
恢复 catch 再 retire 只看到空 #worker，后续输入变化解锁半开，继而分配第二者。
这是在该故障模型下确认的保护缺口，不能凭当前“只创建一个 #worker 字段”证明进程里只有一个实际线程。

`terminate-before-effect` 在测试清理前保存 active=2、peak=2、两条 created 且无 exit。
之后由预加载器的**测试兜底清理**实际终止旧孤儿，记录 `audit-forced-orphan-cleanup`；不能把这个 exit 记成产品成功回收。
其余正常/待退出场景没有使用该兜底。确认 exit 后再报错的对照与 pending 期间真实取消都保持峰值 1。

方案需要保留旧句柄和退出监听，区分 pending、失败但已退出、失败且退出未知。
可以按同一共享预算重试停止原句柄，不能以新输入替代 exit 证明并直接创建新者。
native 永不返回、OOM 或进程 abort 仍未由这些受控测试证明。

## 完整方案、测试入口与剩余范围

具体状态、owner、转移、内部故障通知、预算、TDD 和回滚边界已整理为
[恢复状态合同](../plans/2026-10-24-worker-recovery-state-contract.md)。
优先 S1 保留各文档输入；S2 把未结清 owner 与独立监督升级一起完成；S3 处理退出不确定的保守防护。
已有 GREEN 的配置取消/SDK重放/关闭重开分支继续保留，不因新增两个状态就重写全部调度。

新增用例在 `tests/audits/*.audit.mjs`，支持在 `tests/support/worker-recovery-audit.mjs`，故障仅在两个独立 audit fixture。
执行说明见 [诊断套件说明](../../tests/audits/README.md)。这是显式执行、包含已知 RED 的审查套件，未接入默认 fast；无 skip/todo 伪装通过。
后续修复时按切片将已确认反例纳入正式 `.test.mjs` 和测试层清单，再跑最终完整检查。

证据根：`.bench/state-machine-boundaries-20261024/`。

- `current-final.tap` / `current-final/<场景>/`：22 项最终原包测试、逐次响应和原始记录。
- `same-uri-final.tap` / `same-uri-final/<场景>/`：13 项 URI 隔离对照。
- `manifest-final.tap`：4 项测试层清单检查。
- `final-results.json`：完整命令、环境、实际退出码、计数及起止 UTC。
- 各场景 `wire.jsonl`、`audit-worker.ndjson`、`report.json`、完整 logs 和清算/暂停标记。
- `start.json`、`final-audit-files-before.json`、`verification.json`：原有输入和新测试的字节核验。

前轮 30/30 恢复回归以未变的 772 项输入复用，不称本轮重新执行；完整旧 1984/1984 同样不是本轮检查结果。
没有测试 Windows 真机、Photos/完整 SDK、长期资源增长、自然 terminate 失败、任意事件序列、所有 Registry key 类型和时钟回拨。
500ms、规模增长、缓存优化 TODO 和自然 degraded 继续保留；455 文件冷目录 3 秒门槛按既有授权排除。
