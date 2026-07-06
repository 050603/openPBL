// 适配层：在 OpenMAIC 原生 provider-config 之外，新增写入能力
// OpenMAIC 原生 provider-config.ts 只读不写（YAML+env 双来源）
// 教师设置 UI 需要写入 server-providers.yml，本模块提供该能力

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { clearServerProviderConfigCache } from '@openmaic/lib/server/provider-config';

export type ProviderSection = 'providers' | 'tts' | 'asr' | 'pdf' | 'image' | 'video' | 'web-search';

export interface ProviderEntry {
  apiKey: string;
  baseUrl?: string;
  models?: string[];
  enabled?: boolean;
  priority?: number;
  /**
   * 教师在设置页指定的该 provider 默认模型 ID（来自 models 列表中的某一项）。
   * 当生成调用未携带 x-model 时，resolveModel 会回退到此值。
   * 仅用于 LLM 段（providers）；其他段忽略此字段。
   */
  defaultModel?: string;
}

const CONFIG_PATH = path.join(process.cwd(), 'server-providers.yml');

interface ServerProvidersYaml {
  providers?: Record<string, Partial<ProviderEntry>>;
  tts?: Record<string, Partial<ProviderEntry>>;
  asr?: Record<string, Partial<ProviderEntry>>;
  pdf?: Record<string, Partial<ProviderEntry>>;
  image?: Record<string, Partial<ProviderEntry>>;
  video?: Record<string, Partial<ProviderEntry>>;
  'web-search'?: Record<string, Partial<ProviderEntry>>;
}

async function readYaml(): Promise<ServerProvidersYaml> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    return (yaml.load(raw) as ServerProvidersYaml) ?? {};
  } catch {
    return {};
  }
}

async function writeYaml(data: ServerProvidersYaml): Promise<void> {
  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  const raw = yaml.dump(data, { lineWidth: 120, noRefs: true });
  await writeFile(CONFIG_PATH, raw, 'utf8');
  // 清除 OpenMAIC provider-config 模块缓存（让它下次 getConfig() 时重读）
  invalidateProviderConfigCache();
}

/**
 * 清除 OpenMAIC provider-config 模块级缓存。
 * OpenMAIC 的 _configs Map 是私有变量，我们用 require cache 失效来强制重载。
 */
function invalidateProviderConfigCache(): void {
  clearServerProviderConfigCache();

  try {
    // 通过 globalThis 访问 require，兼容 ESM/Next.js 环境
    const g = globalThis as {
      require?: {
        resolve: (id: string) => string;
        cache: Record<string, unknown>;
      };
    };
    if (!g.require) return;
    const modulePath = g.require.resolve('@openmaic/lib/server/provider-config');
    delete g.require.cache[modulePath];
  } catch {
    // 在 Next.js dev 模式下可能用 ESM，跳过；生产环境通常一次配置不变
  }
}

export async function saveProviderEntry(
  section: ProviderSection,
  providerId: string,
  entry: ProviderEntry,
): Promise<void> {
  const data = await readYaml();
  const sectionKey = section === 'web-search' ? 'web-search' : section;
  if (!data[sectionKey]) data[sectionKey] = {};
  const existing = data[sectionKey]![providerId] ?? {};
  // 保留已有 apiKey：前端保存时若输入框为空会传 undefined/空串，
  // 此时不应覆盖已存储的 API key（仅当传入了新非空值时才更新）
  const apiKey = entry.apiKey || existing.apiKey || '';
  data[sectionKey]![providerId] = {
    apiKey,
    ...(entry.baseUrl ? { baseUrl: entry.baseUrl } : existing.baseUrl ? { baseUrl: existing.baseUrl } : {}),
    ...(entry.models && entry.models.length > 0
      ? { models: entry.models }
      : existing.models && existing.models.length > 0
        ? { models: existing.models }
        : {}),
    ...(entry.enabled !== undefined ? { enabled: entry.enabled } : existing.enabled !== undefined ? { enabled: existing.enabled } : {}),
    ...(typeof entry.priority === 'number'
      ? { priority: entry.priority }
      : typeof existing.priority === 'number'
        ? { priority: existing.priority }
        : {}),
    ...(entry.defaultModel
      ? { defaultModel: entry.defaultModel }
      : existing.defaultModel
        ? { defaultModel: existing.defaultModel }
        : {}),
  };
  await writeYaml(data);
}

