# PrAIxis

PrAIxis（Praxis + AI）是面向项目式学习课堂的 AI 教学与伴学平台。Praxis 意味着通过行动与反思发生的学习；PrAIxis 将 AI 嵌入实践，使其成为探究、设计、创作与反馈中的参与者、支架和协作者，同时让学生始终拥有判断、行动、证据与反思。系统支持教师备课、课堂调度、学习监控和学生项目工作台，贯通从项目启动到成果评价与反思的完整教学流程。

当前版本按“单台云服务器、2–3 名教师、50–80 名学生同时在线”的规模进行生产化设计。生产环境采用模块化单体架构，通过 Docker Compose 运行 Nginx、Next.js、PostgreSQL、Redis、实时服务、监控和备份组件。

> 当前开发分支包含较大范围的架构、安全、数据一致性、课程生成和 UI 改造。部署前必须完成本文的“服务器迁移检查清单”，不要直接复用早期版本的数据库、环境变量、镜像或 Compose 启动方式。

## 2026-08-17 当前版本摘要

当前部署基线为提交 `92682e3`。自上一轮生产说明（2026-08-11）以来，系统已完成 OpenMAIC 适配、课程生成恢复和学生工作台升级；部署时必须使用当前提交对应的应用镜像与 migrator 镜像。核心变化包括：

- **先基础、后深互动**：自适应先修学习成为进入主课程的严格边界，课程末端增加掌握度检查；只有基础知识达标后才进入深度交互课堂。
- **角色化知识结构**：教师端保留课程设计与审校信息，学生端展示适合学习的知识路径，避免把专家级内部字段直接暴露给学生。
- **AI 直接协作工作台**：伴学 AI 可围绕当前项目任务直接协助编辑、整理资源和沉淀过程证据；项目工作区、资源库与过程档案形成连续链路。
- **页面级白板与资源就绪检查**：白板状态按课堂页面保留，生成流程在发布前审计图片、视频、语音和教学工具资源，减少切页丢失与不完整课程进入课堂。
- **可管理的生成恢复**：快速设计和最终课堂生成统一采用可恢复任务、失败策略与检查点，进程重启或蓝绿切换后继续未完成工作。

- **证据驱动课堂**：课程新增学习证据、作品快照、AI 贡献、学生 AI 决策和 AI 评价建议等数据契约；启动、方案、实践、汇报和反思阶段统一为可追踪的证据任务。
- **课堂运行体验**：教师授课控制台、学生任务界面、AI 授知播放器和字幕系统重新设计；增加课程时间预算、语音时长校准、页面切换恢复和沉浸式伴学角色动作。
- **原生课堂工具**：AI 授课现在可以通过与课堂动作一致的 OpenMAIC Action DSL 调用白板、随堂检测、证据看板更新和嵌入式组件；同一套动作进入校验、播放和状态持久化链路，可通过 `OPENMAIC_NATIVE_CLASSROOM_TOOLS=false` 临时回退。
- **备课与生成质量**：重构课程大纲、知识图谱、教学活动与六模块时间分配；加强中文生成契约、提示词质量检查、知识点覆盖和内容去重。
- **持久后台生成与自动存档**：生产环境中课程生成使用 PostgreSQL 持久任务。教师离开页面后任务继续运行，重新进入时续接同一个任务，避免重复生成。学生课堂和教师资源在任务标记完成前就关联并保存到课程，不依赖“发布课程”操作。
- **逐页检查点恢复**：最终课堂生成会持久化规范化大纲和每个页面的完成检查点；进程重启、蓝绿切换或瞬态故障后只重做尚未完成或大纲指纹已变化的页面，不再整课从头生成。
- **双模式课程设计**：新建课程后直接进入极简的“快速生成”输入页；教师也可以单向进入高级分步设计。快速模式不是另一套简化生成器，而是依次调用与分步模式相同的课程定位、知识图谱、项目成果、评价、六阶段架构、OpenMAIC 主课脚本和个性化路径能力，每阶段通过结构检查与 AI 审校后才继续。
- **代理式自动修订**：快速模式中的 AI 审校意见不会直接作为教师端报错。代理会读取完整阶段结果，自动协调课程目标、驱动问题、成果和固定课时，或按意见重新调用该阶段生成能力；普通内容质量问题经过多轮修订后继续流程，只有必填结构缺失、模型或持久化等不可恢复故障才终止。
- **快速模式内大纲审阅**：主课脚本生成后，快速页面提供独立审阅弹窗并暂停后台流程，不跳转高级分步页面；教师保存后以最新 scene outlines 继续，未打开则在等待窗口结束后自动继续。丰富互动和教师资源均由共享 OpenMAIC 约束生成，学生 PPT 单页最长 6 分钟。
- **端到端真实产物画布**：快速生成从课程定位一直连续展示到最终课堂页面、媒体资源和自动保存，不再跳转普通生成页。画布遵循系统暖白表面、教师蓝主色、14px 圆角和细边框规范；主卡自身持续轻微悬浮，左右侧卡通过缩放、透明度、错位和独立运动形成景深，不在主卡正后方增加垫片卡。新旧主卡切换时短暂交叠并连续翻页，避免先消失再出现的空白断帧。知识数据转换为“基础—核心—应用—拓展”的学习逻辑；评价卡使用两层实体嵌套圆环：后方更宽的淡色背景环只按实际权重分成教师评与 AI 评两部分，前方更细的彩色规则环按每条真实评价规则及权重分段，旁侧同步展示规则标题和可观察判据；六阶段时间、成果契约、教学协作、课程大纲、逐页制作、个性化路径、图片/视频、TTS 和存档分别使用不同的高密度构图。侧卡长标题会自动截断，主卡至少停留一段可读时间，但后台生成持续推进；总进度和预计时间覆盖课程设计、最终课堂制作及全部资源后处理。
- **后台写入并发安全**：快速生成工作器禁止用启动时捕获的完整课程快照覆盖数据库，只把本阶段课程设计字段合并到最新课程版本，保留教师编辑、学生、课堂运行和会话数据。出现乐观并发冲突时会重新读取最新聚合再执行合并。
- **统一生成动效**：知识图谱、阶段架构、主课脚本和个性化路径统一使用任务专属的翻卡片弹窗。主课脚本在首条流式内容出现前显示弹窗，随后自动回到页面内逐页生成。
- **准确进度与剩余时间**：进度按已完成课堂页面持续推进，不再长时间停留在固定百分比；初始时间按页面和分层资源数量估算，随后按实际吞吐速度校准。
- **分阶段模型请求策略**：普通结构化调用与知识图谱、六阶段方案、页面大纲、整课等长输出任务使用不同的超时预算；瞬态超时、限流、网络错误和服务端错误按策略重试，鉴权或结构错误不会盲目重试。
- **分层学习资源**：教师确认的先决知识和额外学习资源与主课程一并生成、保存，并接入同一播放器。
- **可靠性与安全**：增强课程版本冲突重试、在线状态、上传权限、教师注册、代码分块加载恢复和生产构建隔离。

