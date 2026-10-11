# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workflow.spec.ts >> I. End-to-End Workflow Verification >> Complete flow: Landing, Auth, Onboarding, Dashboard, Workspace 7 Steps, Autosave, Command Palette, Sign Out
- Location: tests\e2e\workflow.spec.ts:163:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /All \d+/i })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('button', { name: /All \d+/i }) with timeout 15000ms
  - waiting for getByRole('button', { name: /All \d+/i })

```

```yaml
- banner:
  - link "Sift home":
    - /url: /
    - text: Sift
  - navigation "Breadcrumb":
    - link "Dashboard":
      - /url: /app
    - button "Rename this search": Untitled search · 11 Oct
  - text: Saved just now
  - button "Actions ⌘K"
  - button "Download hiring pack"
  - button "QR QA Recruiter"
- complementary:
  - navigation "Workflow":
    - text: 4 of 7 complete jump ⌘K
    - list:
      - listitem:
        - button "Signed in Account and profile" [disabled]
      - listitem:
        - button "Job description What the role needs"
      - listitem:
        - button "Upload CVs Parse in parallel"
      - listitem:
        - button "Stack ranking Evidence-based scores"
      - listitem:
        - button "Screening questions Call script"
      - listitem:
        - button "Hiring market Live web search"
      - listitem:
        - button "Search strings LinkedIn and Naukri"
- main:
  - paragraph: Step 4 of 7
  - heading "Stack ranking" [level=1]
  - paragraph: Each CV is scored out of 100 using only evidence in the CV. Results stream in as they're scored, then Sift double-checks every AI claim against the CV text.
  - button "Compare" [disabled]
  - button "CSV"
  - button "Rank again"
  - paragraph: Ranked
  - text: "7"
  - paragraph: Average
  - text: "71"
  - paragraph: To review
  - text: "6"
  - paragraph: Score distribution 0 → 100
  - img "Score distribution"
  - radiogroup:
    - radio "All 7" [checked]
    - radio "Review 6"
    - radio "Shortlist 0"
  - text: skill found in CV skill? AI claim not in CV skill missing tick 2–3 to compare
  - list:
    - listitem:
      - button "Compare"
      - text: "#1"
      - button "Open Ananya Rao":
        - img "Score 86 out of 100":
          - img
          - text: "86"
      - button "Ananya Rao"
      - text: Review
      - paragraph: Evaluated candidate profile with solid skills.
      - text: React? Node.js? PostgreSQL Docker
      - radiogroup:
        - radio "Shortlist"
        - radio "Hold"
        - radio "Reject"
      - button "Details and correction"
    - listitem:
      - button "Compare"
      - text: "#2"
      - button "Open Rahul Verma":
        - img "Score 81 out of 100":
          - img
          - text: "81"
      - button "Rahul Verma"
      - text: Review
      - paragraph: Evaluated candidate profile with solid skills.
      - text: React? Node.js? PostgreSQL? Docker
      - radiogroup:
        - radio "Shortlist"
        - radio "Hold"
        - radio "Reject"
      - button "Details and correction"
    - listitem:
      - button "Compare"
      - text: "#3"
      - button "Open Priya Nair":
        - img "Score 76 out of 100":
          - img
          - text: "76"
      - button "Priya Nair"
      - text: Review
      - paragraph: Evaluated candidate profile with solid skills.
      - text: React? Node.js? PostgreSQL? Docker
      - radiogroup:
        - radio "Shortlist"
        - radio "Hold"
        - radio "Reject"
      - button "Details and correction"
    - listitem:
      - button "Compare"
      - text: "#4"
      - button "Open Karthik Subramanian":
        - img "Score 71 out of 100":
          - img
          - text: "71"
      - button "Karthik Subramanian"
      - text: Review
      - paragraph: Evaluated candidate profile with solid skills.
      - text: React? Node.js? PostgreSQL? Docker
      - radiogroup:
        - radio "Shortlist"
        - radio "Hold"
        - radio "Reject"
      - button "Details and correction"
    - listitem:
      - button "Compare"
      - text: "#5"
      - button "Open Meera Iyer":
        - img "Score 66 out of 100":
          - img
          - text: "66"
      - button "Meera Iyer"
      - text: Review
      - paragraph: Evaluated candidate profile with solid skills.
      - text: React? Node.js? PostgreSQL? Docker
      - radiogroup:
        - radio "Shortlist"
        - radio "Hold"
        - radio "Reject"
      - button "Details and correction"
    - listitem:
      - button "Compare"
      - text: "#6"
      - button "Open Arjun Mehta":
        - img "Score 61 out of 100":
          - img
          - text: "61"
      - button "Arjun Mehta"
      - text: Review
      - paragraph: Evaluated candidate profile with solid skills.
      - text: React? Node.js? PostgreSQL? Docker
      - radiogroup:
        - radio "Shortlist"
        - radio "Hold"
        - radio "Reject"
      - button "Details and correction"
    - listitem:
      - button "Compare"
      - text: "#7"
      - button "Open Sneha Kulkarni":
        - img "Score 56 out of 100":
          - img
          - text: "56"
      - button "Sneha Kulkarni"
      - paragraph: Evaluated candidate profile with solid skills.
      - text: React Node.js PostgreSQL Docker
      - radiogroup:
        - radio "Shortlist"
        - radio "Hold"
        - radio "Reject"
      - button "Details and correction"
  - button "Continue to screening questions"
