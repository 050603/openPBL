export type ProviderSavedState = {
  hasApiKey?: boolean;
  enabled?: boolean;
  defaultModel?: string;
  models?: string[];
  priority?: number;
};

export type ProviderStatePresentation = {
  label: "默认" | "已配置" | "无需密钥" | "未配置";
  tone: "success" | "info" | "neutral";
  model?: string;
};

export function getProviderStatePresentation({
  requiresApiKey,
  saved,
}: {
  requiresApiKey: boolean;
  saved?: ProviderSavedState;
}): ProviderStatePresentation {
  const isConfigured = Boolean(saved?.hasApiKey || saved?.enabled !== undefined);

  if (isConfigured) {
    return {
      label: saved?.priority === 0 ? "默认" : "已配置",
      tone: "success",
      model: saved?.defaultModel || saved?.models?.[0],
    };
  }

  if (!requiresApiKey) {
    return {
      label: "无需密钥",
      tone: "info",
      model: undefined,
    };
  }

  return {
    label: "未配置",
    tone: "neutral",
    model: undefined,
  };
}
