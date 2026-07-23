import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";

// Pretendard (한글 + 영문 모두 커버, 사용자 PC 폰트 의존 제거)는 393에서 next/font/local(서브셋 미지원,
// 2.06MB 통째 로드) 대신 globals.css 의 dynamic subset @font-face(--font-pretendard)로 전환했다.

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Insight Out",
  description: "B2B 서비스 인텔리전스 플랫폼",
  appleWebApp: {
    capable: true,
    title: "Insight Out",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#E6007E",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider>{children}</ThemeProvider>
        <ServiceWorkerRegister />
        <Toaster />
      </body>
    </html>
  );
}
