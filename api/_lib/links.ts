import type { Insight } from '../../shared/schemas';

/**
 * Links in AI market data are checked live before they reach the UI.
 * A dead or unverifiable link is replaced with a search link that always works.
 */
const SOFT_404 = /page not found|404 not found|<title>[^<]*\b404\b|this page (?:does not|doesn't) exist|job (?:is )?no longer available|position has been filled/i;

export async function checkLink(url: string): Promise<'ok' | 'broken' | 'unknown'> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(2500),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SiftLinkCheck/1.0)', Accept: 'text/html,*/*' },
    });
    if (res.status === 404 || res.status === 410) return 'broken';
    if (res.status >= 400) return 'unknown'; // many sites block automated checks (403/429)
    const html = (await res.text()).slice(0, 30_000);
    return SOFT_404.test(html) ? 'broken' : 'ok';
  } catch {
    return 'unknown';
  }
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
const SITE_FOR: Record<string, string> = { 'Salary data': 'ambitionbox.com OR site:glassdoor.co.in', 'Job post': '', Estimate: '' };

export function searchLink(i: Pick<Insight, 'company' | 'roleTitle' | 'location' | 'basis' | 'sourceUrl'>) {
  const domain = i.sourceUrl ? host(i.sourceUrl) : '';
  const base = i.basis === 'Salary data' ? `"${i.company}" ${i.roleTitle} salary ${i.location}` : `"${i.company}" ${i.roleTitle} jobs ${i.location}`;
  const site = domain ? ` site:${domain}` : SITE_FOR[i.basis] ? ` site:${SITE_FOR[i.basis]}` : '';
  return `https://www.google.com/search?q=${encodeURIComponent(base + site)}`;
}

export function openingsLink(i: Pick<Insight, 'company' | 'roleTitle' | 'location'>) {
  return `https://www.google.com/search?q=${encodeURIComponent(`"${i.company}" careers ${i.roleTitle} ${i.location}`)}&ibp=htl;jobs`;
}
