export const INDEXER = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://127.0.0.1:8787";
export const CLUSTER = process.env.NEXT_PUBLIC_CLUSTER ?? "devnet";
export const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://rpc.magicblock.app/devnet";
export const ER_RPC = process.env.NEXT_PUBLIC_ER_RPC ?? "https://devnet-tee.magicblock.app";
export const MINT_LABEL = process.env.NEXT_PUBLIC_MINT_LABEL ?? "test-dollar";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ringside.vercel.app";

export const explorerTx = (sig: string, er = false) =>
  er
    ? `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(ER_RPC)}`
    : `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`;
export const explorerAddr = (a: string) => `https://explorer.solana.com/address/${a}?cluster=${CLUSTER}`;
export const MATCHMAKER = process.env.NEXT_PUBLIC_MATCHMAKER_URL ?? "http://127.0.0.1:8788";