### 服务器迁移检查清单

以下项目是本版本迁移的硬性条件：

| 项目 | 必须确认的内容 |
| --- | --- |
| 数据库 | 先备份，再通过迁移镜像执行全部 Prisma migration；重点确认 `20260731163000_evidence_driven_classroom`、`20260809153000_course_generation_jobs`、`20260810143000_course_design_generation_jobs`、`20260810195000_course_design_outline_review` 和 `20260811100000_course_generation_page_checkpoints` 已应用。 |
| 镜像 | 应用镜像和 migrator 镜像必须来自同一 Git SHA；禁止混用旧 migrator、新应用或 `latest`。 |
| 后台生成 | 使用长驻 Node.js/Docker 服务，生产设置 `COURSE_GENERATION_BACKGROUND_ENABLED=true`；该开关同时控制快速设计工作器和最终课堂工作器，不要部署到会在请求结束后冻结进程的纯 Serverless 运行时。 |
| 生成课堂文件 | `/app/data/classrooms` 必须使用所有蓝绿应用实例共享的 `classrooms` 持久卷，其中包含课堂 JSON、图片、视频和语音。 |
| 其他持久卷 | 同时保留 PostgreSQL、`uploads`、`whiteboards`、证书、监控和备份状态卷；不要在发布时执行 `down -v`。 |
| Provider 密钥 | 必须保留原 `PROVIDER_ENCRYPTION_KEY`；更换后数据库中已有 Provider 凭据无法解密。 |
| JWT 密钥 | 保留原 `JWT_SECRET` 可维持现有登录会话；更换会使所有教师和学生重新登录。 |
| 公网地址 | `PUBLIC_BASE_URL` 必须是实际 HTTPS 地址，域名、证书和 Nginx 转发必须一致；后台媒体生成会使用该地址。 |
| Redis | Redis 用于限流、在线状态、发布订阅和实时通知，可以重建，但不能作为课程、生成任务或课堂文件的唯一存储。 |
| 备份 | pgBackRest 备份 PostgreSQL；Restic 必须覆盖 `uploads`、`whiteboards` 和 `classrooms` 三个文件卷，并执行恢复演练。 |

生产 Compose 已包含 `classrooms` 共享卷及对应 Restic 备份挂载。蓝绿切换前，应分别检查新旧应用实例能读取同一课程的课堂文件。

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
- 生产环境支持课程在后台持续生成；离开页面后仍可继续，返回时自动恢复进度或进入预览。
- 最终课堂按页面持久化检查点；任务被重新领取后复用已完成且大纲指纹一致的页面。
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
- AI 可在受控动作链路中调用白板、随堂检测、证据看板和课堂组件，所有工具调用均经过 DSL 校验和播放状态同步。
- 支持上传过程证据、查看教师反馈、接收课堂指令和断线恢复。

