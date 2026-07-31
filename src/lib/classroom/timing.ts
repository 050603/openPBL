import {
  normalizePblStageKey,
  type PblModuleTimingPlan,
  type PblProjectMainline,
} from "@/lib/pbl-time-model";

export type ClassroomStageTimingStatus = "pending" | "active" | "completed";
export type ClassroomTimingStatus = "running" | "paused" | "completed";

export type ClassroomStageTiming = {
  stageKey: string;
  label: string;
  basePlannedSec: number;
  adjustmentSec: number;
  elapsedSec: number;
  status: ClassroomStageTimingStatus;
  startedAt?: string;
  completedAt?: string;
};

export type ClassroomTimingState = {
  schemaVersion: 1;
  status: ClassroomTimingStatus;
  sessionStartedAt: string;
  sessionEndedAt?: string;
  activeStageKey?: string;
  lastResumedAt?: string;
  pausedAt?: string;
  stages: ClassroomStageTiming[];
  updatedAt: string;
};

export type ClassroomStageTimingSnapshot = {
  stageKey: string;
  label: string;
  status: ClassroomStageTimingStatus;
  plannedSec: number;
  elapsedSec: number;
  remainingSec: number;
  overrunSec: number;
  progressPercent: number;
};

export type ClassroomTimingSnapshot = {
  status: ClassroomTimingStatus;
  coursePlannedSec: number;
  courseElapsedSec: number;
  courseRemainingSec: number;
  scheduleVarianceSec: number;
  projectedEndAt?: string;
  activeStage?: ClassroomStageTimingSnapshot;
  stages: ClassroomStageTimingSnapshot[];
};

type ClassroomTimingStageInput = {
  key: string;
  label: string;
};

type CreateClassroomTimingStateInput = {
  stages: ReadonlyArray<ClassroomTimingStageInput>;
  totalMinutes: number;
  projectMainline?: PblProjectMainline;
  moduleTimingPlan?: PblModuleTimingPlan;
  activeStageKey?: string;
  now?: string;
};

const MIN_STAGE_SECONDS = 60;

