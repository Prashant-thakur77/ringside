import { PublicKey } from "@solana/web3.js";

export const env = (k: string, d: string): string => (typeof process !== "undefined" && process.env?.[k]) || d;

export const PROGRAM_ID = new PublicKey(env("RINGSIDE_PROGRAM_ID", "4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej"));
export const SOLANA_RPC = env("SOLANA_RPC", "https://api.devnet.solana.com");
export const TEE_RPC = env("TEE_RPC", "https://devnet-tee.magicblock.app");
export const TEE_VALIDATOR = new PublicKey(env("TEE_VALIDATOR", "MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo"));
export const MAGIC_ROUTER = env("MAGIC_ROUTER", "https://devnet-router.magicblock.app");
export const DELEGATION_PROGRAM = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
export const PERMISSION_PROGRAM = new PublicKey("ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1");
export const EPHEMERAL_SPL_PROGRAM = new PublicKey("SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2");
export const VRF_PROGRAM = new PublicKey("Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz");
export const VRF_EPHEMERAL_QUEUE = new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");
export const VRF_BASE_QUEUE = new PublicKey("Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh");
export const SESSION_KEYS_PROGRAM = new PublicKey("KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5");
export const MAGIC_PROGRAM = new PublicKey("Magic11111111111111111111111111111111111111");
export const MAGIC_CONTEXT = new PublicKey("MagicContext1111111111111111111111111111111");
export const EPHEMERAL_VAULT = new PublicKey("MagicVau1t999999999999999999999999999999999");
export const USDC_MINT = new PublicKey(env("USDC_MINT", "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"));

export const PAYOUT = 1_000_000n; // a winning share pays 1 USDC
export const TICK_MS = 100;
export const MATCH_MS = 90_000;

export const MODE_LIVE = 0;
export const MODE_DELAYED = 1;

export const STATUS = ["Lobby", "Live", "SuddenDeath", "Closed", "Settled", "Draw"] as const;
export const WINNER = ["—", "A", "B", "Draw"] as const;
