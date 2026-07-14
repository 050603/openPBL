"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Bot,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleDot,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Mic,
  Plug,
  RefreshCw,
  Save,
  Search,
  Server,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
  Video,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  Card,
  PageHeader,
  Pill,
  PrimaryButton,
  SectionTitle,
  TextArea,
  TextInput,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import type { ProviderSection } from "@/lib/openmaic-bridge/provider-config-editor";
import { qualifyModelForProvider, splitModelIds } from "@/lib/openmaic-bridge/model-id";

import { PROVIDERS } from "@openmaic/lib/ai/providers";
import { ASR_PROVIDERS, DEFAULT_TTS_VOICES, TTS_PROVIDERS, getTTSVoices } from "@openmaic/lib/audio/constants";
import {
  type TtsVoiceTimingCalibration,
} from "@openmaic/lib/audio/tts-timing";
import { getEnabledProvidersWithVoices } from "@openmaic/lib/audio/voice-resolver";
import { useSettingsStore } from "@openmaic/lib/store/settings";
import { AI_COMPANIONS } from "@/lib/ai-companions";
import { IMAGE_PROVIDERS } from "@openmaic/lib/media/image-providers";
import { VIDEO_PROVIDERS } from "@openmaic/lib/media/video-providers";
import { PDF_PROVIDERS } from "@openmaic/lib/pdf/constants";
import { WEB_SEARCH_PROVIDERS } from "@openmaic/lib/web-search/constants";
import { ServerProvidersInit } from "@openmaic/components/server-providers-init";
import { I18nProvider } from "@openmaic/lib/hooks/use-i18n";
import { ThemeProvider } from "@openmaic/lib/hooks/use-theme";

type TabKey = "llm" | "tts" | "asr" | "image" | "video" | "web-search" | "pdf" | "agent-voice";

type ProviderMeta = {
  id: string;
  name: string;
  requiresApiKey: boolean;
  defaultBaseUrl?: string;
  icon?: string;
  models: Array<{ id: string; name: string }>;
  defaultModelId?: string;
  description?: string;
};

type SavedConfig = {
  hasApiKey: boolean;
  baseUrl?: string;
  models?: string[];
  enabled?: boolean;
  defaultModel?: string;
  priority?: number;
  defaultVoice?: string;
  timingCalibrations?: TtsVoiceTimingCalibration[];
};

const TTS_CALIBRATION_TEXT =
  "在项目学习中，我们先观察现象，再提出可以验证的问题。接着收集证据、比较不同解释，并用清楚的语言说明判断依据。遇到复杂概念时，可以借助一个贴近生活的例子，逐步连接已有经验与新知识。最后，请停下来检查结论是否符合证据，并思考还有哪些条件可能影响结果。";

