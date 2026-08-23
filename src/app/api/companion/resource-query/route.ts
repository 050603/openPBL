import { isAuthConfigured, readAuthFromRequest } from "@/lib/auth/session";
import { callLLM } from "@/lib/llm/client";
import { normalizePblCourseConfig } from "@/lib/pbl-course-config";
import { STUDENT_CONVERSATION_PROMPT_CONTRACT } from "@/lib/prompt-quality/policy";
import { getCourse } from "@/lib/session/server-store";
import { resolveClassroomWebSearchConfig } from "@openmaic/lib/server/web-search-config";
import { searchWeb } from "@openmaic/lib/web-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResourceQueryBody = {
  courseId?: string;
  stageKey?: string;
  query?: string;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as ResourceQueryBody | null;
  const courseId = body?.courseId?.trim();
  const query = body?.query?.trim();
  if (!courseId || !query) {
    return Response.json({ success: false, error: "请输入要查询的问题。" }, { status: 400 });
  }
  if (query.length > 1_000) {
    return Response.json({ success: false, error: "问题过长，请精简到 1000 字以内。" }, { status: 400 });
  }

  if (isAuthConfigured()) {
    const claims = await readAuthFromRequest(request, "student");
    if (!claims || claims.role !== "student" || claims.courseId !== courseId) {
      return Response.json({ success: false, error: "无权查询该课程资料。" }, { status: 403 });
    }
  }

  const course = await getCourse(courseId);
  if (!course) {
    return Response.json({ success: false, error: "课程不存在。" }, { status: 404 });
  }

  const mode = normalizePblCourseConfig(course.pblConfig).resourceInquiryMode;
  try {
    if (mode === "web-search") {
      const config = resolveClassroomWebSearchConfig({});
      if (!config) {
        return Response.json({
          success: false,
          error: "当前资料查询服务暂不可用，请联系教师检查课程设置。",
        }, { status: 409 });
      }
      const result = await searchWeb({
        ...config,
        query,
        signal: request.signal,
      });
      return Response.json({
        success: true,
        mode,
        answer: result.answer,
        sources: result.sources,
        query: result.query,
      });
    }

    const answer = await callLLM([
      {
        role: "system",
        content: `你是项目式学习课堂“资料角”的知识助手。请结合课程背景直接回答学生问题，帮助学生理解概念、形成检索关键词和确定核验办法。
你当前不能访问互联网，不得声称已经搜索、浏览或核验网页，不得编造来源、链接、论文、数据或时效性事实。
回答使用简体中文和简洁、规范的 Markdown。先给出清晰解释，再指出需要通过可靠来源核验的内容；适合时使用小标题、列表，并提供 2-4 个后续检索关键词。不要使用 HTML，不要替学生完成项目成果。

${STUDENT_CONVERSATION_PROMPT_CONTRACT}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          course: course.name,
          subject: course.subject,
          grade: course.grade,
          drivingQuestion: course.drivingQuestion,
          stage: course.stages.find((stage) => stage.key === body?.stageKey)?.label ?? body?.stageKey ?? "",
          question: query,
        }),
      },
    ], { abortSignal: request.signal });

    return Response.json({ success: true, mode, answer, sources: [], query });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("[api/companion/resource-query] query failed:", error);
    return Response.json({
      success: false,
      error: "资料查询暂时不可用，请稍后重试。",
    }, { status: 502 });
  }
}
