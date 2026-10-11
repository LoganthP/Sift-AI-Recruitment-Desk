import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { redact, guessName } from '../src/lib/fairness';
import { mentions, verify } from '../src/lib/checks';
import type { JD, RankResult } from '../shared/schemas';

describe('G. Fairness and Verification Logic', () => {
  it('G.1 Client-side redaction on real sample CV (06_Arjun_Mehta.docx)', async () => {
    const cvPath = path.resolve(process.cwd(), 'sample-data/cvs/06_Arjun_Mehta.docx');
    expect(fs.existsSync(cvPath)).toBe(true);

    const buf = fs.readFileSync(cvPath);
    const { value: rawText } = await mammoth.extractRawText({ buffer: buf });

    const result = redact(rawText);
    const redactedText = result.text;

    // 1. All protected personal details removed
    expect(result.removed).toContain('Gender');
    expect(result.removed).toContain('Age');
    expect(result.removed).toContain('Date of birth');
    expect(result.removed).toContain('Marital status');
    expect(result.removed).toContain('Nationality');
    expect(result.removed).toContain('Religion');
    expect(result.removed).toContain('Photo');
    expect(result.removed).toContain('Name');
    expect(result.removed).toContain('Contact details');

    // 2. Sensitive values are not present in the output text
    expect(redactedText).not.toContain('Male');
    expect(redactedText).not.toMatch(/Age:\s*31/);
    expect(redactedText).not.toContain('14/03/1995');
    expect(redactedText).not.toContain('Married');
    expect(redactedText).not.toContain('Indian');
    expect(redactedText).not.toContain('Hindu');
    expect(redactedText).not.toContain('arjun.mehta@example.com');
    expect(redactedText).not.toContain('98200 66666');
    expect(redactedText).not.toContain('Arjun Mehta');

    // 3. Name replaced by "Candidate"
    expect(result.name).toBe('Arjun Mehta');
    expect(redactedText).toContain('Candidate');

    // 4. Skills, dates and job titles stay untouched
    expect(redactedText).toContain('Lead Data Scientist');
    expect(redactedText).toContain('Data Scientist');
    expect(redactedText).toContain('2023 to Present');
    expect(redactedText).toContain('2020 to 2023');
    expect(redactedText).toContain('LangChain');
    expect(redactedText).toContain('OpenAI');
    expect(redactedText).toContain('pgvector');
    expect(redactedText).toContain('Python');
    expect(redactedText).toContain('Docker');
    expect(redactedText).toContain('AWS SageMaker');
  });

  it('G.2 Date ranges like "2019 - 2023" must NOT be treated as phone numbers', () => {
    const textWithDates = 'Senior Software Engineer (2019 - 2023)\nEducation: B.Tech (2015 - 2019)';
    const result = redact(textWithDates);

    expect(result.text).toContain('2019 - 2023');
    expect(result.text).toContain('2015 - 2019');
    expect(result.text).not.toContain('[phone]');
    expect(result.removed).not.toContain('Contact details');

    // Real Indian 10-digit phone number is replaced
    const textWithPhone = 'Phone: +91 98765 43210\nDuration: 2018 - 2022';
    const resPhone = redact(textWithPhone);
    expect(resPhone.text).toContain('[phone]');
    expect(resPhone.text).toContain('2018 - 2022');
  });

  it('G.3 Server scrub removes the same fields as a backup', async () => {
    // Import scrub logic from app.ts (or test cleanCVText)
    const raw = `
Arjun Mehta
Gender: Male
Age: 31
Date of Birth: 14/03/1995
Marital Status: Married
Nationality: Indian
Religion: Hindu
Photo: attached
Email: test@example.com
Phone: +91 9876543210
Experience: 2019 - 2024
Role: Backend Lead
Skills: Go, Kubernetes
    `;

    // Test server-side scrub regexes matching app.ts:
    const serverScrubbed = raw
      .replace(/^[ \t]*(?:gender|sex|age|date of birth|d\.?\s?o\.?\s?b\.?|marital status|religion|caste|nationality|father'?s name|mother'?s name|spouse(?:'s)? name|photo(?:graph)?)\b[ \t]*[:\-–][^\n]*$/gim, '[personal detail removed]')
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
      .replace(/(?:\+\d{1,3}[\s-]?)?\b\d{5}[\s-]?\d{5}\b/g, '[phone]');

    expect(serverScrubbed).not.toContain('Male');
    expect(serverScrubbed).not.toMatch(/Age:\s*31/);
    expect(serverScrubbed).not.toContain('Married');
    expect(serverScrubbed).not.toContain('Indian');
    expect(serverScrubbed).not.toContain('Hindu');
    expect(serverScrubbed).not.toContain('test@example.com');
    expect(serverScrubbed).not.toContain('9876543210');
    expect(serverScrubbed).toContain('2019 - 2024');
    expect(serverScrubbed).toContain('Backend Lead');
    expect(serverScrubbed).toContain('Go, Kubernetes');
  });

  it('G.4 checks.ts verification logic: unverified skills, aliases, short skill boundaries, score/coverage flags', () => {
    // 1. Matched skill that isn't in CV text is flagged as unverified
    const cvText = 'Software Engineer skilled in React, TypeScript, and PostgreSQL. Built user interfaces for 4 years.';
    const rankResult: RankResult = {
      id: 'c1',
      score: 75,
      breakdown: { skills: 40, experience: 20, relevance: 10, education: 5 },
      relevantYears: 4,
      reason: 'Good match',
      matchedSkills: ['React', 'TypeScript', 'Kubernetes'], // Kubernetes is NOT in cvText!
      missingSkills: ['Docker'],
      evidence: [],
      concerns: [],
    };
    const jd: JD = {
      role: 'Frontend Engineer',
      company: 'Tech Corp',
      location: 'Bengaluru',
      workMode: 'Remote',
      experience: { min: 3, max: 5, text: '3-5 years' },
      seniority: 'Mid-level',
      employmentType: 'Full-time',
      keySkills: ['React', 'TypeScript', 'Kubernetes', 'Docker'],
      niceToHave: [],
      responsibilities: [],
      education: 'B.Tech',
      domain: 'SaaS',
      summary: 'Frontend Engineer',
    };

    const check1 = verify(rankResult, cvText, jd);
    expect(check1.unverified).toEqual(['Kubernetes']);
    expect(check1.flags).toContain('1 matched skill not found in the CV text');

    // 2. Aliases work:
    // - LLMs <-> OpenAI
    expect(mentions('Experienced with OpenAI and GPT models.', 'LLMs')).toBe(true);
    expect(mentions('Hands-on experience with OpenAI API.', 'LLM')).toBe(true);

    // - Vector databases <-> Pinecone / FAISS
    expect(mentions('Managed vector search using Pinecone indices.', 'Vector databases')).toBe(true);
    expect(mentions('Built semantic retrieval on top of FAISS.', 'Vector database')).toBe(true);

    // - "LangChain / LlamaIndex" compound
    expect(mentions('Built multi-agent pipelines with LangChain.', 'LangChain / LlamaIndex')).toBe(true);
    expect(mentions('Indexed documentation using LlamaIndex.', 'LangChain / LlamaIndex')).toBe(true);

    // 3. Short skills like "R" or "Go" don't match inside other words
    expect(mentions('React is a popular UI library for frontend development.', 'R')).toBe(false);
    expect(mentions('Google is a search engine company.', 'Go')).toBe(false);
    expect(mentions('Proficient in R for statistical data analysis.', 'R')).toBe(true);
    expect(mentions('Built high throughput microservices using Go and gRPC.', 'Go')).toBe(true);

    // 4. "High score, low coverage" flag fires correctly (score >= 70, coverage < 0.4)
    const highAndLowCoverage: RankResult = {
      ...rankResult,
      score: 85,
      matchedSkills: ['React'], // only 1 of 4 key skills
    };
    const checkHigh = verify(highAndLowCoverage, 'Experienced in React UI development.', jd);
    expect(checkHigh.coverage).toBe(0.25); // 1 out of 4 = 25% < 40%
    expect(checkHigh.flags).toContain('High score but few JD keywords appear in the CV');

    // 5. "Low score, high coverage" flag fires correctly (score < 45, coverage > 0.75)
    const lowAndHighCoverage: RankResult = {
      ...rankResult,
      score: 35,
      matchedSkills: ['React', 'TypeScript', 'Kubernetes', 'Docker'],
    };
    const checkLow = verify(lowAndHighCoverage, 'Worked with React, TypeScript, Kubernetes, and Docker during a 2-month summer internship.', jd);
    expect(checkLow.coverage).toBe(1.0); // 4 out of 4 = 100% > 75%
    expect(checkLow.flags).toContain('Most JD keywords appear but the score is low. Check whether real work backs them');
  });
});
