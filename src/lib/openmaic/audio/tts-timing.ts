/**
 * Static TTS timing profiles and content budgets.
 *
 * The TTS provider registry describes API capabilities. This registry describes
 * the timing characteristics needed by the course planner. Keeping the two
 * concerns separate means a new provider can be added to the timing model
 * without changing any generation or playback code.
 */

export type TtsSpeechUnit = 'cjk-char' | 'latin-word' | 'mixed-unit';

export type TtsTimingProfile = {
  id: string;
  providerId: string;
  modelId: string;
  label: string;
  cjkCharsPerMinute: number;
  latinWordsPerMinute: number;
  punctuationPauseSec: number;
  defaultSpeed: number;
  source: 'seed' | 'configured';
};

export type TtsContentBudget = {
  unit: TtsSpeechUnit;
  targetUnits: number;
  minUnits: number;
  maxUnits: number;
  targetDurationSec: number;
  effectiveCharsPerMinute?: number;
  effectiveWordsPerMinute?: number;
};

export type TtsTimingPlan = {
  providerId: string;
  modelId: string;
  profileId: string;
  language: string;
  speed: number;
  contentType: string;
  /** Total activity budget; targetDurationSec is the narration budget. */
  activityTargetDurationSec?: number;
  targetDurationSec: number;
  unit: TtsSpeechUnit;
  targetUnits: number;
  minUnits: number;
  maxUnits: number;
};

export type TtsDurationAssessment = {
  targetSec: number;
  actualSec: number;
  errorRatio: number;
  absoluteErrorRatio: number;
  tolerance: number;
  withinTolerance: boolean;
  status: 'within' | 'under' | 'over';
  suggestions: string[];
};

const DEFAULT_PROFILE: TtsTimingProfile = {
  id: 'default:zh-CN',
  providerId: 'default',
  modelId: 'default',
  label: '默认普通话 TTS',
  // Static defaults are intentionally conservative and can be replaced by an
  // explicitly configured model profile.
  cjkCharsPerMinute: 270,
  latinWordsPerMinute: 150,
  punctuationPauseSec: 0.18,
  defaultSpeed: 1,
  source: 'seed',
};

