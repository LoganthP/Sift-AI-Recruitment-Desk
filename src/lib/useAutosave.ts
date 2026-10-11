import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ProjectSummary } from '@shared/schemas';
import { request } from './api';
import { snapshot, useSession } from '@/store/session';

export type SaveState = { status: 'idle' | 'saving' | 'saved' | 'error'; at?: number; message?: string };

/** Debounced autosave of the open search; flushes on tab hide/close so nothing is lost. */
export function useAutosave(projectId: string | null, enabled: boolean) {
  const [state, setState] = useState<SaveState>({ status: 'idle' });
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const save = async (keepalive = false) => {
    if (!projectId || !dirty.current) return;
    dirty.current = false;
    const s = useSession.getState();
    setState({ status: 'saving' });
    try {
      const { project } = await request<{ project: ProjectSummary }>('PUT', `projects/${projectId}`, { data: snapshot(s), title: s.title || undefined }, { keepalive });
      setState({ status: 'saved', at: Date.now() });
      qc.setQueryData<{ projects: ProjectSummary[] }>(['projects'], (old) => (old ? { projects: [project, ...old.projects.filter((p) => p.id !== project.id)] } : old));
    } catch (e) {
      dirty.current = true;
      setState({ status: 'error', message: (e as Error).message });
    }
  };

  useEffect(() => {
    if (!enabled || !projectId) return;
    const unsub = useSession.subscribe((s, prev) => {
      if (s.projectId !== projectId || prev.projectId !== projectId) return; // ignore hydration
      if (s.cvs.some((c) => c.status === 'reading' || c.status === 'queued')) { dirty.current = true; return; }
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => save(), 1200);
    });
    const flush = () => {
      if (document.visibilityState === 'hidden') save(true);
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', () => save(true));
    return () => {
      unsub();
      document.removeEventListener('visibilitychange', flush);
      if (timer.current) clearTimeout(timer.current);
      save(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, enabled]);

  return { state, saveNow: () => { dirty.current = true; return save(); } };
}
