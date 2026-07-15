"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { History, Loader2, MessageSquare, Send, Volume2, VolumeX, X } from "lucide-react";
import type { CompanionTriggerKind, Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { getCompanion, recommendedCompanions, type AiCompanionId } from "@/lib/ai-companions";
import { useSettingsStore } from "@openmaic/lib/store/settings";
import { STUDENT_ARTIFACT_EVENT, type StudentArtifactEvent } from "@/lib/companion/events";
import { deriveStudentLearningProfile, studentProfilePrompt } from "@/lib/companion/student-profile";
import { shouldAllowProactiveIntervention, shouldProactivelyReviewArtifact } from "@/lib/companion/orchestrator";
import { stageArtifactFollowUp } from "@/lib/companion/stage-policy";

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  ts: string;
  companionId?: AiCompanionId;
};

type SSEEvent =
  | { type: "director_start" }
  | { type: "director_result"; speakers: AiCompanionId[] }
  | { type: "agent_start"; companionId: AiCompanionId }
  | { type: "text_delta"; companionId: AiCompanionId; delta: string }
  | { type: "agent_end"; companionId: AiCompanionId }
  | { type: "cue_user" }
  | { type: "done" }
  | { type: "error"; message: string };

type StreamPhase = "idle" | "director" | "speaking" | "done";

type FloatingPlacement = {
  left: number;
  top: number;
  width: number;
};

const DEFAULT_ENABLED_STAGES = ["proposal", "make", "showcase", "reflection"];

function placeBesideScene(rect: DOMRect, width: number, height: number): FloatingPlacement {
  const padding = 12;
  const gap = 14;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const spaces = [
    { direction: "right", size: viewportWidth - rect.right },
    { direction: "left", size: rect.left },
    { direction: "bottom", size: viewportHeight - rect.bottom },
    { direction: "top", size: rect.top },
  ].sort((a, b) => b.size - a.size);
  const direction = spaces[0]?.direction ?? "left";
  const clampX = (value: number) => Math.min(Math.max(padding, value), viewportWidth - width - padding);
  const clampY = (value: number) => Math.min(Math.max(padding, value), viewportHeight - height - padding);

  if (direction === "right") {
    return { left: clampX(rect.right + gap), top: clampY(rect.top), width };
  }
  if (direction === "left") {
    return { left: clampX(rect.left - width - gap), top: clampY(rect.top), width };
  }
  if (direction === "bottom") {
    return { left: clampX(rect.left + rect.width / 2 - width / 2), top: clampY(rect.bottom + gap), width };
  }
  return { left: clampX(rect.left + rect.width / 2 - width / 2), top: clampY(rect.top - height - gap), width };
}

// ============================================================
// TTS 队列项
// ============================================================

type TTSQueueItem = {
  text: string;
  companionId: AiCompanionId;
  /** 自增序号，用于稳定 key */
  seq: number;
  providerId: string;
  speed: number;
  /** Starts as soon as the manuscript is complete, even while an earlier item is playing. */
  preparedAudio?: Promise<string | null>;
};

// ============================================================
// TTS Hook — 带队列机制
// 规则：
//   1. speak() 把内容入队，不立即播放
//   2. 队列串行：前一个播完（onended / onerror）才播下一个
//   3. 禁止并发播放；stop() 清空队列并停止当前
//   4. 暴露 currentTTS（正在播放项）和 queueLength 供 UI 显示
// ============================================================

