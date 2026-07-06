"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import Image from "next/image";
import {
  AlertCircle,
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
  Trash2,
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
import { ASR_PROVIDERS, DEFAULT_TTS_VOICES, TTS_PROVIDERS } from "@openmaic/lib/audio/constants";
import { IMAGE_PROVIDERS } from "@openmaic/lib/media/image-providers";
import { VIDEO_PROVIDERS } from "@openmaic/lib/media/video-providers";
import { PDF_PROVIDERS } from "@openmaic/lib/pdf/constants";
import { WEB_SEARCH_PROVIDERS } from "@openmaic/lib/web-search/constants";
import { ServerProvidersInit } from "@openmaic/components/server-providers-init";
import { I18nProvider } from "@openmaic/lib/hooks/use-i18n";
import { ThemeProvider } from "@openmaic/lib/hooks/use-theme";

type TabKey = "llm" | "tts" | "asr" | "image" | "video" | "web-search" | "pdf";

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
};

type ResultState = {
  ok: boolean;
  message: string;
  detail?: string;
} | null;

const TABS: Array<{
  key: TabKey;
  label: string;
  shortLabel: string;
  section: ProviderSection;
  icon: ComponentType<{ size?: number; className?: string }>;
}> = [
  { key: "llm", label: "LLM 大模型", shortLabel: "LLM", section: "providers", icon: Bot },
  { key: "tts", label: "TTS 语音合成", shortLabel: "TTS", section: "tts", icon: Volume2 },
  { key: "asr", label: "ASR 语音识别", shortLabel: "ASR", section: "asr", icon: Mic },
  { key: "image", label: "图像生成", shortLabel: "图像", section: "image", icon: ImageIcon },
  { key: "video", label: "视频生成", shortLabel: "视频", section: "video", icon: Video },
  { key: "web-search", label: "Web 搜索", shortLabel: "搜索", section: "web-search", icon: Search },
  { key: "pdf", label: "PDF 解析", shortLabel: "PDF", section: "pdf", icon: FileText },
];

