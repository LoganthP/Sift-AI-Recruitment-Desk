import { test, expect, Page } from '@playwright/test';
import path from 'path';

// Mock fixtures for SSE streaming routes
const MOCK_JD = {
  role: 'Senior Full Stack Engineer',
  company: 'Fintech Innovations India',
  location: 'Bengaluru',
  workMode: 'Hybrid',
  experience: { min: 4, max: 7, text: '4-7 years' },
  seniority: 'Senior',
  employmentType: 'Full-time',
  keySkills: ['React', 'Node.js', 'PostgreSQL', 'Docker'],
  niceToHave: ['AWS', 'Redis'],
  responsibilities: ['Build scalable APIs', 'Lead frontend features'],
  education: 'B.Tech / MCA',
  domain: 'Fintech',
  summary: 'Senior Full Stack Engineer to lead web product development.',
};

const MOCK_QUESTIONS = Array.from({ length: 10 }, (_, i) => ({
  category: i < 4 ? 'Technical' : i < 7 ? 'Experience' : 'Fit',
  question: `Screening Question ${i + 1}: How do you approach distributed microservices?`,
  skill: i < 4 ? 'React / Node.js' : undefined,
  goodAnswer: 'Mentions trade-offs, scalability, and error recovery patterns.',
  lookFor: ['Design patterns', 'Monitoring', 'Resilience'],
  redFlags: ['No testing strategy', 'Monolithic mindset'],
}));

const MOCK_MARKET = {
  insights: [
    {
      company: 'Razorpay',
      roleTitle: 'Senior Full Stack Engineer',
      location: 'Bengaluru',
      compensationRange: '₹32–45 LPA',
      compensationIsEstimate: false,
      basis: 'Job post',
      sourceName: 'Razorpay Careers',
      sourceUrl: 'https://careers.razorpay.com/jobs/fullstack',
      linkStatus: 'verified',
      link: 'https://careers.razorpay.com/jobs/fullstack',
      openingsUrl: 'https://www.google.com/search?q=Razorpay+careers+jobs&ibp=htl;jobs',
    },
    {
      company: 'CRED',
      roleTitle: 'Senior Full Stack Engineer',
      location: 'Bengaluru',
      compensationRange: '₹35–50 LPA',
      compensationIsEstimate: false,
      basis: 'Salary data',
      sourceName: 'AmbitionBox',
      sourceUrl: null,
      linkStatus: 'search',
      link: 'https://www.google.com/search?q=CRED+salary',
      openingsUrl: 'https://www.google.com/search?q=CRED+careers+jobs&ibp=htl;jobs',
    },
  ],
  marketSummary: 'High demand for Senior Full Stack Engineers in Bengaluru fintech hubs.',
  caveats: ['Compensation packages include equity components.'],
  sources: [{ title: 'Razorpay Careers', url: 'https://careers.razorpay.com' }],
  searchQueries: ['Senior Full Stack Engineer salary Bengaluru'],
};

const MOCK_SEARCH_STRINGS = {
  linkedin: {
    boolean: '("Full Stack" OR "Fullstack") AND (React AND Node) AND (PostgreSQL OR Postgres)',
    plain: 'Senior Full Stack Engineer React Node Bengaluru',
    filters: ['Location: Bengaluru', 'Experience: 4-7 years'],
  },
  naukri: {
    boolean: '("Full Stack Developer" OR "Full Stack Engineer") AND ("React.js" OR React) AND ("Node.js" OR Node)',
    plain: 'Full Stack Engineer React Node Bengaluru',
    filters: ['City: Bangalore / Bengaluru'],
  },
  notes: ['Search for candidate title variants like Software Engineer III', 'Include Express or NestJS synonyms'],
};