export function useCompanionTTS(options?: { onQueueDrained?: () => void }) {
  // 从 OpenMAIC 设置存储读取 TTS 配置
  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const ttsSpeed = useSettingsStore((s) => s.ttsSpeed);
  const ttsProvidersConfig = useSettingsStore((s) => s.ttsProvidersConfig);
  const agentVoiceOverrides = useSettingsStore((s) => s.agentVoiceOverrides);

  const [enabled, setEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  /** 当前正在播放的队列项（用于 UI 指示） */
  const [currentTTS, setCurrentTTS] = useState<TTSQueueItem | null>(null);
  /** 队列长度（不含正在播放项） */
  const [queueLength, setQueueLength] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // 朗读队列完全清空时的回调（用于串行显示控制）
  const onQueueDrainedRef = useRef(options?.onQueueDrained);
  useEffect(() => {
    onQueueDrainedRef.current = options?.onQueueDrained;
  }, [options?.onQueueDrained]);

  // 队列与播放状态用 ref 维护，避免闭包陈旧
  const queueRef = useRef<TTSQueueItem[]>([]);
  const isPlayingRef = useRef(false);
  const seqRef = useRef(0);
  const activeSeqRef = useRef<number | null>(null);
  const playNextRef = useRef<() => void>(() => undefined);

  // 同步队列长度到 state（仅在变化时更新）
  const syncQueueLength = useCallback(() => {
    setQueueLength(queueRef.current.length);
  }, []);

  // 浏览器原生 TTS 单条播放
  const speakBrowserOne = useCallback(
    (item: TTSQueueItem, speed: number, onDone: () => void) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        onDone();
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(item.text);
      utterance.lang = "zh-CN";
      utterance.rate = speed || 1.0;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        onDone();
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    },
    [],
  );

  // 服务端 TTS 预生成：文稿完成即开始，不等待前一个角色播放结束。
  const prepareServerAudio = useCallback(
    async (item: Pick<TTSQueueItem, "text" | "companionId" | "seq">, providerId: string, speed: number): Promise<string | null> => {
      try {
        const providerConfig = ttsProvidersConfig?.[providerId as keyof typeof ttsProvidersConfig];
        // 按智能体查找独立音色配置，未配置则回退到全局默认
        const override = agentVoiceOverrides?.[item.companionId];
        const effectiveVoice = override?.voiceId || ttsVoice || "default";
        const effectiveProviderId = override?.providerId || providerId;
        const effectiveProviderConfig =
          override?.providerId && override.providerId !== providerId
            ? ttsProvidersConfig?.[override.providerId as keyof typeof ttsProvidersConfig]
            : providerConfig;
        const effectiveModelId = override?.modelId || effectiveProviderConfig?.modelId;
        const res = await fetch("/api/openmaic/generate/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: item.text,
            audioId: `companion-${item.companionId}-${item.seq}`,
            ttsProviderId: effectiveProviderId,
            ttsModelId: effectiveModelId,
            ttsVoice: effectiveVoice,
            ttsSpeed: speed,
            ttsApiKey: effectiveProviderConfig?.apiKey,
            ttsBaseUrl: effectiveProviderConfig?.baseUrl || effectiveProviderConfig?.customDefaultBaseUrl,
          }),
        });

        if (!res.ok) throw new Error(`TTS API error: ${res.status}`);

        const data = await res.json();
        if (!data.success || !data.base64) throw new Error("No audio in response");

        return `data:audio/${data.format || "mp3"};base64,${data.base64}`;
      } catch {
        return null;
      }
    },
    [ttsProvidersConfig, ttsVoice, agentVoiceOverrides],
  );

  const playPreparedServerOne = useCallback(
    async (item: TTSQueueItem, audioUrl: string, onDone: () => void) => {
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
        await audio.play();
      } catch {
        speakBrowserOne(item, item.speed, onDone);
      }
    },
    [speakBrowserOne],
  );

  // 取出队首并播放，播放结束后递归处理下一项
  const playNext = useCallback(() => {
    if (isPlayingRef.current) return;
    const next = queueRef.current.shift();
    syncQueueLength();

    if (!next) {
      isPlayingRef.current = false;
      setSpeaking(false);
      setCurrentTTS(null);
      onQueueDrainedRef.current?.();
      return;
    }

    if (!enabledRef.current) {
      // 已禁用，清空剩余队列并结束播放状态
      queueRef.current = [];
      syncQueueLength();
      setSpeaking(false);
      setCurrentTTS(null);
      onQueueDrainedRef.current?.();
      return;
    }

    isPlayingRef.current = true;
    activeSeqRef.current = next.seq;
    setSpeaking(true);
    setCurrentTTS(next);

    const onDone = () => {
      if (activeSeqRef.current !== next.seq) return;
      activeSeqRef.current = null;
      isPlayingRef.current = false;
      // 短暂延迟避免连播突兀
      setTimeout(() => playNextRef.current(), 120);
    };

    if (next.providerId === "browser-native-tts") {
      speakBrowserOne(next, next.speed, onDone);
    } else {
      void (next.preparedAudio ?? prepareServerAudio(next, next.providerId, next.speed)).then((audioUrl) => {
        if (activeSeqRef.current !== next.seq) return;
        if (audioUrl) void playPreparedServerOne(next, audioUrl, onDone);
        else speakBrowserOne(next, next.speed, onDone);
      });
    }
  }, [playPreparedServerOne, prepareServerAudio, speakBrowserOne, syncQueueLength]);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  const prepare = useCallback(
    (text: string, companionId: AiCompanionId): TTSQueueItem | null => {
      if (!enabledRef.current) return null;
      const clean = text.replace(/<[^>]+>/g, "").trim();
      if (!clean) return null;
      seqRef.current += 1;
      const providerId = ttsProviderId || "browser-native-tts";
      const speed = ttsSpeed || 1.0;
      const item: TTSQueueItem = { text: clean, companionId, seq: seqRef.current, providerId, speed };
      if (providerId !== "browser-native-tts") {
        item.preparedAudio = prepareServerAudio(item, providerId, speed);
      }
      return item;
    },
    [prepareServerAudio, ttsProviderId, ttsSpeed],
  );

  const enqueuePrepared = useCallback(
    (item: TTSQueueItem | null): boolean => {
      if (!item || !enabledRef.current) return false;
      queueRef.current.push(item);
      syncQueueLength();
      if (!isPlayingRef.current) {
        playNext();
      }
      return true;
    },
    [playNext, syncQueueLength],
  );

  const enqueue = useCallback(
    (text: string, companionId: AiCompanionId): boolean => enqueuePrepared(prepare(text, companionId)),
    [enqueuePrepared, prepare],
  );

  // 保留 speak() 接口以兼容旧调用路径（直接入队）
  const speak = useCallback(
    (text: string) => {
      // 默认绑定 knowledge，调用方应优先使用 enqueue
      enqueue(text, "knowledge");
    },
    [enqueue],
  );

  const stop = useCallback(() => {
    // 清空队列
    queueRef.current = [];
    activeSeqRef.current = null;
    isPlayingRef.current = false;
    syncQueueLength();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeaking(false);
    setCurrentTTS(null);
  }, [syncQueueLength]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      if (prev) stop();
      return !prev;
    });
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  return {
    enabled,
    speaking,
    speak,
    enqueue,
    prepare,
    enqueuePrepared,
    stop,
    toggle,
    currentTTS,
    queueLength,
  };
}

function ClassmateAvatar({
  index,
  standing = false,
}: {
  color: string;
  index: number;
  standing?: boolean;
}) {
  return (
    <span className={`relative block origin-bottom transition-all duration-500 ${standing ? "-translate-y-3 scale-110 drop-shadow-[0_8px_5px_rgba(37,28,20,.25)]" : ""}`} aria-hidden>
      <span
        className={`pixel-companion-sprite block ${standing ? "pixel-companion-speaking" : "pixel-companion-idle"}`}
        style={{ display: "block", height: 48, overflow: "hidden", position: "relative", width: 32 }}
      >
        <Image
          alt=""
          className="pixel-companion-sheet pointer-events-none max-w-none select-none"
          draggable={false}
          height={96}
          onDragStart={(event) => event.preventDefault()}
          src={`/companions/pixel-agents/char_${index % 6}.png`}
          style={{ height: 192, left: 0, maxWidth: "none", position: "absolute", top: 0, width: 224 }}
          unoptimized
          width={112}
        />
      </span>
      {standing && <span className="absolute -right-2 -top-2 z-20 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-amber-300 text-[10px] shadow">✦</span>}
    </span>
  );
}

