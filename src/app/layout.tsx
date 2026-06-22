import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vibe Code — Collaborative AI-Powered IDE",
  description:
    "Build together in real-time with AI. A collaborative coding environment where teams co-create with intelligent agents, live previews, and seamless multiplayer editing.",
  keywords: ["collaborative IDE", "AI coding", "real-time editor", "vibe coding", "pair programming"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