export async function deleteProviderEntry(
  section: ProviderSection,
  providerId: string,
): Promise<void> {
  const data = await readYaml();
  const sectionKey = section === 'web-search' ? 'web-search' : section;
  if (!data[sectionKey]) return;
  delete data[sectionKey]![providerId];
  // 段为空时移除段，保持 yml 简洁
  if (Object.keys(data[sectionKey]!).length === 0) {
    delete data[sectionKey];
  }
  await writeYaml(data);
}

export async function getProviderEntry(
  section: ProviderSection,
  providerId: string,
): Promise<ProviderEntry | null> {
  await ensureMigratedInternal();
  const data = await readYaml();
  const sectionKey = section === 'web-search' ? 'web-search' : section;
  const entry = data[sectionKey]?.[providerId];
  if (!entry) return null;
  return {
    apiKey: entry.apiKey || '',
    baseUrl: entry.baseUrl,
    models: entry.models,
    enabled: entry.enabled,
    priority: typeof entry.priority === 'number' ? entry.priority : undefined,
    defaultModel: entry.defaultModel,
  };
}

export async function listProviders(
  section: ProviderSection,
): Promise<Record<string, ProviderEntry>> {
  await ensureMigratedInternal();
  const data = await readYaml();
  const sectionKey = section === 'web-search' ? 'web-search' : section;
  const sectionData = data[sectionKey] ?? {};
  const result: Record<string, ProviderEntry> = {};
  for (const [id, entry] of Object.entries(sectionData)) {
    if (!entry) continue;
    result[id] = {
      apiKey: entry.apiKey || '',
      baseUrl: entry.baseUrl,
      models: entry.models,
      enabled: entry.enabled,
      priority: typeof entry.priority === 'number' ? entry.priority : undefined,
      defaultModel: entry.defaultModel,
    };
  }
  return result;
}

/**
 * 从 .openpbl-data/ai-settings.json 迁移到 server-providers.yml 的 providers.openai
 * 仅在首次启动时执行（如果 server-providers.yml 中 providers.openai.apiKey 为空但 .openpbl-data 中有值）
 */
export async function migrateLegacySettings(): Promise<void> {
  const openaiEntry = await readProviderEntryRaw('providers', 'openai');
  if (openaiEntry?.apiKey) return; // 已有配置，不迁移

  try {
    const legacyPath = path.join(process.cwd(), '.openpbl-data', 'ai-settings.json');
    const raw = await readFile(legacyPath, 'utf8');
    const legacy = JSON.parse(raw) as { endpoint?: string; model?: string; apiKey?: string };
    if (!legacy.apiKey) return;

    // 推断 baseUrl：如果 endpoint 是 https://api.openai.com/v1 就用默认；否则用 endpoint
    const baseUrl =
      legacy.endpoint && legacy.endpoint !== 'https://api.openai.com/v1'
        ? legacy.endpoint
        : 'https://api.openai.com/v1';
    const models = legacy.model ? [legacy.model] : ['gpt-5.4-mini'];

    await saveProviderEntry('providers', 'openai', {
      apiKey: legacy.apiKey,
      baseUrl,
      models,
    });
    console.log('[openmaic-bridge] Migrated legacy .openpbl-data settings to server-providers.yml');
  } catch {
    // 无遗留配置，无需迁移
  }
}

/**
 * 读取 provider entry（不触发迁移，避免循环依赖）
 */
async function readProviderEntryRaw(
  section: ProviderSection,
  providerId: string,
): Promise<ProviderEntry | null> {
  const data = await readYaml();
  const sectionKey = section === 'web-search' ? 'web-search' : section;
  const entry = data[sectionKey]?.[providerId];
  if (!entry) return null;
  return {
    apiKey: entry.apiKey || '',
    baseUrl: entry.baseUrl,
    models: entry.models,
    enabled: entry.enabled,
    priority: typeof entry.priority === 'number' ? entry.priority : undefined,
    defaultModel: entry.defaultModel,
  };
}

let _migrated = false;
async function ensureMigratedInternal(): Promise<void> {
  if (_migrated) return;
  _migrated = true;
  try {
    await migrateLegacySettings();
  } catch {
    // 静默失败
  }
}
