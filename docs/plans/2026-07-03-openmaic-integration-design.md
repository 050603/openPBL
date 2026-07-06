# OpenMAIC 集成架构设计

> 日期：2026-07-03
> 范围：将 OpenMAIC 完整 AI 授知生成与展示链路整合进 openPBL
> 原则：直接复刻 OpenMAIC 原生代码，禁止修改核心算法逻辑，仅在必要时进行适配性修改

---

## 1. 决策摘要

| 决策点 | 选择 | 理由 |
|---|---|---|
| 集成方式 | **代码直接复刻** | 拥有修改自由度、部署便利；OpenMAIC 代码已位于 `OpenMAIC-main/` |
| Provider 配置 | **以 OpenMAIC server-providers.yml 为底座** | 保留 OpenMAIC 原生 provider-config.ts，是其生成逻辑能直接复用的前提 |
| 实施分期 | **垂直切片 MVP → 完整链路** | 内部验证用 MVP，最终交付必须完整 OpenMAIC 链路 |
| 质量底线 | **OpenMAIC 核心生成/展示逻辑零修改** | 任何修改都会影响生成质量 |

---

## 2. 代码组织与别名策略

### 2.1 目录结构

在 `src/` 下新建 `openmaic/` 子目录，承载 OpenMAIC 所有原生代码：

```
src/
├── app/                     # openPBL 原生路由
│   ├── api/
│   │   ├── ai-settings/     # openPBL 原生（保留兼容）
│   │   ├── llm/             # openPBL 原生（保留兼容）
│   │   └── openmaic/        # 新增：OpenMAIC API 路由
│   │       ├── classroom/        # POST 生成课堂 / GET 读取
│   │       ├── classroom-jobs/   # 异步任务
│   │       ├── server-providers/# 列出已配置 provider（不暴露 key）
│   │       ├── verify-model/     # 测试连接
│   │       ├── generate/         # media/TTS/video
│   │       ├── web-search/
│   │       ├── parse-pdf/
│   │       ├── transcription/
│   │       ├── quiz-grade/
│   │       └── chat/
│   ├── student/
│   │   └── ai-learning/
│   │       └── [id]/        # 新增：学生端课堂播放页
│   │           └── page.tsx
│   └── teacher/
│       └── settings/
│           └── page.tsx    # 重构：多 Tab API 管理
├── components/
│   ├── openmaic/            # 新增：OpenMAIC 原生组件
│   │   ├── slide-renderer/
│   │   ├── scene-renderers/
│   │   ├── edit/
│   │   ├── ui/              # OpenMAIC 自带 shadcn 组件
│   │   └── ...
│   └── ...                  # openPBL 原生组件
├── lib/
│   ├── openmaic/            # 新增：OpenMAIC 原生 lib 代码
│   │   ├── ai/
│   │   ├── api/
│   │   ├── audio/
│   │   ├── chat/
│   │   ├── classroom/
│   │   ├── generation/
│   │   ├── orchestration/
│   │   ├── server/
│   │   ├── storage/
│   │   ├── store/
│   │   ├── types/
│   │   ├── web-search/
│   │   └── logger.ts
│   ├── llm/                 # openPBL 原生（保留供 PBL 阶段使用）
│   └── session/             # openPBL 原生
└── openmaic-configs/        # 新增：OpenMAIC 静态配置
    ├── prompts/
    └── ...

# 项目根
server-providers.yml        # 新增：OpenMAIC provider 配置文件
packages/                   # 新增：OpenMAIC workspace 包
├── @openmaic/
│   ├── dsl/
│   ├── importer/
│   └── renderer/
├── mathml2omml/
└── pptxgenjs/
```

### 2.2 TypeScript 别名

`tsconfig.json` 新增别名（避免与 openPBL 原生 `@/*` 冲突）：

