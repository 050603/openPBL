import { prisma } from "../src/lib/db/client";

/** Idempotently materialise legacy collaboration threads into the audit table. */
async function main() {
  const threads = await prisma.companionThread.findMany({
    where: { stageKey: { startsWith: "ai-collaboration" } },
    select: { id: true, courseId: true, studentId: true, stageKey: true, messages: true },
  });
  let inserted = 0;
  for (const thread of threads) {
    const messages = Array.isArray(thread.messages) ? thread.messages : [];
    const source = thread.stageKey.includes("comments") ? "proactive-comment" : "sidebar";
    for (const raw of messages) {
      if (!raw || typeof raw !== "object") continue;
      const message = raw as Record<string, unknown>;
      const id = typeof message.id === "string" ? message.id : undefined;
      const content = typeof message.content === "string" ? message.content : undefined;
      const createdAt = typeof message.createdAt === "string" ? new Date(message.createdAt) : new Date();
      if (!id || !content || Number.isNaN(createdAt.getTime())) continue;
      const role = message.role === "student" ? "student" : message.role === "agent" ? "ai" : "system";
      const eventType = message.role === "student" ? "request" : message.role === "system-trigger" ? "comment" : "response";
      const result = await prisma.aiInteractionEvent.createMany({
        data: [{
          id: `legacy-ai-event-${id}`,
          courseId: thread.courseId,
          studentId: thread.studentId,
          stageKey: thread.stageKey.replace(/^ai-collaboration-comments:/, "").replace(/^ai-collaboration:/, ""),
          conversationId: typeof message.conversationId === "string" ? message.conversationId : null,
          source,
          eventType,
          actorRole: role,
          actorId: typeof message.authorId === "string" ? message.authorId : null,
          content,
          payload: { migratedFrom: thread.id, triggerKind: message.triggerKind ?? null },
          createdAt,
        }],
        skipDuplicates: true,
      });
      inserted += result.count;
    }
  }
  const courses = await prisma.course.findMany({
    select: { id: true, aiContributions: true, studentAiDecisions: true },
  });
  for (const course of courses) {
    const contributions = Array.isArray(course.aiContributions) ? course.aiContributions : [];
    for (const raw of contributions) {
      if (!raw || typeof raw !== "object") continue;
      const contribution = raw as Record<string, unknown>;
      if (contribution.stageKey !== "make") continue;
      const id = typeof contribution.id === "string" ? contribution.id : undefined;
      const studentId = typeof contribution.studentId === "string" ? contribution.studentId : undefined;
      if (!id || !studentId) continue;
      const createdAt = typeof contribution.createdAt === "string" ? new Date(contribution.createdAt) : new Date();
      if (Number.isNaN(createdAt.getTime())) continue;
      const suggestion = typeof contribution.suggestion === "string" ? contribution.suggestion : "";
      const request = typeof contribution.request === "string" ? contribution.request : "";
      const result = await prisma.aiInteractionEvent.createMany({
        data: [{
          id: `legacy-ai-contribution-${id}`,
          courseId: course.id,
          studentId,
          stageKey: "make",
          source: "sidebar",
          eventType: "proposal",
          actorRole: "ai",
          actorId: typeof contribution.companionId === "string" ? contribution.companionId : null,
          content: suggestion || undefined,
          payload: {
            migratedFrom: "course.aiContributions",
            request,
            proposedChange: contribution.proposedChange ?? null,
            status: contribution.status ?? null,
          },
          createdAt,
        }],
        skipDuplicates: true,
      });
      inserted += result.count;
    }
    const decisions = Array.isArray(course.studentAiDecisions) ? course.studentAiDecisions : [];
    for (const raw of decisions) {
      if (!raw || typeof raw !== "object") continue;
      const decision = raw as Record<string, unknown>;
      if (decision.stageKey !== "make") continue;
      const id = typeof decision.id === "string" ? decision.id : undefined;
      const studentId = typeof decision.studentId === "string" ? decision.studentId : undefined;
      if (!id || !studentId) continue;
      const decidedAt = typeof decision.decidedAt === "string" ? new Date(decision.decidedAt) : new Date();
      if (Number.isNaN(decidedAt.getTime())) continue;
      const reason = typeof decision.reason === "string" ? decision.reason : "学生完成了 AI 建议决策。";
      const result = await prisma.aiInteractionEvent.createMany({
        data: [{
          id: `legacy-ai-decision-${id}`,
          courseId: course.id,
          studentId,
          stageKey: "make",
          source: "sidebar",
          eventType: "decision",
          actorRole: "student",
          actorId: studentId,
          content: reason,
          payload: {
            migratedFrom: "course.studentAiDecisions",
            contributionId: decision.contributionId ?? null,
            decision: decision.decision ?? null,
            appliedChangeSummary: decision.appliedChangeSummary ?? null,
          },
          createdAt: decidedAt,
        }],
        skipDuplicates: true,
      });
      inserted += result.count;
    }
  }
  console.log(`Backfilled ${inserted} AI collaboration events from ${threads.length} threads and ${courses.length} courses.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
