"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSettingsStore } from "@openmaic/lib/store/settings";
import type { AdaptiveMicroLesson, CompanionTriggerKind, Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { getCompanion, recommendedCompanions, type AiCompanionId } from "@/lib/ai-companions";
import { STUDENT_ARTIFACT_EVENT, type StudentArtifactEvent } from "@/lib/companion/events";
import { deriveStudentLearningProfile, studentProfilePrompt } from "@/lib/companion/student-profile";
import { shouldAllowProactiveIntervention, shouldProactivelyReviewArtifact } from "@/lib/companion/orchestrator";
import { getCompanionStagePolicy, stageArtifactFollowUp } from "@/lib/companion/stage-policy";
import { sanitizeCompanionResponse } from "@/lib/companion/response";
import { isCompanionStageEnabled } from "@/lib/companion/stage-access";
import type { CompanionWorkspacePatch } from "@/lib/companion/workspace-operation";
import { generateAdaptiveClassroom } from "@/lib/adaptive-learning-client";

export type CompanionChatMessage = {
  role: "user" | "assistant";
  content: string;
  ts: string;
  companionId?: AiCompanionId;
};

export type CompanionRuntimePhase = "idle" | "director" | "speaking" | "done";

export type CompanionSendOptions = {
  preferredCompanionId?: AiCompanionId;
  taskId?: string;
  trigger?: {
    kind: CompanionTriggerKind;
    reason: string;
    preferredCompanionId?: AiCompanionId;
  };
};

export type CompletedCompanionRound = {
  id: string;
  text: string;
  speakerIds: AiCompanionId[];
  lastCompanionId?: AiCompanionId;
  taskId?: string;
  workspacePatches: Array<CompanionWorkspacePatch & { companionId: AiCompanionId; taskId?: string }>;
  createdAt: string;
};

type SSEEvent =
  | { type: "director_start" }
  | { type: "director_result"; speakers: AiCompanionId[] }
  | { type: "agent_start"; companionId: AiCompanionId }
  | { type: "text_delta"; companionId: AiCompanionId; delta: string }
  | { type: "workspace_patch"; companionId: AiCompanionId; taskId?: string; patch: CompanionWorkspacePatch }
  | { type: "agent_end"; companionId: AiCompanionId }
  | { type: "cue_user" }
  | { type: "done" }
  | { type: "error"; message: string };

type TTSQueueItem = {
  text: string;
  companionId: AiCompanionId;
  seq: number;
  providerId: string;
  speed: number;
  preparedAudio?: Promise<string | null>;
};

type CompanionTTSOptions = {
  onItemStart?: (item: { text: string; companionId: AiCompanionId }) => void;
  onItemEnd?: (item: { text: string; companionId: AiCompanionId }) => void;
  onQueueDrained?: () => void;
};

const SPEECH_BUBBLE_HOLD_MS = 2_200;


/**
 * One serial TTS queue for the classroom runtime. Audio for later speakers is
 * prefetched, but only one HTMLAudioElement or SpeechSynthesis utterance can
 * be active at a time.
 */
export function useCompanionTTS(options?: CompanionTTSOptions) {
  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const ttsSpeed = useSettingsStore((s) => s.ttsSpeed);
  const ttsProvidersConfig = useSettingsStore((s) => s.ttsProvidersConfig);
  const agentVoiceOverrides = useSettingsStore((s) => s.agentVoiceOverrides);

  const [enabled, setEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [currentTTS, setCurrentTTS] = useState<TTSQueueItem | null>(null);
  const [preparingCompanionId, setPreparingCompanionId] = useState<AiCompanionId | null>(null);
  const [queueLength, setQueueLength] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const enabledRef = useRef(enabled);
  const queueRef = useRef<TTSQueueItem[]>([]);
  const isPlayingRef = useRef(false);
  const sequenceRef = useRef(0);
  const activeSequenceRef = useRef<number | null>(null);
  const playNextRef = useRef<() => void>(() => undefined);
  const onQueueDrainedRef = useRef(options?.onQueueDrained);
  const onItemStartRef = useRef(options?.onItemStart);
  const onItemEndRef = useRef(options?.onItemEnd);
  const holdTimerRef = useRef<number | null>(null);
  const silentTimerRef = useRef<number | null>(null);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { onQueueDrainedRef.current = options?.onQueueDrained; }, [options?.onQueueDrained]);
  useEffect(() => { onItemStartRef.current = options?.onItemStart; }, [options?.onItemStart]);
  useEffect(() => { onItemEndRef.current = options?.onItemEnd; }, [options?.onItemEnd]);

  const syncQueueLength = useCallback(() => setQueueLength(queueRef.current.length), []);

  const speakBrowserOne = useCallback((item: TTSQueueItem, speed: number, onStart: () => void, onDone: () => void) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      onStart();
      onDone();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.lang = "zh-CN";
    utterance.rate = speed || 1;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      onDone();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    utterance.onstart = onStart;
    window.speechSynthesis.speak(utterance);
    window.setTimeout(onStart, 80);
  }, []);

  const prepareServerAudio = useCallback(async (
    item: Pick<TTSQueueItem, "text" | "companionId" | "seq">,
    providerId: string,
    speed: number,
  ): Promise<string | null> => {
    try {
      const providerConfig = ttsProvidersConfig?.[providerId as keyof typeof ttsProvidersConfig];
      const override = agentVoiceOverrides?.[item.companionId];
      const effectiveProviderId = override?.providerId || providerId;
      const effectiveVoice = override?.voiceId || ttsVoice || "default";
      const effectiveProviderConfig = override?.providerId && override.providerId !== providerId
        ? ttsProvidersConfig?.[override.providerId as keyof typeof ttsProvidersConfig]
        : providerConfig;
      const response = await fetch("/api/openmaic/generate/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: item.text,
          audioId: `companion-${item.companionId}-${item.seq}`,
          ttsProviderId: effectiveProviderId,
          ttsModelId: override?.modelId || effectiveProviderConfig?.modelId,
          ttsVoice: effectiveVoice,
          ttsSpeed: speed,
          ttsApiKey: effectiveProviderConfig?.apiKey,
          ttsBaseUrl: effectiveProviderConfig?.baseUrl || effectiveProviderConfig?.customDefaultBaseUrl,
        }),
      });
      if (!response.ok) throw new Error(`TTS API error: ${response.status}`);
      const data = await response.json();
      if (!data.success || !data.base64) throw new Error("No audio in response");
      return `data:audio/${data.format || "mp3"};base64,${data.base64}`;
    } catch {
      return null;
    }
  }, [agentVoiceOverrides, ttsProvidersConfig, ttsVoice]);

  const playPreparedServerOne = useCallback(async (item: TTSQueueItem, audioUrl: string, onStart: () => void, onDone: () => void) => {
    try {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        audioRef.current = null;
        onDone();
      };
      audio.onended = finish;
      audio.onerror = finish;
      audio.onplaying = onStart;
      await audio.play();
      onStart();
    } catch {
      speakBrowserOne(item, item.speed, onStart, onDone);
    }
  }, [speakBrowserOne]);

  const playNext = useCallback(() => {
    if (isPlayingRef.current) return;
    const next = queueRef.current.shift();
    syncQueueLength();
    if (!next) {
      isPlayingRef.current = false;
      setSpeaking(false);
      setCurrentTTS(null);
      setPreparingCompanionId(null);
      onQueueDrainedRef.current?.();
      return;
    }
    isPlayingRef.current = true;
    activeSequenceRef.current = next.seq;
    setPreparingCompanionId(next.companionId);
    let started = false;
    const onStart = () => {
      if (started || activeSequenceRef.current !== next.seq) return;
      started = true;
      setPreparingCompanionId(null);
      setCurrentTTS(next);
      setSpeaking(true);
      onItemStartRef.current?.(next);
    };
    const onDone = () => {
      if (activeSequenceRef.current !== next.seq) return;
      onStart();
      setSpeaking(false);
      onItemEndRef.current?.(next);
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        if (activeSequenceRef.current !== next.seq) return;
        activeSequenceRef.current = null;
        isPlayingRef.current = false;
        setCurrentTTS(null);
        playNextRef.current();
      }, SPEECH_BUBBLE_HOLD_MS);
    };
    if (next.providerId === "silent") {
      onStart();
      const readingMs = Math.min(10_000, Math.max(2_400, next.text.length * 115 / Math.max(.6, next.speed)));
      silentTimerRef.current = window.setTimeout(onDone, readingMs);
    } else if (next.providerId === "browser-native-tts") {
      speakBrowserOne(next, next.speed, onStart, onDone);
    } else {
      void (next.preparedAudio ?? prepareServerAudio(next, next.providerId, next.speed)).then((audioUrl) => {
        if (activeSequenceRef.current !== next.seq) return;
        if (audioUrl) void playPreparedServerOne(next, audioUrl, onStart, onDone);
        else speakBrowserOne(next, next.speed, onStart, onDone);
      });
    }
  }, [playPreparedServerOne, prepareServerAudio, speakBrowserOne, syncQueueLength]);

  useEffect(() => { playNextRef.current = playNext; }, [playNext]);

  const prepare = useCallback((text: string, companionId: AiCompanionId): TTSQueueItem | null => {
    const clean = text.replace(/<[^>]+>/g, "").trim();
    if (!clean) return null;
    sequenceRef.current += 1;
    const providerId = enabledRef.current ? (ttsProviderId || "browser-native-tts") : "silent";
    const speed = ttsSpeed || 1;
    const item: TTSQueueItem = { text: clean, companionId, seq: sequenceRef.current, providerId, speed };
    if (providerId !== "browser-native-tts" && providerId !== "silent") {
      item.preparedAudio = prepareServerAudio(item, providerId, speed);
    }
    return item;
  }, [prepareServerAudio, ttsProviderId, ttsSpeed]);

  const enqueuePrepared = useCallback((item: TTSQueueItem | null) => {
    if (!item) return false;
    queueRef.current.push(item);
    syncQueueLength();
    if (!isPlayingRef.current) playNext();
    return true;
  }, [playNext, syncQueueLength]);

  const enqueue = useCallback((text: string, companionId: AiCompanionId) => enqueuePrepared(prepare(text, companionId)), [enqueuePrepared, prepare]);
  const stop = useCallback(() => {
    queueRef.current = [];
    activeSequenceRef.current = null;
    isPlayingRef.current = false;
    syncQueueLength();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    if (silentTimerRef.current !== null) window.clearTimeout(silentTimerRef.current);
    holdTimerRef.current = null;
    silentTimerRef.current = null;
    setSpeaking(false);
    setCurrentTTS(null);
    setPreparingCompanionId(null);
  }, [syncQueueLength]);
  const toggle = useCallback(() => {
    setEnabled((previous) => {
      if (previous) stop();
      return !previous;
    });
  }, [stop]);
  useEffect(() => () => stop(), [stop]);

  const busy = speaking || Boolean(currentTTS) || Boolean(preparingCompanionId) || queueLength > 0;
  return { enabled, speaking, busy, enqueue, prepare, enqueuePrepared, stop, toggle, currentTTS, preparingCompanionId, queueLength };
}

