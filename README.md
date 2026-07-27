# OpenPBL

OpenPBL 是面向项目式学习（PBL）课堂的 AI 教学与伴学平台。系统同时提供教师备课、课堂调度、学习监控和学生项目工作台，支持从项目启动、AI 授知到成果评价与反思的完整教学流程。

当前版本按“单台云服务器、2–3 名教师、50–80 名学生同时在线”的规模进行生产化设计。生产环境采用模块化单体架构，通过 Docker Compose 运行 Nginx、Next.js、PostgreSQL、Redis、实时服务、监控和备份组件。

> 当前开发分支包含较大范围的架构、安全、数据一致性和 UI 改造。部署前请完成本文的生产检查，不要直接复用早期版本的数据库、环境变量或 Compose 启动方式。

## 最新版能力

### 六阶段项目式课堂

系统默认提供六个连续阶段：

1. **项目启动**：项目导入，明确驱动问题、目标和启动任务。
2. **AI 授知**：通过 AI 课件、问答和检测完成基础知识建构。
3. **方案构思与校准**：学生形成项目方案，由 AI 与教师提供校准反馈。
4. **项目实践**：围绕任务、过程证据和作品持续迭代。
5. **成果汇报与评价**：提交并展示成果，完成教师评价。
6. **学习反思**：回顾学习过程、AI 使用方式和后续迁移计划。

学生提交的任务进度、方案、作品、回复、反思和 AI 学习进度会同步到教师端。教师可查看个人或全班完成情况、干预信号、在线状态和阶段门槛，并向学生发送课堂指令。

### 教师端

- 创建课程，设置学科、年级、课时、驱动问题和分组方式。
- 通过 AI 生成课程结构、教学场景、课件、语音和配套资源。
- 预览、校验和编辑课程内容后发布课堂。
- 管理项目启动、阶段推进、工作区开放策略和教师指令。
- 实时查看学生在线状态、任务完成度、学习证据和异常信号。
- 查看学生 AI 学习、方案校准、项目实践、汇报评价及反思结果。
- 在设置页管理模型、搜索、语音和媒体 Provider。

### 学生端

- 使用课程码和姓名加入课程，无需自行注册账号。
- 在统一课堂工作台完成任务、学习、方案、作品、汇报和反思。
- 使用多角色 AI 伴学助手获取提问、审阅、记录和表达支持。
- AI 授课采用专注式主播放器；自适应拓展内容直接插入主课程流程，不再跳转到独立学习窗口。
- 支持上传过程证据、查看教师反馈、接收课堂指令和断线恢复。

### 数据一致性与实时协作

- 课程写入采用增量持久化和短事务，不再以整份会话删除重建。
- 教师阶段切换等冲突敏感操作使用课程版本进行乐观并发控制。
- 写请求携带 UUID `requestId`，重复请求返回同一回执，避免网络重试造成重复提交。
- 课程事件持久化到 PostgreSQL，并通过 Redis 和 WebSocket 即时分发；断线后可按事件游标补发。
- 在线状态存放在 Redis，学生端定期续期，避免高频写入数据库。
- 高频数据已正规化为关系表，包括成员关系、待办完成记录、公告回复和资源下载记录。
- 白板通过 `@tldraw/sync` / `sync-core` 进行房间同步，并持久化到独立卷。

### 安全与可观测性

- API 在处理器内校验身份、角色、课程归属和资源所有权。
- 请求体、查询参数和生产环境变量使用 Zod 校验。
- 教师密码使用异步 Argon2id；旧 scrypt 密码仅保留登录兼容并在后续流程中迁移。
- JWT 固定算法、issuer、audience 和会话版本，生产密钥缺失时拒绝启动。
- Provider 凭据使用 AES-256-GCM 加密存储，生产密钥由 Docker Secret 注入。
- 登录、加入课程、普通写入、AI 和上传接口使用 Redis 限流。
- 上传执行大小、扩展名、文件头及 OOXML 内容校验，并通过受权 UUID 地址下载。
- 媒体代理、联网搜索和模型地址包含 SSRF 防护。
- 提供结构化日志、业务指标、Prometheus、Grafana 和依赖就绪检查。