```jsonc
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@openmaic/lib/*": ["./src/lib/openmaic/*"],
      "@openmaic/components/*": ["./src/components/openmaic/*"],
      "@openmaic/configs/*": ["./src/openmaic-configs/*"]
    }
  }
}
```

### 2.3 导入路径改写规则

OpenMAIC 原生代码使用 `@/lib/...`、`@/components/...`、`@/app/...` 等路径。复制后**机械改写**为 `@openmaic/lib/...`、`@openmaic/components/...` 等。

**这是机械替换，不触及算法逻辑**：
- `@/lib/X` → `@openmaic/lib/X`
- `@/components/X` → `@openmaic/components/X`
- `@/configs/X` → `@openmaic/configs/X`
- `@/app/api/X/route` → 仅复制实现，路由挂载到 `src/app/api/openmaic/X/route.ts`

OpenMAIC 中通过相对路径 `../../lib/X` 引用的代码，**保持原样不动**（复制时连同目录结构一起搬，相对路径仍有效）。

### 2.4 Workspace 包

OpenMAIC 的 `packages/@openmaic/{dsl,importer,renderer}`、`packages/mathml2omml`、`packages/pptxgenjs` 是本地 workspace 包，openPBL 项目没有 pnpm workspace。处理方案：

- **方案 A（推荐）**：把 `packages/` 整体复制到 openPBL 根目录，添加 `pnpm-workspace.yaml`，把 openPBL 改造为 pnpm workspace。在 `package.json` 中以 `workspace:*` 引用。
- **方案 B**：把这些包构建产物发布到本地 `node_modules/@openmaic/`，作为常规依赖引用。

**选 A**：openPBL 当前用 npm（有 `package-lock.json`）。需切换到 pnpm。这是必要的环境改造。

---

## 3. 依赖清单与冲突解决

### 3.1 必须新增的核心依赖（Phase 1）

```jsonc
{
  "dependencies": {
    // AI SDK 链路（OpenMAIC 生成核心）
    "ai": "^6.0.168",
    "@ai-sdk/openai": "^3.0.53",
    "@ai-sdk/anthropic": "^3.0.71",
    "@ai-sdk/google": "^3.0.64",
    "openai": "^4.104.0",

    // 配置与工具
    "nanoid": "^5.1.6",
    "js-yaml": "^4.1.1",
    "jsonrepair": "^3.13.2",
    "partial-json": "^0.1.7",
    "zod": "^4.3.5",
    "immer": "^11.1.3",
    "zustand": "^5.0.10",
    "mitt": "^3.0.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.4.0",
    "class-variance-authority": "^0.7.1",
    "lodash": "^4.17.21",

    // UI 基础（OpenMAIC 用 shadcn + radix）
    "radix-ui": "^1.4.3",
    "@radix-ui/react-checkbox": "^1.3.3",
    "@radix-ui/react-popover": "^1.1.15",
    "@radix-ui/react-slider": "^1.3.6",
    "@radix-ui/react-switch": "^1.2.6",
    "@radix-ui/react-use-controllable-state": "^1.2.2",
    "cmdk": "^1.1.1",
    "sonner": "^2.0.7",
    "tw-animate-css": "^1.4.0",

    // 国际化与字体
    "i18next": "^26.0.1",
    "react-i18next": "^17.0.1",
    "i18next-resources-to-backend": "^1.2.1",
    "geist": "^1.7.0",
    "next-themes": "^0.4.6",

    // OpenMAIC workspace 包
    "@openmaic/dsl": "workspace:*",
    "@openmaic/importer": "workspace:*",
    "@openmaic/renderer": "workspace:*",
    "mathml2omml": "workspace:*",
    "pptxgenjs": "workspace:*"
  }
}
```

### 3.2 Phase 2 追加依赖（完整链路）