type CompanionRuntimeContextValue = {
  stageKey: string;
  contextLabel: string;
  stageEnabled: boolean;
  available: ReturnType<typeof recommendedCompanions>;
  messages: CompanionChatMessage[];
  input: string;
  setInput: (value: string) => void;
  phase: CompanionRuntimePhase;
  currentSpeaker: AiCompanionId | null;
  generatingCompanionId: AiCompanionId | null;
  streamingText: string;
  error: string | null;
  unreadCount: number;
  selectedCompanionId: AiCompanionId | null;
  setSelectedCompanionId: (id: AiCompanionId | null) => void;
  isActive: boolean;
  send: (text?: string, options?: CompanionSendOptions) => Promise<boolean>;
  stop: () => void;
  markRead: () => void;
  tts: ReturnType<typeof useCompanionTTS>;
  lastCompletedRound: CompletedCompanionRound | null;
  microLessonTask: {
    lesson: AdaptiveMicroLesson;
    progress: number;
    message: string;
  } | null;
  dismissMicroLessonTask: () => void;
};

const CompanionRuntimeContext = createContext<CompanionRuntimeContextValue | null>(null);

export function useCompanionRuntime(): CompanionRuntimeContextValue | null {
  return useContext(CompanionRuntimeContext);
}

function appendMessage(current: CompanionChatMessage[], message: CompanionChatMessage): CompanionChatMessage[] {
  return [...current, message].slice(-80);
}

