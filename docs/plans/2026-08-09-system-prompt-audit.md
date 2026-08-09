# System Prompt Quality Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 全面审计 openPBL 运行时提示词，建立统一的语言、证据、任务边界和输出质量契约，并修复会泄漏内部字段或导致低质量生成的高风险提示词。

**Architecture:** 将提示词分为备课生成、教师支持、学生伴学、自适应资源和 OpenMAIC 内容生成五类。保留各领域必要的结构枚举，但通过共享契约约束所有用户可见文字；对结构化输出继续使用各自 schema，并在解析或显示层保留确定性校验。使用静态审计测试防止后续新增提示词绕过语言、证据和输出规则。

**Tech Stack:** TypeScript、Next.js Route Handlers、Vitest、现有 LLM/OpenMAIC 提示词加载器。

---

### Task 1: 建立提示词资产清单和风险基线

**Files:**
- Create: `src/lib/prompt-quality/policy.ts`
- Create: `src/lib/prompt-quality/policy.test.ts`

**Steps:**

1. 列出所有运行时 system/user prompt 构造器、路由内联提示词和 Markdown 模板。
2. 按语言泄漏、原始 JSON、证据不足、任务边界不清、输出契约不足、缺少自检六类标记风险。
3. 写失败测试，覆盖内部枚举不得进入用户文本、中文产品默认输出简体中文、证据不足不得推断为“不存在”。
4. 运行 `pnpm vitest run src/lib/prompt-quality/policy.test.ts`，确认测试先失败。

### Task 2: 建立共享提示词契约

**Files:**
- Create: `src/lib/prompt-quality/policy.ts`
- Modify: `src/lib/llm/prompts.ts`
- Modify: `src/lib/teaching-ai/support-engine.ts`
- Modify: `src/lib/ai-companions.ts`

**Steps:**

1. 实现中文用户可见文本、内部结构字段隔离、证据与未知信息处理、任务边界和输出前自检五段共享规则。
2. 为 JSON、短对话、教师诊断三类任务提供精简组合函数，避免提示词无差别膨胀。
3. 将备课、教师支持和伴学提示词接入相应契约。
4. 更新测试，确认结构枚举仍可用于 JSON 字段但不会被鼓励写入自然语言。

### Task 3: 修复高风险内联提示词

**Files:**
- Modify: `src/app/api/adaptive-learning/outline/route.ts`
- Modify: `src/app/api/adaptive-learning/micro-lesson/route.ts`
- Modify: `src/app/api/chat/companion/route.ts`
- Modify: `src/app/api/teaching-ai/facilitation-scaffold/route.ts`
- Modify: `src/app/api/openmaic/quiz-grade/route.ts`

**Steps:**

1. 将原始阶段代码替换为“代码 + 中文标签”的结构输入，禁止在用户可见字段复述代码。
2. 明确输入证据优先级、未知信息处理和禁止编造规则。
3. 为每个 JSON 输出补齐字段语义、长度、质量标准和输出前检查。
4. 添加或更新路由测试，验证语言与结构契约。

### Task 4: 审核 OpenMAIC 模板体系

**Files:**
- Modify as needed: `src/lib/openmaic/prompts/templates/**`
- Modify as needed: `src/lib/openmaic/pbl/v2/prompts/**`
- Modify: `src/lib/openmaic/prompts/index.ts`

**Steps:**

1. 检查模板是否明确继承 `languageDirective`，是否区分结构字段与学习者可见文本。
2. 检查课程大纲、幻灯片、互动、测验、PBL 评价是否包含受众、证据、难度、反代写和自检要求。
3. 仅修复真实缺口，保留 HTML、JSON、动作协议等必要英文技术标识。
4. 运行 OpenMAIC prompt 测试，确保模板变量和输出协议不被破坏。

### Task 5: 全量验证与审计报告

**Files:**
- Create: `docs/prompt-quality-audit.md`

**Steps:**

1. 运行所有提示词、LLM、伴学、教师支持、自适应和 OpenMAIC 相关测试。
2. 运行 ESLint、TypeScript 和 `git diff --check`。
3. 记录提示词资产分类、已修复风险、保留的结构化英文标识和后续新增提示词准入规则。
4. 不自动提交，保留给当前工作区统一审阅。
