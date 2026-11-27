"use client";
// A statement that fills word by word as it is read (scrubbed by scroll).
import { useRef } from "react";
import { gsap, useGSAP, reduced } from "@/lib/motion";

export function Statement() {
  const root = useRef<HTMLElement>(null);
  const lines = ["Bet on the fight while it happens.", "Priced every 100 ms.", "Checked onchain.", "Sealed until the bell."];
  useGSAP(
    () => {
      if (reduced()) return;
      gsap.fromTo(".fill-word", { opacity: 0.16 }, { opacity: 1, stagger: 0.1, ease: "none", scrollTrigger: { trigger: root.current, start: "top 75%", end: "bottom 45%", scrub: 0.6 } });
    },
    { scope: root },
  );
  return (
    <section ref={root} className="bg-paper px-4 py-28 text-slate md:py-40">
      <p className="display mx-auto max-w-[1200px] text-center text-[clamp(40px,7vw,112px)] font-semibold">
        {lines.map((l, i) => (
          <span key={l} className={`block ${i === 1 ? "text-hue-deep" : ""}`}>
            {l.split(" ").map((w, j) => (
              <span key={j} className="fill-word">{w} </span>
            ))}
          </span>
        ))}
      </p>
    </section>
  );
}
