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
  | { type: "agent_end"; companionId: AiCompanionId }
  | { type: "cue_user" }
  | { type: "done" }
  | { type: "error"; message: string };

function sseEncode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function buildDirectorPrompt(input: {
  message: string;
  history: ChatMessage[];
  companions: { id: AiCompanionId; name: string; role: string; description: string; canQuestion: boolean }[];
  stageLabel: string;
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
1. 根据学生的问题和当前阶段（${input.stageLabel}），选择 1-2 个最合适的角色发言；只有确实需要互补视角时才选 2 个
2. 优先选择能提供不同视角的角色组合（如：一个陈述知识+一个质疑检验）
3. 如果学生明确要求某个角色，必须包含该角色
4. 避免为了热闹而派人；每位被选角色都必须能提供不同且直接推动当前活动的价值
5. 必须返回 JSON 格式：{"speakers": ["角色id1", "角色id2"], "cueUser": true/false}
6. cueUser 为 true 表示需要学生继续输入，false 表示本轮讨论结束
7. 功能矩阵约束：只有"问问"(critic)可以提问，其他角色只提供陈述性内容和解决方案
8. 如果学生需要知识解释，优先派"知知"(knowledge)；如果需要方案，优先派"策策"(planner)`;

  const user = `学生最新消息：${input.message}
${recentHistory ? `最近对话：\n${recentHistory}` : ""}

请决定哪些伴学角色应该回应，返回 JSON。`;

  return { system, user };
}

export async function POST(req: NextRequest) {
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

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const signal = req.signal;

  const write = (event: SSEEvent) => writer.write(encoder.encode(sseEncode(event)));

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

      const companions = body.companionIds.map((id) => getCompanion(id));
      const availableCompanions = companions.map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        description: c.description,
        canQuestion: c.canQuestion,
      }));

      // === Step 1: Director 分析 ===
      await write({ type: "director_start" });

      const directorPrompt = buildDirectorPrompt({
        message: body.message,
        history: body.history,
        companions: availableCompanions,
        stageLabel: body.stageLabel,
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
          ? parsed.speakers.filter((id) => body.companionIds.includes(id))
          : [];
        directorResult = {
          speakers: speakers.length ? speakers : [body.companionIds[0]],
          cueUser: Boolean(parsed.cueUser),
        };
      } catch {
        // Director 失败时降级：用第一个可用角色
        directorResult = { speakers: [body.companionIds[0]], cueUser: false };
      }

      await write({ type: "director_result", speakers: directorResult.speakers });

      if (signal.aborted) return;

      // === Step 2: 依次让每个选中角色发言 ===
      const conversationHistory = [...body.history, { role: "user" as const, content: body.message }];
      const peerResponses: string[] = [];

      for (const companionId of directorResult.speakers) {
        if (signal.aborted) return;

        const companion = getCompanion(companionId);
        await write({ type: "agent_start", companionId });

        const systemPrompt = buildCompanionSystemPrompt({
          companion,
          courseName: body.courseName,
          drivingQuestion: body.drivingQuestion,
          stageLabel: body.stageLabel,
          teacherContext: body.teacherContext,
          studentWork: body.studentWork,
          peerResponses,
        });

        // 构建该角色的对话历史（包含其他角色的发言作为上下文）
        const agentMessages: ChatMessage[] = [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
        ];

        let fullResponse = "";
        try {
          for await (const delta of callLLMStream(agentMessages, { abortSignal: signal })) {
            if (signal.aborted) return;
            fullResponse += delta;
            await write({ type: "text_delta", companionId, delta });
          }
        } catch {
          // 单个角色流式失败时，用非流式降级
          if (signal.aborted) return;
          try {
            fullResponse = await callLLM(agentMessages, { abortSignal: signal });
            await write({ type: "text_delta", companionId, delta: fullResponse });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await write({ type: "text_delta", companionId, delta: `（${companion.name}暂时无法回应：${msg}）` });
            fullResponse = "";
          }
        }

        await write({ type: "agent_end", companionId });

        // 将该角色的回复加入对话历史，供后续角色参考
        if (fullResponse) {
          conversationHistory.push({ role: "assistant", content: fullResponse });
          peerResponses.push(`${companion.name}：${fullResponse.slice(0, 500)}`);
        }
      }

      // === Step 3: 结束 ===
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
