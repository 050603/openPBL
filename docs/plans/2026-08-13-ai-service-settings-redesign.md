# AI 服务设置界面优化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 重构教师端 AI 服务设置界面，统一各服务页布局，并确保配置状态与长模型名称在不同宽度下稳定显示。

**Architecture:** 保留现有配置读取、保存、删除和测试流程，只重组页面信息层级与共享展示组件。通过纯函数统一供应商状态文案，通过响应式双栏工作区、不可收缩状态标签和单行省略模型名称解决异常换行。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4、Vitest。

---

### Task 1: 统一供应商状态计算

**Files:**
- Create: `src/lib/teacher/ai-service-settings.ts`
- Test: `src/lib/teacher/ai-service-settings.test.ts`

**Step 1:** 为未配置、无需密钥、已配置和默认服务商编写状态计算测试。

**Step 2:** 运行定向测试，确认缺少实现时失败。

**Step 3:** 实现状态计算函数，返回状态标签、色调和默认模型名称。

**Step 4:** 运行定向测试并确认通过。

### Task 2: 重构页面信息架构

**Files:**
- Modify: `src/app/teacher/settings/page.tsx`

**Step 1:** 将页面标题和服务类型导航合并为紧凑设置导航。

**Step 2:** 将搜索框移入服务商列表，并为列表增加数量与滚动边界。

**Step 3:** 将所有服务页统一为响应式双栏工作区和一致的供应商配置页头。

**Step 4:** 移除重复的帮助性说明和列表内删除入口。

### Task 3: 修复长状态与模型名称排版

**Files:**
- Modify: `src/app/teacher/settings/page.tsx`

**Step 1:** 将状态标签设为不可收缩、不可换行。

**Step 2:** 将模型名称设为可收缩的单行省略文本，并保留完整 title。

**Step 3:** 对模型选择按钮、标题和服务标识应用相同的溢出约束。

### Task 4: 精简音色与表单页面

**Files:**
- Modify: `src/app/teacher/settings/page.tsx`

**Step 1:** 将智能体音色卡片改为统一列表行。

**Step 2:** 删除底部推荐说明，保留直接可执行的批量操作。

**Step 3:** 将多模态配置侧栏操作改为统一底部操作区。

### Task 5: 验证

**Files:**
- Verify: `src/app/teacher/settings/page.tsx`
- Verify: `src/lib/teacher/ai-service-settings.ts`

**Step 1:** 运行定向单元测试。

**Step 2:** 运行 ESLint 与 TypeScript 检查。

**Step 3:** 在桌面和窄屏视口检查 AI 模型、TTS 与智能体音色页面，确认无异常换行、溢出和无效控件嵌套。