```jsonc
{
  "dependencies": {
    // 媒体生成
    "sharp": "^0.34.5",
    "unpdf": "^1.4.0",
    "undici": "^7.22.0",
    "jszip": "^3.10.1",
    "file-saver": "^2.0.5",

    // 渲染（ProseMirror 编辑器）
    "prosemirror-commands": "^1.7.1",
    "prosemirror-dropcursor": "^1.8.2",
    "prosemirror-gapcursor": "^1.4.0",
    "prosemirror-history": "^1.5.0",
    "prosemirror-inputrules": "^1.5.1",
    "prosemirror-keymap": "^1.2.3",
    "prosemirror-model": "^1.25.4",
    "prosemirror-schema-basic": "^1.2.4",
    "prosemirror-schema-list": "^1.5.1",
    "prosemirror-state": "^1.4.4",
    "prosemirror-view": "^1.41.5",

    // 显示
    "katex": "^0.16.33",
    "temml": "^0.13.1",
    "shiki": "^3.21.0",
    "motion": "^12.27.5",
    "echarts": "^6.0.0",
    "@xyflow/react": "^12.10.0",
    "react-colorful": "^5.7.0",
    "animate.css": "^4.1.1",
    "use-stick-to-bottom": "^1.1.1",
    "streamdown": "^2.5.0",
    "svg-arc-to-cubic-bezier": "^3.2.0",
    "svg-pathdata": "^8.0.0",
    "embla-carousel-react": "^8.6.0",

    // Chat / Agent
    "@assistant-ui/react": "^0.14.18",
    "@assistant-ui/react-markdown": "^0.14.1",
    "@assistant-ui/react-streamdown": "^0.3.3",
    "@streamdown/code": "^1.1.1",
    "@langchain/core": "^1.1.16",
    "@langchain/langgraph": "^1.1.1",
    "@modelcontextprotocol/sdk": "^1.27.1",
    "@earendil-works/pi-agent-core": "0.78.0",
    "@earendil-works/pi-ai": "0.78.0",
    "@copilotkit/backend": "^0.37.0",
    "@copilotkit/runtime": "^1.51.2",
    "copilotkit": "^0.0.58",
    "@base-ui/react": "^1.1.0",

    // 字体（按需）
    "@fontsource-variable/inter": "^5.2.8",
    "@fontsource/noto-sans-sc": "^5.2.9",
    "@fontsource/noto-serif-sc": "^5.2.8",
    "@fontsource/jetbrains-mono": "^5.2.8",

    // 工具
    "tinycolor2": "^1.6.0",
    "tokenlens": "^1.3.1",
    "typebox": "^1.1.39",
    "pptxtojson": "^1.11.0",
    "shadcn": "^3.6.3"
  }
}
```

### 3.3 冲突解决

| 冲突 | openPBL | OpenMAIC | 解决方案 |
|---|---|---|---|
| `lucide-react` | `^1.23.0` | `^0.562.0` | **对齐到 `^0.562.0`**（npm 上 lucide-react 最新主线是 0.5xx；openPBL 的 `1.23.0` 不存在，应是笔误） |
| `next` | `16.2.10` | `16.1.2` | 保持 openPBL 的 `16.2.10`（向下兼容） |
| `react` | `19.2.4` | `19.2.3` | 保持 openPBL 的 `19.2.4` |
| 包管理器 | npm | pnpm | **切换到 pnpm**（OpenMAIC workspace 必需） |

### 3.4 包管理器切换步骤

1. 删除 `node_modules/`、`package-lock.json`
2. 创建 `pnpm-workspace.yaml`：
   ```yaml
   packages:
     - 'packages/*'
     - 'packages/@openmaic/*'
   ```
3. `pnpm install`
4. 验证 openPBL 原有功能未受影响

---

## 4. Provider 配置迁移

### 4.1 配置文件

新建 `server-providers.yml`（项目根）：

