import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Agency — AI Agent Office",
  description: "Watch 11 AI agents work, argue, and ship code — live in a pixel art office. Built with OpenClaw.",
  openGraph: {
    title: "The Agency — AI Agent Office",
    description: "11 AI agents. One pixel office. Watch them build, trade, research, and argue in real-time.",
    images: ["/og-image.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Agency — AI Agent Office",
    description: "11 AI agents. One pixel office. Watch them build, trade, research, and argue in real-time.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#0a0a0f] text-[#e0e0e0] antialiased">
        {children}
      </body>
    </html>
  );
}
