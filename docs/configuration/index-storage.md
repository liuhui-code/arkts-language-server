# 索引存储目录

此设置控制语言服务器的**持久化工作区索引**，沿用进程环境变量 `ARKTS_INDEX_CACHE_DIR`。
不新增 `initialization_options.index` 或 `settings.arkts.index`；这些不是当前实现支持的配置入口。
修改配置后须重启语言服务，新会话才会选择目录；正在使用的会话不切换存储根。

## 默认值与优先级

| 系统 | 未显式配置时的目录 |
|---|---|
| Windows | 首选 `D:\arkts-language-server\index` |
| macOS | `~/Library/Caches/arkts-language-server/index`，保持原行为 |
| Linux等 | `$XDG_CACHE_HOME/arkts-language-server/index`；未设置XDG时为 `~/.cache/arkts-language-server/index`，保持原行为 |

LSP优先使用非空 `ARKTS_INDEX_CACHE_DIR`，其次使用平台默认值。
推荐绝对路径；相对值沿用原行为，按语言服务进程工作目录解析。
路径中的大小写、空格与Unicode保留；Windows可使用 `E:/ArkTSCache` 或转义后的反斜杠。
不会自动展开JSON字符串中的 `%LOCALAPPDATA%`、`$HOME` 或 `~`。
Windows按系统语义不区分这些环境变量名的大小写；路径本身不会转成小写。

Windows默认D目录不存在时会尝试创建，但不会创建不存在的D盘。
创建、写入、改名或删除自有探测文件失败（例如盘符缺失、权限不足、只读、空间不足）时，
尝试原来的 `%LOCALAPPDATA%\arkts-language-server\index`。
LOCALAPPDATA未设置或为空时用 `<用户主目录>\AppData\Local\arkts-language-server\index`。
**回退成功会发送一次LSP Warning通知**，包含首选目录、错误、实际目录及配置方法。
结构化日志 `index.cache.directory.selected` 的 `directory/source/requestedDirectory` 记录实际选择。

用户显式配置的目录失败时不会悄悄写到D盘、用户目录或系统临时目录。
两处默认目录都失败时也不会另选临时缓存。会告警并将工作区索引标为degraded，
当前文档的语义服务继续按自身SDK/输入条件运行；这不是全语言服务降级的触发器。
实际SQLite打开、锁及后续I/O仍由原索引生命周期管理；启动探测不是未来永不出错的承诺。

## Zed配置示例

合并到用户或项目的 `settings.json`：

```json
{
  "lsp": {
    "arkts-language-server": {
      "binary": {
        "env": {
          "ARKTS_INDEX_CACHE_DIR": "E:/ArkTSCache"
        }
      }
    }
  }
}
```

本仓库扩展已经通过 `LspSettings.binary.env` 向默认launcher或显式binary传递这些变量；
无需修改扩展或额外设置 binary.path。配置后执行Zed的“Restart Language Server”。
配置不会自动改变SDK路径；保留原有SDK配置。
这是已有[Zed binary.env机制](https://zed.dev/docs/configuring-languages#configuring-language-servers)，
本次没有将协议测试冒充真实Zed UI验收。

PowerShell中可为后续启动的进程设置：

```powershell
$env:ARKTS_INDEX_CACHE_DIR = 'E:\ArkTSCache'
arkts-language-server --index-cache preview
```

已运行的Zed不会重新读取另一个Shell后来修改的环境；GUI场景优先用上面的binary.env。

## 文件范围与多工作区隔离

所有常驻SQLite主库、WAL/SHM、`catalog-state.sqlite3`、私有 `catalog-*.sqlite3`、
发布锁、使用记录及维护锁/状态/退役区均继续位于选定根下。
工作区数据保留 `<根>/workspaces/<64位工作区哈希>/` 布局；
key来自规范物理工作区URI，不增加server版本或每次启动的随机盐。
不同根不会混库，同一物理工作区跨窗口沿用原租约/SQLite并发保护；不改变盘符/真实路径身份规则。

修改存储根不会自动复制、移动或删除旧索引。新根首次建立自己的缓存，之后复用；
重新配置到旧根可继续使用旧缓存。正常安全维护策略仍是[ADR0028](../adr/0028-index-cache-lifecycle.md)，
只作用于当前选定根，不会为迁移而遍历或清理其他位置。

日志目录、安装release、Zed自身数据、项目源码和SDK安装不在本设置范围内。
GC为保持只读检查而生成的有界DB/WAL身份核验副本仍使用系统临时目录，遵守原生命周期；
它们不是选定根下的常驻项目索引。本次不修改该独立临时检查机制。

## 管理命令

`--index-cache preview|clean --cache-dir DIRECTORY` 的显式目录优先于环境变量和平台默认值。
未给该参数则按环境变量/平台**首选路径**解析。
管理员命令不执行LSP的写入探测、不猜测此前会话的回退位置，preview仍只读。
管理曾回退的目录时，使用日志/告警中的实际路径：

```powershell
arkts-language-server --index-cache preview --cache-dir 'C:\Users\example\AppData\Local\arkts-language-server\index'
```

本次实现及验证边界见[ADR0041](../adr/0041-windows-index-storage-location.md)和
[验证报告](../reports/2026-11-02-index-storage-location.md)。