- region "Notifications alt+T"
```

# Test source

```ts
  236 | 
  237 |     // Navigates to onboarding
  238 |     await expect(page).toHaveURL(/.*onboarding.*/);
  239 | 
  240 |     // Submit with empty fields triggers field validation
  241 |     const continueBtn = page.getByRole('button', { name: /Continue|Save|Complete/i });
  242 |     await continueBtn.click();
  243 |     const errorAlert = page.locator('[role="alert"]');
  244 |     await expect(errorAlert.first()).toBeVisible();
  245 | 
  246 |     // Fill valid onboarding details
  247 |     await page.getByPlaceholder('e.g. Talent Acquisition Lead').fill('Lead Tech Recruiter');
  248 |     await page.getByPlaceholder('Company name').fill('QA Tech Labs');
  249 |     await page.getByPlaceholder('e.g. Software, Fintech').fill('Enterprise Software');
  250 |     await page.getByPlaceholder('City').fill('Bengaluru');
  251 |     const roleHireInput = page.getByPlaceholder('Add a skill and press Enter');
  252 |     await roleHireInput.fill('Full Stack');
  253 |     await roleHireInput.press('Enter');
  254 | 
  255 |     const finishOnboardingBtn = page.getByRole('button', { name: 'Continue to dashboard' });
  256 |     await finishOnboardingBtn.click();
  257 | 
  258 |     // Navigates to /app (Dashboard)
  259 |     await expect(page).toHaveURL(/.*\/app.*/);
  260 | 
  261 |     // 4. Dashboard interactions
  262 |     // Verify dashboard greeting
  263 |     await expect(page.locator('text=/Good morning|Good afternoon|Good evening/i')).toBeVisible();
  264 | 
  265 |     // Create new search
  266 |     const newSearchBtn = page.getByRole('button', { name: /New (?:hiring|candidate)?\s*search/i });
  267 |     await newSearchBtn.click();
  268 | 
  269 |     // Navigates to workspace /app/p/<id>
  270 |     await expect(page).toHaveURL(/.*\/app\/p\/.+/);
  271 | 
  272 |     // 5. Workspace - All 7 Steps flow with mocked AI routes
  273 |     // Step 1: JD Step
  274 |     await expect(page.getByRole('heading', { name: /Job description/i })).toBeVisible();
  275 | 
  276 |     // Paste JD / Use sample JD
  277 |     const sampleJdBtn = page.getByRole('button', { name: /Use sample JD/i });
  278 |     await sampleJdBtn.click();
  279 | 
  280 |     const analyzeBtn = page.getByRole('button', { name: /Analyze JD/i });
  281 |     await analyzeBtn.click();
  282 | 
  283 |     // Wait for JD understanding step to complete
  284 |     await expect(page.getByText(/What Sift understood/i)).toBeVisible({ timeout: 15000 });
  285 | 
  286 |     // Bento grid edit: edit role and verify "Corrected by you" badge
  287 |     const roleInput = page.locator('input[aria-label="Role"]');
  288 |     await roleInput.fill('Staff Full Stack Engineer');
  289 |     await expect(page.getByText('Corrected by you')).toBeVisible();
  290 | 
  291 |     // Continue to CVs step
  292 |     const nextToCVBtn = page.getByRole('button', { name: /Continue to CVs/i });
  293 |     await nextToCVBtn.click();
  294 | 
  295 |     // Step 2: Upload CVs Step
  296 |     await expect(page.getByRole('heading', { name: /Upload CVs/i })).toBeVisible();
  297 | 
  298 |     // Upload all 7 sample CVs from sample-data/cvs/
  299 |     const sampleCvFiles = [
  300 |       path.resolve(process.cwd(), 'sample-data/cvs/01_Ananya_Rao.pdf'),
  301 |       path.resolve(process.cwd(), 'sample-data/cvs/02_Rahul_Verma.docx'),
  302 |       path.resolve(process.cwd(), 'sample-data/cvs/03_Priya_Nair.pdf'),
  303 |       path.resolve(process.cwd(), 'sample-data/cvs/04_Karthik_Subramanian.docx'),
  304 |       path.resolve(process.cwd(), 'sample-data/cvs/05_Meera_Iyer.pdf'),
  305 |       path.resolve(process.cwd(), 'sample-data/cvs/06_Arjun_Mehta.docx'),
  306 |       path.resolve(process.cwd(), 'sample-data/cvs/07_Sneha_Kulkarni.pdf'),
  307 |     ];
  308 |     await page.locator('input[type="file"]').setInputFiles(sampleCvFiles);
  309 | 
  310 |     // Wait for files to be parsed ("7 read" / "7 of 7")
  311 |     await expect(page.getByText('of 7', { exact: true })).toBeVisible({ timeout: 15000 });
  312 |     const rankCandidatesBtn = page.getByRole('button', { name: /Rank 7 candidates/i });
  313 |     await expect(rankCandidatesBtn).toBeVisible({ timeout: 15000 });
  314 | 
  315 |     // Preview "What the AI sees" to highlight redactions
  316 |     const previewBtn = page.locator('button[aria-label="Preview what the AI sees"]').first();
  317 |     if (await previewBtn.isVisible()) {
  318 |       await previewBtn.click();
  319 |       await expect(page.getByRole('heading', { name: /What the AI sees/i })).toBeVisible();
  320 |       // Close preview dialog
  321 |       await page.keyboard.press('Escape');
  322 |     }
  323 | 
  324 |     // Continue to Rank step
  325 |     await rankCandidatesBtn.click();
  326 | 
  327 |     // Step 3: Rank Step
  328 |     const startRankBtn = page.getByRole('button', { name: /Rank candidates/i });
  329 |     await startRankBtn.click();
  330 | 
  331 |     // Candidates stream in
  332 |     await expect(page.getByText(/cand-|Candidate/i).first()).toBeVisible({ timeout: 15000 });
  333 | 
  334 |     // Score distribution and filter buttons are visible
  335 |     await expect(page.getByText('Score distribution')).toBeVisible({ timeout: 15000 });
