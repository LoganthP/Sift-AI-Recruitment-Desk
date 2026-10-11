import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight, CloudCheck, CloudOff, Command as CmdIcon, FileDown, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { ProjectSummary } from '@shared/schemas';
import { request } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useSession } from '@/store/session';
import { useAutosave, type SaveState } from '@/lib/useAutosave';
import { download, reportMarkdown } from '@/lib/download';
import { slug } from '@/lib/utils';
import { SAMPLE_JD } from '@/lib/sampleJd';
import { AppHeader } from '@/components/UserMenu';
import { Sidebar } from '@/components/Sidebar';
import { CommandMenu, useCommandActions } from '@/components/CommandMenu';
import { Button } from '@/components/ui/button';
import { Kbd, Tip } from '@/components/ui/primitives';
import { EmptyState, easeSoft } from '@/components/common';
import { useRankingExport } from '@/lib/rankingExport';
import type { StepKey } from '@/components/Steps';

const JDStep = lazy(() => import('@/features/JDStep'));
const CVStep = lazy(() => import('@/features/CVStep'));
const RankStep = lazy(() => import('@/features/RankStep'));
const QuestionsStep = lazy(() => import('@/features/QuestionsStep'));
const MarketStep = lazy(() => import('@/features/MarketStep'));
const SearchStep = lazy(() => import('@/features/SearchStep'));

type ProjectDoc = { id: string; title: string; createdAt: number; updatedAt: number; data: Record<string, unknown> };

function StepFallback() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-6 w-28 rounded-full" />
      <div className="skeleton h-12 w-2/3 rounded-2xl" />
      <div className="skeleton h-64 rounded-3xl" />
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);
  const label =
    state.status === 'saving' ? 'Saving…'
    : state.status === 'error' ? 'Not saved'
    : state.status === 'saved' ? (Date.now() - (state.at || 0) < 60000 ? 'Saved just now' : 'Saved') : 'All changes saved';
  const Icon = state.status === 'saving' ? Loader2 : state.status === 'error' ? CloudOff : CloudCheck;
  return (
    <Tip content={state.status === 'error' ? state.message || 'Saving failed. We’ll retry on your next change.' : 'Your search saves automatically'}>
      <span className={`hidden items-center gap-1.5 text-xs sm:flex ${state.status === 'error' ? 'text-coral' : 'text-muted'}`} aria-live="polite">
        <Icon className={`size-3.5 ${state.status === 'saving' ? 'animate-spin' : ''}`} /> {label}
      </span>
    </Tip>
  );
}

function TitleEditor() {
  const { title, set } = useSession();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(title);
  const qc = useQueryClient();
  const commit = () => {
    setEditing(false);
    const t = v.trim();
    if (!t || t === title) return setV(title);
    set('title', t);
    qc.setQueryData<{ projects: ProjectSummary[] }>(['projects'], (o) => o && { projects: o.projects.map((p) => (p.id === useSession.getState().projectId ? { ...p, title: t } : p)) });
  };
  if (editing)
    return <input autoFocus value={v} maxLength={90} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setV(title); setEditing(false); } }} className="neu-field w-56 px-2.5 py-1 text-sm sm:w-72" aria-label="Search title" />;
  return (
    <button onClick={() => { setV(title); setEditing(true); }} className="group flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm hover:bg-white/5" aria-label="Rename this search">
      <span className="max-w-[40vw] truncate font-medium sm:max-w-xs">{title}</span>
      <Pencil className="size-3.5 shrink-0 text-muted opacity-60 group-hover:opacity-100" />
    </button>
  );
}

