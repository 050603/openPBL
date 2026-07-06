import { readAiSettings } from "@/lib/llm/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const settings = await readAiSettings();
  if (!settings.endpoint || !settings.apiKey) {
    return Response.json(
      { ok: false, message: "请先填写模型服务地址和 API Key" },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(settings.endpoint.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: "user", content: "请回复 openPBL 连接正常。" }],
        temperature: 0,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return Response.json(
        { ok: false, message: `连接失败：${res.status} ${text.slice(0, 120)}` },
        { status: 502 },
      );
    }
    return Response.json({ ok: true, message: "模型连接正常" });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "连接失败" },
      { status: 502 },
    );
  }
}
