"use client";
// The proof page: every number here is read from results.json (written by eval/make_report.py)
// or, for the live strip, from the indexer.
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/live";
import { CourtsiderBars, PROOF_COLORS, Reliability } from "@/components/ProofCharts";

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const f = (v: unknown, d = 2) => (typeof v === "number" ? v.toFixed(d) : "—");
const pc = (v: unknown) => (typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "—");

function Round({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t-2 border-ink pt-6">
      <p className="num text-[12px] text-ink-quiet">ROUND {n}</p>
      <h2 className="display mt-1 text-[clamp(32px,4.5vw,64px)] font-black">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function Proof() {
  const { data: r } = useQuery({ queryKey: ["results"], queryFn: async () => (await fetch("/results.json", { cache: "no-store" })).json() as Promise<R> });
  const { data: live } = useQuery({ queryKey: ["stats"], queryFn: () => api<R>("/stats"), refetchInterval: 5000, retry: false });
  const h = r?.headline;
  return (
    <div className="ticket min-h-screen">
      <div className="mx-auto max-w-[1100px] space-y-14 px-4 py-12 md:px-7">
        <header>
          <p className="num text-[12px] text-ink-quiet">PROOF · {r?.network ?? "devnet"} · generated {r?.generated_at ?? "—"} · held-out data</p>
          <h1 className="display mt-2 text-[clamp(48px,7vw,112px)] font-black">Same bot. Same matches. Different feed.</h1>
          {h && (
            <p className="mt-5 max-w-[60ch] text-lg">
              Over the {h.n_matches} held-out matches with a {h.delay_ms / 1000} s TV delay, the courtsider made <b className="num">{f(h.courtsider_pnl_per_match_tv)}</b> per match on the delayed book and{" "}
              <b className="num">{f(h.courtsider_pnl_per_match_ringside)}</b> on Ringside. Stale fills accepted: <b className="num">{h.stale_fills_accepted_tv}</b> vs <b className="num">{h.stale_fills_accepted_ringside}</b>.
            </p>
          )}
          {!r && <p className="mt-5">Loading results…</p>}
        </header>

        <Round n="01" title="Courtsiding A/B">
          {r?.e1 && (
            <>
              <CourtsiderBars
                bars={[
                  ...r.e1.delays.map((d: R) => ({ label: `TV ${d.delay_ms / 1000} s`, mean: d.pnl_mean, lo: d.pnl_ci95[0], hi: d.pnl_ci95[1], color: PROOF_COLORS.TV, n: d.n_matches })),
                  { label: "Ringside", mean: r.e1.ringside.pnl_mean, lo: r.e1.ringside.pnl_ci95[0], hi: r.e1.ringside.pnl_ci95[1], color: PROOF_COLORS.RS, n: r.e1.ringside.n_matches },
                ]}
              />
              <table className="num mt-4 w-full text-left text-sm">
                <thead><tr className="border-b border-ink"><th>Book</th><th>Matches</th><th>PnL / match</th><th>95% CI</th><th>Stale fills accepted</th><th>House PnL / match</th></tr></thead>
                <tbody>
                  {r.e1.delays.map((d: R) => (
                    <tr key={d.delay_ms} className="border-b border-ink/20"><td>TV delay {d.delay_ms / 1000} s</td><td>{d.n_matches}</td><td>{f(d.pnl_mean)}</td><td>[{f(d.pnl_ci95[0])}, {f(d.pnl_ci95[1])}]</td><td>{d.stale_fills_accepted}</td><td>{f(d.house_pnl_mean)}</td></tr>
                  ))}
                  <tr className="font-semibold"><td>Ringside</td><td>{r.e1.ringside.n_matches}</td><td>{f(r.e1.ringside.pnl_mean)}</td><td>[{f(r.e1.ringside.pnl_ci95[0])}, {f(r.e1.ringside.pnl_ci95[1])}]</td><td>{r.e1.ringside.stale_fills_accepted}</td><td>{f(r.e1.ringside.house_pnl_mean)}</td></tr>
                </tbody>
              </table>
              <p className="mt-2 text-sm text-ink-quiet">Ringside: {r.e1.ringside.stale_rejections} of {r.e1.ringside.stale_attempts} stale attempts rejected onchain (ErrStaleTick).</p>
            </>
          )}
        </Round>

        <Round n="02" title="Is the price right?">
          {r?.e2 && (
            <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
              <Reliability
                series={[
                  { name: "HP-ratio heuristic", color: PROOF_COLORS.TV, pts: r.e2.reliability.hp_ratio, ece: r.e2.models.hp_ratio.ece },
                  { name: "LightGBM (float)", color: PROOF_COLORS.THIRD, pts: r.e2.reliability.lightgbm_float, ece: r.e2.models.lightgbm_float.ece },
                  { name: "Onchain integer model", color: PROOF_COLORS.RS, pts: r.e2.reliability.logistic_onchain_integer, ece: r.e2.models.logistic_onchain_integer.ece },
                ]}
              />
              <table className="num w-full self-start text-left text-sm">
                <thead><tr className="border-b border-ink"><th>Model (held-out)</th><th>Brier</th><th>Log-loss</th><th>ECE</th></tr></thead>
                <tbody>
                  {Object.entries(r.e2.models as R).map(([k, v]) => (
                    <tr key={k} className={`border-b border-ink/20 ${k === "logistic_onchain_integer" ? "font-semibold" : ""}`}><td>{k.replaceAll("_", " ")}</td><td>{f(v.brier, 4)}</td><td>{f(v.log_loss, 4)}</td><td>{f(v.ece, 4)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Round>

        <Round n="03" title="How fast, measured">
          {r?.e3 && (
            <div className="num grid gap-4 md:grid-cols-3">
              <div className="border border-ink/30 p-4"><p className="text-[12px] text-ink-quiet">TICK CADENCE p50 / p95 / p99</p><p className="text-2xl">{f(r.e3.tick_cadence_ms.p50, 0)} / {f(r.e3.tick_cadence_ms.p95, 0)} / {f(r.e3.tick_cadence_ms.p99, 0)} ms</p></div>
              <div className="border border-ink/30 p-4"><p className="text-[12px] text-ink-quiet">QUOTE AGE AT FILL p50 / p95</p><p className="text-2xl">{f(r.e3.quote_age_at_fill_ms.p50, 0)} / {f(r.e3.quote_age_at_fill_ms.p95, 0)} ms</p></div>
              <div className="border border-ink/30 p-4"><p className="text-[12px] text-ink-quiet">SUBMIT→CONFIRM (TRADE) p50 / p95</p><p className="text-2xl">{f(r.e3.submit_confirm_ms?.trade?.p50, 0)} / {f(r.e3.submit_confirm_ms?.trade?.p95, 0)} ms</p></div>
            </div>
          )}
          {live?.tick_cadence_ms?.p50 != null && <p className="num mt-3 text-sm text-ink-quiet">Live now (indexer): tick cadence p50 {f(live.tick_cadence_ms.p50, 0)} ms over {live.tick_cadence_ms.n} ticks.</p>}
        </Round>

        {r?.e5 && <Round n="04" title="Sealed until the bell">
          {r?.e5 && (
            <ul className="num space-y-1 text-sm">
              {Object.entries(r.e5.attempts as R).map(([k, n]) => (
                <li key={k}>{k.replaceAll("_", " ")}: {r.e5.denied[k]} / {n as number} reads denied</li>
              ))}
              <li>after reveal: {r.e5.after_reveal_readable ? "readable" : "not readable"} · plain ER baseline: {r.e5.plain_er_readable ? "readable in one call" : "—"}</li>
            </ul>
          )}
        </Round>}

        <Round n="05" title="Load, replays, fighters">
          <div className="num grid gap-4 text-sm md:grid-cols-3">
            {r?.e4 && <div className="border border-ink/30 p-4"><p className="text-[12px] text-ink-quiet">SOAK · {r.e4.bots} BOTS</p><p>success {pc(r.e4.success_rate)} · max exposure {f(r.e4.max_exposure_usdc)} / cap {f(r.e4.cap_usdc)} · CU tick p50 {r.e4.cu?.tick_p50} · trade {r.e4.cu?.trade}</p></div>}
            {r?.e6 && <div className="border border-ink/30 p-4"><p className="text-[12px] text-ink-quiet">REPLAY DETERMINISM</p><p>{r.e6.verified_wasm}/{r.e6.k} WASM · {r.e6.verified_python}/{r.e6.k} Python match onchain</p></div>}
            {r?.e7 && <div className="border border-ink/30 p-4"><p className="text-[12px] text-ink-quiet">PPO VS SCRIPTED (HELD-OUT)</p><p>{Object.entries(r.e7.win_rate as R).map(([k, v]) => `${k} ${pc(v)}`).join(" · ")}</p></div>}
          </div>
        </Round>

        <Round n="06" title="Where it falls short">
          <ul className="space-y-3">
            {(r?.negative ?? []).map((n: R) => (
              <li key={n.title}><b>{n.title}.</b> {n.detail}</li>
            ))}
            {r?.weakest_case && <li><b>Weakest case:</b> {r.weakest_case.title.toLowerCase()} (above).</li>}
          </ul>
        </Round>
      </div>
    </div>
  );
}
