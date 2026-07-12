# Two-Level PBL Outline and Course Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the PBL outline flow around a macro course activity timeline and independently expandable resource-detail outlines, so final course generation consumes the detail outlines, respects teacher-adjustable time budgets, and validates knowledge-point alignment.

**Architecture:** Keep the existing persisted `teachingOutline` and `lessonOutline` field names for compatibility with the current new-classroom data shape, but give them explicit semantics: `teachingOutline` is the first-level macro activity schedule; `lessonOutline` plus `_openmaicSceneOutlines` is the second-level resource-detail schedule. Add explicit parent/activity, detail-kind, knowledge-point, target-duration, and TTS policy metadata to outlines and generated scenes. Centralize PBL time allocation and knowledge validation in pure modules used by prompts, UI, API normalization, and final generation. Preserve the existing server-side student/teacher split and teacher-resource no-TTS rule.

**Tech Stack:** Next.js 16 App Router, React client components, TypeScript, existing OpenMAIC `SceneOutline`/`Scene` contracts, SSE outline generation, Vitest, ESLint, pnpm.

---

## Task 1: Add the two-level data contract and pure policies

**Files:**
- Modify `src/lib/session/types.ts`
- Modify `src/lib/openmaic/types/generation.ts`
- Modify `src/lib/openmaic/types/stage.ts`
- Create `src/lib/pbl-time-model.ts`
- Create `src/lib/pbl-outline-validation.ts`
- Create tests for both new pure modules

**Work:**
- Add explicit second-level metadata: `parentActivityId`, `detailKind`, `knowledgePointIds`, `targetDurationSec`, and `ttsPolicy`.
- Carry the same metadata through persisted lesson sections, scene snapshots, and generated scenes.
- Define standard PBL time ratios and a non-blocking assessment/suggestion API. Include warnings for total mismatch, knowledge time exceeding practice time, and unusually small practice/reflection windows while allowing teacher overrides.
- Define knowledge-point validation that rejects unknown IDs, reports unreferenced configured points, and exposes clear messages for the UI/API.

**Verification:** Unit tests cover ratio allocation, manual overrides, warning severity, unknown knowledge IDs, and complete coverage.

## Task 2: Make generation hierarchical and knowledge/time aware

**Files:**
- Modify `src/lib/openmaic/prompts/templates/pbl-course/system.md`
- Modify `src/lib/openmaic/prompts/templates/pbl-course/user.md`
- Modify `src/lib/openmaic/pbl/course-request.ts`
- Modify `src/lib/openmaic/generation/outline-generator.ts`
- Modify `src/lib/llm/client.ts`
- Modify `src/app/api/openmaic/generate/scene-outlines-stream/route.ts` if normalization is needed
- Extend related outline tests

**Work:**
- Make the prompt/schema explicitly one-to-many: one first-level activity can have zero, one, or many detail outlines; details must identify their parent rather than rely on array position.
- Inject the first-level activity catalog, the standard time model, and the confirmed knowledge-point catalog.
- Require AI-learning details to use PPT/quiz/interactive resources according to the activity, teacher ordinary-classroom details to use PPT and script only, and no teacher-resource TTS.
- Normalize generated detail metadata and drop/flag invalid parent or knowledge-point references before persistence.

**Verification:** Existing OpenMAIC outline tests plus new fixtures prove multiple details can share one parent and that resource/TTS policies survive normalization.

## Task 3: Upgrade the teacher preparation UI to show and edit hierarchy/time

**Files:**
- Modify `src/app/teacher/prepare/[id]/verify/page.tsx`
- Modify `src/components/openmaic/generation/outlines-editor.tsx`
- Add a small reusable time/hierarchy UI component if the page becomes too large
- Modify relevant labels in `src/lib/i18n/locales/zh-CN.json` or local page labels

**Work:**
- Rename visible concepts to “一级课程活动大纲” and “二级资源细化大纲”.
- Add a PBL time allocation panel with total/allocated minutes, recommended allocation, warning messages, and an apply-recommendation action; keep every duration editable.
- Show second-level details grouped by parent activity and allow changing a detail’s parent, target duration, resource type, and knowledge-point links.
- Preserve the explicit parent metadata when syncing `SceneOutline[]` to persisted lesson sections; stop creating a one-to-one outline from each first-level activity.
- Show knowledge-point validation errors and uncovered-point warnings before allowing persistence.

**Verification:** Typecheck and targeted lint; manually inspect the page in a running dev server if available.

## Task 4: Make final course generation consume only second-level details

**Files:**
- Modify `src/app/teacher/prepare/[id]/generate/page.tsx`
- Modify `src/lib/openmaic/server/classroom-generation.ts`
- Modify `src/lib/openmaic/server/classroom-media-generation.ts`
- Modify `src/lib/openmaic/server/classroom-split.ts` or scene routing metadata as required
- Modify final-generation tests

**Work:**
- Prefer validated `_openmaicSceneOutlines`/second-level detail outlines as the sole generation input; retain only a defensive legacy fallback for records being migrated during this new-version-only rollout.
- Enforce parent/activity and knowledge-point metadata server-side before generating scene content.
- Pass target duration into knowledge-scene generation and use target-aware speech metadata/speed handling while keeping ordinary classroom teacher resources PPT/script-only and TTS-free.
- Preserve the existing student/teacher resource isolation and ensure generated scenes retain their hierarchy metadata.

**Verification:** Unit/integration tests for input selection, metadata propagation, student-only TTS, and teacher-resource isolation.

## Task 5: Verify the complete flow and update documentation

**Files:**
- Update relevant plan/design documentation if implementation details differ
- No unrelated legacy-course adaptation

**Work:**
- Run the focused test suites, full tests, TypeScript, build, lint, and `git diff --check`.
- Review changed labels and generated payloads for the new naming and hierarchy.
- Confirm no old “AI 授知大纲”/“课程授课大纲” ambiguity remains in the new PBL preparation and generation flow.

**Verification commands:**
```powershell
pnpm test
pnpm exec tsc --noEmit
pnpm build
pnpm lint
git diff --check
```
