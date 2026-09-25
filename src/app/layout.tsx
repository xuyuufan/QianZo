import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ibmPlexSans, notoSansSc } from "./fonts";
import "./styles.css";

export const metadata: Metadata = {
  title: "Qianzo",
  description: "Qianzo 本地产品开发环境",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" className={ibmPlexSans.variable + " " + notoSansSc.variable}>
      <body>{children}</body>
    </html>
  );
}