```yaml
# LLM Providers
providers:
  openai:
    apiKey: ""              # 教师通过 UI 填写，持久化到本地
    baseUrl: "https://api.openai.com/v1"
    models: ["gpt-4o-mini", "gpt-4o"]
  anthropic:
    apiKey: ""
    models: ["claude-3-5-sonnet-latest"]
  deepseek:
    apiKey: ""
    baseUrl: "https://api.deepseek.com/v1"
  glm:
    apiKey: ""
    baseUrl: "https://open.bigmodel.cn/api/paas/v4"
  qwen:
    apiKey: ""
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1"

# TTS (Phase 2)
tts: {}

# ASR (Phase 2)
asr: {}

# Image Generation (Phase 2)
image: {}

# Video Generation (Phase 2)
video: {}

# Web Search (Phase 2)
web-search: {}

# PDF Parsing (Phase 2)
pdf: {}
```

### 4.2 持久化策略

OpenMAIC 的 `provider-config.ts` 从 YAML+env 读取。但教师 UI 编辑需写入。**适配性修改**（不修改核心逻辑）：

在 `src/lib/openmaic/server/provider-config.ts` 基础上，新增 `provider-config-editor.ts`：

```typescript
// 适配层：在 OpenMAIC 原生读取逻辑之外，新增写入能力
export async function saveProviderEntry(
  section: 'providers' | 'tts' | 'asr' | 'pdf' | 'image' | 'video' | 'web-search',
  providerId: string,
  entry: { apiKey: string; baseUrl?: string; models?: string[] },
): Promise<void> {
  // 1. 读取当前 server-providers.yml
  // 2. 合并 entry 到对应 section
  // 3. 写回 server-providers.yml
  // 4. 清空 provider-config 模块缓存（getConfig() 重读）
}
```

**关键**：OpenMAIC 原生 `getConfig()`、`resolveApiKey()` 等读取函数完全保留，仅在模块缓存清理处增加 invalidate 钩子。

### 4.3 openPBL 旧配置迁移

旧 `.openpbl-data` JSON 中的 `{endpoint, model, apiKey}` 在首次启动时自动迁移为 `server-providers.yml` 的 `providers.openai` 条目。迁移后旧字段不再使用，但 `/api/ai-settings` 路由保留向后兼容（内部调用 OpenMAIC provider-config）。

---

## 5. 生成流程整合

### 5.1 流程对比

**当前 openPBL 流程**（mock）：
- 教师 `/teacher/prepare/[id]/generate` 页面用 `setInterval` 模拟 5 个任务进度
- 完成后跳转 `/preview`

**整合后流程**：
1. 教师在 `/teacher/prepare/[id]/verify` 完成课程信息核查
2. 进入 `/generate` 页面，点击"开始生成"
3. 前端 POST `/api/openmaic/classroom` 携带 `requirement` 字段（来自 Course 的 summary + drivingQuestion + knowledgePoints）
4. 后端调用 `generateClassroom()`（OpenMAIC 原生）
5. 流式返回进度（SSE 或轮询 `/api/openmaic/classroom-jobs?id=xxx`）
6. 生成完成后，将 `classroomId` + `stage` + `scenes` 元数据持久化到 Course.content
7. 跳转 `/preview`，教师可预览生成的课堂
8. 发布后，学生在 `/student/ai-learning/[classroomId]` 进入学习

### 5.2 路由实现

`src/app/api/openmaic/classroom/route.ts`：

```typescript
import { generateClassroom } from '@openmaic/lib/server/classroom-generation';
import { type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { requirement, courseId, enableWebSearch, enableImageGeneration, enableTTS } = body;

  // 同步生成（MVP）；Phase 2 改为异步 job
  const result = await generateClassroom(
    { requirement, enableWebSearch, enableImageGeneration, enableTTS },
    { baseUrl: buildOrigin(request) }
  );

  // 持久化 classroomId 到 openPBL Course
  await linkClassroomToCourse(courseId, result.id, result.scenes);

  return Response.json({ id: result.id, url: result.url, scenesCount: result.scenesCount });
}
```

### 5.3 教师生成页改造

`src/app/teacher/prepare/[id]/generate/page.tsx` 替换 mock 逻辑：

