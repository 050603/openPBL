import type { Course, ProjectGroup, Stage } from "@/lib/session/types";

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
  kind: "shared-misconception" | "uneven-participation" | "off-target" | "over-generation" | "ethics" | "low-confidence" | "stalled";
  title: string;
  whatHappened: string;
  evidence: string[];
  targetType: "student" | "group" | "course";
  targetIds: string[];
  suggestedAction: string;
  confidence: "medium" | "high";
};

function isProposalComplete(group: ProjectGroup): boolean {
  const proposal = group.proposal;
  if (!proposal) return Boolean(group.topic.trim() && group.goal?.trim() && group.members.length);
  return Boolean(
    proposal.projectQuestion.trim()
    && proposal.outcomeFormat.trim()
    && proposal.implementationPlan.trim()
    && proposal.requiredKnowledge.length
    && proposal.aiUsePlan.trim()
    && group.members.length,
  );
}

function activeGroupIds(course: Course): string[] {
  if (course.classConfig?.groupMode === "none") return [course.id];
  if (course.classConfig?.groupMode === "solo") return course.students.map((student) => student.id);
  return (course.groups ?? []).filter((group) => group.members.length > 0).map((group) => group.id);
}

export function evaluateStageGate(course: Course, stageIndex = course.currentStageIndex): StageGateResult {
  const stage = course.stages[stageIndex] ?? course.stages[0];
  const blockers: StageGateItem[] = [];
  const warnings: StageGateItem[] = [];
  const completed: string[] = [];
  const groupIds = activeGroupIds(course);

  if (stage.key === "launch") {
    if (!course.summary.trim() || !course.drivingQuestion.trim()) blockers.push({ code: "project-brief", message: "项目说明和驱动问题需要完整", targetIds: [course.id] });
    else completed.push("项目说明与驱动问题已完整");
    if (!course.students.length) blockers.push({ code: "participants", message: "至少需要一名学生进入课堂", targetIds: [] });
    else completed.push(`${course.students.length} 名学生已进入课堂`);
  }

  if (stage.key === "ai-learning") {
    const hasAiContent = Boolean(course.aiLearningClassroomId || course.content._openmaicClassroomId || course.content._openmaicSceneOutlines?.length);
    if (!hasAiContent) blockers.push({ code: "ai-content", message: "AI 授知内容尚未生成或关联", targetIds: [course.id] });
    else completed.push("AI 授知内容可用");
    const unmet = Object.entries(course.aiLearningProgress ?? {}).filter(([, progress]) => progress.unmetGoals?.length || progress.masteryLevel === "not-started").map(([studentId]) => studentId);
    if (unmet.length) warnings.push({ code: "unmet-goals", message: `${unmet.length} 名学生仍有未达成目标，需要教师处理或说明覆盖`, targetIds: unmet });
  }

  if (stage.key === "group") {
    if (!groupIds.length) blockers.push({ code: "groups", message: "尚未形成可继续推进的个人或小组项目", targetIds: [] });
    const incomplete = course.classConfig?.groupMode === "none" || course.classConfig?.groupMode === "solo"
      ? groupIds.filter((id) => !(course.submissions ?? []).some((item) => (item.groupId === id || item.studentId === id || item.courseId === id) && ["idea", "plan"].includes(item.type)))
      : (course.groups ?? []).filter((group) => group.members.length && !isProposalComplete(group)).map((group) => group.id);
    if (incomplete.length) blockers.push({ code: "proposal-fields", message: `${incomplete.length} 个项目尚未完整填写核心方案与分工`, targetIds: incomplete });
    else if (groupIds.length) completed.push("所有项目核心方案字段已完整");
  }

  if (stage.key === "review") {
    const pending = (course.groups ?? []).filter((group) => group.members.length && group.teacherApproval?.status !== "approved").map((group) => group.id);
    if (pending.length) blockers.push({ code: "teacher-approval", message: `${pending.length} 个小组尚未获得教师最终批准`, targetIds: pending });
    else completed.push("所有有效小组已获得教师批准");
    const openFeedback = (course.feedback ?? []).filter((item) => item.stageKey === "review" && item.status !== "resolved").map((item) => item.targetId);
    if (openFeedback.length) warnings.push({ code: "open-feedback", message: "仍有反馈尚未回应", targetIds: [...new Set(openFeedback)] });
  }

  if (stage.key === "make") {
    const noArtifact = groupIds.filter((id) => !(course.uploads ?? []).some((item) => item.groupId === id && item.category === "artifact") && !(course.submissions ?? []).some((item) => item.groupId === id && ["document", "evidence"].includes(item.type)));
    if (noArtifact.length) blockers.push({ code: "artifact", message: `${noArtifact.length} 个项目还没有作品版本或过程证据`, targetIds: noArtifact });
    const highRisk = (course.teacherInterventions ?? []).filter((item) => item.stageKey === "make" && item.severity === "high" && item.status === "open");
    if (highRisk.length) blockers.push({ code: "high-risk", message: `${highRisk.length} 个高风险问题尚未处理`, targetIds: highRisk.flatMap((item) => item.targetIds) });
    if (!noArtifact.length && !highRisk.length) completed.push("作品版本、过程证据与高风险检查已完成");
  }

  if (stage.key === "showcase") {
    const unfinished = groupIds.filter((id) => !(course.uploads ?? []).some((item) => item.groupId === id && item.category === "presentation") && !(course.submissions ?? []).some((item) => item.groupId === id && item.type === "showcase"));
    if (unfinished.length) blockers.push({ code: "presentation", message: `${unfinished.length} 个项目尚未完成最终汇报`, targetIds: unfinished });
    else completed.push("所有有效项目已完成汇报");
  }

  if (stage.key === "reflection") {
    const missingReflections = course.students.filter((student) => !(course.reflections ?? []).some((item) => item.studentId === student.id)).map((student) => student.id);
    const unconfirmed = (course.evaluations ?? []).filter((item) => item.status !== "confirmed").map((item) => item.targetId);
    if (missingReflections.length) warnings.push({ code: "reflection", message: `${missingReflections.length} 名学生尚未完成反思`, targetIds: missingReflections });
    if (unconfirmed.length) warnings.push({ code: "evaluation", message: "仍有多元评价等待教师确认", targetIds: [...new Set(unconfirmed)] });
    completed.push("这是课程终态，结束前请检查评价与反思");
  }

  return { canAdvance: blockers.length === 0, stage, blockers, warnings, completed };
}

