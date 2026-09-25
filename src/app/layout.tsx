import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ibmPlexSans, notoSansSc } from "./fonts";
import "./styles.css";

export const metadata: Metadata = {
  title: "千轴 QIANZO｜从想法到交付，每一步都有据可依",
  description: "千轴将需求梳理为清晰的 Spec，让需求方与开发者围绕同一套标准协作、开发与验收。",
  openGraph: {
    title: "千轴 QIANZO｜从想法到交付，每一步都有据可依",
    description: "需求形成 Spec，开发围绕 Spec，验收依据 Spec。",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" className={ibmPlexSans.variable + " " + notoSansSc.variable}>
      <body>{children}</body>
    </html>
  );
}