async function setupMocks(page: Page) {
  await page.route('/api/parse-jd', async (route) => {
    const sse = [
      `data: ${JSON.stringify({ type: 'progress', message: 'Analyzing job description' })}\n\n`,
      `data: ${JSON.stringify({ type: 'result', data: MOCK_JD, meta: { provider: 'groq', model: 'mock', ms: 100 } })}\n\n`,
    ].join('');
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      body: sse,
    });
  });

  await page.route('/api/rank', async (route) => {
    // Generate rank results based on uploaded candidate IDs from request
    const reqBody = JSON.parse(route.request().postData() || '{}');
    const cands: { id: string }[] = reqBody.candidates || [];
    const items = cands.map((c, i) => ({
      id: c.id,
      breakdown: { skills: 40 - i * 3, experience: 24 - i * 2, relevance: 14, education: 8 },
      score: 86 - i * 5,
      relevantYears: 5 - Math.min(3, i),
      reason: `Evaluated candidate profile with solid skills.`,
      matchedSkills: ['React', 'Node.js', 'PostgreSQL'],
      missingSkills: ['Docker'],
      evidence: [{ claim: 'Built web applications', quote: 'Led full stack portal' }],
      concerns: [],
    }));

    const sse = [
      `data: ${JSON.stringify({ type: 'progress', message: 'Scoring candidates', done: 0, total: items.length })}\n\n`,
      ...items.map(
        (item, idx) =>
          `data: ${JSON.stringify({ type: 'item', item })}\n\n` +
          `data: ${JSON.stringify({ type: 'progress', message: `Scored ${idx + 1} of ${items.length}`, done: idx + 1, total: items.length })}\n\n`
      ),
      `data: ${JSON.stringify({ type: 'result', data: { failed: [], rankedAt: new Date().toISOString() }, meta: { provider: 'groq', model: 'mock', ms: 150 } })}\n\n`,
    ].join('');

    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      body: sse,
    });
  });

  await page.route('/api/questions', async (route) => {
    const sse = [
      `data: ${JSON.stringify({ type: 'progress', message: 'Generating interview questions' })}\n\n`,
      `data: ${JSON.stringify({ type: 'result', data: { questions: MOCK_QUESTIONS }, meta: { provider: 'groq', model: 'mock', ms: 80 } })}\n\n`,
    ].join('');
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      body: sse,
    });
  });

  await page.route('/api/market', async (route) => {
    const sse = [
      `data: ${JSON.stringify({ type: 'progress', message: 'Searching market compensation data' })}\n\n`,
      `data: ${JSON.stringify({ type: 'result', data: MOCK_MARKET, meta: { provider: 'groq', model: 'mock', ms: 90 } })}\n\n`,
    ].join('');
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      body: sse,
    });
  });

  await page.route('/api/search-strings', async (route) => {
    const sse = [
      `data: ${JSON.stringify({ type: 'progress', message: 'Building Boolean search strings' })}\n\n`,
      `data: ${JSON.stringify({ type: 'result', data: MOCK_SEARCH_STRINGS, meta: { provider: 'groq', model: 'mock', ms: 70 } })}\n\n`,
    ].join('');
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      body: sse,
    });
  });
}

