# L05：长驻会话 implementations 的独立公开合同

日期：2026-10-08；父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。
接续 L04 合同，不因其真实工程未热命中或 >500 ms 停止本能力验证。
复用既有完整工程 compiler implementation 路由，不用 references 投影
代替结果，不新增 production flag、能力广告或第二个语义 owner。

## 夹具与 characterization

[公开测试](../../tests/semantic/resident-session-implementations.test.mjs)
通过真实 Content-Length/stdio 子进程执行正常 implementation 请求和
版本化诊断。277 个合法源码超过初始 256 个 resident script；先用不相关
WarmContract implementation 支付完整准备，再打开此前 lazy 的同内容
目标文件。晋升 OFF/ON 都与人工完整 URI/UTF-16 range 集合比较，ON
另见证真实 matching-fingerprint 晋升及 generation 保持。

五类合同分别覆盖：

- 泛型接口、import alias、未打开实现与独立同名接口排除。
- 抽象类的直接/间接继承、方法 override 与泛型成员各自完整集合。
- v2 移除实现并加入 2322 错误，立即请求只返回当前剩余集合；v3
  emoji 前缀恢复实现，立即请求完整新范围，诊断 code/range/version 精确。
- 真实 L3 驱逐后以既有默认关闭 benchmark control 替换 Worker，old/new
  threadId 不同；v2 overlay 重放不复活旧实现，v3 完整恢复并正常诊断/退出。
- 正常 Worker 下立即取消 implementation 得到唯一 `-32800`、无 result，
  后续查询完整恢复；正常退出后没有同 id 第二终态。仅证早期取消，
  不冒称 compiler-in-flight 及时性或重复取消资源门禁已完成。

## 不成立的 RED 与 oracle 纠正

首次泛型用例将预期错误地限定为两个实现类，公开响应另外返回
`ZNumber.ets` 第 0 行 9–24 的 `GenericContract` 导入链接，连续两次 FAIL。
诊断按三种假说检查：compiler alias 链、暖机/晋升污染、URI/range 映射。
无 filler、无暖机的冷公开进程仍复现；固定本地官方 backend 的原始
`getImplementationAtPosition` 也直接返回该 import token 与两个类，
原始 span 本身就是第 0 行 9–24，排除了后两种假说。

package 为 `4.9.5-r10`（runtime ts.version 为 `4.9.5`），使用本地固定
编译器源码/执行结果核对；Context7 用于 API/AST 文档检查，不把其当前
版本当作这个 fork 的等价证据。冷公开输出
`.bench/l05-cold-alias-red.log`，独立诊断 probe
`.bench/l05-pinned-implementation-alias-probe.json`。probe 只用于归因，
不是公开 LSP contract 的替代，也不是产品 ready 证据。

既定 compiler 权威下不能擅删这个 alias 链接以迎合 class-only 预期。
因此修正 oracle 为完整三处并明确写下注释；同名排除和全部合法范围
仍逐位置验证。**首次 FAIL 是不成立的测试预期，不是生产缺陷 RED；
没有为它修改任何生产代码，也不将 oracle 修正包装成修复。**
其余现有机制直接 GREEN，属于新增组合 characterization。

新增 test entry 的分层登记则是真实 tooling RED：

```sh
node --test --test-name-pattern='classifies every executable test entry' \
  tests/test-layer-manifest.test.mjs
```

0/1 FAIL：`resident-session-implementations.test.mjs: discovered test has no layer`。
登记 `bundle-e2e`、更新 entry 166/bundle 70 和 assignment 后，完整
manifest 4/4 PASS；没有排除、skip 或放宽 entry 规则。

## 验证与剩余范围

五个用例已逐项 GREEN；随后八文件组合 **59/59 PASS**，退出 0、
0 fail/cancel/skip/todo，71,849.89502 ms。包含 L04 六合同、L05 五合同、
完整 batch search、晋升、Worker recycle、candidate snapshot、coalescing
及 layer manifest；原始 `.bench/l04-l05-contracts-focused-59.log`。
生产源码输入仍为
`62e6d09180dbc31343d7b24bf03de69176258582efaf7d1efb6cadc1b0153436`，
server `b4e41f3598b38ad5ce24da52d41fa37e020da433a9b4b7f2204000b7e879e2a0`。
新源码 whole 仍 NOT_RUN，合并前 fresh `pnpm check:fast`；不沿用旧
L02 1338/1338。新测试 256 行，registry 293、manifest test 337 行；
proxy 563、type engine 3576、legacy engine 1068 行债务本切片未增长。

这是 L05 IN_PROGRESS，不是整个阶段或项目完成。真实工程未查目标的
当前构建控制、更长/未知 delta、实际执行中取消与其它 root 状态继续；
最终 P95、内存、总体 semantic-ready、soak/规模/平台在 L08 验收。

2026-10-09 后续进度见[选定预算政策合同](l05-budget-policy-implementation-contracts.md)：
本页五项/59项及旧构建 pins 保留为历史起点；当前23项公开合同、联合
132/132及[当前真实控制](../reports/2026-10-09-resident-l05-budget-policy-integration.md)
22/22 exact已通过，独立输入保护、执行中取消和多根恢复齐备。
随后冻结后完整check:fast1467/1467及终态身份复核通过，
[L05完成审计](../reports/2026-10-09-resident-l05-completion-audit.md) A～E PASS、阶段DONE。
本页旧whole NOT_RUN保留为当时结论，不代表当前状态，最终产品指标仍在L08。
