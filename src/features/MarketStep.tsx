import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Briefcase, Building2, CheckCircle2, Circle, ExternalLink, Globe, Info, LayoutGrid, RefreshCw, Rows3, Search, TrendingUp } from 'lucide-react';
import type { Insight, JD, Market } from '@shared/schemas';
import { useSession } from '@/store/session';
import { useStreamMutation } from '@/lib/useStream';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Segmented, Tip } from '@/components/ui/primitives';
import { AIStatus, EmptyState, ErrorNote, StepHeader, easeSoft, rise, stagger } from '@/components/common';

const BASIS_TONE = { 'Job post': 'teal', 'Salary data': 'violet', Estimate: 'amber' } as const;

/** "₹18–28 LPA" → [18, 28] */
function parseLPA(s: string): [number, number] | null {
  const n = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((x) => x > 0 && x < 500);
  if (!n.length) return null;
  return [Math.min(...n), Math.max(...n)];
}

const niceStep = (x: number) => {
  const p = 10 ** Math.floor(Math.log10(x));
  const n = x / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function PayLandscape({ insights }: { insights: Insight[] }) {
  const rows = insights.map((i) => ({ i, r: parseLPA(i.compensationRange) })).filter((x) => x.r) as { i: Insight; r: [number, number] }[];
  if (rows.length < 2) return null;
  let lo = Math.min(...rows.map((x) => x.r[0]));
  let hi = Math.max(...rows.map((x) => x.r[1]));
  if (hi - lo < 1) { lo = Math.max(0, lo - 1); hi += 1; }
  const step = niceStep((hi - lo) / 4);
  lo = Math.max(0, Math.floor(lo / step) * step);
  hi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 10) / 10);
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <SpotlightCard className="mb-5 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="size-4 text-teal" /> Pay landscape (₹ LPA)</h3>
        <span className="text-xs text-muted">dashed = estimate</span>
      </div>
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[calc(min(140px,30%)+12px)] right-[calc(5rem+12px)]">
          {ticks.map((t) => <span key={t} className="absolute inset-y-0 w-px bg-white/6" style={{ left: `${pct(t)}%` }} />)}
        </div>
        <div className="space-y-2.5">
          {rows.map(({ i, r }, k) => (
            <div key={k} className="grid grid-cols-[min(140px,30%)_1fr_5rem] items-center gap-3 text-sm">
              <span className="truncate text-muted">{i.company}</span>
              <div className="relative h-3 rounded-full bg-white/5">
                <motion.div
                  className={cn('absolute h-full rounded-full', i.compensationIsEstimate ? 'border border-dashed border-amber/70 bg-amber/20' : 'bg-gradient-to-r from-violet to-teal')}
                  style={{ left: `${pct(r[0])}%` }} initial={{ width: 0 }} animate={{ width: `${Math.max(1.5, pct(r[1]) - pct(r[0]))}%` }} transition={{ delay: k * 0.05, duration: 0.7, ease: easeSoft }}
                />
              </div>
              <span className="text-right font-mono text-xs tabular-nums">{fmt(r[0])}–{fmt(r[1])}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-[min(140px,30%)_1fr_5rem] gap-3">
        <span />
        <div className="relative h-4 font-mono text-[10px] text-muted">
          {ticks.map((t) => <span key={t} className="absolute -translate-x-1/2" style={{ left: `${pct(t)}%` }}>{fmt(t)}</span>)}
        </div>
        <span />
      </div>
    </SpotlightCard>
  );
}

function SourceLink({ m }: { m: Insight }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone={BASIS_TONE[m.basis]}>{m.basis}</Badge>
      {m.linkStatus === 'verified' ? (
        <Tip content="This page was opened and checked when the search ran.">
          <a href={m.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-teal hover:underline">
            <CheckCircle2 className="size-3" />{m.sourceName}<ExternalLink className="size-3" />
          </a>
        </Tip>
      ) : (
        <Tip content={m.basis === 'Estimate' ? 'No single page backs this figure. Search to compare sources.' : `The direct ${m.sourceName} page couldn’t be confirmed, so this opens a search on that source instead.`}>
          <a href={m.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky hover:underline">
            <Search className="size-3" />{m.basis === 'Estimate' ? 'Search pay data' : `Search ${m.sourceName}`}<ExternalLink className="size-3" />
          </a>
        </Tip>
      )}
      <a href={m.openingsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-mist hover:underline">
        <Briefcase className="size-3" />Openings<ExternalLink className="size-3" />
      </a>
    </span>
  );
}

export default function MarketStep({ onNext }: { onNext: () => void }) {
  const { jd, market, set } = useSession();
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const search = useStreamMutation<Market, { jd: JD }>('market', {
    onSuccess: (data, meta) => set('market', { ...data, checked: {}, meta, at: Date.now() }),
  });
  const run = () => jd && search.mutate({ jd });
  const toggle = (i: number) => set('market', (m) => (m ? { ...m, checked: { ...m.checked, [i]: !m.checked[i] } } : m));
  const list = market?.insights || [];
  const checked = Object.values(market?.checked || {}).filter(Boolean).length;

  const CheckBtn = ({ i }: { i: number }) => (
    <button onClick={() => toggle(i)} aria-pressed={!!market?.checked[i]} className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted hover:bg-white/8 hover:text-mist">
      {market?.checked[i] ? <CheckCircle2 className="size-4 text-teal" /> : <Circle className="size-4" />}{market?.checked[i] ? 'Checked' : 'Check'}
    </button>
  );

  return (
    <div>
      <StepHeader
        step={6}
        title="Hiring market"
        description={`Other companies hiring for roles like ${jd?.role}, found with live web search over public job posts and salary pages. LinkedIn and Naukri are never scraped.`}
        actions={list.length > 0 && !search.isPending && <Button size="sm" variant="glass" icon={RefreshCw} onClick={run}>Search again</Button>}
      />
      <ErrorNote message={search.errorMessage} onRetry={run} />
      <AIStatus progress={search.progress} onCancel={search.cancel} />

      {!list.length && !search.isPending && (
        <EmptyState icon={Globe} title="See who else is hiring" action={<Button size="lg" icon={Search} onClick={run}>Search the market</Button>}>
          Every row names its source or is labelled as an estimate, and every link is opened and checked before you see it. Takes 20–50 seconds.
        </EmptyState>
      )}

      {list.length > 0 && !search.isPending && market && (
        <>
          {market.marketSummary && <SpotlightCard className="beam-border mb-5 p-5"><p className="leading-relaxed">{market.marketSummary}</p></SpotlightCard>}
          <PayLandscape insights={list} />

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <Segmented<'cards' | 'table'> value={view} onChange={(v) => setView(v || 'cards')} size="md" options={[{ value: 'cards', label: <><LayoutGrid className="size-3.5" />Cards</> }, { value: 'table', label: <><Rows3 className="size-3.5" />Table</> }]} />
            <span className="text-sm text-muted">Verified by you: <span className="tabular-nums text-mist">{checked}/{list.length}</span></span>
          </div>

          {view === 'cards' ? (
            <motion.ul key={market.at} variants={stagger} initial="hidden" animate="show" className="grid gap-3 md:grid-cols-2">
              {list.map((m, i) => (
                <motion.li key={i} variants={rise}>
                  <SpotlightCard className={cn('h-full p-5', market.checked[i] && 'ring-1 ring-teal/50')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-violet/25 to-teal/20 font-display text-lg font-bold">{m.company[0]}</div>
                        <div><h3 className="font-display text-lg font-bold leading-tight">{m.company}</h3><p className="text-sm text-muted">{m.roleTitle}</p></div>
                      </div>
                      <CheckBtn i={i} />
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div><dt className="text-xs text-muted">Experience</dt><dd>{m.experienceRange}</dd></div>
                      <div><dt className="text-xs text-muted">Pay{m.compensationIsEstimate ? ' (est.)' : ''}</dt><dd className="font-semibold">{m.compensationRange}</dd></div>
                      <div><dt className="text-xs text-muted">Location</dt><dd>{m.location}</dd></div>
                    </dl>
                    <div className="mt-4"><SourceLink m={m} /></div>
                  </SpotlightCard>
                </motion.li>
              ))}
            </motion.ul>
          ) : (
            <SpotlightCard className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs text-muted"><tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-normal"><th>Company</th><th>Experience</th><th>Compensation</th><th>Location</th><th>Source</th><th /></tr></thead>
                <tbody>
                  {list.map((m, i) => (
                    <tr key={i} className="border-t border-white/8 [&>td]:px-4 [&>td]:py-3">
                      <td><p className="font-semibold">{m.company}</p><p className="text-xs text-muted">{m.roleTitle}</p></td>
                      <td>{m.experienceRange}</td>
                      <td className="font-semibold">{m.compensationRange}{m.compensationIsEstimate && <span className="ml-1 text-xs font-normal text-amber">est.</span>}</td>
                      <td>{m.location}</td>
                      <td><SourceLink m={m} /></td>
                      <td><CheckBtn i={i} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SpotlightCard>
          )}

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {market.caveats.length > 0 && (
              <SpotlightCard className="p-5">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Info className="size-4 text-amber" /> Caveats</p>
                <ul className="space-y-1.5 text-sm text-muted">{market.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
              </SpotlightCard>
            )}
            {(market.sources.length > 0 || market.searchQueries.length > 0) && (
              <SpotlightCard className="p-5">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Building2 className="size-4 text-teal" /> What the AI searched</p>
                {market.searchQueries.length > 0 && <div className="mb-3 flex flex-wrap gap-1.5">{market.searchQueries.map((q) => <Badge key={q} tone="sky"><Search className="size-3" />{q}</Badge>)}</div>}
                <ul className="space-y-1 text-sm">{market.sources.map((s) => <li key={s.url} className="truncate"><a href={s.url} target="_blank" rel="noreferrer" className="text-mist/85 hover:text-teal hover:underline">{s.title}</a></li>)}</ul>
              </SpotlightCard>
            )}
          </div>

          <p className="mt-4 text-xs text-muted/80">Pay figures change quickly and AI search can be wrong. Confirm with the linked source before quoting.</p>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
            <Button iconRight={ArrowRight} onClick={onNext}>Continue to search strings</Button>
          </div>
        </>
      )}
    </div>
  );
}