```typescript
// 旧：setInterval 模拟 5 任务
// 新：
async function startGeneration() {
  const res = await fetch('/api/openmaic/classroom', {
    method: 'POST',
    body: JSON.stringify({
      requirement: `${course.summary}\n驱动问题：${course.drivingQuestion}`,
      courseId: course.id,
      enableWebSearch: true,    // Phase 2
      enableImageGeneration: false,
      enableTTS: false,
    }),
  });
  const data = await res.json();
  router.push(`/teacher/prepare/${course.id}/preview?classroomId=${data.id}`);
}
```

进度展示：MVP 用简单 loading，Phase 2 接 OpenMAIC 的 SSE 进度流。

### 5.4 Preview 页面

`src/app/teacher/prepare/[id]/preview/page.tsx` 增加 `?classroomId=xxx` 查询参数支持，渲染 OpenMAIC 的 `app/classroom/[id]/page.tsx` 等效内容（嵌入 iframe 或直接复用组件）。

---

## 6. 学生端 AI 课程展示

### 6.1 路由

新增 `src/app/student/ai-learning/[id]/page.tsx`，其中 `[id]` 是 classroomId。

```typescript
export default async function StudentClassroomPage({ params }: { params: { id: string } }) {
  const classroom = await fetchClassroom(params.id);
  if (!classroom) notFound();
  return <OpenMAICClassroomPlayer classroom={classroom} role="student" />;
}
```

### 6.2 播放器组件

直接复用 OpenMAIC 的 `app/classroom/[id]/page.tsx` 与其依赖的：
- `lib/playback/` (engine.ts, derived-state.ts, engine-cursor.ts)
- `components/slide-renderer/` (Canvas, Editor, 各 Element 类型)
- `components/scene-renderers/`
- `lib/api/stage-api.ts`
- `lib/store/stage.ts`

复制时保留原文件结构，仅改 import 别名。**渲染算法零修改**。

### 6.3 自适应布局

OpenMAIC 原生已是响应式布局（slide-renderer 内部用 viewport 缩放）。仅需在父容器加上：

```css
.classroom-shell {
  width: 100%;
  height: 100vh;
  height: 100dvh; /* mobile */
  overflow: hidden;
}
```

移动端：OpenMAIC 设计为桌面优先，移动端会显示提示"请使用桌面浏览器"。**Phase 1 不做移动端深度适配**，保留此限制。

### 6.4 进度上报

学生播放器内部有 `playback-engine.ts` 维护当前 scene 索引和完成状态。新增适配层：

```typescript
// src/lib/openmaic-bridge/progress-reporter.ts
export function reportProgress(classroomId: string, studentId: string, progress: {
  currentSceneIndex: number;
  totalScenes: number;
  completedScenes: string[];
  quizResults?: { sceneId: string; correct: number; total: number }[];
}) {
  return fetch('/api/openmaic/progress', {
    method: 'POST',
    body: JSON.stringify({ classroomId, studentId, ...progress }),
  });
}
```

OpenMAIC 原生播放器**不修改**，仅在关键事件（scene 切换、quiz 提交）上通过事件订阅触发上报。事件订阅是 OpenMAIC Stage API 的公开能力，不算修改核心逻辑。

---

## 7. 学习进度数据打通

### 7.1 数据模型扩展

`src/lib/session/types.ts` 扩展：

```typescript
export type Course = {
  // ... 原有字段
  aiLearningClassroomId?: string;     // 新增：关联的 OpenMAIC classroom ID
  aiLearningProgress?: Record<string, StudentAiProgress>;  // 新增：学生 ID → 进度
};

export type StudentAiProgress = {
  classroomId: string;
  studentId: string;
  currentSceneIndex: number;
  totalScenes: number;
  completedScenes: string[];
  quizScore?: number;        // 0-100
  lastActiveAt: string;
  masteryLevel: 'not-started' | 'in-progress' | 'completed' | 'mastered';
};
```

