# Late dependency versions after filtered group events

> 公开审查副本：原始日志、完整原件和运行时快照仅保留本地，见[本地证据与公开边界](../reports/local-performance-evidence.md)。
> 文中的父版本、原执行分支及历史完整检查属于原本地候选，不表示它们是本公开分支的祖先或当前PR检查资格。
> 命令中的 `$NODE20` 是原已执行 Node 20.19.5 绝对启动器路径的公开化表示；复现前请按本机安装设置，不是原样 shell 转录。
> 原记录的 pnpm 8.15.9 缺少独立启动器版本核验，本文不将 packageManager 声明当作实际执行版本证明；公开分支需单独完整检查。

- Parent revision: `110568e54bc1bb13d6eb891d81ef631bcf1232cc`.
- Discovery: read-only review of the new group clock found that excluding an
  unrelated file from the compiler invalidation set also discarded the file's
  version/old-snapshot invalidation history. A later first import could collide
  with the shared DocumentRegistry's old version and publish its old SourceFile.
- Product ownership: the group-version implementation worker; this slice added
  public framed-stdio LSP counterexamples and input-observation fixtures only.

## Reproduction and exact ordering

The isolated workspace contains independent A, B and C module manifests. B's
Query re-exports through 270 relative chain files to C's `Query.ets`. C initially
contains `export class DeepLeaf { marker: number = 1 }`. Initial preparation
creates all module Programs and the global Program, with a READY result.

1. Query the definition of `LocalA` in A. A has one actual project SourceFile
   and one project root; it does not yet import B or C.
2. Prefix C with `// changed before the first import from A\n`, then send an
   ordinary `workspace/didChangeWatchedFiles` changed event.
3. Query `LocalA` again. A consumes the event while still having one project
   input. C is considered unrelated to A's current compiler inputs.
4. Open A at version 1, then full-text edit to version 2:

   ```ts
   import { DeepLeaf } from "../../../../b/src/main/ets/Query"
   export const result = new DeepLeaf().marker
   ```

5. Query the definition of the last `DeepLeaf`. Expected complete result:
   C `Query.ets`, zero-based UTF-16 line 1, characters 13 through 21.

Actual Program inputs grow to 273 project SourceFiles, while the legal A root
count stays one. The real prepared raw-document list contains 256 documents
and excludes C in this final query. This prevents a short direct import from
refreshing C's resident text through normal raw-document delivery and hiding
the bug.

Two variants distinguish C's previous raw state: module `c` is outside the
initial 256-document window; module `aa` sorts early and is initially delivered
to A as raw text although it does not enter A's Program. The guarded preload
records actual prepare inputs and the tests assert both initial conditions.

## RED and GREEN

Command, pinned Node 20.19.5:

```sh
"$NODE20" --test --test-concurrency=1 tests/semantic/group-late-dependency-version.test.mjs
```

Raw output directory: [request-identity](../reports/local-performance-evidence.md).
GREEN/characterization Worker SHA-256:
`564455ddfeae439d5bb2df428ff2a0512ac6a6d5d71a8b1c42effd6ba0eeb5b5`;
server SHA-256:
`e8284e00bedaca219e3fda407d5a4365293919a4edcf4a2f77ad1577385c2a0e`.

- [late-dependency-red.log](../reports/local-performance-evidence.md): first one-case RED; LSP successfully published
  C's old line 0 rather than current line 1, with 1 → 273 actual project inputs.
- [late-dependency-states-red.log](../reports/local-performance-evidence.md): both lazy and previously preloaded variants
  failed with the same wrong line 0. Their actual raw-window and Program-count
  preconditions passed. This is a correctness failure, not an unavailable result.
- [late-dependency-states-green.log](../reports/local-performance-evidence.md): after full metadata-delta consumption,
  old resident/lazy invalidation and actual lazy-SHA/version binding were
  integrated, both cases passed with the complete current line-1 location.

The source change itself is documented by the integrating group-version task.
These tests alone do not qualify the overall latency or memory target.

## Additional characterization and tool failure

Two further cases add independent D. They warm A/B/C/D, apply real L3 pressure
twice, edit C, let D consume the event, then recreate/query A before adding its
deep import. A guarded source-admission-token hook retains C's original token
while real physical identity checks and actual changed bytes remain current.
One case also disables the lazy snapshot cache in the private Worker preload
to exercise the single metadata fingerprint handoff without cached text/AST.

[late-dependency-extended-green.log](../reports/local-performance-evidence.md) records the first attempt: the original
two cases passed, but both added cases failed in the harness. The reused
`releasePreparedOwner` helper waited for an initialization notification already
consumed by this fixture. No product conclusion is drawn from those timeouts.
The duplicate wait was removed; no watchdog or product code was changed.

The corrected focused command used `--test-name-pattern='recreated=true'`.
[late-dependency-cold-characterization.log](../reports/local-performance-evidence.md) records **2/2 selected passed**, with
the original two explicitly unselected. Each case observed A owner 1 → 5,
two changed-metadata token-collision reads, the exact current C line-1 result,
273 actual project inputs and 256 delivered raw inputs excluding C.

These added cases are **pressure-recovery and cache-disabled characterization**,
not a newly established RED→GREEN cycle. No C registry entry/refcount was
observed immediately before the new A acquisition; the retained evidence does
not prove that B/C still held the old C SourceFile after pressure. Accordingly,
they do not claim to prove cold-owner shared-registry collision protection.
The original no-pressure RED→GREEN counterexamples remain independently valid.

All source edits occur in isolated temporary fixtures. No real Photos project,
sealed runtime/evidence archive, product artifact, remote branch or release was
modified by the tests.


## 最终同候选完整检查（2026-10-21）

冻结candidate-v2（manifest SHA256 `8c4f61823603b4ba64289d9d010d6738205ba53672a3be0d9a8fa3b81e7fb8a3`）
完整 `pnpm check:fast` 已通过1943/1943，失败/跳过/取消均0；Node20.19.5；pnpm 启动器版本限制见本页公开边界。
源码、全部仓库输入在运行期间不变，生产runtime与实测候选前后相同。
日志SHA256 `78019639e431abf47d6c0ecb8bb1fb914fe985429e7913804ecde6e37a3919a2`，
收据在[qualification.json](../reports/local-performance-evidence.md)。
本段是检查后的证据更新，运行时文档快照在[运行时文档快照](../reports/local-performance-evidence.md)；产品输入未变。
500ms及完整架构目标仍未完成；普通规模、内存负收益和限制见
[最终报告](../reports/2026-10-21-incremental-input-optimization.md)。
