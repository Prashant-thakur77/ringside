// Documentation: what Ringside is, how to use it, how it works, the program and API reference, and how to run it.
import type { Metadata } from "next";
import Link from "next/link";
import { PRIMS } from "@/lib/prims";
import { DocsNav } from "./DocsNav";

export const metadata: Metadata = { title: "Docs · Ringside", description: "How Ringside works: the tick, the freshness window, pricing, privacy, settlement, the program reference and the indexer API." };

const REPO = "https://github.com/Prashant-thakur77/ringside";
const SECTIONS: [string, string][] = [
  ["overview", "Overview"], ["quickstart", "Quickstart"], ["tick", "The tick"], ["freshness", "The freshness window"],
  ["books", "Two books"], ["pricing", "Pricing"], ["privacy", "Sealed positions"], ["settlement", "Settlement and the record"],
  ["randomness", "Randomness"], ["architecture", "Architecture"], ["magicblock", "MagicBlock primitives"],
  ["program", "Program reference"], ["errors", "Errors"], ["api", "Indexer API"], ["local", "Run it locally"], ["glossary", "Glossary"],
];

const IXS: [string, [string, string][]][] = [
  ["Setup (admin)", [
    ["initialize_config", "Creates the Config: admin, mint, fee and spread parameters, the stale-tick limit and the model version."],
    ["update_config · set_spread_params · pause", "Adjusts parameters or pauses new matches and trades."],
    ["create_model · set_model_params · finalize_model", "Uploads the integer pricing model (4,744 bytes) in chunks and freezes it; matches only price with a finalized model."],
    ["init_house_vault · topup_house_vault · withdraw_fees", "The house's token account on the rollup (owned by the Config PDA), its funding and fee withdrawal."],
  ]],
  ["Match lifecycle", [
    ["create_profile · delegate_profile", "A fighter's profile (Elo, record) on Solana, delegated to the TEE validator."],
    ["create_match", "Creates the Match and both Markets (Ringside and TV-delay) with the stake, the opponent slot and the stream delay."],
    ["delegate_match · delegate_escrow", "Hands the Match, Markets and the stake escrow to the TEE validator."],
    ["join_fight", "A fighter stakes and takes a corner; the second join rings the bell."],
    ["submit_input", "A fighter's movement, aim and abilities for the next tick (sequence-checked, one per tick)."],
    ["schedule_tick", "Schedules the crank: tick then settle every 100 ms, task id = hash(program ‖ match)."],
    ["tick", "Steps the duel, extends the hash chain, re-prices the Ringside book and records the tick. Permissionless and time-gated."],
  ]],
  ["Trading", [
    ["join_position · delegate_position · init_position_permission", "A spectator's Position per market, delegated, and its permission (owner + house) set private."],
    ["trade", "Buy or sell shares of a corner at the book's price. Carries seen_tick and a limit price; rejects stale ticks, fighters and limit breaches."],
    ["relay_delayed_state", "Feeds the TV-delay book the state from delay_ms ago (the control book for the A/B)."],
  ]],
  ["Randomness", [
    ["request_wave_randomness", "Requests the VRF seed for the next power-up wave on the rollup's queue, once per wave."],
    ["vrf_callback", "Called by the VRF program's identity only: writes the seed and the wave index into the sim."],
  ]],
  ["Settlement", [
    ["settle", "After the final tick: pays the fighters from the escrow, settles both books and reveals positions passed with it."],
    ["reveal_positions", "Flips sealed positions to public (the authority stays a member)."],
    ["claim", "Pays a position's winning shares from the house vault."],
    ["finalize · commit_match · cleanup_positions", "Commits the books and the Match to Solana; the Magic Action calls write_match_record; positions are committed and undelegated in batches."],
    ["write_match_record", "Magic Action target: writes the MatchRecord (winner, ticks, final hash, both books' totals) on Solana."],
  ]],
];