### 7.2 进度上报 API

`src/app/api/openmaic/progress/route.ts`：

```typescript
export async function POST(request: NextRequest) {
  const { classroomId, studentId, ...progress } = await request.json();
  // 写入 openPBL session store（更新 Course.aiLearningProgress[studentId]）
  await updateStudentAiProgress(classroomId, studentId, progress);
  // 同步更新 Student.stageProgress['ai-learning']（基于完成率映射到 0-100）
  return Response.json({ ok: true });
}
```

### 7.3 教师端进度看板

现有 `src/components/views/teacher/ai-learning.tsx` 已有进度展示框架（mock）。改造：

- `stageProgress['ai-learning']` 由 `aiLearningProgress[studentId]` 计算得出
- "知识点掌握分布"由 OpenMAIC classroom 的 quiz 答题情况聚合
- "学习时长"由 `lastActiveAt` 差值累计（粗略）

**不修改** OpenMAIC 播放器；仅在 openPBL 侧做读取和展示。

### 7.4 掌握情况评估

规则：
- `completedScenes / totalScenes >= 0.9` 且 `quizScore >= 80` → `mastered`
- `completedScenes / totalScenes >= 0.5` → `in-progress`
- 否则 → `not-started` 或 `needs-focus`

映射到 `stageProgress['ai-learning']`：mastered=100, in-progress=50-89, needs-focus=0-49。

---

## 8. API 管理界面重构

### 8.1 页面结构

`src/app/teacher/settings/page.tsx` 重构为多 Tab：

```
教师端 / 设置 / API 管理
├── Tab: LLM 大模型（providers）
│   ├── 子卡片：OpenAI / Anthropic / DeepSeek / GLM / Qwen / Kimi ...
│   └── 每个子卡片：API Key + Base URL + 允许模型列表
├── Tab: TTS 语音合成（tts，Phase 2 启用）
├── Tab: 语音识别 ASR（asr，Phase 2 启用）
├── Tab: 图像生成（image，Phase 2 启用）
├── Tab: 视频生成（video，Phase 2 启用）
├── Tab: Web 搜索（web-search，Phase 2 启用）
├── Tab: PDF 解析（pdf，Phase 2 启用）
└── 侧栏：当前激活 provider 状态、测试连接按钮
```

### 8.2 配置作用域

每个 Tab 顶部说明该类 provider 服务于哪些场景：

- **LLM**：第二阶段 AI 授知课程生成 + PBL 阶段所有 AI 功能（备课大纲、支架、纠偏、评价反馈）
- **TTS**：AI 授知课堂的语音讲解
- **Image**：AI 授知课堂配图
- **Video**：AI 授知课堂视频片段
- **WebSearch**：AI 授知生成的实时资料检索
- **PDF**：教师上传 PDF 教材的解析

### 8.3 测试连接

每个 provider 子卡片有"测试连接"按钮，调用 `/api/openmaic/verify-model`：

```typescript
POST /api/openmaic/verify-model
{ providerId: "openai", section: "providers" }
→ 200 { ok: true, message: "连接成功，可用模型：gpt-4o-mini, gpt-4o" }
→ 200 { ok: false, message: "API Key 无效" }
```

直接复用 OpenMAIC 的 `app/api/verify-model/route.ts`。

### 8.4 旧 `/api/ai-settings` 兼容

保留路由，内部转发到 OpenMAIC provider-config：
- GET `/api/ai-settings` → 读 `providers.openai`，返回 `{ endpoint, model, hasApiKey }`
- POST `/api/ai-settings` → 写 `providers.openai` 的 `apiKey + baseUrl`

旧 PBL 阶段的 LLM 调用（`src/lib/llm/client.ts`）改为优先调用 OpenMAIC 的 `resolveApiKey('openai')`，env 变量作为备份。

---

## 9. 系统集成与兼容性

### 9.1 依赖冲突处理

