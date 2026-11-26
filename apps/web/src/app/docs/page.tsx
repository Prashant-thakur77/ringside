// How Ringside works: architecture, the tick, and what breaks without each MagicBlock primitive.
const PRIMS: [string, string, string][] = [
  ["Ephemeral Rollup", "The fight, the book and every fill run at rollup speed in one account set.", "Ticks and fills would land at L1 speed; the price could not keep up with the fight."],
  ["Private ER (TEE)", "Spectator positions are sealed by per-account permissions until settle reveals them.", "Anyone could read open positions and trade against them mid-fight."],
  ["VRF", "Power-up waves every 15 s come from verifiable randomness requested on the ER queue.", "Wave layouts would be predictable or operator-chosen."],
  ["Crank (ScheduleTask)", "The validator calls tick + settle every 100 ms; no off-chain server drives the game.", "The fight would only advance when someone pays to push it."],
  ["Session keys", "One wallet prompt, then 2 h of gasless trades and inputs, scoped to Ringside.", "A wallet popup for every input and every trade."],
  ["Ephemeral SPL", "Stakes, the house vault and payouts move as eATA balances inside the rollup.", "Every payout would wait for an L1 transfer."],
  ["Magic Router / TEE RPC", "Clients route to the validator holding the delegated accounts, with a token-auth pass.", "Clients would have to hard-code validator endpoints and read private state."],
  ["Magic Actions", "finalize commits the book and writes a MatchRecord receipt on L1 in the post-commit action.", "No durable, checkable record of the result and the final state hash on Solana."],
];