// ============================================================
// CompanionRoundtable 组件 — 悬浮式伴学圆桌（圆形会议桌布局 + TTS 队列）
// ============================================================

export function CompanionRoundtable({
  course,
  stageKey,
  contextLabel,
  autoSendMessage,
}: {
  course: Course;
  stageKey: string;
  contextLabel: string;
  /**
   * 外部触发发送的消息。当此值变化为非空字符串时，组件自动打开面板并将
   * 该消息作为学生发言发送给 AI 伴学小组。用于方案构思等场景中"AI 帮我
   * 完善"按钮：父组件设置此 prop 即可触发对话，无需暴露内部 runRound。
   * 重复设置同一个字符串不会重复发送（用 ref 记录上次值）。
   */
  autoSendMessage?: string | null;
}) {
  const session = useSession();
  const configuredStages = course.uiState?.aiChatStagesEnabled ?? [];
  const stageEnabled =
    configuredStages.length
      ? configuredStages.includes(stageKey)
      : DEFAULT_ENABLED_STAGES.includes(stageKey);

  const available = useMemo(() => {
    const configuredIds = course.pblConfig?.companionIds;
    const candidates = configuredIds?.length
      ? configuredIds.map((id) => getCompanion(id as AiCompanionId))
      : recommendedCompanions(stageKey);
    return candidates.filter((companion) => companion.stages.includes(stageKey));
  }, [course.pblConfig?.companionIds, stageKey]);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<StreamPhase>("idle");
  const [currentSpeaker, setCurrentSpeaker] = useState<AiCompanionId | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [visibleBubble, setVisibleBubble] = useState<AiCompanionId | null>(null);
  const [visibleBubbleText, setVisibleBubbleText] = useState("");
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [bubblePlacement, setBubblePlacement] = useState<FloatingPlacement | null>(null);
  const [composerPlacement, setComposerPlacement] = useState<FloatingPlacement | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const sceneRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerX: number; pointerY: number; originX: number; originY: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const streamingTextRef = useRef(""); // 防 React StrictMode 双调用导致的重复
  const streamingSpeakerRef = useRef<AiCompanionId | null>(null);
  const openingRequestedRef = useRef(false);
  const openingStageRef = useRef<string | null>(null);
  const studentHasSpokenRef = useRef(false);
  const phaseRef = useRef<StreamPhase>("idle");
  const directiveTriggeredRef = useRef<Set<string>>(new Set());
  const idleTriggeredRef = useRef(false);
  const lastActivityAtRef = useRef(Date.now());
  const noProgressTriggeredRef = useRef(false);
  const lastProactiveAtRef = useRef<number | undefined>(undefined);
  const composerAutoCloseTimerRef = useRef<number | null>(null);

  // 始终指向最新的 course，避免事件回调中读到旧的 submissions
  const courseRef = useRef(course);
  useEffect(() => { courseRef.current = course; }, [course]);

  // ===== 显示队列：控制智能体消息的串行显示 =====
  // 生成不阻塞（SSE 流式接收），但显示和朗读串行：
  // 第一个智能体说完话（显示+朗读完）后，第二个才显示并朗读
  type DisplayQueueItem = { companionId: AiCompanionId; fullText: string; preparedTts?: TTSQueueItem | null };
  const displayQueueRef = useRef<DisplayQueueItem[]>([]);
  const isDisplayingRef = useRef(false);
  const displayFinishTimerRef = useRef<number | null>(null);
  const playNextDisplayRef = useRef<() => void>(() => undefined);

  const tts = useCompanionTTS({
    onQueueDrained: () => {
      // TTS 队列空了，当前消息显示+朗读完毕，显示下一条
      if (displayFinishTimerRef.current !== null) {
        window.clearTimeout(displayFinishTimerRef.current);
        displayFinishTimerRef.current = null;
      }
      isDisplayingRef.current = false;
      playNextDisplayRef.current();
    },
  });

  // playNextDisplay：从 displayQueue 取出消息 → 显示 → 入队 TTS
  // 在 tts 定义之后才能赋值（依赖 tts.enqueue）
  playNextDisplayRef.current = () => {
    if (isDisplayingRef.current) return;
    const item = displayQueueRef.current.shift();
    if (!item) return;
    isDisplayingRef.current = true;
    setMessages((cur) => [
      ...cur,
      {
        role: "assistant" as const,
        companionId: item.companionId,
        content: item.fullText,
        ts: new Date().toISOString(),
      },
    ]);
    setVisibleBubble(item.companionId);
    setVisibleBubbleText(item.fullText);
    const queued = item.preparedTts
      ? tts.enqueuePrepared(item.preparedTts)
      : tts.enqueue(item.fullText, item.companionId);
    if (!queued) {
      // With TTS switched off there is no onended callback. Keep the bubble
      // visible briefly, then advance the same serialized display queue.
      displayFinishTimerRef.current = window.setTimeout(() => {
        displayFinishTimerRef.current = null;
        isDisplayingRef.current = false;
        playNextDisplayRef.current();
      }, 4000);
    }
  };

  function resetDisplayQueue() {
    displayQueueRef.current = [];
    isDisplayingRef.current = false;
    if (displayFinishTimerRef.current !== null) {
      window.clearTimeout(displayFinishTimerRef.current);
      displayFinishTimerRef.current = null;
    }
    setVisibleBubble(null);
    setVisibleBubbleText("");
  }

  // Clear display queue and pending finish timer on unmount to prevent leaks
  // when the component is torn down mid-stream (e.g. stage change / navigation).
  useEffect(() => () => {
    resetDisplayQueue();
    if (composerAutoCloseTimerRef.current !== null) {
      window.clearTimeout(composerAutoCloseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // 外部触发只启动伴学回应；输入框仅由学生主动点击打开。
  const lastAutoSentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoSendMessage || !stageEnabled) return;
    if (lastAutoSentRef.current === autoSendMessage) return;
    if (phaseRef.current !== "idle") return; // 避免打断正在进行的对话
    lastAutoSentRef.current = autoSendMessage;
    void runRound(autoSendMessage);
    // runRound 依赖最新 state，此处只在 autoSendMessage 变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSendMessage, stageEnabled]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, streamingText]);

  useEffect(() => {
    if (!visibleBubble || currentSpeaker || tts.speaking || isDisplayingRef.current) return;
    const timer = window.setTimeout(() => {
      setVisibleBubble(null);
      setVisibleBubbleText("");
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [currentSpeaker, tts.speaking, visibleBubble]);

  useEffect(() => {
    function move(event: PointerEvent) {
      if (!dragRef.current || !sceneRef.current) return;
      const nextX = dragRef.current.originX + event.clientX - dragRef.current.pointerX;
      const nextY = dragRef.current.originY + event.clientY - dragRef.current.pointerY;
      const rect = sceneRef.current.getBoundingClientRect();
      setPosition({
        x: Math.min(Math.max(8, nextX), window.innerWidth - rect.width - 8),
        y: Math.min(Math.max(8, nextY), window.innerHeight - rect.height - 8),
      });
    }
    function stop() { dragRef.current = null; }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  useEffect(() => {
    if (!visibleBubble && !isOpen) return;

    function updatePlacements() {
      const rect = sceneRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (visibleBubble) {
        const width = Math.min(292, window.innerWidth - 24);
        setBubblePlacement(placeBesideScene(rect, width, 208));
      }
      if (isOpen) {
        const width = Math.min(380, window.innerWidth - 24);
        setComposerPlacement(placeBesideScene(rect, width, 176));
      }
    }

    updatePlacements();
    window.addEventListener("resize", updatePlacements);
    return () => window.removeEventListener("resize", updatePlacements);
  }, [isOpen, position, visibleBubble]);

  useEffect(() => {
    if (!stageEnabled || !session.studentId) return;
    if (openingStageRef.current !== stageKey) {
      openingStageRef.current = stageKey;
      openingRequestedRef.current = false;
    }
    let cancelled = false;
    const loadThread = async () => {
      try {
        const response = await fetch(`/api/companion/threads?courseId=${encodeURIComponent(course.id)}&studentId=${encodeURIComponent(session.studentId!)}&stageKey=${encodeURIComponent(stageKey)}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as {
          thread?: { openingSentAt?: string; messages: Array<{ role: string; content: string; createdAt: string; visibility: string; companionId?: AiCompanionId; triggerKind?: CompanionTriggerKind }> } | null;
          directives?: Array<{ id: string; goal: string }>;
        };
        if (cancelled) return;
        const latestProactiveAt = (payload.thread?.messages ?? [])
          .filter((message) => message.role === "system-trigger")
          .map((message) => Date.parse(message.createdAt))
          .filter(Number.isFinite)
          .sort((a, b) => b - a)[0];
        if (latestProactiveAt) lastProactiveAtRef.current = latestProactiveAt;
        const restored = (payload.thread?.messages ?? [])
          .filter((message) => message.visibility === "student-and-teacher" && (message.role === "student" || message.role === "agent" || message.role === "teacher-guidance"))
          .map((message): ChatMsg => ({
            role: message.role === "student" ? "user" : "assistant",
            content: message.role === "teacher-guidance" ? `教师指导：${message.content}` : message.content,
            ts: message.createdAt,
            companionId: message.companionId,
          }));
        setMessages(restored);
        studentHasSpokenRef.current = restored.some((message) => message.role === "user");
        if (!payload.thread?.openingSentAt && !openingRequestedRef.current) {
          // Entering a new stage starts the companion guidance immediately;
          // the guards below still avoid interrupting a student who already spoke.
          queueMicrotask(() => {
            if (openingRequestedRef.current || studentHasSpokenRef.current || phaseRef.current !== "idle") return;
            openingRequestedRef.current = true;
            void runRound(
              `请根据“${contextLabel}”阶段目标和学生当前产物，主动用创意启发的方式说明下一步，并给出一个现在就能完成的小动作。`,
              { kind: "stage-opening", reason: `进入${contextLabel}阶段时主动引导`, preferredCompanionId: available.some((companion) => companion.id === "ideation") ? "ideation" : undefined },
            );
          });
        } else {
          const nextDirective = payload.directives?.find((directive) => !directiveTriggeredRef.current.has(directive.id));
          if (nextDirective) {
            directiveTriggeredRef.current.add(nextDirective.id);
            void runRound(`请执行教师目标“${nextDirective.goal}”，结合学生当前产物开始引导。`, { kind: "teacher-goal", reason: `教师目标：${nextDirective.goal}` });
          }
        }
      } catch {
        // 对话恢复失败不阻塞学生继续编辑。
      }
    };
    void loadThread();
    return () => { cancelled = true; };
    // runRound uses the latest render state; this effect is intentionally keyed to the thread identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id, contextLabel, session.studentId, stageEnabled, stageKey]);

  useEffect(() => {
    if (!stageEnabled || !session.studentId) return;
    const markActive = () => {
      lastActivityAtRef.current = Date.now();
      idleTriggeredRef.current = false;
    };
    window.addEventListener("pointerdown", markActive);
    window.addEventListener("keydown", markActive);
    const timer = window.setInterval(() => {
      if (phase !== "idle" || idleTriggeredRef.current) return;
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivityAtRef.current < 300_000) return;
      if (!shouldAllowProactiveIntervention({ kind: "idle", now: Date.now(), lastProactiveAt: lastProactiveAtRef.current })) return;
      idleTriggeredRef.current = true;
      void runRound("学生在当前可见页面连续五分钟没有新的操作。请根据当前阶段目标，给出温和、具体的下一步提醒。", { kind: "idle", reason: "当前页面可见且连续 5 分钟无操作" });
    }, 15_000);
    return () => {
      window.removeEventListener("pointerdown", markActive);
      window.removeEventListener("keydown", markActive);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session.studentId, stageEnabled, stageKey]);

  useEffect(() => {
    if (!stageEnabled || !session.studentId) return;
    const seenArtifactEvents = new Set<string>();
    function onArtifactSaved(event: Event) {
      const detail = (event as CustomEvent<StudentArtifactEvent>).detail;
      if (!detail || detail.courseId !== course.id || detail.studentId !== session.studentId || detail.stageKey !== stageKey) return;
      if (!shouldProactivelyReviewArtifact(detail.kind, detail.milestone)) return;
      const eventKey = `${detail.kind}:${detail.artifactId ?? detail.summary ?? "event"}`;
      if (seenArtifactEvents.has(eventKey)) return;
      seenArtifactEvents.add(eventKey);
      const followUp = stageArtifactFollowUp(stageKey, detail.kind);
      if (!followUp || !available.some((companion) => companion.id === followUp.preferredCompanionId)) return;
      window.setTimeout(() => {
        const docContent = detail.content?.trim();
        const triggerKind: CompanionTriggerKind = detail.kind === "document-saved" && detail.milestone
          ? "milestone"
          : detail.kind;
        void runRound(
          `${followUp.prompt}${detail.summary ? `\n材料：${detail.summary}` : ""}${docContent ? `\n学生本次保存的文字：\n${docContent.slice(0, 2000)}` : ""}`,
          { kind: triggerKind, reason: `${stageKey}阶段关键产物更新`, preferredCompanionId: followUp.preferredCompanionId },
        );
      }, 0);
    }
    window.addEventListener(STUDENT_ARTIFACT_EVENT, onArtifactSaved);
    return () => window.removeEventListener(STUDENT_ARTIFACT_EVENT, onArtifactSaved);
    // runRound intentionally uses the active render's state and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id, session.studentId, stageEnabled, stageKey]);

  useEffect(() => {
    if (phase !== "idle" || noProgressTriggeredRef.current) return;
    const recentQuestions = messages.filter((message) => message.role === "user").slice(-4);
    if (recentQuestions.length < 4) return;
    const firstQuestionAt = Date.parse(recentQuestions[0].ts);
    const hasNewArtifact = (course.submissions ?? []).some(
      (submission) => submission.studentId === session.studentId && Date.parse(submission.updatedAt) > firstQuestionAt,
    );
    if (hasNewArtifact) return;
    noProgressTriggeredRef.current = true;
    void runRound("连续四轮讨论还没有形成新的产物变化。请先由记记收束当前讨论，再给出一个最小可执行动作。", { kind: "no-progress", reason: "连续 4 轮对话无产物进展" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.submissions, messages, phase, session.studentId]);

  if (!stageEnabled || !available.length) return null;

  const companionIds = available.map((c) => c.id);
  const isActive = phase !== "idle";

  // 当前正在 TTS 播放的角色（优先级高于 currentSpeaker，用于"站立"动画）
  const ttsSpeaker = tts.currentTTS?.companionId ?? null;
  // 综合判断哪个角色处于"发言站立"状态：
  //   - 流式输出中：currentSpeaker
  //   - 流式结束后 TTS 仍在播：ttsSpeaker
  const standingSpeaker = currentSpeaker ?? ttsSpeaker;

  function openDialog() {
    if (composerAutoCloseTimerRef.current !== null) {
      window.clearTimeout(composerAutoCloseTimerRef.current);
      composerAutoCloseTimerRef.current = null;
    }
    setIsOpen(true);
    setUnreadCount(0);
  }

  function closeDialog() {
    if (composerAutoCloseTimerRef.current !== null) {
      window.clearTimeout(composerAutoCloseTimerRef.current);
      composerAutoCloseTimerRef.current = null;
    }
    setIsOpen(false);
  }

  function startDrag(event: React.PointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button,input,textarea,[data-no-drag]")) return;
    const rect = sceneRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, originX: rect.left, originY: rect.top };
    setPosition({ x: rect.left, y: rect.top });
  }

  async function runRound(text: string, trigger?: { kind: CompanionTriggerKind; reason: string; preferredCompanionId?: AiCompanionId }) {
    if (!text || phaseRef.current !== "idle") return;
    if (trigger) {
      if (tts.speaking || tts.queueLength > 0 || isDisplayingRef.current) return;
      const now = Date.now();
      if (!shouldAllowProactiveIntervention({ kind: trigger.kind, now, lastProactiveAt: lastProactiveAtRef.current })) return;
      lastProactiveAtRef.current = now;
    }

    if (!trigger) {
      const userMsg: ChatMsg = { role: "user", content: text, ts: new Date().toISOString() };
      setMessages((cur) => [...cur, userMsg]);
      setInput("");
      if (composerAutoCloseTimerRef.current !== null) {
        window.clearTimeout(composerAutoCloseTimerRef.current);
      }
      composerAutoCloseTimerRef.current = window.setTimeout(() => {
        composerAutoCloseTimerRef.current = null;
        setIsOpen(false);
      }, 2500);
      lastActivityAtRef.current = Date.now();
      idleTriggeredRef.current = false;
    }
    setError(null);
    phaseRef.current = "director";
    setPhase("director");
    setStreamingText("");
    streamingTextRef.current = "";
    streamingSpeakerRef.current = null;
    setCurrentSpeaker(null);
    // 开始新一轮对话前清空 TTS 队列，避免上一轮残留语音串扰
    resetDisplayQueue();
    tts.stop();

    // 防替代检测
    const asksForCompleteWork = /完整|全部|直接生成|代写|帮我做完/.test(text);
    const hasOwnWork = (course.submissions ?? []).some(
      (item) =>
        item.studentId === session.studentId &&
        item.content.replace(/<[^>]+>/g, "").trim().length >= 30,
    );

    if (!trigger && asksForCompleteWork && !hasOwnWork) {
      const reply =
        "先给我你的想法、草稿或一个具体卡点吧。我可以提问、比较选项或检查漏洞，但项目的核心构思和作品需要由你完成。";
      displayQueueRef.current.push({ companionId: "knowledge", fullText: reply });
      if (!isDisplayingRef.current) playNextDisplayRef.current();
      phaseRef.current = "idle";
      setPhase("idle");
      // 防替代提示也入队 TTS
      if (!isOpen) setUnreadCount((c) => c + 1);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    let allReplies = "";
    let lastCompanionId: AiCompanionId | null = null;
    let speakersForRecord: AiCompanionId[] = [];

    try {
      if (!trigger) studentHasSpokenRef.current = true;
      const profile = session.studentId ? deriveStudentLearningProfile({ course, studentId: session.studentId, stageKey }) : null;
      const teacherContext =
        (courseRef.current.teacherInterventions ?? [])
          .filter((item) => item.stageKey === stageKey && item.status === "open")
          .map((item) => `${item.action}：${item.instruction}`)
          .join("；") || "暂无额外教师介入";
      const studentWork = (courseRef.current.submissions ?? [])
        .filter((item) => item.studentId === session.studentId)
        .slice(-3)
        .map((item) => item.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n---\n");

      const res = await fetch("/api/chat/companion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          companionIds,
          courseName: course.name,
          drivingQuestion: course.drivingQuestion,
          stageKey,
          stageLabel: contextLabel,
          studentWork,
          teacherContext: [teacherContext, profile ? studentProfilePrompt(profile) : ""].filter(Boolean).join("\n"),
          courseId: course.id,
          studentId: session.studentId,
          studentName: session.studentName,
          trigger,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "UNKNOWN" }));
        throw new Error(err.error ?? `API error ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const event: SSEEvent = JSON.parse(line.slice(6));
            // 内联处理事件，避免 handleEvent 函数中的副作用
            switch (event.type) {
              case "director_start":
                phaseRef.current = "director";
                setPhase("director");
                break;
              case "director_result":
                speakersForRecord = event.speakers;
                phaseRef.current = "speaking";
                setPhase("speaking");
                break;
              case "agent_start": {
                streamingSpeakerRef.current = event.companionId;
                const canPreviewSpeaker =
                  !isDisplayingRef.current && displayQueueRef.current.length === 0;
                if (canPreviewSpeaker) {
                  setCurrentSpeaker(event.companionId);
                  setVisibleBubble(event.companionId);
                  setVisibleBubbleText("");
                } else {
                  // The SSE stream may already be preparing the next speaker
                  // while the current speaker is being read. Keep the current
                  // bubble untouched until the display queue advances.
                  setCurrentSpeaker(null);
                }
                setStreamingText("");
                streamingTextRef.current = "";
                break;
              }
              case "text_delta":
                streamingTextRef.current += event.delta;
                if (
                  !isDisplayingRef.current &&
                  displayQueueRef.current.length === 0 &&
                  streamingSpeakerRef.current === event.companionId
                ) {
                  setStreamingText(streamingTextRef.current);
                }
                allReplies += event.delta;
                lastCompanionId = event.companionId;
                break;
              case "agent_end": {
                // 从 ref 读取完整回复，入队 displayQueue 串行显示
                const fullText = streamingTextRef.current;
                if (fullText) {
                  displayQueueRef.current.push({
                    companionId: event.companionId,
                    fullText,
                    preparedTts: tts.prepare(fullText, event.companionId),
                  });
                  // 若当前没有正在显示+朗读的消息，立即显示；否则等 onQueueDrained 回调
                  if (!isDisplayingRef.current) {
                    playNextDisplayRef.current();
                  }
                }
                streamingTextRef.current = "";
                streamingSpeakerRef.current = null;
                setStreamingText("");
                setCurrentSpeaker(null);
                if (!isOpen) setUnreadCount((c) => c + 1);
                break;
              }
              case "cue_user":
              case "done":
                phaseRef.current = "done";
                setPhase("done");
                setTimeout(() => {
                  phaseRef.current = "idle";
                  setPhase("idle");
                }, 300);
                break;
              case "error":
                setError(event.message);
                break;
            }
          } catch {
            // Skip malformed events
          }
        }
      }

      // 记录 AI 支持到 session
      if (allReplies && lastCompanionId) {
        const companion = getCompanion(lastCompanionId);
        session.upsertAiSupport({
          stageKey,
          targetType: "student",
          targetId: session.studentId ?? course.id,
          studentId: session.studentId,
          studentName: session.studentName,
          kind:
            stageKey === "showcase"
              ? "showcase-coach"
              : stageKey === "reflection"
                ? "reflection-evidence"
                : stageKey === "make"
                  ? "artifact-diagnosis"
                  : "idea-check",
          trigger: `${companion.role}圆桌对话`,
          inputSummary: text,
          diagnosis: allReplies,
          suggestions: [allReplies],
          evidence: [
            `学生提问：${text}`,
            `发言角色：${speakersForRecord.map((id) => getCompanion(id).role).join("、")}`,
          ],
          status: "draft",
          source: "llm",
        });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "AI 暂时不可用");
    } finally {
      phaseRef.current = "idle";
      setPhase("idle");
      setCurrentSpeaker(null);
      setStreamingText("");
      streamingTextRef.current = "";
      abortRef.current = null;
    }
  }

  function send() {
    void runRound(input.trim());
  }

  function stopStream() {
    abortRef.current?.abort();
    const partialCompanionId = streamingSpeakerRef.current ?? currentSpeaker ?? "knowledge";
    const partialText = streamingTextRef.current;
    resetDisplayQueue();
    tts.stop();
    phaseRef.current = "idle";
    setPhase("idle");
    setCurrentSpeaker(null);
    streamingSpeakerRef.current = null;
    // 将未完成的流式文本保存到消息列表
    if (partialText) {
      displayQueueRef.current.push({
        companionId: partialCompanionId,
        fullText: partialText,
      });
      playNextDisplayRef.current();
      streamingTextRef.current = "";
      setStreamingText("");
    }
  }

  // ============================================================
  // 渲染：圆形会议桌
  // ============================================================
  const bubbleCompanion = visibleBubble ? getCompanion(visibleBubble) : null;
  const bubbleText = visibleBubble
    ? (currentSpeaker === visibleBubble ? streamingText : "") || visibleBubbleText
    : "";

  return (
    <>
      {/* ====== 融入课堂主界面的像素伴学现场 ====== */}
      <section
        ref={sceneRef}
        aria-label="AI 伴学圆桌"
        className="fixed bottom-3 right-3 z-40 h-[180px] w-[min(280px,calc(100vw-1rem))] cursor-grab touch-none select-none active:cursor-grabbing sm:bottom-5 sm:right-5"
        onPointerDown={startDrag}
        style={position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined}
      >
        {/* 桌椅采用精选的 Pixel Agents 游戏素材 */}
        <Image alt="" className="pixelated pointer-events-none absolute bottom-[58px] left-1/2 z-[3] h-16 w-16 -translate-x-1/2 drop-shadow-[0_7px_4px_rgba(15,23,42,.18)]" height={64} src="/companions/pixel-agents/COFFEE_TABLE.png" unoptimized width={64} />

        {available.map((companion, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI * 2) / available.length;
          const characterPosition = {
            left: 140 + Math.cos(angle) * 92,
            top: 82 + Math.sin(angle) * 57,
            transform: "translate(-50%, -50%)",
            zIndex: Math.sin(angle) > 0.15 ? 10 : Math.sin(angle) < -0.15 ? 2 : 4,
          };
          return (
            <div key={companion.id}>
              <div className="absolute flex flex-col items-center" style={characterPosition}>
                <ClassmateAvatar color={companion.color} index={index} standing={companion.id === standingSpeaker} />
                <span className="-mt-0.5 rounded-full border border-white/80 bg-white/90 px-1.5 py-px text-[9px] font-bold shadow-sm" style={{ color: companion.color }}>
                  {companion.name}
                </span>
              </div>
            </div>
          );
        })}

        {bubbleCompanion && bubbleText && bubblePlacement && (
          <div
            data-no-drag
            className="fixed z-50 animate-[bubble-in_.24s_ease-out] cursor-auto select-text"
            style={bubblePlacement}
          >
            <div className="max-h-52 overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-stone-200 bg-white px-3.5 py-3 text-[13px] leading-6 text-stone-700 shadow-[0_16px_38px_rgba(15,23,42,.16)] [overflow-wrap:anywhere]">
              <div className="sticky top-0 mb-1 flex items-center gap-1.5 bg-white/95 pb-1 text-[10px] font-bold backdrop-blur-sm" style={{ color: bubbleCompanion.color }}>
                <span>{bubbleCompanion.name}</span><span className="opacity-55">{bubbleCompanion.role}</span>
              </div>
              {bubbleText}
            </div>
          </div>
        )}

        {phase === "director" && (
          <div className="absolute bottom-[calc(100%+16px)] left-1/2 z-30 flex w-max -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-[var(--pbl-student-border)] bg-white/95 px-3 py-1.5 text-xs font-semibold text-[var(--pbl-student)] shadow-lg">
            <Loader2 size={13} className="animate-spin" /> 正在邀请合适的伙伴回应…
          </div>
        )}

        {error && (
          <div data-no-drag className="absolute bottom-[calc(100%+16px)] left-1/2 z-30 w-64 -translate-x-1/2 rounded-xl border border-rose-200 bg-white/95 px-3 py-2 text-xs leading-5 text-rose-700 shadow-lg">
            伴学回应暂时未完成：{error}
          </div>
        )}

        {/* 仅在发起时展开的轻量输入，不形成独立聊天窗口 */}
        {isOpen && composerPlacement && (
          <div
            data-no-drag
            className="fixed z-50 animate-[slide-up_.22s_ease-out] rounded-2xl border-2 border-teal-200 bg-white p-2.5 shadow-[0_10px_24px_rgba(13,148,136,.16)]"
            style={composerPlacement}
          >
            <div className="flex items-end gap-2">
              <textarea
                autoFocus
                aria-label="向伴学小组提问"
                className="min-h-24 max-h-40 min-w-0 flex-1 resize-y bg-transparent px-2 py-1.5 text-sm leading-6 text-stone-700 outline-none placeholder:text-stone-400"
                disabled={isActive}
                onChange={(event) => {
                  if (composerAutoCloseTimerRef.current !== null) {
                    window.clearTimeout(composerAutoCloseTimerRef.current);
                    composerAutoCloseTimerRef.current = null;
                  }
                  setInput(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder="说说你的草稿、思路或具体卡点…（Enter 发送，Shift+Enter 换行）"
                rows={3}
                value={input}
              />
              {isActive ? (
                <button className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--pbl-danger)] text-white transition hover:-translate-y-0.5 hover:brightness-90" onClick={stopStream} type="button" aria-label="停止回应">
                  <X size={15} />
                </button>
              ) : (
                <button className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--pbl-student)] text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--pbl-student-hover)] disabled:opacity-40" disabled={!input.trim()} onClick={() => void send()} type="button" aria-label="发送">
                  <Send size={15} />
                </button>
              )}
              <button className="grid h-9 w-9 place-items-center rounded-xl text-stone-400 hover:bg-stone-100" onClick={closeDialog} type="button" aria-label="收起输入">
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        <div data-no-drag className="absolute -bottom-7 left-1/2 z-20 flex w-max min-w-max -translate-x-1/2 flex-nowrap items-center gap-2 whitespace-nowrap">
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white/95 text-stone-600 shadow-[0_4px_14px_rgba(15,23,42,.1)] transition hover:-translate-y-0.5 hover:border-[var(--pbl-student-border)] hover:text-[var(--pbl-student)]" onClick={tts.toggle} type="button" aria-label={tts.enabled ? "关闭语音" : "开启语音"}>
            {tts.enabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>
          <button className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-stone-200 bg-white/95 px-4 text-sm font-bold text-stone-600 shadow-[0_4px_14px_rgba(15,23,42,.1)] transition hover:-translate-y-0.5 hover:border-[var(--pbl-student-border)] hover:text-[var(--pbl-student)]" onClick={() => setHistoryOpen((value) => !value)} type="button">
            <History size={13} /> 历史
          </button>
          {!isOpen && (
            <button className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--pbl-student)] px-5 text-sm font-bold text-white shadow-[0_6px_18px_rgba(13,148,136,.28)] transition hover:-translate-y-0.5 hover:bg-[var(--pbl-student-hover)]" onClick={openDialog} type="button">
              <MessageSquare size={13} /> 发起讨论
            </button>
          )}
        </div>

        {historyOpen && (
          <div data-no-drag className="absolute bottom-12 right-0 z-40 max-h-64 w-[min(320px,calc(100vw-2rem))] cursor-auto select-text overflow-y-auto rounded-2xl border border-[#d8c6a8] bg-[#fffdf7]/98 p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between text-xs font-bold text-[var(--pbl-text-strong)]"><span>讨论记录</span><button onClick={() => setHistoryOpen(false)} type="button" aria-label="关闭历史"><X size={14} /></button></div>
            {messages.length ? messages.map((message, index) => (
              <div key={`${message.ts}-${index}`} className="mb-2 rounded-xl bg-[#f3eadb] px-3 py-2 text-xs leading-5 text-[#493e34]">
                <b>{message.role === "user" ? "我" : getCompanion(message.companionId ?? "knowledge").name}：</b>{message.content}
              </div>
            )) : <p className="py-5 text-center text-xs text-[#9a8a77]">还没有讨论记录</p>}
          </div>
        )}
      </section>

      {/* ====== 右下角常驻的桌边同学 ====== */}
      <button
        aria-label={isOpen ? "关闭伴学圆桌" : "打开伴学圆桌"}
        className="hidden"
        onClick={() => (isOpen ? closeDialog() : openDialog())}
        type="button"
      >
        {/* 状态光环 */}
        <span
          className={`absolute -inset-1 rounded-full transition-all duration-500 ${
            phase === "director"
              ? "animate-ping bg-[var(--pbl-ai)]/20"
              : phase === "speaking" || tts.speaking
                ? "animate-pulse bg-[var(--pbl-ai)]/15"
                : "bg-transparent"
          }`}
        />

        {/* 小桌与围坐同学：关闭面板时也保持人物常驻 */}
        <span
          className={`relative block h-20 w-32 transition-all duration-300 ${
            isOpen
              ? "translate-y-1 opacity-70"
              : phase === "speaking"
                ? "scale-105"
                : phase === "director"
                  ? "scale-105"
                  : "group-hover:scale-105"
          }`}
        >
          <span className="absolute bottom-1 left-1/2 h-8 w-20 -translate-x-1/2 rounded-[50%] border-2 border-[#9a6b43] bg-[#d7a36c] shadow-lg" />
          {available.slice(0, 4).map((companion, index) => (
            <span key={companion.id} className="absolute origin-bottom" style={{ left: `${8 + index * 28}px`, bottom: index % 2 ? "18px" : "5px", transform: "scale(.58)" }}>
              <ClassmateAvatar color={companion.color} index={index} standing={companion.id === standingSpeaker} />
            </span>
          ))}
          <span className="absolute right-1 top-0 grid h-7 w-7 place-items-center rounded-full bg-[var(--pbl-ai)] text-white shadow-md">
            {phase === "director" ? <Loader2 size={13} className="animate-spin" /> : isOpen ? <X size={13} /> : <MessageSquare size={13} />}
          </span>
        </span>

        {/* 未读计数 */}
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--pbl-danger)] px-1 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}

        {/* 标签 */}
        {!isOpen && (
          <span className="mt-0.5 rounded-full bg-[var(--pbl-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--pbl-text-muted)] shadow-sm opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            伴学圆桌
          </span>
        )}
      </button>

      {/* 动画关键帧 */}
      <style jsx>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </>
  );
}
