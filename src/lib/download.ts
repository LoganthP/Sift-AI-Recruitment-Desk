import type { JD, Market, Question, SearchStrings } from '@shared/schemas';

export function download(filename: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ReportRow = {
  displayName: string; fileName?: string; finalScore: number; score: number; reason: string;
  matchedSkills: string[]; missingSkills: string[]; override?: { note: string }; decision?: string; needsReview: boolean;
};
const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function rankingCsv(rows: ReportRow[]) {
  const head = ['Rank', 'Candidate', 'File', 'Final score', 'AI score', 'Decision', 'Recruiter note', 'Reason', 'Matched skills', 'Missing skills', 'Needs review'];
  return [
    head.map(cell).join(','),
    ...rows.map((r, i) =>
      [i + 1, r.displayName, r.fileName, r.finalScore, r.score, r.decision || '', r.override?.note || '', r.reason, r.matchedSkills.join('; '), r.missingSkills.join('; '), r.needsReview ? 'Yes' : 'No']
        .map(cell)
        .join(',')
    ),
  ].join('\n');
}

export function reportMarkdown(p: { jd: JD | null; rows: ReportRow[]; questions?: Question[]; market?: Market | null; strings?: SearchStrings | null }) {
  const o: string[] = [`# Hiring pack: ${p.jd?.role || 'Role'}`, `_Generated ${new Date().toLocaleString()} with Sift_`, ''];
  if (p.jd) o.push('## Job understanding', `- **Role:** ${p.jd.role}`, `- **Location:** ${p.jd.location} (${p.jd.workMode})`, `- **Experience:** ${p.jd.experience.text}`, `- **Must-have skills:** ${p.jd.keySkills.join(', ')}`, '');
  if (p.rows.length) {
    o.push('## Stack ranking', '| # | Candidate | Score | Decision | Reason |', '|---|---|---|---|---|');
    p.rows.forEach((r, i) => o.push(`| ${i + 1} | ${r.displayName} | ${r.finalScore}${r.override ? ` (AI ${r.score})` : ''} | ${r.decision || '—'} | ${r.reason.replace(/\|/g, '/')} |`));
    o.push('');
  }
  if (p.questions?.length) {
    o.push('## Screening questions');
    p.questions.forEach((q, i) => o.push(`${i + 1}. **[${q.category}]** ${q.question}`, `   - _Good answer:_ ${q.goodAnswer}`));
    o.push('');
  }
  if (p.market) {
    o.push('## Hiring market', p.market.marketSummary, '', '| Company | Experience | Compensation | Location | Source |', '|---|---|---|---|---|');
    p.market.insights.forEach((m) => o.push(`| ${m.company} | ${m.experienceRange} | ${m.compensationRange}${m.compensationIsEstimate ? ' (est.)' : ''} | ${m.location} | ${m.sourceUrl ? `[${m.sourceName}](${m.sourceUrl})` : m.sourceName} |`));
    o.push('');
  }
  if (p.strings) {
    o.push('## Search strings');
    for (const [k, label] of [['linkedin', 'LinkedIn'], ['naukri', 'Naukri']] as const)
      o.push(`### ${label}`, '**Boolean**', '```', p.strings[k].boolean, '```', '**Plain**', '```', p.strings[k].plain, '```');
  }
  return o.join('\n');
}
