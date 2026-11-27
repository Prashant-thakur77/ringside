// The eight MagicBlock primitives Ringside depends on: what each does here and what breaks without it.
export const PRIMS: [string, string, string][] = [
  ["Ephemeral Rollup", "The fight, both books and every fill change in one rollup state, ten times a second.", "Ticks and fills would land at L1 speed and the price could not keep up with the fight."],
  ["Private ER (TEE)", "Positions are sealed by per-account permissions inside a TEE until settlement reveals them.", "Anyone could read open positions and trade against them mid-fight."],
  ["VRF", "Power-up waves come from verifiable randomness requested on the rollup every 15 seconds.", "Wave layouts would be predictable or chosen by the operator."],
  ["Crank (ScheduleTask)", "The validator runs tick and settle every 100 ms. No server drives the game.", "The fight would advance only when someone paid to push it."],
  ["Session keys", "One wallet approval, then two hours of trades and inputs without pop-ups, scoped to Ringside.", "A wallet pop-up for every punch and every trade."],
  ["Ephemeral SPL", "Stakes, the house vault and payouts move as token balances inside the rollup.", "Every payout would wait for an L1 transfer."],
  ["TEE RPC + token auth", "Clients reach the validator holding the accounts with a signed token, and only see what they may.", "Clients would hard-code endpoints and could not read private state."],
  ["Magic Actions", "At the bell the commit to Solana also writes a MatchRecord receipt in the same action.", "No durable record of the result and the final state hash on Solana."],
];