const PROFILE_SEEDS: readonly Omit<TtsTimingProfile, 'source'>[] = [
  { id: 'openai-tts:gpt-4o-mini-tts', providerId: 'openai-tts', modelId: 'gpt-4o-mini-tts', label: 'OpenAI GPT-4o Mini TTS', cjkCharsPerMinute: 270, latinWordsPerMinute: 155, punctuationPauseSec: 0.18, defaultSpeed: 1 },
  { id: 'openai-tts:tts-1', providerId: 'openai-tts', modelId: 'tts-1', label: 'OpenAI TTS-1', cjkCharsPerMinute: 265, latinWordsPerMinute: 150, punctuationPauseSec: 0.18, defaultSpeed: 1 },
  { id: 'openai-tts:tts-1-hd', providerId: 'openai-tts', modelId: 'tts-1-hd', label: 'OpenAI TTS-1 HD', cjkCharsPerMinute: 260, latinWordsPerMinute: 145, punctuationPauseSec: 0.18, defaultSpeed: 1 },
  { id: 'azure-tts:default', providerId: 'azure-tts', modelId: '', label: 'Azure Neural TTS', cjkCharsPerMinute: 255, latinWordsPerMinute: 145, punctuationPauseSec: 0.2, defaultSpeed: 1 },
  { id: 'glm-tts:glm-tts', providerId: 'glm-tts', modelId: 'glm-tts', label: 'GLM TTS', cjkCharsPerMinute: 270, latinWordsPerMinute: 150, punctuationPauseSec: 0.18, defaultSpeed: 1 },
  { id: 'qwen-tts:qwen3-tts-flash', providerId: 'qwen-tts', modelId: 'qwen3-tts-flash', label: '通义千问 TTS Flash', cjkCharsPerMinute: 275, latinWordsPerMinute: 155, punctuationPauseSec: 0.17, defaultSpeed: 1 },
  { id: 'qwen-tts:qwen3-tts-instruct-flash', providerId: 'qwen-tts', modelId: 'qwen3-tts-instruct-flash', label: '通义千问 TTS Instruct Flash', cjkCharsPerMinute: 270, latinWordsPerMinute: 150, punctuationPauseSec: 0.18, defaultSpeed: 1 },
  { id: 'qwen-tts:qwen-tts', providerId: 'qwen-tts', modelId: 'qwen-tts', label: '通义千问 TTS', cjkCharsPerMinute: 265, latinWordsPerMinute: 150, punctuationPauseSec: 0.18, defaultSpeed: 1 },
  { id: 'minimax-tts:speech-2.8-hd', providerId: 'minimax-tts', modelId: 'speech-2.8-hd', label: 'MiniMax Speech 2.8 HD', cjkCharsPerMinute: 285, latinWordsPerMinute: 160, punctuationPauseSec: 0.16, defaultSpeed: 1 },
  { id: 'minimax-tts:speech-2.8-turbo', providerId: 'minimax-tts', modelId: 'speech-2.8-turbo', label: 'MiniMax Speech 2.8 Turbo', cjkCharsPerMinute: 300, latinWordsPerMinute: 170, punctuationPauseSec: 0.15, defaultSpeed: 1 },
  { id: 'minimax-tts:speech-2.6-hd', providerId: 'minimax-tts', modelId: 'speech-2.6-hd', label: 'MiniMax Speech 2.6 HD', cjkCharsPerMinute: 280, latinWordsPerMinute: 155, punctuationPauseSec: 0.17, defaultSpeed: 1 },
  { id: 'doubao-tts:default', providerId: 'doubao-tts', modelId: '', label: '豆包 TTS 2.0', cjkCharsPerMinute: 285, latinWordsPerMinute: 160, punctuationPauseSec: 0.16, defaultSpeed: 1 },
  { id: 'elevenlabs-tts:eleven_multilingual_v2', providerId: 'elevenlabs-tts', modelId: 'eleven_multilingual_v2', label: 'ElevenLabs Multilingual v2', cjkCharsPerMinute: 250, latinWordsPerMinute: 145, punctuationPauseSec: 0.2, defaultSpeed: 1 },
  { id: 'lemonade-tts:kokoro-v1', providerId: 'lemonade-tts', modelId: 'kokoro-v1', label: 'Lemonade Kokoro', cjkCharsPerMinute: 260, latinWordsPerMinute: 150, punctuationPauseSec: 0.18, defaultSpeed: 1 },
  { id: 'voxcpm-tts:voxcpm2', providerId: 'voxcpm-tts', modelId: 'voxcpm2', label: 'VoxCPM2', cjkCharsPerMinute: 240, latinWordsPerMinute: 135, punctuationPauseSec: 0.22, defaultSpeed: 1 },
  { id: 'browser-native-tts:default', providerId: 'browser-native-tts', modelId: '', label: '浏览器原生 TTS', cjkCharsPerMinute: 245, latinWordsPerMinute: 135, punctuationPauseSec: 0.22, defaultSpeed: 1 },
];

export const TTS_TIMING_PROFILES: readonly TtsTimingProfile[] = PROFILE_SEEDS.map((profile) => ({
  ...profile,
  source: 'seed' as const,
}));

const runtimeProfiles = new Map<string, TtsTimingProfile>();

