/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { redact } from '../lib/fairness';

// We're already off the main thread, so pdf.js runs its own worker code in-thread here.
let pdfjsReady: Promise<typeof import('pdfjs-dist')> | null = null;
function loadPdfjs() {
  pdfjsReady ??= (async () => {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs');
    (globalThis as any).pdfjsWorker = worker;
    return import('pdfjs-dist');
  })();
  return pdfjsReady;
}

const tidy = (s: string) =>
  s.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();

async function extract(name: string, buf: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const ext = name.split('.').pop()!.toLowerCase();
  if (ext === 'pdf') {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      pages.push(content.items.map((it: any) => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join(''));
    }
    const text = tidy(pages.join('\n'));
    if (text.length < 30) throw new Error('No readable text. This may be a scanned PDF.');
    return { text, pages: doc.numPages };
  }
  if (ext === 'docx') {
    const mammoth = (await import('mammoth/mammoth.browser.js')).default;
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
    const text = tidy(value);
    if (text.length < 30) throw new Error('The Word file looks empty.');
    return { text, pages: 1 };
  }
  if (ext === 'txt' || ext === 'md') return { text: tidy(new TextDecoder().decode(buf)), pages: 1 };
  if (ext === 'doc') throw new Error('Old .doc files are not supported. Save as .docx or PDF.');
  throw new Error('Unsupported file type. Use PDF or Word (.docx).');
}

const api = {
  async parse(name: string, buf: ArrayBuffer, opts: { redact: boolean }) {
    const t0 = performance.now();
    const { text: raw, pages } = await extract(name, buf);
    const words = raw.split(/\s+/).filter(Boolean).length;
    const r = opts.redact ? redact(raw) : { text: raw, removed: [] as string[], name: null };
    return { raw: opts.redact ? undefined : raw, text: r.text, removed: r.removed, name: r.name, words, pages, ms: Math.round(performance.now() - t0) };
  },
};
export type ParserAPI = typeof api;
Comlink.expose(api);
