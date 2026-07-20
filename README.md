# OpenPBL — AI 伴学项目式课堂协作系统

让每个学生经历完整的项目学习。AI 讲解知识并提供全过程认知支架，教师组织课堂并作出关键判断，学生在真实问题中独立构思、制作、展示和反思。

## 核心特性

### 六阶段项目式课堂

| 阶段 | 教师端 | 学生端 |
|------|--------|--------|
| 项目启动 | 发布驱动问题、设置课程参数 | 确认项目方向与成果要求 |
| AI 授知 | 组织课堂节奏、实时数据看板 | AI 多角色讲解核心知识、互动演示 |
| 方案构思 | 审批学生方案、校准方向 | 独立构思方案、AI 伴学小组反馈 |
| 项目实践 | 按需介入、推送支架 | 制作项目作品、过程文档记录 |
| 成果汇报 | 协同评价、成果审核 | 展示成果、同伴互评 |
| 学习反思 | 课程总结、教学复盘 | 回顾学习过程、形成方法证据 |

### AI 多角色伴学

六个 AI 伴学角色分别承担不同教学职能：

- **知知** — 知识讲解，负责核心概念传递
- **问问** — 启发提问，引导学生深入思考
- **灵灵** — 质疑挑战，检验方案可行性
- **策策** — 方案建议，提供多维度可选路径
- **评评** — 评审反馈，给出改进建议
- **记记** — 过程记录，归档学习证据

### 关键能力

- **AI 多角色授课**：场景化课件与讲解、互动演示与代码实操、过程性数据自动记录
- **教师关键判断**：实时课堂数据看板、按学生分类的介入提醒、方案审批与成果评价
- **学生独立项目**：个人项目空间与时间线、AI 伴学小组对话式辅导、学习证据自动归档
- **TTS 语音合成**：多角色独立音色配置、顺次发言与朗读、浏览器原生 TTS 兜底
- **课程生成**：基于 LLM 的多场景课程大纲生成、知识图谱构建、评价方案自动生成
- **实时同步**：WebSocket 增量推送 + 5s 长轮询降级，教师投屏与学生进度实时双向同步
- **生产级鉴权**：JWT + httpOnly cookie，教师账号密码登录、学生邀请码加入，按角色权限矩阵校验所有 action
- **课程重开与历史归档**：教师可对已结束课程重开课，当前课堂数据快照归档到 `CourseSession` 表，旧邀请码失效，新邀请码重新生成
- **可观测性**：pino 结构化日志（PII 脱敏）+ Prometheus 指标 + liveness/readiness 健康检查
- **优雅停机**：SIGTERM 触发时健康检查摘流、在途 SSE 发送 `shutdown` 事件、资源按序释放

## 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router, standalone 输出) |
| 语言 | TypeScript 5 |
| UI | React 19, Tailwind CSS 4, Radix UI, Lucide Icons |
| 状态管理 | Zustand 5 + Immer |
| 本地存储 | Dexie (IndexedDB) — Demo 模式降级使用 |
| 数据库 | PostgreSQL 16 + Prisma ORM |
| 鉴权 | JWT (jose, httpOnly cookie) + scrypt 密码哈希 + Next.js Middleware |
| 实时同步 | ws 库 + 内存事件总线(可扩展 Redis Pub/Sub) |
| 可观测性 | pino 结构化日志 + prom-client Prometheus 指标 |
| 富文本 | TipTap |
| 图表 | ECharts |
| 画布 | tldraw, React Flow |
| AI | Vercel AI SDK, OpenAI / Anthropic / Google / 通义千问 / DeepSeek |
| 语音 | 服务端 TTS + 浏览器原生 TTS |
| 测试 | Vitest(单元 + coverage) + Playwright(E2E) |
| 包管理 | pnpm 9 |
| 容器 | Docker 多阶段构建 + Nginx 反向代理 |

## 项目结构

