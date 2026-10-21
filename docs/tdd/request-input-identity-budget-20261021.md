# Request-local physical identity budget

> 公开审查副本：原始日志、完整原件和运行时快照仅保留本地，见[本地证据与公开边界](../reports/local-performance-evidence.md)。
> 文中的父版本、原执行分支及历史完整检查属于原本地候选，不表示它们是本公开分支的祖先或当前PR检查资格。
> 命令中的 `$NODE20` 是原已执行 Node 20.19.5 绝对启动器路径的公开化表示；复现前请按本机安装设置，不是原样 shell 转录。
> 原记录的 pnpm 8.15.9 缺少独立启动器版本核验，本文不将 packageManager 声明当作实际执行版本证明；公开分支需单独完整检查。

- Parent: `110568e54bc1bb13d6eb891d81ef631bcf1232cc`.
- Scope: ADR 0019 request-local positive physical metadata sharing. This slice
  does not change semantic grouping, compiler ownership, result caches or the
  independent final publication fence.
- Test: `tests/semantic/request-input-validation.test.mjs` through a real child
  process and Content-Length framed stdio. The private preload counts actual
  `diskIdentity` reads and the reads reached through `requestFileIdentity`;
  complete reference payloads are asserted independently of the counters.

## RED

Command (pinned Node 20.19.5; existing baseline `dist`):

```sh
"$NODE20" --test --test-concurrency=1 --test-name-pattern='one edited LSP reference query' tests/semantic/request-input-validation.test.mjs
```

Raw output: [red.log](../reports/local-performance-evidence.md).
The searched Program contained 8254 project SourceFiles, 1 SDK SourceFile and
52 compiler libraries. The 8250 independent filler sources were unchanged;
the only edit appended `// local edit` to the open `Target.ets` after a warm
reference query. Initialization was deliberately degraded by a missing SDK
import. The query for `TargetTwo` returned the exact declaration location.

The identity-sharing assertion failed: 8138 fillers had two physical identity
reads and 112 had three, totaling 16612 reads. The old first-8192-entry limit
was exhausted by project and other compiler inputs; equivalent later phases
could not retain positive facts for those remaining fillers. The diagnostic
compiler query duration was 1260.436ms; it is not an ordinary latency result.

An earlier syntax-error attempt was corrected before this RED reproduction;
it is not considered product evidence.

## Change

Replace the fixed entry count with a 32MiB accounting budget per synchronous
query phase. Each retained positive identity charges the UTF-16 lengths of
the lookup path, physical path and stamp, plus 128 bytes for entry/object/Map
bookkeeping. This is a bounded metadata accounting estimate, not a claimed
V8 RSS limit. Very long paths consume more budget; overflow executes the
ordinary uncached read. No configuration option or cross-request cache is added.

Only successful physical metadata is shared. Failure is not retained. Text,
AST, READY status and semantic proofs are not stored here. Direct read-after
checks still call `diskIdentity` independently. Before publication, the query
map and its byte charge are cleared; final validators start from fresh
identities. The final phase may share its own successful identity facts across
participants exactly as before. Every normal, error and exception exit clears
the map and charge. Nested synchronous queries retain the outer lifecycle.

## Verification

After the shared runtime build, the same command passed (one selected test;
eight explicitly unselected tests). Raw output:
[green.log](../reports/local-performance-evidence.md).
Tested runtime SHA-256: `dist/semantic-worker.cjs`
`9b3820c8dcc608f50d206188a87d882e1d2a21a1c6faf5766dfb8cae98f87827`;
`dist/server.cjs`
`e8284e00bedaca219e3fda407d5a4365293919a4edcf4a2f77ad1577385c2a0e`.
All 8250 unchanged filler inputs had exactly two shared-path and two total
physical identity reads, totaling 16500: one in current admission and one in
the independent final union. The subsequent uncached symbol query increased
every count to exactly four. Complete result payloads remained exact. Filler
metadata charged 7,416,032 bytes under the 32MiB accounting formula.

The diagnostic compiler query duration was 1317.569ms. RED and GREEN use
heavy metadata counters, and the runtime also contains the independently
validated compiler-snapshot repair; these timings do not establish latency
improvement. Ordinary scale latency and process memory measurements remain
separate.

Pinned TypeScript `tsc --noEmit -p tsconfig.json` passed (exit 0); raw output
[types.log](../reports/local-performance-evidence.md).

Full serial command against the same build:

```sh
"$NODE20" --test --test-concurrency=1 tests/semantic/request-input-validation.test.mjs tests/semantic/resident-input-proof-boundaries.test.mjs tests/semantic/resident-input-proof-reuse.test.mjs
```

Raw output [regressions.log](../reports/local-performance-evidence.md):
**16/17 passed, one failed, no skips/cancellations**. The sole failure was the
existing 8250-file final-fence case waiting more than its unchanged 10-second
initialization-notification watchdog. It had not reached its reference query
or publication assertions. This failed sample remains evidence; this run is
not reported as fully GREEN. The other eight input-validation cases and all
eight resident-proof boundary/reuse cases passed, including independent final
checks after unnotified and same-size/same-mtime changes.

The unchanged failing case was then rerun alone:

```sh
"$NODE20" --test --test-concurrency=1 --test-name-pattern='references retain all Program disk inputs.*files=8250' tests/semantic/request-input-validation.test.mjs
```

Raw output [large-final-fence-rerun.log](../reports/local-performance-evidence.md):
**1/1 selected passed, eight explicitly unselected**. The initialization
watchdog stayed at 10 seconds. A mutation during the final fence rejected the
computed result with `-32803`; the watcher update then recovered exact complete
results without a replacement LS. The complete test took 14506.960ms and the
diagnostic recovery RPC took 2427.007ms. These are not 500ms qualification.
There is insufficient evidence to attribute the earlier initialization
timeout; it is retained as an unresolved variability observation. No timeout
was increased and no product implementation was changed in response.

The full final runtime check and ordinary 20k scale/initialization validation
belong to the integrating root task. The per-slice checks above do not grant
overall completion or performance qualification.

The integrating root subsequently ran the final combined runtime's three
complete P0 files serially: retained lazy source evidence, shared compiler
source facts and request input validation. **16/16 passed**, including the
original 8250-file final-fence case with its unchanged 10-second initialization
watchdog. Raw output: [final-input-regressions.log](../reports/local-performance-evidence.md).
This later successful run does not erase the earlier 16/17 sample
or establish its timeout cause. The final whole `pnpm check:fast` has started
separately; its result must be reported by the integrating task rather than
inferred from these focused checks.


## 最终同候选完整检查（2026-10-21）

冻结candidate-v2（manifest SHA256 `8c4f61823603b4ba64289d9d010d6738205ba53672a3be0d9a8fa3b81e7fb8a3`）
完整 `pnpm check:fast` 已通过1943/1943，失败/跳过/取消均0；Node20.19.5；pnpm 启动器版本限制见本页公开边界。
源码、全部仓库输入在运行期间不变，生产runtime与实测候选前后相同。
日志SHA256 `78019639e431abf47d6c0ecb8bb1fb914fe985429e7913804ecde6e37a3919a2`，
收据在[qualification.json](../reports/local-performance-evidence.md)。
本段是检查后的证据更新，运行时文档快照在[运行时文档快照](../reports/local-performance-evidence.md)；产品输入未变。
500ms及完整架构目标仍未完成；普通规模、内存负收益和限制见
[最终报告](../reports/2026-10-21-incremental-input-optimization.md)。
