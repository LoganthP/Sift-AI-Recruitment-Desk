import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import app from '../api/_lib/app';
import { storageMode, kv } from '../api/_lib/kv';

describe('K. Deployment Config', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  });

  it('K.1 vercel.json routes /api/* to API, deep links to index.html, and leaves /assets untouched', () => {
    const vercelConfigPath = path.resolve(process.cwd(), 'vercel.json');
    expect(fs.existsSync(vercelConfigPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf-8'));
    expect(config.rewrites).toBeDefined();

    const apiRewrite = config.rewrites.find((r: any) => r.destination === '/api');
    expect(apiRewrite).toBeDefined();
    expect(apiRewrite.source).toBe('/api/(.*)');

    const spaRewrite = config.rewrites.find((r: any) => r.destination === '/index.html');
    expect(spaRewrite).toBeDefined();
    expect(spaRewrite.source).toBe('/((?!api/|assets/).*)');

    // Test regex matching logic
    const apiRegex = new RegExp(`^${apiRewrite.source.replace('(.*)', '.*')}$`);
    const spaRegex = new RegExp(`^${spaRewrite.source.replace('(.*)', '.*')}$`);

    // 1. /api/* goes to API
    expect(apiRegex.test('/api/rank')).toBe(true);
    expect(apiRegex.test('/api/health')).toBe(true);
    expect(apiRegex.test('/api/auth/login')).toBe(true);

    // 2. Deep links like /app/p/<id> serve index.html
    expect(spaRegex.test('/app/p/project-123')).toBe(true);
    expect(spaRegex.test('/auth')).toBe(true);
    expect(spaRegex.test('/app')).toBe(true);

    // 3. /assets is untouched
    expect(spaRegex.test('/assets/index-abc.js')).toBe(false);
    expect(spaRegex.test('/assets/vendor.css')).toBe(false);
    expect(apiRegex.test('/assets/index-abc.js')).toBe(false);
  });

  it('K.2 With no AI key, /health reports ai: false', async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.ai).toBe(false);
  });

  it('K.3 With KV env vars set, storage switches to "redis" and operations use Upstash REST endpoint', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://mock-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-upstash-token';

    expect(storageMode()).toBe('redis');

    const res = await app.request('/api/health');
    const json = await res.json();
    expect(json.storage).toBe('redis');

    // Test stubbed Upstash endpoint operations
    const requests: { url: string; auth: string; body: any }[] = [];
    globalThis.fetch = async (input: any, init: any) => {
      requests.push({
        url: String(input),
        auth: init?.headers?.Authorization,
        body: JSON.parse(init?.body || '[]'),
      });

      const cmd = JSON.parse(init?.body || '[]')[0];
      if (cmd === 'GET') {
        return new Response(JSON.stringify({ result: 'stored-redis-value' }), { status: 200 });
      }
      if (cmd === 'SET') {
        return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
      }
      return new Response(JSON.stringify({ result: null }), { status: 200 });
    };

    const val = await kv.get('test-key');
    expect(val).toBe('stored-redis-value');
    expect(requests[0].url).toBe('https://mock-redis.upstash.io');
    expect(requests[0].auth).toBe('Bearer mock-upstash-token');
    expect(requests[0].body).toEqual(['GET', 'test-key']);

    const setOk = await kv.set('test-key', 'new-val');
    expect(setOk).toBe(true);
    expect(requests[1].body).toEqual(['SET', 'test-key', 'new-val']);
  });
});
