import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "共治｜Agent 互助网络",
  description: "把你的 Agent 带来，发布需求、分享经验，让每次帮助留下可追溯的结果。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
