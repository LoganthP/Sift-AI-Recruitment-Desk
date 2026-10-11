import { useRef } from 'react';
import { motion } from 'motion/react';
import { FileDown, Lightbulb, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import type { JD, SearchStrings } from '@shared/schemas';
import { useSession } from '@/store/session';
import { useStreamMutation } from '@/lib/useStream';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { celebrate } from '@/components/fx/confetti';
import { AIStatus, CopyButton, EmptyState, ErrorNote, StepHeader, rise, stagger } from '@/components/common';

/** Tokenises Boolean syntax for highlighting: operators, quoted phrases, parentheses. */
function highlight(s: string) {
  return s.split(/("[^"]*"|\bAND\b|\bOR\b|\bNOT\b|[()])/g).map((t, i) => {
    if (/^(AND|OR|NOT)$/.test(t)) return <span key={i} className={t === 'NOT' ? 'text-coral' : 'text-violet'}>{t}</span>;
    if (/^"/.test(t)) return <span key={i} className="text-teal">{t}</span>;
    if (/^[()]$/.test(t)) return <span key={i} className="text-amber">{t}</span>;
    return t;
  });
}

/** Textarea with a syntax-highlighted layer underneath (same font metrics, synced scroll). */
function BooleanEditor({ value, onChange, limit }: { value: string; onChange: (v: string) => void; limit?: number }) {
  const pre = useRef<HTMLPreElement>(null);
  const balanced = value.split('(').length === value.split(')').length && (value.match(/"/g) || []).length % 2 === 0;
  const shared = 'whitespace-pre-wrap break-words p-4 font-mono text-[0.8rem] leading-relaxed';
  return (
    <div>
      <div className="neu-field relative overflow-hidden">
        <pre ref={pre} aria-hidden className={cn(shared, 'pointer-events-none absolute inset-0 m-0 overflow-hidden text-mist')}>{highlight(value)}{'\n'}</pre>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => pre.current && (pre.current.scrollTop = e.currentTarget.scrollTop)}
          spellCheck={false}
          rows={6}
          aria-label="Boolean search string"
          className={cn(shared, 'relative block w-full resize-y bg-transparent text-transparent caret-teal outline-none')}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-xs">
        <span className={balanced ? 'text-muted' : 'text-coral'}>{balanced ? 'Brackets and quotes balanced' : 'Unbalanced brackets or quotes'}</span>
        {limit && <span className={cn('tabular-nums', value.length > limit ? 'text-coral' : 'text-muted')}>{value.length}/{limit}</span>}
      </div>
    </div>
  );
}

const PLATFORMS = [
  { key: 'linkedin', label: 'LinkedIn', color: 'from-[#0a66c2] to-[#0a4d91]', limit: 1000 },
  { key: 'naukri', label: 'Naukri', color: 'from-[#4a90e2] to-[#2b6cc4]', limit: undefined },
] as const;

export default function SearchStep({ onDownloadPack }: { onDownloadPack: () => void }) {
  const { jd, strings, set } = useSession();
  const gen = useStreamMutation<SearchStrings, { jd: JD }>('search-strings', {
    onSuccess: (data, meta) => {
      const first = !strings;
      set('strings', { ...data, meta, at: Date.now() });
      if (first) setTimeout(celebrate, 350);
    },
  });
  const update = (p: 'linkedin' | 'naukri', f: 'boolean' | 'plain', v: string) => set('strings', (s) => (s ? { ...s, [p]: { ...s[p], [f]: v } } : s));

  return (
    <div>
      <StepHeader
        step={7}
        title="Search strings"
        description="Ready to paste into LinkedIn and Naukri, each as a Boolean and a plain keyword version. Edit them here; operators, phrases and brackets are highlighted as you type."
        actions={strings && !gen.isPending && (
          <>
            <Button size="sm" variant="glass" icon={RefreshCw} onClick={() => jd && gen.mutate({ jd })}>Write again</Button>
            <Button size="sm" icon={FileDown} onClick={onDownloadPack}>Download hiring pack</Button>
          </>
        )}
      />
      <ErrorNote message={gen.errorMessage} onRetry={() => jd && gen.mutate({ jd })} />
      <AIStatus progress={gen.progress} onCancel={gen.cancel} />

      {!strings && !gen.isPending && (
        <EmptyState icon={Search} title="Write sourcing strings" action={<Button size="lg" icon={Search} onClick={() => jd && gen.mutate({ jd })}>Write search strings</Button>}>
          Built from the must-have skills, title variants and experience range in the JD.
        </EmptyState>
      )}

      {strings && !gen.isPending && (
        <>
          <motion.div key={strings.at} variants={stagger} initial="hidden" animate="show" className="grid gap-4 xl:grid-cols-2">
            {PLATFORMS.map((p) => (
              <motion.div key={p.key} variants={rise}>
                <SpotlightCard className="h-full p-5">
                  <div className="mb-5 flex items-center gap-3">
                    <span className={cn('grid size-10 place-items-center rounded-xl bg-gradient-to-br font-display text-lg font-bold text-white shadow-lg', p.color)}>{p.label[0]}</span>
                    <h2 className="font-display text-2xl font-bold">{p.label}</h2>
                  </div>
                  <div className="mb-1.5 flex items-center justify-between"><span className="text-sm font-medium">Boolean</span><CopyButton value={strings[p.key].boolean} label={`${p.label} Boolean`} /></div>
                  <BooleanEditor value={strings[p.key].boolean} onChange={(v) => update(p.key, 'boolean', v)} limit={p.limit} />
                  <div className="mb-1.5 mt-5 flex items-center justify-between"><span className="text-sm font-medium">Plain, no operators</span><CopyButton value={strings[p.key].plain} label={`${p.label} plain`} /></div>
                  <textarea value={strings[p.key].plain} onChange={(e) => update(p.key, 'plain', e.target.value)} rows={2} className="neu-field resize-y p-4 text-sm" aria-label={`${p.label} plain search`} />
                  {strings[p.key].filters.length > 0 && (
                    <div className="mt-5">
                      <p className="mb-2 flex items-center gap-2 text-sm font-medium"><SlidersHorizontal className="size-4 text-muted" /> Filters to set</p>
                      <div className="flex flex-wrap gap-1.5">{strings[p.key].filters.map((f) => <Badge key={f}>{f}</Badge>)}</div>
                    </div>
                  )}
                </SpotlightCard>
              </motion.div>
            ))}
          </motion.div>
          {strings.notes.length > 0 && (
            <SpotlightCard className="mt-4 p-5">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Lightbulb className="size-4 text-amber" /> Tips</p>
              <ul className="space-y-1.5 text-sm text-muted">{strings.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </SpotlightCard>
          )}
        </>
      )}
    </div>
  );
}