export default function Workspace() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const s = useSession();
  const [cmdOpen, setCmdOpen] = useState(false);
  const { rows, exportCsv } = useRankingExport();
  const health = useQuery({ queryKey: ['health'], queryFn: () => fetch('/api/health').then((r) => r.json() as Promise<{ ai: boolean }>), staleTime: 60_000 });

  const project = useQuery({ queryKey: ['project', id], queryFn: () => request<{ project: ProjectDoc }>('GET', `projects/${id}`), staleTime: Infinity, gcTime: 0, retry: false });
  useEffect(() => {
    const p = project.data?.project;
    if (p && useSession.getState().projectId !== p.id) useSession.getState().hydrate(p.id, p.title, p.data);
  }, [project.data]);
  const ready = s.projectId === id;
  const { state: saveState } = useAutosave(id, ready);

  const create = useMutation({
    mutationFn: () => request<{ project: ProjectSummary }>('POST', 'projects', {}),
    onSuccess: ({ project }) => {
      qc.setQueryData<{ projects: ProjectSummary[] }>(['projects'], (o) => o && { projects: [project, ...o.projects] });
      nav(`/app/p/${project.id}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const readyCvs = s.cvs.filter((c) => c.status === 'ready').length;
  const unlocked = (n: number) => n === 2 || (n === 3 && !!s.jd) || (n === 4 && !!s.jd && readyCvs > 0) || (n >= 5 && !!s.jd);
  const done: Record<StepKey, boolean> = { login: true, jd: !!s.jd, cvs: readyCvs > 0, rank: !!s.ranking?.rankedAt, questions: !!s.questions, market: !!s.market, search: !!s.strings };
  const step = unlocked(s.step) ? s.step : 2;
  const go = (n: number) => {
    if (!unlocked(n)) return;
    s.set('step', n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pack = s.jd
    ? () => download(`hiring-pack-${slug(s.title || s.jd!.role)}.md`, reportMarkdown({ jd: s.jd, rows: rows.map((r) => ({ ...r, needsReview: r.check.needsReview })), questions: s.questions?.questions, market: s.market, strings: s.strings }), 'text/markdown')
    : undefined;
  const actions = useCommandActions({
    go, unlocked, exportCsv, pack,
    sampleJD: () => { s.set('jdText', SAMPLE_JD); go(2); },
    reset: () => create.mutate(),
    dashboard: () => nav('/app'),
    profile: () => nav('/app/profile'),
    signOut: () => { useSession.getState().reset(); useAuth.getState().signOut(); nav('/'); },
  });

  const screens: Record<number, React.ReactNode> = {
    2: <JDStep onNext={() => go(3)} />,
    3: <CVStep onNext={() => go(4)} />,
    4: <RankStep onNext={() => go(5)} />,
    5: <QuestionsStep onNext={() => go(6)} />,
    6: <MarketStep onNext={() => go(7)} />,
    7: <SearchStep onDownloadPack={() => pack?.()} />,
  };

  return (
    <div className="min-h-screen">
      <AppHeader
        right={
          <>
            {ready && <SaveIndicator state={saveState} />}
            <button onClick={() => setCmdOpen(true)} className="glass mx-1 hidden items-center gap-2 rounded-xl px-3 py-1.5 text-sm text-muted hover:text-mist md:flex"><CmdIcon className="size-3.5" /> Actions <Kbd>⌘K</Kbd></button>
            {pack && <Tip content="Download hiring pack"><Button variant="ghost" size="icon" icon={FileDown} onClick={pack} aria-label="Download hiring pack" /></Tip>}
          </>
        }
      >
        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm text-muted sm:flex">
          <ChevronRight className="size-4 opacity-50" />
          <Link to="/app" className="rounded-lg px-1.5 py-1 hover:bg-white/5 hover:text-mist">Dashboard</Link>
          <ChevronRight className="size-4 opacity-50" />
          {ready && <TitleEditor />}
        </nav>
      </AppHeader>

      {health.data && !health.data.ai && (
        <div className="mx-auto mt-4 max-w-[1400px] px-4 sm:px-6">
          <div className="flex items-center gap-2 rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
            <AlertTriangle className="size-4 shrink-0" /> The AI service isn’t configured on the server yet, so AI steps will fail until it is.
          </div>
        </div>
      )}

      {project.error ? (
        <div className="mx-auto max-w-xl px-4 py-20">
          <EmptyState icon={AlertTriangle} title="We couldn’t open this search" action={<Button onClick={() => nav('/app')}>Back to dashboard</Button>}>{(project.error as Error).message}</EmptyState>
        </div>
      ) : !ready ? (
        <div className="mx-auto grid max-w-[1400px] gap-10 px-6 py-10 lg:grid-cols-[250px_minmax(0,1fr)]"><div className="skeleton hidden h-96 rounded-3xl lg:block" /><StepFallback /></div>
      ) : (
        <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-10 lg:py-10">
          <aside className="min-w-0">
            <Sidebar current={step} done={done} unlocked={unlocked} onSelect={go} />
          </aside>
          <main className="min-w-0 pb-20">
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }} transition={{ duration: 0.35, ease: easeSoft }}>
                <Suspense fallback={<StepFallback />}>{screens[step]}</Suspense>
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      )}
      <CommandMenu actions={actions} open={cmdOpen} setOpen={setCmdOpen} />
    </div>
  );
}
