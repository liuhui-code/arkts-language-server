# ADR0041：Windows索引首选D盘与会话级存储选择

- 日期：2026-11-02。
- 状态：**Proposed；用户已授权实现，不由实现结果替代人工审批。**
- 父版本：`e170a768d1d76d2fb88b1d383f4cf7143f85cc3f`。
- 关联：[0028缓存生命周期](0028-index-cache-lifecycle.md)、
  [0034私有catalog发布](0034-private-catalog-publication.md)、
  [配置](../configuration/index-storage.md)、[实施计划](../plans/2026-11-02-index-storage-location.md)。

## 问题与现有机制

原Windows路径是LOCALAPPDATA下的 `arkts-language-server/index`，通常在C盘。
现有 `ARKTS_INDEX_CACHE_DIR` 已覆盖平台默认；Zed扩展读取 `LspSettings.binary.env`，
管理命令已有 `--cache-dir`。无需引入另一套初始化/动态配置。
持久化范围是工作区SQLite、catalog发布库/文件、WAL/SHM及同根管理记录；
只读身份检查的有界临时副本另在OS临时目录，保持原契约。

## 决策

1. Windows未显式配置时首选 `D:\arkts-language-server\index`。
   macOS、Linux/XDG的默认路径不变，普通非Windows默认不引入额外写入探测。
   非空环境变量仍最高优先；相对配置保持原工作目录解析，推荐绝对路径。
2. 初始化之后、索引打开之前异步探测可用性；不阻塞LSP initialize或独立语义初始化。
   只在新建自有临时子目录中创建/写入/改名/删除探测文件，最终删除该自有空目录；
   不打开既有DB/WAL，不递归删除用户目录。实际SQLite打开/锁仍是权威检查。
3. 只有隐式Windows默认失败才尝试原LOCALAPPDATA位置；为空时由home推导。
   回退成功发出一次 `window/showMessage` Warning通知，并记录实际选择。
   显式配置失败不另选目录；两处默认均失败也不改用临时缓存。仅工作区索引不可用，
   语义状态不因存储失败被级联修改，告警给出路径、错误及修正/重启方法。
4. 环境在生产存储owner创建时快照；首份异步准备Promise由所有root共享。
   Windows仅规范化本功能/sidecar定位所用环境变量名，保留process.env的大小写不敏感语义；
   不折叠文件路径大小写，也不改写其他环境变量。非Windows保持名称大小写规则。
   成功/失败均不按每个请求或工作区重新探测。索引与维护使用同一实际目录；
   不在活跃会话中切换根或重新解释配置。关闭后不得新建存储/GC，准备中关闭不再打开sidecar。
5. 保持Rust现有工作区身份、64位哈希key、租约/并发打开及整组DB/WAL生命周期。
   不增加版本盐，不复制/移动/删除旧根，不因盘符偏好删除身份验证或全路径小写。
   新根首次建库是预期迁移成本；此决策不解决30K索引构建或WUI跳转成本。
6. 管理命令继续只读解析其请求根，显式 `--cache-dir` 优先于环境/默认；
   preview不执行写探测，也不读取持久化的“上次回退位置”。要管理回退根须显式给实际路径。
   维护仅在成功打开后启动并沿用0028；不扩大真实缓存清理授权。

## 依据、替代方案与边界

- [Node Windows路径](https://nodejs.org/api/path.html#windows-vs-posix)：使用 `D:\` 而非盘符相对 `D:`。
- [Node文件系统](https://nodejs.org/api/fs.html#fsaccesspath-mode-callback)：预先access不足以保证后续写入，
  Windows ACL尤其不能只靠W_OK判断。实际创建/写入/改名用于启动探测，不能声称它消除后续竞争。
- Zed [binary.env](https://zed.dev/docs/configuring-languages#configuring-language-servers)
  及本仓库扩展源码已有传递机制。沿用该机制，而不增加未被读取的JSON字段。
- 安装的vscode-languageserver9.0.1源码核对：window.showWarningMessage内部会发送request；
  此处用显式ShowMessageNotification，避免告警等待客户端回答或新增悬挂请求。
- Context7对Node/vscode-languageserver的解析均遇HTTP传输失败；回退官方文档和实际安装版本源码，未虚构获取正文。

拒绝静默回退、在全部目录失败后改写temp、仅检查D盘存在、预览写探测、每次查询切根，
以及迁移时递归复制/清空可能仍被其他窗口占用的SQLite/WAL。
盘符别名/NTFS ACL/Windows文件占用的实际表现须Windows验证；Mac上的策略注入不是Windows实机。
强制结束进程不保证finally运行，可能留下小型自有探测目录；本轮没有增加批量删除路线。

## 验证标准与记录

- RED/GREEN：Windows首选路径、缺盘回退、公开LSP配置错误告警及关闭owner不得再探测。
- 控制变量：Win32路径策略注入覆盖可写、ENOENT/EACCES/EPERM/EROFS/ENOSPC、显式优先、两处失败；
  Mac真实写探测验证既有DB/WAL字节不变，自有临时文件清理；非Windows默认路径/懒打开保留。
- 真实framed child LSP：错误目录仅索引degraded，同会话定义正常；真实native多root分库、重启目录复用，
  GC使用同一实际根、活动缓存受保护，关闭释放资源。
- 既有索引/目录/CLI只读、配置传递、日志、测试清单及类型检查回归；保留失败样本及未证实事项。
- 本轮不部署、提交、推送或合并。历史“不测试”授权只针对上一轮集成，不适用本轮。

实际命令、结果与Windows缺口见[验证报告](../reports/2026-11-02-index-storage-location.md)及
[TDD](../tdd/2026-11-02-index-storage-location.md)。
