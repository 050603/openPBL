// SSE 流式 API：Director 调度的多智能体伴学圆桌。
//
// 流程：
// 1. 接收学生消息 + 上下文（课程、阶段、可用伴学角色）
// 2. Director LLM 分析应派哪些角色发言（JSON 模式）
// 3. 依次为每个选中角色流式生成回复（callLLMStream）
// 4. 通过 SSE 推送事件：director_result → agent_start → text_delta* → agent_end → cue_user/done

import { NextRequest } from "next/server";
import { callLLM, callLLMStream, parseLLMJson } from "@/lib/llm/client";
import { buildCompanionSystemPrompt, getCompanion, type AiCompanionId } from "@/lib/ai-companions";
import { activeDirectivesForStudent, isSubstantiallyRepeatedResponse, maxSpeakersForTurn, recorderVisibility, shouldUseReviewer } from "@/lib/companion/orchestrator";
import { buildCompanionContext, type CompanionContextSnapshot } from "@/lib/companion/context";
import { appendCompanionMessages, companionMessage, getCompanionThread } from "@/lib/companion/server-store";
import { sanitizeCompanionResponse } from "@/lib/companion/response";
import { buildStageBoundaryInstruction } from "@/lib/companion/stage-policy";
import { buildWorkspaceEditInstruction, extractWorkspacePatch, type CompanionWorkspacePatch } from "@/lib/companion/workspace-operation";
import { getCourse, updateCourse } from "@/lib/session/server-store";
import type { CompanionTriggerKind } from "@/lib/session/types";
import { aggregateCommonIssues } from "@/lib/learning-analytics/analyzer";
import {
  companionLimiter,
  getClientIp,
  rateLimitKey,
  rateLimitedResponse,
} from "@/lib/auth/rate-limit";
import { isAuthConfigured, readAuthFromRequest } from "@/lib/auth/session";
import { isShuttingDown } from "@/lib/runtime/lifecycle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type CompanionChatRequest = {
  message: string;
  history: ChatMessage[];
  companionIds: AiCompanionId[];
  courseName: string;
  drivingQuestion: string;
  stageKey: string;
  stageLabel: string;
  teacherContext: string;
  studentWork?: string;
  courseId?: string;
  studentId?: string;
  studentName?: string;
  preferredCompanionId?: AiCompanionId;
  taskId?: string;
  trigger?: { kind: CompanionTriggerKind; reason?: string; preferredCompanionId?: AiCompanionId };
};

type DirectorResult = {
  speakers: AiCompanionId[];
  cueUser: boolean;
};

type SSEEvent =
  | { type: "director_start" }
  | { type: "director_result"; speakers: AiCompanionId[] }
  | { type: "agent_start"; companionId: AiCompanionId }
  | { type: "text_delta"; companionId: AiCompanionId; delta: string }
  | { type: "workspace_patch"; companionId: AiCompanionId; taskId?: string; patch: CompanionWorkspacePatch }
  | { type: "agent_end"; companionId: AiCompanionId }
  | { type: "cue_user" }
  | { type: "done" }
  | { type: "error"; message: string };

function buildRequestContext(body: CompanionChatRequest): CompanionContextSnapshot {
  const noRecord = "（无服务端课程记录）";
  const project = body.studentWork?.trim()
    ? `本次学生提交内容：${body.studentWork.trim()}`
    : noRecord;
  const sections = {
    course: `课程=${body.courseName || "未填写"}；驱动问题=${body.drivingQuestion || "未填写"}`,
    project,
    progress: `当前阶段=${body.stageLabel || body.stageKey}；当前请求未提供阶段进度`,
    submissions: project,
    uploads: noRecord,
    teacherFeedback: body.teacherContext || noRecord,
    scoring: noRecord,
    aiEvaluation: noRecord,
    aiSupports: noRecord,
    reflection: noRecord,
    processEvidence: noRecord,
    teacherGuidance: body.teacherContext || noRecord,
  };
  return {
    stageKey: body.stageKey,
    stageLabel: body.stageLabel,
    studentId: body.studentId,
    studentName: body.studentName,
    currentProgress: 0,
    sections,
    prompt: [
      "服务端学习上下文（本次请求未关联可持久化课程，以下仅使用请求中提供的事实）：",
      `课程=${sections.course}`,
      `阶段=${sections.progress}`,
      `学生提交=${sections.project}`,
      `教师要求=${sections.teacherGuidance}`,
    ].join("\n"),
  };
}