### 数据一致性与实时协作

- 课程写入采用增量持久化和短事务，不再以整份会话删除重建。
- 教师阶段切换等冲突敏感操作使用课程版本进行乐观并发控制。
- 写请求携带 UUID `requestId`，重复请求返回同一回执，避免网络重试造成重复提交。
- 课程事件持久化到 PostgreSQL，并通过 Redis 和 WebSocket 即时分发；断线后可按事件游标补发。
- 在线状态存放在 Redis，学生端定期续期，避免高频写入数据库。
- 高频数据已正规化为关系表，包括成员关系、待办完成记录、公告回复和资源下载记录。
- 课程生成任务保存在 PostgreSQL，每门课程只有一个当前任务；页面重进和网络重试不会创建重复课堂。
- 课堂大纲与逐页生成检查点保存在 PostgreSQL；任务恢复时会核对页面键、顺序与大纲指纹，仅复用仍然有效的页面。
- 学习证据、作品快照、AI 贡献、学生 AI 决策和 AI 评价建议作为课程规范数据保存。
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
    A --> G["持久课程生成工作器"]
    A --> D["持久课程设计工作器"]
    D --> P
    D --> G
    G --> P
    A --> P["PostgreSQL"]
    A --> R["Redis"]
    W --> R
    W --> V["白板持久卷"]
    A --> U["上传持久卷"]
    G --> C["课堂与媒体持久卷"]
    P --> BK["pgBackRest / S3 兼容存储"]
    U --> RB["Restic / S3 兼容存储"]
    V --> RB
    C --> RB
    A --> M["Prometheus / Grafana"]
```

生产环境只有 Nginx 对公网开放 `80/443`。应用、PostgreSQL、Redis、实时服务和监控端口均位于内部网络；Grafana 只绑定服务器回环地址。

## 技术栈

| 层级 | 主要技术 |
| --- | --- |
| Web | Next.js 16.2、React 19、TypeScript、Tailwind CSS 4 |
| 数据 | PostgreSQL 16、Prisma 6、Redis 7 |
| 实时协作 | WebSocket、Redis Pub/Sub、课程事件游标、tldraw sync |
| AI | Vercel AI SDK、OpenAI/Anthropic/Google 适配器、兼容 OpenAI 的 Provider、分阶段超时与并发策略 |
| 内容 | OpenMAIC DSL/Importer/Renderer、原生课堂工具、TipTap、PptxGenJS、持久任务与逐页检查点 |
| 文件存储 | Docker named volumes：上传、白板、生成课堂及其媒体 |
| 验证 | Vitest、Playwright、k6、ESLint、TypeScript |
| 运维 | Docker Compose、Nginx、Prometheus、Grafana、pgBackRest、Restic |
| CI/CD | GitHub Actions、CodeQL、Trivy、SBOM、Cosign、GHCR |

## 当前验证状态

截至 2026-08-17，对提交 `92682e3` 的本机复核结果如下：

- `pnpm lint:ci` 零警告通过，`pnpm typecheck` 通过。
- Next.js 16.2.12 生产构建通过，30 个静态页面完成生成。
- Prisma Schema 校验通过；七个迁移均已纳入迁移目录，服务器仍须执行 `migrate deploy` 和 `migrate status`。
- 生产 Compose 的 `blue + certificate + observability + backup` 完整 profile 使用示例配置解析通过。
- Vitest 共 203 个测试文件、931 项测试：202 个文件通过，930 项测试通过；`src/lib/classroom/stage-gates.test.ts` 中“项目实践上传作品应满足 iteration-evidence”仍有 1 项失败。
- `pnpm audit:prod` 当前报告 1 个 high：`next@16.2.12 → postcss@8.5.23 → nanoid@3.3.17`，对应公告要求 `nanoid >= 3.3.18`。
- 本轮未重新执行 Playwright、`test:classroom-flow` 和云端 k6 场景。

因此当前提交尚未完成全部发布门禁。正式切换生产流量前，必须修复或经安全评审处置上述测试与依赖审计问题，重新跑通本机门禁，并在候选服务器完成真实 Provider 长流程生成、后台生成离页/进程重启恢复、蓝绿切换、`target`/`stress`/`soak` 压测和备份恢复验收。

## 目录结构

```text
openPBL/
├─ src/
│  ├─ app/                    # 页面与 Route Handlers
│  ├─ components/             # 教师端、学生端和通用 UI
│  └─ lib/
│     ├─ auth/                # 登录、JWT、权限与密码
│     ├─ courses/             # 课程 API 合约、动作与事件
│     ├─ course-generation/   # 持久生成任务、能力判断与后台工作器
│     ├─ course-design/       # 快速设计八阶段任务、质量复核与课堂任务交接
│     ├─ db/                  # Prisma 客户端和数据仓储
│     ├─ learning-evidence/   # 证据任务、就绪门槛与 AI 使用责任
│     ├─ observability/       # 日志、指标和健康检查
│     ├─ openmaic/            # AI 授课与 Provider 服务
│     ├─ prompt-quality/      # 中文生成与结构化输出质量契约
│     └─ session/             # 课堂领域类型和客户端状态
├─ prisma/                    # Schema 与数据库迁移
├─ packages/                  # 内置 OpenMAIC、PPTX 和公式工作区包
├─ tests/load/                # 可在独立测试机运行的 k6 压测套件
├─ e2e/                       # Playwright 核心流程测试
├─ deploy/                    # Nginx、监控、证书、备份和蓝绿发布
├─ data/classrooms/           # 运行期生成课堂、图片、视频和语音（不提交）
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