## 系统架构

```mermaid
flowchart LR
    B["教师端 / 学生端"] --> N["Nginx · HTTPS"]
    N --> A["Next.js 应用"]
    N --> W["WebSocket / tldraw 同步"]
    A --> P["PostgreSQL"]
    A --> R["Redis"]
    W --> R
    W --> V["白板持久卷"]
    A --> U["上传持久卷"]
    P --> BK["pgBackRest / S3 兼容存储"]
    U --> RB["Restic / S3 兼容存储"]
    V --> RB
    A --> M["Prometheus / Grafana"]
```

生产环境只有 Nginx 对公网开放 `80/443`。应用、PostgreSQL、Redis、实时服务和监控端口均位于内部网络；Grafana 只绑定服务器回环地址。

## 技术栈

| 层级 | 主要技术 |
| --- | --- |
| Web | Next.js 16.2、React 19、TypeScript、Tailwind CSS 4 |
| 数据 | PostgreSQL 16、Prisma 6、Redis 7 |
| 实时协作 | WebSocket、Redis Pub/Sub、课程事件游标、tldraw sync |
| AI | Vercel AI SDK、OpenAI/Anthropic/Google 适配器、兼容 OpenAI 的 Provider |
| 内容 | OpenMAIC DSL/Importer/Renderer、TipTap、PptxGenJS |
| 验证 | Vitest、Playwright、k6、ESLint、TypeScript |
| 运维 | Docker Compose、Nginx、Prometheus、Grafana、pgBackRest、Restic |
| CI/CD | GitHub Actions、CodeQL、Trivy、SBOM、Cosign、GHCR |

## 当前验证状态

截至 2026-07-27，本地低资源验证结果如下：

- TypeScript 类型检查通过。
- ESLint 以零错误、零警告通过。
- Vitest 共 114 个测试文件、470 项测试通过。
- Prisma Schema 校验和数据库迁移状态检查通过。
- 生产依赖安全审计通过，官方 npm Registry 未报告已知漏洞。
- Next.js 16.2.12 生产构建通过。
- 本地开发服务启动成功，`/api/health/live` 返回 `200`。

这些结果表示当前代码通过了本机静态检查、自动化测试、构建和基础启动验证，不等同于云端容量验收。`target`、`stress`、`soak`、故障恢复和备份恢复测试仍须在候选云服务器及独立压测机上执行。

## 目录结构

```text
openPBL/
├─ src/
│  ├─ app/                    # 页面与 Route Handlers
│  ├─ components/             # 教师端、学生端和通用 UI
│  └─ lib/
│     ├─ auth/                # 登录、JWT、权限与密码
│     ├─ courses/             # 课程 API 合约、动作与事件
│     ├─ db/                  # Prisma 客户端和数据仓储
│     ├─ observability/       # 日志、指标和健康检查
│     ├─ openmaic/            # AI 授课与 Provider 服务
│     └─ session/             # 课堂领域类型和客户端状态
├─ prisma/                    # Schema 与数据库迁移
├─ packages/                  # 内置 OpenMAIC、PPTX 和公式工作区包
├─ tests/load/                # 可在独立测试机运行的 k6 压测套件
├─ e2e/                       # Playwright 核心流程测试
├─ deploy/                    # Nginx、监控、证书、备份和蓝绿发布
├─ scripts/                   # 数据库、初始化、清理和本地版本脚本
├─ docker-compose.yml         # 本地/开发完整环境
├─ docker-compose.prod.yml    # 独立生产环境
└─ Dockerfile                 # 应用与迁移镜像
```

生成文件不会作为源码维护。`output/`、`.next/`、测试报告和运行期数据不应提交到版本库。

## 环境要求

### 本地开发

- Node.js 22
- pnpm 10.4.1
- Docker Desktop 或可访问的 PostgreSQL 16
- Redis 7（推荐；实时事件和限流需要）

### 单机生产