按 §3 顺序处理。关键点：
- 切换 pnpm 前，验证 openPBL 现有 34 个测试仍通过
- lucide-react 降版本后，扫描所有用到图标的地方（图标 API 在 0.5xx 已稳定，1.23 不存在）

### 9.2 构建配置

`next.config.ts` 需处理：
- `transpilePackages`：把 `@openmaic/*`、`mathml2omml`、`pptxgenjs` 加入
- `serverExternalPackages`：`sharp`、`unpdf` 等仅服务端包
- 静态资源：OpenMAIC 的 `public/` 内容合并到 openPBL 的 `public/openmaic/`

### 9.3 错误处理

所有 OpenMAIC API 路由统一包装：

```typescript
// src/lib/openmaic-bridge/api-response.ts
export function wrapOpenmaicHandler<T>(
  handler: (req: NextRequest) => Promise<T>,
): RouteHandler {
  return async (req) => {
    try {
      const result = await handler(req);
      return Response.json(result);
    } catch (error) {
      const isConfigError = error instanceof OpenMAICProviderConfigError;
      const isGenerationError = error instanceof OpenMAICGenerationError;
      return Response.json(
        {
          error: error.message,
          kind: isConfigError ? 'config' : isGenerationError ? 'generation' : 'unknown',
        },
        { status: isConfigError ? 400 : 500 },
      );
    }
  };
}
```

### 9.4 测试策略

- **单元测试**：保留 OpenMAIC 原生 `tests/` 中的核心测试（pbl/、ai/、generation/ 等），复制到 `src/lib/openmaic/__tests__/`
- **集成测试**：新增 `tests/integration/openmaic-classroom-flow.test.ts`，端到端验证：配置 → 生成 → 持久化 → 学生播放 → 进度上报
- **回归测试**：openPBL 原有 34 个测试必须持续通过

---

## 10. 实施阶段

### Phase 1 MVP（端到端打通）

| 步骤 | 内容 | 验证 |
|---|---|---|
| 1.1 | 切换 pnpm，添加 workspace 配置 | `pnpm install` 成功 |
| 1.2 | 修复 lucide-react 版本冲突 | openPBL 现有测试通过 |
| 1.3 | 复制 `packages/@openmaic/*`、`mathml2omml`、`pptxgenjs` 到 openPBL 根 | `pnpm install` 后可 import |
| 1.4 | 配置 tsconfig 别名 `@openmaic/*` | tsc 编译通过 |
| 1.5 | 复制 OpenMAIC `lib/` 到 `src/lib/openmaic/`，机械改写 `@/` → `@openmaic/` | tsc 编译通过 |
| 1.6 | 新增 `server-providers.yml`，迁移旧 `.openpbl-data` endpoint/model/key | OpenMAIC `getConfig()` 能读到 |
| 1.7 | 复制 `app/api/classroom/route.ts`、`server-providers/route.ts`、`verify-model/route.ts` 到 `src/app/api/openmaic/` | curl 测试通过 |
| 1.8 | 重构 `/teacher/settings` 为多 Tab LLM 配置页（先只启用 LLM Tab） | 教师可保存配置 |
| 1.9 | 改造 `/teacher/prepare/[id]/generate` 调用 `/api/openmaic/classroom` | 真实生成一个课堂 |
| 1.10 | 复制 OpenMAIC `app/classroom/[id]/page.tsx` + 最小渲染依赖到学生端 `/student/ai-learning/[id]` | 学生可打开课堂 |
| 1.11 | 新增 `/api/openmaic/progress` 上报接口 + 适配层 | 进度能写入 session store |
| 1.12 | 教师端 `/teacher/ai-learning` 看板读取真实进度 | 显示真实数据 |

**Phase 1 交付标准**：教师配置一个 LLM provider → 生成一个真实课堂 → 学生打开播放 → 教师看到进度。

### Phase 2 完整链路

