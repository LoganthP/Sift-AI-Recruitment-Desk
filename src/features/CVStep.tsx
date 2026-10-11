import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ArrowRight, CheckCircle2, Cpu, Eye, FileText, FileType2, Loader2, ShieldCheck, Trash2, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useSession, type CV } from '@/store/session';
import { parseFile, POOL_SIZE } from '@/lib/parserPool';
import { cn, formatBytes, uid } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Dialog, DialogContent, Tip } from '@/components/ui/primitives';
import { NumberTicker } from '@/components/fx/NumberTicker';
import { Dropzone } from '@/components/Dropzone';
import { StepHeader } from '@/components/common';

const kindOf = (n: string): CV['kind'] => (n.toLowerCase().endsWith('.pdf') ? 'pdf' : n.toLowerCase().endsWith('.docx') ? 'docx' : 'other');

/** Highlights the redaction markers so the recruiter can see exactly what was hidden. */
function Redacted({ text }: { text: string }) {
  return (
    <pre className="scroll-thin max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-2xl bg-black/35 p-4 font-mono text-xs leading-relaxed text-mist/85">
      {text.split(/(\[[^\]]*removed\]|\[email\]|\[phone\]|\[link\]|\bCandidate\b)/g).map((part, i) =>
        /^\[|^Candidate$/.test(part) ? <mark key={i} className="rounded bg-violet/25 px-1 text-violet">{part}</mark> : part
      )}
    </pre>
  );
}

