import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, ChevronDown, ExternalLink, Map, Network } from "lucide-react";
import { useStageStore } from "@openmaic/lib/store";
import { KnowledgeGraphFlow } from "@/components/knowledge-graph-flow";
import { StudentStageHost } from "@/components/openmaic-bridge/student-stage-host";
import { Card, PrimaryButton, ProgressBar } from "@/components/ui";
import { useSession } from "@/lib/session/store";
import type { Course, KnowledgePoint } from "@/lib/session/types";

export function AiLearningView({ course }: { course?: Course }) {
  const classroomId = course?.aiLearningClassroomId;
  const hasClassroom = Boolean(classroomId);
  const { studentId, studentName, user } = useSession();
  const [graphCollapsed, setGraphCollapsed] = useState(false);

  const knowledgePoints = course?.content?.knowledgePoints ?? [];
  const graph = course?.content?.knowledgeGraph;
  const progress = course?.students.find((student) => student.id === studentId)?.stageProgress["ai-learning"] ?? 0;
  const aiProgress = studentId ? course?.aiLearningProgress?.[studentId] : undefined;
  const goals = aiProgress?.currentGoals?.length ? aiProgress.currentGoals : (course?.learningObjectives ?? course?.content?.lessonOutline?.flatMap((section) => section.objectives ?? []).slice(0, 4) ?? []);

  // ===== OpenMAIC 场景-知识点联动 =====
  // 订阅 useStageStore 的 currentSceneId 变化，匹配当前讲解的知识点
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [activeSceneTitle, setActiveSceneTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!hasClassroom) return;
    let prevSceneId = useStageStore.getState().currentSceneId;
    // 初始匹配
    const matchInitial = () => {
      const state = useStageStore.getState();
      const sceneId = state.currentSceneId;
      if (!sceneId) return;
      const scene = state.scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      const matchedId = matchSceneToKnowledgePoint(scene, knowledgePoints, graph);
      setActiveNodeId(matchedId);
      setActiveSceneTitle(scene.title ?? null);
    };
    matchInitial();
    const unsubscribe = useStageStore.subscribe((current) => {
      if (current.currentSceneId === prevSceneId) return;
      prevSceneId = current.currentSceneId;
      const scene = current.scenes.find((s) => s.id === current.currentSceneId);
      if (!scene) {
        setActiveNodeId(null);
        setActiveSceneTitle(null);
        return;
      }
      const matchedId = matchSceneToKnowledgePoint(scene, knowledgePoints, graph);
      setActiveNodeId(matchedId);
      setActiveSceneTitle(scene.title ?? null);
    });
    return () => {
      unsubscribe();
    };
  }, [hasClassroom, knowledgePoints, graph]);

  if (!hasClassroom || !classroomId) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-3xl font-bold leading-tight text-stone-900 md:text-4xl">AI 授知</h1>
          <p className="mt-1 text-base text-stone-600 md:text-xl">进入 AI 课堂，完成核心概念学习。</p>
        </div>
        <Card className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--pbl-warning-soft)] text-[var(--pbl-warning)]">
            <Bot size={32} />
          </div>
          <h2 className="mt-4 text-2xl font-bold">AI 课堂尚未生成</h2>
          <p className="mt-2 text-sm text-stone-500">
            请等待教师生成 AI 授知内容。生成完成后，本阶段会直接显示 AI 学习课堂。
          </p>
          <PrimaryButton className="mx-auto mt-6" variant="outline" disabled>
            等待课堂生成
          </PrimaryButton>
        </Card>
      </div>
    );
  }

  if (!studentId) {
    return (
      <Card className="text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--pbl-student-soft)] text-[var(--pbl-student)]">
          <Bot size={32} />
        </div>
        <h2 className="mt-4 text-2xl font-bold">正在初始化学习身份</h2>
        <p className="mt-2 text-sm text-stone-500">请从学生端重新进入课堂，以便记录学习进度。</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-[var(--radius-lg)] border border-stone-200 bg-white shadow-sm">
        {/* 集成工具条 */}
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-stone-50/80 px-3 py-2">
          <button
            type="button"
            onClick={() => setGraphCollapsed((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 text-[13px] font-semibold text-stone-600 transition hover:bg-white hover:text-[var(--pbl-student)]"
            aria-expanded={!graphCollapsed}
          >
            <Map size={15} />
            知识地图
            <ChevronDown className={graphCollapsed ? "rotate-180 transition" : "transition"} size={14} />
          </button>
          <Link
            href={`/student/ai-learning/${classroomId}?courseId=${encodeURIComponent(course?.id ?? "")}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 text-[13px] font-semibold text-stone-500 transition hover:bg-white hover:text-[var(--pbl-student)]"
          >
            <ExternalLink size={14} /> 全屏学习
          </Link>
        </div>

        {/* 播放器 */}
        <StudentStageHost
          classroomId={classroomId}
          courseId={course?.id}
          studentId={studentId}
          studentName={studentName ?? user.name}
          backHref={course?.id ? `/student/classroom/${course.id}` : "/student"}
          variant="embedded"
          className="min-h-[560px] border-0 rounded-none"
        />

        {/* 底部独立知识图谱展示区 */}
        {!graphCollapsed ? (
          <div className="border-t border-stone-200 bg-stone-50/50">
            <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-xs)] bg-[var(--pbl-student-soft)] text-[var(--pbl-student)]">
                  <Network size={15} />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-stone-900">知识图谱联动</div>
                  <p className="truncate text-xs text-stone-500">
                    {activeSceneTitle
                      ? `当前讲解：${activeSceneTitle}`
                      : "随课堂讲解自动高亮当前知识点"}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-xs font-semibold text-stone-400">
                {knowledgePoints.length} 节点
              </div>
            </div>
            <div className="h-[20rem] min-h-[18rem] w-full bg-white sm:h-[22rem]">
              {knowledgePoints.length > 0 ? (
                <KnowledgeGraphFlow
                  graph={graph}
                  points={knowledgePoints}
                  activeNodeId={activeNodeId}
                  height={320}
                />
              ) : (
                <div className="grid h-full place-items-center text-sm text-stone-400">
                  按课堂内容推进即可。
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {/* 简洁进度条 */}
      <div className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-stone-200 bg-white px-4 py-2.5">
        <span className="shrink-0 text-[13px] font-semibold text-stone-600">学习进度</span>
        <ProgressBar value={progress} className="flex-1" />
        <span className="shrink-0 text-[13px] font-bold text-[var(--pbl-student)]">{progress}%</span>
      </div>
    </div>
  );
}

// ===== 场景-知识点匹配逻辑 =====
// 从场景标题、内容文本中提取关键词，匹配知识点名称
function matchSceneToKnowledgePoint(
  scene: { id?: string; title?: string; content?: unknown; keyPoints?: unknown },
  points: KnowledgePoint[],
  graph?: Course["content"]["knowledgeGraph"],
): string | null {
  if (points.length === 0 && !graph?.nodes.length) return null;

  if (scene.id && graph?.nodes.length) {
    const linkedNode = graph.nodes.find((node) => node.relatedLessonIds?.includes(scene.id!));
    if (linkedNode) return linkedNode.id;
  }

  // 收集场景中所有文本
  const texts: string[] = [];
  if (scene.title) texts.push(scene.title);
  if (Array.isArray(scene.keyPoints)) {
    texts.push(...scene.keyPoints.filter((item): item is string => typeof item === "string"));
  }
  // 尝试从 content 中提取文本（slide content 的 elements 含 text）
  const content = scene.content as {
    title?: string;
    description?: string;
    keyPoints?: string[];
    elements?: Array<{ text?: string; content?: string }>;
  } | undefined;
  if (typeof content?.title === "string") texts.push(content.title);
  if (typeof content?.description === "string") texts.push(content.description);
  if (Array.isArray(content?.keyPoints)) texts.push(...content.keyPoints);
  if (content?.elements) {
    for (const el of content.elements) {
      if (typeof el.text === "string") texts.push(el.text);
      if (typeof el.content === "string") texts.push(el.content);
    }
  }
  const haystack = texts.join(" ");

  if (!haystack) return null;

  const candidates = [
    ...(graph?.nodes ?? []).map((node) => ({
      id: node.id,
      terms: [node.label, node.keyInfo].filter((item): item is string => Boolean(item)),
    })),
    ...points.map((point) => ({
      id: point.id,
      terms: [point.name, point.keyInfo].filter((item): item is string => Boolean(item)),
    })),
  ];

  const matched = candidates
    .map((candidate) => ({
      id: candidate.id,
      score: Math.max(
        ...candidate.terms.map((term) => (term && haystack.includes(term) ? term.length : 0)),
        0,
      ),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  return matched[0]?.id ?? null;
}
