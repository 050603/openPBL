# AI 伴学项目式课堂实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 openPBL 从七阶段真实分组课堂迁移为六阶段个人项目课堂，并以角色化 AI 伴学小组替代学生分组。

**Architecture:** 对外课堂模型使用六个固定阶段和“学生个人项目空间”；对内暂时复用旧 `ProjectGroup/groupId` 作为兼容存储键，确保历史方案、白板、上传和评价数据可继续读取。AI 伴学交互沿用 OpenMAIC 的角色头像/切换呈现方式，通过现有 Teaching AI 支持接口完成角色化对话，并记录过程证据。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Tailwind CSS、Vitest、现有 session reducer 与 Teaching AI API。

---

### Task 1: 六阶段模型与旧课程迁移

**Files:**
- Modify: `src/lib/session/types.ts`
- Modify: `src/lib/session/actions.ts`
- Modify: `src/lib/session/actions.test.ts`
- Modify: `src/lib/classroom/stage-gates.ts`
- Modify: `src/lib/classroom/stage-gates.test.ts`

**Steps:**
1. 先写迁移测试：七阶段课程归一化为六阶段，`group + review` 合并为 `proposal`，互评流程移除且权重归一为 AI 30 / 教师 50 / 学生 20。
2. 运行定向测试并确认失败。
3. 更新默认阶段、归一化逻辑和阶段门槛，所有门槛按学生个人项目检查。
4. 运行定向测试并确认通过。

### Task 2: 入课与启动阶段取消真实分组

**Files:**
- Modify: `src/lib/session/actions.ts`
- Modify: `src/components/views/student/project-launch.tsx`
- Modify: `src/components/views/teacher/project-launch.tsx`
- Modify: `src/app/teacher/teach-setup/[id]/page.tsx`

**Steps:**
1. 学生加入课堂时自动创建隐藏的个人项目空间，不再依赖分组模式。
2. 教师开课配置固定为个人项目，不显示自由/随机/指定分组。
3. 将启动页中的“入组、组数、小组汇报”替换为“个人项目、项目准备、个人汇报”。
4. 用类型检查验证调用契约。

### Task 3: 合并方案阶段并改为个人项目

**Files:**
- Modify: `src/components/views/student/stage-dispatcher.tsx`
- Modify: `src/components/views/teacher/stage-dispatcher.tsx`
- Modify: `src/components/views/student/proposal-review.tsx`
- Modify: `src/components/views/teacher/proposal-review.tsx`

**Steps:**
1. 用单一“方案构思与校准”阶段替代原小组构思和方案汇报。
2. 学生独立填写驱动问题、成果形式、实施计划、必备知识、AI 使用计划和风险。
3. 教师按学生查看方案并批准/要求修订。
4. 确认旧课程的原方案仍可显示。

### Task 4: 角色化 AI 伴学小组

**Files:**
- Create: `src/lib/ai-companions.ts`
- Modify: `src/components/views/student/ai-chat-panel.tsx`
- Modify: `src/components/views/teacher/ai-chat-stage-toggle.tsx`
- Modify: `src/lib/teaching-ai/support-engine.ts`
- Modify: `src/lib/teaching-ai/support-engine.test.ts`

**Steps:**
1. 定义知识、启发、质疑、方案、模拟用户/评审、过程记录六种伙伴及各阶段推荐关系。
2. 将原单助手面板改造成 OpenMAIC 风格的头像角色栏、角色切换和多角色消息气泡。
3. 给 Teaching AI 请求加入角色边界：优先提问/提示、不得代做、要求学生解释采纳理由。
4. 将对话作为 AI 支持记录保存，供过程评价使用。
5. 增加提示词单元测试并运行。

### Task 5: 教师端、制作、汇报与反思个人化

**Files:**
- Modify: `src/components/views/teacher/project-making.tsx`
- Modify: `src/components/views/student/workspace.tsx`
- Modify: `src/components/views/teacher/workspace.tsx`
- Modify: `src/components/views/student/showcase.tsx`
- Modify: `src/components/views/teacher/showcase.tsx`
- Modify: `src/components/views/teacher/reflection.tsx`

**Steps:**
1. 将可见文案、对象选择与统计从“小组”改为“学生个人项目”。
2. 移除分工、贡献率、学生互评入口，保留作品、过程证据、教师评价和自我反思。
3. 教师介入对象改为学生或课程，不再提供“调整小组分工”。
4. 检查六阶段各视图均可进入。

### Task 6: 全量验证

**Files:**
- Test: `src/**/*.test.ts(x)`

**Steps:**
1. 运行 `pnpm test`，预期全部通过。
2. 运行 `pnpm exec tsc --noEmit`，预期无类型错误。
3. 运行变更文件 ESLint，预期无 error。
4. 运行 `pnpm build`，预期 Next.js 16 生产构建成功。
5. 启动开发服务器，检查教师与学生核心课堂页没有横向溢出、阶段错位或分组入口。