function safeIso(value?: string): string {
  if (value && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

function secondsBetween(from: string | undefined, to: string): number {
  if (!from) return 0;
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.max(0, Math.round((toMs - fromMs) / 1_000));
}

function plannedSeconds(stage: ClassroomStageTiming): number {
  return Math.max(MIN_STAGE_SECONDS, stage.basePlannedSec + stage.adjustmentSec);
}

function distributeIntegerTotal(
  total: number,
  weights: ReadonlyArray<number>,
): number[] {
  if (weights.length === 0) return [];
  const safeTotal = Math.max(0, Math.round(total));
  const safeWeights = weights.map((weight) =>
    Number.isFinite(weight) && weight > 0 ? weight : 0
  );
  const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
  const normalizedWeights = weightTotal > 0
    ? safeWeights
    : safeWeights.map(() => 1);
  const normalizedTotal = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
  const exact = normalizedWeights.map((weight) => safeTotal * weight / normalizedTotal);
  const allocated = exact.map(Math.floor);
  let remainder = safeTotal - allocated.reduce((sum, value) => sum + value, 0);
  const ranked = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; remainder > 0; index += 1, remainder -= 1) {
    allocated[ranked[index % ranked.length]!.index] += 1;
  }
  return allocated;
}

function enforceMinimums(
  allocations: number[],
  total: number,
): number[] {
  const minimum = total >= allocations.length * MIN_STAGE_SECONDS
    ? MIN_STAGE_SECONDS
    : 0;
  if (minimum === 0) return allocations;
  const next = [...allocations];
  let deficit = 0;
  next.forEach((value, index) => {
    if (value >= minimum) return;
    deficit += minimum - value;
    next[index] = minimum;
  });
  while (deficit > 0) {
    const donorIndex = next.reduce(
      (best, value, index) =>
        value > next[best]! && value > minimum ? index : best,
      0,
    );
    const available = Math.max(0, next[donorIndex]! - minimum);
    if (available === 0) break;
    const transfer = Math.min(deficit, available);
    next[donorIndex] -= transfer;
    deficit -= transfer;
  }
  return next;
}

function resolvePlannedSeconds(
  input: CreateClassroomTimingStateInput,
): number[] {
  const courseTotalSec = Math.max(
    input.stages.length,
    Math.round(Math.max(0, input.totalMinutes) * 60),
  );
  const mainlineByStage = new Map(
    (input.projectMainline?.modules ?? []).map((module) => [
      module.stageKey,
      Math.max(0, Math.round(module.durationMin * 60)),
    ]),
  );
  const recommendationByStage = new Map<string, number>();
  for (const allocation of input.moduleTimingPlan?.allocations ?? []) {
    const key = normalizePblStageKey(allocation.stageKey);
    if (!key) continue;
    recommendationByStage.set(
      key,
      (recommendationByStage.get(key) ?? 0)
        + Math.max(0, Math.round(allocation.durationMin * 60)),
    );
  }
  const requested = input.stages.map((stage) => {
    const canonicalKey = normalizePblStageKey(stage.key);
    if (!canonicalKey) return 0;
    return mainlineByStage.get(canonicalKey)
      ?? recommendationByStage.get(canonicalKey)
      ?? 0;
  });
  if (requested.reduce((sum, value) => sum + value, 0) === courseTotalSec) {
    return requested;
  }
  return enforceMinimums(
    distributeIntegerTotal(courseTotalSec, requested),
    courseTotalSec,
  );
}

function liveElapsedSeconds(
  state: ClassroomTimingState,
  stage: ClassroomStageTiming,
  now: string,
): number {
  if (
    stage.status !== "active"
    || state.status !== "running"
    || stage.stageKey !== state.activeStageKey
  ) {
    return stage.elapsedSec;
  }
  return stage.elapsedSec + secondsBetween(state.lastResumedAt, now);
}

function settleActiveStage(
  state: ClassroomTimingState,
  now: string,
): ClassroomTimingState {
  if (state.status !== "running" || !state.activeStageKey) {
    return { ...state, updatedAt: now };
  }
  const deltaSec = secondsBetween(state.lastResumedAt, now);
  return {
    ...state,
    stages: state.stages.map((stage) =>
      stage.stageKey === state.activeStageKey && stage.status === "active"
        ? { ...stage, elapsedSec: stage.elapsedSec + deltaSec }
        : stage
    ),
    lastResumedAt: now,
    updatedAt: now,
  };
}

export function createClassroomTimingState(
  input: CreateClassroomTimingStateInput,
): ClassroomTimingState {
  const now = safeIso(input.now);
  const durations = resolvePlannedSeconds(input);
  const requestedActiveStageKey =
    input.activeStageKey
    && input.stages.some((stage) => stage.key === input.activeStageKey)
      ? input.activeStageKey
      : input.stages[0]?.key;
  return {
    schemaVersion: 1,
    status: input.stages.length ? "running" : "completed",
    sessionStartedAt: now,
    ...(requestedActiveStageKey
      ? {
          activeStageKey: requestedActiveStageKey,
          lastResumedAt: now,
        }
      : { sessionEndedAt: now }),
    stages: input.stages.map((stage, index) => ({
      stageKey: stage.key,
      label: stage.label,
      basePlannedSec: durations[index] ?? MIN_STAGE_SECONDS,
      adjustmentSec: 0,
      elapsedSec: 0,
      status: stage.key === requestedActiveStageKey ? "active" : "pending",
      ...(stage.key === requestedActiveStageKey ? { startedAt: now } : {}),
    })),
    updatedAt: now,
  };
}

export function deriveClassroomTimingSnapshot(
  state: ClassroomTimingState,
  at?: string,
): ClassroomTimingSnapshot {
  const now = safeIso(at);
  const stages = state.stages.map((stage): ClassroomStageTimingSnapshot => {
    const plannedSec = plannedSeconds(stage);
    const elapsedSec = liveElapsedSeconds(state, stage, now);
    return {
      stageKey: stage.stageKey,
      label: stage.label,
      status: stage.status,
      plannedSec,
      elapsedSec,
      remainingSec:
        stage.status === "completed"
          ? 0
          : Math.max(0, plannedSec - elapsedSec),
      overrunSec: Math.max(0, elapsedSec - plannedSec),
      progressPercent:
        stage.status === "completed"
          ? 100
          : Math.min(100, Math.round(elapsedSec / Math.max(1, plannedSec) * 100)),
    };
  });
  const activeStage = stages.find((stage) => stage.stageKey === state.activeStageKey);
  const coursePlannedSec = stages.reduce((sum, stage) => sum + stage.plannedSec, 0);
  const courseElapsedSec = stages.reduce((sum, stage) => sum + stage.elapsedSec, 0);
  const courseRemainingSec = stages.reduce((sum, stage) => sum + stage.remainingSec, 0);
  const completedVarianceSec = stages
    .filter((stage) => stage.status === "completed")
    .reduce((sum, stage) => sum + stage.elapsedSec - stage.plannedSec, 0);
  const activeOverrunSec = activeStage?.overrunSec ?? 0;
  const projectedEndAt =
    state.status === "completed"
      ? state.sessionEndedAt
      : new Date(Date.parse(now) + courseRemainingSec * 1_000).toISOString();
  return {
    status: state.status,
    coursePlannedSec,
    courseElapsedSec,
    courseRemainingSec,
    scheduleVarianceSec: completedVarianceSec + activeOverrunSec,
    ...(projectedEndAt ? { projectedEndAt } : {}),
    ...(activeStage ? { activeStage } : {}),
    stages,
  };
}

export function pauseClassroomTiming(
  state: ClassroomTimingState,
  at?: string,
): ClassroomTimingState {
  if (state.status !== "running") return state;
  const now = safeIso(at);
  const settled = settleActiveStage(state, now);
  return {
    ...settled,
    status: "paused",
    lastResumedAt: undefined,
    pausedAt: now,
    updatedAt: now,
  };
}

export function resumeClassroomTiming(
  state: ClassroomTimingState,
  at?: string,
): ClassroomTimingState {
  if (state.status !== "paused" || !state.activeStageKey) return state;
  const now = safeIso(at);
  return {
    ...state,
    status: "running",
    lastResumedAt: now,
    pausedAt: undefined,
    updatedAt: now,
  };
}

export function transitionClassroomStageTiming(
  state: ClassroomTimingState,
  nextStageKey: string,
  at?: string,
): ClassroomTimingState {
  if (
    state.status === "completed"
    || state.activeStageKey === nextStageKey
    || !state.stages.some((stage) => stage.stageKey === nextStageKey)
  ) {
    return state;
  }
  const now = safeIso(at);
  const settled = settleActiveStage(state, now);
  const currentStageIndex = settled.stages.findIndex(
    (stage) => stage.stageKey === settled.activeStageKey,
  );
  const nextStageIndex = settled.stages.findIndex(
    (stage) => stage.stageKey === nextStageKey,
  );
  return {
    ...settled,
    activeStageKey: nextStageKey,
    ...(settled.status === "running" ? { lastResumedAt: now } : {}),
    stages: settled.stages.map((stage, stageIndex) => {
      if (stage.stageKey === settled.activeStageKey) {
        return { ...stage, status: "completed", completedAt: now };
      }
      if (stage.stageKey === nextStageKey) {
        return {
          ...stage,
          status: "active",
          completedAt: undefined,
          startedAt: stage.startedAt ?? now,
        };
      }
      if (
        nextStageIndex > currentStageIndex
        && stageIndex > currentStageIndex
        && stageIndex < nextStageIndex
        && stage.status === "pending"
      ) {
        return { ...stage, status: "completed", completedAt: now };
      }
      return stage;
    }),
    updatedAt: now,
  };
}

function reducePendingStages(
  stages: ClassroomStageTiming[],
  indexes: number[],
  reductionSec: number,
): void {
  const capacities = indexes.map((index) =>
    Math.max(0, plannedSeconds(stages[index]!) - MIN_STAGE_SECONDS)
  );
  const totalCapacity = capacities.reduce((sum, value) => sum + value, 0);
  let remaining = Math.min(reductionSec, totalCapacity);
  if (remaining <= 0) return;
  const targetReduction = remaining;
  const reductions = capacities.map((capacity) =>
    Math.min(capacity, Math.floor(targetReduction * capacity / totalCapacity))
  );
  remaining -= reductions.reduce((sum, value) => sum + value, 0);
  for (let cursor = 0; remaining > 0; cursor += 1) {
    const index = cursor % indexes.length;
    if (reductions[index]! >= capacities[index]!) continue;
    reductions[index] += 1;
    remaining -= 1;
  }
  indexes.forEach((stageIndex, index) => {
    stages[stageIndex] = {
      ...stages[stageIndex]!,
      adjustmentSec: stages[stageIndex]!.adjustmentSec - reductions[index]!,
    };
  });
}

function extendPendingStages(
  stages: ClassroomStageTiming[],
  indexes: number[],
  extensionSec: number,
): void {
  if (indexes.length === 0 || extensionSec <= 0) return;
  const additions = distributeIntegerTotal(
    extensionSec,
    indexes.map((index) => plannedSeconds(stages[index]!)),
  );
  indexes.forEach((stageIndex, index) => {
    stages[stageIndex] = {
      ...stages[stageIndex]!,
      adjustmentSec: stages[stageIndex]!.adjustmentSec + additions[index]!,
    };
  });
}

export function adjustClassroomStageTiming(
  state: ClassroomTimingState,
  stageKey: string,
  deltaSec: number,
  options: { preserveCourseTotal?: boolean } = {},
): ClassroomTimingState {
  if (!Number.isFinite(deltaSec) || deltaSec === 0 || state.status === "completed") {
    return state;
  }
  const stages = state.stages.map((stage) => ({ ...stage }));
  const stageIndex = stages.findIndex((stage) => stage.stageKey === stageKey);
  if (stageIndex < 0 || stages[stageIndex]!.status === "completed") return state;
  const target = stages[stageIndex]!;
  const currentPlannedSec = plannedSeconds(target);
  const nextPlannedSec = Math.max(
    MIN_STAGE_SECONDS,
    currentPlannedSec + Math.round(deltaSec),
  );
  const appliedDeltaSec = nextPlannedSec - currentPlannedSec;
  if (appliedDeltaSec === 0) return state;
  stages[stageIndex] = {
    ...target,
    adjustmentSec: target.adjustmentSec + appliedDeltaSec,
  };

  if (options.preserveCourseTotal !== false) {
    const pendingIndexes = stages.flatMap((stage, index) =>
      index !== stageIndex && stage.status === "pending" ? [index] : []
    );
    if (appliedDeltaSec > 0) {
      reducePendingStages(stages, pendingIndexes, appliedDeltaSec);
    } else {
      extendPendingStages(stages, pendingIndexes, -appliedDeltaSec);
    }
  }
  return {
    ...state,
    stages,
    updatedAt: new Date().toISOString(),
  };
}

export function resetActiveClassroomStageTiming(
  state: ClassroomTimingState,
  at?: string,
): ClassroomTimingState {
  if (!state.activeStageKey || state.status === "completed") return state;
  const now = safeIso(at);
  return {
    ...state,
    ...(state.status === "running" ? { lastResumedAt: now } : {}),
    stages: state.stages.map((stage) =>
      stage.stageKey === state.activeStageKey
        ? {
            ...stage,
            elapsedSec: 0,
            startedAt: now,
          }
        : stage
    ),
    updatedAt: now,
  };
}

export function completeClassroomTiming(
  state: ClassroomTimingState,
  at?: string,
): ClassroomTimingState {
  if (state.status === "completed") return state;
  const now = safeIso(at);
  const settled = settleActiveStage(state, now);
  const activeStageKey = settled.activeStageKey;
  return {
    ...settled,
    status: "completed",
    sessionEndedAt: now,
    activeStageKey: undefined,
    lastResumedAt: undefined,
    pausedAt: undefined,
    stages: settled.stages.map((stage) =>
      stage.stageKey === activeStageKey
        ? { ...stage, status: "completed", completedAt: now }
        : stage
    ),
    updatedAt: now,
  };
}
