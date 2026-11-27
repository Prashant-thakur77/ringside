"use client";
// Five stacked chapters. Each panel sticks and the next slides over it while the one beneath sinks back.
// Every art card is drawn in code from the subject: the ring, the price curve, the freshness window,
// the sealed ticket, the hash chain (real hashes from a devnet match).
import { useRef } from "react";
import { gsap, useGSAP, reduced } from "@/lib/motion";
import { useGap, useResults, fmt } from "@/lib/home-data";

function RingArt() {
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden>
      <rect x="20" y="20" width="360" height="360" rx="10" fill="#f3eee4" />
      {[46, 58, 70].map((o, i) => (
        <rect key={o} x={o} y={o} width={400 - 2 * o} height={400 - 2 * o} rx="6" fill="none" stroke="#0b0c14" strokeOpacity={0.55 - i * 0.15} strokeWidth="3" />
      ))}
      <rect x="34" y="34" width="26" height="26" rx="4" fill="#f4845f" />
      <rect x="340" y="340" width="26" height="26" rx="4" fill="#d4572f" />
      <rect x="340" y="34" width="26" height="26" rx="4" fill="#0b0c14" />
      <rect x="34" y="340" width="26" height="26" rx="4" fill="#0b0c14" />
      <g className="art-red"><circle cx="150" cy="210" r="24" fill="#f4845f" /><line x1="150" y1="210" x2="186" y2="196" stroke="#0b0c14" strokeWidth="5" strokeLinecap="round" /></g>
      <g className="art-blue"><circle cx="262" cy="170" r="24" fill="#d4572f" /><line x1="262" y1="170" x2="226" y2="182" stroke="#0b0c14" strokeWidth="5" strokeLinecap="round" /></g>
      {[0, 1, 2].map((i) => <circle key={i} className="art-shot" cx={196 + i * 10} cy={192 - i * 3} r="4" fill="#0b0c14" />)}
      <circle cx="300" cy="280" r="9" fill="#f4845f" stroke="#0b0c14" strokeWidth="2" />
    </svg>
  );
}

function CurveArt() {
  const pts = Array.from({ length: 41 }, (_, i) => {
    const x = -6 + (12 * i) / 40;
    return [40 + (i / 40) * 320, 340 - 280 / (1 + Math.exp(-x))];
  });
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden>
      <rect x="20" y="20" width="360" height="360" rx="10" fill="#0b0c14" />
      {[100, 180, 260, 340].map((y) => <line key={y} x1="40" x2="360" y1={y} y2={y} stroke="#2a2c40" />)}
      <path d={pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ")} fill="none" stroke="#f4845f" strokeWidth="4" className="art-draw" pathLength={1} strokeDasharray="1" />
      {[6, 13, 19, 25, 31, 36].map((i) => <circle key={i} cx={pts[i][0]} cy={pts[i][1]} r="6" fill="#f3eee4" />)}
      <text x="40" y="384" fill="#a9a8bd" fontFamily="var(--font-plex-mono)" fontSize="13">16 features → integer logistic → LUT sigmoid</text>
    </svg>
  );
}

function WindowArt() {
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden>
      <rect x="20" y="20" width="360" height="360" rx="10" fill="#f3eee4" />
      <line x1="40" x2="360" y1="200" y2="200" stroke="#0b0c14" strokeWidth="3" />
      {Array.from({ length: 17 }, (_, i) => <line key={i} x1={40 + i * 20} x2={40 + i * 20} y1="190" y2={i % 5 === 0 ? "218" : "210"} stroke="#0b0c14" strokeWidth="2" />)}
      <rect x="282" y="150" width="58" height="100" fill="#d4572f" fillOpacity=".18" stroke="#d4572f" strokeWidth="2" />
      <text x="282" y="140" fill="#a8401f" fontFamily="var(--font-plex-mono)" fontSize="13">window: 2 ticks</text>
      <line x1="340" x2="340" y1="120" y2="260" stroke="#d4572f" strokeWidth="3" />
      <text x="300" y="280" fill="#0b0c14" fontFamily="var(--font-plex-mono)" fontSize="13">book tick</text>
      <line x1="120" x2="120" y1="150" y2="250" stroke="#f4845f" strokeWidth="3" strokeDasharray="6 5" />
      <text x="72" y="140" fill="#a8401f" fontFamily="var(--font-plex-mono)" fontSize="13">seen tick (TV)</text>
      <g transform="translate(200 320) rotate(-8)"><rect x="-120" y="-24" width="240" height="48" fill="none" stroke="#a8401f" strokeWidth="4" /><text x="0" y="8" textAnchor="middle" fill="#a8401f" fontFamily="var(--font-plex-mono)" fontWeight="700" fontSize="20">REJECTED · STALE</text></g>
    </svg>
  );
}