export function CompanionRuntimeProvider({
  course,
  stageKey,
  contextLabel,
  children,
}: {
  course: Course;
  stageKey: string;
  contextLabel: string;
  children: ReactNode;
}) {
  const session = useSession();
  const stageEnabled = isCompanionStageEnabled(course, stageKey);
  const available = useMemo(() => {
    const configuredIds = course.pblConfig?.companionIds;
    const candidates = configuredIds?.length
      ? configuredIds.map((id) => getCompanion(id as AiCompanionId))
      : recommendedCompanions(stageKey);
    return candidates.filter((companion) => companion.stages.includes(stageKey));
  }, [course.pblConfig?.companionIds, stageKey]);

  const [messages, setMessages] = useState<CompanionChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [microLessonTask, setMicroLessonTask] = useState<{
    lesson: AdaptiveMicroLesson;
    progress: number;
    message: string;
  } | null>(null);
  const [phase, setPhase] = useState<CompanionRuntimePhase>("idle");
  const [currentSpeaker, setCurrentSpeaker] = useState<AiCompanionId | null>(null);
  const [generatingCompanionId, setGeneratingCompanionId] = useState<AiCompanionId | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedCompanionId, setSelectedCompanionId] = useState<AiCompanionId | null>(null);
  const [lastCompletedRound, setLastCompletedRound] = useState<CompletedCompanionRound | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const microLessonAbortRef = useRef<AbortController | null>(null);
  const courseRef = useRef(course);
  const messagesRef = useRef(messages);
  const phaseRef = useRef<CompanionRuntimePhase>(phase);
  const currentSpeakerRef = useRef<AiCompanionId | null>(currentSpeaker);
  const streamingTextRef = useRef("");
  const streamingSpeakerRef = useRef<AiCompanionId | null>(null);
  const speakerIdsRef = useRef<AiCompanionId[]>([]);
  const runRoundRef = useRef<(text?: string, options?: CompanionSendOptions) => Promise<boolean>>(async () => false);
  const openingRequestedRef = useRef(false);
  const studentHasSpokenRef = useRef(false);
  const directiveTriggeredRef = useRef<Set<string>>(new Set());
  const idleTriggeredRef = useRef(false);
  const lastActivityAtRef = useRef(0);
  const noProgressTriggeredRef = useRef(false);
  const lastProactiveAtRef = useRef<number | undefined>(undefined);

  useEffect(() => { courseRef.current = course; }, [course]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { currentSpeakerRef.current = currentSpeaker; }, [currentSpeaker]);
  useEffect(() => { lastActivityAtRef.current = Date.now(); }, []);
  useEffect(() => () => microLessonAbortRef.current?.abort(), []);

  const handleTTSStart = useCallback((item: { text: string; companionId: AiCompanionId }) => {
    setCurrentSpeaker(item.companionId);
    setStreamingText(item.text);
    setPhase("speaking");
    phaseRef.current = "speaking";
  }, []);
  const handleTTSEnd = useCallback(() => {
    setPhase("done");
    phaseRef.current = "done";
  }, []);
  const handleTTSDrained = useCallback(() => {
    setCurrentSpeaker(null);
    setStreamingText("");
    setPhase("idle");
    phaseRef.current = "idle";
  }, []);
  const tts = useCompanionTTS({ onItemStart: handleTTSStart, onItemEnd: handleTTSEnd, onQueueDrained: handleTTSDrained });
  const { busy: ttsBusy, enqueue: enqueueTTS, queueLength: ttsQueueLength, speaking: ttsSpeaking, stop: stopTTS } = tts;

  useEffect(() => {
    if (ttsBusy || abortRef.current || phaseRef.current === "idle" || phaseRef.current === "director") return;
    setCurrentSpeaker(null);
    setStreamingText("");
    setPhase("idle");
    phaseRef.current = "idle";
  }, [ttsBusy]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const partialText = sanitizeCompanionResponse(streamingTextRef.current);
    if (partialText) {
      const companionId = streamingSpeakerRef.current ?? currentSpeakerRef.current ?? "knowledge";
      setMessages((current) => appendMessage(current, { role: "assistant", companionId, content: partialText, ts: new Date().toISOString() }));
    }
    streamingTextRef.current = "";
    streamingSpeakerRef.current = null;
    setStreamingText("");
    setCurrentSpeaker(null);
    setGeneratingCompanionId(null);
    phaseRef.current = "idle";
    setPhase("idle");
    stopTTS();
  }, [stopTTS]);

  useEffect(() => {
    if (!stageEnabled) stop();
  }, [stageEnabled, stop]);

  const tryLaunchMicroLesson = useCallback(async (
    message: string,
    signal: AbortSignal,
  ): Promise<boolean> => {
    if (
      !session.studentId ||
      (stageKey !== "proposal" && stageKey !== "make")
    ) return false;
    const decisionResponse = await fetch("/api/adaptive-learning/micro-lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-OpenPBL-Role": "student" },
      body: JSON.stringify({
        courseId: courseRef.current.id,
        studentId: session.studentId,
        stageKey,
        message,
      }),
      signal,
    });
    if (!decisionResponse.ok) return false;
    const payload = await decisionResponse.json() as {
      decision?: {
        decision: "brief-answer" | "systematic-lesson";
        topic: string;
        rationale: string;
        keyPoints: string[];
      };
    };
    const decision = payload.decision;
    if (!decision || decision.decision !== "systematic-lesson" || !decision.topic) {
      return false;
    }

    const lesson: AdaptiveMicroLesson = {
      id: `micro-lesson-${Date.now().toString(36)}`,
      stageKey,
      topic: decision.topic,
      decision: "systematic-lesson",
      rationale: decision.rationale,
      status: "generating",
      createdAt: new Date().toISOString(),
    };
    setMicroLessonTask({
      lesson,
      progress: 5,
      message: "知知正在梳理课程结构",
    });
    const backgroundController = new AbortController();
    microLessonAbortRef.current?.abort();
    microLessonAbortRef.current = backgroundController;
    const persistLesson = async (next: AdaptiveMicroLesson) => {
      await fetch("/api/adaptive-learning/state", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-OpenPBL-Role": "student" },
        body: JSON.stringify({
          action: "upsert-micro-lesson",
          courseId: courseRef.current.id,
          studentId: session.studentId,
          lesson: next,
        }),
        signal: backgroundController.signal,
      });
    };

    const keyPoints = decision.keyPoints.length ? decision.keyPoints : [decision.topic];
    const sceneCount = keyPoints.length >= 3 ? 2 : 1;
    const perScene = Math.round(150 / sceneCount);
    const sceneInputs = Array.from({ length: sceneCount }, (_, index) => {
      const slice = keyPoints.filter((_, pointIndex) => pointIndex % sceneCount === index);
      return {
        title: sceneCount === 1
          ? decision.topic
          : `${decision.topic} · ${index === 0 ? "核心理解" : "项目应用"}`,
        description: index === 0
          ? `系统解释${decision.topic}的核心概念、原理和易错点。`
          : `把${decision.topic}应用到当前${stageKey === "proposal" ? "方案构思" : "项目制作"}任务。`,
        keyPoints: slice.length ? slice : keyPoints,
        type: "slide" as const,
        targetDurationSec: perScene,
      };
    });
    const acknowledgement = `收到。我会把“${decision.topic}”制作成一节 2–3 分钟微课，你可以继续当前任务，做好后我会提醒你。`;
    setMessages((current) => appendMessage(current, {
      role: "assistant",
      companionId: "knowledge",
      content: acknowledgement,
      ts: new Date().toISOString(),
    }));
    enqueueTTS(acknowledgement, "knowledge");

    void (async () => {
      try {
        await persistLesson(lesson);
        const generated = await generateAdaptiveClassroom({
          title: `${courseRef.current.name} · ${decision.topic}微课`,
          requirement: [
            `学生在${stageKey === "proposal" ? "方案构思" : "项目制作"}阶段主动提出：“${message}”。`,
            `请生成 1–2 页、总时长 2–3 分钟的即时微课，主题为“${decision.topic}”。`,
            `讲解要点：${keyPoints.join("；")}`,
            `必须联系课程驱动问题：${courseRef.current.drivingQuestion}`,
            "用与主课程一致的教学语言、PPT、TTS 和互动节奏；不要扩展成完整章节。",
          ].join("\n"),
          stageKey,
          scenes: sceneInputs,
          signal: backgroundController.signal,
          onProgress: ({ progress, message: progressMessage }) =>
            setMicroLessonTask((current) =>
              current?.lesson.id === lesson.id
                ? { ...current, progress, message: progressMessage }
                : current,
            ),
        });
        const readyLesson: AdaptiveMicroLesson = {
          ...lesson,
          classroomId: generated.classroomId,
          status: "ready",
        };
        await persistLesson(readyLesson);
        setMicroLessonTask({
          lesson: readyLesson,
          progress: 100,
          message: "微课已经准备好，随时可以开始",
        });
        const readyText = `“${decision.topic}”微课已经准备好了。点击右下角任务卡就能进入学习，学完会带你回到这里。`;
        setMessages((current) => appendMessage(current, {
          role: "assistant",
          companionId: "knowledge",
          content: readyText,
          ts: new Date().toISOString(),
        }));
        enqueueTTS(readyText, "knowledge");
      } catch (error) {
        if (backgroundController.signal.aborted) return;
        const failedLesson: AdaptiveMicroLesson = { ...lesson, status: "failed" };
        await persistLesson(failedLesson).catch(() => undefined);
        setMicroLessonTask((current) => current?.lesson.id === lesson.id ? {
          ...current,
          lesson: failedLesson,
          message: error instanceof Error ? error.message : "微课生成失败，请稍后重试",
        } : current);
      } finally {
        if (microLessonAbortRef.current === backgroundController) {
          microLessonAbortRef.current = null;
        }
      }
    })();
    return true;
  }, [enqueueTTS, session.studentId, stageKey]);

  const send = useCallback(async (text?: string, options?: CompanionSendOptions): Promise<boolean> => {
    const message = (text ?? input).trim();
    if (!message || phaseRef.current !== "idle" || ttsBusy || !stageEnabled || !available.length) return false;
    if (options?.trigger) {
      const now = Date.now();
      if (ttsSpeaking || ttsQueueLength > 0) return false;
      if (!shouldAllowProactiveIntervention({ kind: options.trigger.kind, now, lastProactiveAt: lastProactiveAtRef.current })) return false;
      lastProactiveAtRef.current = now;
    }

    const isTrigger = Boolean(options?.trigger);
    if (!isTrigger) {
      setMessages((current) => appendMessage(current, { role: "user", content: message, ts: new Date().toISOString() }));
      setInput("");
      setUnreadCount(0);
      studentHasSpokenRef.current = true;
    }
    setError(null);
    setPhase("director");
    phaseRef.current = "director";
    streamingTextRef.current = "";
    streamingSpeakerRef.current = null;
    speakerIdsRef.current = [];
    setStreamingText("");
    setCurrentSpeaker(null);
    setGeneratingCompanionId(null);
    stopTTS();

    const controller = new AbortController();
    abortRef.current = controller;
    if (!isTrigger) {
      try {
        const launched = await tryLaunchMicroLesson(message, controller.signal);
        if (launched) {
          abortRef.current = null;
          phaseRef.current = "idle";
          setPhase("idle");
          return true;
        }
      } catch (microLessonError) {
        if (controller.signal.aborted) return false;
        console.warn("Micro lesson decision failed; falling back to companion chat:", microLessonError);
      }
    }
    const profile = session.studentId
      ? deriveStudentLearningProfile({ course: courseRef.current, studentId: session.studentId, stageKey })
      : null;
    const teacherContext = (courseRef.current.teacherInterventions ?? [])
      .filter((item) => item.stageKey === stageKey && item.status === "open")
      .map((item) => `${item.action}：${item.instruction}`)
      .join("；") || "暂无额外教师介入";
    const studentWork = (courseRef.current.submissions ?? [])
      .filter((item) => item.studentId === session.studentId)
      .slice(-3)
      .map((item) => item.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n---\n");
    const companionIds = available.map((companion) => companion.id);
    let queuedSpeech = false;

    try {
      const response = await fetch("/api/chat/companion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: messagesRef.current.map((item) => ({ role: item.role === "user" ? "user" : "assistant", content: item.content })),
          companionIds,
          preferredCompanionId: options?.preferredCompanionId,
          courseName: courseRef.current.name,
          drivingQuestion: courseRef.current.drivingQuestion,
          stageKey,
          stageLabel: contextLabel,
          studentWork,
          teacherContext: [teacherContext, profile ? studentProfilePrompt(profile) : ""].filter(Boolean).join("\n"),
          courseId: courseRef.current.id,
          studentId: session.studentId,
          studentName: session.studentName,
          trigger: options?.trigger,
          taskId: options?.taskId,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "UNKNOWN" }));
        throw new Error(body.error ?? `API error ${response.status}`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";
      let allReplies = "";
      let lastCompanionId: AiCompanionId | undefined;
      let completed = false;
      const workspacePatches: CompletedCompanionRound["workspacePatches"] = [];
      const processEvent = (event: SSEEvent) => {
        switch (event.type) {
          case "director_start":
            setPhase("director");
            phaseRef.current = "director";
            break;
          case "director_result":
            speakerIdsRef.current = event.speakers;
            setPhase("director");
            phaseRef.current = "director";
            break;
          case "agent_start":
            streamingSpeakerRef.current = event.companionId;
            setGeneratingCompanionId(event.companionId);
            setPhase("director");
            phaseRef.current = "director";
            streamingTextRef.current = "";
            break;
          case "text_delta":
            streamingTextRef.current += event.delta;
            allReplies += event.delta;
            lastCompanionId = event.companionId;
            break;
          case "workspace_patch":
            workspacePatches.push({ ...event.patch, companionId: event.companionId, taskId: event.taskId });
            break;
          case "agent_end": {
            const fullText = sanitizeCompanionResponse(streamingTextRef.current);
            if (fullText) {
              setMessages((current) => appendMessage(current, {
                role: "assistant",
                companionId: event.companionId,
                content: fullText,
                ts: new Date().toISOString(),
              }));
              queuedSpeech = enqueueTTS(fullText, event.companionId) || queuedSpeech;
              setUnreadCount((current) => current + 1);
            }
            streamingTextRef.current = "";
            streamingSpeakerRef.current = null;
            setGeneratingCompanionId(null);
            break;
          }
          case "cue_user":
          case "done":
            completed = true;
            break;
          case "error":
            setError(event.message);
            break;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data: ")) continue;
          try { processEvent(JSON.parse(line.slice(6)) as SSEEvent); } catch { /* Ignore malformed SSE frames. */ }
        }
      }

      if (allReplies && lastCompanionId) {
        const companion = getCompanion(lastCompanionId);
        session.upsertAiSupport({
          stageKey,
          targetType: "student",
          targetId: session.studentId ?? courseRef.current.id,
          studentId: session.studentId,
          studentName: session.studentName,
          kind: stageKey === "showcase" ? "showcase-coach" : stageKey === "reflection" ? "reflection-evidence" : stageKey === "make" ? "artifact-diagnosis" : "idea-check",
          trigger: `${companion.role}伴学回应`,
          inputSummary: message,
          diagnosis: allReplies,
          suggestions: [allReplies],
          evidence: [`学生请求：${message}`, `回应伙伴：${speakerIdsRef.current.map((id) => getCompanion(id).role).join("、")}`],
          status: "draft",
          source: "llm",
        });
        if (session.studentId) {
          session.addCompanionProcessRecord({
            courseId: courseRef.current.id,
            studentId: session.studentId,
            stageKey,
            title: `${companion.name}回应了一个学习请求`,
            summary: allReplies.slice(0, 260),
            source: "agent",
            companionId: lastCompanionId,
            taskId: options?.taskId,
          });
        }
      }

      if (completed) {
        const round: CompletedCompanionRound = {
          id: `round-${Date.now().toString(36)}`,
          text: allReplies,
          speakerIds: [...speakerIdsRef.current],
          lastCompanionId,
          taskId: options?.taskId,
          workspacePatches,
          createdAt: new Date().toISOString(),
        };
        setLastCompletedRound(round);
      }
      return true;
    } catch (err) {
      if (controller.signal.aborted) return false;
      setError(err instanceof Error ? err.message : "AI 暂时不可用");
      return false;
    } finally {
      abortRef.current = null;
      phaseRef.current = queuedSpeech ? "done" : "idle";
      setPhase(queuedSpeech ? "done" : "idle");
      if (!queuedSpeech) {
        setCurrentSpeaker(null);
        setStreamingText("");
      }
      setGeneratingCompanionId(null);
      streamingTextRef.current = "";
      streamingSpeakerRef.current = null;
    }
  }, [available, contextLabel, enqueueTTS, input, session, stageEnabled, stageKey, stopTTS, tryLaunchMicroLesson, ttsBusy, ttsQueueLength, ttsSpeaking]);

  useEffect(() => { runRoundRef.current = send; }, [send]);

  useEffect(() => {
    stop();
    // Resetting the runtime is an intentional response to changing classroom scope.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages([]);
    setLastCompletedRound(null);
    setSelectedCompanionId(null);
    openingRequestedRef.current = false;
    studentHasSpokenRef.current = false;
    noProgressTriggeredRef.current = false;
  }, [course.id, stageKey, stop]);

  useEffect(() => {
    if (!stageEnabled || !session.studentId || !available.length) return;
    let cancelled = false;
    const loadThread = async () => {
      try {
        const response = await fetch(`/api/companion/threads?courseId=${encodeURIComponent(course.id)}&studentId=${encodeURIComponent(session.studentId!)}&stageKey=${encodeURIComponent(stageKey)}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as {
          thread?: { openingSentAt?: string; messages: Array<{ role: string; content: string; createdAt: string; visibility: string; companionId?: AiCompanionId }> } | null;
          directives?: Array<{ id: string; goal: string }>;
        };
        if (cancelled) return;
        const restored = (payload.thread?.messages ?? [])
          .filter((message) => message.visibility === "student-and-teacher" && ["student", "agent", "teacher-guidance"].includes(message.role))
          .map((message): CompanionChatMessage => ({
            role: message.role === "student" ? "user" : "assistant",
            content: message.role === "teacher-guidance"
              ? `教师指导：${message.content}`
              : message.role === "agent"
                ? sanitizeCompanionResponse(message.content)
                : message.content,
            ts: message.createdAt,
            companionId: message.companionId,
          }));
        setMessages(restored);
        messagesRef.current = restored;
        studentHasSpokenRef.current = restored.some((message) => message.role === "user");
        if (!payload.thread?.openingSentAt && !openingRequestedRef.current && !studentHasSpokenRef.current) {
          openingRequestedRef.current = true;
          const openingCompanionId = getCompanionStagePolicy(stageKey).openingCompanionId;
          const preferredCompanionId = available.find((item) => item.id === openingCompanionId)?.id;
          queueMicrotask(() => {
            if (cancelled) return;
            void runRoundRef.current(
              `请根据“${contextLabel}”阶段目标和学生当前产物，主动说明下一步，并给出一个现在就能完成的小动作。`,
              { trigger: { kind: "stage-opening", reason: `进入${contextLabel}阶段时主动引导`, preferredCompanionId }, preferredCompanionId },
            );
          });
        } else {
          const nextDirective = payload.directives?.find((directive) => !directiveTriggeredRef.current.has(directive.id));
          if (nextDirective) {
            directiveTriggeredRef.current.add(nextDirective.id);
            void runRoundRef.current(`请执行教师目标“${nextDirective.goal}”，结合学生当前产物开始引导。`, {
              trigger: { kind: "teacher-goal", reason: `教师目标：${nextDirective.goal}` },
            });
          }
        }
      } catch {
        // Restoring history should never block the student from working.
      }
    };
    void loadThread();
    return () => { cancelled = true; };
  }, [available, contextLabel, course.id, session.studentId, stageEnabled, stageKey]);

  useEffect(() => {
    if (!stageEnabled || !session.studentId) return;
    const markActive = () => {
      lastActivityAtRef.current = Date.now();
      idleTriggeredRef.current = false;
    };
    window.addEventListener("pointerdown", markActive);
    window.addEventListener("keydown", markActive);
    const timer = window.setInterval(() => {
      if (phaseRef.current !== "idle" || idleTriggeredRef.current || document.visibilityState !== "visible") return;
      if (Date.now() - lastActivityAtRef.current < 300_000) return;
      if (!shouldAllowProactiveIntervention({ kind: "idle", now: Date.now(), lastProactiveAt: lastProactiveAtRef.current })) return;
      idleTriggeredRef.current = true;
      void runRoundRef.current("学生在当前页面连续五分钟没有新的操作。请根据当前阶段目标，给出温和、具体的下一步提醒。", {
        trigger: { kind: "idle", reason: "当前页面可见且连续 5 分钟无操作" },
      });
    }, 15_000);
    return () => {
      window.removeEventListener("pointerdown", markActive);
      window.removeEventListener("keydown", markActive);
      window.clearInterval(timer);
    };
  }, [session.studentId, stageEnabled, stageKey]);

  useEffect(() => {
    if (!stageEnabled || !session.studentId) return;
    const seen = new Set<string>();
    const onArtifact = (event: Event) => {
      const detail = (event as CustomEvent<StudentArtifactEvent>).detail;
      if (!detail || detail.courseId !== course.id || detail.studentId !== session.studentId || detail.stageKey !== stageKey) return;
      if (!shouldProactivelyReviewArtifact(detail.kind, detail.milestone)) return;
      const key = `${detail.kind}:${detail.artifactId ?? detail.summary ?? "event"}`;
      if (seen.has(key)) return;
      seen.add(key);
      const followUp = stageArtifactFollowUp(stageKey, detail.kind);
      if (!followUp || !available.some((companion) => companion.id === followUp.preferredCompanionId)) return;
      window.setTimeout(() => {
        void runRoundRef.current(`${followUp.prompt}${detail.summary ? `\n材料：${detail.summary}` : ""}${detail.content ? `\n学生本次保存的文字：\n${detail.content.slice(0, 2000)}` : ""}`, {
          trigger: { kind: detail.kind === "document-saved" && detail.milestone ? "milestone" : detail.kind, reason: `${stageKey}阶段关键产物更新`, preferredCompanionId: followUp.preferredCompanionId },
          preferredCompanionId: followUp.preferredCompanionId,
        });
      }, 0);
    };
    window.addEventListener(STUDENT_ARTIFACT_EVENT, onArtifact);
    return () => window.removeEventListener(STUDENT_ARTIFACT_EVENT, onArtifact);
  }, [available, course.id, session.studentId, stageEnabled, stageKey]);

  useEffect(() => {
    if (!stageEnabled || phase !== "idle" || noProgressTriggeredRef.current || messages.length < 4) return;
    const recentQuestions = messages.filter((message) => message.role === "user").slice(-4);
    if (recentQuestions.length < 4) return;
    const firstQuestionAt = Date.parse(recentQuestions[0].ts);
    const hasNewArtifact = (course.submissions ?? []).some((submission) => submission.studentId === session.studentId && Date.parse(submission.updatedAt) > firstQuestionAt);
    if (hasNewArtifact) return;
    noProgressTriggeredRef.current = true;
    void runRoundRef.current("连续四轮讨论还没有形成新的产物变化。请先由记记收束当前讨论，再给出一个最小可执行动作。", {
      trigger: { kind: "no-progress", reason: "连续四轮对话无产物进展", preferredCompanionId: "recorder" },
      preferredCompanionId: "recorder",
    });
  }, [course.submissions, messages, phase, session.studentId, stageEnabled]);

  const value: CompanionRuntimeContextValue = {
    stageKey,
    contextLabel,
    stageEnabled,
    available,
    messages,
    input,
    setInput,
    phase,
    currentSpeaker,
    generatingCompanionId,
    streamingText,
    error,
    unreadCount,
    selectedCompanionId,
    setSelectedCompanionId,
    isActive: phase !== "idle" || tts.busy,
    send,
    stop,
    markRead: () => setUnreadCount(0),
    tts,
    lastCompletedRound,
    microLessonTask,
    dismissMicroLessonTask: () => setMicroLessonTask(null),
  };

  return (
    <CompanionRuntimeContext.Provider value={value}>
      {children}
    </CompanionRuntimeContext.Provider>
  );
}
