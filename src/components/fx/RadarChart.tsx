import { motion } from 'motion/react';
import type { Breakdown } from '@shared/schemas';

const AXES: { key: keyof Breakdown; label: string; max: number }[] = [
  { key: 'skills', label: 'Skills', max: 50 },
  { key: 'experience', label: 'Experience', max: 25 },
  { key: 'relevance', label: 'Project fit', max: 15 },
  { key: 'education', label: 'Education', max: 10 },
];
export const SERIES_COLORS = ['#34d3b4', '#8b7cf6', '#ff8a7a'];

/** Animated radar comparing score breakdowns (normalised per axis). */
export function RadarChart({ series, size = 260 }: { series: { name: string; breakdown: Breakdown }[]; size?: number }) {
  const c = size / 2, R = size / 2 - 46;
  const pt = (i: number, f: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length;
    return [c + Math.cos(a) * R * f, c + Math.sin(a) * R * f] as const;
  };
  const poly = (b: Breakdown) => AXES.map((ax, i) => pt(i, Math.max(0.03, b[ax.key] / ax.max)).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[320px] overflow-visible" overflow="visible" role="img" aria-label="Score breakdown radar chart">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={AXES.map((_, i) => pt(i, f).join(',')).join(' ')} fill="none" stroke="rgb(255 255 255 / 0.08)" />
      ))}
      {AXES.map((ax, i) => {
        const [x, y] = pt(i, 1);
        const [lx, ly] = pt(i, 1.22);
        return (
          <g key={ax.key}>
            <line x1={c} y1={c} x2={x} y2={y} stroke="rgb(255 255 255 / 0.08)" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-muted text-[10px]">{ax.label}</text>
          </g>
        );
      })}
      {series.map((s, i) => (
        <motion.polygon
          key={s.name}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.12, type: 'spring', stiffness: 160, damping: 18 }}
          style={{ transformOrigin: `${c}px ${c}px` }}
          points={poly(s.breakdown)}
          fill={SERIES_COLORS[i]}
          fillOpacity={0.16}
          stroke={SERIES_COLORS[i]}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