async function measureBase64AudioDuration(base64: string, format = "mp3"): Promise<number> {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: `audio/${format}` });
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<number>((resolve, reject) => {
      const audio = new Audio(url);
      const timeout = window.setTimeout(() => reject(new Error("无法读取标定音频时长。")), 15000);
      audio.addEventListener("loadedmetadata", () => {
        window.clearTimeout(timeout);
        if (Number.isFinite(audio.duration) && audio.duration > 0) resolve(audio.duration);
        else reject(new Error("标定音频时长无效。"));
      }, { once: true });
      audio.addEventListener("error", () => {
        window.clearTimeout(timeout);
        reject(new Error("标定音频无法解码。"));
      }, { once: true });
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

type ResultState = {
  ok: boolean;
  message: string;
  detail?: string;
  audioUrl?: string;
  previewUrl?: string;
} | null;

const TABS: Array<{
  key: TabKey;
  label: string;
  shortLabel: string;
  section: ProviderSection;
  icon: ComponentType<{ size?: number; className?: string }>;
}> = [
  { key: "llm", label: "AI 大模型", shortLabel: "AI 模型", section: "providers", icon: Bot },
  { key: "tts", label: "语音朗读", shortLabel: "语音朗读", section: "tts", icon: Volume2 },
  { key: "asr", label: "语音识别", shortLabel: "语音识别", section: "asr", icon: Mic },
  { key: "image", label: "图像生成", shortLabel: "图像", section: "image", icon: ImageIcon },
  { key: "video", label: "视频生成", shortLabel: "视频", section: "video", icon: Video },
  { key: "web-search", label: "联网搜索", shortLabel: "搜索", section: "web-search", icon: Search },
  { key: "pdf", label: "PDF 解析", shortLabel: "PDF", section: "pdf", icon: FileText },
  { key: "agent-voice", label: "智能体音色", shortLabel: "音色", section: "tts", icon: Users },
];

const TAB_COPY: Record<TabKey, { title: string; description: string; tips: string[] }> = {
  llm: {
    title: "AI 大模型配置",
    description: "配置课堂内容生成、对话辅导和评价反馈使用的 AI 大模型。",
    tips: ["选择服务商", "填写密钥与服务地址", "确认模型列表并选择默认模型", "保存后测试连接"],
  },
  tts: {
    title: "语音朗读配置",
    description: "配置课堂旁白、角色朗读和讲解音频使用的语音合成服务。",
    tips: ["选择服务商", "按需填写密钥与地址", "保存后在生成语音时生效"],
  },
  asr: {
    title: "语音识别配置",
    description: "配置学生语音输入转文字服务。",
    tips: ["选择识别服务", "填写凭据", "课堂语音输入会读取这里的配置"],
  },
  image: {
    title: "图像生成配置",
    description: "配置课堂素材和场景插图生成服务。",
    tips: ["选择图像服务", "填写凭据", "后续生成图片时使用此配置"],
  },
  video: {
    title: "视频生成配置",
    description: "配置视频素材生成服务。",
    tips: ["选择视频服务", "填写凭据", "保存后进入生成流程"],
  },
  "web-search": {
    title: "联网搜索配置",
    description: "配置 AI 实时检索网络资料时使用的搜索服务。",
    tips: ["选择搜索引擎", "填写密钥", "保存后用于资料检索与事实补充"],
  },
  pdf: {
    title: "PDF 解析配置",
    description: "配置读取和解析 PDF 教材资料的服务。",
    tips: ["选择解析服务", "云服务填写密钥", "本地服务按需填写地址"],
  },
  "agent-voice": {
    title: "智能体音色配置",
    description: "为每个 AI 伙伴选择符合性格的朗读音色，让课堂对话更生动。",
    tips: ["确认语音服务商已配置", "为每个智能体选择音色", "可一键应用推荐配置", "点击试听效果"],
  },
};

const TEST_EXPLANATIONS: Record<TabKey, string> = {
  llm: "发送最小对话请求，验证完整模型标识、服务地址、鉴权和响应格式。",
  tts: "生成固定测试文本并提供试听，同时按音频实际时长更新当前模型、音色、语言和自然语速的共享建模数据。",
  asr: "上传一段标准 WAV 测试样本，验证识别接口、鉴权、模型和音频参数。",
  image: "实际生成一张低分辨率测试图，验证接口地址、鉴权、模型、请求参数和图片返回格式。",
  video: "调用对应视频供应商的专用连通性检查，返回供应商提供的具体错误信息。",
  "web-search": "执行一次仅返回少量结果的真实搜索，验证密钥、地址和结果解析。",
  pdf: "上传一页最小测试 PDF 并执行真实解析，验证服务地址、鉴权和返回结构。",
  "agent-voice": "试听使用当前已保存的 TTS 服务与音色配置，不会调用其他类型的模型。",
};

function getProvidersForTab(tab: TabKey): ProviderMeta[] {
  switch (tab) {
    case "llm":
      return Object.values(PROVIDERS).map((provider) => ({
        id: provider.id,
        name: provider.name,
        requiresApiKey: provider.requiresApiKey,
        defaultBaseUrl: provider.defaultBaseUrl,
        icon: provider.icon,
        models: provider.models.map((model) => ({ id: model.id, name: model.name })),
        defaultModelId: provider.models[0]?.id,
      }));
    case "tts":
      return Object.values(TTS_PROVIDERS).map((provider) => ({
        id: provider.id,
        name: provider.name,
        requiresApiKey: provider.requiresApiKey,
        defaultBaseUrl: provider.defaultBaseUrl,
        icon: provider.icon,
        models: (provider.models ?? []).map((model) => ({ id: model.id, name: model.name })),
        defaultModelId: provider.defaultModelId,
      }));
    case "asr":
      return Object.values(ASR_PROVIDERS).map((provider) => ({
        id: provider.id,
        name: provider.name,
        requiresApiKey: provider.requiresApiKey,
        defaultBaseUrl: provider.defaultBaseUrl,
        icon: provider.icon,
        models: (provider.models ?? []).map((model) => ({ id: model.id, name: model.name })),
        defaultModelId: provider.defaultModelId,
      }));
    case "image":
      return Object.values(IMAGE_PROVIDERS).map((provider) => ({
        id: provider.id,
        name: provider.name,
        requiresApiKey: provider.requiresApiKey,
        defaultBaseUrl: provider.defaultBaseUrl,
        icon: provider.icon,
        models: (provider.models ?? []).map((model) => ({ id: model.id, name: model.name })),
      }));
    case "video":
      return Object.values(VIDEO_PROVIDERS).map((provider) => ({
        id: provider.id,
        name: provider.name,
        requiresApiKey: provider.requiresApiKey,
        defaultBaseUrl: provider.defaultBaseUrl,
        icon: provider.icon,
        models: (provider.models ?? []).map((model) => ({ id: model.id, name: model.name })),
      }));
    case "web-search":
      return Object.values(WEB_SEARCH_PROVIDERS).map((provider) => ({
        id: provider.id,
        name: provider.name,
        requiresApiKey: provider.requiresApiKey,
        defaultBaseUrl: provider.defaultBaseUrl,
        icon: provider.icon,
        models: [],
      }));
    case "pdf":
      return Object.values(PDF_PROVIDERS).map((provider) => ({
        id: provider.id,
        name: provider.name,
        requiresApiKey: provider.requiresApiKey,
        defaultBaseUrl: (provider as { baseUrl?: string }).baseUrl,
        icon: provider.icon,
        models: [],
        description: (provider as { features?: string[] }).features?.join("、"),
      }));
    case "agent-voice":
      return [];
  }
}

function configKey(section: ProviderSection, providerId: string) {
  return `${section}:${providerId}`;
}

function modelsToText(models: string[] | undefined, provider: ProviderMeta) {
  const source = models?.length ? models : provider.models.map((model) => model.id);
  return source.join("\n");
}

function getInitialDefaultModel(provider: ProviderMeta, saved?: SavedConfig) {
  return saved?.defaultModel || saved?.models?.[0] || provider.defaultModelId || provider.models[0]?.id || "";
}

function getReadableError(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const record = data as { error?: unknown; message?: unknown; details?: unknown };
  const primary = typeof record.error === "string"
    ? record.error
    : typeof record.message === "string"
      ? record.message
      : fallback;
  return typeof record.details === "string" && record.details !== primary
    ? `${primary}\n${record.details}`
    : primary;
}

/**
 * 推荐的 Qwen TTS 音色配置（按智能体性格匹配）。
 * 仅在当前 TTS 服务商为 qwen-tts 时作为一键推荐。
 */
const RECOMMENDED_QWEN_VOICES: Record<string, { voiceId: string; reason: string }> = {
  knowledge: { voiceId: "Ethan", reason: "沉稳男声，适合知识讲解的权威感" },
  ideation: { voiceId: "Maia", reason: "活泼女声，适合创意启发的灵动" },
  critic: { voiceId: "Aiden", reason: "锐利男声，适合质疑检验的穿透力" },
  planner: { voiceId: "Kai", reason: "干练男声，适合方案规划的条理" },
  reviewer: { voiceId: "Serena", reason: "温和女声，适合评审反馈的亲切" },
  recorder: { voiceId: "Chelsie", reason: "平稳女声，适合过程记录的沉静" },
};

function AgentVoiceConfig() {
  const { ttsProvidersConfig, ttsProviderId, agentVoiceOverrides, setAgentVoiceOverride } =
    useSettingsStore();
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ResultState>(null);

  const enabledProviders = useMemo(
    () => getEnabledProvidersWithVoices(ttsProvidersConfig),
    [ttsProvidersConfig],
  );

  const currentProvider = enabledProviders.find((p) => p.providerId === ttsProviderId);
  const availableVoices = currentProvider?.voices ?? [];
  const availableModelGroups = currentProvider?.modelGroups ?? [];

  const isQwenProvider = ttsProviderId === "qwen-tts";
  const hasVoices = availableVoices.length > 0;

  function handleApplyRecommended() {
    if (!isQwenProvider) return;
    for (const companion of AI_COMPANIONS) {
      const rec = RECOMMENDED_QWEN_VOICES[companion.id];
      if (rec) {
        setAgentVoiceOverride(companion.id, {
          providerId: ttsProviderId,
          voiceId: rec.voiceId,
        });
      }
    }
  }

  function handleClearAll() {
    for (const companion of AI_COMPANIONS) {
      setAgentVoiceOverride(companion.id, undefined);
    }
  }

  async function handleTestVoice(companionId: string, voiceId: string) {
    setTestingId(companionId);
    setTestResult(null);
    try {
      const providerConfig = ttsProvidersConfig[ttsProviderId];
      const modelId = providerConfig?.modelId || undefined;
      const companion = AI_COMPANIONS.find((c) => c.id === companionId);
      const response = await fetch("/api/openmaic/generate/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `大家好，我是${companion?.name ?? "智能体"}，很高兴和大家一起学习。`,
          audioId: `agent_voice_test_${companionId}`,
          ttsProviderId,
          ttsModelId: modelId,
          ttsVoice: voiceId,
          ttsSpeed: 1,
        }),
      });
      const data = await response.json().catch(() => null);
      const audioBase64 = data?.base64 ?? data?.data?.base64;
      if (!response.ok || data?.success === false || !audioBase64) {
        throw new Error(getReadableError(data, "试听失败，请检查语音服务配置。"));
      }
      const audio = new Audio(`data:audio/wav;base64,${audioBase64}`);
      await audio.play();
      setTestResult({ ok: true, message: `正在试听：${companion?.name}` });
    } catch (error) {
      setTestResult({
        ok: false,
        message: error instanceof Error ? error.message : "试听失败，请稍后重试。",
      });
    } finally {
      setTestingId(null);
    }
  }

  if (enabledProviders.length === 0) {
    return (
      <EmptyPanel text="请先在「语音朗读」中配置 TTS 服务商，再回到此处设置智能体音色。" />
    );
  }

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-stone-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm text-stone-600">
          <Volume2 size={16} className="text-[var(--pbl-teacher)]" />
          <span>
            当前语音服务商：<span className="font-bold text-stone-900">{currentProvider?.providerName ?? ttsProviderId}</span>
          </span>
          <span className="text-stone-400">·</span>
          <span>共 {availableVoices.length} 个可用音色</span>
        </div>
        <div className="flex items-center gap-2">
          {isQwenProvider ? (
            <PrimaryButton
              variant="outline"
              onClick={handleApplyRecommended}
              className="h-8 px-3 text-xs"
            >
              <Sparkles size={13} />
              应用推荐配置
            </PrimaryButton>
          ) : null}
          <PrimaryButton
            variant="outline"
            onClick={handleClearAll}
            className="h-8 px-3 text-xs"
          >
            <Trash2 size={13} />
            清空全部
          </PrimaryButton>
        </div>
      </div>

      {/* 智能体列表 */}
      <div className="space-y-3">
        {AI_COMPANIONS.map((companion) => {
          const override = agentVoiceOverrides[companion.id];
          const selectedVoiceId = override?.voiceId ?? "";
          const rec = RECOMMENDED_QWEN_VOICES[companion.id];
          const isRecommended = isQwenProvider && rec && selectedVoiceId === rec.voiceId;

          return (
            <Card key={companion.id} compact>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                {/* 智能体信息 */}
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg"
                    style={{ backgroundColor: companion.color + "20", color: companion.color }}
                  >
                    {companion.emoji}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-stone-950">{companion.name}</span>
                      <Pill tone="blue" className="h-5 px-1.5 text-[10px]">
                        {companion.role}
                      </Pill>
                      {isRecommended ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pbl-warning-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--pbl-warning)]">
                          <Sparkles size={10} />
                          推荐
                        </span>
                      ) : null}
                    </div>
                    {rec && isQwenProvider ? (
                      <p className="mt-0.5 truncate text-xs text-stone-400">{rec.reason}</p>
                    ) : (
                      <p className="mt-0.5 truncate text-xs text-stone-400">{companion.description}</p>
                    )}
                  </div>
                </div>

                {/* 音色选择 + 试听 */}
                <div className="flex items-center gap-2">
                  <select
                    value={selectedVoiceId}
                    onChange={(e) => {
                      const voiceId = e.target.value;
                      if (voiceId) {
                        setAgentVoiceOverride(companion.id, {
                          providerId: ttsProviderId,
                          voiceId,
                        });
                      } else {
                        setAgentVoiceOverride(companion.id, undefined);
                      }
                    }}
                    className="h-9 min-w-[200px] rounded-[6px] border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 transition focus:border-[var(--pbl-teacher)] focus:outline-none focus:ring-2 focus:ring-[var(--pbl-teacher)]/20"
                  >
                    <option value="">跟随默认音色</option>
                    {availableModelGroups.length > 1
                      ? availableModelGroups.map((group) => (
                          <optgroup key={group.modelId} label={group.modelName}>
                            {group.voices.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                          </optgroup>
                        ))
                      : availableVoices.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleTestVoice(companion.id, selectedVoiceId || availableVoices[0]?.id || "")}
                    disabled={!hasVoices || testingId === companion.id}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] border border-stone-300 bg-white text-stone-500 transition hover:border-[var(--pbl-teacher)] hover:text-[var(--pbl-teacher)] disabled:opacity-40"
                    title="试听"
                  >
                    {testingId === companion.id ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Volume2 size={15} />
                    )}
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* 试听结果 */}
      {testResult ? <ResultNotice result={testResult} /> : null}

      {/* 说明 */}
      <div className="rounded-[8px] border border-stone-200 bg-stone-50 p-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-stone-400">
          <Sparkles size={13} />
          推荐说明
        </div>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          {isQwenProvider
            ? "已为 Qwen TTS 用户准备了符合各智能体性格的推荐音色配置。点击「应用推荐配置」可一键设置全部音色。未选择的智能体将使用「语音朗读」中设置的默认音色。"
            : "为每个智能体选择不同的音色可以让课堂对话更生动。当前服务商的可用音色会显示在下拉列表中。未选择的智能体将使用默认音色。"}
        </p>
      </div>
    </div>
  );
}

