import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const device = vi.hoisted(() => ({ unsupported: true }));

vi.mock("@/lib/browser/device-access", () => ({
  isUnsupportedMobileOrTablet: () => device.unsupported,
}));

import { DesktopAccessGuard } from "./desktop-access-guard";

describe("DesktopAccessGuard", () => {
  beforeEach(() => {
    localStorage.clear();
    device.unsupported = true;
  });

  it("lets a falsely detected desktop user continue and remembers the override", () => {
    render(<DesktopAccessGuard><div>完整课堂界面</div></DesktopAccessGuard>);

    expect(screen.getByText("请使用电脑访问")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "我正在使用电脑，继续访问" }));
    expect(screen.getByText("完整课堂界面")).toBeTruthy();
    expect(localStorage.getItem("openpbl:allow-current-device")).toBe("true");
  });
});