- Ubuntu 24.04
- 4 vCPU、8 GB 内存
- 100 GB 以上 SSD
- 固定公网 IP 或域名
- Docker Engine 与 Docker Compose Plugin
- S3 兼容对象存储，用于异地数据库与文件备份

## 本地开发

### 1. 安装依赖

```bash
pnpm install --frozen-lockfile
```

安装过程会构建工作区包、生成 OpenMAIC 导入器浏览器资源，并生成带本地查询引擎的 Prisma Client。

### 2. 配置环境变量

Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
```

Linux/macOS：

```bash
cp .env.example .env.local
```

至少配置以下内容：

```dotenv
POSTGRES_PASSWORD=replace-with-a-local-password
DATABASE_URL=postgresql://openpbl:replace-with-a-local-password@localhost:5432/openpbl
REDIS_URL=redis://localhost:6379
PUBLIC_BASE_URL=http://localhost:3000
JWT_SECRET=replace-with-a-long-random-secret
PROVIDER_ENCRYPTION_KEY=replace-with-a-base64-encoded-32-byte-key
INTERNAL_MONITOR_TOKEN=replace-with-at-least-32-characters
TRUST_PROXY_HEADERS=false

ENABLE_WEBSOCKET=true
WEBSOCKET_PORT=3001
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:3001
```

生成密钥的常用命令：

```bash
openssl rand -base64 48
openssl rand -base64 32
```

第一个值可用于 `JWT_SECRET`，第二个值可用于 `PROVIDER_ENCRYPTION_KEY`。请勿提交填写后的 `.env.local`。

AI 课程生成可通过教师设置页配置 Provider，也可在开发环境填写：

```dotenv
OPENPBL_LLM_ENDPOINT=https://your-provider.example/v1
OPENPBL_LLM_API_KEY=your-api-key
OPENPBL_LLM_MODEL=your-model
```

未配置 LLM 时可以使用示例内容继续验证非 AI 流程，但真实课程生成、AI 对话、联网搜索或 TTS 需要相应 Provider。

### 3. 启动 PostgreSQL 与 Redis

```bash
docker compose --env-file .env.local up -d postgres redis
```

本地演示仍保留无数据库 JSON 存储兼容模式，但它不适用于多人并发、生产部署或可靠恢复。正式开发和验证应使用 PostgreSQL。

### 4. 初始化数据库

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:status
```

如需导入早期 JSON 数据，可在数据库迁移完成后执行：

```bash
pnpm db:migrate-from-json
```

当前生产数据模型允许重新初始化时，应优先使用完整迁移后的新数据库，而不是复用不兼容的旧表结构。

### 5. 创建首个教师账号

启动开发服务器后，可访问：

```text
http://localhost:3000/teacher/register
```

数据库中没有教师时，注册页面允许创建首个账号并自动登录。已有教师后，只有已登录教师才能通过同一页面继续创建其他教师账号，未登录访客不能公开注册教师。

也可以使用命令行初始化。命令只允许在数据库中尚无教师时执行，密码长度必须为 12–256 个字符。

PowerShell：

```powershell
$env:OPENPBL_INITIAL_TEACHER_PASSWORD = "replace-with-a-strong-password"
pnpm admin:init-teacher --username teacher --display-name "教师"
Remove-Item Env:OPENPBL_INITIAL_TEACHER_PASSWORD
```

Linux/macOS：

```bash
OPENPBL_INITIAL_TEACHER_PASSWORD='replace-with-a-strong-password' \
  pnpm admin:init-teacher --username teacher --display-name '教师'
```

### 6. 启动系统

```bash
pnpm dev
```

打开：

- 首页：<http://localhost:3000>
- 教师登录：<http://localhost:3000/teacher/login>
- 首次教师注册：<http://localhost:3000/teacher/register>
- 学生入口：<http://localhost:3000/student>

如需将 Next.js 固定运行在 `3100` 端口，可使用 `pnpm dev:next`。仓库还提供 Windows 双版本本地运行脚本：`pnpm dev:dual`、`pnpm versions:status` 和 `pnpm dev:stop`，具体规则见 [VERSIONING.md](VERSIONING.md)。

