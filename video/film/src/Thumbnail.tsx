import React from "react";
import { AbsoluteFill } from "remotion";
import { P, T } from "./theme";

/** YouTube thumbnail: the name above the rope line, the claim below, the stamp in the corner. */
export const Thumbnail: React.FC = () => (
  <AbsoluteFill style={{ background: P.hue }}>
    <div style={{ position: "absolute", left: 70, top: 150, fontFamily: T.font, fontWeight: 800, fontSize: 200, letterSpacing: -7, lineHeight: 1 }}>
      <span style={{ color: P.oxblood }}>RING</span><span style={{ color: P.paper }}>SIDE</span>
    </div>
    {[P.oxblood, P.beige, P.paper].map((c, i) => (
      <div key={i} style={{ position: "absolute", left: 60, right: 60, top: 400 + i * 18, height: 8, borderRadius: 4, background: c }} />
    ))}
    <div style={{ position: "absolute", left: 74, top: 480, fontFamily: T.font, fontWeight: 700, fontSize: 62, color: P.oxblood, letterSpacing: -1.5 }}>
      The book that can&apos;t be courtsided
    </div>
    <div style={{ position: "absolute", left: 74, top: 580, fontFamily: T.monoFont, fontSize: 30, color: P.oxblood, letterSpacing: 3 }}>SOLANA · MAGICBLOCK</div>
    <div style={{ position: "absolute", right: 60, top: 50, fontFamily: T.monoFont, fontWeight: 700, fontSize: 38, color: P.oxblood, border: `5px solid ${P.oxblood}`,
      padding: "4px 18px", transform: "rotate(-6deg)" }}>STALE ORDER · REJECTED</div>
  </AbsoluteFill>
);
