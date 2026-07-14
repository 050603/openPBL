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
  kind: "shared-misconception" | "off-target" | "over-generation" | "ethics" | "low-confidence" | "stalled";
  title: string;
  whatHappened: string;
  evidence: string[];
  targetType: "student" | "group" | "course";
  targetIds: string[];
  suggestedAction: string;
  confidence: "medium" | "high";
  stageKey?: string;
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

function projectForStudent(course: Course, studentId: string): ProjectGroup | undefined {
  return (course.groups ?? []).find((project) => project.members.some((member) => member.studentId === studentId));
}

function activeProjectIds(course: Course): string[] {
  return course.students.map((student) => projectForStudent(course, student.id)?.id ?? student.id);
}

export function evaluateStageGate(course: Course, stageIndex = course.currentStageIndex): StageGateResult {
  const stage = course.stages[stageIndex] ?? course.stages[0];
  const blockers: StageGateItem[] = [];
  const warnings: StageGateItem[] = [];
  const completed: string[] = [];
  const projectIds = activeProjectIds(course);

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

  if (stage.key === "proposal") {
    const incomplete = course.students.filter((student) => {
      const project = projectForStudent(course, student.id);
      const hasSubmission = (course.submissions ?? []).some((item) =>
        (item.studentId === student.id || item.groupId === project?.id) && ["idea", "plan"].includes(item.type));
      return !hasSubmission && (!project || !isProposalComplete(project));
    }).map((student) => student.id);
    if (incomplete.length) blockers.push({ code: "proposal-fields", message: `${incomplete.length} 名学生尚未完整填写个人项目方案`, targetIds: incomplete });
    else if (course.students.length) completed.push("所有学生的个人项目方案已完整");
    const pending = course.students.filter((student) => projectForStudent(course, student.id)?.teacherApproval?.status !== "approved").map((student) => student.id);
    if (pending.length) blockers.push({ code: "teacher-approval", message: `${pending.length} 名学生的项目方向尚未获得教师确认`, targetIds: pending });
    else if (course.students.length) completed.push("所有个人项目方向已由教师确认");
    const openFeedback = (course.feedback ?? []).filter((item) => ["proposal", "review"].includes(item.stageKey) && item.status !== "resolved").map((item) => item.targetId);
    if (openFeedback.length) warnings.push({ code: "open-feedback", message: "仍有反馈尚未回应", targetIds: [...new Set(openFeedback)] });
  }

  if (stage.key === "make") {
    const noArtifact = course.students.filter((student) => {
      const projectId = projectForStudent(course, student.id)?.id;
      return !(course.uploads ?? []).some((item) => (item.studentId === student.id || item.groupId === projectId) && item.category === "artifact")
        && !(course.submissions ?? []).some((item) => (item.studentId === student.id || item.groupId === projectId) && ["document", "evidence"].includes(item.type));
    }).map((student) => student.id);
    if (noArtifact.length) blockers.push({ code: "artifact", message: `${noArtifact.length} 个项目还没有作品版本或过程证据`, targetIds: noArtifact });
    const highRisk = (course.teacherInterventions ?? []).filter((item) => item.stageKey === "make" && item.severity === "high" && item.status === "open");
    if (highRisk.length) blockers.push({ code: "high-risk", message: `${highRisk.length} 个高风险问题尚未处理`, targetIds: highRisk.flatMap((item) => item.targetIds) });
    if (!noArtifact.length && !highRisk.length) completed.push("作品版本、过程证据与高风险检查已完成");
  }

  if (stage.key === "showcase") {
    const unfinished = course.students.filter((student) => {
      const projectId = projectForStudent(course, student.id)?.id;
      return !(course.uploads ?? []).some((item) => (item.studentId === student.id || item.groupId === projectId) && item.category === "presentation")
        && !(course.submissions ?? []).some((item) => (item.studentId === student.id || item.groupId === projectId) && item.type === "showcase");
    }).map((student) => student.id);
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
  const resolvedIds = new Set(course.resolvedInterventionSignalIds ?? []);
  const progress = Object.entries(course.aiLearningProgress ?? {});
  const misconception = new Map<string, string[]>();
  progress.forEach(([studentId, item]) => item.unmetGoals?.forEach((goal) => misconception.set(goal, [...(misconception.get(goal) ?? []), studentId])));
  misconception.forEach((studentIds, goal) => {
    if (studentIds.length >= 2) signals.push({ id: `misconception:${goal}`, kind: "shared-misconception", title: "共性知识目标持续未达成", whatHappened: `${studentIds.length} 名学生在“${goal}”上仍未达标`, evidence: studentIds.map((id) => `${id}：目标未达成`), targetType: "student", targetIds: studentIds, suggestedAction: "向全班补充一个对比案例，并要求学生重新解释判断依据", confidence: "high", stageKey: "ai-learning" });
  });

  // ===== 阶段三（方案构思）风险信号 =====
  // 检测学生在方案构思阶段的风险：未开始、无 AI 互动、方案过简、长期未确认
  const proposalStage = course.stages.find((s) => s.key === "proposal");
  if (proposalStage) {
    const proposalThreads = (course.companionThreads ?? []).filter((t) => t.stageKey === "proposal");
    (course.groups ?? []).forEach((project) => {
      const student = project.members[0];
      if (!student) return;
      const proposal = project.proposal;
      const thread = proposalThreads.find((t) => t.studentId === student.studentId);
      const studentMessages = thread?.messages.filter((m) => m.role === "student") ?? [];
      const hasSubmission = (course.submissions ?? []).some((item) =>
        (item.studentId === student.studentId || item.groupId === project.id) &&
        ["idea", "plan"].includes(item.type));
      const lastUpdate = new Date(project.updatedAt).getTime();
      const staleMs = now - lastUpdate;

      // 1. 长时间无方案提交
      if (!hasSubmission && !proposal && staleMs > 20 * 60 * 1000) {
        signals.push({
          id: `proposal-stalled:${project.id}`,
          kind: "stalled",
          title: "方案构思长时间未开始",
          whatHappened: `${student.name} 进入方案构思阶段超过 20 分钟，尚未提交任何方案内容`,
          evidence: [`最后更新：${project.updatedAt}`, "无方案提交记录"],
          targetType: "student",
          targetIds: [student.studentId],
          suggestedAction: "与学生确认是否卡在选题方向，建议先用一句话写下想解决的问题",
          confidence: "high",
          stageKey: "proposal",
        });
      }

      // 2. 无 AI 伴学互动
      if (studentMessages.length === 0 && staleMs > 15 * 60 * 1000) {
        signals.push({
          id: `proposal-no-ai:${project.id}`,
          kind: "low-confidence",
          title: "方案构思阶段未与 AI 伴学小组交流",
          whatHappened: `${student.name} 在方案构思阶段尚未与 AI 伴学小组对话`,
          evidence: ["伴学对话记录为空", `最后更新：${project.updatedAt}`],
          targetType: "student",
          targetIds: [student.studentId],
          suggestedAction: "提醒学生可以点击“让 AI 伴学小组帮我完善”获取多角色反馈",
          confidence: "medium",
          stageKey: "proposal",
        });
      }

      // 3. 方案过简（核心字段过短）
      if (proposal) {
        const questionLen = proposal.projectQuestion.trim().length;
        const planLen = proposal.implementationPlan.trim().length;
        if (questionLen > 0 && (questionLen < 8 || planLen < 15)) {
          signals.push({
            id: `proposal-thin:${project.id}`,
            kind: "off-target",
            title: "方案内容过于简略",
            whatHappened: `${student.name} 的方案核心字段内容过短（问题 ${questionLen} 字、计划 ${planLen} 字）`,
            evidence: [`项目问题：${proposal.projectQuestion || "（空）"}`, `实施计划：${proposal.implementationPlan || "（空）"}`],
            targetType: "student",
            targetIds: [student.studentId],
            suggestedAction: "请学生补充“为什么这样做”和具体步骤，或与 AI 伴学小组讨论完善",
            confidence: "medium",
            stageKey: "proposal",
          });
        }
      }

      // 4. 长期等待教师确认
      if (proposal && project.teacherApproval?.status === "pending") {
        const pendingSince = new Date(project.teacherApproval.updatedAt).getTime();
        if (now - pendingSince > 30 * 60 * 1000) {
          signals.push({
            id: `proposal-pending-approval:${project.id}`,
            kind: "stalled",
            title: "方案长期等待教师确认",
            whatHappened: `${student.name} 的方案已提交超过 30 分钟，仍在等待教师校准`,
            evidence: [`提交时间：${project.teacherApproval.updatedAt}`, "状态：pending"],
            targetType: "student",
            targetIds: [student.studentId],
            suggestedAction: "尽快查看该学生的方案并给出确认或修订意见，避免阻塞后续阶段",
            confidence: "high",
            stageKey: "proposal",
          });
        }
      }
    });
  }

  (course.groups ?? []).filter((project) => project.members.length === 1).forEach((project) => {
    const lastProgress = new Date(project.updatedAt).getTime();
    const hasProgress = (course.workPlan ?? []).some((item) => item.groupId === project.id && item.progress > 0);
    const student = project.members[0];
    if (!hasProgress && now - lastProgress > 30 * 60 * 1000) signals.push({ id: `stalled:${project.id}`, kind: "stalled", title: "个人项目长时间无实质进展", whatHappened: `${student.name} 的个人项目超过 30 分钟没有任务进度`, evidence: [`最后更新：${project.updatedAt}`, "尚未记录新的过程证据"], targetType: "student", targetIds: [student.studentId], suggestedAction: "帮助学生缩小下一步任务，并约定一个十分钟内可完成的中间证据", confidence: "high", stageKey: "make" });
  });

  const supportText = (course.aiSupports ?? []).map((item) => `${item.id}|${item.groupId ?? item.targetId}|${item.trigger}|${item.diagnosis}|${item.evidence.join(" ")}`);
  const addSupportSignal = (pattern: RegExp, kind: InterventionSignal["kind"], title: string, action: string, confidence: InterventionSignal["confidence"] = "medium") => {
    supportText.filter((text) => pattern.test(text)).forEach((text) => {
      const [id, targetId, ...evidence] = text.split("|");
      signals.push({ id: `${kind}:${id}`, kind, title, whatHappened: evidence.slice(0, 2).join("；"), evidence, targetType: targetId === course.id ? "course" : "group", targetIds: [targetId], suggestedAction: action, confidence, stageKey: "make" });
    });
  };
  addSupportSignal(/偏离|无关|教学目标不一致/, "off-target", "项目可能偏离教学目标", "与学生共同核对驱动问题，修改项目范围或成果要求");
  addSupportSignal(/完整生成|直接答案|代写|全部完成/, "over-generation", "学生连续要求 AI 完整生成", "暂停高影响生成，要求学生先提交草稿和自己的判断", "high");
  addSupportSignal(/伦理|价值|公平|隐私|现实争议/, "ethics", "项目涉及伦理或价值判断", "组织教师引导的讨论，明确事实、立场与价值判断的边界");
  addSupportSignal(/不确定|置信度低|证据不足|无法判断/, "low-confidence", "AI 对当前问题把握不足", "由教师核查证据并决定是否补充来源或调整任务");
  return signals.filter((signal, index, all) => !resolvedIds.has(signal.id) && all.findIndex((item) => item.id === signal.id) === index);
}