const ERRORS: [string, string][] = [
  ["ErrStaleTick", "Fill priced off a stale tick"], ["ErrFighterBarred", "Fighters and their session keys cannot trade their own match"],
  ["ErrSlippage", "Price is worse than the limit"], ["ErrExposure", "House exposure cap would be exceeded"],
  ["ErrClosed", "Market or match is not open"], ["ErrNotFighter", "Signer is not a fighter in this match"],
  ["ErrBadSeq", "Input sequence must increase and inputs are limited to one per tick"], ["ErrTooEarly", "Too early: time gate not reached"],
  ["ErrBadQueue", "Wrong VRF queue or request"], ["ErrPaused", "Paused"], ["ErrMath", "Arithmetic error"],
  ["ErrAlreadySettled", "Already settled"], ["ErrFrozen", "Quotes are frozen after a lethal-range hit"],
  ["ErrInsufficientShares", "Not enough shares to sell"], ["ErrBadQty", "Quantity is zero or above the per-trade maximum"],
  ["ErrUnauthorized", "Unauthorized"], ["ErrInvalidAccount", "Invalid account"], ["ErrMatchFull", "Match is full or the opponent is reserved"],
  ["ErrModel", "Model is not finalized or has a bad layout"], ["ErrNotSettled", "Not settled yet"], ["ErrWrongMode", "Wrong market mode for this instruction"],
];

const API: [string, string][] = [
  ["GET /health", "Liveness."],
  ["GET /matches?limit=N", "Recent matches with status, fighters, tick and both books."],
  ["GET /matches/{id}/state", "The latest Match and both Market snapshots."],
  ["GET /matches/{id}/replay", "Every tick's inputs, hash and fair price, the VRF seeds and the fills: what /replay verifies."],
  ["GET /judge/{id}", "The A/B for one match: fills and rejections on each book."],
  ["GET /stats", "Counts, tick cadence, quote age and submit-to-confirm latencies."],
  ["GET /leaderboard", "Fighters by Elo."],
  ["GET /events", "Server-sent events: every tick, fill, rejection and state change as it happens."],
  ["POST /latency", "Clients and bots report their OpenTelemetry spans (submit → confirm)."],
];

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="display scroll-mt-24 border-t border-slate/15 pt-12 text-[clamp(32px,3.6vw,52px)] font-semibold">{children}</h2>;
}
const Code = ({ children }: { children: string }) => (
  <pre className="num mt-4 overflow-x-auto rounded-xl bg-slate p-5 text-[13px] leading-relaxed text-chalk"><code>{children}</code></pre>
);
const P = ({ children }: { children: React.ReactNode }) => <p className="mt-4 max-w-[68ch] text-[17px] leading-relaxed text-slate/85">{children}</p>;