/** Register a new model without changing the provider implementation. */
export function registerTtsTimingProfile(
  profile: Omit<TtsTimingProfile, 'source'> & { source?: TtsTimingProfile['source'] },
): TtsTimingProfile {
  const normalized: TtsTimingProfile = {
    ...profile,
    providerId: profile.providerId.trim(),
    modelId: profile.modelId.trim(),
    id: profile.id.trim() || `${profile.providerId}:${profile.modelId || 'default'}`,
    cjkCharsPerMinute: Math.max(1, profile.cjkCharsPerMinute),
    latinWordsPerMinute: Math.max(1, profile.latinWordsPerMinute),
    punctuationPauseSec: Math.max(0, profile.punctuationPauseSec),
    defaultSpeed: clamp(profile.defaultSpeed || 1, 0.25, 4),
    source: profile.source ?? 'configured',
  };
  runtimeProfiles.set(`${normalized.providerId}:${normalized.modelId}`, normalized);
  return normalized;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeModelId(modelId?: string): string {
  return modelId?.trim() || '';
}

export function getTtsTimingProfile(providerId?: string, modelId?: string): TtsTimingProfile {
  const provider = providerId?.trim() || DEFAULT_PROFILE.providerId;
  const model = normalizeModelId(modelId);
  const runtimeExact = runtimeProfiles.get(`${provider}:${model}`);
  if (runtimeExact) return runtimeExact;
  const runtimeDefault = runtimeProfiles.get(`${provider}:`);
  if (runtimeDefault && !model) return runtimeDefault;
  const exact = TTS_TIMING_PROFILES.find(
    (profile) => profile.providerId === provider && profile.modelId === model,
  );
  if (exact) return exact;

  const providerDefault = TTS_TIMING_PROFILES.find(
    (profile) => profile.providerId === provider && (!profile.modelId || profile.id.endsWith(':default')),
  );
  if (providerDefault) {
    return model && providerDefault.modelId !== model
      ? { ...providerDefault, id: `${provider}:${model}`, modelId: model, label: `${providerDefault.label} (${model})` }
      : providerDefault;
  }

  const providerProfile = TTS_TIMING_PROFILES.find((profile) => profile.providerId === provider);
  if (providerProfile) {
    return model && providerProfile.modelId !== model
      ? { ...providerProfile, id: `${provider}:${model}`, modelId: model, label: `${providerProfile.label} (${model})` }
      : providerProfile;
  }
  if (provider !== DEFAULT_PROFILE.providerId || model) {
    return {
      ...DEFAULT_PROFILE,
      id: `${provider}:${model || 'default'}`,
      providerId: provider,
      modelId: model,
      label: `${provider}${model ? ` (${model})` : ''}`,
    };
  }
  return DEFAULT_PROFILE;
}

function countSpeechUnits(text: string): {
  cjkChars: number;
  latinWords: number;
  otherChars: number;
  punctuation: number;
} {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const cjkChars = (normalized.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinWords = (normalized.match(/[A-Za-z]+(?:['’][A-Za-z]+)?|\d+(?:\.\d+)?/g) ?? []).length;
  const punctuation = (normalized.match(/[，。！？；：、,.!?;:]/g) ?? []).length;
  const otherChars = Math.max(0, normalized.length - cjkChars - latinWords - punctuation);
  return { cjkChars, latinWords, otherChars, punctuation };
}

export function estimateSpeechDurationSec(
  text: string,
  options: {
    profile?: TtsTimingProfile;
    providerId?: string;
    modelId?: string;
    speed?: number;
    minSeconds?: number;
  } = {},
): number {
  const profile = options.profile ?? getTtsTimingProfile(options.providerId, options.modelId);
  const speed = clamp(Number(options.speed ?? profile.defaultSpeed) || profile.defaultSpeed, 0.25, 4);
  const units = countSpeechUnits(text);
  if (units.cjkChars + units.latinWords + units.otherChars === 0) return options.minSeconds ?? 1;

  const cjkSeconds = units.cjkChars / Math.max(1, (profile.cjkCharsPerMinute * speed) / 60);
  const latinSeconds = units.latinWords / Math.max(1, (profile.latinWordsPerMinute * speed) / 60);
  const otherSeconds = units.otherChars > 0
    ? units.otherChars / Math.max(1, (profile.cjkCharsPerMinute * speed) / 60)
    : 0;
  const pauseSeconds = (units.punctuation * profile.punctuationPauseSec) / speed;
  return Math.max(
    options.minSeconds ?? 1,
    Math.round((cjkSeconds + latinSeconds + otherSeconds + pauseSeconds) * 10) / 10,
  );
}

export function calculateTtsContentBudget(
  targetDurationSec: number,
  options: {
    profile?: TtsTimingProfile;
    providerId?: string;
    modelId?: string;
    speed?: number;
    language?: string;
    tolerance?: number;
    punctuationRatio?: number;
  } = {},
): TtsContentBudget {
  const profile = options.profile ?? getTtsTimingProfile(options.providerId, options.modelId);
  const target = Math.max(1, Number(targetDurationSec) || 1);
  const speed = clamp(Number(options.speed ?? profile.defaultSpeed) || profile.defaultSpeed, 0.25, 4);
  const tolerance = clamp(Number(options.tolerance ?? 0.1) || 0.1, 0.02, 0.25);
  const language = options.language?.toLowerCase() ?? 'zh-cn';
  const punctuationRatio = clamp(Number(options.punctuationRatio ?? (language.startsWith('zh') ? 1 / 28 : 1 / 18)) || 0, 0, 0.2);
  const isCjk = /^(zh|ja|ko)/.test(language);

  if (isCjk) {
    const charsPerSec = Math.max(1, (profile.cjkCharsPerMinute * speed) / 60);
    const secondsPerChar = 1 / charsPerSec + (punctuationRatio * profile.punctuationPauseSec) / speed;
    const targetUnits = Math.max(1, Math.round(target / secondsPerChar));
    return {
      unit: 'cjk-char',
      targetUnits,
      minUnits: Math.max(1, Math.floor(targetUnits * (1 - tolerance))),
      maxUnits: Math.ceil(targetUnits * (1 + tolerance)),
      targetDurationSec: target,
      effectiveCharsPerMinute: 60 / secondsPerChar,
    };
  }

  if (/^(en|fr|de|es|it|pt|ru)/.test(language)) {
    const wordsPerSec = Math.max(1, (profile.latinWordsPerMinute * speed) / 60);
    const secondsPerWord = 1 / wordsPerSec + (punctuationRatio * profile.punctuationPauseSec) / speed;
    const targetUnits = Math.max(1, Math.round(target / secondsPerWord));
    return {
      unit: 'latin-word',
      targetUnits,
      minUnits: Math.max(1, Math.floor(targetUnits * (1 - tolerance))),
      maxUnits: Math.ceil(targetUnits * (1 + tolerance)),
      targetDurationSec: target,
      effectiveWordsPerMinute: 60 / secondsPerWord,
    };
  }

  const cjkBudget = calculateTtsContentBudget(target, {
    profile,
    speed,
    language: 'zh-CN',
    tolerance,
    punctuationRatio,
  });
  return { ...cjkBudget, unit: 'mixed-unit' };
}

export function buildTtsTimingPlan(options: {
  targetDurationSec: number;
  activityTargetDurationSec?: number;
  providerId?: string;
  modelId?: string;
  speed?: number;
  language?: string;
  contentType?: string;
}): TtsTimingPlan {
  const profile = getTtsTimingProfile(options.providerId, options.modelId);
  const language = options.language || 'zh-CN';
  const budget = calculateTtsContentBudget(options.targetDurationSec, {
    profile,
    speed: options.speed,
    language,
  });
  const speed = clamp(Number(options.speed ?? profile.defaultSpeed) || profile.defaultSpeed, 0.25, 4);
  return {
    providerId: profile.providerId,
    modelId: profile.modelId,
    profileId: profile.id,
    language,
    speed,
    contentType: options.contentType || 'other',
    ...(options.activityTargetDurationSec !== undefined
      ? { activityTargetDurationSec: Math.max(1, Math.round(options.activityTargetDurationSec)) }
      : {}),
    targetDurationSec: budget.targetDurationSec,
    unit: budget.unit,
    targetUnits: budget.targetUnits,
    minUnits: budget.minUnits,
    maxUnits: budget.maxUnits,
  };
}

export function assessTtsDurationError(options: {
  targetSec: number;
  actualSec: number;
  tolerance?: number;
}): TtsDurationAssessment {
  const targetSec = Math.max(1, Number(options.targetSec) || 1);
  const actualSec = Math.max(0, Number(options.actualSec) || 0);
  const tolerance = clamp(Number(options.tolerance ?? 0.1) || 0.1, 0.02, 0.25);
  const errorRatio = (actualSec - targetSec) / targetSec;
  const absoluteErrorRatio = Math.abs(errorRatio);
  const withinTolerance = absoluteErrorRatio <= tolerance;
  const status = withinTolerance ? 'within' : errorRatio < 0 ? 'under' : 'over';
  const suggestions = withinTolerance
    ? ['当前估算在允许误差范围内，无需调整内容结构。']
    : status === 'under'
      ? [
          `讲授内容明显不足，建议增加 ${Math.max(1, Math.round((targetSec - actualSec) / 60))} 分钟的内容点。`,
          '优先补充一个可验证的案例、反例或分步解释，不要只放慢播放速度。',
        ]
      : [
          `讲授内容超出目标，建议减少 ${Math.max(1, Math.round((actualSec - targetSec) / 60))} 分钟的重复说明。`,
          '合并相近内容点，保留定义、关键依据和一个代表性例子。',
        ];
  return {
    targetSec,
    actualSec,
    errorRatio,
    absoluteErrorRatio,
    tolerance,
    withinTolerance,
    status,
    suggestions,
  };
}
