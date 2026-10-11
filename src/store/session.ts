import { create } from 'zustand';
import type { AIMeta, JD, Market, Question, RankResult, SearchStrings } from '@shared/schemas';

export type CVKind = 'pdf' | 'docx' | 'other';
export type CV = {
  id: string;
  fileName: string;
  size: number;
  kind: CVKind;
  status: 'queued' | 'reading' | 'ready' | 'error';
  lane?: number;
  text?: string;
  removed?: string[];
  nameGuess?: string | null;
  words?: number;
  pages?: number;
  ms?: number;
  error?: string;
};
export type Decision = 'shortlist' | 'hold' | 'reject';
export type RankedCandidate = RankResult & {
  fileName?: string;
  nameGuess?: string | null;
  override?: { score: number; note: string };
  decision?: Decision;
};
export type Ranking = { results: RankedCandidate[]; failed: string[]; rankedAt?: string; meta?: AIMeta; signature: string };
export type Stamped<T> = T & { meta?: AIMeta; at: number };

type Session = {
  projectId: string | null;
  title: string;
  step: number;
  jdText: string;
  jdFile: string | null;
  jd: (JD & { edited?: boolean }) | null;
  jdMeta: (AIMeta & { at: number }) | null;
  cvs: CV[];
  ranking: Ranking | null;
  questions: Stamped<{ questions: Question[] }> | null;
  market: Stamped<Market & { checked: Record<number, boolean> }> | null;
  strings: Stamped<SearchStrings> | null;
};
type Actions = {
  set: <K extends keyof Session>(key: K, value: Session[K] | ((prev: Session[K]) => Session[K])) => void;
  /** Load a saved search from the server into the workspace. */
  hydrate: (id: string, title: string, data: Partial<Session>) => void;
  reset: () => void;
};

/** Fields saved to the server for each search. */
export const SAVED_KEYS = ['step', 'jdText', 'jdFile', 'jd', 'jdMeta', 'cvs', 'ranking', 'questions', 'market', 'strings'] as const;
export function snapshot(s: Session) {
  const out: Record<string, unknown> = {};
  for (const k of SAVED_KEYS) out[k] = k === 'cvs' ? s.cvs.filter((c) => c.status === 'ready' || c.status === 'error').map((c) => ({ ...c, text: c.text?.slice(0, 12000) })) : s[k];
  return out;
}

const EMPTY: Session = { projectId: null, title: '', step: 2, jdText: '', jdFile: null, jd: null, jdMeta: null, cvs: [], ranking: null, questions: null, market: null, strings: null };

export const useSession = create<Session & Actions>()((set) => ({
  ...EMPTY,
  set: (key, value) =>
    set((s) => ({ [key]: typeof value === 'function' ? (value as (p: unknown) => unknown)(s[key]) : value }) as Partial<Session>),
  hydrate: (id, title, data) => {
    const picked: Partial<Session> = {};
    for (const k of SAVED_KEYS) if (data[k] !== undefined) (picked as Record<string, unknown>)[k] = data[k];
    set({ ...EMPTY, ...picked, projectId: id, title });
  },
  reset: () => set(EMPTY),
}));

export const rankingSignature = (jd: JD | null, cvs: CV[]) =>
  JSON.stringify({
    ids: cvs.filter((c) => c.status === 'ready').map((c) => c.id).sort(),
    role: jd?.role,
    skills: jd?.keySkills,
    exp: [jd?.experience.min, jd?.experience.max],
  });