export default function TeacherSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("llm");
  const [savedConfigs, setSavedConfigs] = useState<Record<string, SavedConfig>>({});
  const [configLoading, setConfigLoading] = useState(true);
  const [selectedLlmId, setSelectedLlmId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [editApiKey, setEditApiKey] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editModels, setEditModels] = useState("");
  const [editDefaultModel, setEditDefaultModel] = useState("");
  const [editDefaultVoice, setEditDefaultVoice] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  const [savingProviderId, setSavingProviderId] = useState<string | null>(null);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [calibratingProviderId, setCalibratingProviderId] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<ResultState>(null);
  const [testResult, setTestResult] = useState<ResultState>(null);
  const [deletingProvider, setDeletingProvider] = useState<ProviderMeta | null>(null);
  const [deleting, setDeleting] = useState(false);

  const currentTab = TABS.find((tab) => tab.key === activeTab)!;
  const tabCopy = TAB_COPY[activeTab];
  const providers = useMemo(() => getProvidersForTab(activeTab), [activeTab]);
  const filteredProviders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return providers;
    return providers.filter((provider) =>
      `${provider.name} ${provider.id}`.toLowerCase().includes(needle),
    );
  }, [providers, query]);

  const configuredCount = providers.filter((provider) => {
    const saved = savedConfigs[configKey(currentTab.section, provider.id)];
    return saved?.hasApiKey || saved?.enabled !== undefined;
  }).length;
  const currentDefaultProvider = useMemo(() => {
    const configured = providers
      .map((provider) => ({
        provider,
        saved: savedConfigs[configKey(currentTab.section, provider.id)],
      }))
      .filter((item) => item.saved?.hasApiKey || item.saved?.enabled !== undefined)
      .sort((a, b) => (a.saved?.priority ?? 100) - (b.saved?.priority ?? 100));
    return configured[0] ?? null;
  }, [currentTab.section, providers, savedConfigs]);

  const getSavedConfig = useCallback(
    (section: ProviderSection, providerId: string) => savedConfigs[configKey(section, providerId)],
    [savedConfigs],
  );

  const fillForm = useCallback(
    (provider: ProviderMeta) => {
      const saved = getSavedConfig(currentTab.section, provider.id);
      setEditApiKey("");
      setEditBaseUrl(saved?.baseUrl || provider.defaultBaseUrl || "");
      setEditModels(modelsToText(saved?.models, provider));
      setEditDefaultModel(getInitialDefaultModel(provider, saved));
      setEditDefaultVoice(
        saved?.defaultVoice ||
          DEFAULT_TTS_VOICES[provider.id as keyof typeof DEFAULT_TTS_VOICES] ||
          "default",
      );
      setShowApiKey(false);
      setSaveResult(null);
      setTestResult(null);
    },
    [currentTab.section, getSavedConfig],
  );

  const fetchConfigs = useCallback(async (section: ProviderSection) => {
    setConfigLoading(true);
    try {
      const response = await fetch(`/api/openmaic/provider-config?section=${section}`);
      const data = await response.json().catch(() => null);
      const providersData =
        (data?.providers as Record<string, SavedConfig> | undefined) ??
        (data?.data?.providers as Record<string, SavedConfig> | undefined);

      if (response.ok && providersData) {
        setSavedConfigs((current) => ({
          ...current,
          ...Object.fromEntries(
            Object.entries(providersData).map(([providerId, value]) => [
              configKey(section, providerId),
              value,
            ]),
          ),
        }));
      }
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchConfigs(currentTab.section);
  }, [currentTab.section, fetchConfigs]);

  useEffect(() => {
    if (activeTab !== "llm" || selectedLlmId || configLoading || providers.length === 0) return;

    const configured = providers.find(
      (provider) => getSavedConfig("providers", provider.id)?.hasApiKey,
    );
    const initialProvider = configured ?? providers[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedLlmId(initialProvider.id);
    fillForm(initialProvider);
  }, [activeTab, configLoading, fillForm, getSavedConfig, providers, selectedLlmId]);

  function selectProvider(provider: ProviderMeta) {
    fillForm(provider);
    if (activeTab === "llm") {
      setSelectedLlmId(provider.id);
    } else {
      setExpandedId(provider.id);
    }
  }

  function handleModelTextChange(value: string) {
    setEditModels(value);
    const modelIds = splitModelIds(value);
    if (!modelIds.includes(editDefaultModel)) {
      setEditDefaultModel(modelIds[0] || "");
    }
  }

  async function handleSave(provider: ProviderMeta, makeDefault = true) {
    const saved = getSavedConfig(currentTab.section, provider.id);
    const modelIds = splitModelIds(editModels);

    if (provider.requiresApiKey && !saved?.hasApiKey && !editApiKey.trim()) {
      setSaveResult({ ok: false, message: "请先填写密钥。" });
      return;
    }

    if (activeTab === "llm" && modelIds.length === 0) {
      setSaveResult({ ok: false, message: "请至少保留一个模型。" });
      return;
    }

    setSavingProviderId(provider.id);
    setSaveResult(null);
    try {
      const response = await fetch("/api/openmaic/provider-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: currentTab.section,
          providerId: provider.id,
          apiKey: editApiKey.trim(),
          baseUrl: editBaseUrl.trim() || undefined,
          enabled: true,
          models: modelIds.length > 0 ? modelIds : undefined,
          defaultModel: editDefaultModel || modelIds[0] || undefined,
          ...(activeTab === "tts" ? { defaultVoice: editDefaultVoice || "default" } : {}),
          ...(makeDefault ? { priority: 0 } : {}),
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || data?.success === false) {
        throw new Error(getReadableError(data, "保存失败，请检查配置。"));
      }

      if (makeDefault) {
        await Promise.all(
          providers
            .filter((item) => item.id !== provider.id)
            .map(async (item) => {
              const otherSaved = getSavedConfig(currentTab.section, item.id);
              if (!otherSaved?.hasApiKey && otherSaved?.enabled === undefined) return;
              const otherModels = otherSaved?.models?.length
                ? otherSaved.models
                : item.models.map((model) => model.id);
              await fetch("/api/openmaic/provider-config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  section: currentTab.section,
                  providerId: item.id,
                  apiKey: "",
                  baseUrl: otherSaved?.baseUrl || item.defaultBaseUrl || undefined,
                  enabled: otherSaved?.enabled ?? true,
                  models: otherModels.length > 0 ? otherModels : undefined,
                  defaultModel:
                    otherSaved?.defaultModel ||
                    otherModels[0] ||
                    item.defaultModelId ||
                    undefined,
                  priority: 100,
                  ...(activeTab === "tts"
                    ? {
                        defaultVoice: otherSaved?.defaultVoice,
                        timingCalibrations: otherSaved?.timingCalibrations,
                      }
                    : {}),
                }),
              });
            }),
        );
      }

      setSaveResult({
        ok: true,
        message:
          activeTab === "tts" && makeDefault
            ? "语音朗读配置已保存，并设为默认服务。"
            : makeDefault
              ? "配置已保存，并设为当前默认。"
            : "配置已保存。",
      });
      setEditApiKey("");
      await fetchConfigs(currentTab.section);
    } catch (error) {
      setSaveResult({
        ok: false,
        message: error instanceof Error ? error.message : "保存失败，请稍后重试。",
      });
    } finally {
      setSavingProviderId(null);
    }
  }

  async function handleTestConnection(provider: ProviderMeta) {
    const saved = getSavedConfig(currentTab.section, provider.id);
    const modelId = editDefaultModel || splitModelIds(editModels)[0] || "";

    if (!modelId && activeTab !== "tts" && provider.models.length > 0) {
      setTestResult({ ok: false, message: "请先选择或填写一个模型 ID。" });
      return;
    }
    if (provider.requiresApiKey && !saved?.hasApiKey && !editApiKey.trim()) {
      setTestResult({ ok: false, message: "请先填写密钥，或保存已有配置后再测试。" });
      return;
    }

    if (activeTab === "tts") {
      if (provider.id === "browser-native-tts") {
        setTestResult({
          ok: false,
          message: "浏览器本地语音不能用于课程生成，请选择云端语音服务。",
        });
        return;
      }

      const voice = editDefaultVoice ||
        DEFAULT_TTS_VOICES[provider.id as keyof typeof DEFAULT_TTS_VOICES] || "default";
      setTestingProviderId(provider.id);
      setTestResult(null);
      try {
        const configResponse = await fetch("/api/openmaic/provider-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section: "tts",
            providerId: provider.id,
            apiKey: editApiKey.trim(),
            baseUrl: editBaseUrl.trim() || undefined,
            enabled: true,
            models: splitModelIds(editModels).length ? splitModelIds(editModels) : undefined,
            defaultModel: modelId || undefined,
            defaultVoice: voice,
            priority: saved?.priority,
          }),
        });
        if (!configResponse.ok) {
          const configError = await configResponse.json().catch(() => null);
          throw new Error(getReadableError(configError, "语音配置保存失败，未开始测试。"));
        }
        const response = await fetch("/api/openmaic/generate/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: TTS_CALIBRATION_TEXT,
            audioId: `settings_test_${provider.id}`,
            ttsProviderId: provider.id,
            ttsModelId: modelId || undefined,
            ttsVoice: voice,
            ttsSpeed: 1,
            ttsApiKey: editApiKey.trim() || undefined,
            ttsBaseUrl: editBaseUrl.trim() || undefined,
          }),
        });
        const data = await response.json().catch(() => null);
        const audioBase64 = data?.base64 ?? data?.data?.base64;
        const format = data?.format ?? data?.data?.format ?? "mp3";

        if (!response.ok || data?.success === false || !audioBase64) {
          throw new Error(getReadableError(data, "语音测试失败，请检查密钥、服务地址、模型和音色。"));
        }

        const measuredDurationSec = await measureBase64AudioDuration(audioBase64, format);
        const calibrationResponse = await fetch("/api/openmaic/tts-calibration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerId: provider.id,
            modelId,
            voiceId: voice,
            language: "zh-CN",
            speed: 1,
            text: TTS_CALIBRATION_TEXT,
            measuredDurationSec,
            apiKey: editApiKey.trim(),
            baseUrl: editBaseUrl.trim() || undefined,
            models: splitModelIds(editModels),
          }),
        });
        const calibrationData = await calibrationResponse.json().catch(() => null);
        if (!calibrationResponse.ok || calibrationData?.success === false) {
          throw new Error(getReadableError(calibrationData, "音频生成成功，但语速建模保存失败。"));
        }
        const calibration = calibrationData?.calibration ?? calibrationData?.data?.calibration;
        const audioUrl = `data:audio/${format};base64,${audioBase64}`;
        const audio = new Audio(audioUrl);
        void audio.play().catch(() => undefined);
        setTestResult({
          ok: true,
          message: "语音测试成功，已自动试听并完成自然语速建模。",
          detail: `模型：${modelId || "默认"}；音色：${voice}；实测 ${measuredDurationSec.toFixed(2)} 秒；共享平均约 ${Number(calibration?.cjkCharsPerMinute ?? 0).toFixed(1)} 字/分钟（${calibration?.sampleCount ?? 1} 次样本）`,
          audioUrl,
        });
        await fetchConfigs("tts");
      } catch (error) {
        setTestResult({
          ok: false,
          message: error instanceof Error ? error.message : "语音测试失败，请稍后重试。",
          detail: `测试模型：${modelId || "默认"}；音色：${voice}`,
        });
      } finally {
        setTestingProviderId(null);
      }
      return;
    }

    const qualifiedModel = qualifyModelForProvider(modelId, provider.id);
    const isCapabilityTest = activeTab === "asr"
      || activeTab === "image"
      || activeTab === "video"
      || activeTab === "web-search"
      || activeTab === "pdf";
    setTestingProviderId(provider.id);
    setTestResult(null);

    try {
      const response = await fetch(isCapabilityTest ? "/api/openmaic/test-provider" : "/api/openmaic/verify-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: isCapabilityTest ? modelId : qualifiedModel,
          section: currentTab.section,
          providerId: provider.id,
          apiKey: editApiKey.trim() || undefined,
          baseUrl: editBaseUrl.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || data?.success === false) {
        throw new Error(getReadableError(data, "连接失败，请检查密钥、服务地址和模型。"));
      }

      setTestResult({
        ok: true,
        message: data?.message || "连接成功。",
        detail: data?.detail || `测试模型：${isCapabilityTest ? modelId : qualifiedModel}`,
        previewUrl: typeof data?.previewUrl === "string" ? data.previewUrl : undefined,
      });
    } catch (error) {
      setTestResult({
        ok: false,
        message: error instanceof Error ? error.message : "连接失败，请稍后重试。",
        detail: `服务：${provider.name}；模型：${isCapabilityTest ? modelId : qualifiedModel}`,
      });
    } finally {
      setTestingProviderId(null);
    }
  }

  async function handleCalibrateTts(provider: ProviderMeta) {
    setCalibratingProviderId(provider.id);
    try {
      await handleTestConnection(provider);
    } finally {
      setCalibratingProviderId(null);
    }
  }

  const selectedLlmProvider = providers.find((provider) => provider.id === selectedLlmId) ?? null;
  const selectedModalityProvider = providers.find((provider) => provider.id === expandedId) ?? null;

  async function handleDelete(provider: ProviderMeta) {
    setDeleting(true);
    try {
      const response = await fetch("/api/openmaic/provider-config", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: currentTab.section, providerId: provider.id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.success === false) {
        throw new Error(getReadableError(data, "删除失败。"));
      }
      setDeletingProvider(null);
      setSaveResult({ ok: true, message: `已删除 ${provider.name} 的配置。` });
      setTestResult(null);
      if (activeTab === "llm" && selectedLlmId === provider.id) {
        setSelectedLlmId(null);
      }
      if (expandedId === provider.id) {
        setExpandedId(null);
      }
      await fetchConfigs(currentTab.section);
    } catch (error) {
      setSaveResult({
        ok: false,
        message: error instanceof Error ? error.message : "删除失败，请稍后重试。",
      });
    } finally {
      setDeleting(false);
    }
  }

  function handleTabChange(tab: TabKey) {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setSaveResult(null);
    setTestResult(null);
    setQuery("");
    setConfigLoading(true);
    setSelectedLlmId(null);
    setExpandedId(null);
  }

  return (
    <DashboardShell role="teacher">
      <div className="mb-5 flex items-center gap-3">
        <Link
          href="/teacher"
          className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-stone-200 bg-white text-stone-500 transition hover:bg-stone-50 hover:text-stone-800"
          title="返回教师首页"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-stone-900">AI 服务设置</h1>
          <p className="mt-0.5 text-sm text-stone-500">配置大模型、语音、图像、视频、搜索和 PDF 解析服务</p>
        </div>
      </div>

      <ThemeProvider>
        <I18nProvider>
          <ServerProvidersInit />

          {/* Tab 栏 */}
          <div className="mb-5 overflow-x-auto border-b border-stone-200">
            <div className="flex min-w-max gap-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;
                const tabProviders = getProvidersForTab(tab.key);
                const tabSection = tab.section;
                const tabConfigured = tabProviders.filter((p) => {
                  const saved = savedConfigs[configKey(tabSection, p.id)];
                  return saved?.hasApiKey || saved?.enabled !== undefined;
                }).length;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleTabChange(tab.key)}
                    className={cn(
                      "inline-flex h-11 items-center gap-2 border-b-2 px-4 text-sm font-bold transition",
                      active
                        ? "border-[var(--pbl-teacher)] text-[var(--pbl-teacher)]"
                        : "border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-800",
                    )}
                  >
                    <Icon size={16} />
                    {tab.shortLabel}
                    {tabConfigured > 0 ? (
                      <span className={cn(
                        "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold",
                        active
                          ? "bg-[var(--pbl-teacher)] text-white"
                          : "bg-[var(--pbl-success-soft)] text-[var(--pbl-success)]",
                      )}>
                        {tabConfigured}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 主内容区 - 全宽 */}
          <div>
            <main className="min-w-0">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-stone-900">{tabCopy.title}</h2>
                  <p className="mt-1 text-sm text-stone-500">{tabCopy.description}</p>
                </div>
                <div className="relative w-full md:w-[320px]">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                  />
                  <TextInput
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索服务商名称"
                    className="pl-9"
                  />
                </div>
              </div>

              {configLoading ? (
                <div className="mb-4 inline-flex items-center gap-2 rounded-[6px] bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-500">
                  <Loader2 size={16} className="animate-spin" />
                  正在读取服务端配置
                </div>
              ) : null}

              {activeTab === "agent-voice" ? (
                <AgentVoiceConfig />
              ) : activeTab === "llm" ? (
                <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
                  <ProviderList
                    providers={filteredProviders}
                    selectedId={selectedLlmId}
                    section={currentTab.section}
                    savedConfigs={savedConfigs}
                    onSelect={selectProvider}
                    onDelete={setDeletingProvider}
                  />

                  {selectedLlmProvider ? (
                    <Card>
                      <SectionTitle
                        title={selectedLlmProvider.name}
                        hint={`服务标识：${selectedLlmProvider.id}`}
                        action={
                          <span className="flex items-center gap-2">
                            {getSavedConfig("providers", selectedLlmProvider.id)?.hasApiKey ? (
                              <Pill tone="green">已配置</Pill>
                            ) : (
                              <Pill tone={selectedLlmProvider.requiresApiKey ? "amber" : "blue"}>
                                {selectedLlmProvider.requiresApiKey ? "待配置" : "无需密钥"}
                              </Pill>
                            )}
                            {getSavedConfig("providers", selectedLlmProvider.id)?.hasApiKey ? (
                              <button
                                type="button"
                                onClick={() => setDeletingProvider(selectedLlmProvider)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-stone-400 transition hover:bg-[var(--pbl-danger-soft)] hover:text-[var(--pbl-danger)]"
                                title="删除配置"
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : null}
                          </span>
                        }
                      />
                      <LlmConfigForm
                        provider={selectedLlmProvider}
                        saved={getSavedConfig("providers", selectedLlmProvider.id)}
                        editApiKey={editApiKey}
                        editBaseUrl={editBaseUrl}
                        editModels={editModels}
                        editDefaultModel={editDefaultModel}
                        showApiKey={showApiKey}
                        saving={savingProviderId === selectedLlmProvider.id}
                        testing={testingProviderId === selectedLlmProvider.id}
                        saveResult={saveResult}
                        testResult={testResult}
                        onApiKeyChange={setEditApiKey}
                        onBaseUrlChange={setEditBaseUrl}
                        onModelsChange={handleModelTextChange}
                        onDefaultModelChange={setEditDefaultModel}
                        onShowApiKeyChange={setShowApiKey}
                        onSave={() => handleSave(selectedLlmProvider)}
                        onTest={() => handleTestConnection(selectedLlmProvider)}
                      />
                    </Card>
                  ) : (
                    <EmptyPanel text="选择一个服务商后编辑连接信息。" />
                  )}
                </div>
              ) : (
                <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
                  <ProviderList
                    providers={filteredProviders}
                    selectedId={expandedId}
                    section={currentTab.section}
                    savedConfigs={savedConfigs}
                    onSelect={selectProvider}
                    onDelete={setDeletingProvider}
                  />
                  {selectedModalityProvider ? (
                    <Card>
                      <SectionTitle
                        title={selectedModalityProvider.name}
                        hint={`服务标识：${selectedModalityProvider.id}`}
                        action={
                          <span className="flex items-center gap-2">
                            {getSavedConfig(currentTab.section, selectedModalityProvider.id)?.hasApiKey ? (
                              <Pill tone="green">已配置</Pill>
                            ) : (
                              <Pill tone={selectedModalityProvider.requiresApiKey ? "amber" : "blue"}>
                                {selectedModalityProvider.requiresApiKey ? "待配置" : "无需密钥"}
                              </Pill>
                            )}
                            {getSavedConfig(currentTab.section, selectedModalityProvider.id)?.hasApiKey ? (
                              <button
                                type="button"
                                onClick={() => setDeletingProvider(selectedModalityProvider)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-stone-400 transition hover:bg-[var(--pbl-danger-soft)] hover:text-[var(--pbl-danger)]"
                                title="删除配置"
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : null}
                          </span>
                        }
                      />
                      <ModalityConfigForm
                        provider={selectedModalityProvider}
                        saved={getSavedConfig(currentTab.section, selectedModalityProvider.id)}
                        editApiKey={editApiKey}
                        editBaseUrl={editBaseUrl}
                        editModels={editModels}
                        editDefaultModel={editDefaultModel}
                        editDefaultVoice={editDefaultVoice}
                        showApiKey={showApiKey}
                        saving={savingProviderId === selectedModalityProvider.id}
                        testing={testingProviderId === selectedModalityProvider.id}
                        calibrating={calibratingProviderId === selectedModalityProvider.id}
                        saveResult={saveResult}
                        testResult={testResult}
                        onApiKeyChange={setEditApiKey}
                        onBaseUrlChange={setEditBaseUrl}
                        onModelsChange={setEditModels}
                        onDefaultModelChange={setEditDefaultModel}
                        onDefaultVoiceChange={setEditDefaultVoice}
                        onShowApiKeyChange={setShowApiKey}
                        onSave={() => handleSave(selectedModalityProvider)}
                        onTest={() => handleTestConnection(selectedModalityProvider)}
                        onCalibrate={activeTab === "tts" ? () => handleCalibrateTts(selectedModalityProvider) : undefined}
                        onDelete={() => setDeletingProvider(selectedModalityProvider)}
                      />
                    </Card>
                  ) : (
                    <EmptyPanel text="选择一个服务商后编辑连接信息。" />
                  )}
                </div>
              )}
            </main>
          </div>
        </I18nProvider>
      </ThemeProvider>

      {/* 删除确认对话框 */}
      {deletingProvider ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-stone-900">确认删除配置</h3>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              即将删除 <span className="font-bold text-stone-900">{deletingProvider.name}</span> 的密钥、
              服务地址、模型列表等全部配置。删除后需重新填写才能使用该服务。
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingProvider(null)}
                disabled={deleting}
                className="h-9 rounded-[8px] border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deletingProvider)}
                disabled={deleting}
                className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--pbl-danger)] px-4 text-sm font-medium text-white transition hover:bg-[var(--pbl-danger-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pbl-danger)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}

function ProviderList({
  providers,
  selectedId,
  section,
  savedConfigs,
  onSelect,
  onDelete,
}: {
  providers: ProviderMeta[];
  selectedId: string | null;
  section: ProviderSection;
  savedConfigs: Record<string, SavedConfig>;
  onSelect: (provider: ProviderMeta) => void;
  onDelete: (provider: ProviderMeta) => void;
}) {
  if (providers.length === 0) {
    return <EmptyPanel text="没有匹配的服务商。" />;
  }

  return (
    <div className="space-y-2">
      {providers.map((provider) => {
        const saved = savedConfigs[configKey(section, provider.id)];
        const selected = selectedId === provider.id;
        return (
          <button
            key={provider.id}
            type="button"
            onClick={() => onSelect(provider)}
            className={cn(
              "group flex w-full items-center gap-3 rounded-[8px] border px-3 py-3 text-left transition",
              selected
                ? "border-[var(--pbl-teacher)]/40 bg-[var(--pbl-teacher-soft)] shadow-sm"
                : "border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50",
            )}
          >
            <ProviderLogo icon={provider.icon} name={provider.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-stone-900">
                {provider.name}
              </span>
              <span className="mt-1 flex items-center gap-2">
                <ProviderStateBadge provider={provider} saved={saved} />
              </span>
            </span>
            {saved?.hasApiKey ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(provider);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    onDelete(provider);
                  }
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-stone-300 opacity-0 transition group-hover:opacity-100 hover:bg-[var(--pbl-danger-soft)] hover:text-[var(--pbl-danger)]"
                title="删除配置"
              >
                <Trash2 size={13} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function LlmConfigForm({
  provider,
  saved,
  editApiKey,
  editBaseUrl,
  editModels,
  editDefaultModel,
  showApiKey,
  saving,
  testing,
  saveResult,
  testResult,
  onApiKeyChange,
  onBaseUrlChange,
  onModelsChange,
  onDefaultModelChange,
  onShowApiKeyChange,
  onSave,
  onTest,
}: {
  provider: ProviderMeta;
  saved?: SavedConfig;
  editApiKey: string;
  editBaseUrl: string;
  editModels: string;
  editDefaultModel: string;
  showApiKey: boolean;
  saving: boolean;
  testing: boolean;
  saveResult: ResultState;
  testResult: ResultState;
  onApiKeyChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onModelsChange: (value: string) => void;
  onDefaultModelChange: (value: string) => void;
  onShowApiKeyChange: (value: boolean) => void;
  onSave: () => void;
  onTest: () => void;
}) {
  const modelIds = splitModelIds(editModels);
  const testModel = editDefaultModel || modelIds[0] || "";

  return (
    <div className="space-y-5">
      <SecretField
        label="密钥"
        value={editApiKey}
        show={showApiKey}
        required={provider.requiresApiKey}
        saved={saved?.hasApiKey}
        placeholder={saved?.hasApiKey ? "留空则继续使用已保存的密钥" : "输入密钥"}
        onChange={onApiKeyChange}
        onToggleShow={() => onShowApiKeyChange(!showApiKey)}
      />

      <Field label="服务地址" icon={Server}>
        <TextInput
          value={editBaseUrl}
          onChange={(event) => onBaseUrlChange(event.target.value)}
          placeholder={provider.defaultBaseUrl || "输入兼容 OpenAI / Anthropic 的服务地址"}
        />
        {provider.defaultBaseUrl ? (
          <button
            type="button"
            onClick={() => onBaseUrlChange(provider.defaultBaseUrl || "")}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--pbl-teacher)] hover:text-[var(--pbl-teacher)]"
          >
            <RefreshCw size={13} />
            恢复默认地址
          </button>
        ) : null}
      </Field>

      <Field label="模型列表" helper="用逗号或换行分隔；测试和生成会使用默认模型。" icon={Bot}>
        <TextArea
          value={editModels}
          onChange={(event) => onModelsChange(event.target.value)}
          rows={4}
          placeholder="deepseek-v4-flash&#10;deepseek-v4-pro"
        />
      </Field>

      {modelIds.length > 0 ? (
        <Field
          label="默认模型"
          helper={`闪电标记的模型为当前活跃模型，连接测试将使用 ${qualifyModelForProvider(testModel, provider.id)}`}
          icon={CircleDot}
        >
          <div className="grid gap-2 md:grid-cols-2">
            {modelIds.map((modelId) => {
              const modelMeta = provider.models.find((model) => model.id === modelId);
              const selected = editDefaultModel === modelId;
              return (
                <button
                  key={modelId}
                  type="button"
                  onClick={() => onDefaultModelChange(modelId)}
                  className={cn(
                    "flex min-h-12 items-center gap-2 rounded-[8px] border px-3 py-2 text-left text-sm transition",
                    selected
                      ? "border-[var(--pbl-teacher)] bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)] shadow-sm ring-1 ring-[var(--pbl-teacher)]/20"
                      : "border-stone-200 bg-white text-stone-600 hover:border-stone-300",
                  )}
                >
                  {selected ? (
                    <Zap size={17} className="shrink-0 text-[var(--pbl-teacher)]" />
                  ) : (
                    <Circle size={17} className="shrink-0 text-stone-300" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{modelMeta?.name || modelId}</span>
                    {modelMeta ? <span className="block truncate text-xs opacity-75">{modelId}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </Field>
      ) : null}

      <ActionRow
        saving={saving}
        testing={testing}
        saveResult={saveResult}
        testResult={testResult}
        onSave={onSave}
        onTest={onTest}
      />
    </div>
  );
}

function ModalityConfigForm({
  provider,
  saved,
  editApiKey,
  editBaseUrl,
  editModels,
  editDefaultModel,
  editDefaultVoice,
  showApiKey,
  saving,
  testing,
  calibrating,
  saveResult,
  testResult,
  onApiKeyChange,
  onBaseUrlChange,
  onModelsChange,
  onDefaultModelChange,
  onDefaultVoiceChange,
  onShowApiKeyChange,
  onSave,
  onTest,
  onCalibrate,
  onDelete,
}: {
  provider: ProviderMeta;
  saved?: SavedConfig;
  editApiKey: string;
  editBaseUrl: string;
  editModels: string;
  editDefaultModel: string;
  editDefaultVoice: string;
  showApiKey: boolean;
  saving: boolean;
  testing: boolean;
  calibrating: boolean;
  saveResult: ResultState;
  testResult: ResultState;
  onApiKeyChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onModelsChange: (value: string) => void;
  onDefaultModelChange: (value: string) => void;
  onDefaultVoiceChange: (value: string) => void;
  onShowApiKeyChange: (value: boolean) => void;
  onSave: () => void;
  onTest: () => void;
  onCalibrate?: () => void;
  onDelete: () => void;
}) {
  const availableModels = provider.models ?? [];
  const modelIds = splitModelIds(editModels);
  const availableVoices = getTTSVoices(provider.id as keyof typeof TTS_PROVIDERS);
  const activeCalibration = saved?.timingCalibrations?.find(
    (item) => item.modelId === editDefaultModel
      && item.voiceId === editDefaultVoice
      && (item.language || "zh-CN").toLowerCase() === "zh-cn"
      && (item.speed ?? 1) === 1,
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px]">
      <div className="space-y-4">
        {provider.requiresApiKey ? (
          <SecretField
            label="密钥"
            value={editApiKey}
            show={showApiKey}
            required
            saved={saved?.hasApiKey}
            placeholder={saved?.hasApiKey ? "留空则继续使用已保存的密钥" : "输入密钥"}
            onChange={onApiKeyChange}
            onToggleShow={() => onShowApiKeyChange(!showApiKey)}
          />
        ) : (
          <ResultNotice result={{ ok: true, message: "该服务不需要密钥。" }} />
        )}

        <Field label="服务地址" icon={Server}>
          <TextInput
            value={editBaseUrl}
            onChange={(event) => onBaseUrlChange(event.target.value)}
            placeholder={provider.defaultBaseUrl || "可选：自定义服务地址"}
          />
          {provider.defaultBaseUrl ? (
            <button
              type="button"
              onClick={() => onBaseUrlChange(provider.defaultBaseUrl || "")}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--pbl-teacher)] hover:text-[var(--pbl-teacher)]"
            >
              <RefreshCw size={13} />
              恢复默认地址
            </button>
          ) : null}
        </Field>

        {availableModels.length > 0 ? (
          <Field label="模型" helper="圆点标记的模型为当前活跃模型。" icon={Bot}>
            <div className="flex flex-wrap gap-2">
              {availableModels.map((m) => {
                const isActive = editDefaultModel === m.id;
                const isSelected = modelIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onDefaultModelChange(m.id);
                      if (!isSelected) {
                        onModelsChange(editModels ? `${editModels}, ${m.id}` : m.id);
                      }
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                      isActive
                        ? "border-[var(--pbl-teacher)] bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)] shadow-sm ring-1 ring-[var(--pbl-teacher)]/20"
                        : isSelected
                          ? "border-stone-300 bg-stone-50 text-stone-700"
                          : "border-stone-200 bg-white text-stone-500 hover:border-stone-300",
                    )}
                  >
                    {isActive ? (
                      <Zap size={12} className="text-[var(--pbl-teacher)]" />
                    ) : (
                      <Circle size={12} />
                    )}
                    {m.name || m.id}
                  </button>
                );
              })}
            </div>
          </Field>
        ) : null}

        {onCalibrate ? (
          <Field
            label="默认音色与自然语速"
            helper="语速建模会以 1.0 倍自然语速生成标准文本，并用实际音频时长计算该模型与音色的内容预算。"
            icon={Volume2}
          >
            <select
              value={editDefaultVoice}
              onChange={(event) => onDefaultVoiceChange(event.target.value)}
              className="h-10 w-full rounded-[8px] border border-stone-200 bg-white px-3 text-sm text-stone-800 outline-none focus:border-[var(--pbl-teacher)]"
            >
              {availableVoices.length > 0 ? availableVoices.map((voice) => (
                <option key={voice.id} value={voice.id}>{voice.name}</option>
              )) : <option value="default">默认音色</option>}
            </select>
            {activeCalibration ? (
              <div className="mt-2 rounded-[8px] border border-[var(--pbl-success-border)] bg-[var(--pbl-success-soft)] px-3 py-2 text-xs text-[var(--pbl-success)]">
                已建模：约 {activeCalibration.cjkCharsPerMinute.toFixed(1)} 字/分钟，累计 {activeCalibration.sampleCount ?? 1} 次测试
              </div>
            ) : (
              <div className="mt-2 text-xs text-[var(--pbl-warning)]">当前模型与音色尚未建模，将暂用内置保守语速。</div>
            )}
          </Field>
        ) : null}
      </div>

      <div className="flex flex-col justify-between rounded-[8px] border border-stone-200 bg-stone-50 p-3">
        <div className="text-xs leading-5 text-stone-500">
          <div className="mb-3 rounded-[8px] border border-stone-200 bg-white p-2 text-[var(--pbl-teacher)]">
            <div className="flex items-center gap-1.5 font-bold">
              {saved?.priority === 0 ? <CheckCircle2 size={13} /> : <Zap size={13} />}
              {saved?.priority === 0 ? "当前应用默认" : "保存后设为默认"}
            </div>
            <div className="mt-1 text-[11px] leading-4 text-stone-500">
              系统会优先使用此服务商和选中的默认模型完成对应模态任务。
            </div>
          </div>
          <div className="font-bold text-stone-700">服务标识</div>
          <div className="mt-1 break-all">{provider.id}</div>
        </div>
        <div className="mt-4 space-y-2">
          <PrimaryButton onClick={onSave} disabled={saving || testing} className="h-9 w-full px-3 text-sm">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            保存为默认
          </PrimaryButton>
          <PrimaryButton
            variant="outline"
            onClick={onTest}
            disabled={saving || testing}
            className="h-9 w-full px-3 text-sm"
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
            测试
          </PrimaryButton>
          {onCalibrate ? (
            <PrimaryButton
              variant="outline"
              onClick={onCalibrate}
              disabled={saving || testing || calibrating}
              className="h-9 w-full px-3 text-sm"
            >
              {calibrating ? <Loader2 size={14} className="animate-spin" /> : <SlidersHorizontal size={14} />}
              语速建模
            </PrimaryButton>
          ) : null}
          {saved?.hasApiKey ? (
            <button
              type="button"
              onClick={onDelete}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[8px] border border-[var(--pbl-danger-border)] bg-white px-3 text-sm font-medium text-[var(--pbl-danger)] transition hover:bg-[var(--pbl-danger-soft)]"
            >
              <Trash2 size={14} />
              删除
            </button>
          ) : null}
          <ResultNotice result={saveResult} compact />
          <ResultNotice result={testResult} compact />
          {testResult?.audioUrl ? (
            <audio className="mt-2 w-full" controls preload="metadata" src={testResult.audioUrl} />
          ) : null}
          {testResult?.previewUrl ? (
            <Image
              alt="图像模型测试结果"
              className="mt-2 h-auto w-full rounded-[8px] border border-stone-200 object-cover"
              height={180}
              src={testResult.previewUrl}
              unoptimized
              width={180}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActionRow({
  saving,
  testing,
  saveResult,
  testResult,
  onSave,
  onTest,
}: {
  saving: boolean;
  testing: boolean;
  saveResult: ResultState;
  testResult: ResultState;
  onSave: () => void;
  onTest: () => void;
}) {
  return (
    <div className="space-y-3 border-t border-stone-100 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <PrimaryButton onClick={onSave} disabled={saving || testing} className="h-10 px-4 text-sm">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          保存配置
        </PrimaryButton>
        <PrimaryButton
          variant="outline"
          onClick={onTest}
          disabled={saving || testing}
          className="h-10 px-4 text-sm"
        >
          {testing ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />}
          测试连接
        </PrimaryButton>
      </div>
      <ResultNotice result={saveResult} />
      <ResultNotice result={testResult} />
    </div>
  );
}

function Field({
  label,
  helper,
  icon: Icon,
  children,
}: {
  label: string;
  helper?: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 text-sm font-bold text-stone-800">
        {Icon ? <Icon size={16} className="text-stone-400" /> : null}
        {label}
      </span>
      {children}
      {helper ? <span className="mt-2 block text-xs leading-5 text-stone-500">{helper}</span> : null}
    </label>
  );
}

function SecretField({
  label,
  value,
  show,
  required,
  saved,
  placeholder,
  onChange,
  onToggleShow,
}: {
  label: string;
  value: string;
  show: boolean;
  required?: boolean;
  saved?: boolean;
  placeholder: string;
  onChange: (value: string) => void;
  onToggleShow: () => void;
}) {
  return (
    <Field
      label={label}
      helper={
        saved
          ? "已保存的密钥不会回显；留空保存会继续保留原密钥。"
          : required
            ? "该服务需要有效密钥。"
            : "该服务可以不填写密钥。"
      }
      icon={KeyRound}
    >
      <div className="relative">
        <TextInput
          type={show ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="pr-11"
        />
        <button
          type="button"
          aria-label={show ? "隐藏密钥" : "显示密钥"}
          onClick={onToggleShow}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-[6px] text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </Field>
  );
}

function ResultNotice({ result, compact = false }: { result: ResultState; compact?: boolean }) {
  if (!result) return null;

  return (
    <div
      className={cn(
        "flex gap-2 rounded-[8px] border text-sm",
        compact ? "mt-2 px-2 py-2 text-xs" : "px-3 py-2",
        result.ok
          ? "border-[var(--pbl-success-border)] bg-[var(--pbl-success-soft)] text-[var(--pbl-success)]"
          : "border-[var(--pbl-danger-border)] bg-[var(--pbl-danger-soft)] text-[var(--pbl-danger)]",
      )}
    >
      {result.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <X size={16} className="mt-0.5 shrink-0" />}
      <span className="min-w-0">
        <span className="block font-semibold">{result.message}</span>
        {result.detail ? <span className="mt-1 block break-all opacity-80">{result.detail}</span> : null}
      </span>
    </div>
  );
}

function StatusTile({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[8px] border border-stone-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)]">
          <Icon size={19} />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-bold uppercase tracking-[0.08em] text-stone-400">
            {label}
          </span>
          <span className="mt-1 block truncate text-lg font-bold text-stone-900">{value}</span>
          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-stone-500">{helper}</span>
        </span>
      </div>
    </div>
  );
}

function ProviderStateBadge({ provider, saved }: { provider: ProviderMeta; saved?: SavedConfig }) {
  const isDefault = saved?.priority === 0;
  const isConfigured = saved?.hasApiKey || saved?.enabled !== undefined;
  const activeModel = saved?.defaultModel || saved?.models?.[0];

  if (isConfigured) {
    return (
      <span className="flex items-center gap-1.5">
        {isDefault ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pbl-success-soft)] px-2 py-0.5 text-xs font-bold text-[var(--pbl-success)] ring-1 ring-[var(--pbl-success)]/30">
            <CheckCircle2 size={10} />
            默认
          </span>
        ) : (
          <Pill tone="green" className="h-5 px-1.5 text-[10px]">已配置</Pill>
        )}
        {activeModel ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">
            {activeModel}
          </span>
        ) : null}
      </span>
    );
  }
  if (!provider.requiresApiKey) {
    return (
      <span className="flex items-center gap-1.5">
        <Pill tone="blue" className="h-5 px-1.5 text-[10px]">无需密钥</Pill>
        {isDefault ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pbl-success-soft)] px-2 py-0.5 text-xs font-bold text-[var(--pbl-success)] ring-1 ring-[var(--pbl-success)]/30">
            <CheckCircle2 size={10} />
            默认
          </span>
        ) : null}
      </span>
    );
  }
  return <Pill tone="gray" className="h-5 px-1.5 text-[10px]">未配置</Pill>;
}

function ProviderLogo({ icon, name }: { icon?: string; name: string }) {
  if (icon) {
    const src = icon.startsWith("/logos/") ? `/openmaic${icon}` : icon;
    return (
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-stone-200 bg-white">
        <Image
          src={src}
          alt={name}
          width={28}
          height={28}
          className="object-contain"
          style={{ width: 28, height: 28 }}
        />
      </span>
    );
  }

  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] bg-stone-100 text-sm font-bold text-stone-600">
      {name.slice(0, 2)}
    </span>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="grid min-h-56 place-items-center rounded-[8px] border border-dashed border-stone-300 bg-stone-50 text-center text-sm text-stone-500">
      <div>
        <AlertCircle className="mx-auto mb-2 text-stone-400" size={22} />
        {text}
      </div>
    </div>
  );
}
