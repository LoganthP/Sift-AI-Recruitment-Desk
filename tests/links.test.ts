import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import app from '../api/_lib/app';
import { sign } from 'hono/jwt';
import { checkLink, searchLink, openingsLink } from '../api/_lib/links';

describe('F. Market Link Verification (Stubbed)', () => {
  const secret = process.env.AUTH_SECRET || 'sift-dev-secret-change-me';
  const originalFetch = globalThis.fetch;
  let orgToken: string;

  beforeEach(async () => {
    if ((globalThis as any).__siftMem) {
      (globalThis as any).__siftMem.str.clear();
      (globalThis as any).__siftMem.hash.clear();
    }
    process.env.GROQ_API_KEY = 'gsk_mock_links_key';
    process.env.GROQ_MODELS_FAST = 'openai/gpt-oss-20b';
    process.env.GROQ_MODELS_HEAVY = 'openai/gpt-oss-120b';
    process.env.AI_PROVIDERS = 'groq';

    const t = await sign(
      { sub: 'org-links', email: 'links@test.com', type: 'organisation', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret,
      'HS256'
    );
    orgToken = `Bearer ${t}`;
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
    role: 'Platform Engineer',
    company: 'Cloud Innovators',
    location: 'Bengaluru',
    workMode: 'Remote' as const,
    experience: { min: 4, max: 7, text: '4-7 years' },
    seniority: 'Mid-Senior',
    employmentType: 'Full-time',
    keySkills: ['Kubernetes', 'Go', 'AWS'],
    niceToHave: ['Terraform'],
    responsibilities: ['Build cloud platform'],
    education: 'B.Tech',
    domain: 'Infrastructure',
    summary: 'Platform Engineer needed for cloud infrastructure.',
  };

  it('F.1 Unit test checkLink for all 5 cases (200 real, 404, soft 404, 403, timeout)', async () => {
    // 1. 200 real content -> ok
    globalThis.fetch = async () => new Response('<html><head><title>Job Title</title></head><body>Real Job Listing Details</body></html>', { status: 200 });
    expect(await checkLink('https://example.com/job/200')).toBe('ok');

    // 2. 404 (AmbitionBox case) -> broken
    globalThis.fetch = async () => new Response('Not found', { status: 404 });
    expect(await checkLink('https://ambitionbox.com/salaries/missing')).toBe('broken');

    // 3. 200 with soft 404 ("Page not found") -> broken
    globalThis.fetch = async () => new Response('<html><body><h1>404 Not Found</h1><p>Sorry, this page does not exist anymore.</p></body></html>', { status: 200 });
    expect(await checkLink('https://example.com/job/soft-404')).toBe('broken');

    // 4. 403 Forbidden -> unknown (treated as unverified / search fallback)
    globalThis.fetch = async () => new Response('Forbidden', { status: 403 });
    expect(await checkLink('https://example.com/job/403')).toBe('unknown');

    // 5. Timeout / network error -> unknown
    globalThis.fetch = async () => { throw new Error('Timeout'); };
    expect(await checkLink('https://example.com/job/timeout')).toBe('unknown');
  });

  it('F.2 Integration test: /market route transforms rows into verified, search, or estimate with openingsUrl', async () => {
    const rawInsights = [
      {
        company: 'Google',
        roleTitle: 'Platform Engineer',
        location: 'Bengaluru',
        compensationRange: '₹35–50 LPA',
        compensationIsEstimate: false,
        basis: 'Job post' as const,
        sourceName: 'Google Careers',
        sourceUrl: 'https://careers.google.com/jobs/platform-eng',
      },
      {
        company: 'Flipkart',
        roleTitle: 'Platform Engineer',
        location: 'Bengaluru',
        compensationRange: '₹30–42 LPA',
        compensationIsEstimate: false,
        basis: 'Salary data' as const,
        sourceName: 'AmbitionBox',
        sourceUrl: 'https://ambitionbox.com/salaries/flipkart-platform',
      },
      {
        company: 'Amazon',
        roleTitle: 'Platform Engineer',
        location: 'Bengaluru',
        compensationRange: '₹32–45 LPA',
        compensationIsEstimate: false,
        basis: 'Job post' as const,
        sourceName: 'Amazon Jobs',
        sourceUrl: 'https://amazon.jobs/en/jobs/soft-404',
      },
      {
        company: 'Swiggy',
        roleTitle: 'Platform Engineer',
        location: 'Bengaluru',
        compensationRange: '₹28–38 LPA',
        compensationIsEstimate: false,
        basis: 'Job post' as const,
        sourceName: 'Swiggy Careers',
        sourceUrl: 'https://careers.swiggy.com/platform-403',
      },
      {
        company: 'Zomato',
        roleTitle: 'Platform Engineer',
        location: 'Bengaluru',
        compensationRange: '₹25–35 LPA',
        compensationIsEstimate: true,
        basis: 'Estimate' as const,
        sourceName: '',
        sourceUrl: null,
      },
    ];

    globalThis.fetch = async (input: any) => {
      const urlStr = typeof input === 'string' ? input : input.url;

      // Upstream AI call for market insights
      if (urlStr.includes('api.groq.com')) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    insights: rawInsights,
                    marketSummary: 'Strong demand for platform engineers in Bengaluru.',
                    caveats: ['Compensation varies by experience'],
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        );
      }

      // Link verification fetches:
      if (urlStr.includes('careers.google.com')) {
        return new Response('<html><body>Live active job listing</body></html>', { status: 200 });
      }
      if (urlStr.includes('ambitionbox.com')) {
        return new Response('Not found', { status: 404 });
      }
      if (urlStr.includes('amazon.jobs')) {
        return new Response('<html><body>Page not found. The position has been filled.</body></html>', { status: 200 });
      }
      if (urlStr.includes('careers.swiggy.com')) {
        return new Response('Blocked', { status: 403 });
      }

      return new Response('Not found', { status: 404 });
    };

    const res = await app.request('/api/market', {
      method: 'POST',
      headers: { Authorization: orgToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd: sampleJD }),
    });

    const events = parseSSE(await res.text());
    const resultEvent = events.find((e) => e.type === 'result');
    expect(resultEvent).toBeDefined();

    const insights = resultEvent.data.insights;
    expect(insights.length).toBe(5);

    // Row 0: 200 page with real content -> linkStatus "verified", direct link kept
    expect(insights[0].company).toBe('Google');
    expect(insights[0].linkStatus).toBe('verified');
    expect(insights[0].link).toBe('https://careers.google.com/jobs/platform-eng');
    expect(insights[0].sourceUrl).toBe('https://careers.google.com/jobs/platform-eng');
    expect(insights[0].openingsUrl).toContain('careers');

    // Row 1: 404 (AmbitionBox) -> linkStatus "search", Google search scoped to ambitionbox.com
    expect(insights[1].company).toBe('Flipkart');
    expect(insights[1].linkStatus).toBe('search');
    expect(insights[1].link).toContain('google.com/search');
    expect(insights[1].link).toContain('ambitionbox.com');
    expect(insights[1].sourceUrl).toBeNull();
    expect(insights[1].openingsUrl).toContain('Flipkart');

    // Row 2: Soft 404 (Page not found / position filled) -> linkStatus "search"
    expect(insights[2].company).toBe('Amazon');
    expect(insights[2].linkStatus).toBe('search');
    expect(insights[2].link).toContain('google.com/search');
    expect(insights[2].sourceUrl).toBeNull();
    expect(insights[2].openingsUrl).toContain('Amazon');

    // Row 3: 403 Forbidden -> linkStatus "search"
    expect(insights[3].company).toBe('Swiggy');
    expect(insights[3].linkStatus).toBe('search');
    expect(insights[3].link).toContain('google.com/search');
    expect(insights[3].sourceUrl).toBeNull();
    expect(insights[3].openingsUrl).toContain('Swiggy');

    // Row 4: null sourceUrl -> basis "Estimate", sourceName "AI estimate", linkStatus "search"
    expect(insights[4].company).toBe('Zomato');
    expect(insights[4].basis).toBe('Estimate');
    expect(insights[4].sourceName).toBe('AI estimate');
    expect(insights[4].linkStatus).toBe('search');
    expect(insights[4].sourceUrl).toBeNull();
    expect(insights[4].openingsUrl).toContain('Zomato');

    // Every row has a working openingsUrl
    for (const row of insights) {
      expect(row.openingsUrl).toBeDefined();
      expect(row.openingsUrl).toMatch(/^https:\/\/www\.google\.com\/search\?q=.*&ibp=htl;jobs$/);
    }
  });
});
