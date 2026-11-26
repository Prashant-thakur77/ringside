// Runs one Ringside match end to end on the configured profile (local stack or devnet-tee).
import { createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { Keypair, PublicKey, type Connection } from "@solana/web3.js";
import { decodeMarket, decodeMatch, marketPda, matchPda, MODE_DELAYED, MODE_LIVE, positionPda, recordPda, type MatchAccount } from "@ringside/client";
import { type Env, errorCode, send, sleep, type Sent } from "@ringside/client/node";
import type { Brain } from "./brains.ts";
import { timed } from "./telemetry.ts";

export interface RunOptions {
  stake: bigint;
  delayMs: number;
  /** Use the ER crank (ScheduleTask). If it does not advance the match, fall back to the keeper. */
  crank: boolean;
  tickMs: number;
  onLog?: (line: string) => void;
  /** Called once the match is delegated and joinable (spectators can join positions here). */
  onCreated?: (id: bigint) => Promise<void> | void;
  /** Called on every observed tick with the decoded match account. */
  onTick?: (m: MatchAccount) => void;
}

export interface RunResult {
  id: bigint;
  winner: number;
  ticks: number;
  crank: "crank" | "keeper";
  sigs: Record<string, string>;
  recordWritten: boolean;
  positions: PublicKey[];
}

const SIM_WAVE = 14;

export class MatchRunner {
  readonly sigs: Record<string, string> = {};
  private seq: [bigint, bigint] = [0n, 0n];
  private lastInput: [number, number] = [-1, -1];
  private mode: "crank" | "keeper" = "crank";

  constructor(
    readonly env: Env,
    readonly admin: Keypair,
    readonly keeper: Keypair,
    readonly fighters: [Keypair, Keypair | null],
    readonly brains: [Brain, Brain | null],
    readonly opts: RunOptions,
  ) {}

  private log(s: string) {
    (this.opts.onLog ?? console.log)(s);
  }

  async er(k: Keypair): Promise<Connection> {
    return this.env.er(k);
  }

  async create(id: bigint, opponent: PublicKey = PublicKey.default) {
    const { env, admin } = this;
    const game = matchPda(id);
    const r1 = await timed("create_match", { match: game.toBase58() }, async () =>
      send(env.base, [await env.ix.createMatch(admin.publicKey, id, this.opts.stake, opponent, this.opts.delayMs), createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, env.ata(game), game, env.p.mint)], [admin]),
    );
    this.sigs.create = r1.sig;
    const r2 = await timed("delegate_match", { match: game.toBase58() }, async () =>
      send(env.base, [await env.ix.delegateMatch(admin.publicKey, id, env.p.validator), await env.ix.delegateEscrow(admin.publicKey, id, env.p.validator)], [admin]),
    );
    this.sigs.delegate = r2.sig;
    const er = await this.er(admin);
    for (let i = 0; i < 60; i++) {
      const info = await er.getAccountInfo(game).catch(() => null);
      const esc = await er.getAccountInfo(env.ata(game)).catch(() => null);
      if (info && esc) return;
      await sleep(500);
    }
    throw new Error("match not visible on the ER after delegation");
  }

  async game(id: bigint): Promise<MatchAccount> {
    const info = await (await this.er(this.admin)).getAccountInfo(matchPda(id));
    if (!info) throw new Error("match missing on ER");
    return decodeMatch(info.data);
  }

  async join(id: bigint) {
    for (const [i, f] of this.fighters.entries()) {
      if (!f) continue; // human fighter joins from the web app
      const er = await this.er(f);
      const r = await timed("join_fight", { match: matchPda(id).toBase58() }, async () => send(er, [await this.env.ix.joinFight(f.publicKey, f.publicKey, id)], [f]));
      this.sigs[`join_${i ? "b" : "a"}`] = r.sig;
    }
  }

  private lastWaveRequest = new Map<number, number>();
  async requestWave(id: bigint, wave = -1) {
    const now = Date.now();
    if (now - (this.lastWaveRequest.get(wave) ?? 0) < 5000) return; // at most one attempt per wave per 5 s
    this.lastWaveRequest.set(wave, now);
    try {
      const er = await this.er(this.keeper);
      const r = await timed("request_wave", { match: matchPda(id).toBase58() }, async () => send(er, [await this.env.ix.requestWave(this.keeper.publicKey, id, this.env.p.vrfQueue)], [this.keeper]));
      this.sigs.vrf_request ??= r.sig;
      this.log(`vrf requested ${r.sig}`);
    } catch (e) {
      this.log(`vrf request failed: ${String((e as Error).message).split("\n")[0]}`);
    }
  }

  async scheduleCrank(id: bigint, game: MatchAccount) {
    const er = await this.er(this.keeper);
    const r = await send(er, [await this.env.ix.scheduleTick(this.keeper.publicKey, id, this.env.p.modelVersion, game.fighters, this.opts.tickMs, 1300)], [this.keeper]);
    this.sigs.schedule_tick = r.sig;
    this.log(`crank scheduled ${r.sig}`);
  }

  private async keeperTick(id: bigint) {
    const er = await this.er(this.keeper);
    try {
      await send(er, [await this.env.ix.tick(id, this.env.p.modelVersion)], [this.keeper], { skipPreflight: true });
    } catch (e) {
      const c = errorCode(e);
      if (c !== 6007) this.log(`keeper tick: ${String((e as Error).message).split("\n")[0]}`);
    }
  }

  private async sendInput(id: bigint, i: 0 | 1, bits: number) {
    if (bits === this.lastInput[i]) return;
    this.lastInput[i] = bits;
    this.seq[i] += 1n;
    const f = this.fighters[i];
    if (!f) return;
    const er = await this.er(f);
    const seq = this.seq[i];
    timed("submit_input", { match: matchPda(id).toBase58() }, async () => send(er, [await this.env.ix.submitInput(f.publicKey, f.publicKey, id, seq, bits)], [f], { skipPreflight: true })).catch((e) => {
      const c = errorCode(e);
      if (c !== 6006 && c !== 6004) this.log(`input ${i}: ${String((e as Error).message).split("\n")[0]}`);
    });
  }

  /** Plays the match until it closes. */
  async play(id: bigint): Promise<MatchAccount> {
    let g = await this.game(id);
    let lastTick = -1;
    let lastProgress = Date.now();
    const started = Date.now();
    let keeperTimer: NodeJS.Timeout | null = null;
    const startKeeper = () => {
      if (keeperTimer) return;
      this.mode = "keeper";
      this.log("switching to keeper ticks");
      keeperTimer = setInterval(() => void this.keeperTick(id), this.opts.tickMs);
    };
    if (!this.opts.crank) startKeeper();
    try {
      while (g.status === 1 || g.status === 2) {
        if (g.tick !== lastTick) {
          lastTick = g.tick;
          lastProgress = Date.now();
          this.opts.onTick?.(g);
          const wave = g.sim.readUInt16LE(SIM_WAVE);
          if (g.vrfRequestedWave !== wave && wave < 7) void this.requestWave(id, wave);
          // Decide every INPUT_EVERY ticks (inputs persist between ticks onchain).
          if (g.tick % Number(process.env.INPUT_EVERY ?? 1) !== 0) {
            await sleep(Math.max(20, this.opts.tickMs / 3));
            g = await this.game(id);
            continue;
          }
          const [ia, ib] = await Promise.all([this.brains[0].act(g.sim, 0), this.brains[1]?.act(g.sim, 1) ?? Promise.resolve(-1)]);
          void this.sendInput(id, 0, ia);
          if (ib >= 0) void this.sendInput(id, 1, ib);
        } else if (this.opts.crank && Date.now() - lastProgress > 2500 && !keeperTimer) {
          // Switch A: crank did not advance the match.
          startKeeper();
        }
        if (Date.now() - started > 200_000) throw new Error("match did not finish in 200 s");
        await sleep(Math.max(20, this.opts.tickMs / 3));
        g = await this.game(id);
      }
    } finally {
      if (keeperTimer) clearInterval(keeperTimer);
    }
    return g;
  }

  /** Spectator positions for this match: owners from the base-layer join transactions. */
  async positions(id: bigint): Promise<PublicKey[]> {
    const out: PublicKey[] = [];
    for (const mode of [MODE_LIVE, MODE_DELAYED]) {
      const market = marketPda(id, mode);
      const sigs = await this.env.base.getSignaturesForAddress(market, { limit: 200 }).catch(() => []);
      for (const s of sigs) {
        if (s.err) continue;
        const tx = await this.env.base.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
        const keys = tx?.transaction.message.getAccountKeys().staticAccountKeys ?? [];
        for (const k of keys) {
          for (const owner of keys) {
            if (positionPda(market, owner).equals(k) && !out.some((p) => p.equals(k))) out.push(k);
          }
        }
      }
    }
    return out;
  }

  async finish(id: bigint): Promise<RunResult> {
    const er = await this.er(this.admin);
    let g = await this.game(id);
    const positions = await this.positions(id);
    if (g.status === 3) {
      const r = await send(er, [await this.env.ix.settle(id, g.fighters, positions.slice(0, 4))], [this.admin], { cu: 1_000_000 });
      this.sigs.settle = r.sig;
    }
    g = await this.game(id);
    for (let i = 4; i < positions.length; i += 4) {
      this.sigs.reveal ??= (await send(er, [await this.env.ix.revealPositions(id, positions.slice(i, i + 4))], [this.admin], { cu: 1_000_000 })).sig;
    }
    for (const p of positions) {
      const info = await er.getAccountInfo(p);
      if (!info) continue;
      const owner = new PublicKey(info.data.subarray(8, 40));
      const market = new PublicKey(info.data.subarray(40, 72));
      const mode = decodeMarket((await er.getAccountInfo(market))!.data).mode;
      const r: Sent = await send(er, [await this.env.ix.claim(id, mode, owner)], [this.admin]).catch((e) => ({ sig: `err:${errorCode(e)}`, ms: 0 }));
      this.sigs.claim ??= r.sig;
    }
    const recordWritten = await this.finalizeWithRetry(id);
    return { id, winner: g.winner, ticks: g.tick, crank: this.mode, sigs: this.sigs, recordWritten, positions };
  }

  /** Magic Actions are not atomic with the commit: verify the MatchRecord landed, retry if not. */
  async finalizeWithRetry(id: bigint, attempts = Number(process.env.FINALIZE_ATTEMPTS ?? 3)): Promise<boolean> {
    const er = await this.er(this.admin);
    for (let a = 0; a < attempts; a++) {
      const r = await send(er, [await this.env.ix.finalize(this.admin.publicKey, id)], [this.admin]);
      // One intent per transaction so the commit signature can be traced.
      this.sigs.commit_match ??= (await send(er, [await this.env.ix.commitMatch(this.admin.publicKey, id)], [this.admin]).catch(() => ({ sig: "" }))).sig;
      this.sigs[a ? `finalize_retry_${a}` : "finalize"] = r.sig;
      for (let i = 0; i < Number(process.env.RECORD_WAIT_S ?? 40); i++) {
        const rec = await this.env.base.getAccountInfo(recordPda(id));
        if (rec && rec.data[8 + 32 + 32 + 8 * 9 + 1] === 1) return true;
        await sleep(1000);
      }
      this.log(`MatchRecord not written yet; retrying finalize (${a + 1})`);
    }
    return false;
  }

  /** Waits until the human opponent has joined (status Live) or gives up. */
  async waitLive(id: bigint, timeoutMs = 180_000) {
    const t0 = Date.now();
    for (;;) {
      const g = await this.game(id);
      if (g.status !== 0) return g;
      if (Date.now() - t0 > timeoutMs) throw new Error("opponent did not join in time");
      await sleep(500);
    }
  }

  async run(id = BigInt(Date.now()), opponent?: PublicKey): Promise<RunResult> {
    await this.create(id, opponent);
    this.log(`match ${id} created and delegated`);
    await this.opts.onCreated?.(id);
    await this.join(id);
    if (!this.fighters[1]) await this.waitLive(id);
    let g = await this.game(id);
    this.log(`match ${id} live (status ${g.status})`);
    void this.requestWave(id);
    if (this.opts.crank) {
      try {
        await this.scheduleCrank(id, g);
      } catch (e) {
        this.log(`schedule_tick failed: ${String((e as Error).message).split("\n")[0]}`);
      }
    }
    g = await this.play(id);
    this.log(`match ${id} over: winner ${g.winner} at tick ${g.tick}`);
    return this.finish(id);
  }
}
