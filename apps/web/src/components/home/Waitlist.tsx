"use client";
// Waitlist: one email, an optional "I'm here to…", and a stamped ticket when you're on the card.
import { useState } from "react";

const ROLES: [string, string][] = [["trader", "Trade fights"], ["fighter", "Fight"], ["builder", "Build on it"], ["watching", "Just watching"]];

export function Waitlist() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("trader");
  const [state, setState] = useState<{ s: "idle" | "busy" | "done" | "err"; n?: number; msg?: string }>({ s: "idle" });
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setState({ s: "busy" });
    const website = (new FormData(e.currentTarget).get("website") as string) ?? "";
    const r = await fetch("/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role, website }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok && j.ok) setState({ s: "done", n: j.n });
    else setState({ s: "err", msg: j.error ?? "Couldn't reach the waitlist. Check your connection and try again." });
  };

  return (
    <section id="waitlist" className="scroll-mt-16 bg-hue px-4 py-24 text-slate md:px-8 md:py-32" aria-labelledby="wl-title">
      <div className="mx-auto grid max-w-[1400px] gap-14 md:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="num text-[12px] text-slate/75">MAINNET WAITLIST</p>
          <h2 id="wl-title" className="display mt-3 text-[clamp(48px,7vw,112px)] font-semibold">
            Live on devnet.<br /><span className="text-slate/45">Mainnet is next.</span>
          </h2>
          <p className="mt-6 max-w-[48ch] text-[17px] leading-relaxed text-slate/85">
            Every match today runs on Solana devnet with test-dollars. Leave your email and we&apos;ll write once, when real-stake bouts open.
          </p>
        </div>

        {state.s === "done" ? (
          <div className="ticket self-center rounded-2xl p-8 text-ink" role="status">
            <p className="num text-[12px] text-ink-quiet">RINGSIDE · MAINNET WAITLIST</p>
            <p className="num mt-2 text-[15px]">{email}</p>
            <div className="perf my-5 h-2" />
            <span className="stamp-lg text-[22px] text-stamp-blue" style={{ animation: "stamp 280ms var(--ease-snap)" }}>
              ON THE CARD{state.n ? ` · No. ${String(state.n).padStart(4, "0")}` : ""}
            </span>
            <p className="mt-6 text-[15px] text-ink-quiet">You&apos;re in. One email when mainnet opens, nothing before.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="self-center" noValidate>
            <label htmlFor="wl-email" className="num text-[12px] text-slate/80">EMAIL</label>
            <input
              id="wl-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" aria-describedby="wl-note wl-err"
              className="mt-2 w-full rounded-md border border-slate/30 bg-slate px-4 py-4 text-[16px] text-chalk placeholder:text-chalk-quiet focus:border-mint focus:outline-none"
            />
            <fieldset className="mt-6">
              <legend className="num text-[12px] text-slate/80">I&apos;M HERE TO</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {ROLES.map(([v, l]) => (
                  <label key={v} className={`press num cursor-pointer rounded-full border px-4 py-2 text-[13px] transition-colors ${role === v ? "border-slate bg-slate text-chalk" : "border-slate/35 hover:border-slate"}`}>
                    <input type="radio" name="role" value={v} checked={role === v} onChange={() => setRole(v)} className="sr-only" />
                    {l}
                  </label>
                ))}
              </div>
            </fieldset>
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
            <button disabled={state.s === "busy"} className="press num mt-8 w-full rounded-md bg-slate px-6 py-4 text-[14px] font-semibold text-chalk disabled:opacity-60">
              {state.s === "busy" ? "PUTTING YOU ON THE CARD…" : "JOIN THE WAITLIST"}
            </button>
            <p id="wl-err" className="mt-3 min-h-[1.4em] text-[14px] font-medium text-slate" role="alert">{state.s === "err" ? state.msg : ""}</p>
            <p id="wl-note" className="text-[13px] text-slate/75">We store your email only for this one note. To be removed, reply to that email.</p>
          </form>
        )}
      </div>
    </section>
  );
}
