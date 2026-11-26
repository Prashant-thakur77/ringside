// TEE (Private Ephemeral Rollup) connection with token auth.
// Only the token string goes in the URL (?token=...). Passing the whole {token, expiresAt} object
// would produce "?token=[object Object]" and a 401.
import { Connection, PublicKey, type Commitment } from "@solana/web3.js";
import { getAuthToken, verifyTeeRpcIntegrity } from "@magicblock-labs/ephemeral-rollups-sdk";

export interface AuthToken {
  token: string;
  expiresAt: number;
}

export function teeUrlWithToken(rpcUrl: string, auth: AuthToken | string): string {
  const token = typeof auth === "string" ? auth : auth.token;
  if (typeof token !== "string" || token.length === 0) throw new Error("token must be a non-empty string");
  const u = new URL(rpcUrl);
  u.searchParams.set("token", token);
  return u.toString();
}

export function wsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, "ws");
}

/** Keeps a token-authenticated TEE connection fresh; refreshes `refreshMarginMs` before expiry. */
export class TeeSession {
  private auth: AuthToken | null = null;
  private conn: Connection | null = null;
  constructor(
    readonly rpcUrl: string,
    readonly publicKey: PublicKey,
    readonly signMessage: (m: Uint8Array) => Promise<Uint8Array>,
    readonly commitment: Commitment = "confirmed",
    readonly refreshMarginMs = 5 * 60_000,
    readonly verify = true,
  ) {}

  needsRefresh(now = Date.now()): boolean {
    return !this.auth || now >= this.auth.expiresAt - this.refreshMarginMs;
  }

  async connection(): Promise<Connection> {
    if (this.needsRefresh()) {
      if (this.verify && !this.auth) await verifyTeeRpcIntegrity(this.rpcUrl);
      this.auth = await getAuthToken(this.rpcUrl, this.publicKey, this.signMessage);
      const url = teeUrlWithToken(this.rpcUrl, this.auth);
      this.conn = new Connection(url, { commitment: this.commitment, wsEndpoint: wsUrl(url) });
    }
    return this.conn!;
  }

  token(): AuthToken | null {
    return this.auth;
  }
}