## 基本使用方法

### 教师流程

1. 访问 `/teacher/login` 并登录初始化的教师账号。
2. 在教师主页创建课程，填写课程目标、驱动问题、课时和分组方式。
3. 进入备课流程，生成或导入教学内容，并完成资源、预览和校验。
4. 发布课程并获得课程码。
5. 在课堂控制台开始授课，观察学生上线、任务完成和学习进度。
6. 根据阶段门槛、干预信号和学生证据推进课程。
7. 在成果评价与反思阶段完成评价和课程总结。

### 学生流程

1. 访问 `/student`，输入课程码和姓名加入课程。
2. 按当前阶段完成启动任务和 AI 学习内容。
3. 在方案与实践阶段使用任务区、证据上传和 AI 伴学工作区。
4. 查看教师指令与反馈；断线重连后系统会补发遗漏事件。
5. 上传最终成果，完成汇报、评价确认和个人反思。

## 课程 API

新版客户端以课程域接口为主：

| 接口 | 用途 |
| --- | --- |
| `GET /api/courses/:courseId/state` | 获取按角色裁剪的课程快照，支持 ETag |
| `POST /api/courses/:courseId/actions` | 提交带 `requestId` 和可选版本号的课程动作 |
| `GET /api/courses/:courseId/events?after=<cursor>` | 按游标补发断线期间事件 |
| `PUT/DELETE /api/courses/:courseId/presence` | 在线续期与离线 |
| `POST /api/uploads` | 受权文件上传 |
| `GET /api/uploads/:id` | 受权文件下载 |

写入成功会返回请求 ID、课程版本和事件游标。业务调用应使用这些接口，不要重新引入整份会话覆盖式写入。

## 生产部署

生产配置是独立的 [docker-compose.prod.yml](docker-compose.prod.yml)，不能与开发 Compose 叠加使用。更完整的服务器步骤见 [deploy/README.md](deploy/README.md)。

### 1. 准备服务器配置

在服务器仓库目录创建：

```bash
cp deploy/.deploy.env.example deploy/.deploy.env
mkdir -p deploy/secrets
chmod 700 deploy/secrets
```

编辑 `deploy/.deploy.env`，至少设置：

- `PUBLIC_HOST`
- `OPENPBL_IMAGE`
- `OPENPBL_MIGRATOR_IMAGE`
- `OPENPBL_UPSTREAM`
- S3 兼容备份地址、桶和区域

应用和迁移镜像必须使用精确 Git SHA 标签或不可变 digest，不要使用 `latest`。

按照 [deploy/secrets.example/README.md](deploy/secrets.example/README.md) 创建所有 Secret 文件并设置为 `0600`，包括：

- PostgreSQL 密码与 `database_url.txt`
- JWT 密钥
- Provider 加密密钥
- 内部监控令牌
- Grafana 管理员密码
- S3、Restic 与压测令牌

`database_url.txt` 必须使用标准 PostgreSQL URL，例如：

```text
postgresql://openpbl:URL_ENCODED_PASSWORD@postgres:5432/openpbl?connection_limit=30&pool_timeout=10
```

### 2. 申请 HTTPS 证书

设置 Let’s Encrypt 邮箱，然后执行：

```bash
export LETSENCRYPT_EMAIL=admin@example.com
./deploy/bootstrap-certificate.sh
```

Nginx 支持 WebSocket、SSE、静态缓存、请求体限制和安全响应头。证书续期容器会定期检查证书，Nginx 周期性无中断重载。

### 3. 启动首个蓝色版本

```bash
docker compose \
  --env-file deploy/.deploy.env \
  -f docker-compose.prod.yml \
  --profile blue \
  --profile certificate \
  --profile observability \
  --profile backup \
  up -d
```

迁移服务会先执行数据库迁移，成功后应用才启动。仅 Nginx 暴露 `80/443`；不要额外映射应用、数据库、Redis 或 tldraw 端口。

