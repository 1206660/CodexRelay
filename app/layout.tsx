import type { Metadata } from "next";
import "./globals.css";
import "./control.css";

export const metadata: Metadata = {
  title: "Codex Relay · 多项目总控台",
  description: "以房间连接任务，让多个 Codex 共享可追溯的协作上下文。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