test.describe('I. End-to-End Workflow Verification', () => {
  test('Complete flow: Landing, Auth, Onboarding, Dashboard, Workspace 7 Steps, Autosave, Command Palette, Sign Out', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('fonts.googleapis') && !msg.text().includes('fonts.gstatic')) {
        consoleErrors.push(msg.text());
      }
    });

    await setupMocks(page);

    // 1. Landing page verification
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Logo returns to "/"
    const logoLink = page.getByRole('link', { name: /Sift home/i }).first();
    await expect(logoLink).toBeVisible();
    await expect(logoLink).toHaveAttribute('href', '/');

    // Nav links scroll to section
    const featuresLink = page.locator('header a[href="#features"]');
    if (await featuresLink.isVisible()) {
      await featuresLink.click();
      await expect(page.locator('#features')).toBeVisible();
    }

    // CTA button navigates to auth with signup mode
    const ctaOrg = page.getByRole('button', { name: 'Start hiring' }).first();
    await ctaOrg.click();
    await expect(page).toHaveURL(/.*auth\?mode=signup.*/);

    // 2. Auth page checks - Recruiter only, no candidate tabs
    await expect(page.getByRole('tab', { name: /Candidates/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Hire with evidence/i })).toBeVisible();

    // Switch between Sign in and Sign up
    const signInBtn = page.getByRole('button', { name: 'Sign in', exact: true }).first();
    await signInBtn.click();
    await expect(page.getByRole('heading', { name: 'Recruiter sign in', exact: true })).toBeVisible();

    // Demo account "Use it" button
    const demoBtn = page.getByRole('button', { name: /Use it/i });
    await expect(demoBtn).toBeVisible();
    await demoBtn.click();

    // Verify demo fields filled
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toHaveValue('recruiter@demo.com');

    // Switch back to Sign up for onboarding test
    const signUpToggle = page.getByRole('button', { name: 'Sign up', exact: true }).first();
    await signUpToggle.click();

    // No temporary storage notice should appear
    const notice = page.locator('text=/temporary|ephemeral|guest storage/i');
    await expect(notice).toHaveCount(0);

    // 3. Signup -> Onboarding flow
    const testEmail = `qa_recruiter_${Date.now()}@example.com`;
    const nameInput = page.locator('input[placeholder*="name"]');
    await nameInput.fill('QA Recruiter');
    await emailInput.fill(testEmail);
    const pwdInput = page.locator('input[type="password"]');
    await pwdInput.fill('password123');

    const submitBtn = page.getByRole('button', { name: /Create recruiter account/i });
    await submitBtn.click();

    // Navigates to onboarding
    await expect(page).toHaveURL(/.*onboarding.*/);

    // Submit with empty fields triggers field validation
    const continueBtn = page.getByRole('button', { name: /Continue|Save|Complete/i });
    await continueBtn.click();
    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert.first()).toBeVisible();

    // Fill valid onboarding details
    await page.getByPlaceholder('e.g. Talent Acquisition Lead').fill('Lead Tech Recruiter');
    await page.getByPlaceholder('Company name').fill('QA Tech Labs');
    await page.getByPlaceholder('e.g. Software, Fintech').fill('Enterprise Software');
    await page.getByPlaceholder('City').fill('Bengaluru');
    const roleHireInput = page.getByPlaceholder('Add a skill and press Enter');
    await roleHireInput.fill('Full Stack');
    await roleHireInput.press('Enter');

    const finishOnboardingBtn = page.getByRole('button', { name: 'Continue to dashboard' });
    await finishOnboardingBtn.click();

    // Navigates to /app (Dashboard)
    await expect(page).toHaveURL(/.*\/app.*/);

    // 4. Dashboard interactions
    // Verify dashboard greeting
    await expect(page.locator('text=/Good morning|Good afternoon|Good evening/i')).toBeVisible();

    // Create new search
    const newSearchBtn = page.getByRole('button', { name: /New (?:hiring|candidate)?\s*search/i });
    await newSearchBtn.click();

    // Navigates to workspace /app/p/<id>
    await expect(page).toHaveURL(/.*\/app\/p\/.+/);

    // 5. Workspace - All 7 Steps flow with mocked AI routes
    // Step 1: JD Step
    await expect(page.getByRole('heading', { name: /Job description/i })).toBeVisible();

    // Paste JD / Use sample JD
    const sampleJdBtn = page.getByRole('button', { name: /Use sample JD/i });
    await sampleJdBtn.click();

    const analyzeBtn = page.getByRole('button', { name: /Analyze JD/i });
    await analyzeBtn.click();

    // Wait for JD understanding step to complete
    await expect(page.getByText(/What Sift understood/i)).toBeVisible({ timeout: 15000 });

    // Bento grid edit: edit role and verify "Corrected by you" badge
    const roleInput = page.locator('input[aria-label="Role"]');
    await roleInput.fill('Staff Full Stack Engineer');
    await expect(page.getByText('Corrected by you')).toBeVisible();

    // Continue to CVs step
    const nextToCVBtn = page.getByRole('button', { name: /Continue to CVs/i });
    await nextToCVBtn.click();

    // Step 2: Upload CVs Step
    await expect(page.getByRole('heading', { name: /Upload CVs/i })).toBeVisible();

    // Upload all 7 sample CVs from sample-data/cvs/
    const sampleCvFiles = [
      path.resolve(process.cwd(), 'sample-data/cvs/01_Ananya_Rao.pdf'),
      path.resolve(process.cwd(), 'sample-data/cvs/02_Rahul_Verma.docx'),
      path.resolve(process.cwd(), 'sample-data/cvs/03_Priya_Nair.pdf'),
      path.resolve(process.cwd(), 'sample-data/cvs/04_Karthik_Subramanian.docx'),
      path.resolve(process.cwd(), 'sample-data/cvs/05_Meera_Iyer.pdf'),
      path.resolve(process.cwd(), 'sample-data/cvs/06_Arjun_Mehta.docx'),
      path.resolve(process.cwd(), 'sample-data/cvs/07_Sneha_Kulkarni.pdf'),
    ];
    await page.locator('input[type="file"]').setInputFiles(sampleCvFiles);

    // Wait for files to be parsed ("7 read" / "7 of 7")
    await expect(page.getByText('of 7', { exact: true })).toBeVisible({ timeout: 15000 });
    const rankCandidatesBtn = page.getByRole('button', { name: /Rank 7 candidates/i });
    await expect(rankCandidatesBtn).toBeVisible({ timeout: 15000 });

    // Preview "What the AI sees" to highlight redactions
    const previewBtn = page.locator('button[aria-label="Preview what the AI sees"]').first();
    if (await previewBtn.isVisible()) {
      await previewBtn.click();
      await expect(page.getByRole('heading', { name: /What the AI sees/i })).toBeVisible();
      // Close preview dialog
      await page.keyboard.press('Escape');
    }

    // Continue to Rank step
    await rankCandidatesBtn.click();

    // Step 3: Rank Step
    const startRankBtn = page.getByRole('button', { name: /Rank candidates/i });
    await startRankBtn.click();

    // Candidates stream in
    await expect(page.getByText(/cand-|Candidate/i).first()).toBeVisible({ timeout: 15000 });

    // Score distribution and filter buttons are visible
    await expect(page.getByText('Score distribution')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /All \d+/i })).toBeVisible();

    // Continue to screening questions
    const nextToQuestionsBtn = page.getByRole('button', { name: /Continue to screening questions/i });
    await expect(nextToQuestionsBtn).toBeVisible({ timeout: 15000 });
    await nextToQuestionsBtn.click();

    // Step 4: Questions Step
    await expect(page.getByRole('heading', { name: /Screening questions/i })).toBeVisible();

    // Generate questions
    const writeQuestionsBtn = page.getByRole('button', { name: /Write 10 questions/i });
    await writeQuestionsBtn.click();

    // Wait for questions (Technical, Experience, Fit)
    await expect(page.getByText(/Technical/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Experience/i).first()).toBeVisible();
    await expect(page.getByText(/Fit/i).first()).toBeVisible();

    // Continue to hiring market
    const nextToMarketBtn = page.getByRole('button', { name: /Continue to hiring market/i });
    await nextToMarketBtn.click();

    // Step 5: Market Step
    await expect(page.getByRole('heading', { name: /Hiring market/i })).toBeVisible();

    // Search market
    const searchMarketBtn = page.getByRole('button', { name: /Search the market/i });
    await searchMarketBtn.click();

    // Verified vs Search links are displayed
    await expect(page.getByText(/Razorpay/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/CRED/i)).toBeVisible();

    // Continue to search strings
    const nextToStringsBtn = page.getByRole('button', { name: /Continue to search strings/i });
    await nextToStringsBtn.click();

    // Step 6: Strings Step
    await expect(page.getByRole('heading', { name: /Search strings/i })).toBeVisible();

    // Write search strings
    const writeStringsBtn = page.getByRole('button', { name: /Write search strings/i });
    await writeStringsBtn.click();

    await expect(page.getByRole('heading', { name: 'LinkedIn' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Naukri' })).toBeVisible();

    // Copy button
    const copyBtn = page.getByRole('button', { name: /LinkedIn Boolean/i });
    if (await copyBtn.isVisible()) {
      await copyBtn.click();
    }

    // Download hiring pack button is visible
    const downloadPackBtn = page.getByRole('button', { name: /Download hiring pack/i });
    await expect(downloadPackBtn).toBeVisible();

    // 6. Autosave check
    const saveIndicator = page.locator('text=/Saved|All changes saved|Saved just now/i');
    await expect(saveIndicator.first()).toBeVisible();

    // 7. Command Palette (Ctrl+K / ⌘K)
    await page.keyboard.press('Control+k');
    const cmdPalette = page.locator('[cmdk-root], [role="dialog"]');
    await expect(cmdPalette).toBeVisible();
    await page.keyboard.press('Escape');

    // 8. Sign out flow
    const userMenuBtn = page.locator('header button:has-text("QA"), header [aria-label*="account"], header [aria-label*="user"]').first();
    if (await userMenuBtn.isVisible()) {
      await userMenuBtn.click();
      const signOutBtn = page.getByRole('menuitem', { name: /Sign out/i }).or(page.getByRole('button', { name: /Sign out/i }));
      if (await signOutBtn.isVisible()) {
        await signOutBtn.click();
        await expect(page).toHaveURL(/.*auth.*/);
      }
    }

    // 9. Assert zero console errors throughout
    expect(consoleErrors).toEqual([]);
  });

  test('Mobile viewport (390px): No horizontal overflow and responsive layout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Assert no horizontal scrollbar on mobile
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px rounding tolerance
  });

  test('DOM hygiene: No provider or model names rendered in user-visible DOM', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').innerText();
    const banned = ['Groq', 'Gemini', 'sk-ant', 'gpt-oss', 'llama-3'];
    for (const b of banned) {
      expect(bodyText).not.toContain(b);
    }
  });
});
