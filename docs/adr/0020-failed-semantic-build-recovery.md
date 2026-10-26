# ADR 0020：失败语义构建的恢复与资源所有权

- 日期：2026-10-23。
- 状态：Accepted，工作区实现与回归完成；尚未提交、合并或发布。
- 父版本：`e35459131366a32c48c10d1d74adef74357cd3dc`，保留当前未提交的Windows路径修复。
- 依据：[运行根因](../reports/2026-10-23-degraded-initialization-recovery-and-lifetime.md)、
  [官方实现调研](../reports/2026-10-23-degraded-recovery-industry-research.md)。

2026-10-25：[ADR0023](0023-completion-cancellation-and-synchronization.md)细化取消边界。
已开始的原地 Program 同步暂缓合作取消，成功提交后的取消不退役健康 LS；
真实同步异常仍执行本 ADR 的清算，父线程原有取消宽限/执行截止与恢复预算保持不变。

## 问题

固定ohos-typescript在Program交付前提交lastProjectVersion；构建抛错/取消后，同版本重试可能跳过构建。
Registry已经取得的文件租约又不在已安装Program内，正常dispose无法全部归还。
同SDK重建能恢复可用性但不能清掉旧租约。致命Worker退出则有终态围栏，但缺少该入口的会话内恢复。

## 决定

1. 保持权威输入、构建尝试与成功证明的区别。失败不能成为成功复用；同版本后续显式准备可以重试。
   自然缺依赖的degraded不是系统构建异常，保留合法Program；prepare:false仍不主动构建。
2. 在固定编译器适配层为每个LS建立独立Registry租约所有权。按编译器完整key记份数，
   acquire成功即登记，release成功才扣除；SDK域额外pin与其他owner的租约不归该LS结算。
   观察回调异常不得遮蔽已经发生的acquire。
3. 在明确的Program同步边界处理失败：正常dispose已安装Program，再结清该LS余额、撤销证明，
   退休损坏LS；后续调用建立干净LS，继续使用当前Host输入及兼容共享SDK。
   同版本重试与租约清算作为一个完整修复切片，不单独上线只推进版本的绕过。
4. 普通查询在Program成功同步后的取消只结束请求，不一律销毁健康LS。
   取消请求仍只有一个终态，不能自动重放该请求并二次回包。配置、输入终检及完整答案合同不变。
5. 致命退出、父线程执行/排队截止、不能完成的取消和mutation restart-required共用一个物理Worker恢复约束。
   旧endpoint失效，等待旧Worker实际退出后才创建新Worker，以新epoch重放父线程最新roots/配置/SDK/未保存文档。
   每180秒最多3次恢复，另有“新权威输入上的成功语义操作之前最多3次自动恢复”的累计限制；
   只过去一个时间窗口、收到ACK、prepare:false、跳过构建或同输入的成功查询都不能重置累计计数。
   采用250/500/1000ms退避；恢复中再次故障则回收替换者并熔断，不递归重启。
   熔断也必须回收卡住Worker。输入重放队列复用32条/4MiB文档文本边界和独立文件事件条数校验，
   合并相邻同文件全文更新，溢出显式停止；4MiB不是全部元数据或进程RSS上限。
   熔断后保留权威输入；实际文档/文件或配置变化后，显式准备或前台语义操作可以发起一次半开探测，
   仍消耗180秒频率预算。相同配置及其空rootDirty通知、只读状态、后台诊断不解锁。
   探测失败立即回到熔断；实际同步且有效成功的响应才恢复健康，不要求永久重启客户端，也不新增公共强制解除接口。
   普通degraded或能够合作完成的取消不触发整Worker替换。
   已完成初始化的根跨Worker保留豁免已消费状态，不因重启再次豁免运行期压力。
   recovery.complete仅表示输入重放完成；后续准备/查询仍须实际构建并认证，不能由该日志宣称READY。
6. 正常路径继续复用LS/Program/AST；不清空共享Registry，不改文件名大小写/身份核验，
   不改引用缓存新鲜度，不重启暂停的索引路线。455文件冷目录3秒性能门槛沿用用户授权跳过。

## 边界与替代方案

修订ADR 0016/0019中“失败后dispose已足够”的实现假设，不修改共享SDK、稳定组、压力与语义覆盖决定。
首选适配层隔离，避免直接补丁固定compiler的热更新、换kind、checker及旧Program事务。
compiler内部事务补丁保留为以后独立方案，不与本轮叠加两套回滚。
资源清算失败必须显式失败，不能继续复用所有权不明的LS或吞掉错误冒充READY。

