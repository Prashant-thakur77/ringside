// onnxruntime-node inference must match the PyTorch policy on the same observations.
import fs from "node:fs";
import path from "node:path";
import * as ort from "onnxruntime-node";
import { ROOT } from "@ringside/client/node";
const ref = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const s = await ort.InferenceSession.create(path.join(ROOT, "ml/ppo/out/policy.onnx"));
const flat = Float32Array.from(ref.obs.flat());
const out = await s.run({ obs: new ort.Tensor("float32", flat, [ref.obs.length, 22]) });
const logits = out.logits.data as Float32Array;
let same = 0;
let maxErr = 0;
for (let i = 0; i < ref.obs.length; i++) {
  const row = logits.slice(i * 72, i * 72 + 72);
  let best = 0;
  for (let j = 1; j < 72; j++) if (row[j] > row[best]) best = j;
  if (best === ref.argmax[i]) same++;
  for (let j = 0; j < 72; j++) maxErr = Math.max(maxErr, Math.abs(row[j] - ref.ref[i][j]));
}
console.log(`onnxruntime-node vs torch: argmax ${same}/${ref.obs.length}, max |logit diff| ${maxErr.toExponential(2)}`);
process.exit(same === ref.obs.length ? 0 : 1);
