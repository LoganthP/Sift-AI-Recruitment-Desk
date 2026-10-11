import { motion } from 'motion/react';
import { scoreColor } from '@/lib/utils';
import { NumberTicker } from './NumberTicker';

export function ScoreRing({ score, size = 64, stroke = 5 }: { score: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={`Score ${score} out of 100`}>
      <div className="absolute inset-1 rounded-full opacity-40 blur-md" style={{ background: color }} />
      <svg width={size} height={size} className="relative -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="rgb(7 8 26 / 0.8)" stroke="rgb(255 255 255 / 0.08)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - score / 100) }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <NumberTicker value={score} className="absolute font-display text-lg font-bold tabular-nums" />
    </div>
  );
}
