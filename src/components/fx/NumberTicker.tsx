import { animate, useMotionValue, useTransform, motion } from 'motion/react';
import { useEffect } from 'react';

/** Counts from the previous value to `value` whenever it changes. */
export function NumberTicker({ value, className, suffix = '' }: { value: number; className?: string; suffix?: string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${Math.round(v)}${suffix}`);
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span className={className}>{text}</motion.span>;
}
