// Uploads ml/winprob/out/model_v<N>.bin into ModelParams (chunked) and finalizes it with the
// held-out metrics hash.
import fs from "node:fs";
import path from "node:path";
import { ROOT, send, writeState } from "@ringside/client/node";
import { modelPda } from "@ringside/client";
import { admin, env, log } from "./common.ts";

const version = Number(process.env.MODEL_VERSION ?? 1);
const blob = fs.readFileSync(path.join(ROOT, `ml/winprob/out/model_v${version}.bin`));
const metrics = JSON.parse(fs.readFileSync(path.join(ROOT, "ml/winprob/out/metrics.json"), "utf8"));
const hash = Array.from(Buffer.from(metrics.metrics_hash, "hex"));
const model = modelPda(version);
const info = await env.base.getAccountInfo(model);
if (!info) log("create_model", (await send(env.base, [await env.ix.createModel(admin.publicKey, version)], [admin])).sig);
const cur = await env.base.getAccountInfo(model);
const finalized = cur!.data[8 + 32 + 32 + 4 + 2] === 1;
if (finalized) {
  log("model already finalized", model.toBase58());
} else {
  const CH = 900;
  for (let o = 0; o < blob.length; o += CH) {
    const r = await send(env.base, [await env.ix.setModelParams(admin.publicKey, version, o, blob.subarray(o, o + CH))], [admin]);
    log(`chunk @${o}`, r.sig);
  }
  log("finalize_model", (await send(env.base, [await env.ix.finalizeModel(admin.publicKey, version, hash)], [admin])).sig);
}
const stored = (await env.base.getAccountInfo(model))!.data.subarray(8 + 72, 8 + 72 + blob.length);
if (!Buffer.from(stored).equals(blob)) throw new Error("model readback mismatch");
writeState(env.p.name, { modelVersion: String(version), model: model.toBase58(), modelMetricsHash: metrics.metrics_hash });
log("model readback matches blob", model.toBase58(), "metrics hash", metrics.metrics_hash);