# 本机默认使用页面连接承载生成；只有明确测试后台工作器时才改为 true
COURSE_GENERATION_BACKGROUND_ENABLED=false
PARALLEL_SCENE_CONCURRENCY=4
COURSE_GENERATION_LLM_CONCURRENCY=4
OPENMAIC_NATIVE_CLASSROOM_TOOLS=true

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
OPENPBL_LLM_REQUEST_TIMEOUT_MS=180000
OPENPBL_LLM_QUALITY_REVIEW_TIMEOUT_MS=300000
OPENPBL_LLM_LONG_REQUEST_TIMEOUT_MS=600000
```

未配置 LLM 时可以使用示例内容继续验证非 AI 流程，但真实课程生成、AI 对话、联网搜索或 TTS 需要相应 Provider。

普通结构化模型调用默认超时为 180 秒；独立质量审校默认 300 秒；知识图谱、六阶段架构、逐页主课脚本和整课生成属于长输出任务，默认超时为 600 秒。三个值均可按 Provider 能力调整，系统会限制在 30 秒至 30 分钟之间。课程生成中的瞬态超时、限流、网络错误或 5xx 会自动重试一次，鉴权或结构错误不会盲目重试。

`PARALLEL_SCENE_CONCURRENCY` 支持 `1–5`，默认 `4`。提高并发会缩短课程生成时间，但会同时增加模型请求、限流压力和失败重试量；迁移到新服务器后应先保持默认值，再根据 Provider 配额和实际监控调整。

`COURSE_GENERATION_LLM_CONCURRENCY` 是课程设计、主课页面和个性化分支共同使用的进程级模型请求上限，支持 `1–5`、默认 `4`。它不会限制课堂中的交互式 AI；未配置时沿用 `PARALLEL_SCENE_CONCURRENCY`。

`OPENMAIC_NATIVE_CLASSROOM_TOOLS` 默认启用。它允许模型通过既有 Action DSL 使用白板、随堂检测、证据看板和嵌入式组件；自定义 Provider 出现工具调用兼容问题时可暂时设为 `false`，并结合日志完成排查后再恢复。

本机 `next dev` 默认关闭持久后台生成，生成期间页面会提示不要离开。生产 Compose 默认开启；若要在本机测试完整离页恢复，必须先配置 PostgreSQL，应用迁移后显式设置：

```dotenv
COURSE_GENERATION_BACKGROUND_ENABLED=true
```

### 3. 启动 PostgreSQL 与 Redis

```bash
docker compose --env-file .env.local up -d postgres redis
```

Compose 还会将生成课堂保存到 `openpbl-classrooms` named volume。不要使用 `docker compose down -v` 清理环境，除非确认课程、上传、白板和数据库数据均可删除。

无数据库时只保留早期 JSON 数据读取/迁移所需的兼容存储，不构成完整演示环境；教师认证、持久生成、多人并发和可靠恢复均需要 PostgreSQL。正式开发和验证必须使用 PostgreSQL。

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

原始系统（保留六阶段完整流程）：

```bash
pnpm dev:legacy
```

新系统（五阶段轻量流程，默认端口 3100）：

```bash
pnpm dev:new
```

打开：

- 首页：<http://localhost:3000>
- 教师登录：<http://localhost:3000/teacher/login>
- 首次教师注册：<http://localhost:3000/teacher/register>
- 学生入口：<http://localhost:3000/student>

`pnpm dev` 仍等价于启动原始系统，便于回退。新旧模式使用独立构建目录，可以同时运行；生产构建与启动命令见 [VERSIONING.md](VERSIONING.md)。

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
| `GET /api/courses/:courseId/generation` | 获取后台生成能力、当前任务、进度、剩余时间和结果 |
| `PATCH /api/courses/:courseId/generation` | 本机请求绑定模式下启动已经持久化的最终课堂任务；不会新建重复任务 |
| `DELETE /api/courses/:courseId/generation` | 安全中断排队中或正在运行的最终课堂生成任务 |
| `POST /api/courses/:courseId/generation` | 幂等创建或续接课程生成任务；失败任务可由教师明确重试 |
| `GET /api/courses/:courseId/design-generation` | 获取快速设计任务、八阶段进度、追溯记录和质量报告 |
| `POST /api/courses/:courseId/design-generation` | 幂等创建或续接快速设计任务；完成后自动排入最终课堂生成队列 |
| `PUT/DELETE /api/courses/:courseId/presence` | 在线续期与离线 |
| `POST /api/uploads` | 受权文件上传 |
| `GET /api/uploads/:id` | 受权文件下载 |

写入成功会返回请求 ID、课程版本和事件游标。业务调用应使用这些接口，不要重新引入整份会话覆盖式写入。

## 生产服务器完整配置

推荐且受仓库配置支持的拓扑是：一台 Ubuntu 24.04 服务器运行 Docker Compose，Nginx 独占公网 `80/443`，应用、PostgreSQL、Redis、实时服务和 Prometheus 仅在 Docker 内网通信，Grafana 只绑定 `127.0.0.1:3002`。不要把开发用 [docker-compose.yml](docker-compose.yml) 与生产用 [docker-compose.prod.yml](docker-compose.prod.yml) 叠加。

以下步骤覆盖一台空白服务器的首次上线。命令默认以具有 `sudo` 权限的普通用户执行，项目目录为 `/opt/openpbl`。

### 0. 上线前确定域名、容量和备份

1. 准备 Ubuntu 24.04、至少 4 vCPU、8 GB 内存和 100 GB SSD；生产数据库与生成媒体增长较快，应启用磁盘空间告警。
2. 将域名的 `A`/`AAAA` 记录指向服务器公网地址，等待解析生效。推荐使用域名；若使用公网 IP，须确认当前 Let’s Encrypt 客户端和 CA 策略支持 IP 证书。
3. 安全组和防火墙只开放 SSH、TCP `80`、TCP `443`。不要开放 `3000`、`3001`、`3002`、`5432`、`6379`、`9090` 等内部端口。
4. 准备一个 S3 兼容对象存储桶和只对该桶有读写权限的访问密钥。完整生产配置依赖它保存 pgBackRest、WAL 和 Restic 异地备份。
5. 若从旧版本迁移，先暂停新课程生成，并备份 PostgreSQL、`uploads`、`whiteboards`、`classrooms`、`deploy/.deploy.env` 和全部 Secret。必须保留原 `PROVIDER_ENCRYPTION_KEY`，否则数据库中的 Provider 凭据无法解密；保留 `JWT_SECRET` 可避免强制所有用户重新登录。

禁止把真实 Secret、Provider 配置、`.deploy.env` 或备份文件提交到 Git。发布与升级期间也不要执行 `docker compose down -v`。

### 1. 安装基础软件与 Docker

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git openssl ufw

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

重新登录 SSH 使 Docker 用户组生效，然后检查：

```bash
docker version
docker compose version
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

