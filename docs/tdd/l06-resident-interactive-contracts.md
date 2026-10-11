# L06：长驻会话交互能力的独立公开合同

日期：2026-10-08；父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。
接续 L04/L05，不因真实 references 未热命中或最终指标未通过停止本能力。
本切片复用现有 compiler/DocumentAuthority/lanes/resolve owner；没有
新增 production flag、答案缓存、语义 owner 或 capability advertisement。

## Tracer bullet 与公开范围

[真实 stdio 测试](../../tests/semantic/resident-session-interactive.test.mjs)
使用 Content-Length 子进程、276 个合法源码及有效小 SDK。先以无关
WarmContract implementation 支付完整工程准备，再打开此前 lazy 的
同内容 ZConsumer，查询此前未查询的导航目标。晋升 OFF/ON 的全部
definition、typeDefinition、hover、signature payload 和正常 v1 诊断
深比较；不是只挑几个字符串或位置。ON 另见证匹配指纹晋升及 generation
保持，不能由 flag 声明推断实际执行。人工 URI/UTF-16 oracle 排除同名类。

八个合同逐项推进：

- definition/typeDefinition 的完整 Location，hover 的完整 markup/range，
  signature 的 label/parameters/activeSignature/activeParameter。
- public API 类型变更及调用文件编辑后立即查询新的类型、signature 和
  UTF-16 范围；2322 的 code/range/version 精确，v3 恢复后正常诊断为空。
- 真实 L3 驱逐、物理 old/new Worker 不同后，v2 overlay 和 v3 导航/诊断
  完整恢复；不把已有回收请求成功误当尚未执行的替换。
- member completion 完整 list/isIncomplete、顺序、kind/sort/insert/edit 与
  resolve 信息 OFF/ON 深比较。仅归一化已逐项校验且实际 resolve 成功的
  随机会话 UUID，语义字段不删；同一进程 resolve 的 UUID 必须保持。
- 五类交互早期取消各得唯一 `-32800`、无 result，随后导航恢复；正常
  退出后无重复终态。不冒称 compiler-in-flight 或重复取消资源门禁。
- refs 实际 batch 启动且响应未结束时，四类导航和 completion 都能先
  完成；编辑使旧 refs 返回唯一 stale 错误、无 result；最新两种 policy
  5/6 个位置完整，未打开继承调用点保留、同名类不混入。
- class-member stub 在 snippet-capable 客户端发送/resolve snippet，在
  普通客户端保留普通 `run` completion，不泄漏 snippet placeholder。
- 两个同名 auto-import 来源不合并，resolve 得到两份精确 import edits；
  应用选定 edits 后 v2 无诊断、定义指向正确来源，旧句柄全部拒绝。

并发合同保留正常长驻/晋升路径，但明确关闭 refs R-09 shortcut，使用
既有 2000 ms verifier 功能延迟控制；L3 与两个完成 batch、实际
runtime-ready receipt 都有日志见证。此前 R-09 ON 的短控制可以由
交互重建后的 hot refs 完成恢复，不能拿那一次 flag 设定宣称全部恢复
都经过 verifier。因此强化为真实 fallback 见证后再计本合同 GREEN。
该控制是调度/新鲜度功能样本，不是 500 ms 或 compiler-in-flight 测量。

## 有效 RED 与无效预期分开

新增 entry 的 tooling 登记先真实 RED：

```sh
node --test --test-name-pattern='classifies every executable test entry' \
  tests/test-layer-manifest.test.mjs
```

0/1 FAIL：`resident-session-interactive.test.mjs: discovered test has no layer`。
登记为 `bundle-e2e`，更新 entry 167/bundle 71 与 assignment 后，manifest
4/4 PASS。原始 `.bench/l06-layer-registration-red.log`，没有排除 entry。

编写 characterization 时另有三次不成立的预期：signature 光标在字符串
内部却声明逗号触发；class field 错误预期为 Property=10（现有协议是
Field=5）；普通客户端错误预期为启用 snippet 选项才生成的 stub 正文。
分别按真实触发位置、现有 kind 映射和 compiler/client options 纠正。
**这些不是生产缺陷 RED，没有为它们修改生产行为或伪造修复。**
既有能力直接 GREEN；每个完成用例之后才追加下一项，没有批量预设新语义。

## 当前构建验证

新八个合同逐项 GREEN，随后七文件组合 **57/57 PASS**，退出 0、
0 fail/cancel/skip/todo，37,916.227635 ms。包括新交互、promotion、
Worker recycle、references scheduling、context lifecycle、completion
arbitration 与 test layers；原始 `.bench/l06-interactive-focused-57.log`。

生产源码输入仍为
`62e6d09180dbc31343d7b24bf03de69176258582efaf7d1efb6cadc1b0153436`，
server `b4e41f3598b38ad5ce24da52d41fa37e020da433a9b4b7f2204000b7e879e2a0`；
重新捕获完整 pins 与上一固定输入相同。新源码 whole 仍 NOT_RUN；
合并前 fresh `pnpm check:fast`，不沿用 L02 1338/1338。
新测试 473 行、registry 294、manifest test 338 行；proxy 563、type engine
3576、legacy engine 1068 行迁移债务未增长。

随后 [当前构建 Settings 四轮控制](../reports/2026-10-08-resident-l06-interactive-control.md)
8/8 exact、配对诊断一致，13 个 matching promotion 实际避免一次
Program 重建，单 timing 新 definition 686→165 ms；原 v1 2307/2339
保留、suite 均 READINESS_UNSUPPORTED，不冒称整体成功。
L06 仍 IN_PROGRESS：更长序列/其它输入及能力
组合继续；总体 semantic-ready 不是由这些 case 或 candidate-ready 推断。
最终 P95、内存、soak/规模/跨平台/发布均在 L08，不冻结 L07 合同。
