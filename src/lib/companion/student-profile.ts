import { evaluateAiCollaborationHealth, type AiCollaborationEvidence } from "@/lib/evaluation/ai-process-evaluator";
import type { CompanionMessage, CompanionThread, Course, ClassroomSubmission, LearningSignal } from "@/lib/session/types";

export type StudentLearningProfile = {
  pace: "needs-structure" | "steady" | "exploratory";
  supportStrategy: "small-step" | "verification-first" | "extension";
  collaborationHealth: "insufficient-evidence" | "scored";
  collaborationScore: number | null;
  rationale: string[];
};

function evidenceFor(
  messages: CompanionMessage[],
  submissions: ClassroomSubmission[],
): AiCollaborationEvidence {
  const studentMessages = messages.filter((message) => message.role === "student");
  const text = studentMessages.map((message) => message.content).join("\n");
  return {
    interactionCount: studentMessages.length,
    specificContextCount: studentMessages.filter((message) => message.content.trim().length >= 20).length,
    independentProgressCount: submissions.length,
    verificationCount: (text.match(/核对|验证|来源|测试|比较|证据/g) ?? []).length,
    artifactChangeCount: submissions.length,
    corroborationCount: submissions.filter((submission) => /来源|数据|测试|迭代|修改/.test(submission.content)).length,
    delegationPatternCount: (text.match(/帮我做完|全部生成|直接给答案|代写|替我完成/g) ?? []).length,
  };
}

export function deriveStudentLearningProfile(input: {
  course: Course;
  studentId: string;
  stageKey: string;
}): StudentLearningProfile {
  const messages = (input.course.companionThreads ?? [])
    .filter((thread: CompanionThread) => thread.studentId === input.studentId && thread.stageKey === input.stageKey)
    .flatMap((thread) => thread.messages);
  const submissions = (input.course.submissions ?? []).filter((submission) =>
    (submission.studentId === input.studentId || input.course.groups?.some((group) => group.members.some((member) => member.studentId === input.studentId && submission.groupId === group.id))) && submission.stageKey === input.stageKey,
  );
  const signals = (input.course.learningSignals ?? []).filter((signal: LearningSignal) => signal.studentId === input.studentId && signal.stageKey === input.stageKey && signal.status === "open");
  const collaboration = evaluateAiCollaborationHealth(evidenceFor(messages, submissions));
  const progress = input.course.students.find((student) => student.id === input.studentId)?.stageProgress?.[input.stageKey] ?? 0;
  const rationale = [...collaboration.reasons];
  if (signals.some((signal) => signal.kind === "idle" || signal.kind === "goal-stalled")) rationale.push("最近存在停滞信号，先缩小下一步任务");

  if (signals.length || progress < 25) {
    return { pace: "needs-structure", supportStrategy: collaboration.status === "scored" && (collaboration.score ?? 100) < 45 && evidenceFor(messages, submissions).delegationPatternCount > 0 ? "verification-first" : "small-step", collaborationHealth: collaboration.status, collaborationScore: collaboration.score, rationale };
  }
  if (collaboration.status === "scored" && (collaboration.score ?? 0) >= 70 && progress >= 60) {
    return { pace: "exploratory", supportStrategy: "extension", collaborationHealth: collaboration.status, collaborationScore: collaboration.score, rationale };
  }
  return { pace: "steady", supportStrategy: collaboration.status === "scored" && (collaboration.score ?? 100) < 45 && evidenceFor(messages, submissions).delegationPatternCount > 0 ? "verification-first" : "small-step", collaborationHealth: collaboration.status, collaborationScore: collaboration.score, rationale };
}

export function studentProfilePrompt(profile: StudentLearningProfile): string {
  const score = profile.collaborationScore === null ? "证据不足" : `${profile.collaborationScore}/100`;
  return `学生画像（仅用于调整支架，不参与评分）：节奏=${profile.pace}；建议策略=${profile.supportStrategy}；AI 协作健康=${score}；依据=${profile.rationale.join("、") || "暂无"}`;
}
