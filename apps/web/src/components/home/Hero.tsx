"use client";
// Hero. The two corners clash: a red shard and a blue shard punch in from opposite corners and meet
// near the centre (a small bell-yellow impact). The giant wordmark's letters take the colour of the
// corner they sit on. The centre card says PRICE THE PUNCH, then draws the real odds line of a devnet
// match, and on scroll grows to full-bleed: every punch moves the price.
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { gsap, useGSAP, reduced, ScrollTrigger } from "@/lib/motion";
import { useGap } from "@/lib/home-data";

type P = [number, number];
const RED: P[] = [[0, 4], [62, 33], [46, 100], [0, 100]];
const BLUE: P[] = [[57, 0], [100, 0], [100, 64], [69, 45]];
// Phones: the title sits on the dark ground; the corners come in below it and from the top right.
const RED_M: P[] = [[0, 58], [100, 44], [100, 100], [0, 100]];
const BLUE_M: P[] = [[64, 0], [100, 0], [100, 22], [86, 18]];
const base = () => (typeof window !== "undefined" && window.innerWidth < 900 ? { red: RED_M, blue: BLUE_M } : { red: RED, blue: BLUE });
const poly = (ps: P[]) => `polygon(${ps.map(([x, y]) => `${x}% ${y}%`).join(",")})`;
const inside = ([x, y]: P, ps: P[]) => {
  let c = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const [xi, yi] = ps[i], [xj, yj] = ps[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const WORD = "RINGSIDE".split("");

function linePath(walk: number[], w = 460, h = 250, pad = 18) {
  if (!walk.length) return "";
  const step = Math.max(1, Math.floor(walk.length / 120));
  const pts = walk.filter((_, i) => i % step === 0);
  return pts.map((p, i) => `${i ? "L" : "M"}${(pad + (i / (pts.length - 1)) * (w - 2 * pad)).toFixed(1)},${(pad + (1 - p) * (h - 2 * pad)).toFixed(1)}`).join(" ");
}

export function Hero({ liveId }: { liveId?: string }) {
  const root = useRef<HTMLElement>(null);
  const shape = useRef({ red: base().red.map((p) => [...p] as P), blue: base().blue.map((p) => [...p] as P) });
  const { data: gap } = useGap();
  const d = useMemo(() => linePath(gap?.walk ?? []), [gap]);

  // Apply the current shard shapes and recolour each letter by the corner behind it.
  const paint = () => {
    const el = root.current;
    if (!el) return;
    const { red, blue } = shape.current;
    el.querySelector<HTMLElement>(".shard-r")!.style.clipPath = poly(red);
    el.querySelector<HTMLElement>(".shard-b")!.style.clipPath = poly(blue);
    const box = el.getBoundingClientRect();
    el.querySelectorAll<HTMLElement>(".hero-l").forEach((l) => {
      const r = l.getBoundingClientRect();
      const pt: P = [((r.left + r.width / 2 - box.left) / box.width) * 100, ((r.top + r.height * 0.6 - box.top) / box.height) * 100];
      l.dataset.on = inside(pt, red) ? "red" : inside(pt, blue) ? "blue" : "ink";
    });
  };

  useGSAP(
    () => {
      paint();
      if (reduced()) return void gsap.set(root.current, { visibility: "visible" });
      const s = shape.current;
      // Load: each shard grows out of its own corner, then the clash.
      const from = { r: 0, b: 0 };
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.to(from, {
        r: 1, b: 1, duration: 1.3,
        onUpdate: () => {
          const B = base();
          s.red = B.red.map(([x, y]) => [x * from.r, 100 - (100 - y) * from.r] as P);
          s.blue = B.blue.map(([x, y]) => [100 - (100 - x) * from.b, y * from.b] as P);
          paint();
        },
      })
        .from(".impact line", { scale: 0, opacity: 0, transformOrigin: "0 0", duration: 0.5, stagger: 0.02 }, 0.75)
        .from(".hero-title .w", { yPercent: 110, duration: 0.9, stagger: 0.05 }, 0.35)
        .from(".hero-cta > *, .hero-side", { y: 16, opacity: 0, duration: 0.6, stagger: 0.06 }, 0.7)
        .from(".hero-card", { scale: 0.86, opacity: 0, duration: 0.9 }, 0.5)
        .from(".hero-l", { yPercent: 100, duration: 1, stagger: 0.045 }, 0.55)
        .from(".card-meta", { opacity: 0, duration: 0.4 }, 1.2);
      // Start states are applied by the from() tweens above; only now is the hero allowed to show.
      gsap.set(root.current, { visibility: "visible" });

      // Pointer: the corners lean a few percent toward the pointer.
      const lean = { x: 0, y: 0 };
      const move = (e: PointerEvent) => {
        gsap.to(lean, {
          x: (e.clientX / innerWidth - 0.5) * 5, y: (e.clientY / innerHeight - 0.5) * 4, duration: 0.8, ease: "power3.out",
          onUpdate: () => {
            if (tl.isActive()) return;
            s.red = RED.map(([x, y], i) => (i === 1 || i === 2 ? [x + lean.x, y + lean.y] : [x, y]) as P);
            s.blue = BLUE.map(([x, y], i) => (i === 3 || i === 0 ? [x + lean.x, y + lean.y] : [x, y]) as P);
            paint();
          },
        });
      };
      const fine = matchMedia("(pointer: fine)").matches;
      if (fine) window.addEventListener("pointermove", move);

      // Scroll (desktop): the card grows to full-bleed and the headline arrives.
      const mm = gsap.matchMedia();
      mm.add("(min-width: 900px)", () => {
        const card = root.current!.querySelector<HTMLElement>(".hero-card")!;
        const st = gsap.timeline({ scrollTrigger: { trigger: root.current, start: "top top", end: "+=120%", scrub: 0.8, pin: true } });
        st.to(card, {
          scale: () => Math.max(innerWidth / card.offsetWidth, innerHeight / card.offsetHeight) * 1.02,
          borderRadius: 0, ease: "power2.inOut", duration: 1,
        })
          .to(".hero-fade", { opacity: 0, duration: 0.3 }, 0)
          .fromTo(".bleed-title", { yPercent: 120 }, { yPercent: 0, duration: 0.4 }, 0.55)
          .fromTo(".bleed-word", { xPercent: 60, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.45 }, 0.6);
      });
      return () => {
        window.removeEventListener("pointermove", move);
        mm.revert();
      };
    },
    { scope: root, dependencies: [], revertOnUpdate: true },
  );
  // The card says PRICE THE PUNCH, then (once the match data is here) the words leave and the line draws.
  const born = useRef(Date.now());
  useGSAP(
    () => {
      if (!d) return;
      const line = root.current!.querySelector(".card-line");
      if (reduced()) {
        gsap.set(".card-words", { opacity: 0 });
        gsap.set(line, { strokeDashoffset: 0 });
        return;
      }
      const wait = Math.max(0, 2.2 - (Date.now() - born.current) / 1000);
      gsap.timeline({ delay: wait })
        .to(".card-words", { opacity: 0, y: -10, duration: 0.35, ease: "power2.in" })
        .fromTo(line, { strokeDashoffset: 1, opacity: 1 }, { strokeDashoffset: 0, duration: 2.2, ease: "power2.inOut" }, 0.25);
    },
    { scope: root, dependencies: [d], revertOnUpdate: true },
  );

  useEffect(() => {
    const r = () => {
      if (!gsap.isTweening(shape.current)) {
        const B = base();
        shape.current = { red: B.red.map((p) => [...p] as P), blue: B.blue.map((p) => [...p] as P) };
      }
      paint();
    };
    // Letter positions move when the web font arrives and when the load timeline ends: recolour then.
    document.fonts?.ready.then(() => requestAnimationFrame(r));
    const late = setTimeout(r, 2600);
    window.addEventListener("resize", r);
    ScrollTrigger.refresh();
    return () => {
      clearTimeout(late);
      window.removeEventListener("resize", r);
    };
  }, []);

  return (
    <section ref={root} className="hero-pin hero-hide relative min-h-[calc(100svh-84px)] overflow-hidden bg-slate md:h-[calc(100svh-84px)] md:min-h-[640px]" aria-labelledby="hero-title">
      <div className="shard-r absolute inset-0 bg-hue" style={{ clipPath: poly(RED) }} aria-hidden />
      <div className="shard-b absolute inset-0 bg-hue" style={{ clipPath: poly(BLUE) }} aria-hidden />
      <svg className="impact pointer-events-none absolute left-[63%] top-[35%] hidden md:block" width="90" height="90" viewBox="-45 -45 90 90" aria-hidden>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} x1="0" y1="0" x2={Math.cos((a * Math.PI) / 180) * 34} y2={Math.sin((a * Math.PI) / 180) * 34} stroke="var(--color-mint)" strokeWidth="4" strokeLinecap="round" />
        ))}
      </svg>

      <div className="relative mx-auto grid h-full max-w-[1440px] grid-rows-[1fr_auto] px-4 md:px-8">
        <div className="grid items-center gap-6 pt-6 md:grid-cols-[1fr_auto_1fr] md:gap-8">
          <div className="hero-fade">
            <h1 id="hero-title" className="hero-title display text-[clamp(40px,4.2vw,64px)] font-semibold text-chalk md:text-slate">
              {["The in-play", "book that", "can't be", "courtsided"].map((l) => (
                <span key={l} className="block overflow-hidden"><span className="w inline-block">{l}</span></span>
              ))}
            </h1>
            <div className="hero-cta mt-6 flex flex-wrap gap-3">
              <Link href={liveId ? `/m/${liveId}` : "/matches"} className="press num rounded-md bg-hue px-5 py-3 text-[13px] font-semibold text-slate md:bg-slate md:text-chalk">
                {liveId ? "WATCH THE LIVE MATCH" : "SEE TONIGHT'S CARD"}
              </Link>
              <a href="#waitlist" className="press num rounded-md border border-chalk/40 px-5 py-3 text-[13px] font-semibold text-chalk md:border-slate/60 md:text-slate">
                JOIN THE WAITLIST
              </a>
            </div>
          </div>

          <div className="relative flex flex-col items-center">
            <div className="hero-card relative h-[230px] w-[min(88vw,440px)] overflow-hidden rounded-[20px] bg-hue-deep shadow-[0_30px_80px_-20px_rgba(0,0,0,.6)] md:h-[270px] md:w-[460px]">
              <div className="card-words absolute inset-0 grid place-items-center">
                <p className="display text-[44px] font-semibold text-chalk">
                  Price the <span className="bg-slate px-2 text-hue">punch</span>
                </p>
              </div>
              <svg viewBox="0 0 460 250" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-label={gap ? `Odds line of devnet match ${gap.match_id}` : "Odds line"}>
                <line x1="18" x2="442" y1="125" y2="125" stroke="rgba(243,238,228,.18)" strokeDasharray="4 6" />
                {d && <path className="card-line" d={d} pathLength={1} strokeDasharray="1" strokeDashoffset="1" fill="none" stroke="var(--color-chalk)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
              </svg>
              <div className="pointer-events-none absolute inset-x-6 bottom-6 overflow-hidden">
                <p className="bleed-title display translate-y-[120%] text-[clamp(28px,3.4vw,64px)] font-semibold text-chalk">Every punch moves the price</p>
              </div>
              <p className="bleed-word display pointer-events-none absolute right-6 top-5 text-[clamp(36px,5vw,96px)] font-semibold text-mint opacity-0">Fresh</p>
            </div>
            <p className="card-meta num mt-4 rounded-full bg-slate/85 px-4 py-1.5 text-[11px] text-chalk">
              {gap ? `P(RED WINS) · DEVNET MATCH #${gap.match_id} · ${gap.ticks_total} TICKS` : "P(RED WINS)"}
            </p>
          </div>

          <p className="hero-side hero-fade max-w-[34ch] justify-self-end text-[17px] leading-relaxed text-slate md:text-right md:text-chalk">
            A real fight and its order book run in the same MagicBlock rollup. The instruction that moves the fighters re-prices the book, so a price is never older than the last punch.
          </p>
        </div>

        <div className="hero-fade wordmark-giant overflow-hidden pb-2" aria-hidden>
          {WORD.map((c, i) => (
            <span key={i} className="hero-l inline-block transition-colors duration-300 data-[on=blue]:text-hue-deep data-[on=ink]:text-beige data-[on=red]:text-hue-deep">{c}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
