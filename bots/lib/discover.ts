// Finds matches on the ER and reads their books.
import type { Connection, PublicKey } from "@solana/web3.js";
import { decodeMarket, decodeMatch, marketPda, MODE_DELAYED, MODE_LIVE, PROGRAM_ID, type MarketAccount, type MatchAccount } from "@ringside/client";

export const MATCH_SIZE = 8 + 1224;

export interface Listed {
  key: PublicKey;
  m: MatchAccount;
}

export async function listMatches(er: Connection, statuses: number[] = [0, 1, 2]): Promise<Listed[]> {
  const accs = await er.getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: MATCH_SIZE }] });
  return accs.map((a) => ({ key: a.pubkey, m: decodeMatch(a.account.data) })).filter((x) => statuses.includes(x.m.status));
}

export async function books(er: Connection, id: bigint): Promise<{ live: MarketAccount; delayed: MarketAccount } | null> {
  const [l, d] = await er.getMultipleAccountsInfo([marketPda(id, MODE_LIVE), marketPda(id, MODE_DELAYED)]);
  if (!l || !d) return null;
  return { live: decodeMarket(l.data), delayed: decodeMarket(d.data) };
}
