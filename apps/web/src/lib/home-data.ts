"use client";
// Home page data: results.json (every evaluation number) and one real devnet match snapshot.
import { useQuery } from "@tanstack/react-query";

export interface GapTick { tick: number; p: number; hash: string; flags: number }
export interface Gap {
  match_id: string; match_key: string; ticks_total: number; seeds: number; hit_tick: number;
  window: GapTick[]; tape: { tick: number; hash: string }[]; walk: number[];
}
// Loose shape: the page reads only the fields it shows and hides a block when one is missing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Results = any;

export const useResults = () =>
  useQuery({ queryKey: ["results"], queryFn: async () => (await fetch("/results.json", { cache: "no-store" })).json() as Promise<Results>, staleTime: 60_000 });
export const useGap = () =>
  useQuery({ queryKey: ["gap"], queryFn: async () => (await fetch("/home/gap.json")).json() as Promise<Gap>, staleTime: Infinity });

export const STALE_TICKS = 2; // Config.stale_ticks_max on devnet
export const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