> 336 |     await expect(page.getByRole('button', { name: /All \d+/i })).toBeVisible();
      |                                                                  ^ Error: expect(locator).toBeVisible() failed
  337 | 
  338 |     // Continue to screening questions
  339 |     const nextToQuestionsBtn = page.getByRole('button', { name: /Continue to screening questions/i });
  340 |     await expect(nextToQuestionsBtn).toBeVisible({ timeout: 15000 });
  341 |     await nextToQuestionsBtn.click();
  342 | 
  343 |     // Step 4: Questions Step
  344 |     await expect(page.getByRole('heading', { name: /Screening questions/i })).toBeVisible();
  345 | 
  346 |     // Generate questions
  347 |     const writeQuestionsBtn = page.getByRole('button', { name: /Write 10 questions/i });
  348 |     await writeQuestionsBtn.click();
  349 | 
  350 |     // Wait for questions (Technical, Experience, Fit)
  351 |     await expect(page.getByText(/Technical/i).first()).toBeVisible({ timeout: 15000 });
  352 |     await expect(page.getByText(/Experience/i).first()).toBeVisible();
  353 |     await expect(page.getByText(/Fit/i).first()).toBeVisible();
  354 | 
  355 |     // Continue to hiring market
  356 |     const nextToMarketBtn = page.getByRole('button', { name: /Continue to hiring market/i });
  357 |     await nextToMarketBtn.click();
  358 | 
  359 |     // Step 5: Market Step
  360 |     await expect(page.getByRole('heading', { name: /Hiring market/i })).toBeVisible();
  361 | 
  362 |     // Search market
  363 |     const searchMarketBtn = page.getByRole('button', { name: /Search the market/i });
  364 |     await searchMarketBtn.click();
  365 | 
  366 |     // Verified vs Search links are displayed
  367 |     await expect(page.getByText(/Razorpay/i)).toBeVisible({ timeout: 15000 });
  368 |     await expect(page.getByText(/CRED/i)).toBeVisible();
  369 | 
  370 |     // Continue to search strings
  371 |     const nextToStringsBtn = page.getByRole('button', { name: /Continue to search strings/i });
  372 |     await nextToStringsBtn.click();
  373 | 
  374 |     // Step 6: Strings Step
  375 |     await expect(page.getByRole('heading', { name: /Search strings/i })).toBeVisible();
  376 | 
  377 |     // Write search strings
  378 |     const writeStringsBtn = page.getByRole('button', { name: /Write search strings/i });
  379 |     await writeStringsBtn.click();
  380 | 
  381 |     await expect(page.getByRole('heading', { name: 'LinkedIn' })).toBeVisible({ timeout: 10000 });
  382 |     await expect(page.getByRole('heading', { name: 'Naukri' })).toBeVisible();
  383 | 
  384 |     // Copy button
  385 |     const copyBtn = page.getByRole('button', { name: /LinkedIn Boolean/i });
  386 |     if (await copyBtn.isVisible()) {
  387 |       await copyBtn.click();
  388 |     }
  389 | 
  390 |     // Download hiring pack button is visible
  391 |     const downloadPackBtn = page.getByRole('button', { name: /Download hiring pack/i });
  392 |     await expect(downloadPackBtn).toBeVisible();
  393 | 
  394 |     // 6. Autosave check
  395 |     const saveIndicator = page.locator('text=/Saved|All changes saved|Saved just now/i');
  396 |     await expect(saveIndicator.first()).toBeVisible();
  397 | 
  398 |     // 7. Command Palette (Ctrl+K / ⌘K)
  399 |     await page.keyboard.press('Control+k');
  400 |     const cmdPalette = page.locator('[cmdk-root], [role="dialog"]');
  401 |     await expect(cmdPalette).toBeVisible();
  402 |     await page.keyboard.press('Escape');
  403 | 
  404 |     // 8. Sign out flow
  405 |     const userMenuBtn = page.locator('header button:has-text("QA"), header [aria-label*="account"], header [aria-label*="user"]').first();
  406 |     if (await userMenuBtn.isVisible()) {
  407 |       await userMenuBtn.click();
  408 |       const signOutBtn = page.getByRole('menuitem', { name: /Sign out/i }).or(page.getByRole('button', { name: /Sign out/i }));
  409 |       if (await signOutBtn.isVisible()) {
  410 |         await signOutBtn.click();
  411 |         await expect(page).toHaveURL(/.*auth.*/);
  412 |       }
  413 |     }
  414 | 
  415 |     // 9. Assert zero console errors throughout
  416 |     expect(consoleErrors).toEqual([]);
  417 |   });
  418 | 
  419 |   test('Mobile viewport (390px): No horizontal overflow and responsive layout', async ({ page }) => {
  420 |     await page.setViewportSize({ width: 390, height: 844 });
  421 |     await page.goto('/');
  422 |     await page.waitForLoadState('networkidle');
  423 | 
  424 |     // Assert no horizontal scrollbar on mobile
  425 |     const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  426 |     const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  427 |     expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px rounding tolerance
  428 |   });
  429 | 
  430 |   test('DOM hygiene: No provider or model names rendered in user-visible DOM', async ({ page }) => {
  431 |     await page.goto('/');
  432 |     await page.waitForLoadState('networkidle');
  433 | 
  434 |     const bodyText = await page.locator('body').innerText();
  435 |     const banned = ['Groq', 'Gemini', 'sk-ant', 'gpt-oss', 'llama-3'];
  436 |     for (const b of banned) {
```