export function detectInterventionSignals(course: Course, now = Date.now()): InterventionSignal[] {
  const signals: InterventionSignal[] = [];
  const progress = Object.entries(course.aiLearningProgress ?? {});
  const misconception = new Map<string, string[]>();
  progress.forEach(([studentId, item]) => item.unmetGoals?.forEach((goal) => misconception.set(goal, [...(misconception.get(goal) ?? []), studentId])));
  misconception.forEach((studentIds, goal) => {
    if (studentIds.length >= 2) signals.push({ id: `misconception:${goal}`, kind: "shared-misconception", title: "共性知识目标持续未达成", whatHappened: `${studentIds.length} 名学生在“${goal}”上仍未达标`, evidence: studentIds.map((id) => `${id}：目标未达成`), targetType: "student", targetIds: studentIds, suggestedAction: "向全班补充一个对比案例，并要求学生重新解释判断依据", confidence: "high" });
  });

  (course.groups ?? []).forEach((group) => {
    const contribution = (course.teamContributions ?? []).filter((item) => item.groupId === group.id).map((item) => item.percent);
    if (contribution.length >= 2 && Math.max(...contribution) - Math.min(...contribution) >= 45) signals.push({ id: `participation:${group.id}`, kind: "uneven-participation", title: "小组分工明显不均", whatHappened: `${group.name} 的成员贡献差距达到 ${Math.max(...contribution) - Math.min(...contribution)}%`, evidence: contribution.map((value, index) => `成员 ${index + 1}：${value}%`), targetType: "group", targetIds: [group.id], suggestedAction: "检查任务分工，重新分配可验证的阶段产出", confidence: "high" });
    const lastProgress = new Date(group.updatedAt).getTime();
    const hasProgress = (course.workPlan ?? []).some((item) => item.groupId === group.id && item.progress > 0);
    if (!hasProgress && now - lastProgress > 30 * 60 * 1000) signals.push({ id: `stalled:${group.id}`, kind: "stalled", title: "小组长时间无实质进展", whatHappened: `${group.name} 超过 30 分钟没有任务进度`, evidence: [`最后更新：${group.updatedAt}`, "任务进度均为 0"], targetType: "group", targetIds: [group.id], suggestedAction: "缩小下一步任务并约定一个十分钟内可提交的中间成果", confidence: "high" });
  });

  const supportText = (course.aiSupports ?? []).map((item) => `${item.id}|${item.groupId ?? item.targetId}|${item.trigger}|${item.diagnosis}|${item.evidence.join(" ")}`);
  const addSupportSignal = (pattern: RegExp, kind: InterventionSignal["kind"], title: string, action: string, confidence: InterventionSignal["confidence"] = "medium") => {
    supportText.filter((text) => pattern.test(text)).forEach((text) => {
      const [id, targetId, ...evidence] = text.split("|");
      signals.push({ id: `${kind}:${id}`, kind, title, whatHappened: evidence.slice(0, 2).join("；"), evidence, targetType: targetId === course.id ? "course" : "group", targetIds: [targetId], suggestedAction: action, confidence });
    });
  };
  addSupportSignal(/偏离|无关|教学目标不一致/, "off-target", "项目可能偏离教学目标", "与小组共同核对驱动问题，修改项目范围或成果要求");
  addSupportSignal(/完整生成|直接答案|代写|全部完成/, "over-generation", "学生连续要求 AI 完整生成", "暂停高影响生成，要求学生先提交草稿和自己的判断", "high");
  addSupportSignal(/伦理|价值|公平|隐私|现实争议/, "ethics", "项目涉及伦理或价值判断", "组织教师引导的讨论，明确事实、立场与价值判断的边界");
  addSupportSignal(/不确定|置信度低|证据不足|无法判断/, "low-confidence", "AI 对当前问题把握不足", "由教师核查证据并决定是否补充来源或调整任务");
  return signals.filter((signal, index, all) => all.findIndex((item) => item.id === signal.id) === index);
}
