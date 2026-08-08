"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Course, LearningEvidence } from "@/lib/session/types";
import type {
  LearningEvidenceKind,
  LearningEvidencePayloadByKind,
} from "@/lib/learning-evidence/types";
import { LEARNING_EVIDENCE_SCHEMA_VERSION } from "@/lib/learning-evidence/types";
import { isLearningEvidenceStructurallyComplete } from "@/lib/learning-evidence/readiness";
import { useSession } from "@/lib/session/store";

function recordId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 160);
}

function collectStrings(value: unknown, output: string[]): void {
  if (typeof value === "string" && value.trim()) {
    output.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectStrings(item, output));
  }
}

function summarizePayload(payload: unknown): string {
  const parts: string[] = [];
  collectStrings(payload, parts);
  return parts.join("；").slice(0, 500);
}

export function evidenceRecordId(input: {
  courseId: string;
  studentId: string;
  kind: LearningEvidenceKind;
  suffix?: string;
}): string {
  return recordId(
    ["evidence", input.courseId, input.studentId, input.kind, input.suffix]
      .filter(Boolean)
      .join("-"),
  );
}

export type EvidenceDraftState<Kind extends LearningEvidenceKind> = {
  evidenceId: string;
  payload: LearningEvidencePayloadByKind[Kind];
  setPayload: (
    next:
      | LearningEvidencePayloadByKind[Kind]
      | ((current: LearningEvidencePayloadByKind[Kind]) => LearningEvidencePayloadByKind[Kind]),
  ) => void;
  status: LearningEvidence["status"];
  saveState: "idle" | "saving" | "saved";
  error: string | null;
  submit: (options?: { confirm?: boolean }) => boolean;
};

export function useEvidenceDraft<Kind extends LearningEvidenceKind>(input: {
  course: Course;
  studentId: string;
  stageKey: string;
  kind: Kind;
  title: string;
  initialPayload: LearningEvidencePayloadByKind[Kind];
  suffix?: string;
  evidenceRefs?: (payload: LearningEvidencePayloadByKind[Kind]) => string[];
  artifactSnapshotIds?: (payload: LearningEvidencePayloadByKind[Kind]) => string[];
}): EvidenceDraftState<Kind> {
  const session = useSession();
  const evidenceId = useMemo(
    () => evidenceRecordId({
      courseId: input.course.id,
      studentId: input.studentId,
      kind: input.kind,
      suffix: input.suffix,
    }),
    [input.course.id, input.kind, input.studentId, input.suffix],
  );
  const existing = input.course.learningEvidence?.find((item) => item.id === evidenceId) as
    | LearningEvidence<Kind>
    | undefined;
  const [payload, setPayloadState] = useState<LearningEvidencePayloadByKind[Kind]>(
    () => existing?.payload ?? input.initialPayload,
  );
  const [status, setStatus] = useState<LearningEvidence["status"]>(
    existing?.status ?? "draft",
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    existing ? "saved" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const createdAtRef = useRef(existing?.createdAt ?? new Date().toISOString());

  useEffect(() => {
    if (!existing || dirtyRef.current) return;
    setPayloadState(existing.payload);
    setStatus(existing.status);
    setSaveState("saved");
    createdAtRef.current = existing.createdAt;
  }, [existing?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildEvidence = useCallback((
    nextStatus: LearningEvidence["status"],
  ): LearningEvidence<Kind> => {
    const timestamp = new Date().toISOString();
    const evidenceRefs = input.evidenceRefs?.(payload) ?? [];
    const artifactSnapshotIds = input.artifactSnapshotIds?.(payload) ?? [];
    return {
      id: evidenceId,
      schemaVersion: LEARNING_EVIDENCE_SCHEMA_VERSION,
      courseId: input.course.id,
      studentId: input.studentId,
      stageKey: input.stageKey,
      kind: input.kind,
      title: input.title,
      summary: summarizePayload(payload),
      payload,
      status: nextStatus,
      source: "student",
      countsTowardReadiness: true,
      evidenceRefs,
      artifactSnapshotIds,
      createdAt: createdAtRef.current,
      updatedAt: timestamp,
      submittedAt:
        nextStatus === "submitted" || nextStatus === "teacher-confirmed"
          ? timestamp
          : undefined,
      confirmedAt: nextStatus === "teacher-confirmed" ? timestamp : undefined,
    };
  }, [
    evidenceId,
    input,
    payload,
  ]);

  const persist = useCallback((nextStatus: LearningEvidence["status"]) => {
    const record = buildEvidence(nextStatus);
    session.upsertLearningEvidence(record);
    setStatus(nextStatus);
    setSaveState("saved");
    dirtyRef.current = false;
    return record;
  }, [buildEvidence, session]);

  useEffect(() => {
    if (!dirtyRef.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => persist("draft"), 700);
    return () => window.clearTimeout(timer);
  }, [payload, persist]);

  const setPayload = useCallback<EvidenceDraftState<Kind>["setPayload"]>((next) => {
    dirtyRef.current = true;
    setStatus("draft");
    setError(null);
    setPayloadState((current) =>
      typeof next === "function"
        ? (next as (current: LearningEvidencePayloadByKind[Kind]) => LearningEvidencePayloadByKind[Kind])(current)
        : next,
    );
  }, []);

  const submit = useCallback((options?: { confirm?: boolean }) => {
    const record = buildEvidence("submitted");
    if (!isLearningEvidenceStructurallyComplete(record, input.course.artifactSnapshots ?? [])) {
      setError("请先补全本项所需的信息和可检查证据。");
      return false;
    }
    if (
      options?.confirm
      && typeof window !== "undefined"
      && !window.confirm("确认提交这项阶段证据？提交后教师将按此版本校准。")
    ) return false;
    persist("submitted");
    setError(null);
    return true;
  }, [buildEvidence, input.course.artifactSnapshots, persist]);

  return {
    evidenceId,
    payload,
    setPayload,
    status,
    saveState,
    error,
    submit,
  };
}

