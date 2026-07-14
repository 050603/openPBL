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
- **实时同步**：教师投屏操作实时同步至学生端、学生进度实时反馈至教师端

## 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) |
| 语言 | TypeScript 5 |
| UI | React 19, Tailwind CSS 4, Radix UI, Lucide Icons |
| 状态管理 | Zustand 5 + Immer |
| 本地存储 | Dexie (IndexedDB) |
| 富文本 | TipTap |
| 图表 | ECharts |
| 画布 | tldraw, React Flow |
| AI | Vercel AI SDK, OpenAI / Anthropic / Google |
| 语音 | 服务端 TTS + 浏览器原生 TTS |
| 测试 | Vitest |
| 包管理 | pnpm |

## 项目结构

```
openPBL/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API 路由
│   │   │   ├── openmaic/       # OpenMAIC 核心接口（课程生成、TTS、图片等）
│   │   │   ├── chat/companion/ # AI 伴学对话
│   │   │   ├── session/        # 课堂会话管理
│   │   │   └── ...
│   │   ├── teacher/            # 教师端页面
│   │   │   ├── prepare/        # 课程备课（创建、核查、生成、预览）
│   │   │   ├── teach/          # 授课课堂
│   │   │   └── settings/       # 教师设置
│   │   ├── student/            # 学生端页面
│   │   │   ├── classroom/      # 听课课堂
│   │   │   └── ai-learning/    # AI 学习
│   │   └── page.tsx            # 首页
│   ├── components/             # React 组件
│   │   ├── views/              # 阶段视图（教师/学生）
│   │   ├── openmaic/            # OpenMAIC 课件组件
│   │   ├── classroom/          # 课堂共享组件
│   │   ├── ui/                 # 基础 UI 组件
│   │   └── ...
│   └── lib/                    # 核心库
│       ├── session/            # 会话状态管理
│       ├── llm/                # LLM 客户端
│       ├── openmaic/           # OpenMAIC 框架
│       ├── companion/           # AI 伴学引擎
│       ├── evaluation/         # 评价系统
│       └── ...
├── packages/                   # 本地子包
│   ├── @openmaic/
│   │   ├── dsl/                # 场景 DSL
│   │   ├── importer/           # PPTX 导入
│   │   └── renderer/           # 课件渲染
│   ├── mathml2omml/            # MathML 转 OMML
│   └── pptxgenjs/              # PPTX 生成
├── scripts/                    # 脚本工具
├── .env.example                # 环境变量模板
├── next.config.ts              # Next.js 配置
└── tsconfig.json               # TypeScript 配置
```

## 环境要求

- **Node.js** ≥ 20.0.0
- **pnpm** ≥ 10.0.0
- **操作系统**：Windows 10/11、macOS、Linux

## 安装部署

### 1. 克隆项目

```bash
git clone <仓库地址> openPBL
cd openPBL
```

### 2. 安装依赖

```bash
pnpm install
```

> 安装时会自动执行 `postinstall` 脚本，构建 `packages/` 下的本地子包。

### 3. 配置环境变量

复制 `.env.example` 为 `.env.local` 并填写 LLM 配置：

```bash
cp .env.example .env.local
```

```env
# LLM 配置（必填，用于课程生成和 AI 对话）
OPENPBL_LLM_ENDPOINT=https://api.openai.com/v1
OPENPBL_LLM_API_KEY=sk-your-api-key
OPENPBL_LLM_MODEL=gpt-4o

# 场景并发数（可选，默认 4）
PARALLEL_SCENE_CONCURRENCY=4
```

也可在教师端「设置」页面中在线配置 LLM Provider。

### 4. 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000 即可使用。

### 5. 生产构建

```bash
pnpm build
pnpm start
```

## Windows 系统部署

### 环境准备

