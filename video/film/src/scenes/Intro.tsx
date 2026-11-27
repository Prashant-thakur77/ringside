import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { P, T } from "../theme";
import { OUT, INOUT, ramp, pop, interp, rand, envelope } from "../lib/anim";

/** The opening, drawn in the site's world: a ring seen from above, ropes, corner pads, a price that moves. */
export type IntroBeat = "punch" | "tv" | "fast" | "freeze" | "logo";

const Ring: React.FC<{ f: number; fps: number; hitAt: number; size: number; delayed?: boolean; frozen?: boolean }> = ({ f, fps, hitAt, size, frozen }) => {
  // fighters circle each other; at hitAt red lunges and lands on blue
  const t = f / fps;
  const ang = t * 1.1;
  const lunge = interp(f, [hitAt - 8, hitAt, hitAt + 14], [0, 1, 0.15], OUT);
  const cx = size / 2, cy = size / 2;
  const rx = cx + Math.cos(ang) * size * 0.2, ry = cy + Math.sin(ang) * size * 0.14;
  const bx = cx - Math.cos(ang) * size * 0.2, by = cy - Math.sin(ang) * size * 0.14;
  const redX = rx + (bx - rx) * 0.62 * lunge, redY = ry + (by - ry) * 0.62 * lunge;
  const shake = f > hitAt && f < hitAt + 12 ? Math.sin(f * 2.3) * 9 * (1 - (f - hitAt) / 12) : 0;
  const burst = f >= hitAt ? ramp(f, hitAt, 22) : 0;
  const ropes = [0.06, 0.1, 0.14];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible", filter: frozen ? "grayscale(1) brightness(.55)" : undefined }}>
      <rect x={0} y={0} width={size} height={size} fill="#1a1c2a" />
      <rect x={size * 0.05} y={size * 0.05} width={size * 0.9} height={size * 0.9} fill="#22253a" />
      {ropes.map((r, i) => (
        <rect key={i} x={size * r} y={size * r} width={size * (1 - 2 * r)} height={size * (1 - 2 * r)} fill="none"
          stroke={[P.hue, P.beige, P.paper][i]} strokeWidth={5} opacity={0.9 - i * 0.2} />
      ))}
      {[[0, 0, P.red], [size, size, P.blue], [size, 0, P.paper2], [0, size, P.paper2]].map(([x, y, c], i) => (
        <rect key={i} x={(x as number) - 22} y={(y as number) - 22} width={44} height={44} rx={8} fill={c as string} />
      ))}
      {burst > 0 && burst < 1 && [0, 1, 2].map((k) => (
        <circle key={k} cx={bx} cy={by} r={30 + burst * (110 + k * 60)} fill="none" stroke={P.hue} strokeWidth={8 * (1 - burst)} opacity={1 - burst} />
      ))}
      <circle cx={bx + shake} cy={by} r={size * 0.055} fill={P.blue} />
      <circle cx={redX} cy={redY} r={size * 0.055} fill={P.red} />
      <circle cx={redX} cy={redY} r={size * 0.055 + 10} fill="none" stroke={P.red} strokeOpacity={0.35} strokeWidth={4} />
    </svg>
  );
};

const Price: React.FC<{ f: number; at: number; from: string; to: string; label: string; tone?: string }> = ({ f, at, from, to, label, tone = P.mint }) => {
  const flip = ramp(f, at, 10);
  const v = flip < 0.5 ? from : to;
  return (
    <div style={{ fontFamily: T.monoFont, color: P.paper }}>
      <div style={{ fontSize: 24, letterSpacing: 3, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 120, fontWeight: 600, lineHeight: 1, color: flip >= 0.5 ? tone : P.paper,
        transform: `rotateX(${Math.sin(flip * Math.PI) * 80}deg)` }}>{v}</div>
    </div>
  );
};

const Kicker: React.FC<{ text: string; f: number; at?: number; color?: string }> = ({ text, f, at = 4, color = P.paper }) => (
  <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 76, letterSpacing: -2.5, color, lineHeight: 1.02,
    opacity: ramp(f, at, 12), transform: `translateY(${(1 - ramp(f, at, 16)) * 40}px)` }}>{text}</div>
);

