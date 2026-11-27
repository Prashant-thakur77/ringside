"use client";
// Live data from the indexer: REST for snapshots, SSE for every tick, trade and rejection.
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { INDEXER } from "./config";

export interface Book {
  match_key: string; match_id: number; fair_p: number; last_priced_tick: number; mid: number;
  bid_a: number; ask_a: number; bid_b: number; ask_b: number; spread: number; inv_a: number; inv_b: number;
  house_cash: number; max_exposure_seen: number; cap: number; volume: number; n_trades: number;
  n_rejected_stale: number; n_rejected_fighter: number; n_rejected_other: number; frozen_until_tick: number;
  delay_ms: number; mode: number; status: number; winner: number;
}
export interface MatchV {
  match_id: number; stake: number; start_unix: number; end_unix: number; fighters: [string, string];
  market_live: string; market_delayed: string; state_hash: string; status: number; winner: number; finalized: number;
  tick: number; tick_ms: number; sim_hex: string;
}
export interface LiveState { match: MatchV; live: Book | null; delayed: Book | null; seen_ms: number }
export interface FeedEvent { type: string; [k: string]: unknown }

interface Store {
  states: Record<string, LiveState>; // by match_key
  events: FeedEvent[];
  lastTickAt: number;
  push: (e: FeedEvent) => void;
}

export const useLive = create<Store>((set) => ({
  states: {},
  events: [],
  lastTickAt: 0,
  push: (e) =>
    set((s) => {
      if (e.type === "state") {
        const st = e as unknown as LiveState & { match_key: string };
        return { states: { ...s.states, [st.match_key]: { match: st.match, live: st.live, delayed: st.delayed, seen_ms: Date.now() } }, lastTickAt: Date.now() };
      }
      return { events: [...s.events.slice(-400), e] };
    }),
}));

let started = false;
export function useFeed() {
  const push = useLive((s) => s.push);
  useEffect(() => {
    if (started) return;
    started = true;
    let es: EventSource | null = null;
    const open = () => {
      es = new EventSource(`${INDEXER}/events`);
      es.onmessage = (m) => {
        try {
          push(JSON.parse(m.data));
        } catch {}
      };
      es.onerror = () => {
        es?.close();
        setTimeout(open, 2000);
      };
    };
    open();
  }, [push]);
}

/** True once a request has been served from the recorded devnet snapshot instead of the live indexer. */
export const useSnapshot = create<{ on: boolean }>(() => ({ on: false }));
let liveDownUntil = 0;

async function fromSnapshot<T>(path: string): Promise<T> {
  const r = await fetch(`/snap${path.split("?")[0]}.json`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  if (!useSnapshot.getState().on) useSnapshot.setState({ on: true });
  return r.json();
}

/** Live indexer first; if it can't be reached, the finished devnet matches baked into the site at deploy time. */
export async function api<T>(path: string): Promise<T> {
  if (Date.now() >= liveDownUntil) {
    try {
      const r = await fetch(`${INDEXER}${path}`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        if (useSnapshot.getState().on) useSnapshot.setState({ on: false });
        return r.json();
      }
      if (r.status === 404) throw new Error(`${path}: 404`);
    } catch (e) {
      if (String(e).includes(": 404")) return fromSnapshot<T>(path).catch(() => { throw e; });
    }
    liveDownUntil = Date.now() + 15_000; // don't wait on a dead indexer for every poll
  }
  return fromSnapshot<T>(path);
}

/** Re-renders every `ms` (for "x ms ago" freshness stamps). */
export function useNow(ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  const t = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    t.current = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t.current!);
  }, [ms]);
  return now;
}

export const STATUS = ["Lobby", "Live", "Sudden death", "Closed", "Settled", "Draw"] as const;
export const price = (micro: number) => (micro / 1e6).toFixed(3);
export const pct = (p: number) => `${Math.round(p * 100)}%`;
