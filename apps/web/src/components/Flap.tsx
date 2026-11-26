"use client";
// Split-flap price cell: each character sits in a fixed cell and flips only when it changes.
import { useRef } from "react";

export function Flap({ value, size = 40, tone }: { value: string; size?: number; tone?: "red" | "blue" }) {
  const prev = useRef(value);
  const chars = value.split("");
  const old = prev.current.padStart(chars.length).split("");
  prev.current = value;
  const color = tone === "red" ? "var(--color-red-ink)" : tone === "blue" ? "var(--color-blue-ink)" : "var(--color-chalk)";
  return (
    <span className="inline-flex gap-[3px]" aria-label={value} role="text">
      {chars.map((c, i) => (
        <span key={i} className="flap" style={{ width: c === "." ? size * 0.42 : size * 0.68, height: size * 1.3, fontSize: size, color }} aria-hidden>
          <span key={`${i}-${c}`} className={old[i] !== c ? "changed wiped" : ""}>
            {c}
          </span>
        </span>
      ))}
    </span>
  );
}
