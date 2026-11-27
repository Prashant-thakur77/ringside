import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, IBM_Plex_Mono, Newsreader } from "next/font/google";
import { Providers } from "@/components/Providers";
import { Scorebug } from "@/components/Scorebug";
import { Footer } from "@/components/site/Footer";
import "./globals.css";

const display = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-grotesk", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-mono", display: "swap" });
const serif = Newsreader({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-newsreader", display: "swap" });

export const metadata: Metadata = {
  title: "Ringside · the in-play book that can't be courtsided",
  description: "A real-time onchain duel and its order book in one MagicBlock rollup. Every price is as fresh as the last punch.",
};
export const viewport: Viewport = { themeColor: "#0b0c14", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} ${serif.variable}`}>
      <head>
        <noscript><style>{`.hero-hide{visibility:visible!important}`}</style></noscript>
      </head>
      <body id="top">
        <Providers>
          <Scorebug />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
