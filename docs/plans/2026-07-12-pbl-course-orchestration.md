# PBL 六阶段课程编排 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将新课堂的个人项目配置、六阶段生成模板、显式场景分流和覆盖检查接入现有 openPBL/ OpenMAIC 链路。

**Architecture:** 在 session 层新增结构化 `Course.pblConfig`；在 OpenMAIC prompt 层新增 `pbl-course` 模板和六阶段规则模块；outline/scene 层保存 `stageKey`、`audience` 与 `generationPurpose`，分流器优先读取元数据；生成前后使用纯函数检查阶段覆盖与关键教师资源。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Tailwind CSS、OpenMAIC prompt loader、Vitest。

---

### Task 1: Add the PBL course configuration and defaults

**Files:**
- Modify: `src/lib/session/types.ts`
- Modify: `src/lib/session/store.tsx`
- Modify: `src/lib/session/actions.ts`
- Create: `src/lib/pbl-course-config.ts`
- Test: `src/lib/pbl-course-config.test.ts`

**Steps:**

1. Write tests for the default personal-project mode, the six evidence defaults, the three-part outcome shape, the required recorder companion, and migration of an older course with no `pblConfig`.
2. Run `pnpm vitest run src/lib/pbl-course-config.test.ts` and confirm the new module/types are missing.
3. Add `PblCourseConfig`, evidence, outcome, and companion types; add `DEFAULT_PBL_COURSE_CONFIG`, `normalizePblCourseConfig`, and immutable cloning helpers.
4. Initialize new courses with a normalized PBL config and normalize old courses without dropping existing groups, submissions, or content.
5. Run the focused test and `pnpm exec tsc --noEmit`.

### Task 2: Add six-stage definitions and coverage validation

**Files:**
- Create: `src/lib/openmaic/pbl/course-template.ts`
- Test: `src/lib/openmaic/pbl/course-template.test.ts`
- Modify: `src/lib/openmaic/types/generation.ts`
- Modify: `src/lib/openmaic/types/stage.ts`

**Steps:**

1. Write failing tests for coverage of all six stage keys, missing stage detection, missing launch/showcase teacher resources, invalid student routing outside AI learning, and explicit metadata on built scenes.
2. Run the focused tests and confirm the helpers/metadata are absent.
3. Add the six-stage definitions, coverage result type, `checkPblStageCoverage`, and scene metadata fields (`stageKey`, `stageLabel`, `audience`, `generationPurpose`, companion fields).
4. Update scene construction to persist outline metadata in generated scenes.
5. Run the focused tests and type-check.

### Task 3: Add the PBL-specific prompt template

**Files:**
- Modify: `src/lib/openmaic/prompts/types.ts`
- Modify: `src/lib/openmaic/prompts/index.ts`
- Create: `src/lib/openmaic/prompts/templates/pbl-course/system.md`
- Create: `src/lib/openmaic/prompts/templates/pbl-course/user.md`
- Test: `src/lib/openmaic/prompts/pbl-course.test.ts`

**Steps:**

1. Write tests that load the new template and assert it includes six-stage ownership, personal-project mode, companion injection, tri-party evaluation, evidence requirements, explicit stage/audience output fields, and no real student-group creation.
2. Run the focused prompt test and confirm the new prompt ID/template is unavailable.
3. Add the dedicated system/user template and register `pbl-course` in the prompt ID union and constants.
4. Keep the template output schema compatible with current outline normalization while requiring new metadata when the PBL profile is present.
5. Run the prompt test and type-check.

### Task 4: Route structured PBL profiles through outline generation

**Files:**
- Modify: `src/lib/openmaic/types/generation.ts`
- Modify: `src/lib/openmaic/generation/outline-generator.ts`
- Modify: `src/app/api/openmaic/generate/scene-outlines-stream/route.ts`
- Modify: `src/lib/openmaic/server/classroom-generation.ts`
- Modify: `src/app/api/openmaic/generate/route.ts`
- Test: `src/lib/openmaic/generation/outline-generator.test.ts`

**Steps:**

1. Write tests proving a `pblProfile` selects `PROMPT_IDS.PBL_COURSE`, interpolates structured configuration, and leaves generic requirements on the existing prompt path.
2. Run the focused test and confirm the profile is ignored/missing.
3. Add `pblProfile` to `UserRequirements` and the classroom generation request; select the new prompt in both streaming and non-streaming outline generation.
4. Normalize explicit stage/audience metadata without overwriting it; keep legacy flat-array parsing.
5. Run focused tests and type-check.

### Task 5: Make scene content/actions companion- and stage-aware

