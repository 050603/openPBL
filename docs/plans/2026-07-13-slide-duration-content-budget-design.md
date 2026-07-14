# Slide Duration and Content Budget Implementation Plan

> **For Codex:** Keep the confirmed course-module timing as the parent contract; this plan only makes the generated second-level pages and narration fit that contract.

**Goal:** Prevent a long target duration from becoming either one sparse PPT page with an overlong narration or a mechanically over-split deck. Let the outline model choose semantic page boundaries while using the confirmed module duration as the aggregate content/TTS budget.

**Architecture:** Keep the teacher-confirmed six-module timing unchanged. The outline-generation model decides whether an `ai-learning` module needs one or multiple semantic `slide`/interaction/quiz details based on concept dependencies, examples, methods, practice, checks, and cognitive load. Do not split by a fixed seconds-per-page threshold. Each model-produced detail retains its parent activity, knowledge-point IDs, audience, routing, and TTS policy; the aggregate detail targets are normalized to the parent duration before content generation. Teacher-only resources use module time as facilitation time: they remain the original concise PPT/script resource regardless of whether the teacher allocates 25 or 50 minutes, and never receive TTS. Content prompts use the per-detail target as a TTS/content budget while forbidding unrelated or graph-outside knowledge.

**Tech Stack:** TypeScript, Vitest, existing OpenMAIC scene-outline/content/action generation pipeline, existing static TTS timing profiles.

---

### Task 1: Preserve the AI semantic page plan

**Files:**
- Modify: `src/lib/openmaic/generation/outline-generator.ts`
- Modify: `src/lib/openmaic/types/generation.ts`
- Test: `src/lib/openmaic/generation/outline-generator.test.ts`

Remove deterministic 90/120-second page splitting. Keep a small normalizer only for stable ordering, so an AI-produced one-page or multi-page semantic plan is preserved. Teacher resources are never expanded by module duration: preserve their original outline/page count and keep `ttsPolicy: none`.

### Task 2: Apply the split before TTS plans and scene generation

**Files:**
- Modify: `src/lib/openmaic/server/classroom-generation.ts`
- Modify: `src/app/api/openmaic/generate/scene-outlines-stream/route.ts`
- Test: `src/lib/openmaic/server/classroom-generation.test.ts` (or the nearest existing pure pipeline test)

Run semantic-plan normalization after PBL routing/contract enforcement and before `attachTtsTimingPlans`. Confirmed outline target durations must remain unchanged in aggregate for each `parentActivityId`; only the AI-selected details and their target allocation are used.

### Task 3: Make each page prompt aware of its bounded role

**Files:**
- Modify: `src/lib/openmaic/generation/scene-generator.ts`
- Modify: `src/lib/openmaic/prompts/templates/slide-content/user.md`
- Modify: `src/lib/openmaic/prompts/templates/slide-actions/user.md`
- Modify: `src/lib/openmaic/prompts/templates/pbl-course/system.md`

Pass the semantic detail's target narration seconds and content-density guidance. Require each page to cover a coherent subtopic, avoid repeating sibling pages, stay within the confirmed knowledge graph and grade, and use the target as a content/TTS budget rather than a page-break rule. The PBL outline prompt must tell the model to create multiple details only when the content needs separate visual focuses; a five-minute module is not automatically a fixed number of pages.

### Task 4: Verify invariants and regressions

**Files:**
- Modify: `src/lib/openmaic/generation/outline-generator.test.ts`
- Modify: `src/lib/openmaic/audio/tts-timing.test.ts` if the timing-plan contract changes
- Add or modify: PBL generation tests as needed

Test five-minute and ten-minute student examples with both one and multiple AI-planned semantic details, plus 25-minute and 50-minute teacher-resource examples that remain one original PPT resource. Verify plan preservation, target-duration sums for student pages, parent links, knowledge-point links, and `ttsPolicy: none` for teacher resources.

### Task 5: Run verification

Run:

```text
npx tsc --noEmit
npx vitest run
npm run build
```

Also run targeted ESLint on all changed files. Do not use measured audio duration or persistent calibration data in this feature.
