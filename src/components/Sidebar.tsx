import { motion } from 'motion/react';
import { Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { spring } from './ui/button';
import { STEPS, type StepKey } from './Steps';
import { Kbd } from './ui/primitives';

export function Sidebar({ current, done, unlocked, onSelect }: { current: number; done: Record<StepKey, boolean>; unlocked: (n: number) => boolean; onSelect: (n: number) => void }) {
  const completed = STEPS.filter((s) => done[s.key]).length;
  return (
    <nav aria-label="Workflow" className="lg:sticky lg:top-24">
      <div className="mb-4 hidden items-center justify-between px-3 lg:flex">
        <span className="text-xs text-muted">{completed} of 7 complete</span>
        <span className="text-xs text-muted">jump <Kbd>⌘K</Kbd></span>
      </div>
      <ol className="scroll-thin relative flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {/* progress rail */}
        <div aria-hidden className="absolute bottom-6 left-[27px] top-6 hidden w-px bg-white/10 lg:block">
          <motion.div className="w-full bg-gradient-to-b from-teal to-violet" animate={{ height: `${((completed - 1) / 6) * 100}%` }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
        </div>
        {STEPS.map((s) => {
          const isDone = done[s.key];
          const isCurrent = current === s.n;
          const open = s.n > 1 && unlocked(s.n);
          const Icon = s.icon;
          return (
            <li key={s.key} className="shrink-0">
              <button
                type="button"
                disabled={!open}
                onClick={() => open && onSelect(s.n)}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn('relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors', isCurrent ? 'text-mist' : open ? 'text-muted hover:text-mist' : 'cursor-default text-muted/45')}
              >
                {isCurrent && <motion.span layoutId="side-pill" transition={spring} className="glass absolute inset-0 rounded-2xl" />}
                <span className={cn('relative grid size-8 shrink-0 place-items-center rounded-full border text-xs font-bold transition-colors', isDone ? 'border-teal bg-teal text-ink' : isCurrent ? 'border-white/30 bg-ink-3' : 'border-white/10 bg-ink-2')}>
                  {isDone ? <Check className="size-4" strokeWidth={3} /> : !open && s.n > 1 ? <Lock className="size-3" /> : <Icon className="size-3.5" />}
                  {isCurrent && !isDone && <span className="absolute inset-0 rounded-full border border-teal" style={{ animation: 'var(--animate-pulse-ring)' }} />}
                </span>
                <span className="relative">
                  <span className="block whitespace-nowrap text-sm font-medium">{s.title}</span>
                  <span className="hidden text-xs text-muted lg:block">{s.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
