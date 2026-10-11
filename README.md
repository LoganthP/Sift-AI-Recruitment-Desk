# Sift: AI Recruitment Desk

An AI recruitment platform for recruiters and hiring teams with a public landing page, recruiter authentication, profile setup, a dashboard with saved and renamable search history, and a seven-step workspace: recruiter login → dashboard → steps 2–7 (understand the JD → bulk-parse CVs → evidence-based stack ranking → screening questions → live hiring-market insights → LinkedIn/Naukri search strings).

## Pages

| Route | Page |
|---|---|
| `/` | Landing page (the Sift logo everywhere links here) |
| `/auth` | Recruiter sign in and Create recruiter account (name, work email, password) |
| `/onboarding` | Basic recruiter profile details, required once after sign-up |
| `/app` | Dashboard: profile card, stats, recent history with inline rename, search, filters, resume and delete |
| `/app/p/:id` | The seven-step workspace for one saved search. Autosaves; the title is editable in the header. |
| `/app/profile` | Edit profile |

Demo account: **recruiter@demo.com**, password `Demo@123`.

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Language | **TypeScript 7** (strict) | One type system across client, server and AI schemas |
| Build | **Vite 8** (Rolldown) | Fast dev server, code-split production build |
| UI | **React 19**, **Tailwind CSS v4** | Modern React with a CSS-first design token system |
| Components | **Radix UI** primitives (shadcn-style), **cmdk**, **vaul**, **sonner** | Accessible tabs, dialogs, sliders, accordions, toggle groups, ⌘K palette, drawers, toasts |
| Motion | **Motion** (Framer Motion), layout animations, springs | Re-ordering ranking, shared-layout pills, staggered reveals |
| 3D | **React Three Fiber + Three.js** with a custom GLSL shader | GPU-animated, pointer-reactive particle wave (lazy-loaded) |
| State | **Zustand** (persisted) + **TanStack Query** | Session state survives refresh; mutations handle loading/errors |
| Parallelism | **Web Workers + Comlink** worker pool | PDFs and Word files parse in parallel off the main thread |
| Routing | **React Router** with route guards | Landing, auth, onboarding, dashboard, workspace; profile setup enforced before the app |
| API | **Hono** on **Vercel Edge Functions** | One tiny, fast, web-standard API; JWT auth; secure headers |
| Data | **Upstash Redis** (REST, Edge-compatible) | Accounts, profiles and saved searches; passwords hashed with PBKDF2 via Web Crypto |
| Streaming | **Server-Sent Events** | Ranking streams each candidate as it's scored; long web searches stay alive |
| Validation | **Zod v4** | Every request and every AI response is validated, coerced and auto-repaired |
| AI | **Groq** (default) or **Anthropic Claude** | Groq uses browser search, Claude uses its web search tool, for market data |

## Features

1. **Sign in:** Recruiter authentication, sign-up with validation, hashed passwords, 12-hour JWT sessions, and instant demo recruiter access.
2. **Job description:** PDF/.docx/pasted text. Results appear in an editable bento grid; corrections are tagged "Corrected by you".
3. **Upload CVs:** bulk drop, parsed by a pool of Web Workers with a live per-thread view and parse timings. Name, gender, age, DOB, marital status, religion, nationality, family details, photo, email, phone and links are removed in the worker before anything reaches the AI. "What the AI sees" highlights every redaction.
4. **Stack ranking:**
   - Scores stream in live with a progress bar and skeletons for pending CVs.
   - Rubric: skills backed by real work (50), relevant experience (25), project/domain fit (15), education (10). The server recomputes the total from the breakdown.
   - Score distribution histogram, filters (All / Review / Shortlist), Shortlist/Hold/Reject decisions.
   - Candidate drawer: radar chart, breakdown bars, evidence quotes (each checked against the CV text), automatic check, and a score-correction slider with a note.
   - Compare up to 3 candidates with overlaid radar charts. CSV export.
5. **Screening questions:** 10 questions (4 technical, 3 experience, 3 fit) in an accordion with category filters, plus **Call mode**, a keyboard-driven carousel for use during a live call.
6. **Hiring market:** live web search. Pay-landscape range chart, cards/table views, a source or "Estimate" label on every row, search queries shown, and per-row "Checked" tracking. **Every source link is opened by the server before it is shown.** Live pages stay as direct links (✓). Dead links, soft-404 pages and sites that block checks are replaced with a working search scoped to the same site, so a link never lands on a 404. Every company also gets an "Openings" search link.
7. **Search strings:** LinkedIn and Naukri, Boolean and plain. The Boolean editor has live syntax highlighting, bracket/quote balance checking and a character budget. Download the full **hiring pack** (Markdown).

