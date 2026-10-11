import { Hono, type Context } from 'hono';
import { sign, verify } from 'hono/jwt';
import { streamSSE } from 'hono/streaming';
import { secureHeaders } from 'hono/secure-headers';
import type { z } from 'zod';
import {
  JDBody, JDSchema, LoginBody2, MarketSchema, ParseJDBody, ProfileSchema, QuestionsSchema, RankBatchSchema, RankBody,
  RenameBody, SaveProjectBody, SearchStringsSchema, SignupBody, type AccountType, type AIMeta, type Insight, type JD,
  type PublicUser, type RankResult, type Source, type StreamEvent,
} from '../../shared/schemas';
import { createUser, ensureDemoUsers, getUser, saveProfile, verifyLogin } from './users';
import { createProject, deleteProject, getProject, listProjects, renameProject, saveProject } from './projects';
import { checkLink, openingsLink, searchLink } from './links';
import { storageMode } from './kv';
import { HttpError, generateJSON, pool, providerInfo, jdBrief } from './ai';
import { marketPrompt, parseJDPrompt, questionsPrompt, rankPrompt, searchStringsPrompt } from './prompts';
import { getRouteCache, setRouteCache, getCandidateCache, setCandidateCache, TTL_WEEK, TTL_DAY } from './cache';

type Vars = { Variables: { user: { id: string; email: string; accountType: AccountType } } };
const app = new Hono<Vars>().basePath('/api');
const secret = () => process.env.AUTH_SECRET || 'sift-dev-secret-change-me';

app.use('*', secureHeaders());

/* ---------- helpers ---------- */
async function body<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message || 'Invalid request.');
  return parsed.data;
}

/** Streams a job over Server-Sent Events: progress updates, items, then a final result or error.
 *  The heartbeat keeps long web searches alive on the Edge runtime. */
function sse(c: Context, job: (emit: (e: StreamEvent) => Promise<void>) => Promise<{ data: unknown; meta?: AIMeta }>) {
  return streamSSE(c, async (stream) => {
    const emit = (e: StreamEvent) => stream.writeSSE({ data: JSON.stringify(e) });
    const beat = setInterval(() => stream.writeSSE({ event: 'ping', data: '' }).catch(() => {}), 5000);
    try {
      const { data, meta } = await job(emit);
      await emit({ type: 'result', data, meta });
    } catch (e) {
      const err = e as HttpError;
      if (!(err instanceof HttpError)) console.error('[sift]', e);
      await emit({ type: 'error', message: err.message || 'Something went wrong.', status: err.status || 500 });
    } finally {
      clearInterval(beat);
    }
  });
}

/* ---------- public ---------- */
app.get('/health', (c) => {
  const { configured } = providerInfo();
  return c.json({ ok: true, ai: configured, storage: storageMode() });
});

async function issue(c: Context, user: PublicUser) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const token = await sign({ sub: user.id, email: user.email, type: user.accountType, exp }, secret(), 'HS256');
  return c.json({ token, user, expiresAt: exp * 1000 });
}

app.post('/auth/signup', async (c) => {
  const b = await body(c, SignupBody);
  await ensureDemoUsers();
  const user = await createUser({ name: b.name, email: b.email, password: b.password });
  return issue(c, user);
});

app.post('/auth/login', async (c) => {
  const b = await body(c, LoginBody2);
  return issue(c, await verifyLogin(b.email, b.password));
});

/* ---------- auth guard ---------- */
app.use('*', async (c, next) => {
  const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in to continue.');
  try {
    const p = await verify(token, secret(), 'HS256');
    c.set('user', { id: String(p.sub), email: String(p.email), accountType: p.type as AccountType });
  } catch {
    throw new HttpError(401, 'Your session expired. Sign in again.');
  }
  await next();
});

/* ---------- profile ---------- */
app.get('/me', async (c) => c.json({ user: await getUser(c.get('user').id) }));
app.put('/me/profile', async (c) => {
  const profile = await body(c, ProfileSchema);
  return c.json({ user: await saveProfile(c.get('user').id, profile) });
});

/* ---------- saved searches (history) ---------- */
app.get('/projects', async (c) => c.json({ projects: await listProjects(c.get('user').id) }));
app.post('/projects', async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  return c.json({ project: await createProject(c.get('user').id, typeof raw.title === 'string' ? raw.title.slice(0, 90) : undefined) });
});
app.get('/projects/:id', async (c) => c.json({ project: await getProject(c.get('user').id, c.req.param('id')) }));
app.put('/projects/:id', async (c) => {
  const b = await body(c, SaveProjectBody);
  return c.json({ project: await saveProject(c.get('user').id, c.req.param('id'), b.data, b.title) });
});
app.patch('/projects/:id', async (c) => {
  const { title } = await body(c, RenameBody);
  return c.json({ project: await renameProject(c.get('user').id, c.req.param('id'), title) });
});
app.delete('/projects/:id', async (c) => {
  await deleteProject(c.get('user').id, c.req.param('id'));
  return c.json({ ok: true });
});

