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

export const metadata: Metadata = {
  title: "openPBL - 项目共创平台",
  description: "学生端与教师端一体化项目式学习平台界面原型",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="min-h-full">
        <SessionProvider>{children}</SessionProvider>
        <AppToaster />
      </body>
    </html>
  );
}