## 验证与风险

采用真实子进程、Content-Length stdio的RED→GREEN切片；故障/暂停只在测试预加载器中注入。
覆盖同版本重试、连续失败、失败后关闭、真实取消、成功构建对照、配置/SDK替换、热更新、
共享域其他owner、post-build取消，以及致命退出后的overlay重放和重启上限。
租约计数是辅助生命周期证据，不拿私有调用代替公开LSP结果。
防范双release、update误计新增、误释放pins、旧epoch发布和关闭/恢复竞态。
执行记录见[修复TDD记录](../tdd/degraded-build-recovery-20261023.md)；不以本决策宣称500ms或规模成本已解决。

2026-10-23前轮候选在Node 20.19.5下完整`pnpm check:fast`为1969/1969 PASS（零skip/cancel/todo），
Windows 10真机的新增公开LSP回归为15/15 PASS；138个运行时/测试输入指纹与Mac一致。
独立故障/取消诊断在清算检查点确认项目Registry余额与被跟踪项目AST均归零，
成功Program正常持有的租约和共享SDK pin不计为泄漏。未以RSS即时下降作为验收依据，
未重做2万文件、真实完整SDK、OOM/native abort或长期压力验证。

2026-10-24修订：此前“熔断后须重启会话”策略由上述受约束半开探测替代。
[补充诊断](../reports/2026-10-24-definition-stall-and-worker-lifetime.md)是修复前证据；
[监督实现与验证](../reports/2026-10-24-worker-supervision-recovery.md)记录本次补齐的活性边界。
未被阻塞的父线程守护协作取消与截止时间，必要时调用Node Worker.terminate并等待exit。
排队和执行分开计时；取消排队请求可结束调用方等待，不因它单独终止别的根正在执行的工作。
底层命令仍保有所有权和截止时间，未结清之前不宣称quiescent，不自动重放原请求，不二次回包。
调用方在等待共享恢复的admission Promise时同样可取消；它只停止自身等待，共享输入重放仍由监督端拥有。

观测使用小型SharedArrayBuffer记录实际固定编译器createProgram、createTypeChecker的进入与正常返回，
另记LS同步与semantic-query阶段。构建时只添加精确签名的观测包装，已安装compiler文件不变；
签名不匹配则构建失败，记录原文件与变换SHA。Program返回、checker返回、LS同步完成、READY各不等同。
不能再用hasObserved=false推断卡在createProgram前；后续checker内部细分仍未测。
来源与边界见实现报告：tsserver和rust-analyzer提供协作取消，clangd明确失败/取消与AST归还，
VS Code提供宿主监督与受限重启，Node提供终止isolate的实际机制；不复制其他系统的缓存/陈旧答案语义。
任意不可中断native调用、进程级OOM/abort、无限循环原现场及长期内存压力不由这些回归证明。


