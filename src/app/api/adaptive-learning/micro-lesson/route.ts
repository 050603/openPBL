import { extractLearningRequestTopic } from "@/lib/adaptive-learning";
import { isAuthConfigured, readAuthFromRequest } from "@/lib/auth/session";
import { callLLM, parseLLMJson } from "@/lib/llm/client";
import { getCourse } from "@/lib/session/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Decision = {
  decision: "brief-answer" | "systematic-lesson";
  topic: string;
  rationale: string;
  keyPoints: string[];
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    courseId?: string;
    studentId?: string;
    stageKey?: string;
    message?: string;
  } | null;
  if (
    !body?.courseId ||
    !body.studentId ||
    !body.message?.trim() ||
    !["proposal", "make"].includes(body.stageKey ?? "")
  ) {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  if (isAuthConfigured()) {
    const claims = await readAuthFromRequest(request, "student");
    if (
      !claims ||
      (claims.role === "student" &&
        (claims.courseId !== body.courseId || claims.studentId !== body.studentId))
    ) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  }
  const course = await getCourse(body.courseId);
  if (!course) return Response.json({ error: "COURSE_NOT_FOUND" }, { status: 404 });
  const explicitTopic = extractLearningRequestTopic(body.message);
  if (!explicitTopic) {
    return Response.json({
      decision: {
        decision: "brief-answer",
        topic: "",
        rationale: "学生没有发起明确的知识学习请求",
        keyPoints: [],
      } satisfies Decision,
    });
  }

  const fallback: Decision = {
    decision:
      explicitTopic.length >= 4 || /原理|方法|怎么|如何|系统|详细/.test(body.message)
        ? "systematic-lesson"
        : "brief-answer",
    topic: explicitTopic,
    rationale: "根据请求的知识范围和当前项目阶段判断",
    keyPoints: [explicitTopic],
  };
  try {
    const raw = await callLLM([
      {
        role: "system",
        content: `你是项目课堂的伴学导演。判断学生的知识请求应该“仅告知”还是“系统讲解”。
仅告知：一个定义、一个事实、一个快捷操作、可在 45 秒内回答。
系统讲解：涉及原理、多个步骤、概念关系、易错点，或会影响方案/制作质量；应生成 1-2 页、2-3 分钟微课。
只返回 JSON：{"decision":"brief-answer|systematic-lesson","topic":"精炼主题","rationale":"一句话","keyPoints":["2-4个讲解要点"]}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          course: course.name,
          stageKey: body.stageKey,
          projectQuestion: course.drivingQuestion,
          request: body.message,
          recentWork: (course.submissions ?? [])
            .filter((item) => item.studentId === body.studentId)
            .slice(-2)
            .map((item) => item.content.replace(/<[^>]+>/g, " ").slice(0, 500)),
        }),
      },
    ], { jsonMode: true, abortSignal: request.signal });
    const parsed = parseLLMJson<Partial<Decision>>(raw);
    const decision: Decision = {
      decision:
        parsed.decision === "systematic-lesson" ? "systematic-lesson" : "brief-answer",
      topic: typeof parsed.topic === "string" && parsed.topic.trim() ? parsed.topic.trim() : fallback.topic,
      rationale:
        typeof parsed.rationale === "string" && parsed.rationale.trim()
          ? parsed.rationale.trim()
          : fallback.rationale,
      keyPoints: Array.isArray(parsed.keyPoints)
        ? parsed.keyPoints.filter((item): item is string => typeof item === "string").slice(0, 4)
        : fallback.keyPoints,
    };
    return Response.json({ decision });
  } catch {
    return Response.json({ decision: fallback });
  }
}
