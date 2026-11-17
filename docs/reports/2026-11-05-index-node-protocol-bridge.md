# IX-03/04：父端协议桥接的实施前置

日期：2026-11-05；parent `298d65f5d7f796c347fe8be5c739e428066489d8`。
工作树 `/private/tmp/arkts-index-versioned-maintenance-20261104`；未提交、未部署。
ADR0043仍Proposed；本片不是默认链路完成或30K/UI验收。

## 公开LSP反例

`tests/lsp-index-versioned-maintenance.test.mjs`通过真实生产`dist/server.cjs --stdio`，
Content-Length framed LSP，生成128个源码文件，独立真实Native进程。
`native-wire-audit.mjs`透明转发NDJSON并记录二进制SHA/请求/回复，不合成结果。
SDK路径显式不存在：本例只验独立本地词法索引，不能替代实际SDK语义验收。
冷索引结束后HashFirst127正确可查，但默认父端仍发旧`catalog/start`，没有`maintenance/start`。
断言RED：`default production LSP must negotiate maintenance rather than legacy full catalog`。
尚未执行后续单文件编辑断言；不能从早退RED推断它已写1或写128。
原Native默认128重解析RED也保留，不删断言、不通过忽略用例获得绿色。

原始证据根`.bench/index-versioned-maintenance-20261104`：
- `ix03-lsp-default-red-v2.log`及`ix03-lsp-default-red/{wire.jsonl,lsp-transcript.json,lsp-stderr.txt}`：
  Native固定为上一片cfd3f2ecdcfd产物。
- `ix03-lsp-final-red.log`及`ix03-lsp-final-red/`：本片新release复核，同一默认接线断言仍RED。
- `ix03-artifacts.json`：产物路径、SHA256、大小。测试夹具已删除，帧/身份和输入生成代码保留。

可复跑：先`node scripts/build-runtime.mjs`，`cargo build --locked --release -p arkts-index-sidecar`；
再`node --test --test-concurrency=1 tests/lsp-index-versioned-maintenance.test.mjs`。
可选`ARKTS_TEST_EVIDENCE_DIR`保存逐帧记录；`ARKTS_TEST_NATIVE_BINARY`指定真实归档Native。
这是协议驱动，不是真实Zed点击。

## 已实施的前置模块

- `sidecar-workspace-index.ts` 1066→460行；提取`sidecar-session.ts`347行、
  `legacy-catalogs.ts`241行及共享`sidecar-timeouts.ts`。旧错误类/事件导出路径不变。
  先跑27项表征，再分别提取并重复原27项。原超时/abort-drain/watchdog/URI边界不变。
- `versioned-index-proof.ts`校验输入安全整数/issuer、同快照workspace/store/domain/head、
  完整资格及确定的terminal结果。No-op只推进资格，不捏造facts generation；
  换库后head降低可以有效，但旧store资格不行。task ready不能充当data证明。
- `maintenance-negotiation.ts`显式请求能力；只有typed初始化invalid_params允许一次去除新字段重试。
  普通IO/busy/transport及非法能力身份不降级、不循环；未请求的新能力也不能自行激活。
- Native `workspace_runtime.rs::initialize_workspace`在协商应答中增加factsDomain，
  与readerEpoch一起提供后续绑定起点；旧不协商初始化仍无该字段。
  真实NDJSON回归先因缺字段RED，再6项全文件GREEN。

当前两个新TS协议模块尚未接入默认session/请求/新鲜度路径，不能声称父端已获得这些保障。
接通前仍需事件/ACK顺序、URI/input投递、读epoch/token取消、同库proof消费及No-op dirty恢复。
不会仅添加capability请求就启用新格式：那会让旧catalog/start不兼容，或在尚无证明消费时错误放行。

## 验证与保留失败

- `ix03-node-contracts-v1.log`：4完整文件41PASS，0FAIL/skip/todo（旧27+新14）。
- `ix03-node-contracts-v1-tsc.log`：TypeScript检查exit0。
- `ix03-test-registration-v3.log`：14PASS；新增3个测试入口有明确层级，目录306。
  最初303/旧层级计数失败原样保留；只更新新增入口对应的精确库存与归属断言。
- `ix03-native-v2-receipt.json`：当前Rust输入冻结；fmt、workspace/all-targets严格Clippy、
  maintenance_protocol完整6项和默认release全exit0，输入未变。
  第一轮fmt布局及新增unwrap的Clippy失败保留，按工具建议修正，无allow或降低门禁。
- `ix03-proof-contract-red.log`、`ix03-negotiation-contract-red.log`保留新模块不存在时的RED；
  后续语义反例见7+7项合同测试。模块缺失RED不能称为现有产品行为失败复现。

上一片228输入的253/143/86/79只属于当时冻结候选；本片修改了协议，不能沿用作最终全量。
当前未跑最终pnpm check:fast：公开默认LSP新回归仍RED；并非全量GREEN。
未执行Windows、30K规模/两小时耐久/UI，未部署/重启/删除真实缓存。
仍超500行的旧债包括Core lib1131、SQLite lib761；本片新/修改TS、脚本、测试均≤500。

## 后继依赖

1. 在当前RED上接入能力、完整事件/终态及有界ACK缓存、保持旧Native兼容。
2. 在实际watch/config入口保留具体URI、父端input权威；先撤销旧资格再发送变更。
3. 独立读请求绑定epoch/token/input及data快照；取消不影响共享维护。
4. 新Q/No-op新鲜度与旧0005水位分支，原compiler/overlay/final fence照旧；禁止伪增generation。
5. 默认128改1和重复通知0facts写达到GREEN，再完成其余生命周期/partial/schema/迁移及完整检查、规模和耐久。
