// Short explanations, kept in line with the Ringside docs (ringside.prashantthakur.dev/docs).
export const TOPICS: Record<string, string> = {
  tick:
    "The tick. A crank calls the program's `tick` instruction every 100 ms (permissionless and time-gated: at least one slot since the last tick, and game time never more than one second ahead of wall time). " +
    "One tick, in one instruction on the MagicBlock ephemeral rollup: (1) steps the shared integer simulation (Q16.16, no floats) with both fighters' latest inputs; (2) spawns the power-up wave from its VRF seed when due; " +
    "(3) extends the hash chain, state_hash = sha256(previous ‖ tick ‖ canonical state); (4) evaluates 16 features through the integer logistic model, sigmoid table and calibration table and writes quotes with spread and inventory skew; " +
    "(5) sets last_priced_tick = tick. The fight, the price and your fill are one rollup state. The same simulation is compiled to the program, to WASM and to Python; 10,000 random episodes give identical hash chains in all three.",
  freshness:
    "The freshness window. Every trade carries seen_tick, the tick of the quote the trader acted on. If the book has moved on by more than 2 ticks (200 ms) the program rejects the order with ErrStaleTick: nothing fills and nothing moves, and the client re-quotes from a fresh read. " +
    "This is how Ringside closes the courtsiding gap (sportsbooks stream 5–8 s behind the action, so faster watchers trade on stale prices) instead of policing it. After a hit in lethal range, quotes freeze for a few ticks (ErrFrozen) so nobody trades into a knockout that is already decided. " +
    "Fighters and their session keys cannot trade their own match (ErrFighterBarred).",
  privacy:
    "Sealed positions. A spectator's Position lives on the TEE validator (MagicBlock devnet-tee) with an ephemeral permission whose members are the owner and the house. Anyone else, including the opposing fighter and clients without a valid token, reads nothing. " +
    "Clients authenticate to the TEE RPC by signing a challenge; only the token goes in the URL. At settlement reveal_positions flips positions public. The evaluation (E5) tries unauthenticated, non-member and opposing-fighter reads and checks every one is denied.",
  settlement:
    "Settlement and the record. When the fight ends the crank's settle pays the fighters from the stake escrow and settles both books; positions are revealed and claim pays winning shares (1.000 test-dollar each) from the house vault. " +
    "finalize commits the books and the Match to Solana with a Magic Action that calls write_match_record, which writes a MatchRecord on Solana: winner, ticks, final hash and both books' totals. Anyone can compare that hash with a replay (see verify_match). Everything runs on devnet with a test-dollar token; no real money is involved.",
  vrf:
    "Randomness. Every 15 seconds a wave of power-ups spawns from a seed requested from MagicBlock's VRF on the rollup's queue (request_wave_randomness, once per wave). The vrf_callback is accepted only from the VRF program identity and writes the seed and wave index into the sim state. " +
    "Because the seed is part of the hashed state, replays reproduce the waves exactly: the replay record lists each wave's seed, the tick it applied at and the callback transaction.",
  books:
    "Two books. Each match has two markets with identical rules except their price source. The Ringside book is priced inside the tick. The TV-delay book is fed by a relay with the state from delay_ms ago, the way a sportsbook priced off a broadcast would be. " +
    "A courtsider bot sends the same stale order to both; the difference between them is evaluation E1 (see courtsiding_report).",
  pricing:
    "Pricing. A LightGBM teacher trained on 200,000 simulated matches is distilled into a logistic student, calibrated with a 64-knot isotonic table and stored onchain as Q32.32 integers (a 4,744-byte model). The tick evaluates it with a 1,024-entry sigmoid table. " +
    "The mid is the win probability; the spread depends on time left, and inventory skews the quotes so the house's worst case stays under its exposure cap (ErrExposure).",
  architecture:
    "Architecture. Solana devnet holds Config, ModelParams, fighter Profiles and MatchRecords, the accounts before delegation, and the token mint and vault. The private ephemeral rollup (MagicBlock devnet-tee) holds the Match (public), its two Markets (public), Positions (private until reveal) and token accounts, plus the crank and the VRF queue. " +
    "Every account a trade or a tick writes is delegated to the same TEE validator, because only accounts on one validator can change together in one rollup transaction, and privacy needs the TEE. " +
    "Off-chain: a Rust indexer (account subscriptions → Postgres → REST/SSE), the Next.js web app with the WASM sim, and the bots (fighters, spectators, the courtsider and the delay relay). Program id 4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej (Anchor).",
};
