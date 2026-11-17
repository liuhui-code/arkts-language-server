# 索引验收驱动：规模控制、样本汇总与观测证据

日期：2026-11-08。关联 [ADR0043](../adr/0043-versioned-file-index-maintenance.md)、[实施计划](../plans/2026-11-03-versioned-index-maintenance.md)。

## 当前结论

本报告记录验收准备，**不是规模或 30K 耐久通过报告**。产品候选冻结在隔离工作树，完整 `pnpm check:fast` 仍在运行。本片只修改证据根内的测试驱动，没有修改产品、内存/超时阈值、SDK 或用户缓存。

最终驱动与观测控制 **37 PASS / 0 FAIL / 0 skip**。实际 release Native 空工作区握手/关闭、两个 SQLite 库后检通过。Native SHA 为 `409b08c4cf8096c0e91854040602269690eb98a803c14ae1d9f50567588b61ea`。驱动自检不能替代产品完整检查、规模或 UI 验收。

## 串行实验顺序

1. 完整产品检查通过且源/产物身份不漂移，主验收控制器才允许启动。
2. 原计划两因素：128 / 2048 / 20000 / 30000 源码，固定目标两文件静态依赖闭包，或扩大扇出最多 32 的依赖树。旧 298d / 候选交替，每格三轮普通计时、一轮独立 trace；冷索引与新进程缓存重开分开。128 校准不计正式样本。
3. 原 30K Photos 输入逐项核验后复制；原 seed 817954798、save212/close255、目录、依赖、取消等场景保留。正式至少 7200 秒单会话，不累加校准，不将协议成功冒充真实 UI。
4. 主验收完整结束、soak 退出 0 且输入恢复证明为真后，补充实验才开始。主验收失败即保留并停止后继负载。
5. 补充固定 2048 源码、两文件静态闭包：单文件 16384 / 65536 / 524288 字节，固定三个目标引用；另一组固定 262144 字节，引用 3 / 128 / 2048。冷热、版本、普通/trace、校准/正式继续分开。

字节体量通过一个 ASCII 字符串字面量变化，不代表控制流复杂度。引用密度虽匹配总字节，仍改变 AST 节点数。静态闭包不能充当实测 Program 成员数；实际成员仅按可用 trace 记录，缺失计数标为 UNMEASURED。

## 观测合同

- 普通会话保留原请求顺序、输入及精确 Locations/rename/补全 oracle。每五秒 lstat 记录缓存逻辑长度、唯一 inode 长度、已分配块及 DB/WAL/SHM 分项。分项峰值不保证同时发生，均不是物理设备写入字节。
- 独立 profile 轮次才使用 raw Native tee，记录双向字节及带时间/偏移的 chunk；不解析或截断 frame，不合成响应。已验证 20 MiB 帧逐字节保真。每次 Native 启动独立目录，恢复不因日志目录已存在而失败。额外进程与记录开销单列。
- 保留原 Node/native/整机/磁盘采样和保护。Node RSS 每 PID 计一次，包含 Worker 线程；native 单列，RSS 求和不是 PSS。测试 Node RSS 保护继续按授权豁免，产品预算/V8/超时不变。
- 正常关闭及 cleanup 后核对已采样 owned PID/start identity，再进行 SQLite 结构与外键后检。不能把该证明扩大为已经排除未观察到的孤儿进程。
- 操作计时在后检前结算。后检不 checkpoint/vacuum/删除缓存，不打开活动库。普通只读 WAL 打开可能创建 SHM 元数据，记录为后检影响。遍历不完整、跳过 symlink、无库或文件身份漂移不能认证完整成功。
- 汇总保留失败、功能缺口及缺失耗时；all-attempt 与 passed-only 分列。中位数偶数取中间两值均值；p95/p99 用 nearest-rank，少样本尾分位不支持复杂度结论。

## 反例及修正

证据路径均相对 `.bench/index-versioned-maintenance-20261104`。

| 证据 | 实际观察与修正 |
| --- | --- |
| `observation/all-observation-controls.log` | 首轮 31/33，缺正式 SOAK 环境导致两个测试子进程因缺失 preload 文件退出。同断言、正式环境 33/33，原失败保留。 |
| `observation/cache-observation-green.log` | macOS `/var` 父路径别名被 SQLite `-nofollow` 拒绝；核对真实根后采用物理路径，保留 nofollow。 |
| `observation/native-real-smoke-01/integrity.json` | 一个已关闭、无 WAL 的 WAL 模式库被系统 SQLite 普通 readonly 拒绝，errno14；immutable 对照可读，不能据此判定库损坏。 |
| `observation/cache-observation-wal-immutable-probe.log` | 非空 WAL 也使用 immutable 会漏读已提交的外键错误，不能泛用。 |
| `observation/cache-observation-wal-conditional.log` | 仅在关闭且 WAL 缺失/为空时采用 immutable；非空 WAL 用普通 readonly，复核 DB/WAL 前后 dev/ino/长度/mtime。 |
| `observation/native-audit-reopen-red.log` | 固定输出目录使第二次 Native 启动失败；改为每启动独立子目录，两次完整字节均保留。 |
| `observation/all-controls-final.log` | 最终 37 PASS：汇总6、密度夹具/准备/控制7、缓存观测9、raw tee2、原混合驱动13。 |
| `observation/native-real-smoke-03/result.json` | 实际新构建 Native 公开 init/shutdown、两个 DB 后检通过；空工作区，不能证明规模或语义性能。 |

未测物理写盘、release 未暴露的 read/hash/parse/realpath 次数，不能从写行或复用数倒推。全量引用/重命名失败继续单列功能缺口；不能只凭 30K 数量，把所有 `-32803` 都归因于 20K 上限，仍需结合对应状态与日志。

## 依据与复现入口

Context7 的 SQLite/Node resolve 请求均因 transport 失败，采用官方资料：[SQLite integrity_check](https://sqlite.org/pragma.html#pragma_integrity_check)、[只读 WAL](https://sqlite.org/wal.html#read_only_databases)、[CLI](https://sqlite.org/cli.html)，以及固定 [Node 20.19.5 child_process](https://raw.githubusercontent.com/nodejs/node/v20.19.5/doc/api/child_process.md) / [streams](https://raw.githubusercontent.com/nodejs/node/v20.19.5/doc/api/stream.md)。运行工具为 Node 20.19.5、Mac 系统 SQLite 3.51.0。

源哈希、负例和控制计数：`observation/validation-receipt.json`。
主实验状态：`final-acceptance/execution.json`；补充实验状态：`density-acceptance/execution.json`。
通过条件以真实终态、逐次结果、输入恢复和原始日志为准，不能以本报告的准备完成状态代替。

### Original pinned455 correctness gate (2026-11-08)

The ignored fixed455 release test was explicitly executed on the clean pinned `585feb45114a128a0d2a23947c83faf338e758f7` checkout. All original count/state/rank/exact-location assertions passed (1PASS, exit0); the source455-file hash manifest and Git status stayed unchanged. Measured cold catalog3168.922548ms exceeded3000ms and was **waived by the standing user authorization**, not represented as meeting3s. This ran during full Node regression, so the number is not an isolated performance comparison. Full command and evidence: `.bench/index-versioned-maintenance-20261104/ix07-pinned455-correctness-receipt.json` and raw log. The prior full Rust410PASS/1ignored result remains labeled as that command, with this gate reported separately.
