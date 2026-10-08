# L01 脚本晋升追踪：TDD 记录

日期：2026-10-06。父版本：`72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`。
范围仅为默认关闭的观测，不改变查询、诊断、缓存预算或生产路由。

1. 公共 LSP RED：`node --test tests/semantic/semantic-script-admission-trace.test.mjs`
   先通过精确 definition、v1 自动诊断和 trace-off 检查，再因缺少
   `semantic.prepare.script-admission` 事件失败。
2. 最小 GREEN：在一次 `TypeScriptLanguageServiceEngine.prepare()` 内记录
   resident script 前后数量、新增数、generation 前后值和已被 lazy host 读取
   的源码指纹匹配数；只在 `ARKTS_REFERENCES_TRACE=1` 时创建指纹表、计算
   晋升指纹并向 stderr 日志发送事件。指纹表有 4096 条上限，工作区
   membership/内容变更时清理相应证据。不记录源码内容或文件路径。
3. 同一公共测试曾加“简单三文件 fixture 必须至少有一次 lazy 晋升”断言，
   实际 RED：`references` 准备阶段已把两份依赖作为 resident script 加入，
   因而不存在该晋升；这不是生产 bug。撤回不成立的 fixture 假设，保留
   有界计数和 trace-on/off、精确结果、诊断合同；真实 Settings 单独证实
   13/13 同指纹晋升。
4. 为满足超限源文件迁移规则，先运行既有 project-membership 与
   references-depth 特征测试 15/15 GREEN，再原样提取有界文件安全读取到
   `typescript-safe-source-read.ts`。保留 symlink、大小、竞态和 fatal UTF-8
   判断；原 `typescript-language-service.ts` 从 3624 行降至 3611 行，
   `type-engine.ts` 保持 500 行。
5. 新测试登记前，`node --test tests/test-layer-manifest.test.mjs` 因未分类
   测试 RED；登记为 `bundle-e2e` 后连同公共追踪与两组特征测试 20/20
   GREEN。最终 `pnpm check:fast` 在可读取 macOS 进程采样的环境中
   1299/1299 PASS；不把 focused GREEN 当全量发布门禁。
6. 审查发现 trace observer 若抛异常会让 `prepare()` 失败；新增
   `type-engine-context-runtime.test.mjs` 的可注入 observer RED，随后隔离
   该可选回调异常，测试与公共 LSP 追踪 3/3 GREEN。可选观测失败不应改变
   compiler 的权威语义响应。

此切片只证实观测能力。即便相同源码指纹的晋升与 Program 重建同时出现，
“保留原 host version 后仍保持正确且降低时延”仍须独立、默认关闭的 L02 A/B。
