import { describe, it, expect } from 'vitest';
import app from '../api/_lib/app';
import { sign } from 'hono/jwt';

describe('J. Live Smoke Test (LIVE=1 only)', () => {
  const isLive = process.env.LIVE === '1';

  it.skipIf(!isLive)('J.1 Run each AI route once against real provider and verify cache on second run', async () => {
    const secret = process.env.AUTH_SECRET || 'sift-dev-secret-change-me';
    const t = await sign(
      { sub: 'live-user', email: 'live@test.com', type: 'organisation', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret,
      'HS256'
    );
    const token = `Bearer ${t}`;

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

    const jdText = `
Role: Senior AI/ML Engineer
Company: Alpha AI
Location: Bengaluru (Hybrid)
Experience: 4-7 years
Key Skills: Python, PyTorch, Transformers, LLMs, RAG, FastAPI
Summary: Looking for an experienced AI/ML Engineer to build LLM applications and RAG systems for enterprise search.
    `.trim();

    // 1. parse-jd
    console.log('\n--- LIVE TEST: /parse-jd ---');
    const t0Parse = Date.now();
    const resParse1 = await app.request('/api/parse-jd', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: jdText }),
    });
    const parseEvents1 = parseSSE(await resParse1.text());
    const parseResult1 = parseEvents1.find((e) => e.type === 'result');
    const latParse1 = Date.now() - t0Parse;
    console.log(`/parse-jd Run 1 latency: ${latParse1}ms, model: ${parseResult1?.meta?.model}`);
    expect(parseResult1).toBeDefined();
    expect(parseResult1.data.role).toBeDefined();

    // parse-jd cache test
    const t0ParseCache = Date.now();
    const resParse2 = await app.request('/api/parse-jd', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: jdText }),
    });
    const parseEvents2 = parseSSE(await resParse2.text());
    const parseResult2 = parseEvents2.find((e) => e.type === 'result');
    const latParseCache = Date.now() - t0ParseCache;
    console.log(`/parse-jd Run 2 (cache) latency: ${latParseCache}ms, model: ${parseResult2?.meta?.model}`);
    expect(parseResult2?.meta?.model).toBe('cache');

    const parsedJD = parseResult1.data;

    // 2. rank
    console.log('\n--- LIVE TEST: /rank ---');
    const cand1 = {
      id: 'c1',
      text: 'AI Engineer with 5 years experience in Python, PyTorch, LangChain, RAG, and LLM fine-tuning at an enterprise analytics startup in Bengaluru.',
    };
    const cand2 = {
      id: 'c2',
      text: 'Backend Software Developer with 4 years experience in Java, Spring Boot, PostgreSQL, and AWS building banking payment services in Hyderabad.',
    };

    const t0Rank = Date.now();
    const resRank1 = await app.request('/api/rank', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd: parsedJD, candidates: [cand1, cand2] }),
    });
    const rankEvents1 = parseSSE(await resRank1.text());
    const rankResult1 = rankEvents1.find((e) => e.type === 'result');
    const latRank1 = Date.now() - t0Rank;
    console.log(`/rank Run 1 latency: ${latRank1}ms, items scored: ${rankEvents1.filter((e) => e.type === 'item').length}`);
    expect(rankResult1).toBeDefined();

    // rank cache test
    const t0RankCache = Date.now();
    const resRank2 = await app.request('/api/rank', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd: parsedJD, candidates: [cand1, cand2] }),
    });
    const rankEvents2 = parseSSE(await resRank2.text());
    const rankResult2 = rankEvents2.find((e) => e.type === 'result');
    const latRankCache = Date.now() - t0RankCache;
    console.log(`/rank Run 2 (cache) latency: ${latRankCache}ms, model: ${rankResult2?.meta?.model}`);
    expect(rankResult2?.meta?.model).toBe('cache');

    // 3. questions
    console.log('\n--- LIVE TEST: /questions ---');
    const t0Q = Date.now();
    const resQ1 = await app.request('/api/questions', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd: parsedJD }),
    });
    const qEvents1 = parseSSE(await resQ1.text());
    const qResult1 = qEvents1.find((e) => e.type === 'result');
    console.log(`/questions Run 1 latency: ${Date.now() - t0Q}ms, questions returned: ${qResult1?.data?.questions?.length}`);
    expect(qResult1?.data?.questions?.length).toBeGreaterThanOrEqual(5);

    // 4. search-strings
    console.log('\n--- LIVE TEST: /search-strings ---');
    const t0S = Date.now();
    const resS1 = await app.request('/api/search-strings', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd: parsedJD }),
    });
    const sEvents1 = parseSSE(await resS1.text());
    const sResult1 = sEvents1.find((e) => e.type === 'result');
    console.log(`/search-strings Run 1 latency: ${Date.now() - t0S}ms, linkedin boolean: ${Boolean(sResult1?.data?.linkedin?.boolean)}`);
    expect(sResult1?.data?.linkedin?.boolean).toBeDefined();
  });
});
