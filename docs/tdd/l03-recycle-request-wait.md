# L03：回收期间的可取消请求等待

日期：2026-10-08；父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。
L03 首个功能切片，接续 [L02 失效/编辑](l02-promotion-invalidation.md)。
最终性能、内存与产品验收仍在 L08，不作为本切片准入条件。

## 范围与 characterization

L01 的显式 Worker 替换仍要求 `ARKTS_BENCHMARK_CONTROL=1` 和
`ARKTS_L01_SEMANTIC_WORKER_RECYCLE=1`，单一静止 root、实际 L3 驱逐及
零 lease。自动压力回收尚未接线；本轮不改变这些资格或生产默认。
直接自动触发原事务会让并发语义请求报 `recycle is in progress`，因此
先保护请求等待、取消及最新未保存文本，再实现压力事件的自动连接。

L02 固定源码 `7207d766…` 的独立 whole `pnpm check:fast` 已完成
1338/1338 PASS、退出 0，原始输出见 L02 TDD。其四个公开 recycle 用例
保护现有行为；提取事务/延迟编辑队列后重新构建，原四例 4/4 PASS。
提取到 `semantic-worker-recycle.ts`，不模拟 Worker 或 compiler。

## 三个独立 RED → 最小 GREEN

每个用例通过真实 Content-Length stdio 子进程，正常诊断保留。
复现命令均为以下形式，各 pattern 单独执行，前一用例 GREEN 后才写下一例：

```sh
node --test --test-name-pattern='<pattern>' \
  tests/semantic/semantic-worker-recycle.test.mjs
```

| pattern | 有效 RED | 最小 GREEN |
| --- | --- | --- |
| `a timed-out recycle witness` | 等待中的 definition 返回 `-32603: recycle is in progress` | 等事务终态、先刷新延迟 mutations，再发正常请求；最新 v2 定位/三处引用/诊断精确 |
| `navigation waiting for recycle remains cancellable` | 客户端取消后仍等五秒 witness，原取消用例两秒 deadline 超时 | 等待订阅 AbortSignal，取消直接返回唯一 `-32800`；其后同进程 v2 精确恢复 |
| `references arriving during recycle` | snapshot/candidate 准备阶段仍报相同 `-32603` | 先可取消等待，再捕获当前输入快照；完整三处引用与 v2 诊断精确 |

五秒 witness 超时是原测试 hook，未延长。两秒仅区分“取消不能等待
整个 witness”的执行保护，不是新产品性能目标。原导航请求 20 秒
deadline、SDK、overlay 与合法范围不变，未删减 oracle。

随后追加 `an edit supersedes waiting navigation`，直接 GREEN、未伪造 RED：
在等待 v2 定位期间发送带 emoji 前缀的新 v3。旧请求按已有 freshness
合同返回空 fallback，不发布旧位置；新定位、全部三处 references 与
正常 v3 诊断读取最新文本。取消/失效不把旧 overlay 重放回 live Worker。

## 验证与输入

`pnpm check` 和构建 PASS。十文件 focused 回归 **81/81 PASS**、退出 0，
0 fail/cancel/skip/todo，28,093.938274 ms：recycle、production Worker、
supervisor/lanes、reference/project snapshots、workspace freshness、
coalescing、diagnostic scheduling 和 cancellation scope。
原始输出 `.bench/l03-recycle-request-wait-focused.log`。

当前源码输入 SHA-256
`3cb254c7302ed9f086255201a93552a04d9ebe688fa8fa55b97e045bd6940ca8`，
server `f9c4627c1d326aba54d2422124df8e21d278d8e9423c34e017eb14b5e0adb6f4`；
semantic Worker digest 保持 `e0358888…`，行为变化在 main-thread proxy。
L02 manifests/report pins 保留原构建，不倒改历史实验或把旧 1338 whole
宣称为本轮新源码 whole。本轮没有重新跑完整回归或真实资源 A/B；
请求合并前仍须 fresh `pnpm check:fast`。

手写新模块 122 行，扩展测试 278 行。既有 proxy 从 613→563 行，
仍有超过 500 行的迁移债务；type engine 3576、legacy engine 1068 行
的既有债务不变。本切片不声称内存收益、稳定时延或全 L03 完成。
下一切片是默认关闭的实际 L3/静止状态自动回收、恢复与资源对照；
不能直接用 timer 强杀执行中 Worker，也不能停用正常诊断。
