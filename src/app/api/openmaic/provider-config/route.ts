// 给教师设置页用：返回每个 provider 的详细配置（不含 apiKey，只含 hasApiKey 标志）
import { type NextRequest } from 'next/server';
import {
  listProviders,
  saveProviderEntry,
  deleteProviderEntry,
  type ProviderSection,
} from '@/lib/openmaic-bridge/provider-config-editor';
import { apiError, apiSuccess, API_ERROR_CODES } from '@openmaic/lib/server/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const section = (request.nextUrl.searchParams.get('section') ?? 'providers') as ProviderSection;
    const providers = await listProviders(section);
    // 不返回 apiKey，只返回 hasApiKey 标志
    const safe = Object.fromEntries(
      Object.entries(providers).map(([id, entry]) => [
        id,
        {
          baseUrl: entry.baseUrl,
          models: entry.models,
          enabled: entry.enabled,
          hasApiKey: Boolean(entry.apiKey),
          defaultModel: entry.defaultModel,
          priority: entry.priority,
        },
      ]),
    );
    return apiSuccess({ section, providers: safe });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { section, providerId, apiKey, baseUrl, models, enabled, defaultModel, priority } = body as {
      section: ProviderSection;
      providerId: string;
      apiKey?: string;
      baseUrl?: string;
      models?: string[];
      enabled?: boolean;
      defaultModel?: string;
      priority?: number;
    };
    if (!section || !providerId) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'section and providerId are required',
      );
    }
    await saveProviderEntry(section, providerId, {
      apiKey: apiKey ?? '',
      baseUrl,
      models,
      enabled,
      defaultModel,
      priority,
    });
    return apiSuccess({ ok: true });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { section, providerId } = body as {
      section: ProviderSection;
      providerId: string;
    };
    if (!section || !providerId) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'section and providerId are required',
      );
    }
    await deleteProviderEntry(section, providerId);
    return apiSuccess({ ok: true });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
