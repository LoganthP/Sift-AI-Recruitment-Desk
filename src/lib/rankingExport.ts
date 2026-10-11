import { useMemo } from 'react';
import type { JD } from '@shared/schemas';
import { useSession, type RankedCandidate } from '@/store/session';
import { verify, type Check as CheckT } from '@/lib/checks';
import { download, rankingCsv } from '@/lib/download';
import { slug } from '@/lib/utils';

export type Row = RankedCandidate & {
  displayName: string;
  finalScore: number;
  check: CheckT;
  cvText: string;
  jdSkills: number;
};

export function useRows(jd: JD | null) {
  const { ranking, cvs } = useSession();
  return useMemo<Row[]>(() => {
    if (!ranking) return [];
    return ranking.results
      .map((r) => {
        const cv = cvs.find((c) => c.id === r.id);
        return {
          ...r,
          displayName: r.nameGuess || cv?.nameGuess || r.fileName || 'Candidate',
          finalScore: r.override?.score ?? r.score,
          check: verify(r, cv?.text || '', jd),
          cvText: cv?.text || '',
          jdSkills: jd?.keySkills.length || 0,
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore);
  }, [ranking, cvs, jd]);
}

export function useRankingExport() {
  const { jd } = useSession();
  const rows = useRows(jd);
  return rows.length
    ? {
        rows,
        exportCsv: () =>
          download(
            `ranking-${slug(jd?.role || 'role')}.csv`,
            rankingCsv(rows.map((r) => ({ ...r, needsReview: r.check.needsReview }))),
            'text/csv'
          ),
      }
    : { rows, exportCsv: undefined };
}
