import React from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig, delayRender, continueRender } from "remotion";
import { P, T } from "../theme";
import { OUT, INOUT, ramp, pop, interp } from "../lib/anim";

type Facts = Record<string, number | string>;
const useFacts = () => {
  const [d, setD] = React.useState<Facts | null>(null);
  const [h] = React.useState(() => delayRender("facts"));
  React.useEffect(() => { fetch(staticFile("data/facts.json")).then((r) => r.json()).then((j) => { setD(j); continueRender(h); }); }, [h]);
  return d;
};
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** Signature transition: three ring ropes whip across the frame. Rendered at the start of a scene. */
export const RopeSweep: React.FC = () => {
  const f = useCurrentFrame();
  const cols = [P.hue, P.beige, P.paper];
  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 8 }}>
      {cols.map((c, i) => {
        const t = interp(f, [i * 2, 14 + i * 2], [0, 1], INOUT);
        const x = -110 + t * 220;
        return <div key={i} style={{ position: "absolute", left: `${x}%`, top: 380 + i * 110, width: "100%", height: 34, background: c, borderRadius: 17,
          opacity: t > 0 && t < 1 ? 1 : 0, boxShadow: "0 10px 30px #0006" }} />;
      })}
    </AbsoluteFill>
  );
};

/** Positions sealed in the private rollup: a ticket whose values stay blurred while readers are turned away, then the bell reveals it. */
export const Sealed: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const facts = useFacts();
  const readers = ["another wallet", "no token", "the other fighter"];
  const reveal = ramp(f, Math.round(dur * 0.78), 16);
  return (
    <AbsoluteFill style={{ background: P.ink }}>
      <div style={{ position: "absolute", left: 140, top: 150, width: 640, padding: 44, background: P.paper, color: P.ink, fontFamily: T.monoFont,
        transform: `rotate(-3deg) translateY(${(1 - pop(f, fps, 2)) * 300}px)`, boxShadow: "0 40px 80px #0009" }}>
        <div style={{ fontSize: 22, letterSpacing: 3, opacity: 0.6 }}>POSITION · MATCH {String(facts?.gap_match ?? "").slice(-4)}</div>
        {[["SIDE", "RED"], ["QTY", "12.0"], ["AVG", "0.512"], ["PNL", "+3.84"]].map(([k, v], i) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 44, marginTop: 22 }}>
            <span style={{ opacity: 0.55 }}>{k}</span>
            <span style={{ filter: `blur(${(1 - reveal) * 14}px)` }}>{v}</span>
          </div>
        ))}
        <div style={{ marginTop: 30, fontSize: 24, color: reveal > 0.5 ? P.hueDeep : P.ink3 }}>{reveal > 0.5 ? "REVEALED AT THE BELL" : "SEALED IN THE TEE"}</div>
      </div>
      <div style={{ position: "absolute", left: 920, top: 190, width: 860 }}>
        <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 72, color: P.paper, letterSpacing: -2, opacity: ramp(f, 4, 12) }}>Sealed until the bell.</div>
        {readers.map((r, i) => {
          const at = 18 + i * 14;
          return (
            <div key={r} style={{ marginTop: 34, display: "flex", alignItems: "center", gap: 26, opacity: ramp(f, at, 8), transform: `translateX(${(1 - ramp(f, at, 14)) * 80}px)` }}>
              <span style={{ fontFamily: T.monoFont, fontSize: 34, color: P.beige, width: 420 }}>read by {r}</span>
              <span style={{ fontFamily: T.monoFont, fontWeight: 700, fontSize: 32, color: P.hue, border: `4px solid ${P.hue}`, padding: "4px 16px",
                transform: `scale(${2 - pop(f, fps, at + 6, 10)}) rotate(-5deg)`, opacity: ramp(f, at + 6, 4) }}>DENIED</span>
            </div>
          );
        })}
        {facts && (
          <div style={{ marginTop: 60, fontFamily: T.monoFont, fontSize: 30, color: P.mint, opacity: ramp(f, 64, 12) }}>
            {facts.private_denied} of {facts.private_attempts} private reads denied · devnet TEE
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/** The measured result: the delayed book against Ringside, then the supporting numbers, each counted up. */
export const Tally: React.FC<{ dur: number; secondAt?: number }> = ({ dur, secondAt = 0.55 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = useFacts();
  if (!d) return null;
  const n = (k: string) => Number(d[k]);
  const s2 = Math.round(dur * secondAt);
  const count = (v: number, at: number) => fmt(v * ramp(f, at, 26, OUT));
  const bars = [
    { label: "Delayed book · 5 s TV feed", v: n("delayed_stale_fills"), c: P.beige, at: 14 },
    { label: "Ringside", v: n("ringside_stale_fills"), c: P.hue, at: 30 },
  ];
  const max = Math.max(...bars.map((b) => b.v));
  const small = [
    { v: `${n("tick_p50")} ms`, l: "median tick, devnet", at: s2 + 4 },
    { v: `${n("private_denied")}/${n("private_attempts")}`, l: "private reads denied", at: s2 + 14 },
    { v: `${n("replays_verified")}/${n("replays_total")}`, l: `replays verified · ${fmt(n("ticks_checked"))} ticks`, at: s2 + 24 },
  ];
  const shift = interp(f, [s2 - 10, s2 + 6], [0, 1], INOUT);
  return (
    <AbsoluteFill style={{ background: P.paper, color: P.ink }}>
      <div style={{ position: "absolute", left: 120, top: 70, fontFamily: T.monoFont, fontSize: 26, letterSpacing: 4, color: P.hueDeep }}>
        MEASURED ON DEVNET · {n("matches")} HELD-OUT MATCHES
      </div>
      <div style={{ position: "absolute", left: 120, right: 120, top: 130, transform: `translateY(${-shift * 40}px) scale(${1 - shift * 0.18})`, transformOrigin: "top left" }}>
        <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 80, letterSpacing: -2.5 }}>Stale fills accepted</div>
        {bars.map((b) => (
          <div key={b.label} style={{ marginTop: 40 }}>
            <div style={{ fontFamily: T.font, fontSize: 38, fontWeight: 500, opacity: ramp(f, b.at, 8) }}>{b.label}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 30, marginTop: 10 }}>
              <div style={{ height: 70, width: Math.max(14, (b.v / max) * 1150 * ramp(f, b.at, 24)), background: b.c, borderRadius: 8 }} />
              <span style={{ fontFamily: T.monoFont, fontWeight: 600, fontSize: 84, color: b.v === 0 ? P.hueDeep : P.ink }}>{count(b.v, b.at)}</span>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 34, fontFamily: T.monoFont, fontSize: 32, opacity: ramp(f, 46, 10) }}>
          <span style={{ color: P.hueDeep, fontWeight: 600 }}>{count(n("ringside_stale_rejections"), 46)}</span> stale orders rejected onchain by Ringside
        </div>
      </div>
      <div style={{ position: "absolute", left: 120, right: 120, bottom: 175, display: "flex", gap: 40 }}>
        {small.map((s) => (
          <div key={s.l} style={{ flex: 1, background: P.ink, color: P.paper, padding: "20px 32px", borderRadius: 14, opacity: ramp(f, s.at, 10),
            transform: `translateY(${(1 - pop(f, fps, s.at, 13)) * 120}px)` }}>
            <div style={{ fontFamily: T.monoFont, fontWeight: 600, fontSize: 72, color: P.hue }}>{s.v}</div>
            <div style={{ fontFamily: T.font, fontSize: 30, marginTop: 6 }}>{s.l}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** Close: the name on the rope line, the links, the ask. */
export const EndRing: React.FC<{ dur: number; links: string[] }> = ({ links }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: P.oxblood, alignItems: "center", justifyContent: "center" }}>
      {[P.hue, P.beige, P.paper].map((c, i) => (
        <div key={i} style={{ position: "absolute", left: 160, right: 160, top: 560 + i * 24, height: 10, borderRadius: 5, background: c,
          transform: `scaleX(${ramp(f, i * 3, 20)})`, transformOrigin: i % 2 ? "right" : "left" }} />
      ))}
      <div style={{ display: "flex", marginTop: -200 }}>
        {"RINGSIDE".split("").map((l, i) => {
          const p = pop(f, fps, 6 + i * 2, 12);
          return <span key={i} style={{ fontFamily: T.font, fontWeight: 800, fontSize: 210, letterSpacing: -5, color: i < 4 ? P.hue : P.paper,
            display: "inline-block", transform: `translateY(${(1 - p) * 160}px)`, opacity: Math.min(1, p * 1.4) }}>{l}</span>;
        })}
      </div>
      <div style={{ position: "absolute", top: 640, fontFamily: T.serifFont, fontStyle: "italic", fontSize: 56, color: P.beige, opacity: ramp(f, 26, 14) }}>
        Every punch moves the price.
      </div>
      <div style={{ position: "absolute", top: 780, display: "flex", gap: 60, fontFamily: T.monoFont, fontSize: 34, color: P.paper }}>
        {links.map((l, i) => <span key={l} style={{ opacity: ramp(f, 34 + i * 6, 10) }}>{l}</span>)}
      </div>
      <div style={{ position: "absolute", top: 80, fontFamily: T.monoFont, fontSize: 24, letterSpacing: 4, color: P.beige, opacity: ramp(f, 50, 12) }}>
        LIVE ON SOLANA DEVNET · MAGICBLOCK EPHEMERAL ROLLUPS · OPEN SOURCE
      </div>
    </AbsoluteFill>
  );
};

/** Recap lines: each lands on the rope line, the strongest last. */
export const Recap: React.FC<{ dur: number; lines: string[] }> = ({ dur, lines }) => {
  const f = useCurrentFrame();
  const each = (dur * 0.8) / lines.length;
  return (
    <AbsoluteFill style={{ background: P.hue, justifyContent: "center", padding: "0 140px" }}>
      {lines.map((l, i) => {
        const at = Math.round(4 + i * each);
        return <div key={i} style={{ fontFamily: T.font, fontWeight: 800, fontSize: 96, letterSpacing: -3, lineHeight: 1.08, color: i === lines.length - 1 ? P.paper : P.oxblood,
          opacity: ramp(f, at, 10), transform: `translateY(${(1 - ramp(f, at, 16)) * 60}px)`, clipPath: `inset(0 ${(1 - ramp(f, at, 18)) * 100}% 0 0)` }}>{l}</div>;
      })}
    </AbsoluteFill>
  );
};