云厂商安全组必须同步放行相同端口。启用 UFW 前确认当前 SSH 端口规则正确，避免锁死远程连接。

### 2. 获取并冻结同一版本源码

```bash
sudo mkdir -p /opt/openpbl
sudo chown "$USER":"$USER" /opt/openpbl
git clone <repository-url> /opt/openpbl
cd /opt/openpbl
git fetch --tags --prune
git checkout <release-tag-or-commit>
git status --short
git rev-parse HEAD
```

`git status --short` 应为空。记录完整 Git SHA；应用镜像和 migrator 镜像必须由同一个 SHA 构建，禁止混用版本或使用 `latest`。

### 3. 构建镜像，或从 GHCR 拉取镜像

在服务器本机构建时执行：

```bash
cd /opt/openpbl
GIT_SHA="$(git rev-parse HEAD)"
docker build --target runner \
  --tag "openpbl-app:sha-${GIT_SHA}" .
docker build --target migrator \
  --tag "openpbl-migrator:sha-${GIT_SHA}" .
docker image inspect \
  "openpbl-app:sha-${GIT_SHA}" \
  "openpbl-migrator:sha-${GIT_SHA}" >/dev/null
```

如果 CI 已发布 GHCR 镜像，则不要重复构建；登录仓库后使用工作流输出的两个不可变 digest：

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
docker pull ghcr.io/<owner>/<repository>@sha256:<app-digest>
docker pull ghcr.io/<owner>/<repository>-migrator@sha256:<migrator-digest>
unset GHCR_TOKEN
```

### 4. 创建生产环境文件

```bash
cd /opt/openpbl
cp deploy/.deploy.env.example deploy/.deploy.env
chmod 600 deploy/.deploy.env
```

编辑 `deploy/.deploy.env`。本机构建示例：

```dotenv
PUBLIC_HOST=openpbl.example.com
OPENPBL_UPSTREAM=app-blue
OPENPBL_IMAGE=openpbl-app:sha-<40-character-git-sha>
OPENPBL_MIGRATOR_IMAGE=openpbl-migrator:sha-<same-40-character-git-sha>
OPENPBL_POSTGRES_IMAGE=openpbl-postgres:16.9-pgbackrest
BACKUP_S3_ENDPOINT=https://s3.example.com
BACKUP_S3_BUCKET=openpbl-backups
BACKUP_S3_REGION=us-east-1
ENABLE_LOAD_TEST_API=false
LOAD_TEST_CLIENT_IP=127.0.0.1
```

若使用 GHCR，将两个镜像值替换为上一步的完整 `@sha256:...` 引用。`PUBLIC_BASE_URL`、Redis、WebSocket、tldraw、持久后台生成、代理信任和三个文件卷已由生产 Compose 设置，无需在此重复配置。

### 5. 生成全部 Docker Secret

以下命令使用 URL 安全的十六进制 PostgreSQL 密码，因此可以直接写入连接串：

```bash
cd /opt/openpbl
umask 077
mkdir -p deploy/secrets

