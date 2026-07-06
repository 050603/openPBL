import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataDir = path.join(process.cwd(), ".openpbl-data", "uploads");

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "");

  if (!(file instanceof File)) {
    return Response.json({ error: "缺少上传文件" }, { status: 400 });
  }

  await mkdir(dataDir, { recursive: true });
  const ext = path.extname(file.name);
  const safeBase = path
    .basename(file.name, ext)
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, "-")
    .slice(0, 80);
  const storedName = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safeBase || "file"}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dataDir, storedName), buffer);

  return Response.json({
    id: `upload-${storedName}`,
    title: title || file.name,
    fileName: file.name,
    fileType: inferFileType(file.name, file.type),
    size: formatSize(file.size),
    url: `/api/uploads?file=${encodeURIComponent(storedName)}`,
  });
}

export async function GET(request: NextRequest) {
  const fileName = request.nextUrl.searchParams.get("file");
  if (!fileName) {
    return Response.json({ error: "缺少文件名" }, { status: 400 });
  }

  const safeName = path.basename(fileName);
  const target = path.join(dataDir, safeName);
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(dataDir))) {
    return Response.json({ error: "非法文件路径" }, { status: 400 });
  }

  try {
    const [buffer, info] = await Promise.all([readFile(resolved), stat(resolved)]);
    return new Response(buffer, {
      headers: {
        "Content-Type": contentTypeFor(safeName),
        "Content-Length": String(info.size),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      },
    });
  } catch {
    const demo = demoFile(safeName);
    if (!demo) return Response.json({ error: "文件不存在" }, { status: 404 });
    return new Response(demo.body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      },
    });
  }
}

function inferFileType(fileName: string, mime: string): string {
  const ext = path.extname(fileName).replace(".", "").toUpperCase();
  if (ext) return ext;
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("presentation")) return "PPTX";
  if (mime.includes("spreadsheet")) return "XLSX";
  if (mime.includes("video")) return "MP4";
  return "FILE";
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function contentTypeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function demoFile(fileName: string): { body: string } | undefined {
  const demos: Record<string, string> = {
    "demo-project-brief.txt": "校园低碳生活解决方案项目说明：请围绕真实校园场景开展调研、构思、制作与汇报。",
    "demo-campus-data.txt": "月份,用电量,纸张消耗\n2024-01,5320,180\n2024-02,4980,166\n2024-03,5760,202",
    "demo-rubric.txt": "评价量规：问题识别20%，方案创新20%，可行性25%，数据论证15%，展示表达10%，团队协作10%。",
  };
  const body = demos[fileName];
  return body ? { body } : undefined;
}
