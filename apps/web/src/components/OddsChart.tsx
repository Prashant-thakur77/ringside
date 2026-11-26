"use client";
// The odds line: P(red wins) per tick (uPlot). Optional second series for the TV-delay book.
import { useEffect, useRef } from "react";
import "uplot/dist/uPlot.min.css";
import type UPlot from "uplot";

export interface OddsPoint {
  tick: number;
  live: number;
  delayed?: number;
  hit?: boolean;
}

export function OddsChart({ points, height = 160, showDelayed = false }: { points: OddsPoint[]; height?: number; showDelayed?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const plot = useRef<UPlot | null>(null);
  const latest = useRef<OddsPoint[]>(points);
  latest.current = points;
  const toData = (pts: OddsPoint[]) => {
    const p = pts.slice(-300);
    return [p.map((x) => x.tick), p.map((x) => x.live), p.map((x) => x.delayed ?? null)] as unknown as UPlot.AlignedData;
  };

  useEffect(() => {
    let disposed = false;
    import("uplot").then(({ default: uPlot }) => {
      if (disposed || !el.current) return;
      const opts: UPlot.Options = {
        width: el.current.clientWidth,
        height,
        legend: { show: false },
        cursor: { show: false },
        scales: { x: { time: false }, y: { range: [0, 1] } },
        axes: [
          { stroke: "#9aa39c", grid: { show: false }, ticks: { stroke: "#333b37" }, font: "11px var(--font-plex-mono)", values: (_u, v) => v.map((t) => `${Math.round(t / 10)}s`) },
          { stroke: "#9aa39c", grid: { stroke: "#2a312d", width: 1 }, splits: () => [0, 0.25, 0.5, 0.75, 1], values: (_u, v) => v.map((p) => `${Math.round(p * 100)}%`), font: "11px var(--font-plex-mono)", size: 44 },
        ],
        series: [
          {},
          { stroke: "#ff6b72", width: 2, fill: "rgba(214,51,63,0.08)" },
          { stroke: "#c9a24a", width: 1.5, dash: [5, 4], show: showDelayed },
        ],
      };
      plot.current = new uPlot(opts, toData(latest.current), el.current);
    });
    const ro = new ResizeObserver(() => el.current && plot.current?.setSize({ width: el.current.clientWidth, height }));
    if (el.current) ro.observe(el.current);
    return () => {
      disposed = true;
      ro.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
  }, [height, showDelayed]);

  useEffect(() => {
    plot.current?.setData(toData(points));
  }, [points]);

  return <div ref={el} aria-label="Win probability over time" role="img" />;
}