2026-10-24最终v8验收：完整`pnpm check:fast` **1984/1984 PASS**，零fail/skip/cancel/todo，正常退出0；
焦点合跑73/73，Windows公开回归50/50。772项源码、76项正式生产产物检查前后SHA一致。
原83项目录清单含测试生成物；SDK测试driver在测试时重建的一项差异已保留，不声称全部83项一致。
Mac10条、Windows11条串行命令全部成功，受控故障中旧Worker退出后才建新者，物理语义Worker峰值1、关闭后0。
实际失败初始化/连续异常/构建取消后项目Registry租约归零，同Host版本可重试；SDK pin和其他owner保留。
此外扩大验证修复了Windows整文件调用项的原生路径边界和失败测试的关闭顺序，精确名称、URI、范围和新鲜度检查保留。
普通Windows定义仍10/45超过500ms、最大945.485ms，真实Photos故障恢复后首个定义约7.57s；
自然项目仍因缺声明degraded，原现场无限循环、2万文件、native/OOM隔离与长期增长仍未证明。
455冷目录门槛按用户授权未执行；缓存性能TODO暂停，不发布/合并。完整数据和封存入口见[最终实现报告](../reports/2026-10-24-worker-supervision-recovery.md#最终验收与封存)。

2026-10-24状态机与TDD自审补证：原恢复用例30/30 PASS不能证明所有转移已闭环。
[自审报告](../reports/2026-10-24-state-machine-completeness-and-tdd-audit.md)在原v8包上新增两个公开LSP反例：
恢复日志只比较root而漏比较URI，跨文件编辑可丢失，后续仍可报告READY；
Registry清算自身抛错后，旧LS被锁定但退休owner未持久保存，同SDK配置重建可READY而旧项目租约仍有余额。
两处均标为未解决；仅隔离生成包做因果对照，未修改产品源码或正式运行包。
本决策关于最新权威输入、清算失败不得复用不明所有权和受约束物理恢复的要求仍有效，现实现尚未完全满足。
后续须先补对应RED再最小修复，并覆盖多文件交错、清算异常、关闭与退休失败；不能以旧全量PASS宣称完备。

2026-10-24第二轮边界自审：新增仓库内独立诊断套件，原包22项为10 PASS/12 FAIL，零skip；
失败归为重放丢更新、清算异常未闭环及额外注入的终止失败保护边界。只补URI条件的隔离包13项重放/模型全过。
A→B→A证明同一重放缺陷还能发布非空的旧依赖范围；release生效后异常及真实取消叠加证明，
不能盲重试release，也不能仅靠请求错误通知资源故障。退出未知时应保留退休句柄，不能用新输入绕过exit条件。
Node正常terminate Promise以exit完成；拒绝故障系防御性模型，不称自然Node/Windows缺陷。
[补证报告](../reports/2026-10-24-state-machine-boundary-validation.md)和[具体状态合同](../plans/2026-10-24-worker-recovery-state-contract.md)
记录已有效的转移、仍未闭环的条件及逐片TDD；本轮仍未实施产品修复或合并。


2026-10-24 状态合同实施补充：重放仅合并同 root/URI 相邻更新；LS 用 live/empty/retiring/quarantined/disposed
承载 owner 生命周期。release 结果不确定后禁止重复 release，保留失败 owner，并通过版本化、有界、独立于请求终态的
Worker fault 通知进入原共享恢复预算；不能被 -32800 掩盖，也不能通过配置创建新 facade 复用污染 isolate。
物理退休保留 handle、exit 见证、共享任务和错误；未知 exit 时不创建替代者，预算内仅重试同句柄，关闭不会重建。
shutdown 的 LS dispose 抛错不跳过后续 verifier 收尾；半开探测在入口和真正发送前都隔离后台诊断/只读状态，
防止后台任务抢先占据前台探测。普通缺输入的 degraded、可合作局部重试、正常 READY 诊断和健康 Program 取消仍沿原合同。
初轮扩大回归 82/83 后修复半开准入；同一候选重跑 **83/83 PASS，零 skip/cancel/todo**。
最终全量和 Mac/Windows 实测结果以 [实施报告](../reports/2026-10-24-worker-state-contract-implementation.md) 的实际完成记录为准，
不沿用旧 v8 全量结果作为新候选通过证明；本轮不合并或发布，缓存性能 TODO 继续暂缓。

2026-10-24 状态合同最终验收：同一冻结候选完整 `pnpm check:fast` **2016/2016 PASS**，零 fail/cancel/skip/todo，正常退出 0；
Mac 焦点 84/84、Windows 最终公开补验 116/116，Rust 路径合同 1/1。全量前后 919 项源码/测试、4 项配置、1 项构建配置和 76 项生产产物 SHA 一致；
SDK discovery 的测试生成物重建独立记录。清算自身失败的 owner 保留、独立故障监督、同句柄受限退休重试和多文档精确重放已由公开转移回归验证。
Mac/Windows Photos 受控同步不返回＋真实取消中，旧 Worker exit 后才创建替代者，语义 Worker 峰值 1、关闭后 0；
普通轮没有 Worker 重建，Windows 仍 4/45 次定义超过 500ms、最大 552.525ms；恢复后冷查询仍约 4.99s/7.77s。
真实 Photos 仍自然 degraded，原 Windows 无限循环未自然复现；2 万文件规模、native/OOM、长期压力和缓存性能仍未闭环。
前轮 RED 及三轮中止/失败的全量记录保留，不据最终 GREEN 追认它们通过。455 冷目录门槛按用户授权未执行；无提交/合并/发布。
最终身份、命令、原始数据及限制以 [本轮实施报告](../reports/2026-10-24-worker-state-contract-implementation.md) 为准。
