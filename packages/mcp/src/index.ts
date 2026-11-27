#!/usr/bin/env node
// Ringside MCP server (stdio): read-only tools over the Ringside indexer, the site snapshot and
// the evaluation results, plus an offline re-simulation of a match's hash chain in WASM.
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  api, explorer, INDEXER, links, PROGRAM_ID, results, SITE,
  type Book, type Judge, type MatchRow, type Replay, type StateResp, type Stats,
} from "./data.js";
import { TOPICS } from "./topics.js";

const VERSION = "0.1.0";
const STATUS = ["Lobby", "Live", "Sudden death", "Closed", "Settled", "Draw"];
const WINNER = ["none yet", "Red", "Blue", "Draw"];
const LIVE_STATUSES = new Set([0, 1, 2]);

const usd = (micro: number | null | undefined) => (micro == null ? null : Math.round(micro) / 1e6);
const short = (pk: string) => `${pk.slice(0, 4)}…${pk.slice(-4)}`;
const fighters = (f: [string, string]) => ({ red: `Red (${short(f[0])})`, blue: `Blue (${short(f[1])})`, red_pubkey: f[0], blue_pubkey: f[1] });
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

/** A tool result: a short readable summary followed by the structured data as JSON. */
function out(summary: string, data: unknown) {
  return { content: [{ type: "text" as const, text: `${summary}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`` }] };
}
function fail(e: unknown) {
  return { isError: true, content: [{ type: "text" as const, text: `Error: ${(e as Error).message ?? String(e)}` }] };
}
const safe = <A>(f: (a: A) => Promise<ReturnType<typeof out>>) => async (a: A) => {
  try {
    return await f(a);
  } catch (e) {
    return fail(e);
  }
};

function book(b: Book | null | undefined) {
  if (!b) return null;
  return {
    kind: b.mode === 0 ? "Ringside (priced inside the tick)" : `TV-delay (fed state from ${b.delay_ms} ms ago)`,
    delay_ms: b.delay_ms,
    fair_p_red: b.fair_p,
    mid_red_usd: usd(b.mid),
    red: { bid_usd: usd(b.bid_a), ask_usd: usd(b.ask_a) },
    blue: { bid_usd: usd(b.bid_b), ask_usd: usd(b.ask_b) },
    spread_usd: usd(b.spread),
    trades: b.n_trades,
    volume_usd: usd(b.volume),
    rejected_stale: b.n_rejected_stale,
    rejected_fighter: b.n_rejected_fighter,
    rejected_other: b.n_rejected_other,
    inventory: { red_shares: b.inv_a, blue_shares: b.inv_b },
    house_cash_usd: usd(b.house_cash),
    max_exposure_seen_usd: usd(b.max_exposure_seen),
    exposure_cap_usd: usd(b.cap),
    last_priced_tick: b.last_priced_tick,
    market_status: b.status,
  };
}

const server = new McpServer(
  { name: "ringside", version: VERSION },
  {
    instructions:
      "Ringside is an in-play exchange on a 90-second onchain duel (Solana devnet + a MagicBlock private ephemeral rollup). " +
      "Shares pay 1.000 test-dollar if their corner (Red = fighter A, Blue = fighter B) wins. Each match has two books: the Ringside book, priced inside the 100 ms tick " +
      "and rejecting orders more than 2 ticks stale, and a TV-delay control book fed state from delay_ms ago. All tools are read-only; no wallet or key is needed.",
  },
);

server.registerTool(
  "list_matches",
  {
    title: "List matches",
    description: "Recent Ringside matches, newest first: id, fighters (Red/Blue), status, winner, final tick and fill counts on the Ringside and TV-delay books.",
    inputSchema: {
      limit: z.number().int().min(1).max(200).optional().describe("How many matches to return (default 20)."),
      status: z.enum(["live", "finished"]).optional().describe("Only live (lobby, live, sudden death) or only finished (closed, settled, draw) matches."),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ limit, status }: { limit?: number; status?: "live" | "finished" }) => {
    const n = limit ?? 20;
    const { data, source } = await api<MatchRow[]>(`/matches?limit=${status ? 200 : n}`);
    const rows = data
      .filter((m) => !status || (status === "live") === LIVE_STATUSES.has(m.status))
      .slice(0, n)
      .map((m) => ({
        match_id: String(m.match_id),
        red: fighters(m.fighters).red,
        blue: fighters(m.fighters).blue,
        status: STATUS[m.status] ?? m.status,
        winner: WINNER[m.winner] ?? m.winner,
        final_tick: m.tick,
        seconds: m.tick / 10,
        fills_ringside: m.books?.live?.n_trades ?? null,
        fills_tv_delay: m.books?.delayed?.n_trades ?? null,
        stale_rejected_ringside: m.books?.live?.n_rejected_stale ?? null,
        record_written_on_solana: m.record_written,
      }));
    const lines = rows.map((r) => `- ${r.match_id}: ${r.red} vs ${r.blue} · ${r.status} · winner ${r.winner} · tick ${r.final_tick}` + (r.fills_ringside != null ? ` · ${r.fills_ringside} fills` : ""));
    return out(`${rows.length} match(es) from the ${source}${rows.length ? ":" : "."}\n${lines.join("\n")}\n(Fill counts are null when the book snapshot was not kept for that match.)`, { source, matches: rows });
  }),
);

server.registerTool(
  "get_match",
  {
    title: "Get match state and books",
    description: "Latest state of one match and both of its books (the live Ringside book and the delayed TV book): fair price, bid/ask per corner in dollars, trades, volume, stale rejections, inventory and exposure.",
    inputSchema: { match_id: z.string().regex(/^\d+$/).describe("Numeric match id, e.g. from list_matches.") },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ match_id }: { match_id: string }) => {
    const { data: s, source } = await api<StateResp>(`/matches/${match_id}/state`);
    const m = s.match;
    const live = book(s.live), delayed = book(s.delayed);
    const data = {
      source,
      match_id: String(m.match_id),
      match_account: s.match_key,
      status: STATUS[m.status] ?? m.status,
      winner: WINNER[m.winner] ?? m.winner,
      tick: m.tick,
      tick_ms: m.tick_ms,
      ...fighters(m.fighters),
      stake_usd: usd(m.stake),
      state_hash: m.state_hash,
      start_unix: m.start_unix,
      end_unix: m.end_unix,
      finalized_on_solana: !!m.finalized,
      books: { ringside: live, tv_delay: delayed },
      markets: { ringside: m.market_live, tv_delay: m.market_delayed },
      links: { match_page: `${SITE}/m/${m.match_id}`, replay_page: `${SITE}/replay/${m.match_id}`, match_account: explorer.teeAddress(s.match_key) },
    };
    const b = s.live;
    const summary = [
      `Match ${m.match_id}: ${data.red} vs ${data.blue} · ${data.status} · winner ${data.winner} · tick ${m.tick} (${source}).`,
      b ? `Ringside book: P(Red) ${pct(b.fair_p)}, Red ${usd(b.bid_a)}/${usd(b.ask_a)}, Blue ${usd(b.bid_b)}/${usd(b.ask_b)}, ${b.n_trades} trades, ${b.n_rejected_stale} stale orders rejected.` : "Ringside book: not available.",
      s.delayed ? `TV-delay book (${s.delayed.delay_ms} ms behind): P(Red) ${pct(s.delayed.fair_p)}, ${s.delayed.n_trades} trades, ${s.delayed.n_rejected_stale} stale rejections.` : "TV-delay book: not available.",
    ].join("\n");
    return out(summary, data);
  }),
);

server.registerTool(
  "get_odds_history",
  {
    title: "Odds history",
    description: "P(Red wins) by tick for one match, from the replay record (the fair price the Ringside book was quoted around), downsampled.",
    inputSchema: {
      match_id: z.string().regex(/^\d+$/).describe("Numeric match id."),
      every: z.number().int().min(1).max(1000).optional().describe("Keep one point every N ticks (default: about 60 points over the match). The last tick is always kept."),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ match_id, every }: { match_id: string; every?: number }) => {
    const { data: r, source } = await api<Replay>(`/matches/${match_id}/replay`);
    if (!r.ticks.length) return out(`No ticks recorded for match ${match_id}.`, { source, points: [] });
    const step = every ?? Math.max(1, Math.ceil(r.ticks.length / 60));
    const pts = r.ticks.filter((_, i) => i % step === 0 || i === r.ticks.length - 1)
      .map((t) => ({ tick: t.tick, seconds: +(t.tick * r.tick_ms / 1000).toFixed(1), p_red: +t.fair_p.toFixed(4) }));
    const ps = r.ticks.map((t) => t.fair_p);
    const data = { source, match_id, tick_ms: r.tick_ms, ticks_recorded: r.ticks.length, every: step, min_p_red: Math.min(...ps), max_p_red: Math.max(...ps), final_p_red: ps[ps.length - 1], points: pts };
    const spark = pts.map((p) => " ▁▂▃▄▅▆▇█"[Math.min(8, Math.round(p.p_red * 8))]).join("");
    return out(`P(Red wins) for match ${match_id}, ${pts.length} points (every ${step} ticks, ${source}). Range ${pct(data.min_p_red)}–${pct(data.max_p_red)}, final ${pct(data.final_p_red)}.\n${spark}`, data);
  }),
);

// ---- verification ------------------------------------------------------------------------------

type Sim = {
  newState(dt_ms: number, seed: Uint8Array): Uint8Array;
  replay(initial: Uint8Array, inputs: Uint16Array, seeds: Uint8Array): Uint8Array;
};
let sim: Sim | null | undefined;
function loadSim(): Sim | null {
  if (sim !== undefined) return sim;
  try {
    sim = createRequire(import.meta.url)("./wasm/ringside_wasm.js") as Sim;
  } catch {
    sim = null;
  }
  return sim;
}
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

server.registerTool(
  "verify_match",
  {
    title: "Verify a match",
    description:
      "Independently checks a match's record: re-runs the fight from its recorded inputs and VRF seeds with the same Rust simulation compiled to WASM (bundled), recomputes the sha256 state-hash chain and compares every link; " +
      "also checks tick continuity, the VRF seeds and their callback signatures, and that the last hash matches the match account. Returns what was checked, what could not be, and explorer links.",
    inputSchema: { match_id: z.string().regex(/^\d+$/).describe("Numeric match id.") },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ match_id }: { match_id: string }) => {
    const [{ data: r, source }, st] = await Promise.all([
      api<Replay>(`/matches/${match_id}/replay`),
      api<StateResp>(`/matches/${match_id}/state`).then((x) => x.data).catch(() => null),
    ]);
    const checks: { check: string; ok: boolean | null; detail: string }[] = [];
    const ticks = r.ticks;
    checks.push({ check: "record complete", ok: r.complete ? true : null, detail: r.complete ? "the indexer has every tick of this match" : "the indexer marks this record incomplete (some ticks were not captured)" });

    // Tick continuity.
    const gaps: [number, number][] = [];
    let prev = 0;
    for (const t of ticks) {
      if (t.tick !== prev + 1) gaps.push([prev + 1, t.tick - 1]);
      prev = t.tick;
    }
    const lastTick = ticks.at(-1)?.tick ?? 0;
    const firstGap = gaps.length ? gaps[0][0] : lastTick + 1;
    checks.push({
      check: "tick continuity",
      ok: gaps.length === 0 && ticks.length > 0 ? true : null,
      detail: gaps.length === 0 ? `${ticks.length} ticks, 1..${lastTick} with no gaps` : `${ticks.length} ticks recorded up to ${lastTick}; missing ${gaps.length} range(s): ${gaps.slice(0, 5).map(([a, b]) => (a === b ? a : `${a}-${b}`)).join(", ")}${gaps.length > 5 ? ", …" : ""}`,
    });
    const badHash = ticks.filter((t) => !/^[0-9a-f]{64}$/.test(t.hash)).length;
    const uniq = new Set(ticks.map((t) => t.hash)).size;
    checks.push({ check: "hash format", ok: badHash === 0 && uniq === ticks.length, detail: `${ticks.length - badHash} well-formed 32-byte hashes, ${uniq} distinct` });

    // VRF seeds.
    const waves = r.seeds.map((s) => s.wave);
    const wavesOk = waves.every((w, i) => w === i);
    const signed = r.seeds.filter((s) => s.sig).length;
    const seedsOk = r.seeds.every((s) => /^[0-9a-f]{64}$/.test(s.seed));
    checks.push({ check: "VRF seeds", ok: r.seeds.length > 0 && wavesOk && seedsOk, detail: `${r.seeds.length} wave seeds (waves ${waves.join(",") || "none"}), applied at ticks ${r.seeds.map((s) => s.apply_at_tick).join(",") || "-"}; ${signed} with a VRF callback transaction signature` });

    // Re-simulation.
    const w = loadSim();
    let resim: { ticks_compared: number; matched: number; first_mismatch_tick: number | null } | null = null;
    if (!w) {
      checks.push({ check: "re-simulation (WASM)", ok: null, detail: "the bundled WASM simulation could not be loaded, so the chain was not recomputed" });
    } else if (!ticks.length) {
      checks.push({ check: "re-simulation (WASM)", ok: null, detail: "no ticks to replay" });
    } else {
      // Inputs for ticks before the first gap are known; after a gap the state cannot be rebuilt.
      const prefix = ticks.filter((t) => t.tick < firstGap);
      const inputs = Uint16Array.from(prefix.flatMap((t) => t.inputs));
      const seeds = new Uint8Array(r.seeds.length * 36);
      r.seeds.forEach((s, i) => {
        new DataView(seeds.buffer).setUint32(i * 36, s.apply_at_tick, true);
        seeds.set(Buffer.from(s.seed, "hex"), i * 36 + 4);
      });
      const chain = w.replay(w.newState(r.tick_ms, new Uint8Array(32)), inputs, seeds);
      let matched = 0, mismatch: number | null = null;
      for (let i = 0; i < prefix.length; i++) {
        if (hex(chain.subarray(i * 32, i * 32 + 32)) === prefix[i].hash) matched++;
        else { mismatch = prefix[i].tick; break; }
      }
      resim = { ticks_compared: prefix.length, matched, first_mismatch_tick: mismatch };
      const full = gaps.length === 0 && r.complete;
      checks.push({
        check: "re-simulation (WASM)",
        ok: mismatch === null,
        detail: mismatch !== null
          ? `recomputed chain diverges from the record at tick ${mismatch} (${matched} links matched before it)`
          : full
            ? `re-ran all ${prefix.length} ticks from inputs and VRF seeds: every hash-chain link matches`
            : `re-ran ticks 1..${prefix.length} (up to the first missing tick): all ${matched} links match; ticks after the gap cannot be re-simulated without their inputs`,
      });
    }

    // Final hash against the match account.
    if (st) {
      const okHash = ticks.at(-1)?.hash === st.match.state_hash;
      checks.push({ check: "final hash = match account state_hash", ok: okHash, detail: `account tick ${st.match.tick}, state_hash ${st.match.state_hash.slice(0, 16)}…; last recorded tick ${lastTick}` });
    } else {
      checks.push({ check: "final hash = match account state_hash", ok: null, detail: "match state not available" });
    }

    const ok = checks.every((c) => c.ok !== false);
    const fully = ok && checks.every((c) => c.ok === true);
    const verdict = fully ? "VERIFIED: the whole match re-simulates to the recorded hash chain" : ok ? "PARTIALLY VERIFIED: every check that could run matches, but the record has gaps (see partial checks)" : "FAILED: at least one check did not match";
    const lnk = {
      replay_page: `${SITE}/replay/${match_id}`,
      match_account: explorer.teeAddress(r.match_key),
      match_account_devnet: explorer.devnetAddress(r.match_key),
      program: explorer.devnetAddress(PROGRAM_ID),
      settle_tx: r.settle_sig ? explorer.teeTx(r.settle_sig) : null,
      vrf_callbacks: r.seeds.filter((s) => s.sig).map((s) => ({ wave: s.wave, tx: explorer.teeTx(s.sig!) })),
      markets: st ? { ringside: explorer.teeAddress(st.match.market_live), tv_delay: explorer.teeAddress(st.match.market_delayed) } : null,
    };
    const data = {
      source, match_id, verdict, checks, resimulation: resim,
      onchain_hashes: { final_state_hash: st?.match.state_hash ?? ticks.at(-1)?.hash ?? null, final_tick: st?.match.tick ?? lastTick, first_tick_hash: ticks[0]?.hash ?? null, last_recorded_tick_hash: ticks.at(-1)?.hash ?? null },
      links: lnk,
      method: "state_hash[t] = sha256(state_hash[t-1] ‖ t as u64 LE ‖ canonical state bytes); the genesis state is newState(tick_ms, zero seed) and each VRF seed is written into the state at its apply_at_tick.",
    };
    const summary = `${verdict} (match ${match_id}, ${source}).\n` + checks.map((c) => `- [${c.ok === true ? "ok" : c.ok === false ? "FAIL" : "partial"}] ${c.check}: ${c.detail}`).join("\n");
    return out(summary, data);
  }),
);

// ---- courtsiding, stats ------------------------------------------------------------------------

server.registerTool(
  "courtsiding_report",
  {
    title: "Courtsiding report",
    description: "Evidence that the freshness window stops courtsiding: for one match, stale orders rejected vs stale fills accepted on the Ringside book and on the TV-delay book; plus the evaluation-wide result (E1) per delay.",
    inputSchema: { match_id: z.string().regex(/^\d+$/).optional().describe("Optional match id; omit for the evaluation-wide numbers only.") },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ match_id }: { match_id?: string }) => {
    const [{ data: res }, judge] = await Promise.all([
      results(),
      match_id ? api<Judge>(`/judge/${match_id}`) : Promise.resolve(null),
    ]);
    const e1 = res.e1 ?? {};
    const h = res.headline ?? {};
    const global = {
      heldout: e1.heldout,
      n_matches: e1.n_matches,
      ringside: e1.ringside,
      tv_delay_by_delay: (e1.delays ?? []).map((d: Record<string, unknown>) => ({ delay_ms: d.delay_ms, n_matches: d.n_matches, courtsider_fills: d.fills, stale_fills_accepted: d.stale_fills_accepted, courtsider_pnl_per_match: d.pnl_mean, pnl_ci95: d.pnl_ci95 })),
      headline: h,
    };
    const lines: string[] = [];
    if (judge) {
      const j = judge.data;
      lines.push(
        `Match ${match_id} (${judge.source}):`,
        `- Ringside book: ${j.ringside.stale_rejections} stale orders rejected, ${j.ringside.stale_fills_accepted} stale fills accepted, ${j.ringside.fills} courtsider fills.`,
        `- TV-delay book: ${j.tv_delay.stale_rejections} stale orders rejected, ${j.tv_delay.stale_fills_accepted} stale fills accepted, ${j.tv_delay.fills} courtsider fills.`,
      );
    }
    lines.push(
      `Evaluation E1 (${e1.n_matches ?? "?"} held-out devnet matches): at a ${h.delay_ms} ms TV delay the courtsider made ${h.courtsider_pnl_per_match_tv?.toFixed?.(2)} per match on the delayed book with ${h.stale_fills_accepted_tv} stale fills accepted; ` +
        `on Ringside ${h.courtsider_pnl_per_match_ringside} per match, ${h.stale_fills_accepted_ringside} stale fills accepted and ${h.stale_rejections_ringside} stale orders rejected.`,
    );
    const data = {
      match: judge ? { match_id, source: judge.source, ringside: judge.data.ringside, tv_delay: judge.data.tv_delay, reject_tx: judge.data.ringside.reject_sig ? explorer.teeTx(judge.data.ringside.reject_sig) : null } : null,
      evaluation_e1: global,
    };
    return out(lines.join("\n"), data);
  }),
);

server.registerTool(
  "get_stats",
  {
    title: "Ringside stats",
    description: "Indexer counts (matches, ticks, trades, rejections), measured tick cadence and latencies, and the evaluation headline numbers (courtsiding, model quality, load, privacy, replay verification) read from results.json.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async () => {
    const [st, rs] = await Promise.all([api<Stats>("/stats").catch((e) => ({ error: String(e) }) as const), results()]);
    const r = rs.data;
    const e2 = r.e2?.models ?? {};
    const e5 = r.e5 ?? {};
    const sum = (o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
    const privacy = { denied: sum(e5.denied), attempts: sum(e5.attempts), by_kind: e5.denied, owner_reads_ok: e5.owner_control_readable, readable_after_reveal: e5.after_reveal_readable };
    const data = {
      indexer: "error" in st ? { error: st.error } : { source: st.source, counts: st.data.counts, tick_cadence_ms: st.data.tick_cadence_ms, quote_age_at_fill_ms: st.data.quote_age_at_fill_ms, latency_ms: st.data.latency },
      evaluation: {
        results_url: rs.url,
        generated_at: r.generated_at,
        network: r.network,
        program_id: r.program_id,
        e1_courtsiding: r.headline,
        e2_model: { heldout_rows: r.e2?.n_test_rows, onchain_integer_brier: e2.logistic_onchain_integer?.brier, teacher_brier: e2.lightgbm_float?.brier, coin_flip_brier: e2.coin_flip?.brier, onchain_integer_ece: e2.logistic_onchain_integer?.ece },
        e3_tick_cadence_ms: r.e3?.tick_cadence_ms,
        e4_load: r.e4 ? { bots: r.e4.bots, trades_attempted: r.e4.trades_attempted, success_rate: r.e4.success_rate, trade_latency_ms: r.e4.latency_ms, compute_units: r.e4.cu, max_exposure_usd: r.e4.max_exposure_usdc, cap_usd: r.e4.cap_usdc } : null,
        e5_privacy: privacy,
        e6_replays: r.e6 ? { verified_wasm: r.e6.verified_wasm, verified_python: r.e6.verified_python, of: r.e6.k, ticks_checked: r.e6.ticks_checked, incomplete_excluded: r.e6.incomplete_excluded } : null,
        e7_fighter: r.e7,
        negative_results: r.negative,
      },
    };
    const c = "error" in st ? null : st.data;
    const tc = r.e3?.tick_cadence_ms ?? c?.tick_cadence_ms;
    const lines = [
      c && !("error" in st) ? `Indexer (${st.source}): ${c.counts.matches} matches, ${c.counts.ticks} ticks, ${c.counts.trades} trades, ${c.counts.rejections} rejections.` : `Indexer: unavailable (${(st as { error: string }).error}).`,
      tc ? `Tick cadence: p50 ${tc.p50} ms, p95 ${tc.p95} ms, p99 ${tc.p99} ms (n=${tc.n}).` : "",
      r.headline ? `Courtsiding (E1, ${r.headline.delay_ms} ms delay): ${r.headline.stale_fills_accepted_tv} stale fills on the TV book vs ${r.headline.stale_fills_accepted_ringside} on Ringside; ${r.headline.stale_rejections_ringside} stale orders rejected.` : "",
      `Privacy (E5): ${privacy.denied}/${privacy.attempts} unauthorized position reads denied.`,
      r.e6 ? `Replays (E6): ${r.e6.verified_wasm}/${r.e6.k} complete matches verified in WASM, ${r.e6.verified_python}/${r.e6.k} in Python, ${r.e6.ticks_checked} ticks.` : "",
      e2.logistic_onchain_integer ? `Pricing model (E2): onchain integer Brier ${e2.logistic_onchain_integer.brier.toFixed(4)} vs coin flip ${e2.coin_flip?.brier}.` : "",
      r.e4 ? `Load (E4): ${r.e4.bots} bots, ${(r.e4.success_rate * 100).toFixed(1)}% of ${r.e4.trades_attempted} trades landed, p50 ${r.e4.latency_ms?.p50?.toFixed?.(0)} ms.` : "",
      `Results generated ${r.generated_at} on ${r.network}.`,
    ].filter(Boolean);
    return out(lines.join("\n"), data);
  }),
);

server.registerTool(
  "explain",
  {
    title: "Explain a Ringside concept",
    description: "Short, accurate explanation of how Ringside works: the tick, the freshness window, sealed positions (privacy), settlement and the onchain record, VRF randomness, the two books, pricing, or the architecture.",
    inputSchema: { topic: z.enum(Object.keys(TOPICS) as [string, ...string[]]).describe("Which concept to explain.") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ topic }: { topic: string }) => ({ content: [{ type: "text" as const, text: `${TOPICS[topic]}\n\nMore: ${SITE}/docs#${topic === "vrf" ? "randomness" : topic}` }] }),
);

// ---- resources ---------------------------------------------------------------------------------

server.registerResource(
  "results",
  "ringside://results",
  { title: "Ringside evaluation results", description: "The full results.json from the Ringside evaluation (E1–E7, headline and negative results).", mimeType: "application/json" },
  async (uri) => {
    const r = await results();
    return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(r.data, null, 2) }] };
  },
);

server.registerResource(
  "program",
  "ringside://program",
  { title: "Ringside program", description: "The Ringside program id and devnet explorer links (program, config, model, a match, its record and example transactions).", mimeType: "application/json" },
  async (uri) => {
    const l = await links();
    const data = { program_id: PROGRAM_ID, network: "Solana devnet + MagicBlock devnet-tee", tee_rpc: "https://devnet-tee.magicblock.app", links: l };
    return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(`ringside-mcp ${VERSION} ready (data: ${INDEXER ? `${INDEXER}, fallback ` : ""}${SITE}/snap)\n`);