```
openPBL/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API 路由
│   │   │   ├── auth/           # 登录/登出/加入/当前用户 (login/logout/me/join)
│   │   │   ├── openmaic/       # OpenMAIC 核心接口(课程生成/TTS/图片/健康检查)
│   │   │   ├── chat/companion/ # AI 伴学对话(SSE)
│   │   │   ├── session/        # 课堂会话管理
│   │   │   ├── uploads/        # 文件上传/下载(流式 + 限流 + 引用计数)
│   │   │   ├── courses/[id]/sessions/  # 课程历史开课归档
│   │   │   ├── health/         # live/readiness 健康检查
│   │   │   └── metrics/        # Prometheus 指标端点
│   │   ├── teacher/            # 教师端页面
│   │   │   ├── prepare/        # 课程备课(创建/核查/生成/预览)
│   │   │   ├── teach/          # 授课课堂(含 history 历史归档)
│   │   │   ├── login/          # 教师登录页
│   │   │   └── settings/       # 教师设置
│   │   ├── student/            # 学生端页面
│   │   │   ├── classroom/      # 听课课堂
│   │   │   └── ai-learning/    # AI 学习
│   │   └── page.tsx            # 首页(教师入口 + 学生邀请码加入)
│   ├── components/             # React 组件
│   ├── hooks/                  # 自定义 hooks(use-realtime-sync 等)
│   ├── lib/
│   │   ├── session/            # 会话状态管理 + actions reducer
│   │   ├── db/                 # Prisma client + session-repository
│   │   ├── auth/               # JWT session + password(scrypt) + rate-limit + action-permissions
│   │   ├── api/                # API 加固(error-codes + validate + schemas)
│   │   ├── realtime/           # WebSocket 服务端 + event-bus + patch-builder
│   │   ├── runtime/            # 优雅停机 lifecycle
│   │   ├── observability/      # pino logger + metrics + request-id + health-checks
│   │   ├── uploads/            # reference-tracker + cleanup
│   │   ├── llm/                # LLM 客户端 + 错误类层级
│   │   ├── openmaic/           # OpenMAIC 框架(子系统)
│   │   ├── companion/          # AI 伴学引擎
│   │   └── evaluation/         # 评价系统
│   ├── middleware.ts           # Next.js Edge middleware(路由级鉴权守卫)
│   └── instrumentation.ts      # Next.js 启动钩子(WS 服务端 + SIGTERM 处理)
├── prisma/
│   └── schema.prisma           # Prisma 数据模型(Course/Student/CourseSession/Teacher 等)
├── packages/                   # 本地子包(@openmaic/dsl/importer/renderer 等)
├── scripts/                    # CLI 脚本
│   ├── backup-db.ts            # 数据库备份(pg_dump)
│   ├── restore-db.ts           # 数据库恢复(pg_restore/psql)
│   ├── cleanup-uploads.ts      # 孤儿文件清理
│   └── migrate-json-to-db.ts   # JSON → PostgreSQL 一次性迁移
├── e2e/                        # Playwright E2E 测试
├── deploy/
│   ├── nginx.conf              # Nginx 反向代理模板(WS 升级 + SSE 长连接 + 安全头)
│   ├── backup-cron.yml         # K8s CronJob 备份配置
│   └── backup-cron.sh          # 系统 cron 备份脚本
├── .github/workflows/          # GitHub Actions(ci.yml + deploy.yml)
├── Dockerfile                  # 多阶段构建(deps + builder + runner)
├── docker-compose.yml          # app + postgres + redis
├── docker-compose.prod.yml     # 生产覆盖层(含 nginx)
├── .env.example                # 环境变量模板
├── next.config.ts              # Next.js 配置(standalone + 安全头)
├── playwright.config.ts        # Playwright 配置
└── vitest.config.mts           # Vitest + coverage 配置
```

## 环境要求

| 组件 | 版本 | 必需 |
|------|------|------|
| Node.js | ≥ 22.0.0 | 是 |
| pnpm | ≥ 9.0.0 | 是 |
| PostgreSQL | ≥ 14(推荐 16) | 生产必填,Demo 可省 |
| Redis | ≥ 6(推荐 7) | 可选(多实例部署需要) |
| Docker + Docker Compose | 最新稳定版 | 可选(推荐生产部署) |

## 安装部署

### 方式 A:Docker Compose 一键部署(生产推荐)

适合生产环境,自动编排 app + postgres + redis + nginx,内置健康检查、优雅停机、资源限制。

#### 1. 准备配置文件

```bash
cp .env.example .env.local
```

编辑 `.env.local`,**必须填写**以下字段:

