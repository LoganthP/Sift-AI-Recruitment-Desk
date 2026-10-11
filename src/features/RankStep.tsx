import { useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { Drawer } from 'vaul';
import { AlertTriangle, ArrowRight, Ban, Check, Columns3, Download, GitCompareArrows, ListOrdered, PauseCircle, PencilLine, Quote, RefreshCw, ShieldCheck, Star, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { JD, RankResult } from '@shared/schemas';
import { rankingSignature, useSession, type Decision, type RankedCandidate } from '@/store/session';
import { useStreamMutation } from '@/lib/useStream';
import { cn, scoreColor } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Dialog, DialogContent, Segmented, Slider, Tip } from '@/components/ui/primitives';
import { ScoreRing } from '@/components/fx/ScoreRing';
import { NumberTicker } from '@/components/fx/NumberTicker';
import { RadarChart, SERIES_COLORS } from '@/components/fx/RadarChart';
import { AIStatus, EmptyState, ErrorNote, StepHeader, easeSoft } from '@/components/common';

const PARTS = [
  { key: 'skills', label: 'Skills backed by real work', max: 50 },
  { key: 'experience', label: 'Relevant experience', max: 25 },
  { key: 'relevance', label: 'Project and domain fit', max: 15 },
  { key: 'education', label: 'Education and certs', max: 10 },
] as const;

import { useRows, useRankingExport, type Row } from '@/lib/rankingExport';
export { useRows, useRankingExport, type Row };

const DECISIONS: { value: Decision; label: React.ReactNode; tone: string }[] = [
  { value: 'shortlist', label: <><Star className="size-3" />Shortlist</>, tone: 'bg-teal' },
  { value: 'hold', label: <><PauseCircle className="size-3" />Hold</>, tone: 'bg-amber' },
  { value: 'reject', label: <><Ban className="size-3" />Reject</>, tone: 'bg-coral' },
];

/* ---------- histogram ---------- */
function Distribution({ rows }: { rows: Row[] }) {
  const buckets = Array.from({ length: 10 }, (_, i) => rows.filter((r) => Math.min(9, Math.floor(r.finalScore / 10)) === i).length);
  const max = Math.max(1, ...buckets);
  return (
    <div className="flex h-16 items-end gap-1" role="img" aria-label="Score distribution">
      {buckets.map((n, i) => (
        <Tip key={i} content={`${i * 10}–${i * 10 + 9}: ${n} candidate${n === 1 ? '' : 's'}`}>
          <motion.div className="flex-1 rounded-t-md" style={{ background: n ? scoreColor(i * 10 + 5) : 'rgb(255 255 255 / 0.06)' }} initial={{ height: 0 }} animate={{ height: `${Math.max(6, (n / max) * 100)}%` }} transition={{ delay: i * 0.03, ease: easeSoft, duration: 0.6 }} />
        </Tip>
      ))}
    </div>
  );
}

/* ---------- row ---------- */
function SkillChips({ row, limit }: { row: Row; limit?: number }) {
  const all = [
    ...row.matchedSkills.map((s) => ({ s, kind: row.check.unverified.includes(s) ? 'unverified' : 'match' })),
    ...row.missingSkills.map((s) => ({ s, kind: 'miss' })),
  ];
  const shown = limit ? all.slice(0, limit) : all;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map(({ s, kind }) =>
        kind === 'match' ? <Badge key={s} tone="teal">{s}</Badge>
        : kind === 'unverified' ? (
          <Tip key={s} content="The AI says this matched, but it never appears in the CV text. Verify it."><span><Badge tone="amber">{s}?</Badge></span></Tip>
        ) : <Badge key={s} tone="coral" className="line-through decoration-coral/50">{s}</Badge>
      )}
      {limit && all.length > limit && <Badge>+{all.length - limit}</Badge>}
    </div>
  );
}

