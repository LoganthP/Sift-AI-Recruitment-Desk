import type { JD } from '../../shared/schemas';
import { jdBrief } from './ai';

export const parseJDPrompt = (text: string) => `Read this job description and extract what it asks for.

Return JSON with exactly these keys:
{
  "isJobDescription": boolean,
  "role": string,
  "company": string | null,
  "location": string,
  "workMode": "On-site" | "Hybrid" | "Remote" | "Not specified",
  "experience": { "min": number | null, "max": number | null, "text": string },
  "seniority": string,
  "employmentType": string,
  "keySkills": string[],
  "niceToHave": string[],
  "responsibilities": string[],
  "education": string,
  "domain": string,
  "summary": string
}

Rules:
- keySkills: 6 to 12 must-have skills as short canonical names (e.g. "Python", "RAG", "AWS", "Docker").
- niceToHave: skills the JD marks as preferred, plus or bonus.
- responsibilities: 3 to 6 short phrases.
- experience.text: a readable range such as "3–6 years".
- summary: one sentence describing the role.
- Use only what the JD states. If something is absent use null or "Not specified".
- isJobDescription is false if the text is clearly not a job description.

JOB DESCRIPTION:
"""
${text.slice(0, 15000)}
"""`;

const RUBRIC = `Score each candidate using ONLY evidence written in their CV:
- skills (0-50): must-have skills shown in real work or projects. A skill that appears only in a skills list, with no supporting experience or project, earns at most half credit for that skill.
- experience (0-25): years of RELEVANT experience compared with the required range. Unrelated work does not count.
- relevance (0-15): similarity of past projects, domain, scale and outcomes to the responsibilities.
- education (0-10): degree or certifications relevant to the JD.

Calibration for the total: 85+ meets nearly every must-have with clear evidence; 60-84 strong with some gaps; 40-59 partial fit; below 40 poor fit. Use the full range.

Fairness rules (mandatory):
- Ignore and never infer name, gender, age, date of birth, photo, marital status, religion, caste, nationality or family details.
- Do not reward or penalise employment gaps, college prestige or writing style.
- Every matched skill must be backed by something the CV actually says.`;

export const rankPrompt = (jd: JD, batch: { id: string; text: string }[]) => `${RUBRIC}

JOB REQUIREMENTS
${jdBrief(jd)}

CVs (personal details already removed)
${batch.map((c) => `### CANDIDATE id="${c.id}"\n${c.text}`).join('\n\n')}

Return JSON:
{
  "results": [
    {
      "id": string,
      "breakdown": { "skills": number, "experience": number, "relevance": number, "education": number },
      "relevantYears": number | null,
      "reason": string,
      "matchedSkills": string[],
      "missingSkills": string[],
      "evidence": string[],
      "concerns": string[]
    }
  ]
}
- One entry per candidate id above, ids copied exactly.
- reason: at most 35 words, specific to this CV.
- matchedSkills / missingSkills: use the JD's must-have skill names exactly.
- evidence: 2 to 4 short phrases copied word for word from the CV that justify the score.
- concerns: things a recruiter should verify (e.g. "skills listed without project evidence"). Empty array if none.`;

export const questionsPrompt = (jd: JD) => `Write 10 screening questions a recruiter can ask on a 20-minute phone call for this role.

JOB REQUIREMENTS
${jdBrief(jd)}

Mix: exactly 4 "Technical", 3 "Experience", 3 "Fit" questions, in that order.
- Technical: probe the must-have skills in plain language a non-engineer recruiter can ask.
- Experience: probe real past work, scale, ownership and outcomes.
- Fit: motivation, work style, notice period, location or work-mode fit. Never ask about age, family, religion, health or marital status.

Return JSON:
{
  "questions": [
    { "category": "Technical" | "Experience" | "Fit", "question": string, "skill": string, "goodAnswer": string, "lookFor": string[], "redFlags": string[] }
  ]
}
- goodAnswer: 1-2 sentences describing what a strong answer sounds like.
- lookFor: 2-3 short signals. redFlags: 1-2 short warning signs.`;

export const marketPrompt = (jd: JD) => `Today is ${new Date().toISOString().slice(0, 10)}. Use web search to find 6 to 8 OTHER companies that are hiring (or recently hired) for a role similar to this one, in or near the same location in India.

JOB REQUIREMENTS
${jdBrief(jd)}

Sources: public job postings, company careers pages, and public salary pages (AmbitionBox, Glassdoor, Indeed, levels.fyi, news). Do NOT log in to or scrape LinkedIn or Naukri.
Match the role's title, seniority and core skills as closely as possible, and pick different companies. Report figures as the source states them; do not repeat one range for every company unless the sources really agree.

Return ONLY JSON (no prose, no code fences):
{
  "insights": [
    {
      "company": string,
      "roleTitle": string,
      "experienceRange": string,
      "compensationRange": string,
      "location": string,
      "sourceName": string,
      "sourceUrl": string | null,
      "basis": "Job post" | "Salary data" | "Estimate",
      "compensationIsEstimate": boolean
    }
  ],
  "marketSummary": string,
  "caveats": string[]
}
Rules:
- compensationRange in INR lakhs per annum, e.g. "₹18–28 LPA".
- If the posting does not state pay, estimate it from salary data and set compensationIsEstimate to true.
- Use basis "Estimate" and sourceName "AI estimate" when you could not find a specific source for that row.
- sourceUrl must be the exact URL of a page you opened in search results. Never construct, guess or shorten a URL. If unsure, use null.
- marketSummary: 2-3 sentences on demand and pay for this role.`;

export const searchStringsPrompt = (jd: JD) => `Write candidate sourcing search strings for this role.

JOB REQUIREMENTS
${jdBrief(jd)}

Return JSON:
{
  "linkedin": { "boolean": string, "plain": string, "filters": string[] },
  "naukri":   { "boolean": string, "plain": string, "filters": string[] },
  "notes": string[]
}
Rules:
- boolean: real Boolean syntax with AND, OR, NOT (uppercase), "quoted phrases" and (parentheses). Include title variants and skill synonyms. Keep LinkedIn under 900 characters.
- plain: the same intent as a simple keyword line with no operators.
- filters: settings to apply in the platform's filter panel, each as "Filter: value".
- notes: 2-3 short tips for widening or narrowing the search.`;