1. **安装 Node.js**：
   - 下载 [Node.js LTS](https://nodejs.org/)（≥ 20.x）并安装
   - 安装后验证：`node -v` 和 `npm -v`

2. **安装 pnpm**：
   ```powershell
   npm install -g pnpm@10
   ```

3. **安装 Git**：
   - 下载 [Git for Windows](https://git-scm.com/download/win) 并安装

### 部署步骤

```powershell
# 克隆项目
git clone <仓库地址> openPBL
cd openPBL

# 安装依赖
pnpm install

# 配置环境变量
copy .env.example .env.local
# 编辑 .env.local 填入 API Key

# 开发模式启动
pnpm dev

# 或生产模式
pnpm build
pnpm start
```

### Windows 注意事项

- 如遇到 `sharp` 模块安装失败，确保已安装 [Visual C++ Redistributable](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist)
- PowerShell 执行策略可能阻止脚本运行，使用 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 解除
- 路径中避免中文和空格

## Linux 系统部署

### 环境准备

1. **安装 Node.js**（使用 nvm）：
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
   source ~/.bashrc
   nvm install 20
   nvm use 20
   ```

2. **安装 pnpm**：
   ```bash
   npm install -g pnpm@10
   ```

3. **安装 Git**：
   ```bash
   # Ubuntu/Debian
   sudo apt-get update && sudo apt-get install -y git

   # CentOS/RHEL
   sudo yum install -y git
   ```

### 部署步骤

```bash
# 克隆项目
git clone <仓库地址> openPBL
cd openPBL

# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入 API Key
vim .env.local

# 开发模式启动
pnpm dev

# 或生产模式
pnpm build
pnpm start
```

### 使用 PM2 守护进程（生产环境推荐）

```bash
# 安装 PM2
npm install -g pm2

# 构建项目
pnpm build

# 使用 PM2 启动
pm2 start "pnpm start" --name openpbl

# 设置开机自启
pm2 startup
pm2 save
```

### 使用 Nginx 反向代理（生产环境推荐）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Linux 注意事项

- 确保有足够内存（≥ 2GB），构建时内存消耗较大
- 如遇 `sharp` 权限问题：`sudo chown -R $(whoami) ~/.npm`
- 防火墙开放 3000 端口：`sudo ufw allow 3000`（Ubuntu）或 `sudo firewall-cmd --add-port=3000/tcp --permanent`（CentOS）

## 使用指南

### 教师流程

1. **创建课程**：进入教师端 → 点击「新建课程」→ 填写课程名称、学科、年级、课时和驱动问题
2. **课程核查**：按 5 个阶段核查 AI 生成的内容：
   - 基础信息确认
   - 知识图谱编辑
   - 课程模块确认
   - 课程大纲确认
   - 评价方案确认
3. **生成课程**：AI 基于 OpenMAIC 引擎生成多场景教学内容（PPT、互动、讲稿等）
4. **预览发布**：预览课程内容，确认后发布
5. **进入课堂**：进入授课界面，实时查看学生进度、投屏教学资源
6. **课堂管理**：在课堂中处理 AI 介入信号、推送支架、审批方案

### 学生流程

1. **加入课堂**：通过邀请码或姓名加入课程
2. **AI 学习**：听 AI 多角色讲解，参与互动
3. **方案构思**：独立构思项目方案，获得 AI 伴学小组反馈
4. **项目实践**：在项目空间中制作作品，记录过程文档
5. **成果汇报**：展示项目成果
6. **学习反思**：回顾学习过程

### 设置页面

在教师端「设置」中可配置：

- **LLM Provider**：配置 API Endpoint、Model、API Key
- **TTS 语音**：配置服务端 TTS Provider 和音色
- **AI 伴学音色**：为六个伴学角色分别配置不同 TTS 音色
- **ASR 语音识别**：配置语音输入
- **图片生成**：配置课程封面和教学图片生成 Provider

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 生产构建 |
| `pnpm start` | 启动生产服务器 |
| `pnpm lint` | 运行 ESLint |
| `pnpm test` | 运行测试 |
| `pnpm test:watch` | 测试监听模式 |

## 数据存储

- **会话状态**：IndexedDB（通过 Dexie）— 课程数据、学生数据
- **LLM 设置**：`.openpbl-data/ai-settings.json` 或 `server-providers.yml`
- **上传文件**：`.openpbl-data/uploads/`
- **生成内容**：`.openpbl-data/` 目录

## LLM 配置说明

系统支持多种 LLM Provider：

- **OpenAI**（默认）：GPT-4o / GPT-4o-mini
- **Anthropic**：Claude 3.5 Sonnet
- **Google**：Gemini Pro
- **兼容 OpenAI 接口的 Provider**：通义千问、DeepSeek 等

可通过环境变量或设置页面配置。设置页面的配置优先级高于环境变量。

## TTS 配置说明

- **服务端 TTS**：支持 OpenAI TTS、Azure TTS、通义千问 TTS 等
- **浏览器原生 TTS**：作为兜底方案，无需额外配置
- **角色音色**：可为每个 AI 伴学角色配置不同音色，在设置页面中配置

## 许可证

本项目为私有项目，未经授权不得使用。
