import { z } from 'zod';

/* Lenient helpers: AI output is messy, so coerce and default rather than fail. */
const str = (fallback = '') => z.preprocess((v) => (v == null ? fallback : String(v).trim()), z.string());
const strList = z.preprocess(
  (v) => (Array.isArray(v) ? v.filter((x) => x != null && String(x).trim()).map((x) => String(x).trim()) : []),
  z.array(z.string())
);
const num = (lo: number, hi: number) =>
  z.preprocess((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(Math.min(hi, Math.max(lo, n))) : lo;
  }, z.number());
const nullableNum = z.preprocess((v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)), z.number().nullable());

/* ---------- Job description ---------- */
export const WorkMode = z.enum(['On-site', 'Hybrid', 'Remote', 'Not specified']);
export const JDSchema = z.object({
  isJobDescription: z.boolean().optional(),
  role: str('Untitled role'),
  company: z.preprocess((v) => (v ? String(v) : null), z.string().nullable()),
  location: str('Not specified'),
  workMode: z.preprocess((v) => (WorkMode.safeParse(v).success ? v : 'Not specified'), WorkMode),
  experience: z
    .object({ min: nullableNum, max: nullableNum, text: str('Not specified') })
    .default({ min: null, max: null, text: 'Not specified' }),
  seniority: str('Not specified'),
  employmentType: str('Not specified'),
  keySkills: strList,
  niceToHave: strList,
  responsibilities: strList,
  education: str('Not specified'),
  domain: str('Not specified'),
  summary: str(''),
});
export type JD = z.infer<typeof JDSchema>;

/* ---------- Ranking ---------- */
export const BreakdownSchema = z.object({
  skills: num(0, 50),
  experience: num(0, 25),
  relevance: num(0, 15),
  education: num(0, 10),
});
export type Breakdown = z.infer<typeof BreakdownSchema>;

export const RankItemSchema = z.object({
  id: str(),
  breakdown: BreakdownSchema,
  relevantYears: nullableNum,
  reason: str(),
  matchedSkills: strList,
  missingSkills: strList,
  evidence: strList,
  concerns: strList,
});
export const RankBatchSchema = z.object({ results: z.array(RankItemSchema) });

export type RankResult = z.infer<typeof RankItemSchema> & { score: number };

/* ---------- Screening questions ---------- */
export const QuestionCategory = z.enum(['Technical', 'Experience', 'Fit']);
export const QuestionSchema = z.object({
  category: z.preprocess((v) => (QuestionCategory.safeParse(v).success ? v : 'Fit'), QuestionCategory),
  question: str(),
  skill: str(),
  goodAnswer: str(),
  lookFor: strList,
  redFlags: strList,
});
export const QuestionsSchema = z.object({ questions: z.array(QuestionSchema).min(10) });
export type Question = z.infer<typeof QuestionSchema>;

/* ---------- Market insights ---------- */
export const Basis = z.enum(['Job post', 'Salary data', 'Estimate']);
export const InsightSchema = z.object({
  company: str('Unknown'),
  roleTitle: str(),
  experienceRange: str('Not stated'),
  compensationRange: str('Not stated'),
  location: str('Not stated'),
  sourceName: str(),
  sourceUrl: z.preprocess((v) => (typeof v === 'string' && /^https?:\/\//.test(v) ? v : null), z.string().nullable()),
  basis: z.preprocess((v) => (Basis.safeParse(v).success ? v : 'Estimate'), Basis),
  compensationIsEstimate: z.preprocess((v) => v !== false, z.boolean()),
});
export const MarketSchema = z.object({
  insights: z.array(InsightSchema).min(1),
  marketSummary: str(),
  caveats: strList,
});
/** link: verified source page, or a search URL that always works. openingsUrl: live openings search. */
export type Insight = z.infer<typeof InsightSchema> & { linkStatus: 'verified' | 'search'; link: string; openingsUrl: string };
export type Source = { title: string; url: string };
export type Market = {
  insights: Insight[];
  marketSummary: string;
  caveats: string[];
  sources: Source[];
  searchQueries: string[];
};

/* ---------- Search strings ---------- */
const PlatformStrings = z.object({ boolean: str(), plain: str(), filters: strList });
export const SearchStringsSchema = z.object({
  linkedin: PlatformStrings,
  naukri: PlatformStrings,
  notes: strList,
});
export type SearchStrings = z.infer<typeof SearchStringsSchema>;

/* ---------- Request bodies ---------- */
export const LoginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
export const ParseJDBody = z.object({ text: z.string().min(80, 'The job description is too short. Paste or upload the full JD.').max(40000) });
export const JDBody = z.object({ jd: JDSchema });
export const RankBody = z.object({
  jd: JDSchema,
  candidates: z.array(z.object({ id: z.string(), text: z.string() })).min(1, 'Upload at least one CV.').max(40, 'Rank up to 40 CVs at a time.'),
});

/* ---------- Streaming events (server → client over SSE) ---------- */
export type AIMeta = { provider: 'groq' | 'gemini' | 'anthropic' | 'openrouter'; model: string; ms: number };
export type StreamEvent =
  | { type: 'progress'; message: string; done?: number; total?: number }
  | { type: 'item'; item: unknown }
  | { type: 'result'; data: unknown; meta?: AIMeta }
  | { type: 'error'; message: string; status?: number };

/* ---------- Accounts & profiles ---------- */
export const AccountType = z.literal('organisation');
export type AccountType = z.infer<typeof AccountType>;

const email = z.string().trim().toLowerCase().email('Enter a valid email address.');
const password = z.string().min(6, 'Password must be at least 6 characters.').max(128);

export const SignupBody = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(80),
  email,
  password,
});
export const LoginBody2 = z.object({ email, password: z.string().min(1, 'Enter your password.'), accountType: z.string().optional() });

export const OrgProfile = z.object({
  type: z.literal('organisation'),
  fullName: z.string().trim().min(2, 'Enter your full name.'),
  designation: z.string().trim().min(2, 'Enter your designation.'),
  company: z.string().trim().min(2, 'Enter your company name.'),
  companySize: z.enum(['1-10', '11-50', '51-200', '201-1000', '1000+']),
  industry: z.string().trim().min(2, 'Enter your industry.'),
  location: z.string().trim().min(2, 'Enter a location.'),
  hiringFor: z.array(z.string().trim().min(1)).min(1, 'Add at least one role you hire for.').max(12),
});
export const ProfileSchema = OrgProfile;
export type Profile = z.infer<typeof ProfileSchema>;

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  accountType: 'organisation';
  profile: Profile | null;
  profileComplete: boolean;
  createdAt: number;
};

/* ---------- Projects (saved history) ---------- */
export type ProjectSummary = {
  id: string;
  title: string;
  role: string | null;
  completed: number; // of 7
  step: number;
  candidates: number;
  top: { name: string; score: number } | null;
  createdAt: number;
  updatedAt: number;
};
export const RenameBody = z.object({ title: z.string().trim().min(1, 'Title cannot be empty.').max(90) });
export const SaveProjectBody = z.object({ data: z.record(z.string(), z.unknown()), title: z.string().trim().min(1).max(90).optional() });