/* ---------- 2. JD understanding ---------- */
app.post('/parse-jd', async (c) => {
  const { text } = await body(c, ParseJDBody);
  return sse(c, async (emit) => {
    await emit({ type: 'progress', message: 'Reading the job description' });
    const prompt = parseJDPrompt(text);
    const cached = await getRouteCache<z.infer<typeof JDSchema>>('parse-jd', prompt);
    if (cached) {
      if (cached.isJobDescription === false) throw new HttpError(422, "This doesn't look like a job description. Check the file and try again.");
      const { isJobDescription: _drop, ...jd } = cached;
      return { data: jd, meta: { provider: 'groq', model: 'cache', ms: 0 } };
    }
    const { data, meta } = await generateJSON(JDSchema, { prompt, maxTokens: 1500, reasoning_effort: 'low' });
    if (data.isJobDescription === false) throw new HttpError(422, "This doesn't look like a job description. Check the file and try again.");
    await setRouteCache('parse-jd', prompt, data, TTL_WEEK);
    const { isJobDescription: _drop, ...jd } = data;
    return { data: jd, meta };
  });
});

/* ---------- 4. Stack ranking (streams each candidate as it's scored) ---------- */
const scrub = (t: string) =>
  t
    .replace(/^[ \t]*(?:gender|sex|age|date of birth|d\.?\s?o\.?\s?b\.?|marital status|religion|caste|nationality|father'?s name|mother'?s name|spouse(?:'s)? name|photo(?:graph)?)\b[ \t]*[:\-–][^\n]*$/gim, '[personal detail removed]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/(?:\+\d{1,3}[\s-]?)?\b\d{5}[\s-]?\d{5}\b/g, '[phone]');

const cleanCVText = (t: string) =>
  scrub(t)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
    .slice(0, 7000);

function finalize(jd: JD, r: z.infer<typeof RankBatchSchema>['results'][number]): RankResult {
  const b = r.breakdown;
  const matchedLower = new Set(r.matchedSkills.map((s) => s.toLowerCase()));
  const missing = Array.from(new Set([...r.missingSkills, ...jd.keySkills.filter((s) => !matchedLower.has(s.toLowerCase()))])).filter(
    (s) => !matchedLower.has(s.toLowerCase())
  );
  return { ...r, missingSkills: missing, evidence: r.evidence.slice(0, 4), score: b.skills + b.experience + b.relevance + b.education };
}

app.post('/rank', async (c) => {
  const { jd, candidates } = await body(c, RankBody);
  const clean = candidates.map((x) => ({ id: x.id, text: cleanCVText(x.text) })).filter((x) => x.text.trim().length > 50);
  if (!clean.length) throw new HttpError(400, 'None of the CVs had readable text.');

  return sse(c, async (emit) => {
    const brief = jdBrief(jd);
    let done = 0;
    let meta: AIMeta | undefined;
    const t0 = Date.now();

    const uncached: typeof clean = [];
    const cachedItems: RankResult[] = [];

    for (const cand of clean) {
      const cached = await getCandidateCache<z.infer<typeof RankBatchSchema>['results'][number]>(brief, cand.text);
      if (cached) {
        cachedItems.push(finalize(jd, { ...cached, id: cand.id }));
      } else {
        uncached.push(cand);
      }
    }

    // Immediately emit cached items as normal SSE "item" events
    for (const item of cachedItems) {
      done++;
      await emit({ type: 'item', item });
      await emit({ type: 'progress', message: `Scored ${done} of ${clean.length}`, done, total: clean.length });
    }

    // Cache hits skip the AI entirely
    if (uncached.length === 0) {
      return { data: { failed: [], rankedAt: new Date().toISOString() }, meta: { provider: 'groq', model: 'cache', ms: Date.now() - t0 } };
    }

    const BATCH = 2;
    const batches = Array.from({ length: Math.ceil(uncached.length / BATCH) }, (_, i) => uncached.slice(i * BATCH, i * BATCH + BATCH));
    await emit({ type: 'progress', message: `Scoring ${uncached.length} CVs in ${batches.length} parallel batches`, done, total: clean.length });

    const settled = await pool(batches, 4, async (batch) => {
      const out = await generateJSON(RankBatchSchema, {
        prompt: rankPrompt(jd, batch),
        temperature: 0,
        maxTokens: 2500,
        tier: 'heavy',
        reasoning_effort: 'low',
      });
      meta = out.meta;
      const byId = new Map(out.data.results.map((r) => [r.id, r]));
      for (const cand of batch) {
        const r = byId.get(cand.id);
        if (!r) throw new Error(`Missing result for ${cand.id}`);
        await setCandidateCache(brief, cand.text, r);
        done++;
        await emit({ type: 'item', item: finalize(jd, r) });
        await emit({ type: 'progress', message: `Scored ${done} of ${clean.length}`, done, total: clean.length });
      }
    });

    const failed = settled.flatMap((s, i) => (s.status === 'rejected' ? batches[i].map((x) => x.id) : []));
    if (failed.length === uncached.length && cachedItems.length === 0) {
      const reason = (settled.find((s) => s.status === 'rejected') as PromiseRejectedResult)?.reason;
      throw reason instanceof HttpError ? reason : new HttpError(502, 'Ranking failed. Try again.');
    }
    return { data: { failed, rankedAt: new Date().toISOString() }, meta: meta && { ...meta, ms: Date.now() - t0 } };
  });
});

/* ---------- 5. Screening questions ---------- */
app.post('/questions', async (c) => {
  const { jd } = await body(c, JDBody);
  return sse(c, async (emit) => {
    await emit({ type: 'progress', message: 'Drafting technical, experience and fit questions' });
    const prompt = questionsPrompt(jd);
    const cached = await getRouteCache<z.infer<typeof QuestionsSchema>>('questions', prompt);
    if (cached) {
      return { data: { questions: cached.questions.slice(0, 10) }, meta: { provider: 'groq', model: 'cache', ms: 0 } };
    }
    const { data, meta } = await generateJSON(QuestionsSchema, { prompt, temperature: 0.4, maxTokens: 2500, reasoning_effort: 'low' });
    await setRouteCache('questions', prompt, data, TTL_WEEK);
    return { data: { questions: data.questions.slice(0, 10) }, meta };
  });
});

/* ---------- 6. Hiring market (live web search) ---------- */
app.post('/market', async (c) => {
  const { jd } = await body(c, JDBody);
  return sse(c, async (emit) => {
    await emit({ type: 'progress', message: `Searching public job posts for ${jd.role}` });
    const prompt = marketPrompt(jd);
    const cached = await getRouteCache<{ data: z.infer<typeof MarketSchema>; sources: Source[]; queries: string[] }>('market', prompt);
    let out: { data: z.infer<typeof MarketSchema>; sources: Source[]; queries: string[]; meta?: AIMeta };
    if (cached) {
      out = { data: cached.data, sources: cached.sources || [], queries: cached.queries || [], meta: { provider: 'groq', model: 'cache', ms: 0 } };
    } else {
      const slow = setTimeout(() => emit({ type: 'progress', message: 'Reading salary pages and careers sites' }).catch(() => {}), 9000);
      const generated = await generateJSON(MarketSchema, {
        prompt,
        webSearch: true,
        maxTokens: 3000,
        tier: 'heavy',
        reasoning_effort: 'low',
      }).finally(() => clearTimeout(slow));
      await setRouteCache('market', prompt, { data: generated.data, sources: generated.sources, queries: generated.queries }, TTL_DAY);
      out = generated;
    }
    await emit({ type: 'progress', message: 'Checking every source link' });

    const rows = out.data.insights;
    const statuses = await Promise.all(rows.map((i) => (i.sourceUrl ? checkLink(i.sourceUrl) : Promise.resolve('broken' as const))));
    const insights: Insight[] = rows.map((i, k) => {
      const named = i.sourceName.trim();
      const basis = !i.sourceUrl && !named ? 'Estimate' : i.basis;
      const base = { ...i, roleTitle: i.roleTitle || jd.role, basis };
      const verified = statuses[k] === 'ok' && !!i.sourceUrl;
      return {
        ...base,
        sourceName: basis === 'Estimate' && !named ? 'AI estimate' : named || 'Web search',
        compensationIsEstimate: basis === 'Estimate' || i.compensationIsEstimate,
        linkStatus: verified ? 'verified' : 'search',
        link: verified ? i.sourceUrl! : searchLink(base),
        openingsUrl: openingsLink(base),
        sourceUrl: verified ? i.sourceUrl : null,
      };
    });
    return {
      data: { insights, marketSummary: out.data.marketSummary, caveats: out.data.caveats, sources: out.sources.slice(0, 12), searchQueries: out.queries },
      meta: out.meta,
    };
  });
});

/* ---------- 7. Search strings ---------- */
app.post('/search-strings', async (c) => {
  const { jd } = await body(c, JDBody);
  return sse(c, async (emit) => {
    await emit({ type: 'progress', message: 'Building Boolean and plain strings' });
    const prompt = searchStringsPrompt(jd);
    const cached = await getRouteCache<z.infer<typeof SearchStringsSchema>>('search-strings', prompt);
    if (cached) {
      return { data: cached, meta: { provider: 'groq', model: 'cache', ms: 0 } };
    }
    const { data, meta } = await generateJSON(SearchStringsSchema, {
      prompt,
      maxTokens: 1500,
      reasoning_effort: 'low',
    });
    if (!data.linkedin.boolean || !data.naukri.boolean) throw new HttpError(502, 'Incomplete search strings returned. Try again.');
    await setRouteCache('search-strings', prompt, data, TTL_WEEK);
    return { data, meta };
  });
});

app.onError((err, c) => {
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) console.error('[sift]', err);
  return c.json({ error: err.message || 'Something went wrong.' }, status as 400);
});
app.notFound((c) => c.json({ error: `No API route ${c.req.path}` }, 404));

export default app;
