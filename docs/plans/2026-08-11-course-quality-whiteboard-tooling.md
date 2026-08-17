# 课程生成质量、白板可靠性与课堂工具 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不削减现有生成阶段与质量审校的前提下，提高课程知识边界一致性，修复白板动作回放缺口，并让授课模型在抽象讲解中更主动地使用视觉工具。

**Architecture:** 保留“课程定位 → 项目成果 → 评价 → 六阶段架构 → 逐页大纲 → 页面内容 → 授课动作 → 全课复核”的既有流水线。课程大纲层增加确定性的父活动知识点对齐。实时授课采用 AI SDK 原生工具调用，服务端把每次 tool call 编译成既有 Action SSE 事件，因此权限、顺序、ActionEngine、聊天记录和回放仍共用同一 DSL；不支持原生工具的模型在首次输出前失败时回退到结构化 JSON 动作。预生成课件继续生成确定性 Action 脚本，并与实时工具使用同一 Action union。

**Tech Stack:** TypeScript、Next.js App Router、Vitest、OpenMAIC Action DSL、Markdown prompt templates

---

### Task 1: 修复白板高级动作的回放调度

**Files:**
- Create: `src/lib/openmaic/playback/engine-whiteboard-actions.test.ts`
- Modify: `src/lib/openmaic/playback/engine.ts`

**Steps:**
1. 写一个回放集成测试，依次放入 `wb_draw_line`、`wb_draw_code`、`wb_edit_code`，断言三者都会交给 `ActionEngine.execute`。
2. 单独运行测试并确认当前实现失败。
3. 把三个动作加入播放器的同步动作分支；不改动 ActionEngine 中已有的渲染实现。
4. 重跑测试，确认动作按原顺序执行且页面正常结束。

### Task 2: 让课程知识点严格服从所属父活动

**Files:**
- Modify: `src/lib/openmaic/generation/outline-generator.ts`
- Modify: `src/lib/openmaic/generation/outline-generator.test.ts`
- Modify: `src/lib/course-design/quality-gates.ts`
- Modify: `src/lib/course-design/quality-gates.test.ts`
- Modify: `src/lib/course-design/job-runner.ts`

**Steps:**
1. 写失败测试覆盖两个 AI 授知父活动：模型漏掉的知识点只能补到所属父活动页面，越界知识点必须被移除，不能全部塞到第一张学生页。
2. 在 `enforcePblOutlineContract` 内按 `parentActivityId` 对齐知识点，并把缺失知识点分配给同一父活动中负载最小的非测验页面。
3. 给快速课程设计质量闸门传入父活动目录，检查无效父链接、父活动外知识点和未覆盖知识点。
4. 重跑大纲与质量闸门测试，确认教师资源和已确认互动类型保持不变。

### Task 3: 强化“先视觉化、再继续讲”的模型合同

**Files:**
- Modify: `src/lib/openmaic/prompts/snippets/instructional-presentation-policy.md`
- Modify: `src/lib/openmaic/prompts/templates/slide-actions/system.md`
- Modify: `src/lib/openmaic/prompts/templates/agent-system-wb-teacher/system.md`
- Modify: `src/lib/openmaic/orchestration/prompt-builder.ts`
- Modify: `src/lib/openmaic/prompts/instructional-presentation.test.ts`

**Steps:**
1. 先扩展提示词合同测试，要求预生成授课与实时教师都包含“学生必须看见时优先调用工具”“避免连续长讲”“动作与讲解交替”的规则。
2. 在共享教学呈现策略中加入跨学科视觉决策检查点，不使用学科关键词硬编码。
3. 让预生成动作在抽象关系、步骤、变化需要被看见时优先使用白板；实时教师在继续追加解释前优先选择白板/幻灯片动作或理解检查。
4. 重跑提示词合同测试。

### Task 4: 原生课堂工具调用桥接

**Files:**
- Create: `src/lib/openmaic/orchestration/native-teaching-tools.ts`
- Modify: `src/lib/openmaic/orchestration/ai-sdk-adapter.ts`
- Modify: `src/lib/openmaic/orchestration/director-graph.ts`
- Modify: `src/lib/openmaic/orchestration/prompt-builder.ts`
- Modify: `src/lib/openmaic/prompts/templates/agent-system/system.md`

