"use client";
// Plain answers to the questions people ask first.
import Link from "next/link";
import { useState } from "react";

const QA: [string, React.ReactNode][] = [
  ["Is this real money?", "No. Everything runs on Solana devnet with a test-dollar token. Nothing on this site can take or pay real money."],
  ["What is courtsiding?", "Trading on a live event faster than the price can react, usually from the venue or a faster feed than the TV stream the book is priced on. Sportsbooks answer it by freezing markets. Ringside answers it by pricing in the same instruction as the action."],
  ["Who are the fighters?", "In the lobby, AI fighters trained by self-play, always labelled as AI. You can fight one yourself on the Fight page with your keyboard or a phone."],
  ["Why can't anyone see my position?", "Positions sit in a private ephemeral rollup inside a TEE. Only you and the house can read yours until the bell; then settlement reveals them."],
  ["Can I check a result myself?", <>Yes. Open any finished match&apos;s <Link href="/matches" className="underline">replay</Link> and press Verify: your browser re-runs the fight from its inputs and seeds and compares every hash with the one written onchain.</>],
  ["Where's the code?", <>All of it is on <a href="https://github.com/Prashant-thakur77/ringside" target="_blank" rel="noreferrer" className="underline">GitHub</a>, and the <Link href="/docs" className="underline">docs</Link> walk through the program, the indexer and how to run it.</>],
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="bg-paper px-4 py-24 text-slate md:px-8" aria-labelledby="faq-title">
      <div className="mx-auto grid max-w-[1400px] gap-10 md:grid-cols-[1fr_1.5fr]">
        <h2 id="faq-title" className="display text-[clamp(44px,6vw,96px)] font-semibold">Before the bell</h2>
        <ul className="border-t-2 border-slate">
          {QA.map(([q, a], i) => (
            <li key={i} className="border-b border-slate/20">
              <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-center justify-between gap-4 py-5 text-left text-[20px] font-medium">
                {q}
                <span className={`num grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate/30 transition-transform duration-300 ${open === i ? "rotate-45 bg-slate text-chalk" : ""}`} aria-hidden>+</span>
              </button>
              <div className="grid transition-[grid-template-rows] duration-300" style={{ gridTemplateRows: open === i ? "1fr" : "0fr" }}>
                <div className="overflow-hidden"><p className="max-w-[62ch] pb-6 text-[17px] leading-relaxed text-ink-quiet">{a}</p></div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
