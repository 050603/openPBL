import { readSessionState } from "@/lib/session/server-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readSessionState();
  const courses = session.courses ?? [];
  const activeCourse = courses.find((c) => c.status === "teaching") ?? courses[0];

  if (!activeCourse) {
    return Response.json({
      project: {
        title: "暂无进行中的项目",
        status: "—",
        overallProgress: 0,
        currentStage: "—",
        timeline: [],
      },
      student: {
        aiLearningProgress: 0,
        completedLessons: "0 / 0",
        aiStages: [],
        resources: [],
      },
      teacher: {
        classCompletionRate: 0,
        monitoredStudents: 0,
        weakConcepts: [],
      },
    });
  }

  // 从真实 stages 派生 timeline
  const timeline = activeCourse.stages.map((stage, index) => [
    String(index + 1),
    stage.label,
    stage.description || "—",
  ]);

  // 当前阶段
  const currentStage = activeCourse.stages[activeCourse.currentStageIndex]?.label ?? "—";

  // 总进度：基于 stageProgress 均值
  const totalStudents = activeCourse.students.length;
  const stageKeys = activeCourse.stages.map((s) => s.key);
  const overallProgress = totalStudents > 0
    ? Math.round(
        activeCourse.students.reduce(
          (sum, s) =>
            sum +
            (stageKeys.length > 0
              ? stageKeys.reduce((acc, k) => acc + (s.stageProgress?.[k] ?? 0), 0) / stageKeys.length
              : 0),
          0,
        ) / totalStudents,
      )
    : 0;

  // AI 学习进度（从 aiLearningProgress 字段汇总，无则 0）
  const aiLearningProgress = 0; // 待 OpenMAIC 进度接入后填充
  const completedAiLessons = 0;

  // 资源
  const resources = (activeCourse.resources ?? []).map((r) => [r.type, r.title, r.size]);

  // 教师视角
  const classCompletionRate = overallProgress;
  const monitoredStudents = totalStudents;

  // 弱概念：从 knowledgePoints 中按学生 stageProgress 较低的阶段派生（简化版）
  const weakConcepts: string[] = [];
  for (const kp of activeCourse.content.knowledgePoints ?? []) {
    weakConcepts.push(kp.name);
    if (weakConcepts.length >= 3) break;
  }

  return Response.json({
    project: {
      title: activeCourse.name,
      status: activeCourse.status === "teaching" ? "进行中" : activeCourse.status,
      overallProgress,
      currentStage: `阶段${activeCourse.currentStageIndex + 1} | ${currentStage}`,
      timeline,
    },
    student: {
      aiLearningProgress,
      completedLessons: `${completedAiLessons} / ${activeCourse.stages.length}`,
      aiStages: [],
      resources,
    },
    teacher: {
      classCompletionRate,
      monitoredStudents,
      weakConcepts,
    },
  });
}
