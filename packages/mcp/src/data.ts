// Read-only data access: the live indexer when RINGSIDE_INDEXER_URL is set, else the snapshot
// the public site serves, plus the evaluation results and the program's devnet links.

export const SITE = (process.env.RINGSIDE_SITE_URL ?? "https://ringside.prashantthakur.dev").replace(/\/+$/, "");
export const INDEXER = process.env.RINGSIDE_INDEXER_URL?.replace(/\/+$/, "") || null;
const RAW = "https://raw.githubusercontent.com/Prashant-thakur77/ringside/main";
const LIVE_TIMEOUT_MS = 4000;
const SNAP_TIMEOUT_MS = 15000;

export const PROGRAM_ID = "4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej";
export const TEE_RPC = "https://devnet-tee.magicblock.app";
const TEE_Q = `cluster=custom&customUrl=${encodeURIComponent(TEE_RPC)}`;
export const explorer = {
  devnetAddress: (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`,
  teeAddress: (a: string) => `https://explorer.solana.com/address/${a}?${TEE_Q}`,
  teeTx: (s: string) => `https://explorer.solana.com/tx/${s}?${TEE_Q}`,
  devnetTx: (s: string) => `https://explorer.solana.com/tx/${s}?cluster=devnet`,
};

export type Source = "live-indexer" | "site-snapshot";

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/** Fetches an indexer API path (e.g. "/matches?limit=20"): live first (4 s timeout), then the snapshot. */
export async function api<T>(path: string): Promise<{ data: T; source: Source }> {
  const errors: string[] = [];
  if (INDEXER) {
    try {
      return { data: (await getJson(INDEXER + path, LIVE_TIMEOUT_MS)) as T, source: "live-indexer" };
    } catch (e) {
      errors.push(`live: ${(e as Error).message}`);
    }
  }
  const snap = `${SITE}/snap${path.split("?")[0]}.json`;
  try {
    return { data: (await getJson(snap, SNAP_TIMEOUT_MS)) as T, source: "site-snapshot" };
  } catch (e) {
    errors.push(`snapshot: ${(e as Error).message}`);
  }
  throw new Error(`Could not fetch ${path} (${errors.join("; ")})`);
}

const cache = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, ttlMs: number, f: () => Promise<T>): Promise<T> {
  const c = cache.get(key);
  if (c && Date.now() - c.at < ttlMs) return c.v as T;
  const v = await f();
  cache.set(key, { at: Date.now(), v });
  return v;
}