```env
# 生成随机 JWT 密钥(≥ 32 字符)
openssl rand -base64 48  # 将输出粘贴到下面
JWT_SECRET=

# PostgreSQL 密码(docker-compose 必需)
POSTGRES_PASSWORD=change-me-to-a-strong-password

# 公网访问地址(课程生成回调需要,反代场景必填)
PUBLIC_BASE_URL=https://your-domain.com

# LLM 配置(必填,用于课程生成和 AI 对话)
OPENPBL_LLM_ENDPOINT=https://api.openai.com/v1
OPENPBL_LLM_API_KEY=sk-your-api-key
OPENPBL_LLM_MODEL=gpt-4o
```

#### 2. 启动服务栈

```bash
# 开发/测试环境
docker compose up -d

# 生产环境(含 nginx 反向代理 + 资源限制)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

#### 3. 初始化数据库(首次启动)

```bash
# 在运行中的 app 容器内执行迁移
docker compose exec app pnpm exec prisma migrate deploy

# (可选)从旧 JSON 数据迁移到数据库
docker compose exec app pnpm db:migrate-from-json
```

#### 4. 创建教师账号

```bash
# 进入 app 容器执行 Prisma Studio,或用脚本创建教师记录
docker compose exec app pnpm exec tsx -e "
  import { prisma } from './src/lib/db/client';
  import { hashPassword } from './src/lib/auth/password';
  const hash = hashPassword('your-password');
  await prisma.teacher.create({
    data: { username: 'teacher', passwordHash: hash, displayName: '教师' }
  });
  process.exit(0);
"
```

访问 `https://your-domain.com/teacher/login` 登录。

### 方式 B:本地开发部署

#### 1. 克隆并安装依赖

```bash
git clone <仓库地址> openPBL
cd openPBL
pnpm install
```

> `postinstall` 会自动构建 `packages/` 下的本地子包并执行 `prisma generate`。

#### 2. 配置环境变量

```bash
cp .env.example .env.local
```

最小配置(无数据库,仅 LLM):

```env
OPENPBL_LLM_ENDPOINT=https://api.openai.com/v1
OPENPBL_LLM_API_KEY=sk-your-api-key
OPENPBL_LLM_MODEL=gpt-4o
```

启用鉴权与数据库(推荐):

```env
# LLM
OPENPBL_LLM_ENDPOINT=https://api.openai.com/v1
OPENPBL_LLM_API_KEY=sk-your-api-key
OPENPBL_LLM_MODEL=gpt-4o

# 数据库(本地 PostgreSQL,或用 docker 单独起 postgres)
DATABASE_URL=postgresql://openpbl:openpbl@localhost:5432/openpbl

# JWT 密钥(≥ 32 字符,openssl rand -base64 48 生成)
JWT_SECRET=

# 公网访问地址(开发环境可填 http://localhost:3000)
PUBLIC_BASE_URL=http://localhost:3000

# WebSocket 端口(默认 3001)
WEBSOCKET_PORT=3001

# Redis(可选,多实例才需要)
# REDIS_URL=redis://localhost:6379
```

#### 3. 初始化数据库(若配置了 DATABASE_URL)

```bash
# 创建表结构
pnpm exec prisma migrate dev --name init

# (可选)从旧 JSON 数据迁移
pnpm db:migrate-from-json
```

未配置 `DATABASE_URL` 时进入 Demo 模式,数据存储在 IndexedDB + JSON 文件,功能受限(无鉴权、无跨进程并发、无持久化)。

#### 4. 创建教师账号(若配置了 JWT_SECRET)

```bash
pnpm exec tsx -e "
  import { prisma } from './src/lib/db/client';
  import { hashPassword } from './src/lib/auth/password';
  await prisma.teacher.create({
    data: {
      username: 'teacher',
      passwordHash: hashPassword('your-password'),
      displayName: '教师'
    }
  });
  process.exit(0);
"
```

#### 5. 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000。

- 教师入口:`/teacher`(未登录重定向到 `/teacher/login`)
- 学生入口:首页邀请码加入表单(调用 `/api/auth/join`)

### 方式 C:PM2 + Nginx 传统部署(Linux 生产)

#### 1. 构建项目

```bash
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm build
```

#### 2. 使用 PM2 守护进程