| 步骤 | 内容 |
|---|---|
| 2.1 | 添加 ProseMirror + 全套渲染依赖（katex/temml/shiki/motion/echarts/xyflow） |
| 2.2 | 复制 `components/slide-renderer/`、`components/scene-renderers/`、`components/edit/` |
| 2.3 | 复制 `lib/prosemirror/` 编辑器实现 |
| 2.4 | 启用 TTS/Image/Video/WebSearch/PDF Tab 与对应 API 路由 |
| 2.5 | 接入 OpenMAIC SSE 进度流（替换 Phase 1 的简单 loading） |
| 2.6 | 启用 media 生成阶段（classroom-generation 中的 generateMediaForClassroom） |
| 2.7 | 启用 TTS 生成阶段 |
| 2.8 | 启用 Web Search 研究阶段 |
| 2.9 | 复制 OpenMAIC 原生 `tests/`，确保核心算法测试通过 |
| 2.10 | 端到端测试：完整生成一个含 media/TTS/quiz 的课堂 |

**Phase 2 交付标准**：完整 OpenMAIC 链路在 openPBL 内可用，生成质量与原版 OpenMAIC 等价。

---

## 11. 风险与缓解

| 风险 | 概率 | 缓解 |
|---|---|---|
| OpenMAIC 代码复制后别名改写遗漏导致编译失败 | 高 | 用脚本批量改写 + tsc 编译验证 |
| pnpm workspace 引入新问题 | 中 | Phase 1.1 单独验证，不影响其他步骤 |
| OpenMAIC provider-config 的模块缓存与写入冲突 | 中 | 用 `saveProviderEntry` 显式清缓存 |
| ProseMirror 渲染与 openPBL Tailwind v4 样式冲突 | 中 | OpenMAIC 组件作用域化样式前缀 |
| 学生端播放器 SSR 失败（OpenMAIC 大量用 `window`） | 中 | 用 `dynamic(import, { ssr: false })` 加载播放器 |
| 包体积过大导致 Vercel 部署超限 | 中 | 仅服务端用的包（sharp/unpdf/jszip）放入 `serverExternalPackages` |

---

## 12. 不做的事情（YAGNI）

明确**不做**以下事项，避免范围蔓延：

- 不重写 OpenMAIC 的 LLM 调用层（必须保留 `ai` SDK 依赖）
- 不简化 OpenMAIC 的 prompt 模板（保留 `lib/prompts/` 原样）
- 不改造 OpenMAIC 的 agent 编排逻辑（`lib/orchestration/`、`lib/agent/` 原样复制）
- 不为 Phase 1 做移动端深度适配
- 不重写 OpenMAIC 的 i18n（保留 `lib/i18n/` 原样，但默认中文）
- 不引入 OpenMAIC 的 PBL v2 评估模块（`lib/pbl/v2/`）—— openPBL 已有自己的 PBL 流程
- 不替换 openPBL 现有的 tldraw 白板（与 OpenMAIC 的 whiteboard 共存，各服务各阶段）

---

## 13. 验收清单

最终交付必须满足：

- [ ] `pnpm install` 成功，无 peer dep 警告
- [ ] `pnpm build` 成功
- [ ] `pnpm test` 通过（openPBL 原 34 + OpenMAIC 核心）
- [ ] 教师在设置页可配置至少 3 种 LLM provider
- [ ] 教师可发起一次完整课堂生成（含 outline、scene content、actions、media、TTS、quiz）
- [ ] 学生可在 `/student/ai-learning/[id]` 打开生成的课堂并完整播放
- [ ] 教师可在 `/teacher/ai-learning` 看到真实学生进度（非 mock）
- [ ] 生成质量与原版 OpenMAIC 等价（用同一 requirement 在原版与集成版生成，对比 scenes 结构）
- [ ] OpenMAIC 原生 `lib/ai/llm.ts`、`lib/server/classroom-generation.ts`、`lib/generation/*` 等核心文件无算法修改（仅 import 路径变更）