Also included: a **⌘K / Ctrl+K command palette**, reduced-motion support, keyboard focus states, and a responsive layout down to mobile.

## Fairness and checking the AI

- **Redaction before the AI**, in the browser worker and again on the server.
- **Evidence-only rubric.** Listed-only skills earn at most half credit.
- **Second opinion.** A non-AI check flags matched skills that never appear in the CV (`skill?`), quotes that aren't in the CV, and score/keyword disagreements.
- **Zod validation and repair.** Malformed AI output gets one automatic repair round; otherwise a clear error is shown.
- **Recruiter override** with a note. The list re-orders and shows "AI said X".
- **Market sources.** Each row has a named source or an "Estimate" label. Links whose site didn't appear in the search results are marked "unverified link". LinkedIn and Naukri are never scraped.

## Run locally

```bash
npm install
cp .env.example .env     # add GROQ_API_KEY (key from https://console.groq.com/keys)
npm run dev              # http://localhost:5173 serves the frontend and the Hono API
```

Demo login: `recruiter@demo.com` / `Demo@123`. Other scripts: `npm run typecheck`, `npm run build`, `npm run preview`.

## Deploy to Vercel

1. Push to GitHub, then in Vercel choose **Add New → Project** and import the repo (detected as Vite).
2. **Add the database:** in the Vercel project, go to **Storage → Marketplace → Upstash for Redis → Create** and connect it to the project. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically (free tier is enough). Without it, accounts and history are kept in memory and reset whenever the function restarts.
3. Add environment variables: `GROQ_API_KEY` (or `ANTHROPIC_API_KEY`), `AUTH_SECRET` (long random string), optionally `DEMO_EMAIL` / `DEMO_PASSWORD`.
4. Deploy. `vercel.json` sends `/api/*` to the single Edge Function at `api/index.ts` and every other path to the app, so deep links like `/app/p/…` work on refresh.

If Vercel ever rejects the Edge runtime, delete the `runtime: 'edge'` line in `api/index.ts`; the same code runs on Node.