function sseEncode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function buildDirectorPrompt(input: {
  message: string;
  history: ChatMessage[];
  companions: { id: AiCompanionId; name: string; role: string; description: string; canQuestion: boolean }[];
  stageLabel: string;
  trigger?: CompanionTriggerKind;
  preferredCompanionId?: AiCompanionId;
}): { system: string; user: string } {
  const companionList = input.companions
    .map((c) => `- ${c.id}（${c.name}，${c.role}）：${c.description}${c.canQuestion ? " [唯一可提问角色]" : " [仅陈述]"}`)
    .join("\n");

  const recentHistory = input.history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "学生" : "伴学"}：${m.content.slice(0, 100)}`)
    .join("\n");

  const system = `你是一个伴学小组的"导演"（Director），负责决定哪些伴学角色应该回应学生。
当前可选伴学角色：
${companionList}

规则：
1. 根据学生的问题和当前阶段（${input.stageLabel}）选择角色。主动介入只能选 1 个角色；学生主动提问时默认也选 1 个，只有学生明确要求多角色或多个角度时才可选 2 个
2. 优先选择能提供不同视角的角色组合（如：一个陈述知识+一个质疑检验）
3. 如果学生明确要求某个角色，必须包含该角色
4. 避免为了热闹而派人；若选 2 个角色，两者必须围绕同一个核心问题分工，第二个角色不能开启新的任务
5. 必须返回 JSON 格式：{"speakers": ["角色id1", "角色id2"], "cueUser": true/false}
6. cueUser 为 true 表示需要学生继续输入，false 表示本轮讨论结束
7. 功能矩阵约束：只有"问问"(critic)可以提问，其他角色只提供陈述性内容和解决方案
8. 如果学生需要知识解释，优先派"知知"(knowledge)；如果需要方案，优先派"策策"(planner)
9. 这些角色是课堂上的伴学伙伴，说话风格应像同学之间的交流，自然、口语化`;

  const user = `本轮来源：${input.trigger ? `系统主动介入（${input.trigger}）` : "学生主动请求"}
学生最新消息：${input.message}
${input.preferredCompanionId ? `学生点名希望先听${input.preferredCompanionId}的意见；如果该角色可用，必须让其先发言。` : ""}
${recentHistory ? `最近对话：\n${recentHistory}` : ""}

