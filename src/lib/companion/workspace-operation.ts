import { buildStageBoundaryInstruction } from "./stage-policy";

export type CompanionWorkspacePatch = {
  mode: "append";
  title: string;
  content: string;
  reviewInstruction: string;
};

const DOCUMENT_TARGET = /(项目|阶段|方案|过程|协作)?(?:文档|报告|材料|记录|工作台)/;
const LOCAL_EDIT_INTENT = /(补充|追加|添加|加入|写入|整理到|放到|放进|更新一下|完善一下)/;

export function requestsWorkspaceEdit(message: string): boolean {
  return DOCUMENT_TARGET.test(message) && LOCAL_EDIT_INTENT.test(message);
}

export function buildWorkspaceEditInstruction(stageKey: string, message: string): string | undefined {
  if (!requestsWorkspaceEdit(message)) return undefined;
  if (buildStageBoundaryInstruction(stageKey, message)) return undefined;

  return [
    "学生明确请求你对项目工作台中的协作文档做一次局部补充。你只能追加基础信息，不得覆盖学生原文、替学生作关键判断或执行最终提交。",
    "先用正常口语说明你补充了什么，并明确告诉学生到‘项目工作台 → 协作文档’查看、核验和修改。",
    "回复末尾必须追加且只追加一个机器可读块，块内必须是严格 JSON，不要使用 Markdown：",
    '<workspace_patch>{"mode":"append","title":"不超过20字的补充标题","content":"只包含本次允许追加的基础信息，不超过300字","reviewInstruction":"学生需要核验或修改的一件事"}</workspace_patch>',
    "机器可读块不会被朗读。若无法形成安全的局部补充，不要输出该块，只说明拒绝原因并给学生一个亲自完成的最小动作。",
  ].join("\n");
}

function plainText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function extractWorkspacePatch(response: string): {
  speech: string;
  patch?: CompanionWorkspacePatch;
} {
  const match = response.match(/<workspace_patch>\s*([\s\S]*?)\s*<\/workspace_patch>/i);
  const speech = response.replace(/<workspace_patch>[\s\S]*?<\/workspace_patch>/gi, "").trim();
  if (!match) return { speech };

  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>;
    const title = plainText(parsed.title, 40);
    const content = plainText(parsed.content, 600);
    const reviewInstruction = plainText(parsed.reviewInstruction, 160);
    if (parsed.mode !== "append" || !title || !content || !reviewInstruction) {
      return { speech };
    }
    return {
      speech,
      patch: { mode: "append", title, content, reviewInstruction },
    };
  } catch {
    return { speech };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export function appendCompanionContribution(input: {
  existingContent: string;
  patch: CompanionWorkspacePatch;
  companionId: string;
  companionName: string;
  taskId: string;
}): string {
  const contribution = [
    `<section data-companion-contribution="${escapeHtml(input.companionId)}" data-task-id="${escapeHtml(input.taskId)}">`,
    `<h3>${escapeHtml(input.patch.title)}</h3>`,
    `<p>${escapeHtml(input.patch.content).replace(/\n/g, "<br>")}</p>`,
    `<p><em>${escapeHtml(input.companionName)}提醒：${escapeHtml(input.patch.reviewInstruction)}</em></p>`,
    "</section>",
  ].join("");
  return [input.existingContent, contribution].filter(Boolean).join("\n");
}
