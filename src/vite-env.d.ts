/// <reference types="vite/client" />
declare module 'mammoth/mammoth.browser.js' {
  const mammoth: { extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }> };
  export default mammoth;
}
declare module 'pdfjs-dist/build/pdf.worker.min.mjs' {
  const mod: unknown;
  export = mod;
}
