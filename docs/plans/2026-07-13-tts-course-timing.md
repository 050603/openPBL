# TTS 课程时间估算实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让课程生成、编辑和播放链路使用同一套基于 TTS 模型与学习活动的时间预算，使讲授/互动/测验的预估误差以实际数据校准后稳定在 ±10% 内。

**Architecture:** 在 `src/lib/openmaic/audio/tts-timing.ts` 建立可扩展的模型参数注册表，在 `src/lib/pbl-time-estimation.ts` 建立纯函数时间预算、活动耗时和校准算法。`pbl-time-model.ts` 继续负责六模块总量分配，并调用新的估算结果。场景大纲携带明确的 TTS 预算，生成器在提示词中要求达到内容量并在生成后进行一次受控校验；真实音频时长和学习事件只在超出阈值或校准置信度不足时写入课程时间模型。

**Tech Stack:** Next.js 16 App Router, TypeScript, React, Vitest, local course store/server-store, OpenMAIC TTS providers.

---

## 关键架构决策

1. **参数按 provider + model + language 解析。** 参数包含 CJK 字符/分钟、拉丁词/分钟、标点停顿、默认速度、来源和校准状态；新模型只需注册 profile，不改估算器。
2. **目标时间不是单纯依靠播放降速。** 生成前计算目标内容量，生成提示词携带 min/max 内容单元；生成后测量 speech action 文本，超出 ±10% 时最多重试一次并记录校验结果。
3. **综合时间由可解释项组成。** `tts`、`interaction`、`quiz`、`teacher`、`transition` 分开估算；总课时固定时，智能分配先满足活动最小时间，再按阶段权重和难度分配剩余时间。
4. **校准只记录有效异常样本。** 只有实际时长与预估偏差超过 10%，或者 profile 的有效样本数不足/置信度不足时才写入新样本。误差回到阈值内且 profile 已达到最小样本数后停止重复记录，避免浪费计算和存储。
5. **服务端为 TTS 生成模型的最终来源。** 客户端可以显示选定模型，但服务端解析实际启用的 provider/model/speed，生成提示词和音频元数据使用同一选择。

## 实施任务

### Task 1: 纯时间估算内核

**Files:**
- Create: `src/lib/openmaic/audio/tts-timing.ts`
- Create: `src/lib/pbl-time-estimation.ts`
- Modify: `src/lib/pbl-time-model.ts`
- Test: `src/lib/openmaic/audio/tts-timing.test.ts`, `src/lib/pbl-time-estimation.test.ts`, `src/lib/pbl-time-model.test.ts`

**Outputs:** 模型速度参数库、混合语言内容量估算、理论/案例/技术说明内容类型系数、互动/测验耗时模型、固定总时长智能分配、±10% 校验和多级校准函数。

### Task 2: 数据与生成契约

**Files:**
- Modify: `src/lib/session/types.ts`
- Modify: `src/lib/openmaic/types/generation.ts`
- Modify: `src/lib/openmaic/types/stage.ts`
- Modify: `src/lib/openmaic/generation/outline-generator.ts`
- Modify: `src/lib/openmaic/server/classroom-generation.ts`
- Modify: `src/lib/openmaic/server/classroom-media-generation.ts`
- Modify: `src/lib/openmaic/generation/scene-generator.ts`
- Modify: `src/lib/openmaic/prompts/templates/slide-content/*`, `quiz-content/*`, `slide-actions/*`, `quiz-actions/*`, `interactive-actions/*`

**Outputs:** 大纲保存 `timingPlan`，明确 TTS 模型、目标秒数、目标内容量、互动/测验预算、误差状态；场景生成提示词携带预算，TTS 生成回写自然音频时长和校验结果。

### Task 3: 校准持久化与实时反馈

**Files:**
- Modify: `src/lib/session/types.ts`
- Modify: `src/lib/openmaic-bridge/course-linker.ts`
- Modify: `src/app/api/learning-events/route.ts`
- Modify: `src/components/openmaic-bridge/student-stage-host.tsx`
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`
- Modify: `src/app/teacher/prepare/[id]/generate/page.tsx`
- Modify: `src/app/teacher/prepare/[id]/preview/page.tsx`

**Outputs:** 教师核查和生成阶段实时显示总预算/活动拆分/模型/误差预警/具体建议；实际异常数据进入课程时间模型，模型切换自动重算相关内容。

### Task 4: 验证

**Commands:**
- `pnpm exec vitest run src/lib/openmaic/audio/tts-timing.test.ts src/lib/pbl-time-estimation.test.ts src/lib/pbl-time-model.test.ts`
- `pnpm test`
- `pnpm exec tsc --noEmit`
- `pnpm exec eslint <changed files>`
- `git diff --check`

**Acceptance:** 中文理论讲解、案例分析、技术说明和英文混合文本均能得到可解释的目标内容量；模型切换会重新计算；固定总课时分配保持总量不变；偏差超过 ±10% 出现预警并可记录样本，达到最小有效样本且偏差回到阈值内后不再重复记录。
