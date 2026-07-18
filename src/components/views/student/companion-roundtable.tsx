"use client";

import { useEffect, useRef } from "react";
import type { Course } from "@/lib/session/types";
import { useCompanionRuntime } from "./companion-runtime";

export { useCompanionTTS } from "./companion-runtime";

/**
 * Compatibility adapter for stage views that still declare the companion
 * surface locally. The classroom shell owns the actual runtime, so this
 * component never creates another chat, history, SSE, or TTS pipeline.
 */
export function CompanionRoundtable({
  course: _course,
  stageKey: _stageKey,
  contextLabel: _contextLabel,
  autoSendMessage,
}: {
  course: Course;
  stageKey: string;
  contextLabel: string;
  autoSendMessage?: string | null;
}) {
  const runtime = useCompanionRuntime();
  const lastAutoSentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!runtime || !autoSendMessage || lastAutoSentRef.current === autoSendMessage) return;
    lastAutoSentRef.current = autoSendMessage;
    void runtime.send(autoSendMessage);
  }, [autoSendMessage, runtime]);

  return null;
}
