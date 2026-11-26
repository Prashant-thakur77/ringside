// Fighter brains: scripted policies (the same Rust bots, via WASM) and the PPO policy (ONNX).
import path from "node:path";
import { ROOT } from "@ringside/client/node";
import { sim } from "./wasm.ts";

export interface Brain {
  readonly label: string;
  act(state: Uint8Array, me: 0 | 1): Promise<number>;
}

export const POLICIES = ["aggressive", "kiting", "defensive", "random"] as const;

export class ScriptedBrain implements Brain {
  private bot: InstanceType<typeof sim.ScriptedBot>;
  readonly label: string;
  constructor(policy: (typeof POLICIES)[number], skill = 850, seed = BigInt(Date.now())) {
    this.bot = new sim.ScriptedBot(POLICIES.indexOf(policy), skill, seed);
    this.label = `Scripted · ${policy}`;
  }
  async act(state: Uint8Array, me: 0 | 1) {
    return this.bot.act(state, me);
  }
}

export class OnnxBrain implements Brain {
  readonly label = "AI · PPO";
  private constructor(private session: import("onnxruntime-node").InferenceSession, private ort: typeof import("onnxruntime-node")) {}
  static async load(file = path.join(ROOT, "ml/ppo/out/policy.onnx")): Promise<OnnxBrain> {
    const ort = await import("onnxruntime-node");
    return new OnnxBrain(await ort.InferenceSession.create(file), ort);
  }
  async act(state: Uint8Array, me: 0 | 1) {
    const obs = sim.observe(state, me);
    const out = await this.session.run({ obs: new this.ort.Tensor("float32", Float32Array.from(obs), [1, obs.length]) });
    const logits = out.logits.data as Float32Array;
    let best = 0;
    for (let i = 1; i < logits.length; i++) if (logits[i] > logits[best]) best = i;
    return sim.actionToInput(state, me, best);
  }
}

export async function brainFor(kind: string): Promise<Brain> {
  if (kind === "ai") return OnnxBrain.load();
  return new ScriptedBrain(kind as (typeof POLICIES)[number]);
}