| Variable | Default |
|---|---|
| `GROQ_API_KEY` | required for Groq |
| `GROQ_MODELS_FAST` | `openai/gpt-oss-20b,llama-3.1-8b-instant` |
| `GROQ_MODELS_HEAVY` | `openai/gpt-oss-120b,openai/gpt-oss-20b,llama-3.3-70b-versatile` |
| `AI_PROVIDERS` | `groq,gemini,openrouter` |
| `GEMINI_API_KEY` | optional free backup provider |
| `OPENROUTER_API_KEY` | optional third provider (key from [openrouter.ai/keys](https://openrouter.ai/keys)) |
| `OPENROUTER_MODELS_FAST` | optional comma-separated list (auto-discovered if unset) |
| `OPENROUTER_MODELS_HEAVY` | optional comma-separated list (auto-discovered if unset) |
| `OPENROUTER_RPM` | `18` (free-tier rate limit bucket) |
| `OPENROUTER_WEB` | `0` (set to `1` to enable paid web search plugin for market) |
| `APP_URL` | `http://localhost:5173` |
| `ANTHROPIC_API_KEY` | optional |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | set by the Upstash integration (in-memory fallback without them) |
| `AUTH_SECRET` | dev fallback (set it in production) |
| `DEMO_EMAIL`, `DEMO_PASSWORD` | `recruiter@demo.com`, `Demo@123` |

## Rate limits

Sift is resilient to upstream rate limits across a three-provider fallback chain configured via `AI_PROVIDERS="groq,gemini,openrouter"`:

- **Three-provider fallback chain:** Providers are tried in order (`groq` → `gemini` → `openrouter`). Any provider whose API key is missing is silently skipped. Requests move to the next provider only when the current one is fully exhausted or failing (429s, 5xx, timeouts, or all models skipped). When every provider is exhausted, Sift returns a friendly 429 error displaying the soonest reset time across all providers, without exposing provider or model names to users.
- **Groq model fallback chain:** Quotas are enforced per model and per organization. When a Groq model hits a daily limit (TPD/RPD), wait time is parsed, the model is marked exhausted in memory and in KV (`ai:exhausted:<model>`), and Sift immediately tries the next model without sleeping. Per-minute limits (TPM/RPM) wait for `retry-after` (up to 8s) once before falling back. Decommissioned models (404) are permanently skipped.
- **Gemini free backup:** When Groq is exhausted or unconfigured, requests fall back seamlessly to Gemini REST (`gemini-2.5-flash`).
- **OpenRouter free tier:**
  - **Getting a key:** Generate a free API key at [openrouter.ai/keys](https://openrouter.ai/keys). To set it in Vercel, navigate to **Project Settings → Environment Variables**, add `OPENROUTER_API_KEY`, and redeploy.
  - **Dynamic model auto-discovery:** If `OPENROUTER_MODELS_FAST` or `OPENROUTER_MODELS_HEAVY` are unset, Sift queries `https://openrouter.ai/api/v1/models` and filters for free models (IDs ending in `:free`) with a context length of at least 32,000, prioritizing text-only instruct/chat models. The discovered list is cached in memory and in KV (`ai:or:models`) for 1 hour. Heavy tasks use the 3 largest-context models; fast tasks use the first 3. If an endpoint returns 404 or "No endpoints found", it is pruned from the cache.
  - **Rate limits & token bucket:** OpenRouter free models have a limit of ~20 requests/minute (controlled by a token bucket default of 18 RPM via `OPENROUTER_RPM`) and 50 requests/day without purchased credits. If the token bucket is empty, Sift waits up to 4 seconds or skips to the next provider. On 429, `X-RateLimit-Reset` is respected; if a daily limit is reported, OpenRouter is marked exhausted in memory and KV (`ai:exhausted:openrouter`) until the next UTC midnight. On 402 (insufficient credits), it is marked exhausted for 1 hour. For `/rank` on OpenRouter, concurrency is capped at 2 if there are more than 2 batches to prevent rate limit spikes.
  - **Web search for /market:** By default, OpenRouter serves `/market` without web search (handled by Sift's link check and "Estimate" logic). Setting `OPENROUTER_WEB=1` enables the OpenRouter web search plugin (`plugins: [{ id: "web", max_results: 5 }]`), which consumes paid credits.
- **Result cache in KV:** Validated JSON outputs are cached in KV under `ai:cache:<sha256>`. Results are stored for 7 days (parse-jd, questions, search-strings, rank) and 24 hours (market). In `/rank`, caching is candidate-level (`hash(jdBrief + cvText)`), so re-running or appending a candidate only invokes the AI for uncached profiles. Cache hits skip every upstream AI provider completely.

## Project structure

```
api/
  index.ts               Vercel Edge entry (hono/vercel handle)
  _lib/app.ts            Hono routes: auth, profile, projects, parse-jd, rank (streaming), questions, market, search-strings
  _lib/kv.ts             Redis REST client with in-memory fallback
  _lib/users.ts          Accounts, PBKDF2 password hashing, demo accounts
  _lib/projects.ts       Saved searches and dashboard summaries
  _lib/links.ts          Live link checks and safe search fallbacks for market data
  _lib/ai.ts             Groq/Claude providers, retries with backoff, Zod-validated JSON + repair, concurrency pool
  _lib/prompts.ts        Prompts and the scoring rubric
shared/schemas.ts        Zod schemas and types shared by client and server
src/
  pages/                 Landing, Auth, ProfileSetup, Dashboard, Workspace
  features/              One screen per step (code-split)
  components/ui/         Button (cva), Badge, Radix primitives, SpotlightCard
  components/fx/         ParticleField (R3F shader), Aurora, NumberTicker, ScoreRing, RadarChart, confetti
  components/            Sidebar, CommandMenu, Dropzone, shared blocks
  workers/parser.worker.ts  pdf.js + mammoth + redaction, exposed with Comlink
  lib/                   SSE client, worker pool, AI checks, exports
  store/                 Zustand stores (auth in sessionStorage, session in localStorage)
sample-data/             Fictional JD and 7 fictional CVs (4 PDF, 3 Word)
```

## Sample data

All people and companies are made up. Two CVs are built to test the AI:

- **Meera Iyer** lists every skill but has only worked in support and data entry. Use her to show a correction.
- **Arjun Mehta** has a full personal-details block. Use him to show redaction.

## Recording guide (≤ 7 minutes)

| Time | Show |
|---|---|
| 0:00 | What Sift is and the tools used (built with Claude; Groq + browser search at runtime) |
| 0:30 | Landing page → **1** Recruiter login, profile setup, dashboard history |
| 0:50 | **2** Upload the JD PDF, stream the analysis, walk the bento grid |
| 1:40 | **3** Drop all 7 CVs, point at the worker threads and the count, open Arjun's "What the AI sees" |
| 2:20 | **4** Rank: results stream in. Explain the rubric and chips, **correct one result** in the drawer, compare 3, export CSV |
| 4:00 | **5** Questions, then Call mode |
| 4:45 | **6** Market: pay chart, open a source, mark it checked, point out estimates and unverified links |
| 5:50 | **7** Search strings, copy one, download the hiring pack, ⌘K palette |
| 6:40 | Wrap up |