export default function Docs() {
  return (
    <div className="ticket min-h-screen">
      <div className="mx-auto max-w-[1100px] space-y-14 px-4 py-12 md:px-7">
        <header>
          <p className="num text-[12px] text-ink-quiet">HOW IT WORKS</p>
          <h1 className="display mt-2 text-[clamp(48px,7vw,112px)] font-black">The game tick, the price and your fill are one rollup state</h1>
          <p className="mt-5 max-w-[62ch] text-lg">
            Sportsbooks stream 5–8 seconds behind the action and freeze markets because faster watchers pick off stale prices. Ringside puts the fight and the order book in the same rollup: the instruction that advances the duel also re-prices the book, and every order carries the tick it saw.
          </p>
        </header>

        <section>
          <h2 className="display text-[clamp(32px,4.5vw,64px)] font-black">Architecture</h2>
          <svg viewBox="0 0 1000 560" className="mt-4 w-full" role="img" aria-label="Architecture: Solana devnet base layer, the TEE private ephemeral rollup, and off-chain services">
            <defs>
              <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#22201a" /></marker>
            </defs>
            <g fontFamily="var(--font-plex-mono)" fontSize="13" fill="#22201a">
              <rect x="20" y="20" width="960" height="110" fill="#f8f2e3" stroke="#22201a" strokeWidth="2" />
              <text x="36" y="44" fontWeight="700">SOLANA DEVNET · BASE LAYER</text>
              <text x="36" y="72">Config · ModelParams (integer model, 4,744 B) · Profile · MatchRecord (written by Magic Action)</text>
              <text x="36" y="96">Match / Market / Position before delegation · USDC or test-dollar mint · eSPL global vault</text>
              <text x="36" y="118" fill="#5d5644">session tokens (2 h, scoped to Ringside)</text>

              <rect x="20" y="200" width="960" height="170" fill="#ecebe4" stroke="#22201a" strokeWidth="2" />
              <text x="36" y="224" fontWeight="700">PRIVATE EPHEMERAL ROLLUP · TEE VALIDATOR (devnet-tee)</text>
              <rect x="36" y="240" width="200" height="56" fill="#fff" stroke="#22201a" /><text x="48" y="262">Match (public)</text><text x="48" y="282" fill="#5d5644">sim · hash chain</text>
              <rect x="250" y="240" width="200" height="56" fill="#fff" stroke="#22201a" /><text x="262" y="262">Market ×2 (public)</text><text x="262" y="282" fill="#5d5644">Ringside · TV-delay</text>
              <rect x="464" y="240" width="200" height="56" fill="#fff" stroke="#b8232f" strokeWidth="2" /><text x="476" y="262">Position ×N</text><text x="476" y="282" fill="#b8232f">private → reveal</text>
              <rect x="678" y="240" width="286" height="56" fill="#fff" stroke="#22201a" /><text x="690" y="262">eATAs: house · escrow · users</text><text x="690" y="282" fill="#5d5644">Ephemeral SPL</text>
              <text x="36" y="330">crank: tick + settle every 100 ms (ScheduleTask, task id = hash(program ‖ match))</text>
              <text x="36" y="354">VRF ephemeral queue: one seed per 15 s power-up wave → vrf_callback</text>

              <rect x="20" y="440" width="300" height="100" fill="#f8f2e3" stroke="#22201a" strokeWidth="2" /><text x="36" y="464" fontWeight="700">INDEXER (Rust)</text><text x="36" y="488">logs + accounts → Postgres</text><text x="36" y="510">REST + SSE · record checks</text>
              <rect x="350" y="440" width="300" height="100" fill="#f8f2e3" stroke="#22201a" strokeWidth="2" /><text x="366" y="464" fontWeight="700">WEB (Next.js)</text><text x="366" y="488">Pixi arena · WASM sim</text><text x="366" y="510">TEE pass · session keys</text>
              <rect x="680" y="440" width="300" height="100" fill="#f8f2e3" stroke="#22201a" strokeWidth="2" /><text x="696" y="464" fontWeight="700">BOTS (TS + ONNX)</text><text x="696" y="488">PPO fighters · spectators</text><text x="696" y="510">courtsider · delay relay · keeper</text>

              <line x1="200" y1="130" x2="200" y2="200" stroke="#22201a" strokeWidth="2" markerEnd="url(#ar)" /><text x="210" y="170">delegate (validator = TEE)</text>
              <line x1="800" y1="200" x2="800" y2="130" stroke="#22201a" strokeWidth="2" markerEnd="url(#ar)" /><text x="610" y="170">commit + Magic Action (MatchRecord)</text>
              <line x1="170" y1="440" x2="170" y2="370" stroke="#22201a" strokeWidth="2" markerEnd="url(#ar)" markerStart="url(#ar)" /><text x="180" y="410">token-auth ws</text>
              <line x1="500" y1="440" x2="500" y2="370" stroke="#22201a" strokeWidth="2" markerEnd="url(#ar)" /><text x="510" y="410">session-key txs</text>
              <line x1="830" y1="440" x2="830" y2="370" stroke="#22201a" strokeWidth="2" markerEnd="url(#ar)" /><text x="840" y="410">inputs · trades · relay</text>
              <line x1="320" y1="490" x2="350" y2="490" stroke="#22201a" strokeWidth="2" markerEnd="url(#ar)" />
            </g>
          </svg>
          <p className="mt-4 max-w-[70ch]">
            <b>Why every account sits on the TEE validator.</b> A trade must write the Market and the spectator&apos;s Position atomically, and the tick must read the Match and write the Market. Only accounts delegated to the same validator can change inside one rollup transaction, and privacy needs the TEE, so the match, both books, the positions and the token custody all delegate to devnet-tee. Accounts without a permission stay public there: the Match and the Markets are public, Positions are private until the bell.
          </p>
        </section>

        <section>
          <h2 className="display text-[clamp(32px,4.5vw,64px)] font-black">One tick</h2>
          <ol className="num mt-4 space-y-2 text-[15px]">
            <li>01 · time gate: at least one slot since the last tick, and game time never ahead of wall time by more than 1 s</li>
            <li>02 · step the shared integer simulation with both fighters&apos; latest inputs (Q16.16, no floats)</li>
            <li>03 · spawn the power-up wave from the VRF seed when due</li>
            <li>04 · state_hash = sha256(prev ‖ tick ‖ canonical state)</li>
            <li>05 · 16 features → integer logistic model → LUT sigmoid → isotonic table → quotes with spread and inventory skew</li>
            <li>06 · last_priced_tick = tick; orders whose seen_tick is more than 2 behind are rejected (ErrStaleTick)</li>
          </ol>
        </section>

        <section>
          <h2 className="display text-[clamp(32px,4.5vw,64px)] font-black">MagicBlock, load-bearing</h2>
          <table className="mt-4 w-full text-left text-[15px]">
            <thead><tr className="num border-b-2 border-ink text-[12px]"><th className="py-2 pr-4">PRIMITIVE</th><th className="pr-4">WHAT IT DOES HERE</th><th>WHAT BREAKS WITHOUT IT</th></tr></thead>
            <tbody>
              {PRIMS.map(([k, a, b]) => (
                <tr key={k} className="border-b border-ink/20 align-top"><td className="py-3 pr-4 font-semibold">{k}</td><td className="pr-4">{a}</td><td className="text-ink-quiet">{b}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