### 4. 初始化生产教师

```bash
export OPENPBL_INITIAL_TEACHER_PASSWORD='replace-with-a-strong-password'
docker compose \
  --env-file deploy/.deploy.env \
  -f docker-compose.prod.yml \
  run --rm \
  -e OPENPBL_INITIAL_TEACHER_PASSWORD \
  migrate pnpm exec tsx scripts/init-teacher.ts \
  --username teacher \
  --display-name "教师"
unset OPENPBL_INITIAL_TEACHER_PASSWORD
```

### 5. 后续蓝绿发布

```bash
./deploy/blue-green-deploy.sh <app-image> <matching-migrator-image>
```

发布脚本使用匹配的应用和迁移镜像进行健康检查、上游切换及失败回滚。生产流水线位于 `.github/workflows/`，包含类型检查、测试、构建、依赖审计、CodeQL、Trivy、SBOM、镜像签名和人工批准部署。

## 健康检查、监控与备份

| 地址 | 可见性 | 说明 |
| --- | --- | --- |
| `/api/health/live` | 最小公开 | 进程存活检查 |
| `/api/health/ready` | 内部令牌保护 | PostgreSQL、Redis、文件系统等就绪检查 |
| `/api/metrics` | 内部令牌保护 | Prometheus 指标 |
| Grafana `127.0.0.1:3002` | 仅服务器本机 | 建议通过 SSH 隧道访问 |

日志以 JSON 结构记录 `requestId`、`userId` 和 `courseId` 等上下文。监控覆盖 HTTP 延迟与错误率、WebSocket 连接、事件积压、数据库连接池、Redis、资源使用、证书和备份状态。

数据库使用 pgBackRest 和 WAL 归档，上传与白板卷使用 Restic 增量备份。配置、备份执行和恢复演练见 [deploy/backup/README.md](deploy/backup/README.md)。生产目标为数据库 RPO 不超过 5 分钟、RTO 不超过 60 分钟，并应每月执行一次异地恢复演练。

## 测试与质量检查

### 本机轻量验证

```bash
pnpm typecheck
pnpm lint:ci
pnpm test:ci
pnpm audit:prod
pnpm exec prisma validate
pnpm build
```

核心浏览器冒烟测试：

```bash
pnpm playwright:install
pnpm test:e2e
```

端到端师生数据链路检查：

```bash
pnpm test:classroom-flow
```

开发电脑不执行 50–80 人并发、两小时稳定性、数据库连接耗尽、网络故障或磁盘压力测试。

### 云端 k6 压测

压测套件位于 [tests/load](tests/load/README.md)，应从与候选服务器同地域的独立临时测试机运行：

```bash
docker compose -f tests/load/docker-compose.yml run --rm smoke
docker compose -f tests/load/docker-compose.yml run --rm target
docker compose -f tests/load/docker-compose.yml run --rm stress
docker compose -f tests/load/docker-compose.yml run --rm soak
```

固定场景：

| 场景 | 负载 |
| --- | --- |
| `smoke` | 1 名教师、5 名学生，3 分钟 |
| `target` | 10 分钟升至 3 名教师、80 名学生，再稳定 30 分钟 |
| `stress` | 逐步升至 100、120 名学生 |
| `soak` | 3 名教师、80 名学生，2 小时 |

套件会创建带 `runId` 的隔离教师、课程和学生数据，验证登录、课程状态、在线续期、学生提交、教师写入、上传、WebSocket、幂等回执、事件顺序和断线补发。结束时只清理本次 `runId` 数据，并在 `tests/load/reports/` 生成 JSON 与 HTML 报告。

