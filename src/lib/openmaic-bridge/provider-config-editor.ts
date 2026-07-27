// 閫傞厤灞傦細鍦?OpenMAIC 鍘熺敓 provider-config 涔嬪锛屾柊澧炲啓鍏ヨ兘鍔?// OpenMAIC 鍘熺敓 provider-config.ts 鍙涓嶅啓锛圷AML+env 鍙屾潵婧愶級
// 鏁欏笀璁剧疆 UI 闇€瑕佸啓鍏?server-providers.yml锛屾湰妯″潡鎻愪緵璇ヨ兘鍔?
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import {
  clearServerProviderConfigCache,
  initializeServerProviderConfig,
} from '@openmaic/lib/server/provider-config';
import { prisma, isDatabaseConfigured } from '@/lib/db/client';
import {
  decryptCredential,
  encryptCredential,
} from '@/lib/security/credential-encryption';
import { Prisma } from '@prisma/client';
import {
  getTtsCalibrationKey,
  mergeTtsVoiceTimingCalibrations,
  type TtsVoiceTimingCalibration,
} from '@openmaic/lib/audio/tts-timing';

export type ProviderSection = 'providers' | 'tts' | 'asr' | 'pdf' | 'image' | 'video' | 'web-search';

export interface ProviderEntry {
  apiKey: string;
  baseUrl?: string;
  models?: string[];
  enabled?: boolean;
  priority?: number;
  /**
   * 鏁欏笀鍦ㄨ缃〉鎸囧畾鐨勮 provider 榛樿妯″瀷 ID锛堟潵鑷?models 鍒楄〃涓殑鏌愪竴椤癸級銆?   * 褰撶敓鎴愯皟鐢ㄦ湭鎼哄甫 x-model 鏃讹紝resolveModel 浼氬洖閫€鍒版鍊笺€?   * 浠呯敤浜?LLM 娈碉紙providers锛夛紱鍏朵粬娈靛拷鐣ユ瀛楁銆?   */
  defaultModel?: string;
  defaultVoice?: string;
  timingCalibrations?: TtsVoiceTimingCalibration[];
}

const CONFIG_PATH = path.join(/* turbopackIgnore: true */ process.cwd(), 'server-providers.yml');

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
  // 娓呴櫎 OpenMAIC provider-config 妯″潡缂撳瓨锛堣瀹冧笅娆?getConfig() 鏃堕噸璇伙級
  invalidateProviderConfigCache();
}

let providerConfigWriteQueue = Promise.resolve();

async function withProviderConfigWrite<T>(operation: () => Promise<T>): Promise<T> {
  let result!: T;
  const queued = providerConfigWriteQueue.then(async () => {
    result = await operation();
  });
  providerConfigWriteQueue = queued.catch(() => undefined);
  await queued;
  return result;
}

/** Atomically merge one measured sample into the shared provider/voice aggregate. */
export async function mergeProviderTtsTimingCalibration(
  providerId: string,
  sample: TtsVoiceTimingCalibration,
): Promise<TtsVoiceTimingCalibration> {
  if (isDatabaseConfigured()) {
    const existingEntry = (await getProviderEntry('tts', providerId)) ?? { apiKey: '' };
    const calibrations = existingEntry.timingCalibrations ?? [];
    const key = getTtsCalibrationKey(sample);
    const existing = calibrations.find((item) => getTtsCalibrationKey(item) === key);
    const aggregate = mergeTtsVoiceTimingCalibrations(existing, sample);
    await saveProviderEntry('tts', providerId, {
      ...existingEntry,
      timingCalibrations: [
        ...calibrations.filter((item) => getTtsCalibrationKey(item) !== key),
        aggregate,
      ],
    });
    return aggregate;
  }
  return withProviderConfigWrite(async () => {
    const data = await readYaml();
    data.tts ??= {};
    const existingEntry = data.tts[providerId] ?? {};
    const calibrations = existingEntry.timingCalibrations ?? [];
    const key = getTtsCalibrationKey(sample);
    const existing = calibrations.find((item) => getTtsCalibrationKey(item) === key);
    const aggregate = mergeTtsVoiceTimingCalibrations(existing, sample);
    data.tts[providerId] = {
      ...existingEntry,
      apiKey: existingEntry.apiKey || '',
      timingCalibrations: [
        ...calibrations.filter((item) => getTtsCalibrationKey(item) !== key),
        aggregate,
      ],
    };
    await writeYaml(data);
    return aggregate;
  });
}

