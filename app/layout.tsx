import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "向前 · 个人成长管理",
  description: "记录今天，推动项目，看见长期成长。",
  manifest: "/manifest.webmanifest",
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
