import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../api/_lib/app';
import { sign } from 'hono/jwt';
import { _resetModelTracking } from '../api/_lib/ai';
import { pool } from '../api/_lib/ai';

describe('E. Limits and Fallbacks (Stubbed)', () => {
  const secret = process.env.AUTH_SECRET || 'sift-dev-secret-change-me';
  const originalFetch = globalThis.fetch;
  let orgToken: string;

  beforeEach(async () => {
    _resetModelTracking();
    if ((globalThis as any).__siftMem) {
      (globalThis as any).__siftMem.str.clear();
      (globalThis as any).__siftMem.hash.clear();
    }
    process.env.GROQ_API_KEY = 'gsk_mock_limits_key';
    process.env.GROQ_MODELS_FAST = 'openai/gpt-oss-20b,llama-3.1-8b-instant';
    process.env.GROQ_MODELS_HEAVY = 'openai/gpt-oss-120b,openai/gpt-oss-20b,llama-3.3-70b-versatile';
    process.env.AI_PROVIDERS = 'groq';

    const t = await sign(
      { sub: 'org-limits', email: 'limits@test.com', type: 'organisation', exp: Math.floor(Date.now() / 1000) + 86400 * 30 },
      secret,
      'HS256'
    );
    orgToken = `Bearer ${t}`;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  function parseSSE(body: string) {
    return body
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => {
        try {
          return JSON.parse(line.slice(6));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  const sampleJD = {
    role: 'Staff Frontend Engineer',
    company: 'Sift QA Corp',
    location: 'Bengaluru',
    workMode: 'Hybrid' as const,
    experience: { min: 8, max: 12, text: '8-12 years' },
    seniority: 'Staff',
    employmentType: 'Full-time',
    keySkills: ['React', 'TypeScript', 'Performance'],
    niceToHave: ['Tailwind', 'GraphQL'],
    responsibilities: ['Architecture', 'Mentorship'],
    education: 'B.Tech',
    domain: 'Enterprise',
    summary: 'Lead frontend architecture and developer experience at scale.',
  };

  it('E.1 A 429 "tokens per day" on the first model goes straight to the next model with no waiting and response shape is unchanged', async () => {
    const calledModels: string[] = [];
    const t0 = Date.now();

    globalThis.fetch = async (input, init: any) => {
      const body = JSON.parse(init.body);
      calledModels.push(body.model);

      if (body.model === 'openai/gpt-oss-20b') {
        // TPD error
        return new Response(
          JSON.stringify({
            error: {
              message: 'Rate limit reached for model `openai/gpt-oss-20b` in organization `org`: tokens per day (TPD). Try again in 2h45m.',
              type: 'tokens',
              code: 'rate_limit_exceeded',
            },
          }),
          { status: 429 }
        );
      }

      // Second model succeeds
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(sampleJD),
              },
            },
          ],
        }),
        { status: 200 }
      );
    };

    const res = await app.request('/api/parse-jd', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Staff Frontend Engineer role with 8-12 years of experience in React and TypeScript. ' + Date.now(),
      }),
    });

    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(1500); // No waiting

    const events = parseSSE(await res.text());
    const resultEvent = events.find((e) => e.type === 'result');
    expect(resultEvent).toBeDefined();
    expect(resultEvent.data.role).toBe(sampleJD.role);
    expect(calledModels).toEqual(['openai/gpt-oss-20b', 'llama-3.1-8b-instant']);
  });

  it('E.2 A 429 per-minute limit waits once (at most 8 seconds), then falls back', async () => {
    const calls: { model: string; time: number }[] = [];

    globalThis.fetch = async (input, init: any) => {
      const body = JSON.parse(init.body);
      calls.push({ model: body.model, time: Date.now() });

      if (body.model === 'openai/gpt-oss-20b') {
        // TPM error with 2s retry
        return new Response(
          JSON.stringify({
            error: {
              message: 'Rate limit reached for requests per minute (RPM). Please try again in 1.5s.',
            },
          }),
          { status: 429 }
        );
      }

      // Next model succeeds
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(sampleJD) } }],
        }),
        { status: 200 }
      );
    };

    const t0 = Date.now();
    const res = await app.request('/api/parse-jd', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Staff Frontend Engineer role with 8-12 years of experience in React and TypeScript. ' + Date.now(),
      }),
    });

    const events = parseSSE(await res.text());
    const resultEvent = events.find((e) => e.type === 'result');
    expect(resultEvent).toBeDefined();
    expect(resultEvent.data.role).toBe(sampleJD.role);

    // openai/gpt-oss-20b should be called twice (initial + retry after wait)
    const firstModelCalls = calls.filter((c) => c.model === 'openai/gpt-oss-20b');
    expect(firstModelCalls.length).toBe(2);
    // Then fallback to llama-3.1-8b-instant
    const secondModelCalls = calls.filter((c) => c.model === 'llama-3.1-8b-instant');
    expect(secondModelCalls.length).toBe(1);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1400); // Waited ~1.5s
  });

  it('E.3 A 404 or decommissioned model is skipped', async () => {
    const calledModels: string[] = [];

    globalThis.fetch = async (input, init: any) => {
      const body = JSON.parse(init.body);
      calledModels.push(body.model);

      if (body.model === 'openai/gpt-oss-20b') {
        return new Response(
          JSON.stringify({
            error: {
              message: 'The model `openai/gpt-oss-20b` has been decommissioned.',
              code: 'model_decommissioned',
            },
          }),
          { status: 404 }
        );
      }

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(sampleJD) } }],
        }),
        { status: 200 }
      );
    };

    const res = await app.request('/api/parse-jd', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Staff Frontend Engineer role with 8-12 years of experience in React and TypeScript. ' + Date.now(),
      }),
    });

    const events = parseSSE(await res.text());
    const resultEvent = events.find((e) => e.type === 'result');
    expect(resultEvent).toBeDefined();
    expect(calledModels).toEqual(['openai/gpt-oss-20b', 'llama-3.1-8b-instant']);
  });

  it('E.4 When every model and provider is exhausted, returns friendly 429 with reset time and no provider name', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: 'Tokens per day limit reached. Try again in 45m10s.',
          },
        }),
        { status: 429 }
      );
    };

    const res = await app.request('/api/parse-jd', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Staff Frontend Engineer role with 8-12 years of experience in React and TypeScript. ' + Date.now(),
      }),
    });

    const events = parseSSE(await res.text());
    const errEvent = events.find((e) => e.type === 'error');
    expect(errEvent).toBeDefined();
    expect(errEvent.status).toBe(429);
    expect(errEvent.message).toContain("Today’s AI limit has been reached");
    expect(errEvent.message).toContain("resets in about 45 minutes");
    expect(errEvent.message).not.toContain("groq");
    expect(errEvent.message).not.toContain("gemini");
    expect(errEvent.message).not.toContain("anthropic");
  });

  it('E.5 The exhausted-model marker is respected: next request does not call model again until reset time', async () => {
    const calledModels: string[] = [];

    globalThis.fetch = async (input, init: any) => {
      const body = JSON.parse(init.body);
      calledModels.push(body.model);

      if (body.model === 'openai/gpt-oss-20b') {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Rate limit reached: tokens per day (TPD). Try again in 30m.',
            },
          }),
          { status: 429 }
        );
      }

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(sampleJD) } }],
        }),
        { status: 200 }
      );
    };

    // Request 1: marks openai/gpt-oss-20b exhausted and falls back to llama-3.1-8b-instant
    await (await app.request('/api/parse-jd', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Unique JD text 1: ' + Date.now() + ' Staff Frontend Engineer with 8+ years experience in React, TypeScript, and modern web architecture.',
      }),
    })).text();

    expect(calledModels).toEqual(['openai/gpt-oss-20b', 'llama-3.1-8b-instant']);

    // Request 2: should immediately call llama-3.1-8b-instant, skipping openai/gpt-oss-20b entirely
    calledModels.length = 0;
    await (await app.request('/api/parse-jd', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Unique JD text 2: ' + Date.now() + ' Staff Frontend Engineer with 8+ years experience in React, TypeScript, and modern web architecture.',
      }),
    })).text();

    expect(calledModels).toEqual(['llama-3.1-8b-instant']);
  });

  it('E.6 Cache: identical /rank call makes 0 upstream calls, adding 1 new CV calls AI only for that CV, market cache expires after 24h', async () => {
    let upstreamCalls = 0;

    globalThis.fetch = async (input, init: any) => {
      upstreamCalls++;
      const body = JSON.parse(init.body);
      const isCand1 = body.messages[1].content.includes('Cand 1');
      const isCand2 = body.messages[1].content.includes('Cand 2');
      const isCand3 = body.messages[1].content.includes('Cand 3');

      const results = [];
      if (isCand1) results.push({ id: 'c1', breakdown: { skills: 40, experience: 20, relevance: 15, education: 10 }, relevantYears: 8, reason: 'Good', matchedSkills: ['React'], missingSkills: [], evidence: [], concerns: [] });
      if (isCand2) results.push({ id: 'c2', breakdown: { skills: 35, experience: 20, relevance: 15, education: 10 }, relevantYears: 7, reason: 'Good', matchedSkills: ['React'], missingSkills: [], evidence: [], concerns: [] });
      if (isCand3) results.push({ id: 'c3', breakdown: { skills: 30, experience: 20, relevance: 15, education: 10 }, relevantYears: 6, reason: 'Good', matchedSkills: ['React'], missingSkills: [], evidence: [], concerns: [] });

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ results }) } }],
        }),
        { status: 200 }
      );
    };

    const fixedJD = { ...sampleJD, role: 'Fixed Cache JD ' + Date.now() };
    const cv1 = { id: 'c1', text: 'Cand 1 with React and TypeScript frontend experience in production for 8 years.' };
    const cv2 = { id: 'c2', text: 'Cand 2 with React and TypeScript frontend experience in production for 7 years.' };
    const cv3 = { id: 'c3', text: 'Cand 3 with React and TypeScript frontend experience in production for 6 years.' };

    // 1. First /rank call: uncached, calls upstream AI
    const res1 = await app.request('/api/rank', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd: fixedJD, candidates: [cv1, cv2] }),
    });
    await res1.text();
    expect(upstreamCalls).toBe(1); // 1 batch of 2

    // 2. Second identical /rank call: fully cached -> makes ZERO upstream AI calls!
    upstreamCalls = 0;
    const res2 = await app.request('/api/rank', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd: fixedJD, candidates: [cv1, cv2] }),
    });
    const events2 = parseSSE(await res2.text());
    const res2Item = events2.find((e) => e.type === 'result');
    expect(res2Item).toBeDefined();
    expect(res2Item.meta?.model).toBe('cache');
    expect(upstreamCalls).toBe(0); // ZERO upstream calls!

    // 3. Adding 1 new CV (cv3): calls AI only for cv3!
    upstreamCalls = 0;
    const res3 = await app.request('/api/rank', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd: fixedJD, candidates: [cv1, cv2, cv3] }),
    });
    await res3.text();
    expect(upstreamCalls).toBe(1); // 1 call only for cv3

    // 4. Market cache expires after 24 hours
    let marketUpstream = 0;
    globalThis.fetch = async (input: any) => {
      const urlStr = typeof input === 'string' ? input : input.url;
      if (urlStr.includes('api.groq.com')) {
        marketUpstream++;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    insights: [
                      {
                        company: 'Acme',
                        roleTitle: fixedJD.role,
                        location: 'Bengaluru',
                        compensationRange: '₹20–30 LPA',
                        compensationIsEstimate: false,
                        basis: 'Job post',
                        sourceName: 'Acme Careers',
                        sourceUrl: 'https://acme.careers/job/1',
                      },
                    ],
                    marketSummary: 'High demand.',
                    caveats: [],
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      // Link check
      return new Response('<html><body>Careers at Acme</body></html>', { status: 200 });
    };

    const marketBody = JSON.stringify({ jd: fixedJD });

    // Initial market call
    const mRes1 = await app.request('/api/market', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: marketBody,
    });
    await mRes1.text();
    expect(marketUpstream).toBe(1);

    // Call within 24h: cached
    marketUpstream = 0;
    const mRes2 = await app.request('/api/market', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: marketBody,
    });
    await mRes2.text();
    expect(marketUpstream).toBe(0);

    // Advance time past 24h (24 hours + 1 minute)
    const originalDateNow = Date.now;
    try {
      const futureTime = originalDateNow() + (24 * 60 + 1) * 60 * 1000;
      Date.now = () => futureTime;

      marketUpstream = 0;
      const mRes3 = await app.request('/api/market', {
        method: 'POST',
        headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
        body: marketBody,
      });
      await mRes3.text();
      expect(marketUpstream).toBe(1); // Cache expired after 24h!
    } finally {
      Date.now = originalDateNow;
    }
  });

  it('E.7 Concurrency: rank pool never has more than the configured number of upstream calls in flight at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const items = Array.from({ length: 12 }, (_, i) => i);
    const concurrencyLimit = 4;

    await pool(items, concurrencyLimit, async (item) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      return item * 2;
    });

    expect(maxInFlight).toBeLessThanOrEqual(concurrencyLimit);
    expect(maxInFlight).toBeGreaterThanOrEqual(2);
  });
});
