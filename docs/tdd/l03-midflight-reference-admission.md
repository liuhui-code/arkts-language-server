# L03 在途压力与 verifier 准入

日期 2026-10-08。接续 [references 压力准入](l03-reference-pressure-admission.md)，
本切片把既有默认关闭的 L3 停止线延伸到请求执行期间：已启动的
verifier 可以完成和清理，但遇到 L3 后不再追加验证；若尚未证明
完整范围，返回显式预算错误而不是部分 Locations。L03 仍 IN_PROGRESS，
统一字节预算和最终资源、时延、soak 验收没有完成，最终门禁仍在 L08。

## 公开 RED 与最小修复

父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`，父源码输入
`aac45b734d1ce30284130d3e86a94f37457b101e4730e41b35e0551d549b7a98`。
旧实现只在进入 references 时判断 L3；初始 L3 才向计划传入固定 `maxBatches=1`。
请求开始后升级到 L3，不会影响已经持有该快照的 executor。

新增真实 Content-Length LSP 子进程用例：三个合法文件的夹具先发布
当前文档的正常 v1 诊断；多批计划的第一批开始后发送公开 L3 control，再取得精确
交互 definition，确认 Worker 已处理控制且 references 仍在途。
旧实现随后继续工作并返回六处完整引用，拒绝断言 RED，**0/1 FAIL**，
4,887.850679 ms。旧结果的位置是正确的，缺口是执行保护，不冒称
compiler 语义错误、SDK 初始化失败或返回部分结果。

```sh
node --test --test-name-pattern='in-flight L3 transition' \
  tests/semantic/semantic-l3-reference-admission.test.mjs
```

原始 `.bench/l03-midflight-admission-red.log`；初始单用例首次修复
**1/1 PASS**，7,005.589789 ms，`.bench/l03-midflight-admission-first-green.log`。
随后才追加其它控制和 v2 新引用，不把后加的 characterization 伪造为 RED。

## 请求内见证与完整范围

沿用原 `ARKTS_BENCHMARK_CONTROL=1` 与
`ARKTS_L01_PRESSURE_ADMISSION=1`，不新增开关、预算 owner、缓存或
并发额度。Registry 只用常量空间的 generation counter 记录进入 L3；每条
references 捕获当前值，并用一个请求内的准入 closure 记录是否已
启动验证。之后即使 RSS sample 恢复到较低级别，本请求仍保留正的
L3 见证，不因 interval 更新而漏掉停止线。新请求重新捕获见证，
不是永久冻结后续查询；如果新请求仍在 L3，原计划限批规则照常执行。

Executor 在启动后续批次前检查该 closure；已有 semantic-unit 扩展
重试、anchor 退回完整 scope 和 constructor/source 复核的递归 fallback
也传递同一 closure，不重新获得许可。取消 checkpoint 先于预算拒绝。
禁止追加验证时返回 `resource-budget-exceeded`，公开为 `-32803`，
不发布空成功或已收集的部分 Locations，不写入部分成功缓存。
trace 的 `admissionPhase` 区分计划拒绝和 verifier 准入拒绝。

这不主动终止已经运行的 verifier，也不把遇到 L3 当成完整结果无效。
已完成验证若证明完整搜索范围、无需更多工作，仍可正常返回成功。
原 L3 初始限批、lease、官方 compiler 权威、最新快照与正常诊断保持。
关闭开关的功能对照不意味着新旧二进制字节相同或已证明资源无回归。

## 公开控制与最新编辑

五用例串行 **5/5 PASS**，50,737.782264 ms。batched 和 indexed-batched
均只启动并完成第一批，其中已有正的 Locations，但在追加验证前
返回预算错误；关闭 pressure opt-in 仍执行完整多批并返回精确六处。
客户端取消保持 `-32800`，不被改成预算错误，取消后完整恢复。
单批已证明完整范围时，即使期间收到 L3，也正常返回六处引用。

所有控制都验证新请求返回完整六处，而不是被旧见证阻塞或命中
部分缓存。未保存 v2 新增调用后，正常版本化 2304 诊断仍发布；
`includeDeclaration=false` 精确返回六处使用位置，覆盖两种声明策略。
emoji 后的 declaration 为 UTF-16 22–32，交互定位准确；shutdown
退出 0，无 Worker fatal。

此次在途升级使用显式公开 L3 control，并由交互响应建立处理见证，
不是自然 RSS 峰值的实测归因。1024 MiB 策略值没有改变；既有
1,500 ms verifier delay 和 batch roots 1 仅作功能干预，不能作产品
时延或字节成本测量。夹具 SDK version 为 `test`，属于未验证的
plain-TypeScript-compatible 合同，不冒称原生 API24 毕业。

## 当前验证与后续实施

`pnpm check` 和 `pnpm build` PASS；十一文件串行 focused
**103/103 PASS**，0 fail/cancel/skip/todo，退出 0，454,507.318171 ms。
包括十三个压力/诊断用例、批处理与保守 semantic units、完整覆盖与
constructor exclusions、合并取消、交互调度、resident references、
十六个 Worker 回收用例、Coordinator lease/压力和 production Worker。
完整转录 `.bench/l03-midflight-admission-focused.log`；逐步计数、命令、
构建身份和测试哈希见 `.bench/l03-midflight-admission-summary.json`。

当前源码输入
`979ac4f5aab5a9fec794f8d4dd1e0ebb239e96e3ef8adf84225cd4bb7965be2c`，
semantic Worker
`767cfa1a5995f9089759e8e085213ac7b31fce99f9e2ca8cdc5cf021fc06cfee`。
server 主产物未变；focused 前后源码、产物、Settings 输入和 SDK
指纹一致。type engine 473 行、executor 461 行、测试 451 行，均不超过
500；本切片未修改既有超限文件。

当前源码 whole **NOT_RUN**，不沿用旧多根检查点 1380/1380；合并前
仍须 fresh `pnpm check:fast`。真实工程在途压力 A/B 尚未运行，不宣称
内存或时延收益。单个已启动 Program 的峰值、candidate/anchor 准备、
诊断重叠、统一 resident/transient 字节核算、soft budget 与其它压力
分支组合继续在 L03 实施；默认关闭的 L04–L07 不被最终目标阻塞。