const TAB_COPY: Record<TabKey, { title: string; description: string; tips: string[] }> = {
  llm: {
    title: "LLM 连接配置",
    description: "配置课堂生成、PBL 对话和评价反馈使用的大语言模型。",
    tips: ["选择 Provider", "填写 API Key 与 Base URL", "确认模型列表并选择默认模型", "保存后执行连接测试"],
  },
  tts: {
    title: "语音合成配置",
    description: "配置课堂旁白、角色朗读和讲解音频使用的 TTS 服务。",
    tips: ["选择服务商", "按需填写 Key 与网关地址", "保存后在生成语音时生效"],
  },
  asr: {
    title: "语音识别配置",
    description: "配置学生语音输入转写服务。",
    tips: ["选择识别服务", "填写凭据", "课堂语音输入会读取这里的服务端配置"],
  },
  image: {
    title: "图像生成配置",
    description: "配置课堂素材和场景插图生成服务。",
    tips: ["选择图像模型服务", "填写凭据", "后续生成图片时使用服务端配置"],
  },
  video: {
    title: "视频生成配置",
    description: "配置视频素材生成服务。",
    tips: ["选择视频服务", "填写凭据", "保存配置后进入生成流程"],
  },
  "web-search": {
    title: "联网搜索配置",
    description: "配置 AI 实时检索网络资料时使用的搜索服务。",
    tips: ["选择搜索引擎", "填写 API Key", "保存后用于资料检索与事实补充"],
  },
  pdf: {
    title: "PDF 解析配置",
    description: "配置读取和解析 PDF 教材资料的服务。",
    tips: ["选择解析服务", "云服务填写 Key", "本地解析服务按需填写 Base URL"],
  },
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
  if (typeof record.error === "string") return record.error;
  if (typeof record.message === "string") return record.message;
  if (typeof record.details === "string") return record.details;
  return fallback;
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
  const [showApiKey, setShowApiKey] = useState(false);

  const [savingProviderId, setSavingProviderId] = useState<string | null>(null);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
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
      setExpandedId((current) => (current === provider.id ? null : provider.id));
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
      setSaveResult({ ok: false, message: "请先填写 API Key。" });
      return;
    }

    if (activeTab === "llm" && modelIds.length === 0) {
      setSaveResult({ ok: false, message: "请至少保留一个模型 ID。" });
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
                }),
              });
            }),
        );
      }

      setSaveResult({
        ok: true,
        message:
          activeTab === "tts" && makeDefault
            ? "TTS 配置已保存，并设为课程生成默认模型。"
            : makeDefault
              ? "配置已保存，并设为当前模态默认。"
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

    if (!modelId && activeTab !== "tts") {
      setTestResult({ ok: false, message: "请先选择或填写一个模型 ID。" });
      return;
    }
    if (provider.requiresApiKey && !saved?.hasApiKey && !editApiKey.trim()) {
      setTestResult({ ok: false, message: "请先填写 API Key，或保存已有配置后再测试。" });
      return;
    }

    if (activeTab === "tts") {
      if (provider.id === "browser-native-tts") {
        setTestResult({
          ok: false,
          message: "浏览器本地 TTS 不能用于课程生成音频，请选择云端 TTS 服务。",
        });
        return;
      }

      const voice =
        DEFAULT_TTS_VOICES[provider.id as keyof typeof DEFAULT_TTS_VOICES] || "default";
      setTestingProviderId(provider.id);
      setTestResult(null);
      try {
        const response = await fetch("/api/openmaic/generate/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: "这是一段课程语音合成测试，用于确认当前 TTS 配置可以生成课堂讲解音频。",
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

        if (!response.ok || data?.success === false || !audioBase64) {
          throw new Error(getReadableError(data, "TTS 测试失败，请检查 Key、Base URL、模型和音色。"));
        }

        setTestResult({
          ok: true,
          message: "TTS 测试成功，已生成可用音频。",
          detail: `测试模型：${modelId || "provider default"}；音色：${voice}`,
        });
      } catch (error) {
        setTestResult({
          ok: false,
          message: error instanceof Error ? error.message : "TTS 测试失败，请稍后重试。",
          detail: `测试模型：${modelId || "provider default"}；音色：${voice}`,
        });
      } finally {
        setTestingProviderId(null);
      }
      return;
    }

    const qualifiedModel = qualifyModelForProvider(modelId, provider.id);
    setTestingProviderId(provider.id);
    setTestResult(null);

    try {
      const response = await fetch("/api/openmaic/verify-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: qualifiedModel,
          providerId: provider.id,
          apiKey: editApiKey.trim() || undefined,
          baseUrl: editBaseUrl.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || data?.success === false) {
        throw new Error(getReadableError(data, "连接失败，请检查 Key、Base URL 和模型 ID。"));
      }

      setTestResult({
        ok: true,
        message: data?.message || "连接成功。",
        detail: `测试模型：${qualifiedModel}`,
      });
    } catch (error) {
      setTestResult({
        ok: false,
        message: error instanceof Error ? error.message : "连接失败，请稍后重试。",
        detail: `测试模型：${qualifiedModel}`,
      });
    } finally {
      setTestingProviderId(null);
    }
  }

  const selectedLlmProvider = providers.find((provider) => provider.id === selectedLlmId) ?? null;

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
      <PageHeader
        eyebrow="AI service console"
        title="AI 服务设置"
        description="集中管理 LLM、语音、图像、视频、搜索和 PDF 解析服务。配置保存在服务端，课堂生成与授课流程会直接读取这里的连接信息。"
      />

      <ThemeProvider>
        <I18nProvider>
          <ServerProvidersInit />

          <div className="mb-5 grid gap-3 lg:grid-cols-3">
            <StatusTile
              icon={BadgeCheck}
              label="当前模块"
              value={currentTab.label}
              helper={tabCopy.description}
            />
            <StatusTile
              icon={KeyRound}
              label="已配置 Provider"
              value={`${configuredCount} / ${providers.length}`}
              helper="以服务端已保存 API Key 为准"
            />
            <StatusTile
              icon={Server}
              label="当前应用默认"
              value={
                currentDefaultProvider?.provider.name ||
                (activeTab === "llm" ? "未指定默认模型" : "未指定")
              }
              helper={
                currentDefaultProvider
                  ? currentDefaultProvider.saved?.defaultModel ||
                    currentDefaultProvider.saved?.models?.[0]
                    ? `默认模型：${
                        currentDefaultProvider.saved?.defaultModel ||
                        currentDefaultProvider.saved?.models?.[0]
                      }`
                    : "该模态当前只需指定默认服务商"
                  : "保存某个服务商配置后会设为该模态默认"
              }
            />
          </div>

          <div className="mb-5 overflow-x-auto border-b border-slate-200">
            <div className="flex min-w-max gap-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleTabChange(tab.key)}
                    className={cn(
                      "inline-flex h-12 items-center gap-2 border-b-2 px-4 text-sm font-bold transition",
                      active
                        ? "border-blue-600 text-blue-700"
                        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
                    )}
                  >
                    <Icon size={16} />
                    {tab.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_310px]">
            <main className="min-w-0">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-950">{tabCopy.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{tabCopy.description}</p>
                </div>
                <div className="relative w-full md:w-[320px]">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <TextInput
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索 Provider 名称或 ID"
                    className="pl-9"
                  />
                </div>
              </div>

              {configLoading ? (
                <div className="mb-4 inline-flex items-center gap-2 rounded-[6px] bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-500">
                  <Loader2 size={16} className="animate-spin" />
                  正在读取服务端配置
                </div>
              ) : null}

              {activeTab === "llm" ? (
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
                        hint={`Provider ID: ${selectedLlmProvider.id}`}
                        action={
                          <span className="flex items-center gap-2">
                            {getSavedConfig("providers", selectedLlmProvider.id)?.hasApiKey ? (
                              <Pill tone="green">已保存 Key</Pill>
                            ) : (
                              <Pill tone={selectedLlmProvider.requiresApiKey ? "amber" : "blue"}>
                                {selectedLlmProvider.requiresApiKey ? "待配置" : "免 Key"}
                              </Pill>
                            )}
                            {getSavedConfig("providers", selectedLlmProvider.id)?.hasApiKey ? (
                              <button
                                type="button"
                                onClick={() => setDeletingProvider(selectedLlmProvider)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-400 transition hover:bg-red-50 hover:text-red-600"
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
                    <EmptyPanel text="选择一个 Provider 后编辑连接信息。" />
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredProviders.map((provider) => {
                    const saved = getSavedConfig(currentTab.section, provider.id);
                    const expanded = expandedId === provider.id;
                    return (
                      <Card key={provider.id} compact className="overflow-hidden">
                        <button
                          type="button"
                          onClick={() => selectProvider(provider)}
                          className="flex w-full items-center gap-3 text-left"
                        >
                          <ProviderLogo icon={provider.icon} name={provider.name} />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-black text-slate-950">{provider.name}</span>
                              <ProviderStateBadge provider={provider} saved={saved} />
                            </span>
                            <span className="mt-1 block truncate text-xs text-slate-500">
                              {provider.defaultBaseUrl || provider.description || `Provider ID: ${provider.id}`}
                            </span>
                          </span>
                          <ChevronRight
                            size={18}
                            className={cn("shrink-0 text-slate-400 transition", expanded && "rotate-90")}
                          />
                        </button>

                        {expanded ? (
                          <div className="mt-4 border-t border-slate-100 pt-4">
                            <ModalityConfigForm
                              provider={provider}
                              saved={saved}
                              editApiKey={editApiKey}
                              editBaseUrl={editBaseUrl}
                              editModels={editModels}
                              editDefaultModel={editDefaultModel}
                              showApiKey={showApiKey}
                              saving={savingProviderId === provider.id}
                              testing={testingProviderId === provider.id}
                              saveResult={saveResult}
                              testResult={testResult}
                              onApiKeyChange={setEditApiKey}
                              onBaseUrlChange={setEditBaseUrl}
                              onModelsChange={setEditModels}
                              onDefaultModelChange={setEditDefaultModel}
                              onShowApiKeyChange={setShowApiKey}
                              onSave={() => handleSave(provider)}
                              onTest={() => handleTestConnection(provider)}
                              onDelete={() => setDeletingProvider(provider)}
                            />
                          </div>
                        ) : null}
                      </Card>
                    );
                  })}
                  {filteredProviders.length === 0 ? <EmptyPanel text="没有匹配的 Provider。" /> : null}
                </div>
              )}
            </main>

            <aside className="min-w-0">
              <Card className="sticky top-24">
                <div className="mb-4 flex items-center gap-2">
                  <SlidersHorizontal size={18} className="text-blue-600" />
                  <h3 className="text-base font-black text-slate-950">操作顺序</h3>
                </div>
                <div className="space-y-3">
                  {tabCopy.tips.map((tip, index) => (
                    <div key={tip} className="flex gap-3 text-sm text-slate-600">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-black text-blue-700">
                        {index + 1}
                      </span>
                      <span className="leading-6">{tip}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-[8px] border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                    连接测试说明
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    LLM 测试会向服务端发送完整模型标识，例如
                    <span className="font-semibold text-slate-900"> deepseek:deepseek-v4-flash</span>，
                    避免被错误解析为 OpenAI 模型。
                  </p>
                </div>
              </Card>
            </aside>
          </div>
        </I18nProvider>
      </ThemeProvider>

      {/* 删除确认对话框 */}
      {deletingProvider ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-black text-slate-950">确认删除配置</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              即将删除 <span className="font-bold text-slate-900">{deletingProvider.name}</span> 的 API Key、
              Base URL、模型列表等全部配置。删除后需重新填写才能使用该服务。
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingProvider(null)}
                disabled={deleting}
                className="h-9 rounded-[8px] border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deletingProvider)}
                disabled={deleting}
                className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
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
    return <EmptyPanel text="没有匹配的 Provider。" />;
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
                ? "border-blue-300 bg-blue-50 shadow-sm"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            <ProviderLogo icon={provider.icon} name={provider.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-black text-slate-950">
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
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
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
        label="API Key"
        value={editApiKey}
        show={showApiKey}
        required={provider.requiresApiKey}
        saved={saved?.hasApiKey}
        placeholder={saved?.hasApiKey ? "留空则继续使用已保存的 Key" : "输入 API Key"}
        onChange={onApiKeyChange}
        onToggleShow={() => onShowApiKeyChange(!showApiKey)}
      />

      <Field label="Base URL" icon={Server}>
        <TextInput
          value={editBaseUrl}
          onChange={(event) => onBaseUrlChange(event.target.value)}
          placeholder={provider.defaultBaseUrl || "输入兼容 OpenAI / Anthropic 的服务地址"}
        />
        {provider.defaultBaseUrl ? (
          <button
            type="button"
            onClick={() => onBaseUrlChange(provider.defaultBaseUrl || "")}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
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
                      ? "border-blue-400 bg-blue-50 text-blue-800 shadow-sm ring-1 ring-blue-200"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                  )}
                >
                  {selected ? (
                    <Zap size={17} className="shrink-0 text-blue-500" />
                  ) : (
                    <Circle size={17} className="shrink-0 text-slate-300" />
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
  onDelete,
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
  onDelete: () => void;
}) {
  const availableModels = provider.models ?? [];
  const modelIds = splitModelIds(editModels);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px]">
      <div className="space-y-4">
        {provider.requiresApiKey ? (
          <SecretField
            label="API Key"
            value={editApiKey}
            show={showApiKey}
            required
            saved={saved?.hasApiKey}
            placeholder={saved?.hasApiKey ? "留空则继续使用已保存的 Key" : "输入 API Key"}
            onChange={onApiKeyChange}
            onToggleShow={() => onShowApiKeyChange(!showApiKey)}
          />
        ) : (
          <ResultNotice result={{ ok: true, message: "该 Provider 不需要 API Key。" }} />
        )}

        <Field label="Base URL" icon={Server}>
          <TextInput
            value={editBaseUrl}
            onChange={(event) => onBaseUrlChange(event.target.value)}
            placeholder={provider.defaultBaseUrl || "可选：自定义服务地址"}
          />
          {provider.defaultBaseUrl ? (
            <button
              type="button"
              onClick={() => onBaseUrlChange(provider.defaultBaseUrl || "")}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
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
                        ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200"
                        : isSelected
                          ? "border-slate-300 bg-slate-50 text-slate-700"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
                    )}
                  >
                    {isActive ? (
                      <Zap size={12} className="text-blue-500" />
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
      </div>

      <div className="flex flex-col justify-between rounded-[8px] border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs leading-5 text-slate-500">
          <div className="mb-3 rounded-[8px] border border-blue-100 bg-white p-2 text-blue-700">
            <div className="flex items-center gap-1.5 font-bold">
              {saved?.priority === 0 ? <CheckCircle2 size={13} /> : <Zap size={13} />}
              {saved?.priority === 0 ? "当前应用默认" : "保存后设为默认"}
            </div>
            <div className="mt-1 text-[11px] leading-4 text-slate-500">
              系统会优先使用此服务商和选中的默认模型完成对应模态任务。
            </div>
          </div>
          <div className="font-bold text-slate-700">Provider ID</div>
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
          {saved?.hasApiKey ? (
            <button
              type="button"
              onClick={onDelete}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[8px] border border-red-200 bg-white px-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <Trash2 size={14} />
              删除
            </button>
          ) : null}
          <ResultNotice result={saveResult} compact />
          <ResultNotice result={testResult} compact />
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
    <div className="space-y-3 border-t border-slate-100 pt-4">
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
      <span className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
        {Icon ? <Icon size={16} className="text-slate-400" /> : null}
        {label}
      </span>
      {children}
      {helper ? <span className="mt-2 block text-xs leading-5 text-slate-500">{helper}</span> : null}
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
          ? "已保存的 Key 不会回显；留空保存会继续保留原 Key。"
          : required
            ? "该 Provider 需要有效 API Key。"
            : "该 Provider 可以不填写 API Key。"
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
          aria-label={show ? "隐藏 API Key" : "显示 API Key"}
          onClick={onToggleShow}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-[6px] text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
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
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700",
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
    <div className="rounded-[8px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] bg-blue-50 text-blue-700">
          <Icon size={19} />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
            {label}
          </span>
          <span className="mt-1 block truncate text-lg font-black text-slate-950">{value}</span>
          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-500">{helper}</span>
        </span>
      </div>
    </div>
  );
}

function ProviderStateBadge({ provider, saved }: { provider: ProviderMeta; saved?: SavedConfig }) {
  const defaultBadge =
    saved?.priority === 0 ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 size={10} />
        当前默认
      </span>
    ) : null;

  if (saved?.hasApiKey || saved?.enabled !== undefined) {
    const activeModel = saved?.defaultModel || saved?.models?.[0];
    return (
      <span className="flex items-center gap-1.5">
        <Pill tone="green" className="h-6 px-2 text-xs">{saved.hasApiKey ? "已配置" : "已启用"}</Pill>
        {defaultBadge}
        {activeModel ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
            <Zap size={10} className="text-blue-500" />
            {activeModel}
          </span>
        ) : null}
      </span>
    );
  }
  if (!provider.requiresApiKey) {
    return (
      <span className="flex items-center gap-1.5">
        <Pill tone="blue" className="h-6 px-2 text-xs">免 Key</Pill>
        {defaultBadge}
      </span>
    );
  }
  return <Pill tone="gray" className="h-6 px-2 text-xs">未配置</Pill>;
}

function ProviderLogo({ icon, name }: { icon?: string; name: string }) {
  if (icon) {
    const src = icon.startsWith("/logos/") ? `/openmaic${icon}` : icon;
    return (
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-slate-200 bg-white">
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
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] bg-slate-100 text-sm font-black text-slate-600">
      {name.slice(0, 2)}
    </span>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="grid min-h-56 place-items-center rounded-[8px] border border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500">
      <div>
        <AlertCircle className="mx-auto mb-2 text-slate-400" size={22} />
        {text}
      </div>
    </div>
  );
}
