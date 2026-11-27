"use client";
// Matches: tonight's card with live prices, every finished result with replay + verify, and the measured totals.
import { useEffect } from "react";
import Link from "next/link";
import { ScrollTrigger } from "@/lib/motion";
import { useResults } from "@/lib/home-data";
import { PageHead } from "@/components/site/PageHead";
import { Card, useCard } from "@/components/home/Card";
import { ResultsRoll } from "@/components/home/ResultsRoll";
import { Receipts } from "@/components/home/Receipts";
import { SmoothScroll } from "@/components/home/SmoothScroll";

export default function Matches() {
  const { live, done } = useCard();
  const { data: r } = useResults();
  useEffect(() => {
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(id);
  }, [r, live.length, done.length]);
  return (
    <>
      <SmoothScroll />
      <PageHead eyebrow="MATCHES · SOLANA DEVNET" title="Matches" lead="Every bout on the card, priced every tick. Open a live match to trade it, or replay a finished one and verify its hash chain in your browser.">
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/fight" className="press num rounded-full bg-slate px-5 py-3 text-[13px] font-semibold text-chalk">FIGHT AN AI →</Link>
          <Link href="/play" className="press num rounded-full border-2 border-slate px-5 py-3 text-[13px] font-semibold">TRADE A REPLAY →</Link>
        </div>
      </PageHead>
      <Card />
      <ResultsRoll />
      <Receipts />
    </>
  );
}
