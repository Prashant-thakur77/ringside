"use client";
// Explore: one tile per page, so the home page is a front door instead of the whole site.
import Link from "next/link";
import { PAGES } from "@/lib/nav";

const TONES = ["bg-hue text-slate", "bg-slate-2 text-chalk", "bg-hue-deep text-chalk", "bg-paper text-slate", "bg-hue-dark text-chalk", "bg-mint text-slate", "bg-slate-2 text-chalk"];

export function Explore() {
  return (
    <section className="bg-slate px-4 py-24 text-chalk md:px-8" aria-labelledby="explore-title">
      <div className="mx-auto max-w-[1400px]">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-chalk pb-3">
          <h2 id="explore-title" className="display text-[clamp(48px,7vw,112px)] font-semibold">Pick your corner</h2>
          <span className="num text-[13px] text-chalk-quiet">{PAGES.length} PAGES · ALL LIVE ON DEVNET DATA</span>
        </div>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PAGES.map((p, i) => (
            <li key={p.href} className={i === 0 ? "sm:col-span-2" : ""}>
              <Link href={p.href} className={`group flex h-full min-h-[230px] flex-col justify-between rounded-2xl p-6 transition-transform duration-300 hover:-translate-y-1 ${TONES[i % TONES.length]}`}>
                <span className="flex items-center justify-between"><span className="num text-[13px] opacity-70">{String(i + 1).padStart(2, "0")}</span>{p.isNew && <span className="num rounded-full bg-slate px-3 py-1 text-[11px] font-semibold tracking-[.12em] text-mint">NEW</span>}</span>
                <span>
                  <span className="display block text-[clamp(34px,3.4vw,52px)] font-semibold leading-none">{p.label}</span>
                  <span className="mt-3 block max-w-[34ch] text-[16px] opacity-80">{p.blurb}</span>
                  <span className="num mt-4 inline-block text-[13px] font-semibold transition-transform group-hover:translate-x-2">OPEN →</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
