import type { Course, Stage } from "@/lib/session/types";
import { isReliableAiProgress } from "@openmaic/lib/progress/completion-model";
import { deriveStageReadiness } from "@/lib/learning-evidence/readiness";
import { isReadyMadeDeliverableRequest } from "@/lib/learning-evidence/ai-policy";

export type StageGateItem = {
  code: string;
  message: string;
  targetIds: string[];
};

export type StageGateResult = {
  canAdvance: boolean;
  stage: Stage;
  blockers: StageGateItem[];
  warnings: StageGateItem[];
  completed: string[];
};

export type InterventionSignal = {
  id: string;
  kind: "shared-misconception" | "off-target" | "over-generation" | "ethics" | "low-confidence" | "stalled";
  title: string;
  whatHappened: string;
  evidence: string[];
  targetType: "student" | "group" | "course";
  targetIds: string[];
  suggestedAction: string;
  confidence: "medium" | "high";
  stageKey?: string;
  contentLocation?: string;
};

export function evaluateStageGate(course: Course, stageIndex = course.currentStageIndex): StageGateResult {
  const stage = course.stages[stageIndex] ?? course.stages[0];
  const blockers: StageGateItem[] = [];
  const warnings: StageGateItem[] = [];
  const completed: string[] = [];

  if (stage.key === "launch") {
    if (!course.summary.trim() || !course.drivingQuestion.trim()) blockers.push({ code: "project-brief", message: "项目说明和驱动问题需要完整", targetIds: [course.id] });
    else completed.push("项目说明与驱动问题已完整");
    if (!course.students.length) blockers.push({ code: "participants", message: "至少需要一名学生进入课堂", targetIds: [] });
    else completed.push(`${course.students.length} 名学生已进入课堂`);
    const readiness = course.students.map((student) =>
      deriveStageReadiness(course, student.id, stage.key));
    const missingIntent = readiness
      .filter((item) => item.status === "not-started" || item.status === "working")
      .map((item) => item.studentId);
    const waitingCalibration = readiness
      .filter((item) => item.status === "awaiting-calibration")
      .map((item) => item.studentId);
    const needsRevision = readiness
      .filter((item) => item.status === "needs-revision")
      .map((item) => item.studentId);
    if (missingIntent.length) blockers.push({ code: "launch-selection", message: `${missingIntent.length} 名学生尚未完成资料查阅或选择研究方向`, targetIds: missingIntent });
    if (waitingCalibration.length) blockers.push({ code: "launch-selection", message: `${waitingCalibration.length} 名学生尚未完成研究方向选择`, targetIds: waitingCalibration });
    if (needsRevision.length) blockers.push({ code: "launch-selection", message: `${needsRevision.length} 名学生需要重新选择研究方向`, targetIds: needsRevision });
    if (readiness.length && readiness.every((item) => item.status === "ready")) completed.push("所有学生均已了解课程并选定研究方向");
  }

  if (stage.key === "ai-learning") {
    const hasAiContent = Boolean(course.aiLearningClassroomId || course.content._openmaicClassroomId || course.content._openmaicSceneOutlines?.length);
    if (!hasAiContent) blockers.push({ code: "ai-content", message: "AI 授知内容尚未生成或关联", targetIds: [course.id] });
    else completed.push("AI 授知内容可用");
    const unmet = Object.entries(course.aiLearningProgress ?? {})
      .filter(([, progress]) =>
        !isReliableAiProgress(progress) ||
        progress.unmetGoals?.length ||
        progress.masteryLevel === "not-started",
      )
      .map(([studentId]) => studentId);
    if (unmet.length) warnings.push({ code: "unmet-goals", message: `${unmet.length} 名学生仍有未达成目标，需要教师处理或说明覆盖`, targetIds: unmet });
  }

  if (stage.key === "proposal") {
    const readiness = course.students.map((student) =>
      deriveStageReadiness(course, student.id, stage.key));
    const incomplete = readiness
      .filter((item) => item.status === "not-started" || item.status === "working")
      .map((item) => item.studentId);
    const pending = readiness
      .filter((item) => item.status === "awaiting-calibration")
      .map((item) => item.studentId);
    const revision = readiness
      .filter((item) => item.status === "needs-revision")
      .map((item) => item.studentId);
    if (incomplete.length) blockers.push({ code: "proposal-evidence", message: `${incomplete.length} 名学生尚未形成可实施、可验证的项目方案`, targetIds: incomplete });
    if (pending.length) blockers.push({ code: "teacher-approval", message: `${pending.length} 名学生的方案等待教师校准`, targetIds: pending });
    if (revision.length) blockers.push({ code: "proposal-revision", message: `${revision.length} 名学生的方案需要修订`, targetIds: revision });
    if (readiness.length && readiness.every((item) => item.status === "ready")) completed.push("所有个人项目方案均已由教师确认");
    const openFeedback = (course.feedback ?? []).filter((item) => ["proposal", "review"].includes(item.stageKey) && item.status !== "resolved").map((item) => item.targetId);
    if (openFeedback.length) warnings.push({ code: "open-feedback", message: "仍有反馈尚未回应", targetIds: [...new Set(openFeedback)] });
  }

  if (stage.key === "make") {
    const readiness = course.students.map((student) =>
      deriveStageReadiness(course, student.id, stage.key));
    const incompleteReadiness = readiness.filter((item) => item.status !== "ready");
    const incomplete = incompleteReadiness.map((item) => item.studentId);
    if (incomplete.length) {
      const missingArtifact = incompleteReadiness.filter((item) =>
        item.checks.some((check) => check.id === "make-artifact-version" && !check.satisfied)
      ).length;
      const missingProcessDraft = incompleteReadiness.filter((item) =>
        item.checks.some((check) => check.id === "make-process-draft" && !check.satisfied)
      ).length;
      const details = [
        ...(missingArtifact ? [`${missingArtifact} 名尚未提交可查看作品`] : []),
        ...(missingProcessDraft ? [`${missingProcessDraft} 名尚未保存作品制作进展`] : []),
      ];
      blockers.push({
        code: "iteration-evidence",
        message: details.join("；") || `${incomplete.length} 名学生的制作证据尚未完成`,
        targetIds: incomplete,
      });
    }
    const highRisk = (course.teacherInterventions ?? []).filter((item) => item.stageKey === "make" && item.severity === "high" && item.status === "open");
    if (highRisk.length) blockers.push({ code: "high-risk", message: `${highRisk.length} 个高风险问题尚未处理`, targetIds: highRisk.flatMap((item) => item.targetIds) });
    if (!incomplete.length && !highRisk.length && readiness.length) completed.push("所有学生均已提交作品");
  }

  if (stage.key === "showcase") {
    const readiness = course.students.map((student) =>
      deriveStageReadiness(course, student.id, stage.key));
    const incomplete = readiness
      .filter((item) => item.status === "not-started" || item.status === "working")
      .map((item) => item.studentId);
    const waitingTeacher = readiness
      .filter((item) => item.status === "awaiting-calibration")
      .map((item) => item.studentId);
    const revision = readiness
      .filter((item) => item.status === "needs-revision")
      .map((item) => item.studentId);
    if (incomplete.length) blockers.push({ code: "showcase-evidence", message: `${incomplete.length} 名学生尚未在成果工作台提交展示材料`, targetIds: incomplete });
    if (waitingTeacher.length) blockers.push({ code: "showcase-evaluation", message: `${waitingTeacher.length} 名学生等待教师现场评价`, targetIds: waitingTeacher });
    if (revision.length) blockers.push({ code: "showcase-revision", message: `${revision.length} 名学生的展示材料需要修订`, targetIds: revision });
    const pendingAi = course.students.filter((student) => {
      const suggestions = (course.aiAssessmentSuggestions ?? []).filter(
        (item) => item.studentId === student.id && item.stageKey === "showcase",
      );
      return suggestions.some((item) =>
        item.status === "pending-teacher-confirmation");
    }).map((student) => student.id);
    if (pendingAi.length) warnings.push({ code: "ai-assessment-pending", message: `${pendingAi.length} 名学生有 AI 评价建议等待教师确认；未确认建议不计分`, targetIds: pendingAi });
    if (readiness.length && readiness.every((item) => item.status === "ready")) completed.push("所有学生均已提交成果并完成教师现场评价");
  }

  if (stage.key === "reflection") {
    const missingReflections = course.students
      .map((student) => deriveStageReadiness(course, student.id, stage.key))
      .filter((item) => item.status !== "ready")
      .map((item) => item.studentId);
    const unconfirmed = (course.aiAssessmentSuggestions ?? [])
      .filter((item) => item.status === "pending-teacher-confirmation")
      .map((item) => item.studentId);
    if (missingReflections.length) warnings.push({ code: "reflection", message: `${missingReflections.length} 名学生尚未完成反思`, targetIds: missingReflections });
    if (unconfirmed.length) warnings.push({ code: "evaluation", message: "仍有多元评价等待教师确认", targetIds: [...new Set(unconfirmed)] });
    completed.push("这是课程终态，结束前请检查评价与反思");
  }

  return { canAdvance: blockers.length === 0, stage, blockers, warnings, completed };
}

