import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { SoundProvider } from "@/components/shell/sound";
import "./globals.css";

// Schibsted Grotesk (OFL-1.1) — one characterful grotesk for UI + display.
const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
});

// IBM Plex Mono (OFL-1.1) — data, ids, KPI numerals.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: { default: "Qalaa", template: "%s · Qalaa" },
  description:
    "One switch that grants — and instantly takes back — an AI agent's power. Every ask, yes, action and stop written down.",
  applicationName: "Qalaa",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0c0e11",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${schibsted.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <SoundProvider>{children}</SoundProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
