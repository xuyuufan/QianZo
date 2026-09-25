import localFont from "next/font/local";

export const ibmPlexSans = localFont({
  src: "../../public/fonts/ibm-plex-sans.woff2",
  variable: "--font-ibm-plex-sans",
  weight: "300 500",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

export const notoSansSc = localFont({
  src: "../../public/fonts/noto-sans-sc.woff2",
  variable: "--font-noto-sans-sc",
  weight: "300 500",
  display: "swap",
  fallback: ["PingFang SC", "Microsoft YaHei", "sans-serif"],
});