export const Intro: React.FC<{ beat: IntroBeat; dur: number }> = ({ beat, dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (beat === "punch") {
    const hit = Math.round(fps * 1.0);
    return (
      <AbsoluteFill style={{ background: P.ink, alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", left: 150, top: 200, transform: `scale(${1 + 0.06 * f / dur})`, transformOrigin: "center" }}>
          <Ring f={f} fps={fps} hitAt={hit} size={680} />
        </div>
        <div style={{ position: "absolute", left: 1000, top: 250, width: 780 }}>
          <div style={{ fontFamily: T.monoFont, fontSize: 26, color: P.hue, letterSpacing: 4, marginBottom: 24, opacity: ramp(f, 2, 8) }}>● LIVE · IN THE RING · TICK 506</div>
          <Price f={f} at={hit + 4} from="0.50" to="0.67" label="RED TO WIN" />
          <div style={{ height: 50 }} />
          <Kicker f={f} at={hit + 10} text="A punch lands." />
        </div>
      </AbsoluteFill>
    );
  }

  if (beat === "tv") {
    // the ring on the left is live; the broadcast on the right shows the same moment five seconds late
    const tvHit = Math.round(dur * 0.62);
    const live = 49.4 + f / fps, tv = 44.4 + f / fps;
    const brace = ramp(f, 10, 18);
    return (
      <AbsoluteFill style={{ background: P.ink }}>
        <div style={{ position: "absolute", left: 120, top: 170, textAlign: "center" }}>
          <div style={{ fontFamily: T.monoFont, fontSize: 26, color: P.hue, letterSpacing: 4, marginBottom: 18 }}>RING · LIVE {live.toFixed(1)}s</div>
          <Ring f={f + 60} fps={fps} hitAt={-100} size={520} />
        </div>
        <div style={{ position: "absolute", right: 120, top: 150, textAlign: "center", opacity: ramp(f, 0, 12),
          transform: `translateX(${(1 - ramp(f, 0, 18)) * 200}px)` }}>
          <div style={{ fontFamily: T.monoFont, fontSize: 26, color: P.beige, letterSpacing: 4, marginBottom: 18 }}>BROADCAST · {tv.toFixed(1)}s</div>
          <div style={{ padding: 22, background: "#000", borderRadius: 28, border: `6px solid ${P.ink3}`, position: "relative" }}>
            <Ring f={f} fps={fps} hitAt={tvHit} size={520} />
            <div style={{ position: "absolute", inset: 22, background: "repeating-linear-gradient(0deg, #0000 0 3px, #0006 3px 4px)" }} />
            <div style={{ position: "absolute", left: 40, bottom: 40, background: P.hueDeep, color: P.paper, fontFamily: T.monoFont, fontSize: 24, padding: "6px 14px" }}>−5.0 s</div>
          </div>
        </div>
        <div style={{ position: "absolute", left: 700, right: 700, top: 470, height: 6, background: P.hue, transform: `scaleX(${brace})` }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 380, textAlign: "center", fontFamily: T.font, fontWeight: 800, fontSize: 96, color: P.hue,
          opacity: brace, letterSpacing: -3 }}>5 s</div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 190, textAlign: "center" }}>
          <Kicker f={f} at={16} text="The broadcast shows it five seconds later." />
        </div>
      </AbsoluteFill>
    );
  }

  if (beat === "fast") {
    const slip = pop(f, fps, 10);
    const fly = ramp(f, Math.round(dur * 0.45), 18, INOUT);
    const stamp = pop(f, fps, Math.round(dur * 0.45) + 16, 10);
    return (
      <AbsoluteFill style={{ background: P.oxblood }}>
        <div style={{ position: "absolute", left: 180, top: 140, width: 400, height: 800, borderRadius: 56, background: P.ink, border: `10px solid #3b2a25`,
          transform: `translateY(${(1 - slip) * 300}px) rotate(${-6 + 6 * slip}deg)`, boxShadow: "0 40px 80px #0008" }}>
          <div style={{ margin: "90px 28px 0", fontFamily: T.monoFont, color: P.paper }}>
            <div style={{ fontSize: 22, opacity: 0.6, letterSpacing: 3 }}>FAST FEED · +0.0 s</div>
            <div style={{ fontSize: 48, marginTop: 30, color: P.hue }}>RED HIT</div>
            <div style={{ fontSize: 22, opacity: 0.6, marginTop: 60 }}>BOOK STILL SAYS</div>
            <div style={{ fontSize: 96, fontWeight: 600 }}>0.50</div>
          </div>
        </div>
        <div style={{ position: "absolute", left: 640 + fly * 520, top: 380 - Math.sin(fly * Math.PI) * 160, width: 460, padding: "28px 34px",
          background: P.paper, color: P.ink, fontFamily: T.monoFont, fontSize: 38, rotate: `${-4 + fly * 8}deg`, boxShadow: "0 30px 60px #0007",
          opacity: ramp(f, 6, 10) }}>
          <div style={{ fontSize: 20, opacity: 0.6, letterSpacing: 3 }}>ORDER</div>
          BUY RED @ 0.50
          <div style={{ borderTop: `3px dotted ${P.ink3}`, marginTop: 16 }} />
          {stamp > 0.02 && (
            <div style={{ marginTop: 14, display: "inline-block", border: `5px solid ${P.hueDeep}`, color: P.hueDeep, padding: "4px 16px", fontWeight: 700,
              transform: `scale(${2.2 - 1.2 * stamp}) rotate(-8deg)`, opacity: stamp }}>FILLED · STALE PRICE</div>
          )}
        </div>
        <div style={{ position: "absolute", left: 640, right: 120, bottom: 200 }}>
          <Kicker f={f} at={Math.round(dur * 0.5)} color={P.paper} text="Anyone faster already knows the price is wrong." />
        </div>
      </AbsoluteFill>
    );
  }

  if (beat === "freeze") {
    const rows = [["Red to win", "0.50"], ["Blue to win", "0.50"], ["Next hit: red", "0.48"], ["KO before 3:00", "0.21"], ["Sudden death", "0.12"]];
    const shut = ramp(f, Math.round(dur * 0.42), 20, INOUT);
    return (
      <AbsoluteFill style={{ background: P.ink, alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", top: 60, fontFamily: T.monoFont, fontSize: 30, color: P.beige, letterSpacing: 6, opacity: ramp(f, 0, 10) }}>A SPORTSBOOK BOARD</div>
        <div style={{ width: 1100, position: "relative", overflow: "hidden", borderRadius: 18, background: "#14162a", border: `2px solid ${P.ink3}` }}>
          {rows.map(([k, v], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "26px 44px", borderBottom: `1px solid ${P.ink3}55`,
              fontFamily: T.font, fontSize: 48, color: P.paper, opacity: ramp(f, 2 + i * 3, 10), transform: `translateX(${(1 - ramp(f, 2 + i * 3, 14)) * -60}px)` }}>
              <span>{k}</span><span style={{ fontFamily: T.monoFont, color: P.mint }}>{v}</span>
            </div>
          ))}
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: `${shut * 100}%`, background: `repeating-linear-gradient(180deg, ${P.hueDeep} 0 34px, #b84522 34px 38px)`,
            display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div style={{ fontFamily: T.font, fontWeight: 800, fontSize: 92, color: P.paper, letterSpacing: -2, marginBottom: 150, opacity: shut }}>MARKET SUSPENDED</div>
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 180, fontFamily: T.font, fontSize: 54, fontWeight: 600, color: P.paper, opacity: ramp(f, Math.round(dur * 0.5), 12) }}>
          They call it <span style={{ color: P.hue }}>courtsiding</span>.
        </div>
      </AbsoluteFill>
    );
  }

  // logo: three ropes whip in, corner pads close them, the name drops in on the rope line
  const ropes = [P.hue, P.beige, P.paper];
  const letters = "RINGSIDE".split("");
  return (
    <AbsoluteFill style={{ background: P.hue, alignItems: "center", justifyContent: "center" }}>
      {ropes.map((c, i) => {
        const w = ramp(f, 2 + i * 3, 18, OUT);
        return <div key={i} style={{ position: "absolute", left: 140, right: 140, top: 640 + i * 26, height: 12, background: i === 0 ? P.oxblood : c,
          transformOrigin: i % 2 ? "right" : "left", transform: `scaleX(${w})`, borderRadius: 6 }} />;
      })}
      {[[110, P.red], [1770, P.blue]].map(([x, c], i) => (
        <div key={i} style={{ position: "absolute", left: x as number, top: 620, width: 40, height: 100, borderRadius: 10, background: c as string,
          transform: `scaleY(${pop(f, fps, 14 + i * 2)})` }} />
      ))}
      <div style={{ display: "flex", marginTop: -160 }}>
        {letters.map((l, i) => {
          const p = pop(f, fps, 12 + i * 2.2, 11);
          return <span key={i} style={{ fontFamily: T.font, fontWeight: 800, fontSize: 250, letterSpacing: -6, color: i < 4 ? P.oxblood : P.paper,
            display: "inline-block", transform: `translateY(${(1 - p) * -220}px)`, opacity: Math.min(1, p * 1.5) }}>{l}</span>;
        })}
      </div>
      <div style={{ position: "absolute", top: 760, fontFamily: T.serifFont, fontStyle: "italic", fontSize: 64, color: P.oxblood,
        opacity: ramp(f, 34, 14), transform: `translateY(${(1 - ramp(f, 34, 18)) * 30}px)` }}>answers it with the clock.</div>
      <div style={{ position: "absolute", top: 70, fontFamily: T.monoFont, fontSize: 26, letterSpacing: 4, color: P.oxblood, opacity: envelope(f, 40, dur + 20) }}>
        SOLANA · MAGICBLOCK EPHEMERAL ROLLUPS
      </div>
      {/* grain */}
      <AbsoluteFill style={{ opacity: 0.08, background: `radial-gradient(circle at ${30 + rand(3) * 40}% 40%, #fff, transparent 60%)` }} />
    </AbsoluteFill>
  );
};
