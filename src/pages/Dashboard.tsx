import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Briefcase, Building2, Check, Clock3, FolderSearch, MapPin, Pencil, Plus, Search, Trash2, Trophy, UserRoundCog, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ProjectSummary } from '@shared/schemas';
import { request } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { cn, scoreColor } from '@/lib/utils';
import { AppHeader } from '@/components/UserMenu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Dialog, DialogClose, DialogContent, Segmented, Tip } from '@/components/ui/primitives';
import { NumberTicker } from '@/components/fx/NumberTicker';
import { STEPS } from '@/components/Steps';
import { EmptyState, easeSoft, rise, stagger } from '@/components/common';

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d} d ago` : new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

function ProgressRing({ value }: { value: number }) {
  const r = 20, c = 2 * Math.PI * r, pct = value / 7;
  return (
    <div className="relative grid size-12 shrink-0 place-items-center">
      <svg width="48" height="48" className="-rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="4" />
        <motion.circle cx="24" cy="24" r={r} fill="none" stroke={pct === 1 ? 'var(--color-teal)' : 'var(--color-violet)'} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: 0.8, ease: easeSoft }} />
      </svg>
      <span className="absolute text-xs font-bold tabular-nums">{value}/7</span>
    </div>
  );
}

/** Title that turns into an input on click; Enter saves, Escape cancels. */
function EditableTitle({ p, onRename }: { p: ProjectSummary; onRename: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(p.title);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);
  useEffect(() => { if (!editing) setValue(p.title); }, [p.title, editing]);
  const commit = () => {
    const t = value.trim();
    setEditing(false);
    if (t && t !== p.title) onRename(t);
    else setValue(p.title);
  };
  return editing ? (
    <div className="flex items-center gap-1">
      <input ref={ref} value={value} maxLength={90} onChange={(e) => setValue(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setValue(p.title); setEditing(false); } }} aria-label="Search title" className="neu-field px-3 py-1.5 font-display text-lg font-bold" />
      <button onMouseDown={(e) => e.preventDefault()} onClick={commit} className="rounded-lg p-1.5 text-teal hover:bg-white/8" aria-label="Save title"><Check className="size-4" /></button>
    </div>
  ) : (
    <div className="group/title flex min-w-0 items-center gap-1.5">
      <h3 className="truncate font-display text-lg font-bold" onDoubleClick={() => setEditing(true)}>{p.title}</h3>
      <Tip content="Rename"><button onClick={() => setEditing(true)} className="rounded-lg p-1 text-muted opacity-60 transition-opacity hover:bg-white/8 hover:text-mist group-hover/title:opacity-100" aria-label={`Rename ${p.title}`}><Pencil className="size-3.5" /></button></Tip>
    </div>
  );
}

type Filter = 'all' | 'active' | 'done';

export default function Dashboard() {
  const user = useAuth((s) => s.user)!;
  const nav = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [toDelete, setToDelete] = useState<ProjectSummary | null>(null);

  const projects = useQuery({ queryKey: ['projects'], queryFn: () => request<{ projects: ProjectSummary[] }>('GET', 'projects') });
  const list = projects.data?.projects ?? [];

  const create = useMutation({
    mutationFn: () => request<{ project: ProjectSummary }>('POST', 'projects', {}),
    onSuccess: ({ project }) => {
      qc.setQueryData<{ projects: ProjectSummary[] }>(['projects'], (o) => ({ projects: [project, ...(o?.projects ?? [])] }));
      nav(`/app/p/${project.id}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => request<{ project: ProjectSummary }>('PATCH', `projects/${id}`, { title }),
    onMutate: ({ id, title }) => {
      const prev = qc.getQueryData<{ projects: ProjectSummary[] }>(['projects']);
      qc.setQueryData<{ projects: ProjectSummary[] }>(['projects'], (o) => o && { projects: o.projects.map((p) => (p.id === id ? { ...p, title } : p)) });
      return { prev };
    },
    onError: (e, _v, ctx) => { qc.setQueryData(['projects'], ctx?.prev); toast.error((e as Error).message); },
    onSuccess: () => toast.success('Title updated'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => request('DELETE', `projects/${id}`),
    onMutate: (id) => qc.setQueryData<{ projects: ProjectSummary[] }>(['projects'], (o) => o && { projects: o.projects.filter((p) => p.id !== id) }),
    onSuccess: () => toast.success('Search deleted'),
    onError: (e) => { toast.error((e as Error).message); qc.invalidateQueries({ queryKey: ['projects'] }); },
  });

  const visible = list.filter((p) => (filter === 'done' ? p.completed === 7 : filter === 'active' ? p.completed < 7 : true)).filter((p) => !q || `${p.title} ${p.role ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const totalCandidates = list.reduce((n, p) => n + p.candidates, 0);
  const profile = user.profile;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:py-12">
        {/* Greeting + profile */}
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: easeSoft }} className="flex flex-col justify-end">
            <p className="text-sm text-muted">{greeting()},</p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{user.name.split(' ')[0]}</h1>
            <p className="mt-2 max-w-xl text-muted">Start a hiring search or pick up a previous one. Every search saves automatically.</p>
            <div className="mt-6"><Button size="lg" icon={Plus} loading={create.isPending} onClick={() => create.mutate()}>New hiring search</Button></div>
          </motion.div>
          <SpotlightCard className="p-5">
            <div className="flex items-start justify-between">
              <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-violet/30 to-teal/25"><Building2 className="size-5 text-teal" /></div>
              <Button size="sm" variant="ghost" icon={UserRoundCog} onClick={() => nav('/app/profile')}>Edit</Button>
            </div>
            {profile?.type === 'organisation' && (
              <>
                <p className="mt-3 font-display text-xl font-bold">{profile.company}</p>
                <p className="text-sm text-muted">{profile.designation} · {profile.companySize} employees</p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><MapPin className="size-3.5" />{profile.location} · {profile.industry}</p>
                <div className="mt-3 flex flex-wrap gap-1">{profile.hiringFor.map((r) => <Badge key={r} tone="teal">{r}</Badge>)}</div>
              </>
            )}
          </SpotlightCard>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['Searches', list.length, FolderSearch],
            ['Completed', list.filter((p) => p.completed === 7).length, Check],
            ['Candidates screened', totalCandidates, Users],
            ['In progress', list.filter((p) => p.completed < 7).length, Clock3],
          ].map(([label, value, Icon]) => {
            const I = Icon as typeof Users;
            return (
              <SpotlightCard key={label as string} className="p-4">
                <p className="flex items-center gap-1.5 text-xs text-muted"><I className="size-3.5 text-teal" />{label as string}</p>
                <NumberTicker value={value as number} className="mt-1 block font-display text-3xl font-bold tabular-nums" />
              </SpotlightCard>
            );
          })}
        </div>

        {/* History */}
        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold">Recent history</h2>
              <p className="text-sm text-muted">Click a title or the pencil to rename it.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search history" aria-label="Search history" className="neu-field w-52 py-2 pl-9 pr-3 text-sm" />
              </div>
              <Segmented<Filter> value={filter} onChange={(v) => setFilter(v || 'all')} size="md" options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'In progress' }, { value: 'done', label: 'Completed' }]} />
            </div>
          </div>

          {projects.isLoading && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-24 rounded-3xl" />)}</div>}
          {projects.error && <p className="text-sm text-coral">{(projects.error as Error).message}</p>}

          {!projects.isLoading && !list.length && (
            <EmptyState icon={FolderSearch} title="No searches yet" action={<Button icon={Plus} loading={create.isPending} onClick={() => create.mutate()}>Start your first search</Button>}>
              Each search walks you through the seven steps and saves here so you can come back to it.
            </EmptyState>
          )}

          <motion.ul variants={stagger} initial="hidden" animate="show" className="space-y-3">
            <AnimatePresence initial={false}>
              {visible.map((p) => (
                <motion.li key={p.id} variants={rise} layout exit={{ opacity: 0, x: -30, transition: { duration: 0.2 } }}>
                  <SpotlightCard className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-4">
                      <ProgressRing value={p.completed} />
                      <div className="min-w-0 flex-1">
                        <EditableTitle p={p} onRename={(title) => rename.mutate({ id: p.id, title })} />
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                          {p.role && <span className="flex items-center gap-1"><Briefcase className="size-3.5" />{p.role}</span>}
                          <span className="flex items-center gap-1"><Users className="size-3.5" />{p.candidates} CV{p.candidates === 1 ? '' : 's'}</span>
                          {p.top && <span className="flex items-center gap-1"><Trophy className="size-3.5 text-amber" />{p.top.name} <b style={{ color: scoreColor(p.top.score) }}>{p.top.score}</b></span>}
                          <span className="flex items-center gap-1"><Clock3 className="size-3.5" />{ago(p.updatedAt)}</span>
                        </div>
                        <div className="mt-2.5 flex gap-1" aria-label={`${p.completed} of 7 steps complete`}>
                          {STEPS.map((s) => (
                            <Tip key={s.key} content={s.title}><span className={cn('h-1.5 w-7 rounded-full', s.n <= 1 || s.n <= p.completed ? 'bg-teal/80' : 'bg-white/10')} /></Tip>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Tip content="Delete"><Button variant="ghost" size="icon" icon={Trash2} onClick={() => setToDelete(p)} aria-label={`Delete ${p.title}`} /></Tip>
                        <Button size="sm" variant={p.completed === 7 ? 'glass' : 'primary'} iconRight={ArrowRight} onClick={() => nav(`/app/p/${p.id}`)}>{p.completed === 7 ? 'Open' : 'Continue'}</Button>
                      </div>
                    </div>
                  </SpotlightCard>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
          {list.length > 0 && !visible.length && <p className="py-10 text-center text-sm text-muted">Nothing matches that search.</p>}
        </section>
      </main>

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        {toDelete && (
          <DialogContent title="Delete this search?" description={`“${toDelete.title}” and all its results will be removed. This can’t be undone.`} className="w-[min(92vw,460px)]">
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button variant="ghost" icon={X}>Cancel</Button></DialogClose>
              <Button variant="danger" icon={Trash2} onClick={() => { remove.mutate(toDelete.id); setToDelete(null); }}>Delete</Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
