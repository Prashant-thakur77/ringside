"use client";
// Play: trade a replayed devnet fight at fight speed, then try to courtside the book with a TV delay of your choice.
import Link from "next/link";
import { PageHead } from "@/components/site/PageHead";
import { TradeReplay } from "@/components/play/TradeReplay";
import { TryIt } from "@/components/home/TryIt";

export default function Play() {
  return (
    <>
      <PageHead eyebrow="PLAY · NO WALLET NEEDED" title="Trade the fight" lead="Pick up a finished devnet match and trade it as it replays, tick by tick, at the real fair price the program computed. Then try to beat the book with a delayed feed and see what happens.">
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#trade" className="press num rounded-full bg-slate px-5 py-3 text-[13px] font-semibold text-chalk">TRADE A REPLAY ↓</a>
          <a href="#delay" className="press num rounded-full border-2 border-slate px-5 py-3 text-[13px] font-semibold">TRY TO COURTSIDE IT ↓</a>
          <Link href="/fight" className="press num rounded-full border-2 border-slate px-5 py-3 text-[13px] font-semibold">FIGHT AN AI →</Link>
        </div>
      </PageHead>
      <section id="trade" className="scroll-mt-16 bg-slate px-4 py-20 text-chalk md:px-8">
        <div className="mx-auto max-w-[1400px]">
          <p className="num text-[12px] text-hue">ROUND 1</p>
          <h2 className="display mb-8 mt-1 text-[clamp(40px,6vw,88px)] font-semibold">Trade a replayed fight</h2>
          <TradeReplay />
          <p className="mt-6 max-w-[70ch] text-[15px] text-chalk-quiet">Prices are the fair probabilities the onchain model wrote for every tick of a real devnet match, with a one-cent spread. Shares pay $1 if their fighter wins. Practice money only, kept in your browser.</p>
        </div>
      </section>
      <TryIt />
    </>
  );
}
