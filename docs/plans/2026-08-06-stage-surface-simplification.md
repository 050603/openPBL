# Stage Surface Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 固定六阶段的学生界面边界，恢复非伴学阶段工作台，并将方案与实践阶段收束为必要的核心任务。

**Architecture:** 阶段界面由阶段键直接决定，不再读取教师配置或学生偏好。`launch`、`ai-learning`、`showcase`、`reflection` 使用专用任务页，`proposal`、`make` 使用伴学场景；第三、四阶段继续写入结构化证据，但用单任务界面承载，版本与过程记录留在后台。

**Tech Stack:** Next.js 16、React 19、TypeScript、Vitest、Testing Library。

---

### Task 1: 固定阶段界面策略

**Files:**
- Modify: `src/lib/classroom/stage-workspace-policy.ts`
- Modify: `src/lib/classroom/stage-workspace-policy.test.ts`
- Modify: `src/lib/companion/stage-access.test.ts`

1. 先写测试，断言仅 `proposal`、`make` 支持伴学。
2. 运行测试并确认旧策略失败。
3. 实现固定阶段策略并忽略历史入口配置。
4. 再次运行测试。

### Task 2: 恢复专用任务工作台

**Files:**
- Modify: `src/components/views/student/stage-dispatcher.tsx`
- Modify: `src/app/student/classroom/[id]/page.test.tsx`
- Modify: `src/components/views/teacher/stage-dispatcher.tsx`

1. 增加路由测试，覆盖六阶段界面。
2. 恢复项目启动、成果展示、学习反思原工作台。
3. 保持第二阶段 AI 授知专用页。
4. 教师端非伴学阶段恢复原阶段工作台。

### Task 3: 移除教师入口切换

**Files:**
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`
- Modify: `src/app/teacher/prepare/[id]/preview/page.tsx`
- Modify: `src/app/teacher/teach/[id]/classroom/page.tsx`

1. 删除备课、预览、授课页面的阶段入口配置组件。
2. 仅在第三、四阶段显示伴学观察入口。
3. 验证教师端不再出现双入口或切换说明。

### Task 4: 收束第三、四阶段任务

**Files:**
- Modify: `src/lib/learning-evidence/missions.ts`
- Modify: `src/lib/learning-evidence/readiness.ts`
- Modify: `src/components/views/student/evidence-task/proposal-task.tsx`
- Modify: `src/components/views/student/evidence-task/make-task.tsx`
- Modify: `src/lib/learning-evidence/readiness.test.ts`

1. 将第三阶段定义为一项“形成可实施方案”。
2. 将知识应用、实施步骤与验证方法合并到同一张方案卡。
3. 将第四阶段每轮版本、测试、修改合并到同一卡片，同时保留三类后台记录。
4. 更新完成条件和测试。

### Task 5: 验证

1. 运行相关 Vitest 测试。
2. 运行 ESLint 与全量类型检查。
3. 在真实学生页面分别切换六阶段，确认阶段1/2/5/6无伴学场景，阶段3/4进入伴学场景。
