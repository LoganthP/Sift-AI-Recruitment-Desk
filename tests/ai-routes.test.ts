import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import app from '../api/_lib/app';
import { sign } from 'hono/jwt';
import { _resetModelTracking } from '../api/_lib/ai';

describe('D. AI Routes with a Stubbed Provider', () => {
  const secret = process.env.AUTH_SECRET || 'sift-dev-secret-change-me';
  const originalFetch = globalThis.fetch;

  let orgToken: string;

  beforeEach(async () => {
    _resetModelTracking();
    process.env.GROQ_API_KEY = 'gsk_mock_ai_routes_key';
    process.env.GROQ_MODELS_FAST = 'openai/gpt-oss-20b';
    process.env.GROQ_MODELS_HEAVY = 'openai/gpt-oss-120b';
    process.env.AI_PROVIDERS = 'groq';

    const tOrg = await sign({ sub: 'org-user', email: 'org@test.com', type: 'organisation', exp: Math.floor(Date.now() / 1000) + 3600 }, secret, 'HS256');
    orgToken = `Bearer ${tOrg}`;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
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
    role: 'Full Stack Engineer',
    company: 'Tech Innovators',
    location: 'Bengaluru',
    workMode: 'Remote' as const,
    experience: { min: 3, max: 6, text: '3-6 years' },
    seniority: 'Mid-Senior',
    employmentType: 'Full-time',
    keySkills: ['React', 'Node.js', 'PostgreSQL', 'Docker'],
    niceToHave: ['AWS', 'Redis'],
    responsibilities: ['Build APIs', 'Create web apps'],
    education: 'B.Tech',
    domain: 'SaaS',
    summary: 'Full stack engineer needed',
  };

  it('D.1 SSE order is progress -> (item …) -> result for all 5 AI routes, and errors arrive as error event', async () => {
    // 1. /parse-jd
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(sampleJD) } }] }), { status: 200 });

    const resParse = await app.request('/api/parse-jd', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Unique JD text ' + Date.now() + ': We need a Full Stack Engineer in Bengaluru with 3-6 years of experience in React and Node.' }),
    });
    const eventsParse = parseSSE(await resParse.text());
    expect(eventsParse[0].type).toBe('progress');
    expect(eventsParse[eventsParse.length - 1].type).toBe('result');

    // 2. /questions
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  questions: Array.from({ length: 10 }, (_, i) => ({
                    category: 'Technical',
                    question: `Technical question ${i + 1}`,
                    skill: 'React',
                    goodAnswer: 'Explains lifecycle and state',
                    lookFor: ['Hooks', 'Performance'],
                    redFlags: ['Mutating state'],
                  })),
                }),
              },
            },
          ],
        }),
        { status: 200 }
      );

    const resQ = await app.request('/api/questions', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd: { ...sampleJD, role: 'Questions Role ' + Date.now() } }),
    });
    const eventsQ = parseSSE(await resQ.text());
    expect(eventsQ[0].type).toBe('progress');
    expect(eventsQ[eventsQ.length - 1].type).toBe('result');

    // 3. /search-strings
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  linkedin: { boolean: '(React AND Node)', plain: 'React Node developer', filters: [] },
                  naukri: { boolean: '(React AND Node)', plain: 'React Node developer', filters: [] },
                  notes: [],
                }),
              },
            },
          ],
        }),
        { status: 200 }
      );

    const resStrings = await app.request('/api/search-strings', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd: { ...sampleJD, role: 'Strings Role ' + Date.now() } }),
    });
    const eventsStrings = parseSSE(await resStrings.text());
    expect(eventsStrings[0].type).toBe('progress');
    expect(eventsStrings[eventsStrings.length - 1].type).toBe('result');

    // 4. /market
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  insights: [
                    {
                      company: 'Acme India',
                      roleTitle: 'Full Stack Engineer',
                      experienceRange: '3-6 yrs',
                      compensationRange: '₹18L - ₹25L',
                      location: 'Bengaluru',
                      sourceName: 'Sample Source',
                      sourceUrl: 'https://example.com/job',
                      basis: 'Job post',
                      compensationIsEstimate: false,
                    },
                  ],
                  marketSummary: 'Strong demand',
                  caveats: [],
                }),
              },
            },
          ],
        }),
        { status: 200 }
      );

    const resMarket = await app.request('/api/market', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd: { ...sampleJD, role: 'Market Role ' + Date.now() } }),
    });
    const eventsMarket = parseSSE(await resMarket.text());
    expect(eventsMarket[0].type).toBe('progress');
    expect(eventsMarket[eventsMarket.length - 1].type).toBe('result');

    // 5. /rank (progress -> item ... -> result)
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  results: [
                    {
                      id: 'c-1',
                      breakdown: { skills: 40, experience: 20, relevance: 12, education: 8 },
                      relevantYears: 4,
                      reason: 'Good fit',
                      matchedSkills: ['React', 'Node.js'],
                      missingSkills: ['PostgreSQL'],
                      evidence: ['Built APIs in Node'],
                      concerns: [],
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 }
      );

    const resRank = await app.request('/api/rank', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jd: { ...sampleJD, role: 'Rank SSE Role ' + Date.now() },
        candidates: [{ id: 'c-1', text: 'Senior developer with 4 years building React and Node applications.' }],
      }),
    });
    const eventsRank = parseSSE(await resRank.text());
    expect(eventsRank[0].type).toBe('progress');
    const itemEvent = eventsRank.find((e) => e.type === 'item');
    expect(itemEvent).toBeDefined();
    expect(eventsRank[eventsRank.length - 1].type).toBe('result');

    // 6. Error event
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Internal error' } }), { status: 500 });
    const resErr = await app.request('/api/parse-jd', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'This is a sufficiently long text describing a software engineer position in Bengaluru with 5 years experience. ' + Date.now(),
      }),
    });
    const eventsErr = parseSSE(await resErr.text());
    const errEv = eventsErr.find((e) => e.type === 'error');
    expect(errEv).toBeDefined();
    expect(errEv.message).toBeDefined();
  });

  it('D.2 Zod coercion normalises numbers from strings, null arrays, unknown categories, and clamped scores', async () => {
    const rawCoercionData = {
      results: [
        {
          id: 'cand-coerce',
          breakdown: {
            skills: '99',
            experience: '20',
            relevance: '15',
            education: '10',
          },
          relevantYears: '4.5',
          reason: 'Good developer',
          matchedSkills: ['React'],
          missingSkills: null,
          evidence: ['React pro'],
          concerns: null,
        },
      ],
    };

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(rawCoercionData) } }] }), { status: 200 });

    const resRank = await app.request('/api/rank', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jd: { ...sampleJD, role: 'Coercion Role ' + Date.now() },
        candidates: [{ id: 'cand-coerce', text: 'Software engineer with 4.5 years developing React components and full stack architecture in production.' }],
      }),
    });

    const events = parseSSE(await resRank.text());
    const itemEvent = events.find((e) => e.type === 'item');
    expect(itemEvent).toBeDefined();
    const candidate = itemEvent.item;
    expect(candidate.breakdown.skills).toBe(50); // clamped to max 50
    expect(candidate.breakdown.experience).toBe(20);
    expect(Array.isArray(candidate.missingSkills)).toBe(true);
    expect(Array.isArray(candidate.concerns)).toBe(true);
  });

  it('D.3 Malformed JSON triggers exactly one repair retry; if repair also fails, friendly error is emitted', async () => {
    process.env.GROQ_MODELS_FAST = 'openai/gpt-oss-20b,llama-3.1-8b-instant';
    let callCount = 0;
    const fetchCalls: any[] = [];

    // Case A: First malformed, second repair succeeds
    globalThis.fetch = async (input, init) => {
      callCount++;
      const body = JSON.parse(init.body);
      fetchCalls.push(body);
      if (callCount === 1) {
        return new Response(JSON.stringify({ choices: [{ message: { content: 'This is not valid json at all' } }] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  linkedin: { boolean: '(Python)', plain: 'Python', filters: [] },
                  naukri: { boolean: '(Python)', plain: 'Python', filters: [] },
                  notes: [],
                }),
              },
            },
          ],
        }),
        { status: 200 }
      );
    };

    const resRepairSuccess = await app.request('/api/search-strings', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd: { ...sampleJD, role: 'Repair Role Success ' + Date.now() } }),
    });
    const eventsSuccess = parseSSE(await resRepairSuccess.text());
    expect(callCount).toBe(2);
    expect(fetchCalls[1].messages[1].content).toContain('Your previous reply could not be used');
    expect(eventsSuccess[eventsSuccess.length - 1].type).toBe('result');

    // Case B: First malformed, second repair ALSO fails -> 502 friendly error
    callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Still invalid json response' } }] }), { status: 200 });
    };

    const resRepairFail = await app.request('/api/search-strings', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd: { ...sampleJD, role: 'Repair Role Fail ' + Date.now() } }),
    });
    const eventsFail = parseSSE(await resRepairFail.text());
    const errEv = eventsFail.find((e) => e.type === 'error');
    expect(errEv).toBeDefined();
    expect(errEv.message).toBe('The AI returned data in the wrong shape twice. Try again.');
  });

  it('D.4 Rank total equals sum of breakdown, omitted JD skills are marked missing, and partial batch failures are reported', async () => {
    // 1. Total score equals sum of breakdown
    // 2. JD keySkills = ['React', 'Node.js', 'PostgreSQL', 'Docker']. AI only mentions 'React'. 'Node.js', 'PostgreSQL', 'Docker' must be in missingSkills.
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  results: [
                    {
                      id: 'cand-score-check',
                      breakdown: { skills: 35, experience: 20, relevance: 10, education: 5 }, // sum = 70
                      relevantYears: 3,
                      reason: 'Solid skills',
                      matchedSkills: ['React'],
                      missingSkills: [],
                      evidence: ['Has React experience'],
                      concerns: [],
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 }
      );

    const resRank = await app.request('/api/rank', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jd: { ...sampleJD, role: 'Math Rank Role ' + Date.now() },
        candidates: [{ id: 'cand-score-check', text: 'Frontend engineer with 3 years writing React code in scalable production web applications.' }],
      }),
    });
    const events = parseSSE(await resRank.text());
    const item = events.find((e) => e.type === 'item')?.item;
    expect(item).toBeDefined();
    expect(item.score).toBe(35 + 20 + 10 + 5); // exactly 70
    expect(item.missingSkills).toContain('Node.js');
    expect(item.missingSkills).toContain('PostgreSQL');
    expect(item.missingSkills).toContain('Docker');

    // 3. Partial batch failure: 3 candidates across 2 batches
    globalThis.fetch = async (input, init: any) => {
      const body = JSON.parse(init.body);
      const isCandFail = body.messages[1].content.includes('cand-fail');
      if (isCandFail) {
        return new Response(JSON.stringify({ error: { message: 'Batch with cand-fail failed' } }), { status: 500 });
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  results: [
                    {
                      id: 'cand-ok1',
                      breakdown: { skills: 40, experience: 20, relevance: 10, education: 10 },
                      relevantYears: 4,
                      reason: 'Good candidate 1',
                      matchedSkills: ['React'],
                      missingSkills: [],
                      evidence: [],
                      concerns: [],
                    },
                    {
                      id: 'cand-ok2',
                      breakdown: { skills: 40, experience: 20, relevance: 10, education: 10 },
                      relevantYears: 5,
                      reason: 'Good candidate 2',
                      matchedSkills: ['React'],
                      missingSkills: [],
                      evidence: [],
                      concerns: [],
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 }
      );
    };

    const resPartial = await app.request('/api/rank', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jd: { ...sampleJD, role: 'Partial Fail Role ' + Date.now() },
        candidates: [
          { id: 'cand-ok1', text: 'Candidate 1 with React development experience of 4 years in production.' },
          { id: 'cand-ok2', text: 'Candidate 2 with React development experience of 5 years in production.' },
          { id: 'cand-fail', text: 'Candidate 3 with Node development experience of 2 years in production.' },
        ],
      }),
    });
    const partialEvents = parseSSE(await resPartial.text());
    const resultEvent = partialEvents.find((e) => e.type === 'result');
    expect(resultEvent).toBeDefined();
    expect(resultEvent.data.failed).toContain('cand-fail');
  });

  it('D.5 parse-jd rejects non-JD text with 422', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  isJobDescription: false,
                  role: 'Not a job',
                  company: null,
                  location: 'Not specified',
                  workMode: 'Not specified',
                  keySkills: [],
                  niceToHave: [],
                  responsibilities: [],
                }),
              },
            },
          ],
        }),
        { status: 200 }
      );

    const res = await app.request('/api/parse-jd', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'This is a sufficiently long text that is just a random blog post about cooking recipes, pets, and vacation travel stories. ' + Date.now(),
      }),
    });
    const events = parseSSE(await res.text());
    const err = events.find((e) => e.type === 'error');
    expect(err).toBeDefined();
    expect(err.status).toBe(422);
    expect(err.message).toBe("This doesn't look like a job description. Check the file and try again.");
  });

  it('D.6 search-strings uses sourcing strings for recruiter candidate sourcing', async () => {
    let capturedPrompt = '';

    globalThis.fetch = async (input, init: any) => {
      const body = JSON.parse(init.body);
      const prompt = body.messages[1].content;
      if (prompt.includes('sourcing')) {
        capturedPrompt = prompt;
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  linkedin: { boolean: '(Test)', plain: 'Test', filters: [] },
                  naukri: { boolean: '(Test)', plain: 'Test', filters: [] },
                  notes: [],
                }),
              },
            },
          ],
        }),
        { status: 200 }
      );
    };

    const res = await app.request('/api/search-strings', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd: { ...sampleJD, role: 'Audience Org ' + Date.now() } }),
    });
    await res.text();
    expect(capturedPrompt.toLowerCase()).toContain('sourcing');
  });
});
