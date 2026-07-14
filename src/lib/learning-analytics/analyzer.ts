import type {
  ClassCommonIssue,
  LearningEvent,
  LearningSignal,
  LearningSignalKind,
} from "@/lib/session/types";

export const LEARNING_ANALYTICS_DEFAULTS = {
  dwellRatio: 1.5,
  replayCount: 2,
  idleMs: 180_000,
  noProgressRounds: 3,
  aiAttemptsBeforeEscalation: 2,
  commonRatio: 0.3,
  commonMinStudents: 5,
} as const;

export type ConversationRoundEvidence = { id: string; progressed: boolean };

export type StudentLearningAnalysisInput = {
  events: LearningEvent[];
  expectedDurationSec: number;
  conversationRounds?: ConversationRoundEvidence[];
  aiInterventionAttempts?: number;
  now?: number;
};

export type StudentLearningMetrics = {
  effectiveDurationMs: number;
  expectedDurationMs: number;
  replayCount: number;
  lastActiveAt?: string;
};

export type StudentLearningAnalysis = {
  metrics: StudentLearningMetrics;
  signals: LearningSignal[];
};

const PROGRESS_EVENT_TYPES = new Set<LearningEvent["type"]>([
  "interaction-result",
  "artifact-change",
  "stage-goal-complete",
]);

export function dedupeLearningEvents(events: LearningEvent[]): LearningEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.idempotencyKey)) return false;
    seen.add(event.idempotencyKey);
    return true;
  });
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function makeSignal(input: {
  kind: LearningSignalKind;
  title: string;
  summary: string;
  event: LearningEvent;
  evidenceEventIds: string[];
  aiInterventionAttempts: number;
  nowIso: string;
  baseSeverity: "notice" | "warning";
}): LearningSignal {
  const normalizedIssueKey = [input.kind, input.event.stageKey, input.event.sceneId ?? "stage"].join(":");
  return {
    id: `learning-signal-${slug(input.event.studentId)}-${slug(normalizedIssueKey)}`,
    courseId: input.event.courseId,
    studentId: input.event.studentId,
    stageKey: input.event.stageKey,
    sceneId: input.event.sceneId,
    kind: input.kind,
    severity:
      input.aiInterventionAttempts >= LEARNING_ANALYTICS_DEFAULTS.aiAttemptsBeforeEscalation
        ? "high"
        : input.baseSeverity,
    status: "open",
    title: input.title,
    summary: input.summary,
    normalizedIssueKey,
    evidenceEventIds: input.evidenceEventIds,
    aiInterventionAttempts: input.aiInterventionAttempts,
    firstDetectedAt: input.nowIso,
    lastDetectedAt: input.nowIso,
  };
}

