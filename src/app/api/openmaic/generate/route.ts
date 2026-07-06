// 课堂生成端点（SSE 流式响应）
// 调用 OpenMAIC 原生 generateClassroom()，通过 SSE 把生成进度推送给客户端
// 参数验证失败仍返回 JSON 错误（保持兼容），验证通过后返回 text/event-stream

import { type NextRequest } from 'next/server';
import { generateClassroom } from '@openmaic/lib/server/classroom-generation';
import {
  apiError,
  API_ERROR_CODES,
} from '@openmaic/lib/server/api-response';
import { createLogger } from '@openmaic/lib/logger';
import { linkClassroomToCourse } from '@/lib/openmaic-bridge/course-linker';
import type { SceneOutline } from '@openmaic/lib/types/generation';

const log = createLogger('GenerateAPI');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel: 5 分钟上限

const HEARTBEAT_INTERVAL_MS = 15_000;
const SCENE_OUTLINE_TYPES = new Set(['slide', 'quiz', 'interactive', 'pbl']);

function normalizeSceneOutlines(input: unknown): SceneOutline[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return input
    .map((item, index) => {
      const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const type =
        typeof raw.type === 'string' && SCENE_OUTLINE_TYPES.has(raw.type) ? raw.type : 'slide';
      const title =
        typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : `Scene ${index + 1}`;
      return {
        ...raw,
        id: typeof raw.id === 'string' && raw.id ? raw.id : `scene-${index + 1}`,
        type: type as SceneOutline['type'],
        title,
        description:
          typeof raw.description === 'string' && raw.description.trim()
            ? raw.description.trim()
            : title,
        keyPoints: Array.isArray(raw.keyPoints)
          ? raw.keyPoints.filter((x): x is string => typeof x === 'string')
          : [],
        estimatedDuration:
          typeof raw.estimatedDuration === 'number' ? raw.estimatedDuration : 300,
        order: index,
      } as SceneOutline;
    })
    .filter((outline) => outline.title);
}

function normalizeAgentMode(input: unknown): 'default' | 'generate' {
  return input === 'generate' ? 'generate' : 'default';
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Invalid JSON body');
  }

  const {
    requirement,
    courseId,
    courseTitle,
    sceneOutlines: rawSceneOutlines,
    enableWebSearch = false,
    enableImageGeneration = false,
    enableVideoGeneration = false,
    enableTTS = false,
    agentMode = 'default',
  } = body as {
    requirement?: string;
    courseId?: string;
    courseTitle?: string;
    sceneOutlines?: unknown;
    enableWebSearch?: boolean;
    enableImageGeneration?: boolean;
    enableVideoGeneration?: boolean;
    enableTTS?: boolean;
    agentMode?: unknown;
  };

  // 参数验证失败：仍返回 JSON 错误（HTTP 400），不进入 SSE 流
  if (!requirement || typeof requirement !== 'string') {
    return apiError(
      API_ERROR_CODES.MISSING_REQUIRED_FIELD,
      400,
      'Missing required field: requirement (string)',
    );
  }

  const baseUrl = buildRequestOrigin(request);
  const sceneOutlines = normalizeSceneOutlines(rawSceneOutlines);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 心跳：防止代理/浏览器在长时间无数据时关闭连接
      const heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`:heartbeat\n\n`));
        } catch {
          // controller 已关闭，忽略
        }
      }, HEARTBEAT_INTERVAL_MS);

      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          // controller 已关闭，忽略
        }
      };

      try {
        log.info(
          `Starting classroom generation [courseId=${courseId ?? 'none'}, reqLen=${requirement.length}]`,
        );

        const result = await generateClassroom(
          {
            requirement,
            courseTitle,
            sceneOutlines,
            enableWebSearch,
            enableImageGeneration,
            enableVideoGeneration,
            enableTTS,
            agentMode: normalizeAgentMode(agentMode),
          },
          {
            baseUrl,
            onProgress: (progress) => {
              log.info(
                `[Generation progress] ${progress.step}: ${progress.progress}% - ${progress.message}`,
              );
              send({
                type: 'progress',
                step: progress.step,
                progress: progress.progress,
                message: progress.message,
              });
            },
          },
        );

        // 关联到 openPBL 课程
        if (courseId) {
          await linkClassroomToCourse(courseId, result.id, {
            scenesCount: result.scenesCount,
            stageName: result.stage.name,
          });
        }

        log.info(
          `Classroom generation completed [id=${result.id}, scenes=${result.scenesCount}]`,
        );

        send({
          type: 'done',
          id: result.id,
          url: result.url,
          scenesCount: result.scenesCount,
          stage: { id: result.stage.id, name: result.stage.name },
        });
      } catch (error) {
        log.error('Classroom generation failed:', error);
        send({
          type: 'error',
          error: 'Failed to generate classroom',
          details: error instanceof Error ? error.message : String(error),
        });
      } finally {
        clearInterval(heartbeatTimer);
        try {
          controller.close();
        } catch {
          // controller 已关闭，忽略
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // 禁用缓冲，确保进度实时推送
      'X-Accel-Buffering': 'no',
    },
  });
}

function buildRequestOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  const host = request.headers.get('host');
  if (host) {
    const proto = host.startsWith('localhost') ? 'http' : 'https';
    return `${proto}://${host}`;
  }
  return 'http://localhost:3000';
}
