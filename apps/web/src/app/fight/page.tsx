"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { MATCHMAKER, MINT_LABEL, SITE_URL } from "@/lib/config";

export default function Fight() {
  const [stake, setStake] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const router = useRouter();

  const go = async (kind: "challenge" | "friendly") => {
    if (!publicKey) return setVisible(true);
    setBusy(kind);
    setError(null);
    try {
      const r = await fetch(`${MATCHMAKER}/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ player: publicKey.toBase58(), stake }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      if (kind === "friendly") setLink(`${SITE_URL}/m/${j.matchId}?fight=1`);
      router.push(`/m/${j.matchId}?fight=1`);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-[900px] px-4 py-12 md:px-7">
      <p className="label">ROUND 00 · STEP INTO THE RING</p>
      <h1 className="display mt-2 text-[clamp(48px,7vw,104px)] font-black">Fight</h1>
      <p className="mt-4 max-w-[56ch] text-chalk-quiet">90 seconds, 100 HP. Hits cost 12. Shield blocks frontal hits for 1.5 s. Power-ups drop every 15 s from VRF. The winner takes twice the stake minus a 1% fee, paid inside the rollup the moment the fight ends.</p>
      <div className="mt-8 flex items-center gap-2">
        <span className="label mr-2">STAKE</span>
        {[1, 5, 10].map((s) => (
          <button key={s} onClick={() => setStake(s)} aria-pressed={stake === s} className={`num min-w-14 rounded border px-3 py-2 ${stake === s ? "border-chalk text-chalk" : "border-rule text-chalk-quiet"}`}>
            {s}
          </button>
        ))}
        <span className="label ml-2">{MINT_LABEL}</span>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <button disabled={!!busy} onClick={() => go("challenge")} className="rounded bg-red p-5 text-left text-white disabled:opacity-50">
          <span className="display block text-3xl font-black">Fight an AI</span>
          <span className="num text-sm opacity-90">{busy === "challenge" ? "Booking the ring…" : "The PPO fighter takes red. You take blue."}</span>
        </button>
        <button disabled={!!busy} onClick={() => go("friendly")} className="rounded border border-blue p-5 text-left disabled:opacity-50">
          <span className="display block text-3xl font-black text-blue-ink">Challenge a friend</span>
          <span className="num text-sm text-chalk-quiet">{busy === "friendly" ? "Booking the ring…" : "Get a link; first to join takes red."}</span>
        </button>
      </div>
      {link && <p className="num mt-4 break-all text-sm">Send this link: <span className="text-brass">{link}</span></p>}
      {error && <p className="mt-4 text-red-ink">{error}</p>}
    </div>
  );
}