openssl rand -hex 32 > deploy/secrets/postgres_password.txt
POSTGRES_PASSWORD="$(tr -d '\r\n' < deploy/secrets/postgres_password.txt)"
printf '%s' "postgresql://openpbl:${POSTGRES_PASSWORD}@postgres:5432/openpbl?connection_limit=30&pool_timeout=10" \
  > deploy/secrets/database_url.txt
openssl rand -base64 48 | tr -d '\n' > deploy/secrets/jwt_secret.txt
openssl rand -base64 32 | tr -d '\n' > deploy/secrets/provider_encryption_key.txt
openssl rand -base64 32 | tr -d '\n' > deploy/secrets/monitor_token.txt
openssl rand -base64 32 | tr -d '\n' > deploy/secrets/grafana_admin_password.txt
openssl rand -base64 32 | tr -d '\n' > deploy/secrets/restic_password.txt
openssl rand -base64 32 | tr -d '\n' > deploy/secrets/load_test_admin_token.txt
unset POSTGRES_PASSWORD

read -r -p 'S3 access key: ' S3_ACCESS_KEY
read -r -s -p 'S3 secret key: ' S3_SECRET_KEY; echo
printf '%s' "$S3_ACCESS_KEY" > deploy/secrets/s3_access_key.txt
printf '%s' "$S3_SECRET_KEY" > deploy/secrets/s3_secret_key.txt
unset S3_ACCESS_KEY S3_SECRET_KEY

