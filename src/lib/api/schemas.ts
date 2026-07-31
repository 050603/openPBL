// Zod schemas for openPBL API routes.
//
// These schemas cover the openPBL-specific routes (session actions, auth,
// uploads metadata, courses/sessions). The OpenMAIC routes already have
// their own inline validation and are not duplicated here.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const LoginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export const JoinSchema = z.object({
  inviteCode: z.string().min(4).max(32),
  studentName: z.string().min(1).max(64),
});

// ---------------------------------------------------------------------------
// Session actions
// ---------------------------------------------------------------------------

/**
 * The session actions route accepts an opaque `SessionAction` payload. We
 * only validate the `type` field exists and is a known string; the inner
 * payload is validated inside the reducer (which knows the per-action
 * shape). This keeps the schema resilient to additions of new action types.
 */
export const SessionActionBaseSchema = z.object({
  type: z.string().min(1).max(64),
  payload: z.unknown().optional(),
});

// ---------------------------------------------------------------------------
// Companion chat
// ---------------------------------------------------------------------------

export const CompanionChatSchema = z.object({
  courseId: z.string().min(1),
  studentId: z.string().min(1),
  stageKey: z.string().min(1).max(64),
  message: z.string().min(1).max(4000),
  companionId: z.string().optional(),
  threadId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Learning events
// ---------------------------------------------------------------------------

export const LearningEventSchema = z.object({
  courseId: z.string().min(1),
  studentId: z.string().min(1),
  stageKey: z.string().min(1).max(64),
  sceneId: z.string().optional(),
  type: z.string().min(1).max(64),
  occurredAt: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  expectedDurationSec: z.number().int().nonnegative().optional(),
  ttsDurationSec: z.number().nonnegative().optional(),
  plannedStudentActivitySec: z.number().nonnegative().optional(),
  visible: z.boolean().optional(),
  progressMarker: z.string().max(128).optional(),
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
});

// ---------------------------------------------------------------------------
// Teacher directives
// ---------------------------------------------------------------------------

export const TeacherDirectiveSchema = z.object({
  courseId: z.string().min(1),
  goal: z.string().min(1).max(256),
  stageKey: z.string().max(64).optional(),
  content: z.string().max(8000).optional(),
});

// ---------------------------------------------------------------------------
// Uploads (POST is multipart/form-data; the metadata fields validated here)
// ---------------------------------------------------------------------------

export const UploadMetadataSchema = z.object({
  title: z.string().max(200).optional(),
  courseId: z.string().min(1).optional(),
  groupId: z.string().optional(),
  studentId: z.string().optional(),
  stageKey: z.string().max(64).optional(),
  category: z
    .enum(["artifact", "evidence", "presentation", "resource"])
    .optional(),
});

// ---------------------------------------------------------------------------
// Provider config (admin-only)
// ---------------------------------------------------------------------------

export const ProviderConfigSchema = z
  .object({
    providers: z.array(z.record(z.string(), z.unknown())),
    defaultModel: z.string().optional(),
    tts: z
      .object({
        provider: z.string().optional(),
        defaultVoice: z.string().optional(),
        "browser-native-tts": z.boolean().optional(),
      })
      .optional(),
  })
  .strict();
