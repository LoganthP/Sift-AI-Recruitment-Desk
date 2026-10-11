import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../api/_lib/app';
import { sign } from 'hono/jwt';
import {
  _resetModelTracking,
  generateJSON,
  getProviders,
  isOpenRouterActive,
  pool,
} from '../api/_lib/ai';
import {
  getOpenRouterModels,
  discoverOpenRouterModels,
  isOpenRouterExhausted,
  markOpenRouterExhausted,
  getOpenRouterExhaustedUntil,
} from '../api/_lib/openrouter';
import { JDSchema } from '../shared/schemas';

describe('OpenRouter Provider Integration', () => {
  const secret = process.env.AUTH_SECRET || 'sift-dev-secret-change-me';
  const originalFetch = globalThis.fetch;
  let orgToken: string;

  beforeEach(async () => {
    _resetModelTracking();
    if ((globalThis as any).__siftMem) {
      (globalThis as any).__siftMem.str.clear();
      (globalThis as any).__siftMem.hash.clear();
    }
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_MODELS_FAST;
    delete process.env.OPENROUTER_MODELS_HEAVY;
    process.env.AI_PROVIDERS = 'groq,gemini,openrouter';

    const t = await sign(
      { sub: 'org-or', email: 'or@test.com', type: 'organisation', exp: Math.floor(Date.now() / 1000) + 86400 * 30 },
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
    role: 'Staff Platform Engineer',
    company: 'Sift Tech',
    location: 'Bengaluru',
    workMode: 'Hybrid' as const,
    experience: { min: 8, max: 12, text: '8-12 years' },
    seniority: 'Staff',
    employmentType: 'Full-time',
    keySkills: ['Kubernetes', 'Go', 'Distributed Systems'],
    niceToHave: ['Rust'],
    responsibilities: ['Architecture', 'Platform stability'],
    education: 'B.Tech',
    domain: 'Infrastructure',
    summary: 'Lead platform engineering.',
  };

  it('(a) Groq daily limit falls back to Gemini', async () => {
    process.env.GROQ_API_KEY = 'gsk_mock_key';
    process.env.GEMINI_API_KEY = 'gemini_mock_key';
    process.env.OPENROUTER_API_KEY = 'or_mock_key';
    process.env.GROQ_MODELS_FAST = 'openai/gpt-oss-20b';

    const requestedUrls: string[] = [];

    globalThis.fetch = async (input, init: any) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url.includes('api.groq.com')) {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Rate limit reached for model `openai/gpt-oss-20b`: tokens per day (TPD). Try again in 3h.',
              type: 'tokens',
              code: 'rate_limit_exceeded',
            },
          }),
          { status: 429 }
        );
      }

      if (url.includes('generativelanguage.googleapis.com')) {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(sampleJD) }],
                },
              },
            ],
          }),
          { status: 200 }
        );
      }

      return new Response('Not found', { status: 404 });
    };

    const res = await app.request('/api/parse-jd', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Staff Platform Engineer role with 8-12 years of experience in Kubernetes, Go, and distributed systems. ' + Date.now(),
      }),
    });

    const events = parseSSE(await res.text());
    const result = events.find((e) => e.type === 'result');
    expect(result).toBeDefined();
    expect(result.data.role).toBe(sampleJD.role);
    expect(result.meta.provider).toBe('gemini');
    expect(requestedUrls.some((u) => u.includes('api.groq.com'))).toBe(true);
    expect(requestedUrls.some((u) => u.includes('generativelanguage.googleapis.com'))).toBe(true);
    expect(requestedUrls.some((u) => u.includes('openrouter.ai'))).toBe(false);
  });

  it('(b) Gemini 429 falls back to OpenRouter, with the same JSON shape returned', async () => {
    process.env.GROQ_API_KEY = 'gsk_mock_key';
    process.env.GEMINI_API_KEY = 'gemini_mock_key';
    process.env.OPENROUTER_API_KEY = 'or_mock_key';
    process.env.GROQ_MODELS_FAST = 'openai/gpt-oss-20b';
    process.env.OPENROUTER_MODELS_FAST = 'meta-llama/llama-3.3-70b-instruct:free';

    const requestedUrls: string[] = [];

    globalThis.fetch = async (input, init: any) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url.includes('api.groq.com')) {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Rate limit reached: tokens per day (TPD). Try again in 2h.',
            },
          }),
          { status: 429 }
        );
      }

      if (url.includes('generativelanguage.googleapis.com')) {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Resource exhausted: rate limit exceeded. Try again in 1h.',
              status: 'RESOURCE_EXHAUSTED',
            },
          }),
          { status: 429 }
        );
      }

      if (url.includes('openrouter.ai/api/v1/chat/completions')) {
        const body = JSON.parse(init.body);
        expect(body.models).toEqual(['meta-llama/llama-3.3-70b-instruct:free']);
        expect(body.model).toBeUndefined(); // Must send models, not model
        expect(init.headers['Authorization']).toBe('Bearer or_mock_key');
        expect(init.headers['HTTP-Referer']).toBeDefined();
        expect(init.headers['X-Title']).toBe('Sift');

        return new Response(
          JSON.stringify({
            id: 'gen-123',
            model: 'meta-llama/llama-3.3-70b-instruct:free',
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
      }

      return new Response('Not found', { status: 404 });
    };

    const res = await app.request('/api/parse-jd', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Staff Platform Engineer role with 8-12 years of experience in Kubernetes, Go, and distributed systems. ' + Date.now(),
      }),
    });

    const events = parseSSE(await res.text());
    const result = events.find((e) => e.type === 'result');
    expect(result).toBeDefined();
    expect(result.data.role).toBe(sampleJD.role);
    expect(result.data.keySkills).toEqual(sampleJD.keySkills);
    expect(result.meta.provider).toBe('openrouter');
  });

  it('(c) Model auto-discovery picks only ":free" IDs with context >= 32000 and is cached', async () => {
    process.env.OPENROUTER_API_KEY = 'or_mock_key';
    delete process.env.OPENROUTER_MODELS_FAST;
    delete process.env.OPENROUTER_MODELS_HEAVY;

    let modelsApiCallCount = 0;

    globalThis.fetch = async (input, init: any) => {
      const url = String(input);
      if (url.includes('openrouter.ai/api/v1/models')) {
        modelsApiCallCount++;
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'meta-llama/llama-3.3-70b-instruct:free',
                context_length: 131072,
                architecture: { modality: 'text->text' },
              },
              {
                id: 'mistralai/mistral-small:free',
                context_length: 32768,
                architecture: { modality: 'text->text' },
              },
              {
                id: 'google/gemini-2.0-flash-thinking:free',
                context_length: 65536,
                architecture: { modality: 'text->text' },
              },
              {
                id: 'anthropic/claude-3-opus', // Not free!
                context_length: 200000,
              },
              {
                id: 'tiny/small-chat:free', // context < 32000!
                context_length: 16000,
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response('Not found', { status: 404 });
    };

    const fastModels = await getOpenRouterModels('fast');
    expect(modelsApiCallCount).toBe(1);
    expect(fastModels.length).toBeGreaterThan(0);
    expect(fastModels.length).toBeLessThanOrEqual(3);
    for (const id of fastModels) {
      expect(id.endsWith(':free')).toBe(true);
      expect(id).not.toBe('anthropic/claude-3-opus');
      expect(id).not.toBe('tiny/small-chat:free');
    }

    const heavyModels = await getOpenRouterModels('heavy');
    // Cache check: should not call OpenRouter models API again!
    expect(modelsApiCallCount).toBe(1);
    expect(heavyModels.length).toBe(3);
    // Heavy picks 3 largest context: 131072 (llama-3.3-70b), 65536 (gemini-2.0), 32768 (mistral)
    expect(heavyModels[0]).toBe('meta-llama/llama-3.3-70b-instruct:free');
  });

  it('(d) An OpenRouter 429 with X-RateLimit-Reset marks the provider exhausted, and the next call skips it', async () => {
    process.env.OPENROUTER_API_KEY = 'or_mock_key';
    process.env.OPENROUTER_MODELS_FAST = 'meta-llama/llama-3.3-70b-instruct:free';
    process.env.AI_PROVIDERS = 'openrouter';

    let openRouterCalls = 0;
    const resetTimeEpochMs = Date.now() + 45000;

    globalThis.fetch = async (input, init: any) => {
      const url = String(input);
      if (url.includes('openrouter.ai/api/v1/chat/completions')) {
        openRouterCalls++;
        return new Response(
          JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
          {
            status: 429,
            headers: { 'x-ratelimit-reset': String(resetTimeEpochMs) },
          }
        );
      }
      return new Response('Not found', { status: 404 });
    };

    // First call triggers 429 and marks OpenRouter exhausted
    await expect(
      generateJSON(JDSchema, {
        prompt: 'test prompt',
        tier: 'fast',
      })
    ).rejects.toThrow();

    expect(openRouterCalls).toBe(1);
    expect(await isOpenRouterExhausted()).toBe(true);

    // Second call should immediately skip OpenRouter without fetching
    await expect(
      generateJSON(JDSchema, {
        prompt: 'test prompt 2',
        tier: 'fast',
      })
    ).rejects.toThrow();

    expect(openRouterCalls).toBe(1); // No new call made!
  });

  it('(e) A 402 is handled without crashing and marks OpenRouter exhausted for 1 hour', async () => {
    process.env.OPENROUTER_API_KEY = 'or_mock_key';
    process.env.OPENROUTER_MODELS_FAST = 'meta-llama/llama-3.3-70b-instruct:free';
    process.env.AI_PROVIDERS = 'openrouter';

    globalThis.fetch = async (input, init: any) => {
      const url = String(input);
      if (url.includes('openrouter.ai/api/v1/chat/completions')) {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Insufficient credits. Add credits to your account.',
              code: 402,
            },
          }),
          { status: 402 }
        );
      }
      return new Response('Not found', { status: 404 });
    };

    const t0 = Date.now();
    await expect(
      generateJSON(JDSchema, {
        prompt: 'test prompt',
        tier: 'fast',
      })
    ).rejects.toThrow();

    expect(await isOpenRouterExhausted()).toBe(true);
    expect(getOpenRouterExhaustedUntil()).toBeGreaterThanOrEqual(t0 + 59 * 60 * 1000);
  });

  it('(f) All providers exhausted → the friendly 429 with the soonest reset and no provider names', async () => {
    process.env.GROQ_API_KEY = 'gsk_mock';
    process.env.GEMINI_API_KEY = 'gemini_mock';
    process.env.OPENROUTER_API_KEY = 'or_mock';
    process.env.AI_PROVIDERS = 'groq,gemini,openrouter';
    process.env.GROQ_MODELS_FAST = 'openai/gpt-oss-20b';
    process.env.OPENROUTER_MODELS_FAST = 'meta-llama/llama-3.3-70b-instruct:free';

    globalThis.fetch = async (input, init: any) => {
      const url = String(input);
      if (url.includes('api.groq.com')) {
        return new Response(
          JSON.stringify({ error: { message: 'tokens per day (TPD). Try again in 45m.' } }),
          { status: 429 }
        );
      }
      if (url.includes('generativelanguage.googleapis.com')) {
        return new Response(
          JSON.stringify({ error: { message: 'Quota exceeded. Try again in 30m.' } }),
          { status: 429 }
        );
      }
      if (url.includes('openrouter.ai')) {
        const resetIn15m = Date.now() + 15 * 60 * 1000;
        return new Response(
          JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
          {
            status: 429,
            headers: { 'x-ratelimit-reset': String(resetIn15m) },
          }
        );
      }
      return new Response('Not found', { status: 404 });
    };

    let caughtError: any = null;
    try {
      await generateJSON(JDSchema, { prompt: 'test', tier: 'fast' });
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError.status).toBe(429);
    // Soonest reset across 45m, 30m, 15m is 15 minutes!
    expect(caughtError.message).toContain('resets in about 15 minutes');
    // No provider or model names visible to user
    expect(caughtError.message).not.toContain('Groq');
    expect(caughtError.message).not.toContain('Gemini');
    expect(caughtError.message).not.toContain('OpenRouter');
    expect(caughtError.message).not.toContain('llama');
  });

  it('(g) A cache hit makes zero calls to any provider', async () => {
    process.env.OPENROUTER_API_KEY = 'or_mock';
    process.env.OPENROUTER_MODELS_FAST = 'meta-llama/llama-3.3-70b-instruct:free';
    process.env.AI_PROVIDERS = 'openrouter';

    let fetchCalls = 0;

    globalThis.fetch = async (input, init: any) => {
      fetchCalls++;
      return new Response(
        JSON.stringify({
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          choices: [{ message: { content: JSON.stringify(sampleJD) } }],
        }),
        { status: 200 }
      );
    };

    const fixedText =
      'Fixed JD text content for caching test: Staff Platform Engineer role with 8-12 years of experience in Kubernetes, Go and distributed systems. ' +
      999999;

    // First call: calls provider once and caches result
    const res1 = await app.request('/api/parse-jd', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: fixedText }),
    });
    await res1.text();
    expect(fetchCalls).toBe(1);

    // Second call: exact same JD text -> cache hit
    fetchCalls = 0;
    const res2 = await app.request('/api/parse-jd', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: fixedText }),
    });
    const events = parseSSE(await res2.text());
    const result = events.find((e) => e.type === 'result');
    expect(result).toBeDefined();
    expect(result.data.role).toBe(sampleJD.role);
    expect(fetchCalls).toBe(0); // Zero calls to any provider!
  });

  it('(h) A missing OPENROUTER_API_KEY is silently skipped', async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY; // Missing!
    process.env.GEMINI_API_KEY = 'gemini_mock';
    process.env.AI_PROVIDERS = 'openrouter,gemini'; // OpenRouter is first in list, but key missing

    let openRouterCalled = false;
    let geminiCalled = false;

    globalThis.fetch = async (input, init: any) => {
      const url = String(input);
      if (url.includes('openrouter.ai')) {
        openRouterCalled = true;
        return new Response('Error', { status: 500 });
      }
      if (url.includes('generativelanguage.googleapis.com')) {
        geminiCalled = true;
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(sampleJD) }],
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response('Not found', { status: 404 });
    };

    const res = await app.request('/api/parse-jd', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Staff Platform Engineer role with 8-12 years of experience in Kubernetes, Go, and distributed systems. ' + Date.now(),
      }),
    });

    const events = parseSSE(await res.text());
    const result = events.find((e) => e.type === 'result');
    expect(result).toBeDefined();
    expect(result.meta.provider).toBe('gemini');
    expect(openRouterCalled).toBe(false); // OpenRouter silently skipped!
    expect(geminiCalled).toBe(true);
  });

  it('reduces concurrency to 2 for /rank on OpenRouter when batches > 2', async () => {
    process.env.OPENROUTER_API_KEY = 'or_mock';
    process.env.AI_PROVIDERS = 'openrouter';

    expect(await isOpenRouterActive('heavy')).toBe(true);

    let inFlight = 0;
    let maxInFlight = 0;

    const items = [1, 2, 3, 4, 5]; // 5 batches (> 2)

    await pool(items, 4, async (item) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      return item * 2;
    });

    // Concurrency limit was requested as 4, but OpenRouter heavy with > 2 batches reduces it to 2!
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});
