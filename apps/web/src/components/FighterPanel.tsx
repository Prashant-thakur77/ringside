"use client";
// Fighter onboarding and controls: TEE pass → fund the stake → 2-hour session → join the fight.
// Inputs go through the session key at most once per tick (the program accepts one per tick).
import { useEffect, useRef, useState } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useTrader } from "@/lib/trader";
import { MINT_LABEL } from "@/lib/config";

export function useFighterInput(matchId: bigint, enabled: boolean) {
  const t = useTrader();
  const pending = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const h = setInterval(() => {
      if (pending.current !== null) {
        void t.sendInput(matchId, pending.current);
        pending.current = null;
      }
    }, 100);
    return () => clearInterval(h);
  }, [enabled, matchId, t]);
  return (bits: number) => {
    pending.current = bits;
  };
}

export function FighterPanel({ matchId, stake, joined, live }: { matchId: bigint; stake: number; joined: boolean; live: boolean }) {
  const t = useTrader();
  const { setVisible } = useWalletModal();
  const [done, setDone] = useState(false);
  const steps: [string, string, () => unknown][] = [
    ["connect", "Connect a wallet", () => setVisible(true)],
    ["pass", "Sign a TEE pass (no fee)", () => t.getPass()],
    ["fund", `Deposit your ${stake / 1e6} ${MINT_LABEL} stake into the rollup`, () => t.fund(BigInt(stake) + 1_000_000n)],
    ["session", "Start a 2-hour session", () => t.startSession(BigInt(stake) * 2n)],
    ["join", "Join the fight", async () => {
      await t.joinFight(matchId);
      setDone(true);
    }],
  ];
  const at = !t.pk ? 0 : !t.er ? 1 : !t.joined.has("funded") ? 2 : t.step !== "ready" ? 3 : joined || done ? 5 : 4;
  return (
    <section className="rounded border border-rule bg-slate-2 p-4" aria-label="Fight">
      <h2 className="display mb-3 text-2xl font-extrabold">Your corner</h2>
      {at < 5 ? (
        <ol className="space-y-2">
          {steps.map(([k, label, go], i) => (
            <li key={k} className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm ${i === at ? "border-brass" : "border-rule"} ${i < at ? "opacity-50" : ""}`}>
              <span><span className="num mr-2 text-chalk-quiet">{i + 1}</span>{label}</span>
              {i === at && <button className="num rounded bg-chalk px-3 py-1.5 text-[13px] font-semibold text-slate disabled:opacity-50" disabled={!!t.busy} onClick={() => void go()}>{t.busy ?? "Go"}</button>}
            </li>
          ))}
          {t.error && <li className="text-sm text-red-ink">{t.error}</li>}
        </ol>
      ) : (
        <div className="num space-y-1 text-[13px] text-chalk-quiet">
          <p className="text-chalk">{live ? "Fight! Your inputs land on the rollup every tick." : "You're in. The bell rings when both corners have joined."}</p>
          <p>WASD or arrows: move · mouse: aim · click: fire · Space: dash · Shift: shield</p>
          <p>Fighters and their session keys cannot trade this match (ErrFighterBarred).</p>
        </div>
      )}
    </section>
  );
}
