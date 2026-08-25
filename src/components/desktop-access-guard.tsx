"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { isUnsupportedMobileOrTablet } from "@/lib/browser/device-access";

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: { mobile?: boolean };
};

type DeviceAccess = "checking" | "desktop" | "unsupported";

function subscribeToDeviceAccess() {
  return () => undefined;
}

function readDeviceAccess(): DeviceAccess {
  const browserNavigator = navigator as NavigatorWithUserAgentData;
  return isUnsupportedMobileOrTablet({
    userAgent: browserNavigator.userAgent,
    platform: browserNavigator.platform,
    maxTouchPoints: browserNavigator.maxTouchPoints,
    mobile: browserNavigator.userAgentData?.mobile,
  })
    ? "unsupported"
    : "desktop";
}

function readServerDeviceAccess(): DeviceAccess {
  return "checking";
}

export function DesktopAccessGuard({ children }: { children: ReactNode }) {
  const access = useSyncExternalStore(
    subscribeToDeviceAccess,
    readDeviceAccess,
    readServerDeviceAccess,
  );

  useEffect(() => {
    document.documentElement.dataset.openpblDevice = access;
  }, [access]);

  return (
    <div className="desktop-access-gate" data-access={access}>
      <div
        aria-hidden={access === "unsupported" ? undefined : true}
        className="desktop-access-blocker"
      >
        <main className="desktop-access-blocker__card">
          <span aria-hidden="true" className="desktop-access-blocker__icon">
            <svg fill="none" viewBox="0 0 48 48">
              <rect height="29" rx="4" stroke="currentColor" strokeWidth="2.5" width="40" x="4" y="6" />
              <path d="M17 42h14M24 35v7" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
              <path d="m18 20 4 4 8-9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
            </svg>
          </span>
          <p className="desktop-access-blocker__eyebrow">PrAIxis 实践课堂</p>
          <h1>请使用电脑访问</h1>
          <p>为了更好的使用体验，请使用电脑访问。</p>
          <p className="desktop-access-blocker__hint">
            课堂内容包含多区域学习画布、协作工作台与教学控制面板，暂不支持手机或平板设备。
          </p>
        </main>
      </div>
      <div
        aria-hidden={access === "unsupported" ? true : undefined}
        className="pbl-desktop-ui desktop-access-content"
      >
        {access === "unsupported" ? null : children}
      </div>
    </div>
  );
}
