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
import { splitGeneratedClassroom } from '@/lib/openmaic-bridge/server-classroom-split';
import type { SceneOutline } from '@openmaic/lib/types/generation';
import {
  isPblModuleTimingPlanConfirmed,
  type PblModuleTimingPlan,
} from '@/lib/pbl-time-model';
import {
  isAbortError,
  throwIfAborted,
} from '@openmaic/lib/generation/generation-retry';

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
    pblProfile,
    moduleTimingPlan,
    pblTeachingActivities,
    pblActivityCatalog,
    knowledgePoints,
    courseId,
    courseTitle,
    sceneOutlines: rawSceneOutlines,
    enableWebSearch = false,
    enableImageGeneration = false,
    enableVideoGeneration = false,
    enableTTS = false,
    ttsProviderId,
    ttsModelId,
    ttsSpeed,
    ttsLanguage,
    agentMode = 'default',
  } = body as {
    requirement?: string;
    pblProfile?: import('@openmaic/lib/types/generation').UserRequirements['pblProfile'];
    moduleTimingPlan?: PblModuleTimingPlan;
    pblTeachingActivities?: import('@openmaic/lib/types/generation').UserRequirements['pblTeachingActivities'];
    pblActivityCatalog?: import('@openmaic/lib/types/generation').UserRequirements['pblActivityCatalog'];
    knowledgePoints?: Array<{ id: string; name?: string }>;
    courseId?: string;
    courseTitle?: string;
    sceneOutlines?: unknown;
    enableWebSearch?: boolean;
    enableImageGeneration?: boolean;
    enableVideoGeneration?: boolean;
    enableTTS?: boolean;
    ttsProviderId?: string;
    ttsModelId?: string;
    ttsSpeed?: number;
    ttsLanguage?: string;
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

  if (
    pblProfile?.generationTemplate === 'pbl-six-stage'
    && !isPblModuleTimingPlanConfirmed(moduleTimingPlan)
  ) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      400,
      'PBL module timing must be confirmed before classroom generation',
    );
  }

  const baseUrl = buildRequestOrigin(request);
  const sceneOutlines = normalizeSceneOutlines(rawSceneOutlines);
  const encoder = new TextEncoder();
  const generationController = new AbortController();
  const abortGeneration = () => {
    if (!generationController.signal.aborted) {
      generationController.abort(request.signal.reason);
    }
  };
  const onRequestAbort = () => abortGeneration();
  if (request.signal.aborted) {
    abortGeneration();
  } else {
    request.signal.addEventListener('abort', onRequestAbort, { once: true });
  }
  const signal = generationController.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 心跳：防止代理/浏览器在长时间无数据时关闭连接
      const heartbeatTimer = setInterval(() => {
        if (signal.aborted) {
          clearInterval(heartbeatTimer);
          return;
        }
        try {
          controller.enqueue(encoder.encode(`:heartbeat\n\n`));
        } catch {
          abortGeneration();
          // controller 已关闭，忽略
        }
      }, HEARTBEAT_INTERVAL_MS);

      const send = (obj: unknown) => {
        if (signal.aborted) return false;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          return true;
        } catch {
          abortGeneration();
          // controller 已关闭，忽略
        }
      };

      try {
        throwIfAborted(signal);
        log.info(
          `Starting classroom generation [courseId=${courseId ?? 'none'}, reqLen=${requirement.length}]`,
        );

        const result = await generateClassroom(
          {
            requirement,
            pblProfile,
            pblTeachingActivities,
            pblActivityCatalog,
            knowledgePoints,
            courseTitle,
            sceneOutlines,
            enableWebSearch,
            enableImageGeneration,
            enableVideoGeneration,
            enableTTS,
            ttsProviderId: typeof ttsProviderId === 'string' ? ttsProviderId : undefined,
            ttsModelId: typeof ttsModelId === 'string' ? ttsModelId : undefined,
            ttsSpeed: typeof ttsSpeed === 'number' ? ttsSpeed : undefined,
            ttsLanguage: typeof ttsLanguage === 'string' ? ttsLanguage : undefined,
            agentMode: normalizeAgentMode(agentMode),
          },
          {
            baseUrl,
            signal,
            onProgress: (progress) => {
              throwIfAborted(signal);
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

        throwIfAborted(signal);
        const splitResult = await splitGeneratedClassroom({
          stage: result.stage,
          scenes: result.scenes,
          courseName: courseTitle,
          baseUrl,
          pblMode:
            pblProfile?.generationTemplate === 'pbl-six-stage' ||
            Boolean(pblTeachingActivities?.length),
          signal,
        });

        // 关联到 openPBL 课程。此时学生课堂已经完成服务端分流，绝不再
        // 把含教师资源的原始全量课堂暴露给学生端。
        if (courseId) {
          throwIfAborted(signal);
          await linkClassroomToCourse(courseId, splitResult.studentClassroomId, {
            scenesCount: splitResult.studentSceneCount,
            stageName: result.stage.name,
            teacherClassroomId: splitResult.teacherClassroomId,
            teacherResourceScenes: splitResult.teacherResourceScenes,
          }, { signal });
        }

        throwIfAborted(signal);
        log.info(
          `Classroom generation completed [id=${result.id}, scenes=${result.scenesCount}]`,
        );

        send({
          type: 'done',
          id: result.id,
          url: result.url,
          scenesCount: splitResult.studentSceneCount,
          studentSceneCount: splitResult.studentSceneCount,
          teacherSceneCount: splitResult.teacherSceneCount,
          teacherClassroomId: splitResult.teacherClassroomId,
          teacherResourceScenes: splitResult.teacherResourceScenes,
          pblCoverage: splitResult.pblCoverage,
          stage: { id: result.stage.id, name: result.stage.name },
        });
      } catch (error) {
        if (signal.aborted || isAbortError(error)) {
          return;
        }
        log.error('Classroom generation failed:', error);
        send({
          type: 'error',
          error: 'Failed to generate classroom',
          details: error instanceof Error ? error.message : String(error),
        });
      } finally {
        clearInterval(heartbeatTimer);
        request.signal.removeEventListener('abort', onRequestAbort);
        try {
          controller.close();
        } catch {
          // controller 已关闭，忽略
        }
      }
    },
    cancel() {
      abortGeneration();
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
