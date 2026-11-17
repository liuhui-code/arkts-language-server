# 默认索引维护及No-op新鲜度：IX-03/04实施片

2026-11-05；parent `298d65f5d7f796c347fe8be5c739e428066489d8`。
独立工作树 `/private/tmp/arkts-index-versioned-maintenance-20261104`；未提交、部署或合并。
ADR0043仍Proposed。此文接续[前置协议报告](2026-11-05-index-node-protocol-bridge.md)，不覆盖其历史RED。

## 已接通的实际链路

生产composition → SidecarWorkspaceIndex.open → negotiateMaintenance → initialize能力应答
→ VersionedMaintenance.start → maintenance/start → Native单owner/parser/writer → 完整终态。
查询由SidecarSession.request分流至versioned.read → 带input/requestToken的独立reader
→ 同data快照结果和资格 → epoch/token/物理库/域/head/输入校验 → 原业务mapper。
Native不支持新字段时，只有typed initialize invalid_params允许一次旧初始化兼容重试；
合法不确认能力的应答仍走旧LegacyCatalogs，IO/身份/坏协议不得自动降级。

`maintenance-events.ts`先验证事件形状，`versioned-maintenance.ts`绑定实际任务及生产者域；
能力确认前维护事件现在是协议失败，而非静默丢弃。前ACK最多保留一个最新进度和一个终态。
终态不能因随后ACK再次结算；取消使用任务身份，期限从发送取消起计算。
独立读取取消只发index/cancel的epoch/id/token，不取得共享维护任务的取消权。
旧输入回复晚到本地拒绝为invalid_generation，不因为它再退役健康session；错epoch则协议退役。
Native返回terminal前资源真正清算的保证仍依赖既有0042/0043所有权实现，局部假进程用例不代替全生命周期。

## 三个本片公开失败及修正

1. 原真实生产framed LSP仍catalog/start：接入后冷128、改单1，写1，新增/旧名删除/未改名都正确。
   `ix03-lsp-wiring-v2.log`首次GREEN；后继`ix03-lsp-count-green.log`还覆盖真实完成提示。
2. 新父端错误假定整attempt计数不回退：Native最终源码fence重新walk从零计数，触发错误退役。
   `ix03-lsp-wiring-v1/{wire.jsonl,lsp-stderr.txt}`保留128→64/0的真实帧与degraded。
   维护协议的计数是当前遍历计数，不是跨遍历全局高水位；任务/合法活动/单一终态才是父端合同。
   后继又真实复现“Indexed 0/128”，`ix03-lsp-count-red-v2.log`。
   现由Native完整终态的indexedDocuments=最终准入集合长度提供完成数，不用parser或写入数猜测。
   第一份count RED误把LSP end当成含message，被记录为测试夹具错误；正确RED看end之前最后report。
3. No-op新资格相同数据head，原0005数字水位仍把它当dirty。
   `ix04-noop-red-v2/noop-qualification-events.json`：input1→2、head都1、写2→0、dataPublished=false，
   随后错误走workspace-changed fallback；公开引用结果仍正确，问题是无法恢复索引资格。
   `ix04-noop-green/`同输入/完整结果校验通过，出现references.index.recovered。
   新dirty恢复只接受绑定本次catalog dirty对象的完整资格，并与当前data read的库/域/head/发行输入/资格ID/指纹相同。
   候选接纳也核对查询与当前状态的完整资格；旧Native无证明时保留原数字水位。
   证明由transport-owned Symbol标注，再由mapper显式传递；Native JSON伪造indexProof字段不能激活新准入分支。

## 原128失败如何保留

`ix00-legacy-final-red.log`再次确认旧raw initialize/catalog/start仍解析128≠1。
`ix00-legacy-baseline-test.rs`原用例完整留存；没有把旧协议效率改写成已修。
实际Node默认已协商，因此原未合并新增Rust回归改为相同协商路径，保留冷解析128/改单解析1及三项结果断言；
增加完整资格/实际文件128/只写1，未删除文件或改预期解析数。
`ix03-default-128-native-green.log`：新默认128与maintenance_protocol完整6项通过。
真正framed LSP也另行覆盖默认选择，不能仅靠改Rust用例的请求方法宣称默认接线完成。
旧二进制兼容fallback仍可能全量重写；没有承诺旧二进制也获新性能收益。

## 验证身份与范围

`ix03-wiring-final-receipt.json`：冻结TS/fixture/script输入，17完整文件109PASS，0FAIL/skip/todo，
84.227s；类型检查及runtime build通过，冻结输入未变。包括旧adapter、错误/取消、现代生命周期11项、
资格合同、库存、服务层、真实生产LSP/Native、No-op及旧production progress/freshness回归。
独立生命周期首次10项GREEN；新增“能力前事件”先公开adapter RED，再11项GREEN。
资格/握手单元合同不是LSP测试；现代NDJSON假进程只证受控交错，不是真实SDK/30K/Windows/UI。
No-op测试使用生成最小SDK与真实编译器/Native，沿readiness harness显式indexed-batched策略/观测设置；
预算未配置，不是默认全负载性能测试。首次误传空内存预算导致配置拒绝，记录为夹具问题，
修正为未传该环境变量，不修改产品阈值/合同。两个真实LSP测试都是协议驱动。

Native新增完整文件数字段后，相关7项GREEN、release通过；当前完整默认Rust workspace/fmt/Clippy
另以`ix03-wiring-rust-receipt.json`记录，完成前不称全量通过。之前228输入全量不覆盖本片协议变化。
本轮新增/修改TS、fixture、test都≤500行；旧Core lib1131/SQLite lib761债仍保留。
新增两个测试入口后库存308；不删除旧用例获得绿色。

复跑先构建runtime/Native；Node具体17文件命令及各退出码均在final receipt，
原始日志根`.bench/index-versioned-maintenance-20261104`，分别保留普通/受控及各次失败。

## 尚未完成

- watch/config入口仍把具体URI压成workspace ID，当前每次start仍完整对账；本片消除未变facts写入，
  **没有证明消除O(N)读取/校验**。下一片先补公开URI/token反例，再接入maintenance/changes与受控后继完整资格。
- 输入观测、变更合并、目录/config不确定性、持续输入公平和更全面ACK/读取消边界仍需整链路组合。
- metadata/资格记录/墓碑回收、partial、完整迁移及混版/Windows等生命周期范围未闭环。
- 最终pnpm check:fast、双配置完整检查、128/2048/20K/30K两种规模、原30K至少两小时及真实UI均未完成。
- 完整引用/重命名、SDK和原UI缺口仍开放；无默认RSS预算、500ms软目标及455冷目录授权保持。

本轮仅在隔离工作树/生成夹具实施；原真实项目、日常安装/缓存/未保存内容未触碰。
