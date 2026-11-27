"use client";
// Site header: the two corner tabs hang from the top edge (red MENU, blue WATCH LIVE) with the mark
// in the middle. On app pages the live clock and tick freshness stay on screen next to the wallet.
import Link from "next/link";
import { PAGES } from "@/lib/nav";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, useLive, useNow, useFeed } from "@/lib/live";
import { Logo } from "@/components/site/Logo";
import { Menu } from "@/components/site/Menu";
import { AnnounceBar } from "@/components/site/AnnounceBar";

const WalletButton = dynamic(async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton, { ssr: false });

export function Scorebug() {
  useFeed();
  const path = usePathname();
  const story = path === "/" || path.startsWith("/docs");
  const states = useLive((s) => s.states);
  const lastTickAt = useLive((s) => s.lastTickAt);
  const now = useNow(200);
  const { data: list } = useQuery({ queryKey: ["matches"], queryFn: () => api<{ match_key: string; match_id: string; status: number }[]>("/matches?limit=40"), refetchInterval: 2000 });
  const fresh = now - lastTickAt < 3000;
  const live = Object.values(states).filter((s) => (s.match.status === 1 || s.match.status === 2) && fresh);
  const listed = (list ?? []).filter((m) => m.status === 1 || m.status === 2);
  const top = live.sort((a, b) => b.seen_ms - a.seen_ms)[0];
  const liveId = top ? String(top.match.match_id) : listed[0]?.match_id;
  const t = top?.match.tick ?? 0;
  const secs = Math.floor((t * 100) / 1000);
  const clock = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  useEffect(() => {
    const on = () => {
      const y = window.scrollY;
      setHidden(y > 240 && y > lastY.current + 4 ? true : y < lastY.current - 4 ? false : hidden);
      lastY.current = y;
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  });
  useEffect(() => setOpen(false), [path]);

  return (
    <>
      <AnnounceBar />
      <header className={`sticky top-0 z-40 transition-transform duration-300 ${hidden && !open ? "-translate-y-full" : ""}`} style={{ transitionTimingFunction: "var(--ease-snap)" }}>
        <nav className="relative flex h-[52px] items-start justify-between bg-slate/85 backdrop-blur" aria-label="Main">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="site-menu"
            className="tab press num relative z-[60] flex h-[46px] items-center gap-3 bg-hue px-5 text-[13px] font-semibold text-slate"
          >
            <span aria-hidden className="flex w-4 flex-col gap-[4px]">
              <span className={`h-[2px] bg-slate transition-transform duration-300 ${open ? "translate-y-[3px] rotate-45" : ""}`} />
              <span className={`h-[2px] bg-slate transition-transform duration-300 ${open ? "-translate-y-[3px] -rotate-45" : ""}`} />
            </span>
            {open ? "CLOSE" : "MENU"}
          </button>
          <ul className="num ml-4 mr-auto hidden items-center gap-5 pt-[16px] text-[12px] font-semibold tracking-[.08em] xl:flex">
            {PAGES.map((p) => (
              <li key={p.href}>
                <Link href={p.href} aria-current={path.startsWith(p.href) ? "page" : undefined}
                  className={`border-b-2 pb-1 transition-colors hover:text-hue ${path.startsWith(p.href) ? "border-hue text-hue" : "border-transparent text-chalk"}`}>
                  {p.label.toUpperCase()}
                  {p.isNew && <sup className="ml-1 text-[9px] text-mint">NEW</sup>}
                </Link>
              </li>
            ))}
          </ul>
          <div className="absolute left-1/2 top-[10px] -translate-x-1/2 xl:static xl:left-auto xl:translate-x-0 xl:pt-[10px] xl:pr-6">
            <Logo intro={path === "/"} compact={!story} />
          </div>
          <div className="flex items-start gap-3">
            {!story && (
              <div className="num hidden items-center gap-3 pt-[15px] text-[12px] md:flex">
                {top ? (
                  <>
                    <span className="text-red-ink"><span className="live-dot">●</span> LIVE</span>
                    <span>{clock}</span>
                    <span className="text-chalk-quiet">TICK {String(t).padStart(6, "0")}</span>
                    <span className="text-chalk-quiet">{Math.max(0, now - lastTickAt)} ms ago</span>
                  </>
                ) : listed.length ? (
                  <span className="text-red-ink"><span className="live-dot">●</span> LIVE · {listed.length} on</span>
                ) : (
                  <span className="text-chalk-quiet">waiting for the next bell</span>
                )}
              </div>
            )}
            {!story && (
              <div className="pt-[8px]">
                <WalletButton style={{ height: 34, padding: "0 12px", whiteSpace: "nowrap", fontFamily: "var(--font-mono)", fontSize: 12, background: "#151726", border: "1px solid #2a2c40", borderRadius: 6 }} />
              </div>
            )}
            <Link href={liveId ? `/m/${liveId}` : "/matches"} className="tab press num hidden h-[46px] items-center gap-2 bg-hue px-5 text-[13px] font-semibold text-slate sm:flex">
              {liveId && <span className="live-dot">●</span>}
              {liveId ? "WATCH LIVE" : "TONIGHT'S CARD"}
            </Link>
          </div>
        </nav>
      </header>
      <Menu open={open} onClose={() => setOpen(false)} liveId={liveId} />
    </>
  );
}
