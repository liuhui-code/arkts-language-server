# L02：同内容 lazy→resident 晋升的版本连续性

日期：2026-10-08。父版本：`1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。
用户已将最终产品验收放到 L08；本切片按更新后的 L02 实验规则推进。

## 公开协议 RED → GREEN

- 特征测试先通过：`pnpm build`，随后
  `node --test tests/semantic/semantic-script-admission-trace.test.mjs`，1/1 PASS。
  该合同保护 trace-on/off 的精确定义、正常诊断及有界晋升计数。
- 初始三文件夹具未发生 lazy 晋升，不能作为缺陷 RED；没有修改生产
  代码来迁就该假设。最终夹具超过既有 256-document 准备窗口，用完整
  references 准备 Program，再打开此前由 compiler lazy 读取的真实成员。
- 有效 RED：`node --test tests/semantic/semantic-same-content-promotion.test.mjs`
  在精确位置、正常诊断及匹配指纹验证之后，以 Program 序号 `3 !== 2`
  失败；基线和实验开关都重复构建了相同输入的 Program。
- 最小实现：仅当 `ARKTS_BENCHMARK_CONTROL=1` 与
  `ARKTS_L02_SAME_CONTENT_PROMOTION=1` 同时存在，且新 resident 脚本
  属于当前 membership、已有 lazy 读取证据、源码指纹一致时，保留原
  compiler script version，不推进无内容变化的 host generation。
  实际内容改变、路径删除/内容通知、membership 改变仍失效；未知证据
  或超过 4096 条证据上限则保守采用原版本路径。
- 公开测试还覆盖没有 benchmark 开关时不启用、首次打开即带不同
  未保存文本、晋升后的 v2/v3 未保存引用增删、类型错误和清除错误。
  编辑后立即发送 definition；完整 references 逐位置比对，正常版本化
  诊断保留；新的 Program 可复用未变化 SourceFile。
- SourceFile 的身份统计是查询/诊断后的观察。诊断可能先消费首次
  观察计数，因此以该 Program 的首份公开 trace 为见证，不要求每个
  后续 definition 都再次报告 `FirstObserved > 0`。

## 工程合同与边界

`TypeScriptScriptAdmission` 统一拥有有界 lazy 证据及可选晋升观察，
不存储源码文本，不创建第二份 Program/Checker；observer 异常仍隔离。
原超限 `typescript-language-service.ts` 由 3599 行降至 3576 行，
尚有超过 500 行的迁移债务；新 helper 和测试均低于 500 行。

新增测试先使 `tests/test-layer-manifest.test.mjs` 因未分类条目 RED，
登记为 `bundle-e2e` 并同步 164 条目／68 bundle 条目计数后 GREEN。
原始测试、golden、deadline 和正常诊断未放宽。

当前 Context7 文档说明由 Host 版本控制 Language Service 的增量输入，
具体执行依据是锁定的 `ohos-typescript@4.9.5-r10`：
`synchronizeHostData` 检查 `getProjectVersion`，随后使用 script version
判断 Program 是否仍有效；没有采用新版 compiler API。
参考：[TypeScript Compiler API 文档](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)。

真实 Settings/API24 同构建 A/B 使用新 L02 manifests，保留旧 L01
manifest 的输入 pin 和原始失败证据。trace-on 用于归因，trace-off
用于完整响应计时；最终资源、P95 与发布验收仍在 L08。

## 回归执行记录

以下 focused 命令在双实验开关下 **59/59 PASS**，0 fail/cancel/skip/todo：

```sh
ARKTS_BENCHMARK_CONTROL=1 ARKTS_L02_SAME_CONTENT_PROMOTION=1 node --test \
  tests/semantic/semantic-same-content-promotion.test.mjs \
  tests/semantic/semantic-context-lifecycle.test.mjs \
  tests/semantic/semantic-session-reuse.test.mjs \
  tests/semantic/project-membership-language-service.test.mjs \
  tests/semantic/project-sdk-selection.test.mjs \
  tests/semantic/type-engine-context-runtime.test.mjs \
  tests/test-layer-manifest.test.mjs
```

默认环境完整 `pnpm check:fast` 为 **1330/1331 PASS、1 FAIL、exit1**，
0 cancel/skip/todo。唯一失败为既有 403-file struct references 用例的
首个请求 2 超出原 20 秒 deadline，不是返回了已验证的错误位置集合。
新晋升测试四项全部通过；不据此把全量改标成功。
原用例、golden、deadline、SDK 发现规则及生产默认开关均保留；
隔离与父版本核对见 [L02 报告](../reports/2026-10-08-resident-l02-same-content-promotion.md)。
