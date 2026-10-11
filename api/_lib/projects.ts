import type { ProjectSummary } from '../../shared/schemas';
import { HttpError } from './ai';
import { kv } from './kv';

const idx = (uid: string) => `projects:${uid}`;
const doc = (uid: string, id: string) => `project:${uid}:${id}`;
const MAX_BYTES = 900_000;

type Data = Record<string, any>;

/** Derives the dashboard card from the saved workspace state (server-side, so it can't drift). */
export function summarize(id: string, title: string, data: Data, createdAt: number): ProjectSummary {
  const readyCvs = Array.isArray(data.cvs) ? data.cvs.filter((c: any) => c?.status === 'ready') : [];
  const results: any[] = data.ranking?.results || [];
  const best = results
    .map((r) => ({ name: r.nameGuess || r.fileName || 'Candidate', score: r.override?.score ?? r.score }))
    .sort((a, b) => b.score - a.score)[0];
  const completed = 1 + [!!data.jd, readyCvs.length > 0, !!data.ranking?.rankedAt, !!data.questions, !!data.market, !!data.strings].filter(Boolean).length;
  return {
    id,
    title,
    role: data.jd?.role || null,
    completed,
    step: Number(data.step) || 2,
    candidates: readyCvs.length,
    top: best ?? null,
    createdAt,
    updatedAt: Date.now(),
  };
}

export async function listProjects(uid: string) {
  const vals = await kv.hvals(idx(uid));
  return vals.map((v) => JSON.parse(v) as ProjectSummary).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createProject(uid: string, title?: string) {
  const id = crypto.randomUUID().slice(0, 12);
  const now = Date.now();
  const t = title?.trim() || `Untitled search · ${new Date(now).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
  const summary = summarize(id, t, { step: 2 }, now);
  await kv.set(doc(uid, id), JSON.stringify({ id, title: t, createdAt: now, data: { step: 2 } }));
  await kv.hset(idx(uid), id, JSON.stringify(summary));
  return summary;
}

async function loadDoc(uid: string, id: string) {
  const raw = await kv.get(doc(uid, id));
  if (!raw) throw new HttpError(404, 'This search no longer exists.');
  return JSON.parse(raw) as { id: string; title: string; createdAt: number; data: Data };
}

export async function getProject(uid: string, id: string) {
  const d = await loadDoc(uid, id);
  const summary = JSON.parse((await kv.hget(idx(uid), id)) || 'null') as ProjectSummary | null;
  return { ...d, updatedAt: summary?.updatedAt ?? d.createdAt };
}

export async function saveProject(uid: string, id: string, data: Data, title?: string) {
  const d = await loadDoc(uid, id);
  const nextTitle = title ?? d.title;
  const body = JSON.stringify({ ...d, title: nextTitle, data });
  if (body.length > MAX_BYTES) throw new HttpError(413, 'This search is too large to save. Remove some CVs and try again.');
  await kv.set(doc(uid, id), body);
  const summary = summarize(id, nextTitle, data, d.createdAt);
  await kv.hset(idx(uid), id, JSON.stringify(summary));
  return summary;
}

export async function renameProject(uid: string, id: string, title: string) {
  const d = await loadDoc(uid, id);
  return saveProject(uid, id, d.data, title);
}

export async function deleteProject(uid: string, id: string) {
  await kv.del(doc(uid, id));
  await kv.hdel(idx(uid), id);
}