/**
 * 娓呴櫎 OpenMAIC provider-config 妯″潡绾х紦瀛樸€? * OpenMAIC 鐨?_configs Map 鏄鏈夊彉閲忥紝鎴戜滑鐢?require cache 澶辨晥鏉ュ己鍒堕噸杞姐€? */
function invalidateProviderConfigCache(): void {
  clearServerProviderConfigCache();
}

export async function saveProviderEntry(
  section: ProviderSection,
  providerId: string,
  entry: ProviderEntry,
): Promise<void> {
  if (isDatabaseConfigured()) {
    const existing = await prisma.providerCredential.findUnique({
      where: { section_providerId: { section, providerId } },
    });
    const apiKey = entry.apiKey ||
      (existing
        ? decryptCredential(
            existing.encryptedApiKey,
            existing.iv,
            existing.authTag,
            `${section}:${providerId}`,
          )
        : '');
    const encrypted = encryptCredential(apiKey, `${section}:${providerId}`);
    const config = providerConfigJson(entry, existing?.config);
    await prisma.providerCredential.upsert({
      where: { section_providerId: { section, providerId } },
      create: {
        section,
        providerId,
        encryptedApiKey: encrypted?.ciphertext,
        iv: encrypted?.iv,
        authTag: encrypted?.authTag,
        config,
      },
      update: {
        encryptedApiKey: encrypted?.ciphertext,
        iv: encrypted?.iv,
        authTag: encrypted?.authTag,
        config,
        version: { increment: 1 },
      },
    });
    await initializeServerProviderConfig();
    return;
  }
  await withProviderConfigWrite(async () => {
    const data = await readYaml();
    const sectionKey = section === 'web-search' ? 'web-search' : section;
    if (!data[sectionKey]) data[sectionKey] = {};
    const existing = data[sectionKey]![providerId] ?? {};
  // 淇濈暀宸叉湁 apiKey锛氬墠绔繚瀛樻椂鑻ヨ緭鍏ユ涓虹┖浼氫紶 undefined/绌轰覆锛?  // 姝ゆ椂涓嶅簲瑕嗙洊宸插瓨鍌ㄧ殑 API key锛堜粎褰撲紶鍏ヤ簡鏂伴潪绌哄€兼椂鎵嶆洿鏂帮級
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
    ...(entry.defaultVoice
      ? { defaultVoice: entry.defaultVoice }
      : existing.defaultVoice
        ? { defaultVoice: existing.defaultVoice }
        : {}),
    ...(entry.timingCalibrations
      ? { timingCalibrations: entry.timingCalibrations }
      : existing.timingCalibrations
        ? { timingCalibrations: existing.timingCalibrations }
        : {}),
    };
    await writeYaml(data);
  });
}

export async function deleteProviderEntry(
  section: ProviderSection,
  providerId: string,
): Promise<void> {
  if (isDatabaseConfigured()) {
    await prisma.providerCredential.deleteMany({ where: { section, providerId } });
    await initializeServerProviderConfig();
    return;
  }
  await withProviderConfigWrite(async () => {
    const data = await readYaml();
    const sectionKey = section === 'web-search' ? 'web-search' : section;
    if (!data[sectionKey]) return;
    delete data[sectionKey]![providerId];
    // Remove an empty section to keep the YAML compact.
    if (Object.keys(data[sectionKey]!).length === 0) {
      delete data[sectionKey];
    }
    await writeYaml(data);
  });
}

