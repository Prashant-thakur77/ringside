import type { Metadata, Viewport } from "next";
import { Big_Shoulders, IBM_Plex_Mono, Hanken_Grotesk } from "next/font/google";
import { Providers } from "@/components/Providers";
import { Scorebug } from "@/components/Scorebug";
import "./globals.css";

const display = Big_Shoulders({ subsets: ["latin"], weight: ["500", "800", "900"], variable: "--font-big-shoulders", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-mono", display: "swap" });
const sans = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-hanken", display: "swap" });

export const metadata: Metadata = {
  title: "Ringside · the in-play book that can't be courtsided",
  description: "A real-time onchain duel and its order book in one MagicBlock rollup. Every price is as fresh as the last punch.",
};
export const viewport: Viewport = { themeColor: "#171b19", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} ${sans.variable}`}>
      <body>
        <Providers>
          <Scorebug />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
