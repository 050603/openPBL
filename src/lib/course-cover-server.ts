import {
  generateImage,
  IMAGE_PROVIDERS,
} from "@openmaic/lib/media/image-providers";
import type { ImageProviderId } from "@openmaic/lib/media/types";
import {
  getServerImageProviders,
  resolveImageApiKey,
  resolveImageBaseUrl,
} from "@openmaic/lib/server/provider-config";
import {
  buildCourseCoverPrompt,
  COURSE_COVER_GENERATION_SPEC,
  courseCoverResultUrl,
  type CourseCoverContext,
} from "@/lib/course-cover";

function isImageProviderId(value: string): value is ImageProviderId {
  return Object.prototype.hasOwnProperty.call(IMAGE_PROVIDERS, value);
}

export function resolveServerCourseCoverProvider(): {
  providerId: ImageProviderId;
  apiKey: string;
  baseUrl?: string;
  model?: string;
} {
  const configured = getServerImageProviders();
  for (const [providerId, metadata] of Object.entries(configured)) {
    if (!isImageProviderId(providerId) || metadata.disabled) continue;
    const apiKey = resolveImageApiKey(providerId);
    if (IMAGE_PROVIDERS[providerId].requiresApiKey && !apiKey) continue;
    return {
      providerId,
      apiKey,
      baseUrl: resolveImageBaseUrl(providerId),
      model: metadata.defaultModel || IMAGE_PROVIDERS[providerId].models[0]?.id,
    };
  }
  throw new Error("没有可用的服务端图片生成提供方");
}

/**
 * Background workers have no teacher browser cookie. Calling the protected
 * Next API over HTTP therefore returns 401 when auth is enabled. Generate via
 * the same server-managed provider directly instead.
 */
export async function generateCourseCoverImageOnServer(
  course: CourseCoverContext,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  const config = resolveServerCourseCoverProvider();
  const result = await generateImage(config, {
    prompt: buildCourseCoverPrompt(course),
    ...COURSE_COVER_GENERATION_SPEC,
  });
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  const imageUrl = courseCoverResultUrl(result);
  if (!imageUrl) throw new Error("图片提供方未返回封面地址或图片数据");
  return imageUrl;
}