**Files:**
- Modify: `src/lib/openmaic/generation/scene-generator.ts`
- Modify: `src/lib/openmaic/generation/scene-builder.ts`
- Modify: `src/lib/openmaic/prompts/templates/slide-content/user.md`
- Modify: `src/lib/openmaic/prompts/templates/quiz-content/user.md`
- Modify: `src/lib/openmaic/prompts/templates/slide-actions/user.md`
- Modify: `src/lib/openmaic/prompts/templates/quiz-actions/user.md`
- Modify: `src/lib/openmaic/prompts/templates/interactive-actions/user.md`
- Modify: `src/lib/openmaic/prompts/templates/pbl-actions/user.md`
- Test: `src/lib/openmaic/generation/scene-generator.test.ts`

**Steps:**

1. Write tests for generated slide/action prompt context containing the current PBL stage, allowed audience, selected companion roles, and evidence reminders.
2. Run the focused test and confirm the context is not injected.
3. Add a shared PBL scene-context formatter and pass it to slide, quiz, interactive, PBL, and action prompt variables.
4. Ensure content generation receives `userRequirements.pblProfile` and does not turn teacher-facilitation scenes into student AI lessons.
5. Run focused tests and type-check.

### Task 6: Replace title/index-based classification with explicit routing

**Files:**
- Modify: `src/lib/openmaic-bridge/scene-classifier.ts`
- Modify: `src/lib/openmaic-bridge/teacher-resources.ts`
- Modify: `src/lib/session/types.ts`
- Modify: `src/components/openmaic-bridge/teacher-resource-viewer.tsx`
- Test: `src/lib/openmaic-bridge/scene-classifier.test.ts`

**Steps:**

1. Write tests for teacher/student classification from explicit audience metadata, stage extraction from `stageKey`, legacy title fallback, and facilitation resource labeling.
2. Run the focused classifier test and confirm explicit metadata is not honored.
3. Prefer metadata in `classifyScenes`, carry generation purpose/companion information into `TeacherResourceScene`, and retain legacy fallback behavior.
4. Display stage labels and resource purpose in the teacher resource viewer so the generated classroom script remains understandable.
5. Run focused tests and type-check.

### Task 7: Expand the project creation form with PBL configuration

**Files:**
- Modify: `src/app/teacher/prepare/new/page.tsx`
- Modify: `src/lib/session/types.ts`
- Test: `src/app/teacher/prepare/new/page.test.tsx`

**Steps:**

1. Write UI tests for the fixed personal-project declaration, selecting evidence, retaining the recorder companion, entering artifact/presentation/reflection outputs, and submitting structured config to `createCourse`.
2. Run the focused UI test and confirm the controls/config are missing.
3. Add a deliberate PBL configuration panel with compact cards, accessible checkboxes, and three outcome fields; avoid real-group language.
4. Validate name, driving question, all required outcome parts, and recorder selection; pass normalized config to `createCourse`.
5. Run the focused UI test and type-check.

### Task 8: Remove page-side generation rule concatenation and add coverage UI

**Files:**
- Modify: `src/app/teacher/prepare/[id]/verify/page.tsx`
- Modify: `src/app/teacher/prepare/[id]/generate/page.tsx`
- Modify: `src/lib/session/types.ts`
- Test: `src/app/teacher/prepare/[id]/verify/page.test.tsx`

**Steps:**

1. Write tests for passing structured PBL profile data to outline/classroom generation and showing missing stage/resource coverage.
2. Run the focused test and confirm the page still has only manual-rule request text.
3. Replace the long rule strings with concise course facts plus `pblProfile`, preserve confirmed scene outlines, and add a coverage summary with actionable warnings.
4. Use explicit `stageKey` when syncing scene outlines to lesson sections; block final publish when required coverage is missing while allowing non-critical teacher-resource gaps to remain warnings.
5. Run focused tests and type-check.

### Task 9: Verify the end-to-end change

**Files:**
- Test: all changed `*.test.ts`/`*.test.tsx`

**Steps:**

1. Run `pnpm vitest run src/lib/pbl-course-config.test.ts src/lib/openmaic/pbl/course-template.test.ts src/lib/openmaic/prompts/pbl-course.test.ts src/lib/openmaic-bridge/scene-classifier.test.ts`.
2. Run `pnpm test`.
3. Run `pnpm exec tsc --noEmit` and `pnpm lint`.
4. Run `pnpm build` and resolve any Next 16 App Router issues.
5. Start the dev server and inspect the teacher create, verify, generate, and resource pages at desktop and narrow widths.

