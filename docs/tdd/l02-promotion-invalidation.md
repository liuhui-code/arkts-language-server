# L02：晋升后的独立失效合同与 target 切换缺口

日期：2026-10-08；父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。
接续 [同内容晋升](l02-same-content-promotion.md)，最终产品门禁仍在 L08。

## Characterization 与逐项验证

扩展 fixture 前，`node --test tests/semantic/semantic-same-content-promotion.test.mjs`
为 4/4 PASS。继续使用真实 Content-Length stdio 子进程、超过 256 文档
准备窗口的完整 membership、正常版本化诊断及原 20 秒请求 deadline。
每个失效场景先经历实际 matching lazy→resident 晋升，再进行干预；
开关 ON 的准备 Program 保持不换代，由公开 trace 验证，未模拟 compiler。

以下新增合同在当前实现上直接 GREEN，不伪造缺陷 RED：

- Public API：导出成员 number→string，最新成员 definition 与 hover 的
  URI/UTF-16 range 精确，consumer 的正常 2322 诊断 code/range/version 精确。
- Import：Target→Other 的 alias 换绑立即定位新声明；旧 Target 的两种
  declaration policy 完整引用集合只剩原声明或空集合，没有旧 consumer。
- Create/delete：新未打开成员的两处引用加入/移除，两种声明策略逐位置
  校验全合法 scope，不因文件在准备窗口外丢失结果。
- Open/delete/close：打开的声明在磁盘删除后仍由 overlay 提供；关闭后
  不再定位已删除声明，正常 consumer 诊断为 2307。初始“应返回空”的
  oracle 不正确：OFF/ON 都回到本地 import alias，按 compiler 的现有
  公开语义精确校验该 alias；这是测试假设修正，不是产品缺陷 RED。
- SDK：改变选择后定位新 SDK 的精确声明，同时保留工程打开文本；
  相同 v1 overlay 的正常诊断反映新 string 类型，不复用旧 number 类型。
- Package：打开文本与磁盘文本分歧，但保持晋升后的 compiler 字节不变；
  package main 从 First→Second 后定位新 URI/range，保持打开文本权威，
  正常 consumer 2322 诊断指向该文本中的精确位置。

## Target：有效 RED、诊断与最小 GREEN

```sh
node --test --test-name-pattern='a selected target change' \
  tests/semantic/semantic-same-content-promotion.test.mjs
```

两次独立 RED 都是 tablet→desktop 后**首个** definition 返回 `[]`，
而正确 oracle 是选中 desktop 的同名全局类。正常初始诊断和 tablet
定位已通过，不是无效 fixture；关闭晋升的独立对照也相同失败。
Diagnose 的三项假说为准备范围缺失、配置刷新时序、晋升版本失效。
公开协议探针证明：直接重复仍 `[]`；随后 full references 3/3 exact，
再定位立即得到 desktop。trace 显示切换前 274 个 project roots，
`document-store-reset` 后新的 LS 只有 2 个依赖 roots；完整范围准备后
回到 274。原始归因日志 `.bench/l02-target-scope-probe.log`。
故不是晋升 flag 特有缺陷，也不能靠等待或预热修正首个请求 oracle。

最小修复保留已成功的局部 definition；仅空结果时检查取消，再用完整
合法 membership 在同一引擎复核。请求版本、打开文本、模块/target
边界和 compiler 最终权威不变，不发布中间空/部分结果。OFF/ON 的原
首个请求现在均精确；新增 full-scope 成本继续测量，不能声称无资源回归。

GREEN 后将纯粹的 current/closure roots 投影抽出为
`src/semantic/interactive-workspace.ts`，明确这一责任且不改变投影行为。
`legacy-semantic-engine.ts` 1075→1068 行；原 type engine 仍 3576 行。
二者超过 500 行的迁移债务保留；新模块 20 行，扩展公开测试不超过 500 行。
连续两个 compiler 查询可产生额外 trace，测试不把私有 compiler 次数当
公开请求次数；原四项晋升观察约束不放宽。

## 验证与输入冻结

双开关下原 focused 命令扩大为 66/66 PASS（0 fail/cancel/skip/todo）；
另一个 current-root/SDK 合同与双模式 target 合同为 2/2 PASS，`pnpm check`
和构建通过。temporary probes 已清理，正式测试没有等待屏障、golden
缩减或 deadline 放宽。新源码输入 SHA-256
`7207d766f037f1c972b5f2d45b149e88aca5d13df7b7fc92d1afae4c8075e152`，
semantic Worker `e035888832b6280841fb9b58f04a169fa2d569b94b786785a86b6af2254c5020`。
旧晋升报告冻结在旧构建；新真实编辑回放使用独立 L02 edit manifests。
新源码独立 `pnpm check:fast` 退出 0：1338/1338 PASS，0 fail/cancel/skip/todo，
总计 1,430,885.378136 ms。原始构建/测试输出保留于
`.bench/l02-invalidation-check-fast-2026-10-08.log`；执行期间未修改源码。
前轮 whole 1330/1331 的历史超时不改标，旧 timeout 的因果归属仍开放；
本轮完整 GREEN 关闭当前构建的回归检查，不等于 L08 产品毕业。