function RankRow({ row, rank, selected, onSelect, onOpen, onDecide }: { row: Row; rank: number; selected: boolean; onSelect: () => void; onOpen: () => void; onDecide: (d?: Decision) => void }) {
  return (
    <motion.li layout="position" initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
      <SpotlightCard color={row.finalScore >= 75 ? '52 211 180' : row.finalScore >= 50 ? '245 192 101' : '255 138 122'} className={cn('transition-shadow', selected && 'ring-1 ring-violet/60', row.decision === 'reject' && 'opacity-60')}>
        <div className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
          <div className="flex flex-col items-center gap-2 pt-1">
            <Tip content={selected ? 'Remove from comparison' : 'Add to comparison'}>
              <button onClick={onSelect} aria-pressed={selected} aria-label="Compare" className={cn('grid size-5 place-items-center rounded-md border transition-colors', selected ? 'border-violet bg-violet text-ink' : 'border-white/20 hover:border-white/40')}>
                {selected && <Check className="size-3.5" strokeWidth={3} />}
              </button>
            </Tip>
            <span className="font-display text-sm font-bold tabular-nums text-muted">#{rank}</span>
          </div>
          <button onClick={onOpen} className="shrink-0" aria-label={`Open ${row.displayName}`}><ScoreRing score={row.finalScore} /></button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={onOpen} className="text-left font-display text-lg font-bold hover:text-teal">{row.displayName}</button>
              {row.override && <Tip content={row.override.note || 'Adjusted by recruiter'}><span><Badge tone="amber"><PencilLine className="size-3" /> AI said {row.score}</Badge></span></Tip>}
              {row.check.needsReview && !row.override && <Badge tone="amber"><AlertTriangle className="size-3" /> Review</Badge>}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-mist/85">{row.reason}</p>
            <div className="mt-3"><SkillChips row={row} limit={9} /></div>
          </div>
          <div className="hidden shrink-0 flex-col items-end gap-2 md:flex">
            <Segmented value={row.decision} onChange={onDecide} options={DECISIONS} />
            <button onClick={onOpen} className="text-xs text-muted hover:text-teal">Details and correction</button>
          </div>
        </div>
      </SpotlightCard>
    </motion.li>
  );
}

