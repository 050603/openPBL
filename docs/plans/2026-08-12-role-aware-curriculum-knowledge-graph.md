# Role-aware Curriculum Knowledge Graph Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立区分课前先修与本课目标的统一知识结构，并让前测、逐缺口补学、主课递进和课后达标共同消费该结构。

**Architecture:** `knowledgePoints` 维持本课教学边界，`knowledgeGraph` 增加带角色的先修节点和带类型/强度的依赖边。共享知识结构生成服务执行候选生成、确定性校验、独立语义审校和自动重试；个性化生成只消费通过审校的必需先修路径。

**Tech Stack:** TypeScript、Next.js、Vitest、现有 LLM JSON 生成管线、React Flow。

---

### Task 1: 扩展知识结构 schema

**Files:**
- Modify: `src/lib/session/types.ts`
- Test: `src/lib/knowledge-graph-quality.test.ts`

1. 为图谱节点增加 `instructionalRole`、目标映射、掌握边界和先修证据字段。
2. 为边增加 `type`、`strength` 与 `rationale`。
3. 保持旧字段可选，确保历史课程可读。

### Task 2: 重写图谱规范化与确定性质量门

**Files:**
- Modify: `src/lib/llm/client.ts`
- Modify: `src/lib/knowledge-graph-quality.ts`
- Test: `src/lib/llm/client.test.ts`
- Test: `src/lib/knowledge-graph-quality.test.ts`

1. 添加高中自然语言处理的失败测试：本课节点与人工智能/机器学习前序节点必须分开。
2. 允许图谱包含额外先修节点，但禁止无角色的额外节点。
3. 校验必需先修路径、诊断边界、目标覆盖、无环和关系语义。

### Task 3: 升级知识结构生成与独立审校

**Files:**
- Modify: `src/lib/llm/prompts.ts`
- Create: `src/lib/knowledge-structure-generation.ts`
- Create: `src/lib/knowledge-structure-generation.test.ts`
- Modify: `src/lib/llm/client.ts`

1. 提示模型先划定本课目标，再逆向分析课程体系先修，区分必需与有帮助。
2. 用高中自然语言处理案例验证三大基石、机器学习、数据集划分、监督学习和神经网络可以形成真实候选。
3. 独立审校拒绝本课新授内容伪装先修、无证据先修、弱帮助关系和不适龄节点。
4. 审校失败时把反馈交回生成代理，最多自动修订三轮。

### Task 4: 让前测与补学直接消费图谱先修路径

**Files:**
- Modify: `src/lib/adaptive-learning.ts`
- Modify: `src/lib/adaptive-learning-generation.ts`
- Test: `src/lib/adaptive-prerequisite-boundary.test.ts`
- Test: `src/lib/adaptive-learning-generation.test.ts`

1. 删除依据 `foundation` 和自由文本猜测先修的主路径。
2. 只提取结构化必需先修路径，并继承图谱的课程衔接证据与诊断边界。
3. 每个先修能力严格对应一道题和一份至少一页的 AI 授知资源。

### Task 5: 更新备课审阅界面

**Files:**
- Modify: `src/components/knowledge-graph.tsx`
- Modify: `src/components/knowledge-graph-flow.tsx`
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`

1. 视觉区分“课前先修”和“本课目标”。
2. 展示关系类型、必要强度、衔接依据和诊断/掌握边界。
3. 允许教师编辑先修节点和结构化关系，且不把先修节点加入主课覆盖清单。

### Task 6: 端到端验证

**Files:**
- Test: relevant Vitest suites

1. 运行知识结构与个性化路径针对性测试。
2. 运行类型检查和改动文件 lint。
3. 运行全量单元测试；若全量测试超时，保留可复现命令和最后输出。

### Task 7: 修复错误零先修的二次反向分析

**Files:**
- Create: `src/lib/prerequisite-knowledge-analysis.ts`
- Create: `src/lib/prerequisite-knowledge-analysis.test.ts`
- Modify: `src/lib/adaptive-learning-generation.ts`
- Modify: `src/lib/course-design/job-runner.ts`
- Modify: `src/app/api/adaptive-learning/outline/route.ts`

1. 在最终主课页面已经生成后，对每个本课目标独立反推必须的课程体系前序能力。
2. 把空学段与空画像解释为“K12 学段待确认”，并禁止零先修；每门课至少 1 项真实先修，推荐 2-4 项、最多 5 项。
3. 用第二次模型调用独立审核候选覆盖层；失败时反馈给分析器自动重试，不能把未经反证的零结果交给前测生成。
4. 将审核后的先修节点与关系合并回统一知识图谱，并由快速生成和手动重生成入口同步保存。
5. 增加计算机视觉、空画像、强制拒绝零先修、非法关系类型、合法先修误删和一题一资源闭环的回归测试。
