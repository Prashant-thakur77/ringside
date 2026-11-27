"use client";
// The undercard: eight MagicBlock primitives, each a bout on the card. Open a row to see what it does
// here and what would break without it.
import { useRef, useState } from "react";
import { gsap, useGSAP, reduced } from "@/lib/motion";

import { PRIMS } from "@/lib/prims";

export function Primitives() {
  const root = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<number | null>(0);
  useGSAP(
    () => {
      if (reduced()) return;
      gsap.from(".prim-row", { yPercent: 40, opacity: 0, duration: 0.7, stagger: 0.05, ease: "expo.out", scrollTrigger: { trigger: root.current, start: "top 70%" } });
    },
    { scope: root },
  );
  return (
    <section ref={root} className="bg-paper px-4 py-24 text-slate md:px-8 md:py-32" aria-labelledby="prim-title">
      <div className="mx-auto max-w-[1400px]">
        <p className="label !text-ink-quiet">THE UNDERCARD</p>
        <h2 id="prim-title" className="display mt-2 text-[clamp(44px,6.5vw,104px)] font-semibold">Eight MagicBlock primitives, all load-bearing</h2>
        <ul className="mt-10 border-t-2 border-slate">
          {PRIMS.map(([k, a, b], i) => (
            <li key={k} className="prim-row border-b border-slate/20">
              <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="grid w-full grid-cols-[2.6rem_1fr_auto] items-center gap-4 py-5 text-left md:grid-cols-[4rem_1fr_auto]">
                <span className="num text-[15px] text-ink-quiet">{String(i + 1).padStart(2, "0")}</span>
                <span className={`display text-[clamp(28px,3.4vw,52px)] font-semibold transition-colors ${open === i ? "text-hue-deep" : ""}`}>{k}</span>
                <span className={`num grid h-10 w-10 place-items-center rounded-full border border-slate/30 text-[18px] transition-transform duration-300 ${open === i ? "rotate-45" : ""}`} aria-hidden>+</span>
              </button>
              <div className="grid transition-[grid-template-rows] duration-300" style={{ gridTemplateRows: open === i ? "1fr" : "0fr", transitionTimingFunction: "var(--ease-snap)" }}>
                <div className="overflow-hidden">
                  <div className="grid gap-6 pb-6 pl-[3.6rem] md:grid-cols-2 md:pl-[5rem]">
                    <p className="text-[17px] leading-relaxed"><span className="num block text-[11px] text-ink-quiet">WHAT IT DOES HERE</span>{a}</p>
                    <p className="text-[17px] leading-relaxed text-ink-quiet"><span className="num block text-[11px]">WITHOUT IT</span>{b}</p>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