/* ---------- detail drawer ---------- */
function CandidateDrawer({ row, onClose, onOverride, onDecide }: { row: Row | null; onClose: () => void; onOverride: (id: string, o?: { score: number; note: string }) => void; onDecide: (id: string, d?: Decision) => void }) {
  const [score, setScore] = useState(0);
  const [note, setNote] = useState('');
  const [lastId, setLastId] = useState<string | null>(null);
  if (row && row.id !== lastId) {
    setLastId(row.id);
    setScore(row.override?.score ?? row.score);
    setNote(row.override?.note ?? '');
  }
  return (
    <Drawer.Root open={!!row} onOpenChange={(o) => !o && onClose()} direction="right">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/60 backdrop-blur-sm" />
        <Drawer.Content className="glass-strong fixed bottom-2 right-2 top-2 z-50 flex w-[min(96vw,560px)] flex-col rounded-3xl outline-none" style={{ ['--initial-transform' as string]: 'calc(100% + 8px)' }}>
          {row && (
            <div className="scroll-thin flex-1 overflow-y-auto p-6">
              <div className="flex items-start gap-4">
                <ScoreRing score={row.finalScore} size={76} stroke={6} />
                <div className="min-w-0 flex-1">
                  <Drawer.Title className="font-display text-2xl font-bold">{row.displayName}</Drawer.Title>
                  <Drawer.Description className="text-sm text-muted">{row.fileName}{row.relevantYears != null ? ` · ~${row.relevantYears} yrs relevant` : ''}</Drawer.Description>
                  <div className="mt-3"><Segmented value={row.decision} onChange={(d) => onDecide(row.id, d)} options={DECISIONS} /></div>
                </div>
                <button onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-white/8" aria-label="Close"><X className="size-5" /></button>
              </div>

              <p className="mt-5 rounded-2xl bg-white/[0.04] p-4 text-sm leading-relaxed">{row.reason}</p>

              <div className="mt-6 grid items-center gap-4 sm:grid-cols-[1fr_1.1fr]">
                <RadarChart series={[{ name: row.displayName, breakdown: row.breakdown }]} size={230} />
                <div className="space-y-3">
                  {PARTS.map((p) => (
                    <div key={p.key}>
                      <div className="mb-1 flex justify-between text-xs"><span className="text-muted">{p.label}</span><span className="tabular-nums">{row.breakdown[p.key]}/{p.max}</span></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                        <motion.div className="h-full rounded-full bg-gradient-to-r from-violet to-teal" initial={{ width: 0 }} animate={{ width: `${(row.breakdown[p.key] / p.max) * 100}%` }} transition={{ duration: 0.7, ease: easeSoft }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <h3 className="mb-2 mt-7 text-sm font-semibold">Skills</h3>
              <SkillChips row={row} />

              <h3 className="mb-2 mt-7 flex items-center gap-2 text-sm font-semibold"><Quote className="size-4 text-teal" /> Evidence quoted from the CV</h3>
              <ul className="space-y-2">
                {row.evidence.map((e) => {
                  const found = row.cvText.toLowerCase().includes(e.toLowerCase().slice(0, 40));
                  return (
                    <li key={e} className={cn('border-l-2 pl-3 text-sm', found ? 'border-teal/60' : 'border-amber/60')}>
                      {e} {!found && <span className="text-xs text-amber">(not found word for word)</span>}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-7 rounded-2xl border border-violet/20 bg-violet/[0.06] p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-violet" /> Automatic check</h3>
                <p className="mt-1 text-sm text-muted">{row.check.keywordsFound.length} of {row.jdSkills} must-have skills appear in the CV text ({Math.round(row.check.coverage * 100)}%).</p>
                {row.check.flags.length ? (
                  <ul className="mt-2 space-y-1">{row.check.flags.map((f) => <li key={f} className="flex gap-2 text-sm text-amber"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{f}</li>)}</ul>
                ) : <p className="mt-1 text-sm text-teal">The AI and the CV text agree.</p>}
              </div>

              <div className="mt-5 rounded-2xl border border-amber/25 bg-amber/[0.05] p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><PencilLine className="size-4 text-amber" /> Correct this score</h3>
                <div className="mt-4 flex items-center gap-4">
                  <Slider value={score} onChange={setScore} />
                  <span className="w-12 text-right font-display text-2xl font-bold tabular-nums" style={{ color: scoreColor(score) }}>{score}</span>
                </div>
                <p className="mt-1 text-xs text-muted">AI score: {row.score}</p>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why you changed it, e.g. skills listed with no project using them" className="neu-field mt-3 px-3 py-2 text-sm" />
                <div className="mt-3 flex gap-2">
                  <Button size="sm" disabled={score === (row.override?.score ?? row.score) && note === (row.override?.note ?? '')} onClick={() => onOverride(row.id, { score, note: note.trim() })}>Save correction</Button>
                  {row.override && <Button size="sm" variant="ghost" icon={Undo2} onClick={() => { onOverride(row.id); setScore(row.score); setNote(''); }}>Use AI score</Button>}
                </div>
              </div>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ---------- compare ---------- */
function Compare({ rows, open, onOpenChange }: { rows: Row[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent title="Compare candidates" description="Score breakdowns overlaid. Each axis is scaled to its maximum points.">
          <div className="grid items-start gap-6 md:grid-cols-[300px_1fr]">
            <div className="flex flex-col items-center">
              <RadarChart series={rows.map((r) => ({ name: r.displayName, breakdown: r.breakdown }))} size={290} />
              <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
                {rows.map((r, i) => <span key={r.id} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: SERIES_COLORS[i] }} />{r.displayName}</span>)}
              </div>
            </div>
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted"><th className="pb-2 pr-3 font-normal" />{rows.map((r, i) => <th key={r.id} className="pb-2 pr-3 font-semibold" style={{ color: SERIES_COLORS[i] }}>{r.displayName}</th>)}</tr></thead>
                <tbody className="[&_td]:border-t [&_td]:border-white/8 [&_td]:py-2.5 [&_td]:pr-3 [&_td]:align-top">
                  <tr><td className="text-muted">Score</td>{rows.map((r) => <td key={r.id} className="font-display text-xl font-bold">{r.finalScore}</td>)}</tr>
                  {PARTS.map((p) => <tr key={p.key}><td className="text-muted">{p.label}</td>{rows.map((r) => <td key={r.id} className="tabular-nums">{r.breakdown[p.key]}/{p.max}</td>)}</tr>)}
                  <tr><td className="text-muted">Missing</td>{rows.map((r) => <td key={r.id} className="text-coral">{r.missingSkills.join(', ') || '—'}</td>)}</tr>
                  <tr><td className="text-muted">Flags</td>{rows.map((r) => <td key={r.id} className="text-amber">{r.check.flags.length || '—'}</td>)}</tr>
                  <tr><td className="text-muted">Summary</td>{rows.map((r) => <td key={r.id} className="text-mist/85">{r.reason}</td>)}</tr>
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

/* ---------- step ---------- */
type Filter = 'all' | 'review' | 'shortlist';

export default function RankStep({ onNext }: { onNext: () => void }) {
  const { jd, cvs, ranking, set } = useSession();
  const { rows, exportCsv } = useRankingExport();
  const [openId, setOpenId] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const ready = cvs.filter((c) => c.status === 'ready');
  const signature = rankingSignature(jd, cvs);
  const stale = !!ranking && ranking.signature !== signature;

  const rank = useStreamMutation<{ failed: string[]; rankedAt: string }, { jd: JD; candidates: { id: string; text: string }[] }, RankResult>('rank', {
    onStart: () => {
      setCompare([]);
      set('ranking', { results: [], failed: [], signature });
    },
    onItem: (item) => {
      const cv = cvs.find((c) => c.id === item.id);
      set('ranking', (cur) => (cur ? { ...cur, results: [...cur.results.filter((r) => r.id !== item.id), { ...item, fileName: cv?.fileName, nameGuess: cv?.nameGuess }] } : cur));
    },
    onSuccess: (data, meta) => {
      set('ranking', (cur) => (cur ? { ...cur, failed: data.failed, rankedAt: data.rankedAt, meta } : cur));
      if (data.failed.length) toast.warning(`${data.failed.length} CV(s) could not be scored. Rank again to retry.`);
      else toast.success(`Ranked ${ready.length} candidates`);
    },
  });
  const run = () => jd && rank.mutate({ jd, candidates: ready.map((c) => ({ id: c.id, text: c.text || '' })) });

  const update = (id: string, p: Partial<RankedCandidate>) => set('ranking', (cur) => (cur ? { ...cur, results: cur.results.map((r) => (r.id === id ? { ...r, ...p } : r)) } : cur));
  const onOverride = (id: string, o?: { score: number; note: string }) => {
    update(id, { override: o });
    toast.success(o ? 'Score corrected. Ranking re-ordered.' : 'Restored the AI score.');
  };

  const visible = rows.filter((r) => (filter === 'review' ? r.check.needsReview && !r.override : filter === 'shortlist' ? r.decision === 'shortlist' : true));
  const pending = rank.isPending ? ready.filter((c) => !rows.some((r) => r.id === c.id)) : [];
  const review = rows.filter((r) => r.check.needsReview && !r.override).length;
  const avg = rows.length ? Math.round(rows.reduce((n, r) => n + r.finalScore, 0) / rows.length) : 0;
  const openRow = rows.find((r) => r.id === openId) || null;

  return (
    <div>
      <StepHeader
        step={4}
        title="Stack ranking"
        description="Each CV is scored out of 100 using only evidence in the CV. Results stream in as they're scored, then Sift double-checks every AI claim against the CV text."
        actions={rows.length > 0 && !rank.isPending && (
          <>
            <Button variant="glass" size="sm" icon={GitCompareArrows} disabled={compare.length < 2} onClick={() => setCompareOpen(true)}>Compare {compare.length ? `(${compare.length})` : ''}</Button>
            <Button variant="glass" size="sm" icon={Download} onClick={exportCsv}>CSV</Button>
            <Button variant="glass" size="sm" icon={RefreshCw} onClick={run}>Rank again</Button>
          </>
        )}
      />
      <ErrorNote message={rank.errorMessage} onRetry={run} />
      <AIStatus progress={rank.progress} onCancel={rank.cancel} />

      {stale && !rank.isPending && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
          The JD or CV list changed after this ranking.
          <Button size="sm" variant="glass" icon={RefreshCw} onClick={run}>Rank again</Button>
        </div>
      )}

      {!ranking?.results.length && !rank.isPending && (
        <EmptyState icon={ListOrdered} title={`Rank ${ready.length} candidates for ${jd?.role}`} action={<Button size="lg" icon={ListOrdered} onClick={run} disabled={!ready.length}>Rank candidates</Button>}>
          <div className="mx-auto mt-4 grid max-w-sm gap-2 text-left">
            {PARTS.map((p, i) => (
              <div key={p.key} className="flex items-center gap-3">
                <motion.div className="h-2 rounded-full bg-gradient-to-r from-violet to-teal" initial={{ width: 0 }} animate={{ width: `${p.max * 1.6}%` }} transition={{ delay: 0.2 + i * 0.1, ease: easeSoft, duration: 0.7 }} />
                <span className="shrink-0 text-xs">{p.label} <span className="text-muted">({p.max})</span></span>
              </div>
            ))}
          </div>
          <p className="mt-4">Name, gender, age, photo and marital status are removed before scoring and never used.</p>
        </EmptyState>
      )}

      {(rows.length > 0 || rank.isPending) && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_1.6fr]">
            {[
              ['Ranked', rows.length, ''],
              ['Average', avg, ''],
              ['To review', review, review ? 'text-amber' : ''],
            ].map(([label, value, cls]) => (
              <SpotlightCard key={label as string} className="px-4 py-3">
                <p className="text-xs text-muted">{label}</p>
                <NumberTicker value={value as number} className={cn('font-display text-3xl font-bold tabular-nums', cls as string)} />
              </SpotlightCard>
            ))}
            <SpotlightCard className="px-4 py-3">
              <p className="mb-1 flex justify-between text-xs text-muted"><span>Score distribution</span><span>0 → 100</span></p>
              <Distribution rows={rows} />
            </SpotlightCard>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <Segmented<Filter> value={filter} onChange={(v) => setFilter(v || 'all')} size="md" options={[
              { value: 'all', label: `All ${rows.length}` },
              { value: 'review', label: <><AlertTriangle className="size-3.5" /> Review {review}</> },
              { value: 'shortlist', label: <><Star className="size-3.5" /> Shortlist {rows.filter((r) => r.decision === 'shortlist').length}</> },
            ]} />
            <div className="flex flex-wrap gap-3 text-xs text-muted">
              <span className="flex items-center gap-1.5"><Badge tone="teal">skill</Badge> found in CV</span>
              <span className="flex items-center gap-1.5"><Badge tone="amber">skill?</Badge> AI claim not in CV</span>
              <span className="flex items-center gap-1.5"><Badge tone="coral" className="line-through">skill</Badge> missing</span>
              <span className="hidden items-center gap-1.5 lg:flex"><Columns3 className="size-3.5" /> tick 2–3 to compare</span>
            </div>
          </div>

          <LayoutGroup>
            <ol className="space-y-3">
              <AnimatePresence initial={false}>
                {visible.map((row) => (
                  <RankRow
                    key={row.id}
                    row={row}
                    rank={rows.indexOf(row) + 1}
                    selected={compare.includes(row.id)}
                    onSelect={() => setCompare((c) => (c.includes(row.id) ? c.filter((x) => x !== row.id) : c.length >= 3 ? (toast.info('Compare up to 3 at a time'), c) : [...c, row.id]))}
                    onOpen={() => setOpenId(row.id)}
                    onDecide={(d) => update(row.id, { decision: d })}
                  />
                ))}
              </AnimatePresence>
              {pending.map((c) => (
                <motion.li key={`p-${c.id}`} layout className="glass flex items-center gap-4 rounded-3xl p-5">
                  <div className="skeleton size-16 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="text-shimmer text-sm font-medium">Scoring {c.nameGuess || c.fileName}</div>
                    <div className="skeleton h-3 w-3/4 rounded" />
                    <div className="flex gap-1.5">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-5 w-14 rounded-full" />)}</div>
                  </div>
                </motion.li>
              ))}
            </ol>
          </LayoutGroup>
          {!visible.length && !rank.isPending && <p className="py-10 text-center text-sm text-muted">No candidates match this filter.</p>}

          {!rank.isPending && rows.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <Button iconRight={ArrowRight} onClick={onNext}>Continue to screening questions</Button>
            </div>
          )}
        </>
      )}

      <CandidateDrawer row={openRow} onClose={() => setOpenId(null)} onOverride={onOverride} onDecide={(id, d) => update(id, { decision: d })} />
      <Compare rows={rows.filter((r) => compare.includes(r.id))} open={compareOpen} onOpenChange={setCompareOpen} />
    </div>
  );
}
