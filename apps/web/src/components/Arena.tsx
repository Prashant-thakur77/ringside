"use client";
// The ring, drawn with PixiJS v8 from the onchain sim state. Interpolates between ticks at 60 fps.
import { useEffect, useRef } from "react";
import type { Application, Graphics } from "pixi.js";
import { hexToBytes, loadSim, type StateView } from "@/lib/wasm";

const W = 2000;
const H = 1200;
const C = { red: 0xd6333f, blue: 0x3b6fe0, chalk: 0xecebe4, brass: 0xc9a24a, floor: 0x1d2320, rope: 0x9aa39c, quiet: 0x5b6560 };

export interface ArenaProps {
  simHex?: string;
  tickMs?: number;
  /** Fighter controls: receives packed input bits whenever they change. */
  onInput?: (bits: number) => void;
  me?: 0 | 1;
  className?: string;
}

export function Arena({ simHex, tickMs = 100, onInput, me = 0, className }: ArenaProps) {
  const host = useRef<HTMLDivElement>(null);
  const frames = useRef<{ prev: StateView | null; cur: StateView | null; at: number }>({ prev: null, cur: null, at: 0 });
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (!simHex) return;
    let live = true;
    loadSim().then((sim) => {
      if (!live) return;
      const v = JSON.parse(sim.stateJson(hexToBytes(simHex))) as StateView;
      const f = frames.current;
      if (f.cur && v.tick === f.cur.tick) return;
      f.prev = f.cur;
      f.cur = v;
      f.at = performance.now();
    });
    return () => {
      live = false;
    };
  }, [simHex]);

  useEffect(() => {
    let app: Application | null = null;
    let disposed = false;
    (async () => {
      const PIXI = await import("pixi.js");
      if (disposed || !host.current) return;
      app = new PIXI.Application();
      await app.init({ resizeTo: host.current, backgroundAlpha: 0, antialias: true, resolution: Math.min(2, window.devicePixelRatio), autoDensity: true });
      if (disposed) return app.destroy(true);
      host.current.appendChild(app.canvas);
      const ring = new PIXI.Graphics();
      const dyn = new PIXI.Graphics();
      app.stage.addChild(ring, dyn);
      const drawRing = (s: number) => {
        ring.clear();
        ring.rect(0, 0, W * s, H * s).fill({ color: C.floor });
        for (let i = 1; i <= 3; i++) {
          const o = i * 14 * s;
          ring.rect(o, o, W * s - 2 * o, H * s - 2 * o).stroke({ width: 1.5, color: C.rope, alpha: 0.35 + i * 0.12 });
        }
        ring.rect(0, 0, 70 * s, 70 * s).fill({ color: C.red });
        ring.rect(W * s - 70 * s, H * s - 70 * s, 70 * s, 70 * s).fill({ color: C.blue });
        ring.rect(W * s - 70 * s, 0, 70 * s, 70 * s).fill({ color: C.quiet });
        ring.rect(0, H * s - 70 * s, 70 * s, 70 * s).fill({ color: C.quiet });
        ring.circle((W / 2) * s, (H / 2) * s, 150 * s).stroke({ width: 1, color: C.rope, alpha: 0.25 });
      };
      let lastScale = 0;
      app.ticker.add(() => {
        const box = host.current!;
        const s = box.clientWidth / W;
        if (s !== lastScale) {
          drawRing(s);
          lastScale = s;
        }
        const { prev, cur, at } = frames.current;
        dyn.clear();
        if (!cur) return;
        const k = reduced.current || !prev ? 1 : Math.min(1, (performance.now() - at) / tickMs);
        const lerp = (a: number, b: number) => a + (b - a) * k;
        // power-ups
        for (const p of cur.powerups) {
          const x = p.x * s;
          const y = p.y * s;
          const r = 20 * s;
          dyn.circle(x, y, r).stroke({ width: 2, color: C.brass });
          if (p.kind === 1) dyn.rect(x - r * 0.15, y - r * 0.6, r * 0.3, r * 1.2).fill({ color: C.brass }).rect(x - r * 0.6, y - r * 0.15, r * 1.2, r * 0.3).fill({ color: C.brass });
          if (p.kind === 2) dyn.poly([x - r * 0.2, y - r * 0.7, x + r * 0.35, y - r * 0.1, x, y - r * 0.05, x + r * 0.2, y + r * 0.7, x - r * 0.35, y + r * 0.1, x, y + r * 0.05]).fill({ color: C.brass });
          if (p.kind === 3) for (const o of [-0.3, 0.2]) dyn.moveTo(x + (o - 0.2) * r, y - r * 0.5).lineTo(x + (o + 0.2) * r, y).lineTo(x + (o - 0.2) * r, y + r * 0.5).stroke({ width: 2.5, color: C.brass });
        }
        // projectiles
        for (const p of cur.projectiles) {
          dyn.circle((p.x + p.vx * k * 0) * s, p.y * s, (p.dmg > 12 ? 10 : 7) * s).fill({ color: p.owner === 0 ? 0xff6b72 : 0x8fb0ff });
        }
        // fighters
        cur.fighters.forEach((f, i) => {
          const pf = prev?.fighters[i] ?? f;
          const x = lerp(pf.x, f.x) * s;
          const y = lerp(pf.y, f.y) * s;
          const r = 28 * s;
          const col = i === 0 ? C.red : C.blue;
          if (f.hp <= 0) {
            dyn.circle(x, y, r).stroke({ width: 2, color: col, alpha: 0.5 });
            return;
          }
          if (f.dashMs > 0) dyn.circle(x - f.vx * s * 2, y - f.vy * s * 2, r * 0.8).fill({ color: col, alpha: 0.25 });
          if (f.hasteMs > 0) dyn.circle(x, y, r * 1.45).stroke({ width: 1, color: C.brass, alpha: 0.6 });
          dyn.circle(x, y, r).fill({ color: col }).stroke({ width: 2, color: C.chalk, alpha: i === me && onInput ? 1 : 0.4 });
          const a = (f.aim / 16) * Math.PI * 2;
          dyn.moveTo(x, y).lineTo(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6).stroke({ width: 3, color: C.chalk });
          if (f.shieldMs > 0) dyn.arc(x, y, r * 1.35, a - 1.3, a + 1.3).stroke({ width: 4, color: C.brass });
          if (f.overchargeMs > 0) dyn.circle(x, y, r * 0.35).fill({ color: C.brass });
          const hp = Math.max(0, f.hp) / 100;
          dyn.rect(x - r, y - r * 1.7, 2 * r, 4).fill({ color: 0x0e1110 }).rect(x - r, y - r * 1.7, 2 * r * hp, 4).fill({ color: col });
        });
      });
    })();
    return () => {
      disposed = true;
      app?.destroy(true);
    };
  }, [tickMs, me, onInput]);

  // Fighter controls: WASD / arrows move, mouse aims, click fires, Space dashes, Shift shields.
  useEffect(() => {
    if (!onInput) return;
    const keys = new Set<string>();
    let fire = false;
    let aim = me === 0 ? 0 : 8;
    let last = -1;
    const send = () => {
      const dx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
      const dy = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
      const dir = dx === 0 && dy === 0 ? 0 : ((Math.round((Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8) + 1);
      const bits = dir | (fire ? 1 << 4 : 0) | (keys.has(" ") ? 1 << 5 : 0) | (keys.has("shift") ? 1 << 6 : 0) | (aim << 8);
      if (bits !== last) {
        last = bits;
        onInput(bits);
      }
    };
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", " ", "shift", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      keys.add(k);
      send();
    };
    const ku = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
      send();
    };
    const mv = (e: PointerEvent) => {
      const el = host.current;
      const me_ = frames.current.cur?.fighters[me];
      if (!el || !me_) return;
      const r = el.getBoundingClientRect();
      const s = r.width / W;
      const ang = Math.atan2((e.clientY - r.top) / s - me_.y, (e.clientX - r.left) / s - me_.x);
      aim = (Math.round(ang / (Math.PI / 8)) + 16) % 16;
      send();
    };
    const down = () => ((fire = true), send());
    const up = () => ((fire = false), send());
    const el = host.current!;
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    el.addEventListener("pointermove", mv);
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      el.removeEventListener("pointermove", mv);
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
    };
  }, [onInput, me]);

  return <div ref={host} className={className} style={{ aspectRatio: `${W} / ${H}`, touchAction: onInput ? "none" : "auto" }} role="img" aria-label="Live arena" />;
}
