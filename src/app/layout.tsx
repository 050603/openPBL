import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/lib/session/store";

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
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