chmod 700 deploy/secrets
chmod 600 deploy/secrets/*.txt
```

全新安装使用上述随机值；迁移安装应把 `jwt_secret.txt`、`provider_encryption_key.txt` 和数据库凭据替换为旧环境的原值。Secret 的完整定义见 [deploy/secrets.example/README.md](deploy/secrets.example/README.md)。只检查文件存在且非空，不要把内容打印到终端或日志：

```bash
for file in postgres_password database_url jwt_secret provider_encryption_key \
  monitor_token grafana_admin_password s3_access_key s3_secret_key \
  restic_password load_test_admin_token; do
  test -s "deploy/secrets/${file}.txt" || { echo "missing: $file"; exit 1; }
done
```

### 6. 执行配置预检

```bash
cd /opt/openpbl
chmod +x deploy/*.sh deploy/backup/*.sh
docker compose \
  --env-file deploy/.deploy.env \
  -f docker-compose.prod.yml \
  --profile blue \
  --profile certificate \
  --profile observability \
  --profile backup \
  config --quiet
```

预检必须无输出且退出码为 `0`。同时再次确认 `PUBLIC_HOST` 已解析到本机，TCP `80/443` 未被其他进程占用。

### 7. 申请 HTTPS 证书

```bash
cd /opt/openpbl
export LETSENCRYPT_EMAIL=admin@example.com
./deploy/bootstrap-certificate.sh
unset LETSENCRYPT_EMAIL
```

脚本临时启动 HTTP Nginx 完成 ACME 验证，再停止引导容器。证书续期容器每 12 小时检查一次，生产 Nginx 每 6 小时无中断重载。申请失败时先检查 DNS、系统时间、云安全组和 UFW，不要在没有证书的情况下直接启动 HTTPS Nginx。

### 8. 首次启动、迁移数据库并检查容器

```bash
cd /opt/openpbl
docker compose \
  --env-file deploy/.deploy.env \
  -f docker-compose.prod.yml \
  --profile blue \
  --profile certificate \
  --profile observability \
  --profile backup \
  up -d

docker compose \
  --env-file deploy/.deploy.env \
  -f docker-compose.prod.yml ps -a
docker compose \
  --env-file deploy/.deploy.env \
  -f docker-compose.prod.yml logs --tail=200 migrate app-blue nginx
```

`migrate` 必须以退出码 `0` 完成，`postgres`、`redis`、`app-blue` 和 `nginx` 应为健康状态。应用启动依赖迁移成功；不要手工改表或跳过迁移。再确认迁移状态：

```bash
docker compose \
  --env-file deploy/.deploy.env \
  -f docker-compose.prod.yml \
  run --rm migrate pnpm exec prisma migrate status
```

输出应显示数据库 schema 已是最新，并包含 `prisma/migrations/` 中的全部迁移。检查持久卷：

```bash
docker volume ls --filter name=openpbl
docker compose \
  --env-file deploy/.deploy.env \
  -f docker-compose.prod.yml \
  exec -T app-blue sh -c \
  'test -w /app/.openpbl-data/uploads && test -w /app/.openpbl-data/whiteboards && test -w /app/data/classrooms'
```

`postgres-data`、`uploads`、`whiteboards`、`classrooms`、证书、监控和备份状态都必须使用 named volume；蓝绿实例共享三个文件卷。

### 9. 初始化首个教师并配置 AI Provider

初始化命令只允许在数据库尚无教师时执行，密码至少 10 个字符：

```bash
cd /opt/openpbl
read -r -s -p 'Initial teacher password: ' OPENPBL_INITIAL_TEACHER_PASSWORD; echo
export OPENPBL_INITIAL_TEACHER_PASSWORD
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

访问 `https://<PUBLIC_HOST>/teacher/login` 登录，在教师端“设置”中填写并测试模型、搜索、图片、视频和 TTS Provider。Provider 凭据会使用 `provider_encryption_key.txt` 加密后保存到 PostgreSQL。没有配置真实 Provider 时只能用示例内容验证非 AI 流程，不能完成真实课程生成。

### 10. 完成上线验收

```bash
PUBLIC_HOST="$(sed -n 's/^PUBLIC_HOST=//p' deploy/.deploy.env | tail -n 1)"
curl --fail --show-error "https://${PUBLIC_HOST}/api/health/live"
docker compose \
  --env-file deploy/.deploy.env \
  -f docker-compose.prod.yml \
  exec -T app-blue sh -c \
  'token=$(cat /run/secrets/monitor_token); wget -qO- --header="Authorization: Bearer $token" http://127.0.0.1:3000/api/health/ready'
unset PUBLIC_HOST
```

随后人工完成一条真实链路：教师登录 → 新建课程 → 生成并发布 → 学生用课程码加入 → 学生提交任务 → 教师看到实时进度 → 刷新页面确认数据仍在。还应验证上传、AI 对话、语音/媒体、WebSocket 和白板同步。对于后台生成，教师离开生成页后任务仍应继续；重启应用后应从数据库任务和页面检查点恢复。

### 11. 监控、日志与备份

| 地址或命令 | 可见性 | 用途 |
| --- | --- | --- |
| `/api/health/live` | 最小公开 | 进程存活检查 |
| `/api/health/ready` | 内部令牌保护 | PostgreSQL、Redis、文件系统等就绪检查 |
| `/api/metrics` | 内部令牌保护 | Prometheus 指标 |
| `docker compose ... logs -f app-blue nginx` | 服务器 | 查看结构化应用与网关日志 |
| Grafana `127.0.0.1:3002` | 仅服务器本机 | 通过 SSH 隧道访问 |

从管理员电脑建立 Grafana 隧道：

```bash
ssh -L 3002:127.0.0.1:3002 <server-user>@<server-host>
```

然后访问 `http://127.0.0.1:3002`，密码来自 `grafana_admin_password.txt`。监控应覆盖 HTTP 延迟/错误率、WebSocket、事件积压、数据库连接、Redis、CPU/内存/磁盘、证书和备份时间。

数据库由 pgBackRest 执行每周全量、每日差异和持续 WAL 归档；Restic 每日备份 `uploads`、`whiteboards`、`classrooms`。生成任务状态在 PostgreSQL，课堂 JSON 与媒体在 `classrooms` 卷，恢复时两者必须来自一致时间点。首次上线后立即确认对象存储中已经出现备份，并按 [deploy/backup/README.md](deploy/backup/README.md) 执行隔离恢复演练：

```bash
cd /opt/openpbl
CONFIRM_RESTORE_DRILL=openpbl-restore-drill-data \
  sh deploy/backup/restore-drill.sh
```

恢复演练只允许使用明确命名的 `openpbl-restore-drill-data` 卷，不得挂载生产 PostgreSQL 卷。目标为数据库 RPO 不超过 5 分钟、RTO 不超过 60 分钟，并至少每月演练一次。

### 12. 后续蓝绿升级与回退

先完成新提交的测试和镜像发布，再在 `/opt/openpbl` 执行：

```bash
./deploy/blue-green-deploy.sh \
  <app-image-ref> \
  <matching-migrator-image-ref>
```

镜像引用必须是 `repository@sha256:<64位摘要>` 或 `repository:sha-<40位Git SHA>`。脚本会拉取匹配镜像、执行迁移、启动另一颜色、检查健康、切换 Nginx，并在失败时恢复原上游。数据库迁移必须保持向后兼容，因为切换窗口内新旧应用可能短暂共存。切换后人工验证正在生成的课程可续接、没有重复任务、两个颜色读取相同 `classrooms` 卷，再停止旧实例。

发生应用层故障时，可把 `deploy/.deploy.env` 的 `OPENPBL_UPSTREAM` 改回原颜色并重建 Nginx；不要通过删除卷回退数据库：

```bash
docker compose \
  --env-file deploy/.deploy.env \
  -f docker-compose.prod.yml \
  up -d --no-deps --force-recreate nginx
```

生产流水线位于 `.github/workflows/`，包含类型检查、测试、构建、依赖审计、CodeQL、Trivy、SBOM、镜像签名和人工批准部署。详细脚本说明见 [deploy/README.md](deploy/README.md)。

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

### 教师离开页面后课程不再生成

先请求 `GET /api/courses/:courseId/generation`，检查 `backgroundEnabled` 是否为 `true`，然后依次确认：

1. 运行环境设置了 `COURSE_GENERATION_BACKGROUND_ENABLED=true`，并且不是会冻结后台进程的纯 Serverless 部署。
2. `CourseGenerationJob` 和 `CourseDesignGenerationJob` 表已经分别由 `20260809153000_course_generation_jobs`、`20260810143000_course_design_generation_jobs` 创建，并已应用 `20260810195000_course_design_outline_review` 大纲暂停字段及 `20260811100000_course_generation_page_checkpoints` 逐页恢复表。
3. 应用启动日志中没有生产环境变量校验、Provider 初始化或课程生成工作器错误。
4. PostgreSQL 中任务状态为 `queued`、`running`、`completed` 或 `failed`；不要直接插入第二条同课程任务。
5. `/app/data/classrooms` 挂载了共享持久卷且可写，蓝绿实例读取的是同一个卷。
6. `PUBLIC_BASE_URL` 是外部可访问的 HTTPS 地址，Nginx 支持长连接和媒体回调。

本机开发环境默认返回 `backgroundEnabled=false`，这是预期行为；页面会改为提示教师不要离开。需要本机测试后台生成时，必须启用 PostgreSQL 并显式打开环境变量。

### 生成进度长时间不变化或剩余时间不准确

- 课堂页进度按“真正完成的页面数”更新，并发开始多个页面不会被误计为完成。
- PostgreSQL 中会保存规范化大纲和逐页检查点；任务重启后已完成且大纲指纹一致的页面应被复用。
- 初始估算基于页面数量、联网搜索和分层资源数量；完成页面后改用实际吞吐速度校准。
- 检查 `PARALLEL_SCENE_CONCURRENCY` 是否在 `1–5`，以及 Provider 是否触发限流、重试或长时间推理。
- 对约 14 个普通课堂页面，默认初始估算约 10 分钟；视频生成、Provider 排队或多个分层资源会明显延长时间。
- 页面重新进入后应读取数据库任务进度，而不是重新 POST 旧的 `/api/openmaic/generate` 流式接口。

### 蓝绿切换后课程可以看到，但课件或语音丢失

这通常表示 PostgreSQL 已迁移，但 `classrooms` 文件卷没有共享或恢复。检查：

```bash
docker volume ls | grep openpbl
docker compose --env-file deploy/.deploy.env -f docker-compose.prod.yml config
```

确认两个应用实例均挂载 `classrooms:/app/data/classrooms`，Restic 备份包含 `/data/classrooms`，并从一致时间点恢复数据库和文件卷。

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
- [持久课程生成设计](docs/plans/2026-08-09-durable-course-generation.md)
- [快速课程生成与生成动效](docs/plans/2026-08-10-fast-course-generation-and-motion.md)
- [课程生成质量与并发架构](docs/adr/0007-quality-preserving-course-generation-pipeline.md)
- [分阶段超时与设计恢复](docs/adr/0008-stage-aware-llm-deadlines-and-design-resume.md)
- [基于 Action DSL 的原生课堂工具](docs/adr/0009-native-classroom-tools-over-action-dsl.md)
- [先基础后深互动课堂](docs/adr/0010-foundation-first-deep-interactive-teaching.md)
- [快速生成恢复策略](docs/adr/0011-managed-quick-generation-recovery.md)
- [严格先修自适应学习](docs/adr/0012-strict-prerequisite-adaptive-learning.md)
- [角色化课程知识图谱](docs/adr/0013-role-aware-curriculum-knowledge-graph.md)
- [AI 直接协作工作台](docs/adr/0014-ai-direct-collaborative-workspace.md)
- [页面级持久白板](docs/adr/0015-page-scoped-retained-whiteboards.md)
- [提示词质量审计](docs/prompt-quality-audit.md)

## 许可证

本项目为私有项目，未经授权不得使用、复制或分发。
