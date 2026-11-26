// Matchmaker for human fighters (HTTP :8788):
//   POST /challenge {player, stake}  → "Fight an AI": the PPO fighter takes the red corner, the
//                                      match is reserved for `player` in blue; returns {matchId}.
//   POST /friendly  {player, stake}  → challenge-a-friend link: an open match the two players join;
//                                      the matchmaker schedules the crank once both are in.
// It also creates and delegates the player's Profile so settlement can record the result.
import http from "node:http";
import { PublicKey } from "@solana/web3.js";
import { profilePda } from "@ringside/client";
import { Env, ensureKeypair, loadKeypair, profile, send } from "@ringside/client/node";
import { brainFor } from "./lib/brains.ts";
import { MatchRunner } from "./lib/runner.ts";

const env = new Env(profile());
const admin = loadKeypair("admin");
const keeper = ensureKeypair("keeper");
const ai = await brainFor("ai");
const PORT = Number(process.env.MATCHMAKER_PORT ?? 8788);

async function ensureProfile(player: PublicKey) {
  if (await env.base.getAccountInfo(profilePda(player))) return;
  await send(env.base, [await env.ix.createProfile(admin.publicKey, player), await env.ix.delegateProfile(admin.publicKey, player, env.p.validator)], [admin]);
}

const json = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") return json(res, 204, {});
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const { player, stake } = JSON.parse(body || "{}");
        const p = new PublicKey(player);
        const stakeMicro = BigInt(Math.round(Number(stake ?? 1) * 1e6));
        if (![1_000_000n, 5_000_000n, 10_000_000n].includes(stakeMicro)) return json(res, 400, { error: "stake must be 1, 5 or 10" });
        await ensureProfile(p);
        const id = BigInt(Date.now());
        if (req.url === "/challenge") {
          const runner = new MatchRunner(env, admin, keeper, [ensureKeypair("fighter-a"), null], [ai, null], { stake: stakeMicro, delayMs: 5000, crank: true, tickMs: 100 });
          await runner.create(id, p);
          await runner.join(id); // AI takes the red corner
          json(res, 200, { matchId: id.toString(), corner: "blue", opponent: ai.label });
          runner
            .waitLive(id)
            .then(async () => {
              void runner.requestWave(id);
              await runner.scheduleCrank(id, await runner.game(id)).catch(() => {});
              await runner.play(id);
              await runner.finish(id);
            })
            .catch((e) => console.log(`challenge ${id}: ${(e as Error).message}`));
        } else if (req.url === "/friendly") {
          const runner = new MatchRunner(env, admin, keeper, [null as never, null], [null as never, null], { stake: stakeMicro, delayMs: 5000, crank: true, tickMs: 100 });
          await runner.create(id);
          json(res, 200, { matchId: id.toString() });
          runner
            .waitLive(id, 600_000)
            .then(async (g) => {
              await runner.scheduleCrank(id, g).catch(() => {});
              void runner.requestWave(id);
            })
            .catch((e) => console.log(`friendly ${id}: ${(e as Error).message}`));
        } else json(res, 404, { error: "not found" });
      } catch (e) {
        json(res, 500, { error: String((e as Error).message).slice(0, 200) });
      }
    });
  })
  .listen(PORT, () => console.log(`matchmaker on :${PORT} (${env.p.name})`));