**Steps:**
1. 为角色和 scene 计算有效工具集，并用 Zod 定义每个白板、幻灯片、理解检查、证据板和 widget 工具的输入 schema。
2. 让 AI SDK adapter 读取 `fullStream` 的文本与 `tool-call` 事件，并保留多步工具结果循环。
3. 把 tool call 转换为既有 SSE `action`，在发送前再次检查 allowlist。
4. 原生路径首次输出前失败时回退结构化 Action 生成；保留环境变量关闭开关。
5. 实时提示词使用自然文本与原生工具，不再要求模型输出 JSON；理解检查调用后结束当前模型轮次。

### Task 5: 同步接入其他课堂教学组件

**Files:**
- Modify: `packages/@openmaic/dsl/src/action.ts`
- Create: `src/lib/openmaic/store/teaching-tools.ts`
- Create: `src/components/openmaic/canvas/teaching-tool-layer.tsx`
- Modify: `src/lib/openmaic/action/engine.ts`
- Modify: `src/components/openmaic/chat/use-chat-sessions.ts`

**Steps:**
1. 新增 `check_understanding`：支持单选、多选、简答和预测；预生成回放等待学生提交，实时提交自动进入下一轮模型反馈。
2. 新增 `evidence_board_update`：支持替换、追加、清空主张—证据—推理条目，并强制声明来源状态。
3. 把现有 widget 动作加入教师有效工具，在实时课堂按 scene 将动作发给互动 iframe。
4. 切换或清空课程时重置工具状态，避免跨课污染。
5. 给聊天流增加新工具动作标签，让调用可观察而不把工具参数混入讲解文本。

### Task 6: 验证

**Files:**
- Test: `src/lib/openmaic/playback/engine-whiteboard-actions.test.ts`
- Test: `src/lib/openmaic/generation/outline-generator.test.ts`
- Test: `src/lib/course-design/quality-gates.test.ts`
- Test: `src/lib/openmaic/prompts/instructional-presentation.test.ts`

**Steps:**
1. 运行上述针对性 Vitest。
2. 运行相关 OpenMAIC generation/playback 测试集合。
3. 运行 `pnpm typecheck`。
4. 运行 `pnpm lint`（若仓库已有无关告警，单独报告且不修改用户无关文件）。
5. 运行 `git diff --check` 并审阅最终差异，确认没有覆盖现有未提交成果。

## 本轮课堂工具落地与后续边界

### 1. 理解检查卡（优先级最高）

- **教学作用：** 在讲解关键概念后，用单题预测、判断、简答或“用自己的话复述”获取真实理解证据；它不同于预生成测验页，适合在当前讲授上下文中即时调用。
- **本轮动作：** `check_understanding`。模型传入问题、回答类型、可选项、提示和预期证据，不直接传分数。
- **学生结果：** 回答、耗时、提示次数与置信度进入课堂上下文；模型据此继续、换例子或回到白板，不凭“有没有回复”猜测掌握。
- **工程要求：** 动作可回放，学生提交事件幂等，历史课堂只读展示；预生成课程与实时讨论共用同一结果结构。

### 2. 证据板 / CER 卡片

- **教学作用：** 为 PBL 的主张—证据—推理、来源比较、方案取舍和教师评价提供稳定可检查的视觉结构；白板负责推演，证据板负责保留结论与来源。
- **本轮动作：** `evidence_board_update`，通过 `replace`、`append`、`clear` 统一更新，条目 ID 保证追加和修订确定性。
- **学生结果：** 每条证据保留来源、支持/反驳关系、学生备注和修订历史，可直接成为过程性评价证据。
- **工程要求：** 禁止模型伪造来源；没有来源时必须标记“待核验”。

### 3. 可控模拟器面板

- **教学作用：** 当理解依赖变量变化、因果关系、系统状态或空间结构时，让模型设置变量、要求学生预测、运行一步并比较结果。
- **本轮动作：** 复用现有 `widget_highlight`、`widget_setState`、`widget_annotation`、`widget_reveal`，已接入实时原生工具和 iframe 消息桥接。后续再增加统一的 `simulation_capture_observation` 结果契约，而不是为每个学科写一套组件。
- **学生结果：** 记录预测、操作序列、观察和解释；正确性判断留给理解检查或测验，不把随意点击当作掌握。
- **工程要求：** 组件必须声明变量范围、可逆操作、初始状态和重置行为，保证回放确定性。

本轮已完成“理解检查卡 + 证据板 + 现有模拟器动作接入”。下一步优先补服务端课堂工具快照和模拟器观察结果契约；白板继续承担动态推演，三个组件分别负责即时诊断、稳定证据和可操控因果体验。
