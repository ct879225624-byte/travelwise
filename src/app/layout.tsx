import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TravelWise · 旅行优惠情报", template: "%s · TravelWise" },
  description: "把优惠、规则、资格和来源放在一起判断。当前支持锦江荟。",
  openGraph: { title: "TravelWise · 旅行优惠情报", description: "把优惠、规则、资格和来源放在一起判断。", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