export function analyzeStudentLearning(input: StudentLearningAnalysisInput): StudentLearningAnalysis {
  const events = dedupeLearningEvents(input.events).sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );
  const latest = events.at(-1);
  const now = input.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const attempts = Math.max(0, input.aiInterventionAttempts ?? 0);
  const effectiveDurationMs = events.reduce(
    (sum, event) =>
      event.type === "heartbeat" && event.visible !== false
        ? sum + Math.max(0, event.durationMs ?? 0)
        : sum,
    0,
  );
  const replayEvents = events.filter((event) => event.type === "scene-replay");
  const expectedDurationMs = Math.max(0, input.expectedDurationSec) * 1_000;
  const hasProgress = events.some(
    (event) => PROGRESS_EVENT_TYPES.has(event.type) && event.progressMarker !== "unchanged",
  );
  const signals: LearningSignal[] = [];

  if (latest && expectedDurationMs > 0 && !hasProgress && effectiveDurationMs > expectedDurationMs * LEARNING_ANALYTICS_DEFAULTS.dwellRatio) {
    signals.push(makeSignal({
      kind: "dwell-overrun",
      title: "学习停留时间明显超出设计时长",
      summary: `有效学习 ${Math.round(effectiveDurationMs / 60_000)} 分钟，设计时长 ${Math.round(expectedDurationMs / 60_000)} 分钟，且尚无可观察进展。`,
      event: latest,
      evidenceEventIds: events.filter((event) => event.type === "heartbeat" && event.visible !== false).map((event) => event.id),
      aiInterventionAttempts: attempts,
      nowIso,
      baseSeverity: "warning",
    }));
  }

  if (latest && replayEvents.length >= LEARNING_ANALYTICS_DEFAULTS.replayCount) {
    signals.push(makeSignal({
      kind: "repeated-playback",
      title: "同一内容被重复学习",
      summary: `该内容已重复播放 ${replayEvents.length} 次，建议教师巡视确认是否存在理解困难。`,
      event: latest,
      evidenceEventIds: replayEvents.map((event) => event.id),
      aiInterventionAttempts: attempts,
      nowIso,
      baseSeverity: "notice",
    }));
  }

  if (latest && now - Date.parse(latest.occurredAt) > LEARNING_ANALYTICS_DEFAULTS.idleMs) {
    signals.push(makeSignal({
      kind: "idle",
      title: "学习活动停滞",
      summary: "连续超过 3 分钟没有新的学习行为或产物进展。",
      event: latest,
      evidenceEventIds: [latest.id],
      aiInterventionAttempts: attempts,
      nowIso,
      baseSeverity: "warning",
    }));
  }

  const rounds = input.conversationRounds ?? [];
  const trailingRounds = rounds.slice(-LEARNING_ANALYTICS_DEFAULTS.noProgressRounds);
  if (
    latest &&
    trailingRounds.length === LEARNING_ANALYTICS_DEFAULTS.noProgressRounds &&
    trailingRounds.every((round) => !round.progressed)
  ) {
    signals.push(makeSignal({
      kind: "conversation-no-progress",
      title: "多轮对话没有形成新进展",
      summary: "连续 3 轮对话没有新增事实、选择或产物变化。",
      event: latest,
      evidenceEventIds: trailingRounds.map((round) => round.id),
      aiInterventionAttempts: attempts,
      nowIso,
      baseSeverity: "warning",
    }));
  }

  return {
    metrics: {
      effectiveDurationMs,
      expectedDurationMs,
      replayCount: replayEvents.length,
      lastActiveAt: latest?.occurredAt,
    },
    signals,
  };
}

export function aggregateCommonIssues(
  signals: LearningSignal[],
  totalStudents: number,
): ClassCommonIssue[] {
  if (totalStudents <= 0) return [];
  const groups = new Map<string, LearningSignal[]>();
  for (const signal of signals) {
    if (signal.status !== "open") continue;
    groups.set(signal.normalizedIssueKey, [...(groups.get(signal.normalizedIssueKey) ?? []), signal]);
  }

  return [...groups.entries()].flatMap(([normalizedIssueKey, group]) => {
    const byStudent = new Map(group.map((signal) => [signal.studentId, signal]));
    const affected = [...byStudent.values()];
    const qualifies =
      affected.length >= LEARNING_ANALYTICS_DEFAULTS.commonMinStudents ||
      affected.length / totalStudents >= LEARNING_ANALYTICS_DEFAULTS.commonRatio;
    if (!qualifies) return [];
    const first = affected[0];
    const firstDetectedAt = affected.map((signal) => signal.firstDetectedAt).sort()[0];
    const lastDetectedAt = affected.map((signal) => signal.lastDetectedAt).sort().at(-1) ?? first.lastDetectedAt;
    return [{
      id: `class-issue-${slug(first.courseId)}-${slug(normalizedIssueKey)}`,
      courseId: first.courseId,
      stageKey: first.stageKey,
      normalizedIssueKey,
      title: first.title,
      summary: `${affected.length} 名学生出现同类问题：${first.summary}`,
      severity: affected.some((signal) => signal.severity === "high") ? "high" as const : "warning" as const,
      studentIds: affected.map((signal) => signal.studentId),
      signalIds: affected.map((signal) => signal.id),
      status: "open" as const,
      firstDetectedAt,
      lastDetectedAt,
    }];
  });
}
