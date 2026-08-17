# Companion Studio Guidance And Motion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让方案构思与项目实践阶段的智能体伴学页面更容易理解下一步，并让角色循环动作之间的切换保持位置、节奏与视觉连续性。

**Architecture:** 保留现有 `CompanionRuntimeProvider`、Pixi 场景和项目工作台数据流，在伴学页面上增加一个纯函数阶段指引层，用已有阶段 readiness 生成目标、行动文案和快捷提问；动画层在 `Person` 播放器中统一计算成对过渡时长与循环帧相位，不新增素材、不改变任务状态机。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、PixiJS 8、Vitest、Testing Library、CSS。

---

### Task 1: 阶段指引模型

**Files:**
- Create: `src/components/views/student/companion-studio-guidance.ts`
- Create: `src/components/views/student/companion-studio-guidance.test.ts`

**Step 1: Write the failing test**

覆盖 `proposal` 与 `make` 的阶段名称、主行动、CTA、三条快捷提问，以及不同 readiness 状态下的下一步提示。

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/views/student/companion-studio-guidance.test.ts`

Expected: FAIL，因为阶段指引模块尚不存在。

**Step 3: Write minimal implementation**

新增纯函数 `getCompanionStudioGuidance(stageKey, readiness)`；文案只复用阶段任务和 readiness，不创建第二套业务状态。

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/views/student/companion-studio-guidance.test.ts`

Expected: PASS。

### Task 2: 页面层级与交互优化

**Files:**
- Modify: `src/components/views/student/companion-studio-workspace.tsx`
- Modify: `src/components/views/student/companion-studio-workspace.css`
- Modify: `src/components/views/student/companion-studio-workspace-task-sync.test.tsx`

**Step 1: Write the failing component assertions**

验证阶段卡显示目标、下一步与 CTA；验证 proposal/make 的快捷提问不同，点击后只填入输入框而不自动发送；验证关键控制仍有可访问名称。

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/views/student/companion-studio-workspace-task-sync.test.tsx`

Expected: FAIL，因为页面尚未渲染新指引与快捷提问。

**Step 3: Implement the interface**

把左上阶段卡改为“阶段目标 + readiness 下一步 + 明确 CTA”，在主输入框上方增加三条阶段化快捷提问，并通过 `data-stage` 提供方案构思和项目实践的克制主题差异；保留现有动态、设置、任务工作台与 AI 边界。

**Step 4: Run component tests**

Run: `pnpm exec vitest run src/components/views/student/companion-studio-workspace-task-sync.test.tsx`

Expected: PASS。

### Task 3: 人物动作连续性

**Files:**
- Modify: `src/pixi/person.ts`
- Modify: `src/pixi/person.test.ts`

**Step 1: Write the failing motion-math tests**

验证循环动作相位可按总帧数映射，重启动作保持第 0 帧；验证动作切换使用前后两段中较长的过渡时间，避免从慢动作切回快动作时突然缩短淡化。

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/pixi/person.test.ts`

Expected: FAIL，因为相位映射和成对过渡函数尚不存在。

**Step 3: Implement motion continuity**

循环动作互切时继承上一动作的归一化帧相位；非循环、显式 restart 和首次播放仍从第 0 帧开始。交叉淡化时长取来源与目标动作的较长值，并继续保持现有 bodyCore / bottomCenter 锚点校正。

**Step 4: Run motion tests**

Run: `pnpm exec vitest run src/pixi/person.test.ts src/pixi/orchestrator.test.ts src/pixi/status-presentation.test.ts`

Expected: PASS。

### Task 4: Regression And Visual Verification

**Files:**
- Modify tests only if a regression reveals a missing contract.

**Step 1: Run targeted tests**

Run: `pnpm exec vitest run src/components/views/student/companion-studio-guidance.test.ts src/components/views/student/companion-studio-workspace-task-sync.test.tsx src/pixi/person.test.ts src/pixi/orchestrator.test.ts src/pixi/status-presentation.test.ts`

Expected: PASS。

**Step 2: Run static checks**

Run: `pnpm exec eslint src/components/views/student/companion-studio-guidance.ts src/components/views/student/companion-studio-guidance.test.ts src/components/views/student/companion-studio-workspace.tsx src/components/views/student/companion-studio-workspace-task-sync.test.tsx src/pixi/person.ts src/pixi/person.test.ts`

Run: `pnpm typecheck`

Expected: PASS。

**Step 3: Build**

Run: `pnpm build`

Expected: PASS。

**Step 4: Visual QA**

在桌面和窄屏分别检查方案构思与项目实践：阶段卡不遮挡角色、CTA 与快捷提问可见、任务抽屉仍可开合、输入草稿保留、动作切换无明显跳位或从首帧顿挫，并确认 `prefers-reduced-motion` 下界面动效停用。