生产环境默认关闭 `/api/load-test/runs`。只有候选环境压测期间才可设置 `ENABLE_LOAD_TEST_API=true`，同时限制独立压测机 IP；结束后必须关闭并确认该接口返回 `404`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动本地开发服务器 |
| `pnpm build` | 创建生产构建 |
| `pnpm start` | 启动本地生产构建 |
| `pnpm typecheck` | 生成 Next 类型并执行 TypeScript 检查 |
| `pnpm lint:ci` | ESLint，禁止警告 |
| `pnpm test:ci` | 以最多两个 worker 运行 Vitest |
| `pnpm test:e2e` | 运行 Playwright |
| `pnpm db:generate` | 生成可本地连接 PostgreSQL 的 Prisma Client |
| `pnpm db:migrate` | 创建/应用开发迁移 |
| `pnpm db:migrate:prod` | 应用已有生产迁移 |
| `pnpm db:status` | 检查迁移状态 |
| `pnpm db:studio` | 打开 Prisma Studio |
| `pnpm admin:init-teacher` | 一次性初始化首个教师 |
| `pnpm cleanup:uploads` | 清理孤立上传文件 |

## 常见问题

### Prisma 报错 P6001：URL 必须以 `prisma://` 开头

这通常表示 Prisma Client 曾在 `PRISMA_GENERATE_NO_ENGINE` 环境下生成，导致本地 PostgreSQL URL 被误当作 Data Proxy URL。不要把 `DATABASE_URL` 改成 `prisma://`；本项目使用的是普通 PostgreSQL。

执行：

```bash
pnpm db:generate
pnpm db:status
```

项目的 `scripts/run-prisma.mjs` 会加载 `.env.local`、移除 `PRISMA_GENERATE_NO_ENGINE`，强制生成本地 library 查询引擎，并在生成后检查引擎文件。

### Prisma 报表或字段不存在

先确认 `DATABASE_URL` 指向预期数据库，再应用迁移：

```bash
pnpm db:migrate:prod
pnpm db:status
```

不要通过手工建表绕过 `prisma/migrations/`。

### 教师页面可以打开，但课程接口持续返回 401

生产化改造为 JWT 增加了数据库会话版本。改造前签发的旧 Cookie 不含该字段，必须重新登录一次：

1. 刷新当前教师页面，系统会自动跳转到 `/teacher/login`。
2. 使用现有教师账号重新登录。
3. 如果浏览器仍保留旧状态，在教师头像菜单选择“退出登录”，再重新登录。

新版 Proxy 会在受保护页面加载前拒绝旧令牌，课程 API 遇到失效会话也会主动引导重新认证，因此重新登录后不需要重复执行该操作。

### 学生有进度，但教师端仍显示 0

最新版已统一项目启动阶段键名并使用课程动作与事件链路同步进度。排查时依次确认：

1. 浏览器实际运行的是当前构建，且没有旧 Service Worker 或缓存页面。
2. 学生和教师进入的是同一个课程 ID。
3. `/api/courses/:courseId/actions` 返回成功回执。
4. WebSocket 已连接；断线时 `/events?after=<cursor>` 能补发事件。
5. PostgreSQL 迁移为最新状态，Redis 可用。

可运行 `pnpm test:classroom-flow` 检查学生提交到教师读取的完整数据链路。

### Provider 配置加载失败

- 本地开发：确认 `.env.local` 的 `DATABASE_URL` 为 `postgresql://...`，并重新执行 `pnpm db:generate`。
- 生产环境：确认 `provider_encryption_key.txt` 是 32 字节随机值的 Base64 编码，且应用可读取 Docker Secret。
- 不要提交真实的 `server-providers.yml`、`.env.local` 或 Secret 文件。

### Windows 端口被占用

检查 `3000`、`3001`、`5432` 和 `6379`。如只需避免 Next.js 的 `3000` 冲突，可运行：

```bash
pnpm dev:next
```

此时同步调整 `PUBLIC_BASE_URL` 和 `NEXT_PUBLIC_WEBSOCKET_URL`。

## 进一步文档

- [生产部署](deploy/README.md)
- [备份与恢复](deploy/backup/README.md)
- [云端压测](tests/load/README.md)
- [本地双版本运行](VERSIONING.md)
- [设计系统](DESIGN-SYSTEM.md)
- [架构决策记录](docs/adr)

## 许可证

本项目为私有项目，未经授权不得使用、复制或分发。
