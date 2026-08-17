import { describe, expect, it } from "vitest";

import { getProviderStatePresentation } from "./ai-service-settings";

describe("getProviderStatePresentation", () => {
  it("marks providers without saved credentials as unconfigured", () => {
    expect(getProviderStatePresentation({ requiresApiKey: true })).toEqual({
      label: "未配置",
      tone: "neutral",
      model: undefined,
    });
  });

  it("keeps no-key providers distinct from configured providers", () => {
    expect(getProviderStatePresentation({ requiresApiKey: false })).toEqual({
      label: "无需密钥",
      tone: "info",
      model: undefined,
    });
  });

  it("shows the active model without changing the configured label", () => {
    expect(getProviderStatePresentation({
      requiresApiKey: true,
      saved: {
        hasApiKey: true,
        defaultModel: "provider/a-very-long-model-name-that-must-not-wrap",
        priority: 2,
      },
    })).toEqual({
      label: "已配置",
      tone: "success",
      model: "provider/a-very-long-model-name-that-must-not-wrap",
    });
  });

  it("marks the highest-priority configured provider as default", () => {
    expect(getProviderStatePresentation({
      requiresApiKey: true,
      saved: {
        hasApiKey: true,
        models: ["fallback-model"],
        priority: 0,
      },
    })).toEqual({
      label: "默认",
      tone: "success",
      model: "fallback-model",
    });
  });
});