export function detectInterventionSignals(course: Course): InterventionSignal[] {
  const signals: InterventionSignal[] = [];
  const resolvedIds = new Set(course.resolvedInterventionSignalIds ?? []);
  const progress = Object.entries(course.aiLearningProgress ?? {});
  const activeStageKey = course.stages[course.currentStageIndex]?.key;
  const misconception = new Map<string, string[]>();
  progress.forEach(([studentId, item]) => item.unmetGoals?.forEach((goal) => misconception.set(goal, [...(misconception.get(goal) ?? []), studentId])));
  misconception.forEach((studentIds, goal) => {
    const population = Math.max(course.students.length, progress.length);
    if (population < 2) return;
    const required = Math.min(population, Math.max(2, Math.ceil(population * 0.3)));
    if (studentIds.length >= required) signals.push({ id: `misconception:${goal}`, kind: "shared-misconception", title: "共性知识目标持续未达成", whatHappened: `${studentIds.length} 名学生在知识点“${goal}”上仍未达标`, evidence: studentIds.map((id) => `${course.students.find((student) => student.id === id)?.name ?? "未识别学生"}：目标未达成`), targetType: "student", targetIds: studentIds, suggestedAction: "向全班补充一个对比案例，并要求学生重新解释判断依据", confidence: "high", stageKey: "ai-learning", contentLocation: `知识点：${goal}` });
  });

  // Runtime telemetry may trigger timely support, but never contributes to
  // readiness or scoring. The detector consumes only the retained signal
  // records instead of inferring learning from page time or save counts.
  (course.learningSignals ?? [])
    .filter((item) =>
      item.stageKey === activeStageKey
      && item.status === "open"
      && ["idle", "conversation-no-progress", "goal-stalled"].includes(item.kind))
    .forEach((item) => {
      const studentName = course.students.find((student) =>
        student.id === item.studentId)?.name ?? item.studentId;
      signals.push({
        id: `operational:${item.id}`,
        kind: "stalled",
        title: "学生可能需要即时支援",
        whatHappened: `${studentName} 出现“${item.title}”运行信号；该信号只提示教师查看，不代表学习质量低。`,
        evidence: [
          `运行信号 ${item.id}：${item.summary}`,
          ...item.evidenceEventIds.map((id) => `运行事件 ${id}`),
        ],
        targetType: "student",
        targetIds: [item.studentId],
        suggestedAction: "先查看学生最近的有效产物和证据缺口，再帮助其缩小为一个可立即完成的动作。",
        confidence: item.severity === "high" ? "high" : "medium",
        stageKey: item.stageKey,
        contentLocation: item.content?.activityTitle ?? item.content?.sceneTitle,
      });
    });

  // Ready-made deliverable requests and high-impact suggestions without a
  // student seed are audit-backed support signals, not negative marks.
  (course.aiContributions ?? [])
    .filter((item) =>
      item.stageKey === activeStageKey
      && (
        isReadyMadeDeliverableRequest(item.request)
        || (item.impact === "high" && item.sourceEvidenceIds.length === 0)
      ))
    .forEach((item) => {
      signals.push({
        id: `over-generation:${item.id}`,
        kind: "over-generation",
        title: "高影响 AI 请求需要学生先提供种子产物",
        whatHappened: "系统记录到完整代做请求，或一条没有学生证据来源的高影响建议。",
        evidence: [
          `AI 建议记录 ${item.id}`,
          item.sourceEvidenceIds.length
            ? `关联学生证据：${item.sourceEvidenceIds.join("、")}`
            : "未关联学生种子证据",
        ],
        targetType: "student",
        targetIds: [item.studentId],
        suggestedAction: "要求学生先提交自己的想法、草稿或测试结果，再让 AI 提供局部反馈。",
        confidence: "high",
        stageKey: item.stageKey,
      });
    });

  const revisionPatterns: Array<{
    kind: "off-target" | "ethics";
    pattern: RegExp;
    title: string;
    suggestedAction: string;
  }> = [
    {
      kind: "off-target",
      pattern: /偏离|离题|目标不一致|范围不当|off[- ]?target/i,
      title: "教师反馈指出项目方向需要校准",
      suggestedAction: "与学生重新核对驱动问题、成功标准和项目范围，再提交修订版本。",
    },
    {
      kind: "ethics",
      pattern: /伦理|隐私|安全|公平|价值冲突|ethic|privacy|safety/i,
      title: "教师反馈指出伦理、安全或隐私问题",
      suggestedAction: "暂停相关实施动作，先明确数据边界、风险控制和教师要求。",
    },
  ];
  (course.learningEvidence ?? [])
    .filter((item) =>
      item.stageKey === activeStageKey
      && item.status === "needs-revision"
      && Boolean(item.teacherFeedback?.trim()))
    .forEach((item) => {
      revisionPatterns
        .filter(({ pattern }) => pattern.test(item.teacherFeedback ?? ""))
        .forEach(({ kind, title, suggestedAction }) => {
          signals.push({
            id: `${kind}:${item.id}`,
            kind,
            title,
            whatHappened: item.teacherFeedback ?? "教师要求修订该证据。",
            evidence: [`学习证据 ${item.id}`, `教师反馈：${item.teacherFeedback}`],
            targetType: "student",
            targetIds: [item.studentId],
            suggestedAction,
            confidence: "high",
            stageKey: item.stageKey,
            contentLocation: item.title,
          });
        });
    });

  (course.aiAssessmentSuggestions ?? [])
    .filter((item) =>
      item.stageKey === activeStageKey
      && (
        item.status === "insufficient-evidence"
        || item.confidence === "low"
        || item.evidenceGaps.length > 0
      ))
    .forEach((item) => {
      signals.push({
        id: `assessment-gap:${item.id}`,
        kind: "low-confidence",
        title: "AI 评价建议存在证据缺口",
        whatHappened: item.evidenceGaps.length
          ? item.evidenceGaps.join("；")
          : "当前证据不足以形成稳定评价建议。",
        evidence: [
          `AI 评价建议 ${item.id}`,
          ...item.evidenceIds.map((id) => `引用证据 ${id}`),
        ],
        targetType: "student",
        targetIds: [item.studentId],
        suggestedAction: "教师先检查所列证据及缺口；证据不足的维度记 0 分，并可补充指导让 AI 重新评分后再确认。",
        confidence: "high",
        stageKey: item.stageKey,
      });
    });

  const selectedSnapshotIds = new Map<string, string>();
  (course.learningEvidence ?? [])
    .filter((item) =>
      item.stageKey === activeStageKey
      && item.status !== "draft")
    .forEach((item) => {
      const payloadSnapshotId = (item.payload as { snapshotId?: unknown }).snapshotId;
      const snapshotIds = [
        ...item.artifactSnapshotIds,
        ...(typeof payloadSnapshotId === "string" ? [payloadSnapshotId] : []),
      ];
      snapshotIds.forEach((snapshotId) =>
        selectedSnapshotIds.set(snapshotId, item.id));
    });
  (course.artifactSnapshots ?? [])
    .filter((item) =>
      item.stageKey === activeStageKey
      && selectedSnapshotIds.has(item.id)
      && ["metadata-only", "unsupported"].includes(item.inspectionStatus))
    .forEach((item) => {
      signals.push({
        id: `snapshot-uninspectable:${item.id}`,
        kind: "low-confidence",
        title: "已提交证据引用了不可检查的文件快照",
        whatHappened: `快照“${item.title}”只有文件元数据，系统和 AI 均不能据此判断作品内容。`,
        evidence: [
          `作品快照 ${item.id}`,
          `引用证据 ${selectedSnapshotIds.get(item.id)}`,
        ],
        targetType: "student",
        targetIds: [item.studentId],
        suggestedAction: "请学生补充真实内容摘录或定位标注；不要把上传成功当作任务完成。",
        confidence: "high",
        stageKey: item.stageKey,
        contentLocation: item.title,
      });
    });

  return signals.filter((signal, index, all) => !resolvedIds.has(signal.id) && all.findIndex((item) => item.id === signal.id) === index);
}
