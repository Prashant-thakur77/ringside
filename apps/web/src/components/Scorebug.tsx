"use client";
// Pinned header: the live clock and tick freshness are always on screen.
import Link from "next/link";
import dynamic from "next/dynamic";
import { useLive, useNow, useFeed } from "@/lib/live";

const WalletButton = dynamic(async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton, { ssr: false });

export function Scorebug() {
  useFeed();
  const states = useLive((s) => s.states);
  const lastTickAt = useLive((s) => s.lastTickAt);
  const now = useNow(200);
  const live = Object.values(states).filter((s) => s.match.status === 1 || s.match.status === 2);
  const top = live.sort((a, b) => b.seen_ms - a.seen_ms)[0];
  const t = top?.match.tick ?? 0;
  const secs = Math.floor((t * 100) / 1000);
  const clock = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-slate/90 backdrop-blur">
      <nav className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-2.5 md:gap-6 md:px-7" aria-label="Main">
        <Link href="/" className="display text-[22px] font-black tracking-wide text-chalk">
          Ringside
        </Link>
        <div className="hidden items-center gap-5 text-sm text-chalk-quiet md:flex">
          <Link href="/" className="hover:text-chalk">Lobby</Link>
          <Link href="/fight" className="hover:text-chalk">Fight</Link>
          <Link href="/proof" className="hover:text-chalk">Proof</Link>
          <Link href="/docs" className="hover:text-chalk">How it works</Link>
        </div>
        <div className="num ml-auto flex items-center gap-3 text-[12px] md:text-[13px]">
          {top ? (
            <>
              <span className="text-red-ink"><span className="live-dot">●</span> LIVE</span>
              <span className="hidden sm:inline">{live.length} on</span>
              <span className="hidden xs:inline sm:inline">{clock}</span>
              <span className="hidden text-chalk-quiet sm:inline">TICK {String(t).padStart(6, "0")}</span>
              <span className="hidden text-chalk-quiet sm:inline">{Math.max(0, now - lastTickAt)} ms ago</span>
            </>
          ) : (
            <span className="hidden text-chalk-quiet sm:inline">waiting for the next bell</span>
          )}
        </div>
        <WalletButton style={{ height: 36, padding: "0 12px", whiteSpace: "nowrap", fontFamily: "var(--font-mono)", fontSize: 13, background: "#1f2522", border: "1px solid #333b37", borderRadius: 4 }} />
      </nav>
    </header>
  );
}
