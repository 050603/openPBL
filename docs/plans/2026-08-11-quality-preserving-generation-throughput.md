# Quality-Preserving Course Generation Throughput Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不减少任何模型职责或质量门的前提下，实现分支并发 3、课程生成全局限流、单页流水线检查点和页面级恢复，并安全优化课程方案设计的中断恢复。

**Architecture:** 主课生成继续使用相同的页面内容、动作和时长修正链路，但每页完成后写入带大纲指纹的数据库检查点。课程生成模型调用在 AsyncLocalStorage 标记的后台上下文中共享有界闸门；个性化分支使用并发 3 并逐条原子持久化；主课关联后，分支与媒体/TTS 两条流水线并行收敛。

**Tech Stack:** TypeScript、Next.js 16 Node runtime、Prisma/PostgreSQL、Vitest、现有 OpenMAIC 生成器。

---

### Task 1: 课程生成全局模型闸门

**Files:**
- Create: `src/lib/course-generation/llm-concurrency.ts`
- Create: `src/lib/course-generation/llm-concurrency.test.ts`
- Modify: `src/lib/llm/client.ts`
- Modify: `src/lib/openmaic/ai/llm.ts`
- Modify: `src/lib/course-generation/job-runner.ts`
- Modify: `src/lib/course-design/job-runner.ts`

**Steps:**
1. 写并发上限、FIFO、公平释放和异常释放的失败测试。
2. 实现只对课程生成 AsyncLocalStorage 上下文生效的闸门，默认并发 4，环境配置限制为 1–5。
3. 在两套 LLM 调用层接入闸门，并在课程设计/课堂任务入口设置后台上下文。
4. 运行定向测试，确认交互式非课程调用不被闸门排队。

### Task 2: 主课页面检查点与恢复

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260811100000_course_generation_page_checkpoints/migration.sql`
- Create: `src/lib/course-generation/page-checkpoints.ts`
- Create: `src/lib/course-generation/page-checkpoints.test.ts`
- Modify: `src/lib/openmaic/server/classroom-generation.ts`
- Modify: `src/lib/course-generation/job-runner.ts`

**Steps:**
1. 写大纲指纹匹配、失配拒绝复用和恢复场景重绑定测试。
2. 新增 `CourseGenerationPageCheckpoint` 表和 `preparedOutlines` 字段。
3. 为 `generateClassroom` 增加已准备大纲、可恢复页面、页面完成回调。
4. 单页在内容、动作和时长修正完成后构造成完整 Scene，并立即回调持久化。
5. 恢复页面仍进入完整性检查、课程级质量审校和最终持久化。

### Task 3: 个性化分支并发 3 与逐条持久化

**Files:**
- Create: `src/lib/course-generation/adaptive-resource-pool.ts`
- Create: `src/lib/course-generation/adaptive-resource-pool.test.ts`
- Modify: `src/lib/course-generation/job-runner.ts`

**Steps:**
1. 写最大并发严格为 3、输入顺序结果稳定、单项失败不取消其他分支的测试。
2. 将串行分支循环替换为并发池，单分支内部生成链路不变。
3. 聚合所有分支进度并经过任务级串行写队列持久化。
4. 每条分支完成或失败后立即合并到数据库最新课程版本。

### Task 4: 单页后续资源流水线

**Files:**
- Modify: `src/lib/course-generation/job-runner.ts`
- Modify: `src/lib/openmaic/server/classroom-asset-generation.ts`
- Test: `src/lib/openmaic/server/classroom-asset-tasks.test.ts`

**Steps:**
1. 主课完成拆分和课程关联后，同时启动个性化分支与媒体/TTS。
2. 两条流水线共用串行进度写队列，避免并发覆盖事件。
3. 保持媒体故障为可降级故障、分支故障为单分支故障；取消信号仍终止全部任务。
4. 只有两条流水线均收敛后才将课程任务标记完成。

### Task 5: 课程方案设计安全恢复

**Files:**
- Modify: `src/lib/course-design/job-runner.ts`
- Create: `src/lib/course-design/resume-policy.ts`
- Create: `src/lib/course-design/resume-policy.test.ts`

**Steps:**
1. 写只有“追踪记录已完成 + 当前课程结构重新校验通过”才允许恢复的测试。
2. 对已完成主课脚本的中断任务直接进入既有大纲检查点/后续流程。
3. 对校验不通过或追踪不完整的任务保持原始全流程生成。
4. 不并发任何存在上游依赖的设计阶段，不跳过 AI 审校。

### Task 6: 全量验证

**Files:**
- Verify all modified files.

**Steps:**
1. 运行新增和相关 Vitest 测试。
2. 运行 Prisma generate 与迁移状态检查。
3. 运行 `pnpm typecheck`。
4. 运行 `pnpm lint`。
5. 运行 `pnpm build`。
6. 审查 diff，确认未减少模型调用职责、质量门或错误处理。

