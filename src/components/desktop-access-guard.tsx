"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { isUnsupportedMobileOrTablet } from "@/lib/browser/device-access";

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: { mobile?: boolean };
};

type DeviceAccess = "checking" | "desktop" | "unsupported";
const DEVICE_OVERRIDE_KEY = "openpbl:allow-current-device";
const DEVICE_OVERRIDE_EVENT = "openpbl:device-access-changed";
let sessionDeviceOverride = false;

function subscribeToDeviceAccess(onStoreChange: () => void) {
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  window.addEventListener("resize", onStoreChange);
  window.addEventListener(DEVICE_OVERRIDE_EVENT, onStoreChange);
  finePointer.addEventListener("change", onStoreChange);
  return () => {
    window.removeEventListener("resize", onStoreChange);
    window.removeEventListener(DEVICE_OVERRIDE_EVENT, onStoreChange);
    finePointer.removeEventListener("change", onStoreChange);
  };
}

function readDeviceAccess(): DeviceAccess {
  if (sessionDeviceOverride) return "desktop";
  try {
    if (window.localStorage.getItem(DEVICE_OVERRIDE_KEY) === "true") return "desktop";
  } catch {
    // Continue with capability detection when storage is unavailable.
  }
  const browserNavigator = navigator as NavigatorWithUserAgentData;
  return isUnsupportedMobileOrTablet({
    userAgent: browserNavigator.userAgent,
    platform: browserNavigator.platform,
    maxTouchPoints: browserNavigator.maxTouchPoints,
    mobile: browserNavigator.userAgentData?.mobile,
    hasFinePointer: window.matchMedia("(hover: hover) and (pointer: fine)").matches,
    viewportWidth: window.innerWidth,
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

  function continueOnCurrentDevice() {
    sessionDeviceOverride = true;
    try {
      window.localStorage.setItem(DEVICE_OVERRIDE_KEY, "true");
    } catch {
      // The event still lets this page continue for the current session.
    }
    window.dispatchEvent(new Event(DEVICE_OVERRIDE_EVENT));
  }

  return (
    <div className="desktop-access-gate" data-access={access}>
      <div
        aria-hidden={access === "unsupported" ? undefined : true}
        className="desktop-access-blocker"
        hidden={access !== "unsupported"}
        style={access === "unsupported" ? {
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "grid",
          minHeight: "100dvh",
          placeItems: "center",
          overflowY: "auto",
          padding: "1.5rem",
          background: "radial-gradient(circle at 15% 10%, rgba(22,101,52,.12), transparent 38%), radial-gradient(circle at 90% 90%, rgba(29,78,216,.1), transparent 36%), #f8fafc",
        } : undefined}
      >
        <main className="desktop-access-blocker__card" style={{ width: "min(100%, 31rem)", border: "1px solid #e7e5e4", borderRadius: "1.25rem", padding: "2rem 1.5rem", background: "rgba(255,255,255,.96)", boxShadow: "0 24px 60px rgba(15,23,42,.16)", textAlign: "center" }}>
          <span aria-hidden="true" className="desktop-access-blocker__icon" style={{ display: "grid", width: "4.5rem", height: "4.5rem", marginInline: "auto", placeItems: "center", borderRadius: "1.25rem", color: "#166534", background: "#dcfce7" }}>
            <svg fill="none" style={{ width: "2.75rem", height: "2.75rem" }} viewBox="0 0 48 48">
              <rect height="29" rx="4" stroke="currentColor" strokeWidth="2.5" width="40" x="4" y="6" />
              <path d="M17 42h14M24 35v7" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
              <path d="m18 20 4 4 8-9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
            </svg>
          </span>
          <p className="desktop-access-blocker__eyebrow" style={{ marginTop: "1.25rem", color: "#166534", fontSize: ".75rem", fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" }}>PrAIxis 实践课堂</p>
          <h1 style={{ marginTop: ".5rem", color: "#0c0a09", fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-.02em" }}>请使用电脑访问</h1>
          <p style={{ marginTop: ".75rem", color: "#292524", fontSize: "1rem", fontWeight: 600 }}>为了更好的使用体验，请使用电脑访问。</p>
          <p className="desktop-access-blocker__hint" style={{ margin: ".75rem auto 0", maxWidth: "27rem", color: "#78716c", fontSize: ".8125rem", lineHeight: 1.75 }}>
            课堂内容包含多区域学习画布、协作工作台与教学控制面板，暂不支持手机或平板设备。
          </p>
          <button className="desktop-access-blocker__continue" onClick={continueOnCurrentDevice} style={{ minHeight: "2.75rem", marginTop: "1.25rem", border: "1px solid #166534", borderRadius: ".65rem", padding: ".65rem 1rem", color: "white", background: "#166534", fontSize: ".875rem", fontWeight: 700 }} type="button">
            我正在使用电脑，继续访问
          </button>
        </main>
      </div>
      <div
        aria-hidden={access === "unsupported" ? true : undefined}
        className="pbl-desktop-ui desktop-access-content"
        hidden={access === "unsupported"}
      >
        {access === "unsupported" ? null : children}
      </div>
    </div>
  );
}
