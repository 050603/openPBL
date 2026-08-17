# Strict Prerequisite Adaptive Learning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把个性化资源改造成严格区分先修知识与本课新授内容的“诊断—补缺—主课—达标—拓展”闭环。

**Architecture:** 在共享服务中统一快速生成与详细生成的个性化方案生成、规范化、确定性质量门禁和独立语义审校。方案显式保存逐主课知识的先修决策及先修依据；播放器允许没有真实先修知识时跳过前测，并只插入与学生具体缺口匹配的一对一补学资源。

**Tech Stack:** TypeScript、Next.js App Router、React、Vitest、Prisma JSON course aggregate、OpenMAIC classroom player。

---

### Task 1: 锁定先修知识语义边界

**Files:**
- Modify: `src/lib/session/types.ts`
- Modify: `src/lib/adaptive-learning.test.ts`
- Modify: `src/lib/adaptive-learning.ts`

1. 添加失败测试：NLP 的分词、词性标注、文本分类和规则方法已经出现在主课时，不能被同义包装成先修知识。
2. 添加失败测试：没有专门先修依赖时，零题前测是完整且可发布的方案。
3. 添加先修分析、课前掌握依据、必要性理由和诊断边界类型。
4. 更新规范化与质量门禁，验证分析覆盖、引用闭环、每门课至少一项真实先修以及一项先修严格对应一道题和一份资源。
5. 运行 `pnpm vitest run src/lib/adaptive-learning.test.ts`。

### Task 2: 统一方案生成与独立语义审校

**Files:**
- Create: `src/lib/adaptive-learning-generation.ts`
- Create: `src/lib/adaptive-learning-generation.test.ts`
- Modify: `src/lib/course-design/job-runner.ts`
- Modify: `src/app/api/adaptive-learning/outline/route.ts`

1. 添加失败测试：生成器必须读取课程目标、学情、年级、全部主课页和知识图谱。
2. 添加失败测试：语义审校拒绝“本课新授伪装成先修”和“只因有帮助便进入前测”的方案，并把问题反馈给下一轮生成。
3. 建立共享生成服务，执行生成、规范化、结构门禁、语义审校和最多一次完整修订。
4. 让快速生成和详细生成调用同一服务；快速流程失败时继续由托管 Agent 恢复，详细流程保留原方案并返回可理解警告。
5. 运行相关服务与路由测试。

### Task 3: 让补学真正按缺口发生

**Files:**
- Modify: `src/lib/adaptive-learning.ts`
- Modify: `src/lib/course-generation/job-runner.ts`
- Modify: `src/components/teacher/adaptive-learning-plan-editor.tsx`
- Modify: `src/app/teacher/prepare/[id]/generate/page.tsx`

1. 添加失败测试：每份先修资源只能关联一个先修知识，并自动绑定对应前测题。
2. 将题干、正确依据、典型误解、先修掌握边界和被支撑的主课知识传入补学课堂生成要求。
3. 保持补学资源预生成和同播放器播放，不在运行时临时调用大模型。
4. 更新教师端状态说明，零题时显示“方案不完整”，完整方案展示“缺口—补学一一对应”。

### Task 4: 修正学生播放状态机

**Files:**
- Modify: `src/components/views/student/adaptive-ai-learning-runtime.tsx`
- Modify: `src/components/views/student/adaptive-ai-learning-runtime.test.tsx`
- Modify: `src/lib/adaptive-learning.ts`

1. 添加失败测试：新生成的零题方案不能通过质量门；历史零题数据仍保持播放安全，等待教师重新生成。
2. 添加失败测试：前测只错一个先修点时，只插入对应的一份补学资源。
3. 前测有题才显示；补学全部排在第一张主课页前；主课结束后只有达标测能触发拓展。
4. 保持失败资源可恢复、预算限制和播放完成持久化。

### Task 5: 完整验证

**Files:**
- Test: `src/lib/adaptive-learning*.test.ts`
- Test: `src/components/views/student/adaptive-ai-learning-runtime.test.tsx`
- Test: `src/components/teacher/adaptive-learning-plan-editor.test.tsx`

1. 运行个性化资源定向测试并确认新增用例先失败后通过。
2. 运行 `pnpm typecheck` 与 `pnpm lint`。
3. 运行 `pnpm test -- --run`。
4. 使用实际 NLP 课程输入检查生成审校上下文，确认新方案不会复用旧的四道伪先修题。