```bash
npm install -g pm2

# 启动(standalone 模式,无需 pnpm start)
pm2 start "node .next/standalone/server.js" --name openpbl

# 设置开机自启
pm2 startup
pm2 save
```

#### 3. Nginx 反向代理

参考 [`deploy/nginx.conf`](./deploy/nginx.conf) 完整模板(包含 WebSocket 升级、SSE 长连接、安全头)。精简版:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 上传文件大小限制(匹配应用层 50MB)
    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket 升级
    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }

    # SSE 长连接
    location ~ ^/api/(openmaic/generate|chat/companion) {
        proxy_pass http://127.0.0.1:3000;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

## 环境变量说明

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `OPENPBL_LLM_ENDPOINT` | 是 | — | LLM API 端点(兼容 OpenAI 接口) |
| `OPENPBL_LLM_API_KEY` | 是 | — | LLM API Key |
| `OPENPBL_LLM_MODEL` | 是 | — | LLM 模型名(如 `gpt-4o`),未配置时返回 `LlmNotConfiguredError` |
| `DATABASE_URL` | 生产必填 | — | PostgreSQL 连接串,未配置时进入 Demo 模式 |
| `JWT_SECRET` | 生产必填 | — | JWT 签名密钥(≥ 32 字符),未配置时跳过鉴权 |
| `PUBLIC_BASE_URL` | 生产必填 | — | 公网访问地址,课程生成回调使用 |
| `POSTGRES_PASSWORD` | Docker 必填 | — | docker-compose 内部 PostgreSQL 密码 |
| `WEBSOCKET_PORT` | 否 | `3001` | WebSocket 服务端口 |
| `REDIS_URL` | 否 | — | Redis 连接串(多实例部署需要,单实例用内存总线) |
| `PARALLEL_SCENE_CONCURRENCY` | 否 | `4` | 课程生成并发场景数(1-5) |
| `TTS_CONCURRENCY` | 否 | `2` | TTS 并发请求数 |

> LLM Provider 也可在教师端「设置」页面在线配置,设置页面的配置优先级高于环境变量。

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器(含 WebSocket 服务端) |
| `pnpm build` | 生产构建(standalone 输出) |
| `pnpm start` | 启动生产服务器 |
| `pnpm lint` | 运行 ESLint |
| `pnpm test` | 运行单元测试 |
| `pnpm test:watch` | 测试监听模式 |
| `pnpm test:coverage` | 运行测试并生成覆盖率报告(门槛 20-30%,目标 70%+) |
| `pnpm test:e2e` | 运行 Playwright E2E 测试 |
| `pnpm exec tsc --noEmit` | TypeScript 类型检查 |
| `pnpm exec prisma migrate dev` | 开发环境数据库迁移 |
| `pnpm exec prisma migrate deploy` | 生产环境数据库迁移 |
| `pnpm db:migrate-from-json` | 从旧 JSON 数据迁移到数据库 |
| `pnpm db:backup` | 数据库备份(`pg_dump`,输出到 `backups/`) |
| `pnpm db:restore <file>` | 数据库恢复(`pg_restore`/`psql`) |
| `pnpm cleanup:uploads` | 清理孤儿上传文件 |

## 使用指南

### 教师流程

1. **登录**:访问 `/teacher/login`,输入账号密码登录(JWT 7 天有效)
2. **创建课程**:点击「新建课程」→ 填写课程名称、学科、年级、课时和驱动问题
3. **课程核查**:按 5 个阶段核查 AI 生成的内容(基础信息 → 知识图谱 → 课程模块 → 课程大纲 → 评价方案)
4. **生成课程**:AI 基于 OpenMAIC 引擎生成多场景教学内容(PPT、互动、讲稿等)
5. **预览发布**:预览课程内容,确认后发布
6. **进入课堂**:进入授课界面,实时查看学生进度、投屏教学资源
7. **课堂管理**:在课堂中处理 AI 介入信号、推送支架、审批方案
8. **课程重开**:对已结束课程点击「重开课」→ 当前数据归档到历史记录 → 邀请码更新 → 直接重新授课
9. **查看历史**:课程详情页可查看历史开课记录(只读),用于教学复盘

### 学生流程

1. **加入课堂**:在首页输入教师提供的 6 位邀请码和姓名 → 服务端签发学生 JWT(1 天有效,绑定 courseId + studentId)
2. **AI 学习**:听 AI 多角色讲解,参与互动
3. **方案构思**:独立构思项目方案,获得 AI 伴学小组反馈
4. **项目实践**:在项目空间中制作作品,记录过程文档
5. **成果汇报**:展示项目成果
6. **学习反思**:回顾学习过程

### 设置页面

在教师端「设置」中可配置:

- **LLM Provider**:配置 API Endpoint、Model、API Key(支持 OpenAI / Anthropic / Google / 通义千问 / DeepSeek)
- **TTS 语音**:配置服务端 TTS Provider 和音色(支持 OpenAI TTS / Azure TTS / 通义千问 TTS / 浏览器原生 TTS)
- **AI 伴学音色**:为六个伴学角色分别配置不同 TTS 音色
- **ASR 语音识别**:配置语音输入
- **图片生成**:配置课程封面和教学图片生成 Provider

## 生产运维

### 健康检查

| 端点 | 用途 | 检查内容 |
|------|------|---------|
| `GET /api/health/live` | K8s liveness 探针 | 进程存活 + 是否正在停机(停机时返回 503) |
| `GET /api/health/ready` | K8s readiness 探针 | 数据库可连接 + LLM Provider 可达 + 文件系统可写 + Redis 可连接(并行检查,各 2s 超时) |
| `GET /api/metrics` | Prometheus 指标 | HTTP/LLM/TTS/WS/DB + Node.js 运行时指标 |
| `GET /api/openmaic/health` | OpenMAIC 子系统健康 | 兼容端点,内部调用 readiness 检查 |

### 优雅停机

收到 `SIGTERM`/`SIGINT` 时:

1. 健康检查立即返回 503(负载均衡摘除流量)
2. 拒绝新请求(返回 503)
3. 在途 SSE 流式响应发送 `event: shutdown` 事件后关闭
4. 等待在途请求完成(最长 25s)
5. 关闭 WebSocket 服务端
6. 关闭数据库连接
7. 退出进程

`docker compose` 配置 `stop_grace_period: 30s` 确保不被 SIGKILL。

### 数据备份与恢复

#### 自动备份(K8s)

参考 [`deploy/backup-cron.yml`](./deploy/backup-cron.yml),K8s CronJob 每天北京时间 02:00 执行 `pg_dump`,保留 7 天。

#### 自动备份(系统 cron)

```bash
# crontab -e
0 2 * * * /app/deploy/backup-cron.sh
```

#### 手动备份

```bash
# 备份(默认 custom 格式,7 天后自动清理)
pnpm db:backup

# 指定输出路径和格式
pnpm db:backup -- --output /tmp/backup.backup --format custom

# plain 格式 + gzip 压缩
pnpm db:backup -- --format plain --compress
```

#### 恢复

```bash
# 从 custom 格式恢复
pnpm db:restore backups/openpbl-20260720-020000.backup

# 从 plain SQL 恢复
pnpm db:restore backups/openpbl-20260720-020000.sql

# 危险:先删除现有数据库再恢复(三重确认)
pnpm db:restore backups/openpbl-20260720-020000.backup --drop-existing
```

### 监控与日志

- **日志**:pino JSON 格式输出到 stdout,自动脱敏 apiKey/邮箱/手机号/学生姓名
- **traceId**:每个响应包含 `X-Request-Id` 头,可通过 traceId 检索完整调用链
- **Prometheus 指标**:`http_requests_total`、`llm_calls_total`、`websocket_connections_active`、`classroom_active_total`、`db_query_duration_seconds` 等
- **Grafana**:接入 Prometheus 数据源即可(指标命名遵循 Prometheus 规范)

### 文件清理

```bash
# 清理孤儿文件(无数据库记录的磁盘文件)
pnpm cleanup:uploads -- orphans

# 清理指定课程的所有上传文件
pnpm cleanup:uploads -- course <courseId>

# 清理已结束课程超过 30 天的文件
pnpm cleanup:uploads -- expired --retain-days 30
```

## 安全说明

- **鉴权**:教师账号密码(scrypt 哈希,防时序攻击)+ JWT(httpOnly cookie,7 天);学生邀请码加入 + JWT(1 天,绑定 courseId + studentId)
- **路由守卫**:Next.js Middleware 在 Edge runtime 校验 JWT,`/teacher/*` 需教师 JWT,`/student/*` 需学生 JWT
- **权限矩阵**:`src/lib/auth/action-permissions.ts` 定义 31 个教师 action + 13 个学生 action + 3 个系统 action,所有 `/api/session/actions` 请求按角色校验
- **限流**:内存 LRU 限流器(可扩展 Redis),按 IP + userId 分桶
  - 登录:10 次/分钟/IP+username
  - LLM 生成:2 次/分钟/教师
  - 伴学对话:10 次/分钟/用户
  - TTS:30 次/分钟/用户
  - 图片生成:20 次/分钟/用户
  - 上传:20 次/小时/用户
  - 其他 API:120 次/分钟/用户
- **安全头**:`Strict-Transport-Security`、`Content-Security-Policy`、`X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、`Referrer-Policy`、`Permissions-Policy`
- **文件上传**:50MB 大小限制 + MIME 白名单 + 流式写入(避免 OOM)+ 引用计数(孤儿文件自动清理)
- **PII 脱敏**:日志中 apiKey → `***`、邮箱 → `a***@example.com`、学生姓名 → `张*`

## 数据存储

| 数据类型 | 存储位置 | 说明 |
|---------|---------|------|
| 课程、学生、提交、反馈等 | PostgreSQL | 生产模式,JSONB 字段存储复杂嵌套结构 |
| 课堂数据(Demo 模式) | IndexedDB + `.openpbl-data/session.json` | 无 DATABASE_URL 时降级 |
| 历史开课归档 | PostgreSQL `CourseSession` 表 | JSONB 完整快照 |
| LLM 设置 | `server-providers.yml` 或数据库 | 设置页配置优先于环境变量 |
| 上传文件 | `.openpbl-data/uploads/` + `UploadFile` 表 | 流式读写,引用计数管理 |
| 数据库备份 | `backups/` 目录 | `pg_dump` 输出,默认保留 7 天 |

## 测试

```bash
# 单元测试
pnpm test

# 单元测试 + 覆盖率
pnpm test:coverage

# E2E 测试(需先启动开发服务器)
pnpm test:e2e

# E2E 测试 UI 模式(交互式调试)
pnpm test:e2e:ui
```

当前测试状态:349 个单元测试全部通过,覆盖率基线约 25%(目标 70%+,逐步提升中)。E2E 测试为骨架,使用 `test.skip` 标记,待完善。

## LLM 配置说明

系统支持多种 LLM Provider,通过 OpenAI 兼容接口接入:

- **OpenAI**:GPT-4o / GPT-4o-mini(默认)
- **Anthropic**:Claude 3.5 Sonnet(通过兼容接口)
- **Google**:Gemini Pro(通过兼容接口)
- **通义千问**:qwen-plus / qwen-turbo
- **DeepSeek**:deepseek-chat / deepseek-coder
- **其他兼容 OpenAI 接口的 Provider**

可通过环境变量(`OPENPBL_LLM_*`)或设置页面配置。**不内置任何 fallback provider**,LLM 调用失败时明确报错(错误类层级:`LlmNotConfiguredError`、`LlmRateLimitError`、`LlmTimeoutError`、`LlmJsonModeUnsupportedError`、`LlmStreamCorruptedError`、`LlmEmptyResponseError`、`LlmCallFailedError`)。

## TTS 配置说明

- **服务端 TTS**:支持 OpenAI TTS、Azure TTS、通义千问 TTS 等(30s 超时)
- **浏览器原生 TTS**:作为兜底方案,无需额外配置,Demo 模式默认启用
- **角色音色**:可为每个 AI 伴学角色配置不同音色,在设置页面中配置
- **限流**:30 次/分钟/用户

## Windows 系统注意事项

- 如遇到 `sharp` 模块安装失败,确保已安装 [Visual C++ Redistributable](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist)
- PowerShell 执行策略可能阻止脚本运行,使用 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 解除
- 路径中避免中文和空格
- 开发推荐使用 WSL2 + Docker Desktop

## 许可证

本项目为私有项目，未经授权不得使用。
