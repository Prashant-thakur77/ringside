# ringside-mcp

An MCP (Model Context Protocol) server for [Ringside](https://ringside.prashantthakur.dev), the in-play exchange on a 90-second onchain duel that runs on Solana devnet and a MagicBlock private ephemeral rollup.

It lets an agent read matches, both order books, odds history and the evaluation results, and verify a match by re-running the fight in the same Rust simulation the program uses, compiled to WASM and bundled with the package.

Read-only. No wallet, no keys, no account. Everything is on devnet with a test-dollar token.

## Install

Run it with `npx` (Node 18 or newer):

```sh
npx -y ringside-mcp
```

It speaks MCP over stdio, so any MCP client can launch it.

### Desktop apps and most clients (`mcpServers` JSON)

Add this to the client's MCP config file:

```json
{
  "mcpServers": {
    "ringside": {
      "command": "npx",
      "args": ["-y", "ringside-mcp"]
    }
  }
}
```

### Cursor

Put the same block in `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project).

### Command-line agents

Register a stdio server whose command is `npx -y ringside-mcp`, or add the JSON block above to the project's `.mcp.json`.

### Point it at a live indexer

By default the server reads the snapshot the public site serves. To read a running Ringside indexer instead, set `RINGSIDE_INDEXER_URL`; each request tries the indexer first (4 s timeout) and falls back to the snapshot.

```json
{
  "mcpServers": {
    "ringside": {
      "command": "npx",
      "args": ["-y", "ringside-mcp"],
      "env": { "RINGSIDE_INDEXER_URL": "http://127.0.0.1:8787" }
    }
  }
}
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `RINGSIDE_INDEXER_URL` | unset | Live indexer REST base URL, tried first |
| `RINGSIDE_SITE_URL` | `https://ringside.prashantthakur.dev` | Site serving `/snap/*.json` and `/results.json` |

## Tools

| Tool | What it returns |
| --- | --- |
| `list_matches(limit?, status?)` | Recent matches: id, Red and Blue fighters, status, winner, final tick, fills on each book. `status` is `live` or `finished`. |
| `get_match(match_id)` | Match state and both books, the Ringside book (priced inside the tick) and the TV-delay book: fair price, bid/ask per corner in dollars, trades, volume, stale rejections, inventory, exposure. |
| `get_odds_history(match_id, every?)` | P(Red wins) by tick from the replay record, downsampled, with a sparkline. |
| `verify_match(match_id)` | Re-runs the fight from its inputs and VRF seeds in WASM and compares every link of the sha256 hash chain. Also checks tick continuity, the VRF seeds and callback signatures, and the final hash against the match account. Says which checks ran, which passed and which could not run, and gives explorer links. |
| `courtsiding_report(match_id?)` | Stale orders rejected and stale fills accepted on each book for one match, plus evaluation E1 across all held-out matches and delays. |
| `get_stats()` | Indexer counts and tick cadence, plus the evaluation headline numbers (courtsiding, model Brier, load, privacy, replay verification), all read from `results.json`. |
| `explain(topic)` | Short explanations: `tick`, `freshness`, `privacy`, `settlement`, `vrf`, `books`, `pricing`, `architecture`. |

Every tool returns a short readable summary followed by the full data as JSON. Prices are in dollars per share (a share pays 1.000 if its corner wins).

## Resources

- `ringside://results`: the full evaluation `results.json` (E1 to E7, headline, negative results).
- `ringside://program`: the program id `4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej` and devnet explorer links (program, config, model, a match, its record, example transactions).

## Example prompts

- "List the last 10 Ringside matches and tell me which one had the most fills."
- "Show me the odds swings in match 1795755252654. When did Red's chance peak?"
- "Verify match 1795753242111 and explain what was checked."
- "Is courtsiding profitable on Ringside? Compare the live book and the TV-delay book with numbers."
- "What is the measured tick cadence, and how many replays were verified?"
- "Explain the freshness window, then show me a match where stale orders were rejected."

## How verification works

Each tick the program computes `state_hash = sha256(previous ‖ tick as u64 LE ‖ canonical state bytes)`. `verify_match` starts from the genesis state, writes each VRF wave seed into the state at its `apply_at_tick`, steps the simulation with the recorded inputs and compares the recomputed hash with the recorded hash at every tick. If the indexer missed some ticks, it verifies everything up to the first gap and reports the result as partial.

## Develop

```sh
npm install
npm run build
npm test        # spawns the server and calls every tool against the site snapshot
```

## License

MIT