/** The evaluation results (results.json): served by the site, else from the repository. */
export function results(): Promise<{ data: Results; url: string }> {
  return cached("results", 300_000, async () => {
    const urls = [`${SITE}/results.json`, `${RAW}/eval/results/results.json`];
    const errors: string[] = [];
    for (const url of urls) {
      try {
        return { data: (await getJson(url, SNAP_TIMEOUT_MS)) as Results, url };
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    throw new Error(`Could not fetch results.json (${errors.join("; ")})`);
  });
}

// Copy of docs/links.json at release time; refreshed from the repository when reachable.
const LINKS_FALLBACK: Record<string, string> = {
  program: "https://explorer.solana.com/address/4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej?cluster=devnet",
  config: "https://explorer.solana.com/address/Gn2PTrRkfkFpvy3oU7FNMwSsPvaQ9fg61SoKeKMR4UqK?cluster=devnet",
  model: "https://explorer.solana.com/address/ATTNMp41xs7zeUxSdFMD3iBBhMp2QM8KMWxhoebZuEaF?cluster=devnet",
  match: "https://explorer.solana.com/address/6fgVTgmhsSPHPeGRLUCqFHkMior2nUaPVKsxGzKmBojn?cluster=devnet",
  match_record: "https://explorer.solana.com/address/A7x8dRinneeA9CCn41KvAFdPb5D5jub5dwiKtyWFEmrW?cluster=devnet",
  commit: "https://explorer.solana.com/tx/3Uk5DY4rXV9fWrqgmnc9QyyiMFGK5BarrkGUCrzxvxFQSsBa5cba54HHb8msKnb2WSozXdapf9CeY9FhDd7UhdKx?cluster=devnet",
  trade_fill: "https://explorer.solana.com/tx/5Ufxacedbr4RaSY6MpCbJF4A7equfFJ1njdZtYnsytic9cipjy9oYmyrbTobx6oqcmpjkyD8EMwqnQQ52mc7G3WR?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app",
  stale_reject: "https://explorer.solana.com/tx/591tfysPXLzBBhrxirr7dr19rJw4T6iNAmap7ig9tbbTCzhMSwvDNFxFqn3Hy3ezW4MMSsCR9i49jqZtVtR7QN2Y?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app",
  fighter_reject: "https://explorer.solana.com/tx/2Bw1FoM5JZQAsaDYzqQGknUUSkx58BQRLkWJRUeify2D1F3DHZM78TXMckcwKyrYB91ZYSQt3YqHrDBoiJGZjvNT?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app",
  session_trade: "https://explorer.solana.com/tx/3Lq7jtaMKXbHs6UA3whd5jHkiHHvD4MR1aFDFLPVXJfjGmERH1azhnL7UP1JRAC1FymCJLi9FY4qSZckLnkj8dom?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app",
  vrf_callback: "https://explorer.solana.com/tx/WEuv5cCWGbG5bgwQrFU8Yu8UjX77vXc3cS8NDmimyPn7j61J1W7ibNXuKxq5GZQLRTqDB5iTsKUfDoqvGqup9A5?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app",
  reveal: "https://explorer.solana.com/tx/2tLKFwJ1tLYGxAYFioZsZ9kDJok5QDDvVJsfqnkqsfmXcWra8MkWq9KM1ds9rKY5ELYrcJrkR2WuXtGjN7cehMft?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app",
  finalize: "https://explorer.solana.com/tx/5FdsU4Q6oK4yo9YTYnPBm265FoXdrH7yLEhhcAKyvi1MUMqr4We5ZEZujRXsPvPZcbHGeFwF8gRrVGmfgfSKxTEU?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app",
  e2e_match_id: "1795753242111",
  e2e_env: "devnet",
  repo: "https://github.com/Prashant-thakur77/ringside",
  site: "https://ringside.prashantthakur.dev",
  docs: "https://ringside.prashantthakur.dev/docs",
};

export function links(): Promise<Record<string, string>> {
  return cached("links", 3_600_000, async () => {
    try {
      const l = (await getJson(`${RAW}/docs/links.json`, LIVE_TIMEOUT_MS)) as Record<string, string>;
      return { ...LINKS_FALLBACK, ...l };
    } catch {
      return LINKS_FALLBACK;
    }
  });
}

// ---- shapes served by the indexer -------------------------------------------------------------

export interface Book {
  match_id: number; match_key: string; mode: number; status: number; winner: number; delay_ms: number;
  fair_p: number; mid: number; bid_a: number; ask_a: number; bid_b: number; ask_b: number; spread: number;
  inv_a: number; inv_b: number; house_cash: number; volume: number; cap: number; max_exposure_seen: number;
  n_trades: number; n_rejected_stale: number; n_rejected_fighter: number; n_rejected_other: number;
  last_priced_tick: number; frozen_until_tick: number;
}
export interface MatchRow {
  match_id: string; match_key: string; status: number; winner: number; tick: number; stake: number;
  fighters: [string, string]; market_live: string; market_delayed: string; state_hash: string;
  start_unix: number; end_unix: number; record_written: boolean; books: { live: Book | null; delayed: Book | null } | null;
}
export interface MatchAccount {
  match_id: number; status: number; winner: number; tick: number; tick_ms: number; stake: number;
  fighters: [string, string]; market_live: string; market_delayed: string; state_hash: string;
  start_unix: number; end_unix: number; finalized: number;
}
export interface StateResp { match_key: string; match: MatchAccount; live: Book | null; delayed: Book | null }
export interface Tick { tick: number; hash: string; fair_p: number; inputs: [number, number]; flags: number; sig: string }
export interface Seed { wave: number; apply_at_tick: number; seed: string; sig: string | null }
export interface Trade { tick: number; seen_tick: number; mode: number; side: number; dir: number; qty: number; price: number; trader: string; sig: string }
export interface Replay { match_id: string; match_key: string; tick_ms: number; complete: boolean; settle_sig: string | null; ticks: Tick[]; seeds: Seed[]; trades: Trade[] }
export interface JudgeSide { fills: number; stale_fills_accepted: number; stale_rejections: number; reject_sig: string | null }
export interface Judge { ringside: JudgeSide; tv_delay: JudgeSide; books?: { live: Book | null; delayed: Book | null } }
export interface Stats {
  counts: Record<string, number>;
  tick_cadence_ms: { n: number; p50: number | null; p95: number | null; p99: number | null };
  quote_age_at_fill_ms?: { n: number; p50: number | null; p95: number | null };
  latency?: { kind: string; n: number; p50: number; p95: number }[];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Results = Record<string, any>;
