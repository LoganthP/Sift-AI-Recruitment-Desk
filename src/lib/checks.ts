import type { JD, RankResult } from '@shared/schemas';

// Deterministic second opinion on the AI's claims.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]/g, '');
const LLM = ['llm', 'largelanguagemodel', 'languagemodel', 'openai', 'gpt', 'claude', 'groq', 'llama', 'mistral'];
const VDB = ['vectordb', 'vectordatabase', 'pinecone', 'weaviate', 'faiss', 'chroma', 'qdrant', 'milvus', 'pgvector'];
const ALIASES: Record<string, string[]> = {
  llm: LLM, llms: LLM,
  rag: ['rag', 'retrievalaugmented'],
  ml: ['machinelearning', 'ml'],
  nlp: ['nlp', 'naturallanguage'],
  aws: ['aws', 'amazonwebservices'],
  gcp: ['gcp', 'googlecloud'],
  vectordatabases: VDB, vectordatabase: VDB, embeddings: ['embedding', ...VDB],
  promptengineering: ['prompt'],
  cicd: ['cicd', 'githubactions', 'jenkins', 'gitlabci'],
};

export function mentions(text: string, skill: string) {
  const t = norm(text);
  return skill.split(/\s*\/\s*|\s+or\s+|\s*,\s*/i).some((part) => {
    const n = norm(part);
    if (!n) return false;
    if (n.length <= 2) return new RegExp(`(^|[^a-z0-9])${part.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(text);
    return t.includes(n) || (ALIASES[n] || []).some((a) => t.includes(norm(a)));
  });
}

export type Check = { unverified: string[]; coverage: number; keywordsFound: string[]; flags: string[]; needsReview: boolean };

export function verify(r: RankResult, cvText: string, jd: JD | null): Check {
  const keySkills = jd?.keySkills || [];
  const unverified = r.matchedSkills.filter((s) => !mentions(cvText, s));
  const keywordsFound = keySkills.filter((s) => mentions(cvText, s));
  const coverage = keySkills.length ? keywordsFound.length / keySkills.length : 0;
  const flags: string[] = [];
  if (unverified.length) flags.push(`${unverified.length} matched skill${unverified.length > 1 ? 's' : ''} not found in the CV text`);
  if (r.score >= 70 && coverage < 0.4) flags.push('High score but few JD keywords appear in the CV');
  if (r.score < 45 && coverage > 0.75) flags.push('Most JD keywords appear but the score is low. Check whether real work backs them');
  flags.push(...r.concerns.map((c) => `AI noted: ${c}`));
  return { unverified, coverage, keywordsFound, flags, needsReview: flags.length > 0 };
}
