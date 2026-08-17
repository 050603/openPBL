# Unified Course Design Agent Editing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将快速备课各阶段统一为“生成首稿、硬规则检查、Agent 修复常见明显问题并指导流程、复核后保存”，并修复个性化学习阶段隐藏真实错误和重复重建知识图谱的问题。

**Architecture:** 保留生成器只负责首稿；确定性规则负责结构、引用、时长和权重等硬约束，共享编辑 Agent 只处理明显遗漏、前后矛盾、字段错配和常见错误。Agent 无法从上下文确认的真实学情、学校条件和教学取舍只形成建议，不阻断流程；个性化学习以已通过硬规则的知识图谱为事实来源。

**Tech Stack:** TypeScript、Next.js 16 Route/Server Runtime、Prisma、现有 LLM JSON 管线、Vitest。

---

### Task 1: 固定统一编辑协议

**Files:**
- Create: `src/lib/course-design/stage-editor.ts`
- Create: `src/lib/course-design/stage-editor.test.ts`

1. 先写失败测试，要求编辑请求同时包含当前阶段快照、独立审校问题、不可修改约束和完整修订稿 schema。
2. 实现共享 `editCourseDesignStage`，明确要求保留正确字段和稳定 ID，只返回可直接保存的完整 `revised` 数据。
3. 验证编辑调用使用短于完整首稿生成的请求类别。

### Task 2: 课程成果与成功标准改为直接编辑

**Files:**
- Modify: `src/lib/course-design/job-runner.ts`
- Modify: `src/lib/llm/client.ts`
- Test: `src/lib/course-design/job-runner-agent-editing.test.ts`

1. 为项目成果增加当前候选修订解析器，审校失败后编辑当前 `outcome` 和证据要求，不重新调用成果首稿生成器。
2. 导出评价方案规范化入口，编辑当前 `evaluationPlan` 后重新执行确定性检查与独立审校。
3. 测试首稿生成各调用一次，后续调用均为编辑请求。

### Task 3: 六阶段架构与主课页面改为直接编辑

**Files:**
- Modify: `src/lib/course-design/job-runner.ts`
- Modify: `src/lib/openmaic/generation/outline-generator.ts`
- Test: `src/lib/course-design/job-runner-agent-editing.test.ts`

1. 六阶段审校失败后只编辑当前六阶段活动，随后确定性重建时间计划和项目主线。
2. 主课大纲审校失败后编辑当前页面数组，保留页面 ID、已通过页面和上下游引用。
3. 重新应用页面契约、互动策略、达标测、时长与工具计划规范化，再复审。

### Task 4: 修复个性化学习失败

**Files:**
- Modify: `src/lib/course-entry-generation.ts`
- Modify: `src/lib/course-entry-generation.test.ts`
- Modify: `src/lib/course-design/job-runner.ts`
- Modify: `src/lib/course-design/failure-policy.ts`
- Test: `src/lib/course-design/failure-policy.test.ts`

1. 使用当前已审校知识图谱中的真实先修节点作为课程入口事实，不重新发明或删除已通过的先修关系。
2. 删除“知识点越多就必须覆盖至少一半目标”的机械门槛，改为每个先修都有真实阻断目标且整体至少一项高杠杆学科基础。
3. 审校 Agent 每轮都返回完整 `finalBlueprint`，失败后继续编辑该蓝图而不是重新生成首稿。
4. 保留底层 cause 的安全摘要到服务端日志和作业诊断，教师界面仍显示可理解错误。

### Task 5: 最终综合复核具备修订闭环

**Files:**
- Modify: `src/lib/course-design/job-runner.ts`
- Test: `src/lib/course-design/job-runner-agent-editing.test.ts`

1. 综合复核区分确定性硬错误与 Agent 建议，并尽量定位到具体阶段。
2. 明显可修复问题调用对应阶段编辑器并重新运行硬质量门；无法证实的主观意见记录为建议后继续。
3. 审校服务异常不伪造“AI 已确认”结论，但在确定性质量门通过时不阻断生成。

### Task 6: 回归验证

**Files:**
- Test: `src/lib/course-design/*.test.ts`
- Test: `src/lib/course-entry-generation.test.ts`
- Test: `src/lib/knowledge-structure-generation.test.ts`

1. 运行新增失败测试，确认旧逻辑会重复调用首稿生成器。
2. 完成实现后运行课程设计、知识图谱、课程入口和快速生成界面相关测试。
3. 运行改动文件 ESLint 与完整 TypeScript 类型检查。
4. 当前工作区已有大量用户改动，本任务不自动创建提交。
