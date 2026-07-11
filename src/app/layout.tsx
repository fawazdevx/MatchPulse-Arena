import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted to keep builds hermetic (no build-time Google Fonts fetch).
// Each file is the variable woff2 covering the full weight range.
const anybody = localFont({
  src: [{ path: "./fonts/anybody-700.woff2", weight: "600 900", style: "normal" }],
  variable: "--font-anybody",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"]
});

const hanken = localFont({
  src: [{ path: "./fonts/hanken-400.woff2", weight: "400 800", style: "normal" }],
  variable: "--font-hanken",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"]
});

const jetbrains = localFont({
  src: [{ path: "./fonts/jetbrains-500.woff2", weight: "500 700", style: "normal" }],
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "monospace"]
});

export const metadata: Metadata = {
  title: "MatchPulse Arena — World Cup live fan room",
  description:
    "A no-money World Cup second-screen fan experience powered by TxLINE live match data. Read the match pulse, build streaks, and climb creator leaderboards."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#081A2F"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${anybody.variable} ${hanken.variable} ${jetbrains.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
