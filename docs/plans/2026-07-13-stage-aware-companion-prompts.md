# 阶段化伴学提示词与学习上下文 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立六个学习阶段独立、可测试、可强制执行的伴学提示词策略，并让伴学智能体基于学生真实过程证据提供促进学习而非替代学习的指导。

**Architecture:** 以 `stage-policy` 作为唯一阶段策略来源，集中定义阶段目标、允许角色、允许帮助、禁止行为、必需上下文和自动触发话术。服务端从课程存储构建学生级 `CompanionContextSnapshot`，在 Director 调度和每个角色的系统提示词中注入；角色选择完全由阶段策略和当前课程配置决定，客户端不能提交角色候选，形成不可绕过的阶段硬约束。非圆桌的 teaching-ai 支持函数复用同一阶段契约，避免两套提示词规则漂移。

**Tech Stack:** Next.js 16 Route Handlers、React 19、TypeScript、Vitest、现有 `callLLM` / `callLLMStream` 与 session store。

---

## 设计摘要

### 六阶段服务边界

| 阶段 | 学习目标 | 允许的主要帮助 | 明确禁止 |
| --- | --- | --- | --- |
| launch | 把情境转成学生自己的探究问题和目标 | 澄清情境、拆解问题、提供探索入口 | 代写完整问题、替学生定题 |
| ai-learning | 建构必要知识并连接项目 | 概念解释、例子、理解检查 | 代答题、代做项目、无关长讲 |
| proposal | 独立形成并校准方案 | 质疑、比较标准、风险检查、下一步 | 直接生成完整方案、替学生选方向 |
| make | 制作、测试和迭代作品 | 针对性知识、诊断、验证步骤、局部支架 | 生成完整作品/代码、直接给最终答案 |
| showcase | 用证据准备呈现和答辩 | 证据选择、模拟追问、表达反馈 | 代写演讲稿/PPT、替学生回答答辩 |
| reflection | 从证据回顾决策、影响和迁移 | 证据归因、选择复盘、改进和迁移计划 | 算法教程、算法对比实现、代写反思 |

反思阶段只允许 `reviewer` 与 `recorder` 进入圆桌；`ideation` 在服务端被硬过滤。所有阶段都要求回复落到学生本人可完成的一个动作，并要求学生保留自己的判断或验证证据。

### 数据流

```text
学生端只提交 message / stageKey / 身份
             │
             ▼
服务端读取 Course + studentId
             │
             ├─ 阶段策略：角色白名单、帮助边界、禁止事项
             ├─ 当前/历史提交、项目方案、上传材料元数据
             ├─ 教师反馈、教师评分、AI 评分、综合评分
             ├─ AI 支架采纳记录、学习事件、阶段进度
             └─ 当前反思、教师指令、AI 授知进度
             │
             ▼
Director 只从阶段白名单选人
             │
             ▼
角色系统提示词 = 角色职责 + 阶段契约 + 权威上下文 + 当前消息
```

### 关键架构决策（ADR）

1. **阶段策略集中维护**：避免把规则散落在角色配置、页面自动消息和 API Director 中；代价是新增阶段时必须维护一个策略对象。
2. **上下文在服务端组装**：评分和教师反馈属于可信课堂数据，不能依赖客户端传入；同时限制条数和文本长度，控制 token 成本。
3. **阶段白名单是硬约束**：服务端只按阶段策略与课程配置解析角色；配置列表不能把禁止角色重新放回阶段，也不接受客户端角色候选。
4. **认知外包防护采用“拒绝 + 重定向”**：遇到“直接给答案/代写/反思阶段技术教程”时，不只拒绝，还必须把学生带回该阶段的证据、判断或下一步动作。

## Implementation Tasks

### Task 1: 阶段策略与上下文契约

**Files:**
- Create: `src/lib/companion/stage-policy.ts`
- Create: `src/lib/companion/context.ts`
- Modify: `src/lib/ai-companions.ts`
- Test: `src/lib/companion/stage-policy.test.ts`
- Test: `src/lib/companion/context.test.ts`

Implement typed stage policies, role resolution, stage-specific trigger prompts and bounded context formatting. Reflection fixtures must include submissions, teacher feedback, rubric scores, AI scores/evaluations, AI supports, activity evidence and existing reflection text.

### Task 2: Roundtable server enforcement

**Files:**
- Modify: `src/app/api/chat/companion/route.ts`

Load the authoritative course once, resolve effective roles through the stage policy, inject the context into Director and agent prompts, and only persist recorder summaries when the recorder is valid for the current stage. Off-stage requested roles must never be selected.

### Task 3: Student trigger alignment

**Files:**
- Modify: `src/components/views/student/companion-roundtable.tsx`
- Modify: `src/components/views/student/project-launch.tsx`
- Modify: `src/components/views/student/ai-learning.tsx`
- Modify: `src/components/views/teacher/ai-chat-stage-toggle.tsx`

Replace hard-coded “创意启发” / “记记收束” trigger text with stage-policy prompts and stage-specific roles. Keep the existing teacher switch as the final UI gate, and expose the stage-aware companion entry consistently for all six stages; in the development-stage system, all six stages are enabled by default and teachers may close a stage.

### Task 4: Non-roundtable support prompt alignment

**Files:**
- Modify: `src/lib/teaching-ai/support-engine.ts`

Append the same stage contract to proposal diagnosis, artifact diagnosis, showcase coaching, reflection evidence prompts and direction suggestions. Expand reflection evidence input to include prior submissions, teacher/AI/final scores, feedback, evaluations, existing reflection and process evidence.

### Task 5: Verification

Run:

```powershell
pnpm exec vitest run src/lib/companion/stage-policy.test.ts src/lib/companion/context.test.ts src/lib/ai-companions.test.ts
pnpm exec tsc --noEmit
pnpm test
pnpm build
pnpm exec eslint src/lib/companion src/lib/ai-companions.ts src/app/api/chat/companion/route.ts src/components/views/student/companion-roundtable.tsx src/components/views/student/project-launch.tsx src/components/views/student/ai-learning.tsx src/components/views/teacher/ai-chat-stage-toggle.tsx src/lib/teaching-ai/support-engine.ts
```

Acceptance criteria:

- Reflection never resolves `ideation` and its prompt explicitly forbids algorithm comparison or implementation tutorials.
- Reflection context contains the student’s previous artifacts, teacher score, AI score/evidence, teacher feedback and existing reflection when present.
- Every stage has distinct objectives, allowed help and prohibited behavior in both Director and agent prompts.
- A request that names a forbidden role or asks for a final answer is redirected to a student-owned, stage-appropriate action.
- The new API requires `message`, `stageKey`, `courseId`, and `studentId`; client history, course text, scores, feedback, student work, and role candidates are not accepted as context fields.
- The six-stage system is upgraded directly for the development environment; no old-client/page compatibility branches or legacy prompt fallbacks are introduced.