function SealArt() {
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden>
      <rect x="20" y="20" width="360" height="360" rx="10" fill="#2b1611" />
      <g transform="translate(70 80)">
        <rect width="260" height="240" rx="8" fill="#f3eee4" />
        <line x1="0" x2="260" y1="176" y2="176" stroke="#0b0c14" strokeDasharray="6 6" strokeWidth="2" />
        <text x="20" y="36" fill="#5a5868" fontFamily="var(--font-plex-mono)" fontSize="12">POSITION · PRIVATE UNTIL THE BELL</text>
        {[64, 96, 128].map((y, i) => <rect key={y} x="20" y={y} width={[180, 140, 200][i]} height="16" rx="3" fill="#0b0c14" />)}
        <text x="20" y="214" fill="#0b0c14" fontFamily="var(--font-plex-mono)" fontSize="13">non-members: denied</text>
        <circle cx="214" cy="208" r="20" fill="#f4845f" /><rect x="206" y="204" width="16" height="12" rx="2" fill="#0b0c14" /><path d="M209 204v-4a5 5 0 0 1 10 0v4" stroke="#0b0c14" strokeWidth="3" fill="none" />
      </g>
    </svg>
  );
}

function ChainArt({ hashes }: { hashes: { tick: number; hash: string }[] }) {
  const hs = hashes.slice(-5);
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden>
      <rect x="20" y="20" width="360" height="360" rx="10" fill="#0b0c14" />
      {hs.map((h, i) => (
        <g key={h.tick} transform={`translate(48 ${44 + i * 66})`}>
          <rect width="304" height="46" rx="6" fill="#2b1611" stroke="#2a2c40" />
          <text x="14" y="20" fill="#f4845f" fontFamily="var(--font-plex-mono)" fontSize="12">TICK {String(h.tick).padStart(6, "0")}</text>
          <text x="14" y="37" fill="#f3eee4" fontFamily="var(--font-plex-mono)" fontSize="13">{h.hash}…</text>
          {i < hs.length - 1 && <line x1="152" x2="152" y1="46" y2="66" stroke="#f4845f" strokeWidth="3" />}
        </g>
      ))}
    </svg>
  );
}

