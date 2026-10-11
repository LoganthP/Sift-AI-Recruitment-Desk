// Removes details the ranking must not use before any CV text leaves the browser.
const PERSONAL_FIELDS: [string, RegExp][] = [
  ['Gender', /gender|sex/],
  ['Age', /age/],
  ['Date of birth', /date of birth|d\.?\s?o\.?\s?b\.?/],
  ['Marital status', /marital status/],
  ['Religion', /religion|caste/],
  ['Nationality', /nationality/],
  ['Family details', /father'?s name|mother'?s name|spouse(?:'s)? name/],
  ['Photo', /photo(?:graph)?/],
  ['Physical details', /blood group|height|weight/],
];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function guessName(text: string): string | null {
  const first = text.split('\n').map((l) => l.trim()).find(Boolean) || '';
  const clean = first.replace(/[|,•].*$/, '').trim();
  if (/resume|curriculum|\bcv\b/i.test(clean)) return null;
  const words = clean.split(/\s+/);
  return words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Z][a-zA-Z.'-]*$/.test(w)) ? clean : null;
}

export function redact(text: string) {
  const removed = new Set<string>();
  let out = text;
  for (const [label, re] of PERSONAL_FIELDS) {
    out = out.replace(new RegExp(`^[ \\t]*(?:${re.source})\\b[ \\t]*[:\\-–][^\\n]*$`, 'gim'), () => {
      removed.add(label);
      return `[${label} removed]`;
    });
  }
  const name = guessName(text);
  if (name) {
    out = out.replace(new RegExp(esc(name), 'gi'), 'Candidate');
    for (const part of name.split(/\s+/).filter((p) => p.length > 2)) out = out.replace(new RegExp(`\\b${esc(part)}\\b`, 'g'), 'Candidate');
    removed.add('Name');
  }
  const before = out;
  out = out
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/(?:\+\d{1,3}[\s-]?)?\b\d{5}[\s-]?\d{5}\b/g, '[phone]')
    .replace(/https?:\/\/\S+|(?:www\.)?linkedin\.com\/\S+/gi, '[link]');
  if (before !== out) removed.add('Contact details');
  return { text: out, removed: [...removed], name };
}
