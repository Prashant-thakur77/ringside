// Proof charts drawn as SVG in the site's type, on ticket stock. Palette validated for
// colour-blind separation and contrast on #f1e9d6: TV-delay book orange, Ringside aqua.
const TV = "#d9622a";
const RS = "#009379";
const THIRD = "#6a4ce2";
const INK = "#22201a";
const QUIET = "#5d5644";
const RULE = "#d8ceb6";

type Bar = { label: string; mean: number; lo: number; hi: number; color: string; n: number };

export function CourtsiderBars({ bars }: { bars: Bar[] }) {
  const W = 760, H = 320, L = 56, R = 16, T = 28, B = 46;
  const top = Math.max(...bars.map((b) => b.hi), 0.5);
  const bottom = Math.min(...bars.map((b) => b.lo), 0);
  const y = (v: number) => T + ((top - v) / (top - bottom)) * (H - T - B);
  const step = (W - L - R) / bars.length;
  const ticks = Array.from({ length: 5 }, (_, i) => bottom + ((top - bottom) * i) / 4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Courtsider profit per match by book, with 95% confidence intervals" style={{ fontFamily: "var(--font-plex-mono)" }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={RULE} />
          <text x={L - 8} y={y(t) + 4} fontSize="11" textAnchor="end" fill={QUIET}>{t.toFixed(1)}</text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke={INK} />
      {bars.map((b, i) => {
        const cx = L + step * i + step / 2;
        const w = Math.min(84, step * 0.6);
        const y0 = y(Math.max(0, b.mean));
        const h = Math.max(2, Math.abs(y(b.mean) - y(0)));
        return (
          <g key={b.label}>
            <rect x={cx - w / 2} y={y0} width={w} height={h} rx={3} fill={b.color} />
            <line x1={cx} x2={cx} y1={y(b.hi)} y2={y(b.lo)} stroke={INK} strokeWidth={1.4} />
            <line x1={cx - 6} x2={cx + 6} y1={y(b.hi)} y2={y(b.hi)} stroke={INK} strokeWidth={1.4} />
            <line x1={cx - 6} x2={cx + 6} y1={y(b.lo)} y2={y(b.lo)} stroke={INK} strokeWidth={1.4} />
            <text x={cx} y={y(Math.max(b.hi, b.mean)) - 8} fontSize="13" textAnchor="middle" fill={INK} fontWeight={600}>{b.mean >= 0 ? "+" : ""}{b.mean.toFixed(2)}</text>
            <text x={cx} y={H - 24} fontSize="12" textAnchor="middle" fill={INK}>{b.label}</text>
            <text x={cx} y={H - 8} fontSize="10" textAnchor="middle" fill={QUIET}>n={b.n}</text>
          </g>
        );
      })}
      <text x={L} y={14} fontSize="11" fill={QUIET}>courtsider PnL per match (test-dollars) · whiskers: 95% bootstrap CI</text>
    </svg>
  );
}

type Rel = [number | null, number | null, number][];
export function Reliability({ series }: { series: { name: string; color: string; pts: Rel; ece: number }[] }) {
  const S = 360, P = 40;
  const sx = (v: number) => P + v * (S - 2 * P);
  const sy = (v: number) => S - P - v * (S - 2 * P);
  return (
    <svg viewBox={`0 0 ${S} ${S + 70}`} className="w-full max-w-[460px]" role="img" aria-label="Reliability diagram on held-out matches" style={{ fontFamily: "var(--font-plex-mono)" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={sx(0)} x2={sx(1)} y1={sy(t)} y2={sy(t)} stroke={RULE} />
          <text x={P - 6} y={sy(t) + 4} fontSize="10" textAnchor="end" fill={QUIET}>{Math.round(t * 100)}%</text>
          <text x={sx(t)} y={S - P + 14} fontSize="10" textAnchor="middle" fill={QUIET}>{Math.round(t * 100)}%</text>
        </g>
      ))}
      <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke={QUIET} strokeDasharray="4 4" />
      {series.map((s) => {
        const pts = s.pts.filter((p) => p[0] !== null) as [number, number, number][];
        return (
          <g key={s.name}>
            <polyline points={pts.map((p) => `${sx(p[0])},${sy(p[1])}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} />
            {pts.map((p, i) => <circle key={i} cx={sx(p[0])} cy={sy(p[1])} r={4} fill={s.color} stroke="#f1e9d6" strokeWidth={2} />)}
          </g>
        );
      })}
      <text x={S / 2} y={S - 6} fontSize="10" textAnchor="middle" fill={QUIET}>predicted P(red wins)</text>
      {series.map((s, i) => (
        <g key={s.name} transform={`translate(${P}, ${S + 14 + i * 18})`}>
          <rect width={12} height={4} y={-4} fill={s.color} />
          <text x={18} fontSize="11" fill={INK}>{s.name} · ECE {s.ece.toFixed(4)}</text>
        </g>
      ))}
    </svg>
  );
}

export const PROOF_COLORS = { TV, RS, THIRD };