export default function CVStep({ onNext }: { onNext: () => void }) {
  const { cvs, set } = useSession();
  const [preview, setPreview] = useState<CV | null>(null);
  const [batchStats, setBatchStats] = useState<{ files: number; ms: number } | null>(null);
  const patch = (id: string, p: Partial<CV>) => set('cvs', (cur) => cur.map((c) => (c.id === id ? { ...c, ...p } : c)));

  const addFiles = async (files: File[]) => {
    const fresh = files
      .filter((f) => !cvs.some((c) => c.fileName === f.name && c.size === f.size))
      .map((file) => ({ file, cv: { id: uid(), fileName: file.name, size: file.size, kind: kindOf(file.name), status: 'queued' as const } }));
    if (!fresh.length) return toast.info('Those files are already added.');
    set('cvs', (cur) => [...cur, ...fresh.map((f) => f.cv)]);

    const t0 = performance.now();
    await Promise.all(
      fresh.map(async ({ file, cv }) => {
        try {
          const r = await parseFile(file, { redact: true, onStart: (lane) => patch(cv.id, { status: 'reading', lane }) });
          patch(cv.id, { status: 'ready', text: r.text, removed: r.removed, nameGuess: r.name, words: r.words, pages: r.pages, ms: r.ms, lane: r.lane });
        } catch (e) {
          patch(cv.id, { status: 'error', error: (e as Error).message });
        }
      })
    );
    const ms = Math.round(performance.now() - t0);
    setBatchStats({ files: fresh.length, ms });
    toast.success(`Parsed ${fresh.length} file${fresh.length > 1 ? 's' : ''} in ${(ms / 1000).toFixed(2)}s across ${POOL_SIZE} workers`);
  };

  const ready = cvs.filter((c) => c.status === 'ready');
  const busy = cvs.filter((c) => c.status === 'reading' || c.status === 'queued').length;
  const failed = cvs.filter((c) => c.status === 'error').length;
  const pdfs = ready.filter((c) => c.kind === 'pdf').length;
  const hidden = ready.reduce((n, c) => n + (c.removed?.length || 0), 0);

  return (
    <div>
      <StepHeader
        step={3}
        title="Upload CVs"
        description={`Drop every CV at once. Files are parsed in parallel by ${POOL_SIZE} background Web Workers, and personal details are stripped before anything is sent to the AI.`}
        actions={cvs.length > 0 && <Button variant="ghost" size="sm" icon={Trash2} onClick={() => { set('cvs', []); setBatchStats(null); }}>Clear all</Button>}
      />

      <Dropzone multiple accept=".pdf,.docx" onFiles={addFiles} title="Drop CVs here" hint="PDF and Word (.docx). Select as many as you like." compact={cvs.length > 0} />

      {cvs.length > 0 && (
        <>
          {/* Stats bento */}
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <SpotlightCard className="p-5 sm:col-span-2">
              <p className="text-xs text-muted">CVs read</p>
              <p className="mt-1 flex items-baseline gap-2">
                <NumberTicker value={ready.length} className="font-display text-6xl font-extrabold tabular-nums text-teal" />
                <span className="text-lg text-muted">of {cvs.length}</span>
              </p>
              <p className="mt-1 text-sm text-muted">
                {pdfs} PDF and {ready.length - pdfs} Word {failed > 0 && <span className="text-coral">· {failed} failed</span>}
              </p>
            </SpotlightCard>
            <SpotlightCard className="p-5" color="139 124 246">
              <p className="flex items-center gap-1.5 text-xs text-muted"><ShieldCheck className="size-3.5 text-violet" /> Details hidden</p>
              <NumberTicker value={hidden} className="mt-1 block font-display text-4xl font-bold tabular-nums" />
              <p className="text-xs text-muted">name, gender, age, contact…</p>
            </SpotlightCard>
            <SpotlightCard className="p-5" color="245 192 101">
              <p className="flex items-center gap-1.5 text-xs text-muted"><Zap className="size-3.5 text-amber" /> Last batch</p>
              <p className="mt-1 font-display text-4xl font-bold tabular-nums">{batchStats ? `${(batchStats.ms / 1000).toFixed(2)}s` : busy ? '…' : '—'}</p>
              <p className="text-xs text-muted">{batchStats ? `${batchStats.files} files, ${POOL_SIZE} threads` : 'parallel parse time'}</p>
            </SpotlightCard>
          </div>

          {/* Worker lanes */}
          <SpotlightCard className="mt-3 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs text-muted"><Cpu className="size-3.5 text-sky" /> Worker pool</div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${POOL_SIZE}, minmax(0, 1fr))` }}>
              {Array.from({ length: POOL_SIZE }, (_, lane) => {
                const active = cvs.find((c) => c.status === 'reading' && c.lane === lane);
                const doneCount = cvs.filter((c) => c.status === 'ready' && c.lane === lane).length;
                return (
                  <div key={lane} className={cn('relative overflow-hidden rounded-xl border px-3 py-2 transition-colors', active ? 'border-sky/40 bg-sky/10' : 'border-white/8 bg-black/20')}>
                    {active && <motion.div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-sky/25 to-transparent" animate={{ x: ['-100%', '300%'] }} transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }} />}
                    <p className="relative font-mono text-[10px] text-muted">thread {lane + 1}</p>
                    <p className="relative truncate text-xs">{active ? active.fileName : <span className="text-muted">idle · {doneCount} done</span>}</p>
                  </div>
                );
              })}
            </div>
          </SpotlightCard>

          <motion.ul layout className="mt-4 grid gap-2 md:grid-cols-2">
            <AnimatePresence initial={false}>
              {cvs.map((c, i) => (
                <motion.li key={c.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1, transition: { delay: Math.min(i, 12) * 0.03 } }} exit={{ opacity: 0, x: -24 }} className="glass rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={cn('relative grid size-11 shrink-0 place-items-center rounded-xl', c.kind === 'pdf' ? 'bg-coral/15 text-coral' : 'bg-violet/15 text-violet')}>
                      {c.kind === 'pdf' ? <FileText className="size-5" /> : <FileType2 className="size-5" />}
                      {c.status === 'reading' && <span className="absolute inset-0 rounded-xl border border-sky" style={{ animation: 'var(--animate-pulse-ring)' }} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.nameGuess || c.fileName}</p>
                      <p className="truncate text-xs text-muted">
                        {c.fileName} · {formatBytes(c.size)}
                        {c.words ? ` · ${c.words} words · ${c.ms} ms` : ''}
                      </p>
                    </div>
                    {c.status === 'queued' && <Badge>Queued</Badge>}
                    {c.status === 'reading' && <Badge tone="sky"><Loader2 className="size-3 animate-spin" /> T{(c.lane ?? 0) + 1}</Badge>}
                    {c.status === 'ready' && (
                      <Tip content={c.removed?.length ? `Hidden from the AI: ${c.removed.join(', ')}` : 'Nothing needed hiding'}>
                        <span><Badge tone="teal"><CheckCircle2 className="size-3" /> {c.removed?.length || 0} hidden</Badge></span>
                      </Tip>
                    )}
                    {c.status === 'error' && <Badge tone="coral"><AlertTriangle className="size-3" /> Failed</Badge>}
                    {c.status === 'ready' && (
                      <Tip content="Preview what the AI sees">
                        <button onClick={() => setPreview(c)} className="rounded-lg p-2 text-muted hover:bg-white/8 hover:text-mist" aria-label="Preview what the AI sees"><Eye className="size-4" /></button>
                      </Tip>
                    )}
                    <button onClick={() => set('cvs', (cur) => cur.filter((x) => x.id !== c.id))} className="rounded-lg p-2 text-muted hover:bg-white/8 hover:text-coral" aria-label={`Remove ${c.fileName}`}><X className="size-4" /></button>
                  </div>
                  {c.status === 'error' && <p className="mt-2 text-sm text-coral">{c.error}</p>}
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>

          <div className="mt-6 flex justify-end">
            <Button iconRight={ArrowRight} disabled={!ready.length || busy > 0} onClick={onNext}>
              Rank {ready.length} candidate{ready.length === 1 ? '' : 's'}
            </Button>
          </div>
        </>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        {preview && (
          <DialogContent title="What the AI sees" description={`${preview.fileName}. Highlighted parts were replaced before sending: ${preview.removed?.join(', ') || 'nothing'}.`}>
            <Redacted text={preview.text || ''} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