请决定哪些伴学角色应该回应，返回 JSON。`;

  return { system, user };
}

export async function POST(req: NextRequest) {
  // Reject new requests immediately during graceful shutdown (Stage 7).
  if (isShuttingDown()) {
    return Response.json(
      { error: "SERVER_SHUTTING_DOWN", message: "服务器维护中,请稍后重试" },
      { status: 503 },
    );
  }

  // Stage 3: rate limit companion chat (10/min/user).
  if (isAuthConfigured()) {
    const claims = await readAuthFromRequest(req);
    const ip = getClientIp(req);
    const userKey = claims?.role === "student" ? claims.studentId : claims?.role === "teacher" ? claims.sub : ip;
    const rl = companionLimiter.check(rateLimitKey(req, userKey));
    if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);
  }

  let body: CompanionChatRequest;
  try {
    body = (await req.json()) as CompanionChatRequest;
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (!body?.message?.trim()) {
    return Response.json({ error: "MISSING_MESSAGE" }, { status: 400 });
  }

  if (!body.companionIds?.length) {
    return Response.json({ error: "MISSING_COMPANIONS" }, { status: 400 });
  }

  let authoritativeHistory = body.history ?? [];
  let teacherContext = body.teacherContext;
  let effectiveCompanionIds = body.companionIds;
  let companionContext = buildRequestContext(body);
  const canPersist = Boolean(body.courseId && body.studentId && body.stageKey);
  if (canPersist) {
    const course = await getCourse(body.courseId!);
    if (!course) return Response.json({ error: "COURSE_NOT_FOUND" }, { status: 404 });
    if (!course.students.some((student) => student.id === body.studentId)) {
      return Response.json({ error: "STUDENT_NOT_IN_COURSE" }, { status: 403 });
    }
    const configuredIds = course.pblConfig?.companionIds;
    if (configuredIds?.length) {
      effectiveCompanionIds = body.companionIds.filter(
        (id) => configuredIds.includes(id) && getCompanion(id).stages.includes(body.stageKey),
      );
    }
    if (!effectiveCompanionIds.length) {
      return Response.json({ error: "NO_CONFIGURED_COMPANIONS_FOR_STAGE" }, { status: 400 });
    }
    companionContext = buildCompanionContext(course, body.studentId, body.stageKey);
    const thread = await getCompanionThread(body.courseId!, body.studentId!, body.stageKey);
    authoritativeHistory = (thread?.messages ?? [])
      .filter((message) => message.role === "student" || message.role === "agent" || message.role === "teacher-guidance")
      .slice(-12)
      .map((message) => ({
        role: message.role === "student" ? "user" as const : "assistant" as const,
        content: message.role === "student"
          ? message.content
          : sanitizeCompanionResponse(message.content),
      }));
    const directives = activeDirectivesForStudent(
      course.teacherAgentDirectives ?? [],
      body.studentId!,
      body.stageKey,
    );
    if (directives.length) {
      teacherContext = [
        teacherContext,
        ...directives.map((directive) => `教师持续目标：${directive.goal}；引导要求：${directive.instruction}；完成标准：${directive.successCriteria.join("、")}`),
      ].filter(Boolean).join("\n");
    }
    await appendCompanionMessages({
      courseId: body.courseId!,
      studentId: body.studentId!,
      stageKey: body.stageKey,
      openingTrigger: body.trigger?.kind,
      messages: body.trigger
        ? [companionMessage({ role: "system-trigger", content: body.trigger.reason || body.message, visibility: "teacher-only", triggerKind: body.trigger.kind })]
        : [companionMessage({ role: "student", content: body.message, visibility: "student-and-teacher", authorId: body.studentId, authorName: body.studentName })],
    });
    const recentStudentMessages = (thread?.messages ?? []).filter((message) => message.role === "student").slice(-3);
    if (!body.trigger && recentStudentMessages.length === 3) {
      const evidenceStart = Date.parse(recentStudentMessages[0].createdAt);
      const hasNewArtifact = (course.submissions ?? []).some(
        (submission) => submission.studentId === body.studentId && Date.parse(submission.updatedAt) > evidenceStart,
      );
      if (!hasNewArtifact) {
        const now = new Date().toISOString();
        const signalId = `learning-signal-${body.studentId}-${body.stageKey}-conversation-no-progress`;
        await updateCourse(body.courseId!, (current) => {
          const existing = current.learningSignals?.find((signal) => signal.id === signalId);
          const next = {
            id: signalId,
            courseId: body.courseId!,
            studentId: body.studentId!,
            stageKey: body.stageKey,
            kind: "conversation-no-progress" as const,
            severity: existing?.severity ?? "warning" as const,
            status: "open" as const,
            title: "多轮伴学对话没有形成产物进展",
            summary: "连续 4 轮对话后没有检测到新的事实、选择或产物修改。",
            normalizedIssueKey: `conversation-no-progress:${body.stageKey}:stage`,
            evidenceEventIds: [...recentStudentMessages.map((message) => message.id), "current-message"],
            aiInterventionAttempts: existing?.aiInterventionAttempts ?? 0,
            firstDetectedAt: existing?.firstDetectedAt ?? now,
            lastDetectedAt: now,
          };
          const learningSignals = [...(current.learningSignals ?? []).filter((signal) => signal.id !== signalId), next];
          return { ...current, learningSignals, classCommonIssues: aggregateCommonIssues(learningSignals, current.students.length) };
        });
      }
    }
    if (body.trigger?.kind === "no-progress") {
      await updateCourse(body.courseId!, (current) => ({
        ...current,
        learningSignals: (current.learningSignals ?? []).map((signal) => {
          if (signal.studentId !== body.studentId || signal.stageKey !== body.stageKey || signal.kind !== "conversation-no-progress") return signal;
          const attempts = signal.aiInterventionAttempts + 1;
          return { ...signal, aiInterventionAttempts: attempts, severity: attempts >= 2 ? "high" : signal.severity, lastDetectedAt: new Date().toISOString() };
        }),
      }));
    }
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const signal = req.signal;

  const write = (event: SSEEvent) => writer.write(encoder.encode(sseEncode(event)));

  // Graceful shutdown (Stage 7): emit a dedicated `shutdown` SSE event so
  // the client can surface "服务器维护中" and stop waiting. Uses the SSE
  // `event:` field so it is distinguishable from regular `data:` events.
  const writeShutdown = async (): Promise<void> => {
    const payload = `event: shutdown\ndata: ${JSON.stringify({
      reason: "server_shutting_down",
      message: "服务器维护中,请稍后重试",
    })}\n\n`;
    try {
      await writer.write(encoder.encode(payload));
    } catch {
      // writer already closed — nothing more we can do.
    }
  };

  // Returns true when the process is shutting down. Callers should `return`
  // from the IIFE immediately after a truthy result so the finally block can
  // close the stream.
  const checkShutdown = async (): Promise<boolean> => {
    if (!isShuttingDown()) return false;
    await writeShutdown();
    return true;
  };

  (async () => {
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    const startHeartbeat = () => {
      stopHeartbeat();
      heartbeatTimer = setInterval(() => {
        writer.write(encoder.encode(":heartbeat\n\n")).catch(() => stopHeartbeat());
      }, 15_000);
    };
    const stopHeartbeat = () => {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    };

    try {
      startHeartbeat();

      const companions = effectiveCompanionIds.map((id) => getCompanion(id));
      const availableCompanions = companions.map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        description: c.description,
        canQuestion: c.canQuestion,
      }));

      // === Step 1: Director 分析 ===
      if (await checkShutdown()) return;
      await write({ type: "director_start" });

      const directorPrompt = buildDirectorPrompt({
        message: body.message,
        history: authoritativeHistory,
        companions: availableCompanions,
        stageLabel: body.stageLabel,
        trigger: body.trigger?.kind,
        preferredCompanionId: body.preferredCompanionId,
      });

      let directorResult: DirectorResult;
      try {
        const directorReply = await callLLM(
          [
            { role: "system", content: directorPrompt.system },
            { role: "user", content: directorPrompt.user },
          ],
          { jsonMode: true, abortSignal: signal },
        );
        const parsed = parseLLMJson<DirectorResult>(directorReply);
        const speakers = Array.isArray(parsed.speakers)
          ? parsed.speakers.filter((id) => effectiveCompanionIds.includes(id))
          : [];
        const selectedSpeakers = speakers.length ? speakers : [effectiveCompanionIds[0]];
        const preferredCompanionId = body.preferredCompanionId ?? body.trigger?.preferredCompanionId;
        if (preferredCompanionId && effectiveCompanionIds.includes(preferredCompanionId)) {
          selectedSpeakers.unshift(preferredCompanionId);
        }
        if (
          shouldUseReviewer(body.trigger?.kind) &&
          effectiveCompanionIds.includes("reviewer") &&
          !selectedSpeakers.includes("reviewer")
        ) {
          selectedSpeakers.push("reviewer");
        }
        directorResult = {
          speakers: [...new Set(selectedSpeakers)].slice(0, maxSpeakersForTurn(body.trigger?.kind, body.message)),
          cueUser: Boolean(parsed.cueUser),
        };
      } catch (err) {
        // Director LLM 失败不再降级到第一个 companion —— 直接抛错让外层
        // 通过 SSE 推送 COMPANION_DIRECTOR_FAILED，前端展示明确提示。
        if (signal.aborted) return;
        if (await checkShutdown()) return;
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`COMPANION_DIRECTOR_FAILED: ${reason}`);
      }

      await write({ type: "director_result", speakers: directorResult.speakers });

      if (signal.aborted) return;
      if (await checkShutdown()) return;

      // === Step 2: 依次让每个选中角色发言 ===
      const conversationHistory = [...authoritativeHistory, { role: "user" as const, content: body.message }];
      const peerResponses: string[] = [];
      const persistedAgentMessages: ReturnType<typeof companionMessage>[] = [];

      for (const [speakerIndex, companionId] of directorResult.speakers.entries()) {
        if (signal.aborted) return;
        if (await checkShutdown()) return;

        const companion = getCompanion(companionId);
        if (speakerIndex === 0) await write({ type: "agent_start", companionId });

        const systemPrompt = buildCompanionSystemPrompt({
          companion,
          courseName: body.courseName,
          drivingQuestion: body.drivingQuestion,
          stageLabel: body.stageLabel,
          stageKey: body.stageKey,
          teacherContext,
          context: companionContext,
          peerResponses,
        });
        const boundaryInstruction = buildStageBoundaryInstruction(body.stageKey, body.message);
        const workspaceEditInstruction = speakerIndex === 0
          ? buildWorkspaceEditInstruction(body.stageKey, body.message)
          : undefined;

        // 构建该角色的对话历史（包含其他角色的发言作为上下文）
        const agentMessages: ChatMessage[] = [
          { role: "system", content: systemPrompt },
          ...(boundaryInstruction
            ? [{ role: "system" as const, content: boundaryInstruction }]
            : []),
          ...(workspaceEditInstruction
            ? [{ role: "system" as const, content: workspaceEditInstruction }]
            : []),
          ...conversationHistory,
        ];

        let fullResponse = "";
        try {
          for await (const delta of callLLMStream(agentMessages, { abortSignal: signal })) {
            if (signal.aborted) return;
            if (await checkShutdown()) return;
            fullResponse += delta;
            // Buffer the complete reply so role/stage directions can be removed
            // before any text reaches the classroom or TTS queue.
          }
        } catch (err) {
          // 流式失败不再降级到非流式 + 占位文本 —— 直接抛错让外层通过 SSE
          // 推送 COMPANION_GENERATION_FAILED，前端展示明确提示。
          if (signal.aborted) return;
          if (await checkShutdown()) return;
          const reason = err instanceof Error ? err.message : String(err);
          throw new Error(`COMPANION_GENERATION_FAILED: ${companion.name} 回复失败：${reason}`);
        }

        const workspaceResult = extractWorkspacePatch(fullResponse);
        fullResponse = sanitizeCompanionResponse(workspaceResult.speech);
        const repeated = speakerIndex > 0 && isSubstantiallyRepeatedResponse(fullResponse, peerResponses);
        if (fullResponse && !repeated) {
          if (speakerIndex > 0) await write({ type: "agent_start", companionId });
          await write({ type: "text_delta", companionId, delta: fullResponse });
          if (workspaceResult.patch) {
            await write({ type: "workspace_patch", companionId, taskId: body.taskId, patch: workspaceResult.patch });
          }
        }
        if (!repeated) await write({ type: "agent_end", companionId });

        // 将该角色的回复加入对话历史，供后续角色参考
        if (fullResponse && !repeated) {
          conversationHistory.push({ role: "assistant", content: fullResponse });
          peerResponses.push(`${companion.name}：${fullResponse.slice(0, 500)}`);
          if (canPersist) {
            persistedAgentMessages.push(companionMessage({ role: "agent", companionId, authorName: companion.name, content: fullResponse, visibility: "student-and-teacher", triggerKind: body.trigger?.kind }));
          }
        }
      }

      if (canPersist && persistedAgentMessages.length) {
        const recorderSummary = `本轮讨论：${peerResponses.join("；").slice(0, 1200)}`;
        await appendCompanionMessages({
          courseId: body.courseId!, studentId: body.studentId!, stageKey: body.stageKey,
          messages: [
            ...persistedAgentMessages,
            companionMessage({
              role: "agent",
              companionId: "recorder",
              authorName: "记记",
              content: recorderSummary,
              visibility: recorderVisibility(body.trigger?.kind),
              triggerKind: body.trigger?.kind,
            }),
          ],
        });
      }

      // === Step 3: 结束 ===
      if (await checkShutdown()) return;
      if (directorResult.cueUser) {
        await write({ type: "cue_user" });
      } else {
        await write({ type: "done" });
      }
    } catch (error) {
      if (signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      try {
        await write({ type: "error", message });
      } catch {
        // Writer may already be closed
      }
    } finally {
      stopHeartbeat();
      try { await writer.close(); } catch { /* already closed */ }
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
