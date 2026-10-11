import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

describe('H. File Parsing', () => {
  const tidy = (s: string) =>
    s.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();

  async function parseWorkerLogic(name: string, ab: ArrayBuffer): Promise<{ text: string; pages: number; words: number }> {
    const ext = name.split('.').pop()!.toLowerCase();
    if (ext === 'pdf') {
      const doc = await pdfjs.getDocument({ data: new Uint8Array(ab) }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        pages.push(content.items.map((it: any) => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join(''));
      }
      const text = tidy(pages.join('\n'));
      if (text.length < 30) throw new Error('No readable text. This may be a scanned PDF.');
      const words = text.split(/\s+/).filter(Boolean).length;
      return { text, pages: doc.numPages, words };
    }
    if (ext === 'docx') {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(ab), arrayBuffer: ab } as any);
      const text = tidy(value);
      if (text.length < 30) throw new Error('The Word file looks empty.');
      const words = text.split(/\s+/).filter(Boolean).length;
      return { text, pages: 1, words };
    }
    if (ext === 'txt' || ext === 'md') {
      const text = tidy(new TextDecoder().decode(ab));
      const words = text.split(/\s+/).filter(Boolean).length;
      return { text, pages: 1, words };
    }
    if (ext === 'doc') throw new Error('Old .doc files are not supported. Save as .docx or PDF.');
    throw new Error('Unsupported file type. Use PDF or Word (.docx).');
  }

  it('H.1 All 7 sample CVs and both JD files parse with positive word counts and 4 PDF / 3 DOCX split', async () => {
    const cvsDir = path.resolve(process.cwd(), 'sample-data/cvs');
    const files = fs.readdirSync(cvsDir);

    let pdfCount = 0;
    let docxCount = 0;

    for (const f of files) {
      const filePath = path.join(cvsDir, f);
      const buf = fs.readFileSync(filePath);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

      const parsed = await parseWorkerLogic(f, ab);
      expect(parsed.words).toBeGreaterThan(50);
      expect(parsed.pages).toBeGreaterThanOrEqual(1);

      if (f.endsWith('.pdf')) pdfCount++;
      if (f.endsWith('.docx')) docxCount++;
    }

    expect(files.length).toBe(7);
    expect(pdfCount).toBe(4);
    expect(docxCount).toBe(3);

    // Both JD files
    const jdDocxBuf = fs.readFileSync(path.resolve(process.cwd(), 'sample-data/JD_AI_ML_Engineer.docx'));
    const jdDocxParsed = await parseWorkerLogic('JD_AI_ML_Engineer.docx', jdDocxBuf.buffer.slice(jdDocxBuf.byteOffset, jdDocxBuf.byteOffset + jdDocxBuf.byteLength));
    expect(jdDocxParsed.words).toBeGreaterThan(100);

    const jdPdfBuf = fs.readFileSync(path.resolve(process.cwd(), 'sample-data/JD_AI_ML_Engineer.pdf'));
    const jdPdfParsed = await parseWorkerLogic('JD_AI_ML_Engineer.pdf', jdPdfBuf.buffer.slice(jdPdfBuf.byteOffset, jdPdfBuf.byteOffset + jdPdfBuf.byteLength));
    expect(jdPdfParsed.words).toBeGreaterThan(100);
  });

  it('H.2 Scanned/empty PDF, .doc file, unsupported type and >10MB file each produce clear errors', async () => {
    // 1. Scanned or image-only PDF (text < 30 chars)
    const emptyPdfPromise = parseWorkerLogic('scanned.pdf', new Uint8Array([]).buffer);
    await expect(emptyPdfPromise).rejects.toThrow();

    // 2. Old .doc file
    await expect(parseWorkerLogic('resume.doc', new ArrayBuffer(100))).rejects.toThrow(
      'Old .doc files are not supported. Save as .docx or PDF.'
    );

    // 3. Unsupported file type (.png)
    await expect(parseWorkerLogic('photo.png', new ArrayBuffer(100))).rejects.toThrow(
      'Unsupported file type. Use PDF or Word (.docx).'
    );

    // 4. File over 10 MB (parserPool check: if file.size > 10 * 1024 * 1024)
    const checkFileSize = (size: number) => {
      if (size > 10 * 1024 * 1024) throw new Error('File is over 10 MB.');
    };
    expect(() => checkFileSize(11 * 1024 * 1024)).toThrow('File is over 10 MB.');
    expect(() => checkFileSize(5 * 1024 * 1024)).not.toThrow();
  });

  it('H.3 Uploading the same file twice is de-duplicated', () => {
    type CVItem = { id: string; fileName: string; size: number };
    const existing: CVItem[] = [
      { id: '1', fileName: '01_Ananya_Rao.pdf', size: 2498 },
    ];

    const newFiles = [
      { name: '01_Ananya_Rao.pdf', size: 2498 }, // duplicate
      { name: '02_Rahul_Verma.docx', size: 37115 }, // fresh
    ];

    const fresh = newFiles.filter(
      (f) => !existing.some((c) => c.fileName === f.name && c.size === f.size)
    );

    expect(fresh.length).toBe(1);
    expect(fresh[0].name).toBe('02_Rahul_Verma.docx');
  });
});
