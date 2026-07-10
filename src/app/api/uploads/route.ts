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
    return Response.json({ error: "文件不存在" }, { status: 404 });
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
