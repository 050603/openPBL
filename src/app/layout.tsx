import type { Metadata } from "next";
import "@fontsource/noto-sans-sc/chinese-simplified-400.css";
import "@fontsource/noto-sans-sc/chinese-simplified-500.css";
import "@fontsource/noto-sans-sc/chinese-simplified-600.css";
import "@fontsource/noto-sans-sc/chinese-simplified-700.css";
import "@fontsource/noto-serif-sc/chinese-simplified-600.css";
import "@fontsource/noto-serif-sc/chinese-simplified-700.css";
import "./globals.css";
import { SessionProvider } from "@/lib/session/store";
import { AppToaster } from "@/components/ui/feedback";
import { ChunkLoadRecovery } from "@/lib/runtime/chunk-load-recovery";
import { DesktopAccessGuard } from "@/components/desktop-access-guard";

export const metadata: Metadata = {
  title: "PrAIxis - 与 AI 一起实践，让学习真正发生",
  description:
    "PrAIxis 是将 AI 融入项目式学习实践的教学平台，贯通教师备课、课堂协同、项目创作、成果评价与学习反思。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="min-h-full">
        <DesktopAccessGuard>
          <ChunkLoadRecovery />
          <SessionProvider>{children}</SessionProvider>
          <AppToaster />
        </DesktopAccessGuard>
      </body>
    </html>
  );
}
