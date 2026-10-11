import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Check, Copy, Plus, Sparkles, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Progress as P } from '@/lib/useStream';
import { cn } from '@/lib/utils';
import { Button, spring } from './ui/button';
import { Progress } from './ui/primitives';
import { SpotlightCard } from './ui/spotlight-card';

export const easeSoft = [0.22, 1, 0.36, 1] as const;
export const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } };
export const rise = { hidden: { opacity: 0, y: 16, filter: 'blur(4px)' }, show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.45, ease: easeSoft } } };

export function StepHeader({ step, title, description, actions }: { step: number; title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <motion.p initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/5 px-2.5 py-1 text-xs text-muted">
          <span className="size-1.5 rounded-full bg-teal" /> Step {step} of 7
        </motion.p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-[2.6rem] sm:leading-[1.05]">{title}</h1>
        {description && <p className="mt-2 text-[15px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function ErrorNote({ message, onRetry }: { message?: string | null; onRetry?: () => void }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, height: 0 }} role="alert" className="mb-4 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
            <span className="flex items-center gap-2"><AlertTriangle className="size-4 shrink-0" />{message}</span>
            {onRetry && <Button size="sm" variant="danger" onClick={onRetry}>Try again</Button>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Live status while an AI job streams: shimmer label, elapsed timer, optional determinate bar. */
export function AIStatus({ progress, onCancel }: { progress: P | null; onCancel?: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!progress) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [progress]);
  return (
    <AnimatePresence>
      {progress && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="glass beam-border mb-5 rounded-2xl px-4 py-3" aria-live="polite">
          <div className="flex items-center gap-3">
            <span className="relative grid size-8 place-items-center rounded-xl bg-teal/15">
              <Sparkles className="size-4 text-teal" />
              <span className="absolute inset-0 rounded-xl border border-teal/60" style={{ animation: 'var(--animate-pulse-ring)' }} />
            </span>
            <AnimatePresence mode="wait">
              <motion.span key={progress.message} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="text-shimmer flex-1 text-sm font-medium">
                {progress.message}…
              </motion.span>
            </AnimatePresence>
            <span className="font-mono text-xs tabular-nums text-muted">{((now - progress.startedAt) / 1000).toFixed(1)}s</span>
            {onCancel && <Button size="sm" variant="ghost" icon={Square} onClick={onCancel}>Stop</Button>}
          </div>
          {progress.total ? <Progress className="mt-3" value={((progress.done || 0) / progress.total) * 100} /> : null}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: React.ComponentType<{ className?: string }>; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <SpotlightCard className="px-6 py-16 text-center">
      <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-violet/25 to-teal/20 shadow-[0_0_40px_-10px_rgb(52_211_180/0.6)]">
        <Icon className="size-7 text-teal" />
      </div>
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      {children && <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-7 flex justify-center">{action}</div>}
    </SpotlightCard>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="glass"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(`${label} copied`);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error('Copy failed. Select the text and copy manually.');
        }
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={String(copied)} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring} className="inline-flex items-center gap-1.5">
          {copied ? <Check className="size-3.5 text-teal" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}

export function SkillEditor({ values, onChange, tone = 'teal' }: { values: string[]; onChange: (v: string[]) => void; tone?: 'teal' | 'violet' }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setDraft('');
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        <AnimatePresence initial={false}>
          {values.map((s) => (
            <motion.span
              key={s} layout initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={spring}
              className={cn('inline-flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-xs font-medium', tone === 'teal' ? 'border-teal/30 bg-teal/12 text-teal' : 'border-violet/30 bg-violet/15 text-violet')}
            >
              {s}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== s))} className="rounded-full p-0.5 hover:bg-white/15" aria-label={`Remove ${s}`}><X className="size-3" /></button>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <div className="mt-2.5 flex gap-1.5">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="Add a skill and press Enter" className="neu-field px-3 py-1.5 text-xs" />
        <button type="button" onClick={add} className="grid size-8 shrink-0 place-items-center rounded-xl bg-white/8 hover:bg-white/15" aria-label="Add skill"><Plus className="size-4" /></button>
      </div>
    </div>
  );
}
