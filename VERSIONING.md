# openPBL 双版本运行约定

<!-- OPENPBL_LEGACY_BOUNDARY -->

旧系统不复制进开发源码目录，而是固定在独立 Git 工作树中。这个边界确保旧实现可以被完整删除，不会把兼容代码永久留在新系统里。

| 版本 | 分支 | 本地目录 | 默认地址 | 数据目录 |
| --- | --- | --- | --- | --- |
| 稳定版 | `codex/stable-v1` | `C:\code\openPBL-stable` | `http://localhost:3000` | `C:\code\openPBL-stable\.openpbl-data` |
| 开发版 | `codex/openpbl-v2-dev` | `C:\code\openPBL` | `http://localhost:3100` | `C:\code\openPBL\.openpbl-data` |

## 日常命令

- `pnpm dev:dual`：后台同时启动稳定版和开发版。
- `pnpm versions:status`：查看两个版本的地址与运行状态。
- `pnpm dev:stop`：停止两个由脚本启动的进程。
- `pnpm promote:new`：输入确认短语后，停止服务、删除稳定工作树与稳定分支，并让新系统在 3000 端口运行。

运行日志和 PID 写入 `.openpbl-runtime`，不提交到仓库。两套系统拥有独立的 `.next`、依赖和演示数据，可以同时修改与运行。

## 删除标记

- `OPENPBL_LEGACY_BOUNDARY`：只出现在版本边界文档与管理脚本中。
- `OPENPBL_DEV_ENTRY`：用于标记新系统入口和新架构文件。

最终晋升不依赖逐文件搜索旧组件；`pnpm promote:new` 删除完整稳定工作树和分支，因此不会残留旧系统源码。