export async function getProviderEntry(
  section: ProviderSection,
  providerId: string,
): Promise<ProviderEntry | null> {
  if (isDatabaseConfigured()) {
    const row = await prisma.providerCredential.findUnique({
      where: { section_providerId: { section, providerId } },
    });
    return row ? providerRowToEntry(row) : null;
  }
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
    defaultVoice: entry.defaultVoice,
    timingCalibrations: entry.timingCalibrations,
  };
}

export async function listProviders(
  section: ProviderSection,
): Promise<Record<string, ProviderEntry>> {
  if (isDatabaseConfigured()) {
    const rows = await prisma.providerCredential.findMany({
      where: { section },
      orderBy: { providerId: 'asc' },
    });
    return Object.fromEntries(rows.map((row) => [row.providerId, providerRowToEntry(row)]));
  }
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
      defaultVoice: entry.defaultVoice,
      timingCalibrations: entry.timingCalibrations,
    };
  }
  return result;
}

function providerConfigJson(
  entry: ProviderEntry,
  existing: Prisma.JsonValue | null | undefined,
): Prisma.InputJsonValue {
  const previous =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return {
    ...previous,
    ...(entry.baseUrl ? { baseUrl: entry.baseUrl } : {}),
    ...(entry.models ? { models: entry.models } : {}),
    ...(entry.enabled !== undefined ? { enabled: entry.enabled } : {}),
    ...(entry.priority !== undefined ? { priority: entry.priority } : {}),
    ...(entry.defaultModel ? { defaultModel: entry.defaultModel } : {}),
    ...(entry.defaultVoice ? { defaultVoice: entry.defaultVoice } : {}),
    ...(entry.timingCalibrations ? { timingCalibrations: entry.timingCalibrations } : {}),
  } as Prisma.InputJsonValue;
}

function providerRowToEntry(row: {
  section: string;
  providerId: string;
  encryptedApiKey: Uint8Array | null;
  iv: Uint8Array | null;
  authTag: Uint8Array | null;
  config: Prisma.JsonValue;
}): ProviderEntry {
  const config =
    row.config && typeof row.config === 'object' && !Array.isArray(row.config)
      ? (row.config as Record<string, unknown>)
      : {};
  return {
    ...(config as Omit<ProviderEntry, 'apiKey'>),
    apiKey: decryptCredential(
      row.encryptedApiKey,
      row.iv,
      row.authTag,
      `${row.section}:${row.providerId}`,
    ),
  };
}

/**
 * 浠?.openpbl-data/ai-settings.json 杩佺Щ鍒?server-providers.yml 鐨?providers.openai
 * 浠呭湪棣栨鍚姩鏃舵墽琛岋紙濡傛灉 server-providers.yml 涓?providers.openai.apiKey 涓虹┖浣?.openpbl-data 涓湁鍊硷級
 */
export async function migrateLegacySettings(): Promise<void> {
  const openaiEntry = await readProviderEntryRaw('providers', 'openai');
  if (openaiEntry?.apiKey) return; // 宸叉湁閰嶇疆锛屼笉杩佺Щ

  try {
    const legacyPath = path.join(process.cwd(), '.openpbl-data', 'ai-settings.json');
    const raw = await readFile(legacyPath, 'utf8');
    const legacy = JSON.parse(raw) as { endpoint?: string; model?: string; apiKey?: string };
    if (!legacy.apiKey) return;

    // 鎺ㄦ柇 baseUrl锛氬鏋?endpoint 鏄?https://api.openai.com/v1 灏辩敤榛樿锛涘惁鍒欑敤 endpoint
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
  } catch {
    // 鏃犻仐鐣欓厤缃紝鏃犻渶杩佺Щ
  }
}

/**
 * 璇诲彇 provider entry锛堜笉瑙﹀彂杩佺Щ锛岄伩鍏嶅惊鐜緷璧栵級
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
    defaultVoice: entry.defaultVoice,
    timingCalibrations: entry.timingCalibrations,
  };
}

let _migrated = false;
async function ensureMigratedInternal(): Promise<void> {
  if (_migrated) return;
  _migrated = true;
  try {
    await migrateLegacySettings();
  } catch {
    // 闈欓粯澶辫触
  }
}