export default function Docs() {
  return (
    <div className="bg-paper text-slate">
      <header className="bg-hue px-4 pb-14 pt-16 md:px-8">
        <div className="mx-auto max-w-[1300px]">
          <p className="num text-[12px] text-slate/70">DOCUMENTATION</p>
          <h1 className="display mt-3 max-w-[16ch] text-[clamp(48px,7vw,112px)] font-semibold">How Ringside works</h1>
          <p className="serif mt-6 max-w-[40ch] text-[clamp(22px,2.2vw,30px)] leading-snug">The fight, the price and your fill are one rollup state. Here is everything that follows from that.</p>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1300px] gap-10 px-4 pb-28 md:grid-cols-[220px_1fr] md:px-8">
        <DocsNav sections={SECTIONS} />
        <article className="min-w-0 pt-4">
          <H2 id="overview">Overview</H2>
          <P>Ringside is an in-play exchange on a one-on-one duel that runs entirely onchain. Two fighters (people or AI) play a 90-second top-down fight; spectators buy and sell shares that pay 1.000 test-dollar if their corner wins. The fight and the order book live in the same MagicBlock ephemeral rollup, so the instruction that advances the fight also re-prices the book.</P>
          <P>Sportsbooks stream 5–8 seconds behind the action and freeze markets because faster watchers trade on prices that have not seen the latest point. That is courtsiding. Ringside closes the gap instead of policing it: every order carries the tick it was priced on, and an order more than two ticks behind the book is rejected by the program.</P>
          <P>Everything runs on Solana devnet with a test-dollar token. No real money is involved.</P>

          <H2 id="quickstart">Quickstart</H2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              ["Watch and trade", "Open a live match from tonight's card. Connect a devnet wallet, approve one session (two hours, scoped to Ringside), then buy red or blue. Each fill shows the tick it was priced on."],
              ["Fight", "Go to Fight and take on the PPO fighter. WASD or the on-screen stick to move, click or tap to fire, Space to dash, Shift to shield. Your inputs land onchain every tick."],
              ["Verify", "Open any finished match's replay and press Verify. Your browser re-runs the fight in WASM from its inputs and VRF seeds and compares every link of the hash chain."],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-2xl bg-white/60 p-6 ring-1 ring-slate/10">
                <span className="num text-[13px] text-hue-deep">0{i + 1}</span>
                <p className="display mt-2 text-[26px] font-semibold">{t}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-slate/80">{d}</p>
              </li>
            ))}
          </ol>

          <H2 id="tick">The tick</H2>
          <P>A crank calls <code className="num">tick</code> every 100 ms. One tick, in one instruction:</P>
          <ol className="num mt-4 space-y-2 text-[15px]">
            <li>01 · time gate: at least one slot since the last tick, and game time never ahead of wall time by more than one second</li>
            <li>02 · step the shared integer simulation with both fighters&apos; latest inputs (Q16.16, no floats)</li>
            <li>03 · spawn the power-up wave from its VRF seed when due</li>
            <li>04 · state_hash = sha256(previous ‖ tick ‖ canonical state)</li>
            <li>05 · 16 features → integer logistic model → sigmoid table → calibration table → quotes with spread and inventory skew</li>
            <li>06 · last_priced_tick = tick</li>
          </ol>
          <P>The same simulation is compiled to the program, to WASM for the browser and to Python for training; 10,000 random episodes give identical hash chains in all three.</P>

          <H2 id="freshness">The freshness window</H2>
          <P>Every trade passes <code className="num">seen_tick</code>, the tick of the quote the trader acted on. If the book has moved on by more than <b>2 ticks</b> (200 ms) the program rejects the order with <code className="num">ErrStaleTick</code>. Nothing fills and nothing moves. A client re-quotes from a fresh read and sends again.</P>
          <P>After a hit in lethal range, quotes freeze for a few ticks (<code className="num">ErrFrozen</code>) so nobody trades into a knockout that is already decided.</P>

          <H2 id="books">Two books</H2>
          <P>Each match has two markets with identical rules except their price source. The <b>Ringside</b> book is priced inside the tick. The <b>TV-delay</b> book is fed by a relay with the state from <code className="num">delay_ms</code> ago, the way a sportsbook priced off a broadcast would be. The courtsider bot sends the same stale order to both; the difference is the evaluation (E1) shown on <Link href="/proof" className="underline">Proof</Link>.</P>

          <H2 id="pricing">Pricing</H2>
          <P>A LightGBM teacher trained on 200,000 simulated matches is distilled into a logistic student, calibrated with a 64-knot isotonic table and stored onchain as Q32.32 integers. The tick evaluates it with a 1,024-entry sigmoid table. The mid is the win probability; the spread depends on time left and inventory skews the quotes so the house&apos;s worst case stays under its exposure cap (<code className="num">ErrExposure</code>).</P>

          <H2 id="privacy">Sealed positions</H2>
          <P>Positions live on the TEE validator with an ephemeral permission whose members are the owner and the house. Anyone else, including the opposing fighter and clients without a valid token, reads nothing. At settlement <code className="num">reveal_positions</code> flips them public. Clients authenticate to the TEE RPC by signing a challenge; only the token goes in the URL.</P>

          <H2 id="settlement">Settlement and the record</H2>
          <P>When the fight ends the crank&apos;s <code className="num">settle</code> pays the fighters from the escrow and settles both books. Positions are revealed and claims pay winning shares from the house vault. <code className="num">finalize</code> commits the books to Solana with a Magic Action that writes a <b>MatchRecord</b>: winner, ticks, final hash and both books&apos; totals. Anyone can compare that hash with a replay.</P>

          <H2 id="randomness">Randomness</H2>
          <P>Every 15 seconds a wave of power-ups spawns from a seed requested from MagicBlock&apos;s VRF on the rollup&apos;s queue. The callback is accepted only from the VRF program identity, and the seed is part of the hashed state, so replays reproduce the waves exactly.</P>

          <H2 id="architecture">Architecture</H2>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              ["Solana devnet", "Config, ModelParams, Profiles, MatchRecords; accounts before delegation; the token mint and vault."],
              ["Private ER (devnet-tee)", "Match (public), two Markets (public), Positions (private until reveal), token accounts; crank, VRF queue."],
              ["Off-chain", "Rust indexer (account subscriptions → Postgres → REST/SSE), the Next.js web app with the WASM sim, and the bots (PPO fighters, spectators, courtsider, delay relay)."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-2xl bg-slate p-6 text-chalk">
                <p className="display text-[24px] font-semibold text-hue">{t}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-chalk/80">{d}</p>
              </div>
            ))}
          </div>
          <P>Every account a trade or a tick writes is delegated to the same TEE validator, because only accounts on one validator can change together in one rollup transaction, and privacy needs the TEE.</P>

          <H2 id="magicblock">MagicBlock primitives</H2>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[15px]">
              <thead><tr className="num border-b-2 border-slate text-[12px]"><th className="py-2 pr-4">PRIMITIVE</th><th className="pr-4">WHAT IT DOES HERE</th><th>WITHOUT IT</th></tr></thead>
              <tbody>
                {PRIMS.map(([k, a, b]) => (
                  <tr key={k} className="border-b border-slate/15 align-top"><td className="py-3 pr-4 font-semibold">{k}</td><td className="pr-4">{a}</td><td className="text-slate/65">{b}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <H2 id="program">Program reference</H2>
          <P>Program id <code className="num break-all">4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej</code> (Anchor 1.0). The IDL and TypeScript builders are in <a href={`${REPO}/tree/main/packages/client`} className="underline" target="_blank" rel="noreferrer">packages/client</a>.</P>
          {IXS.map(([g, list]) => (
            <div key={g} className="mt-8">
              <p className="num text-[12px] text-hue-deep">{g.toUpperCase()}</p>
              <dl className="mt-2 divide-y divide-slate/15 border-y border-slate/15">
                {list.map(([n, d]) => (
                  <div key={n} className="grid gap-1 py-3 md:grid-cols-[minmax(0,320px)_1fr] md:gap-6">
                    <dt className="num text-[14px] font-semibold">{n}</dt>
                    <dd className="text-[15px] leading-relaxed text-slate/80">{d}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          <p className="num mt-8 text-[12px] text-hue-deep">ACCOUNTS</p>
          <ul className="mt-2 grid gap-2 text-[15px] md:grid-cols-2">
            {[["Config", "admin, mint, parameters, model version"], ["ModelParams", "the integer model blob and its metrics hash"], ["Profile", "a fighter's Elo and record"], ["Match", "stake, fighters, the 832-byte sim state, inputs, hash chain, status"], ["Market ×2", "quotes, inventory, house cash, counters, delay, mode"], ["Position", "a spectator's shares and cost basis per market, private until reveal"], ["MatchRecord", "the result written on Solana at finalize"]].map(([k, d]) => (
              <li key={k} className="rounded-xl bg-white/60 p-4 ring-1 ring-slate/10"><b>{k}</b> <span className="text-slate/75">· {d}</span></li>
            ))}
          </ul>

          <H2 id="errors">Errors</H2>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[15px]">
              <thead><tr className="num border-b-2 border-slate text-[12px]"><th className="py-2 pr-4">CODE</th><th className="pr-4">NAME</th><th>MEANING</th></tr></thead>
              <tbody>
                {ERRORS.map(([n, m], i) => (
                  <tr key={n} className="border-b border-slate/15"><td className="num py-2.5 pr-4">{6000 + i}</td><td className="num pr-4 font-semibold">{n}</td><td className="text-slate/80">{m}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <H2 id="api">Indexer API</H2>
          <P>The indexer follows the rollup and Solana and serves what the web app shows. On the private rollup it follows each live match by account subscription: transaction logs there are visible only to their signer, so fills are derived from the public market accounts and the trader shows as private.</P>
          <dl className="mt-4 divide-y divide-slate/15 border-y border-slate/15">
            {API.map(([r, d]) => (
              <div key={r} className="grid gap-1 py-3 md:grid-cols-[300px_1fr] md:gap-6">
                <dt className="num text-[14px] font-semibold">{r}</dt>
                <dd className="text-[15px] text-slate/80">{d}</dd>
              </div>
            ))}
          </dl>

          <H2 id="local">Run it locally</H2>
          <P>Requirements: Rust 1.89, Solana CLI 3.1, Anchor 1.0, Node 24 with pnpm, Docker, Python 3.12.</P>
          <Code>{`pnpm install && ./scripts/build-wasm.sh
anchor build --ignore-keys
./scripts/setup-local.sh            # base validator + rollup (Docker) + config, model, house, bots
docker run -d --name ringside-pg -e POSTGRES_USER=ringside -e POSTGRES_PASSWORD=ringside \\
  -e POSTGRES_DB=ringside -p 5434:5432 postgres:16
RINGSIDE_ENV=local cargo +stable run --release --manifest-path services/indexer/Cargo.toml
cd bots && RINGSIDE_ENV=local npx tsx lobby.ts
cd apps/web && pnpm dev             # http://localhost:3000`}</Code>
          <P>Tests: <code className="num">cd tests/magicsvm && cargo +stable test --release</code> runs the program on MagicSVM (rollup, VRF, crank, Magic Actions); <code className="num">./tests/determinism/run.sh 10000</code> checks native = WASM = Python. Devnet: <code className="num">./scripts/devnet-all.sh deploy | services | e2e | eval | soak | report</code>.</P>
          <P>Source: <a href={REPO} className="underline" target="_blank" rel="noreferrer">{REPO.replace("https://", "")}</a> · MIT licensed.</P>

          <H2 id="glossary">Glossary</H2>
          <dl className="mt-4 grid gap-x-10 md:grid-cols-2">
            {[["Tick", "One 100 ms step of the fight; also the unit of price freshness."], ["Seen tick", "The tick of the quote a trader acted on, sent with every order."], ["Courtsiding", "Trading on an event faster than the price can react."], ["Share", "Pays 1.000 test-dollar if its corner wins, nothing otherwise."], ["Ephemeral rollup", "A fast execution layer that accounts are delegated to and later committed back to Solana."], ["TEE", "Trusted execution environment: the validator that keeps positions private."], ["Session key", "A short-lived key your wallet authorises once, so trades need no pop-ups."], ["MatchRecord", "The account on Solana holding a match's result and final hash."]].map(([k, d]) => (
              <div key={k} className="border-b border-slate/15 py-3"><dt className="font-semibold">{k}</dt><dd className="mt-1 text-[15px] text-slate/75">{d}</dd></div>
            ))}
          </dl>
        </article>
      </div>
    </div>
  );
}