export function Chapters() {
  const root = useRef<HTMLElement>(null);
  const { data: gap } = useGap();
  const { data: r } = useResults();
  const ch = [
    {
      n: "01", t: "Fight", bg: "bg-hue", fg: "text-slate", q: "Two fighters, one deterministic duel, run by the chain.",
      p: `A 90-second top-down duel in integer maths, stepped by a crank every 100 ms. Power-up waves come from verifiable randomness. The AI fighters were trained by self-play${r?.e7 ? ` and win ${Math.round((r.e7.win_rate?.aggressive ?? 1) * 100)}% against the scripted bots on held-out seeds` : ""}.`,
      art: <RingArt />,
    },
    {
      n: "02", t: "Price", bg: "bg-hue-deep", fg: "text-slate", q: "The model that prices the fight runs inside the tick.",
      p: `Sixteen features of the fight state go through an integer logistic model, a sigmoid table and a calibration table in the same instruction that moves the fighters.${r?.e2 ? ` Held-out Brier ${r.e2.models.logistic_onchain_integer.brier.toFixed(4)} against 0.25 for a coin flip.` : ""}`,
      art: <CurveArt />,
    },
    {
      n: "03", t: "Fresh", bg: "bg-hue-dark", fg: "text-chalk", q: "An order priced off an old tick does not fill.",
      p: `Every order carries the tick it saw. More than 2 ticks behind the book and the program rejects it.${r?.e1 ? ` On devnet the courtsider's stale orders were rejected ${fmt(r.e1.ringside.stale_rejections)} times and filled ${r.e1.ringside.stale_fills_accepted} times.` : ""}`,
      art: <WindowArt />,
    },
    {
      n: "04", t: "Sealed", bg: "bg-slate", fg: "text-chalk", q: "Nobody can read your position until the bell.",
      p: `Positions live in a private ephemeral rollup inside a TEE, readable only by their owner and the house.${r?.e5 ? ` Non-members, unauthenticated readers and the opposing fighter were denied ${r.e5.denied.non_member}/${r.e5.n}, ${r.e5.denied.unauthenticated}/${r.e5.n} and ${r.e5.denied.opposing_fighter}/${r.e5.n} times; after the reveal the same reader gets ${r.e5.after_reveal_reads}/${r.e5.n}.` : ""}`,
      art: <SealArt />,
    },
    {
      n: "05", t: "Proof", bg: "bg-paper", fg: "text-slate", q: "Replay any match in your browser and check every link.",
      p: `Each tick hashes the state into a chain. The replay page re-runs the fight in WASM from its inputs and seeds and compares every link.${r?.e6 ? ` ${r.e6.verified_wasm}/${r.e6.k} devnet matches reproduce exactly (${fmt(r.e6.ticks_checked)} links).` : ""}`,
      art: <ChainArt hashes={gap?.tape ?? []} />,
    },
  ];

  useGSAP(
    () => {
      if (reduced()) return;
      const panels = gsap.utils.toArray<HTMLElement>(".chapter");
      panels.forEach((el, i) => {
        const next = panels[i + 1];
        if (!next) return;
        gsap.to(el.querySelector(".chapter-in"), {
          scale: 0.92, opacity: 0.35, ease: "none",
          scrollTrigger: { trigger: next, start: "top bottom", end: "top top", scrub: true },
        });
      });
      // Sticky panels confuse scroll-position triggers, so the rise and the curve use visibility instead.
      const draw = root.current!.querySelector(".art-draw");
      if (draw) gsap.set(draw, { strokeDashoffset: 1 });
      const io = new IntersectionObserver(
        (es) => es.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("ch-in");
          const d = e.target.querySelector(".art-draw");
          if (d) gsap.to(d, { strokeDashoffset: 0, duration: 1.6, ease: "power2.inOut", delay: 0.3 });
        }),
        { threshold: 0.35 },
      );
      panels.forEach((el) => { el.classList.add("ch-pre"); io.observe(el); });
      gsap.to(".art-red", { x: 18, y: -10, duration: 1.6, yoyo: true, repeat: -1, ease: "sine.inOut" });
      gsap.to(".art-blue", { x: -16, y: 12, duration: 1.9, yoyo: true, repeat: -1, ease: "sine.inOut" });
      return () => io.disconnect();
    },
    { scope: root, dependencies: [r, gap], revertOnUpdate: true },
  );

  return (
    <section ref={root} aria-label="How Ringside works, in five rounds">
      {ch.map((c) => (
        <article key={c.n} className={`chapter relative min-h-[100svh] overflow-hidden md:sticky md:top-0 md:h-[100svh] ${c.bg} ${c.fg}`}>
          <div className="chapter-in mx-auto grid h-full max-w-[1440px] gap-6 px-4 pb-12 pt-20 md:grid-cols-[1.1fr_1fr] md:grid-rows-1 md:px-8">
            <div className="flex flex-col justify-between">
              <h3 className="overflow-hidden pb-[.04em] pt-[.08em]"><span className="ch-rise display block text-[clamp(72px,11vw,180px)] font-semibold leading-[.9]">{c.t}</span></h3>
              <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-end md:gap-10">
                <span className="num text-[clamp(64px,8vw,128px)] font-semibold leading-none opacity-35">{c.n}</span>
                <div className="max-w-[46ch]">
                  <p className="overflow-hidden"><span className="ch-rise serif block text-[clamp(26px,2.6vw,40px)] leading-[1.12]">{c.q}</span></p>
                  <p className="mt-4 text-[16px] leading-relaxed opacity-85">{c.p}</p>
                </div>
              </div>
            </div>
            <div className="order-first mb-8 flex items-center justify-start md:order-none md:mb-0 md:justify-center">
              <div className="aspect-square w-[min(62vw,300px)] md:w-[min(36vw,520px)] overflow-hidden rounded-[22px] shadow-[0_40px_80px_-30px_rgba(0,0,0,.6)]">{c.art}</div>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
