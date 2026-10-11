import * as Comlink from 'comlink';
import type { ParserAPI } from '@/workers/parser.worker';
import ParserWorker from '@/workers/parser.worker?worker';

/** A small pool of Web Workers; files are parsed in parallel without blocking the UI. */
export const POOL_SIZE = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));

type Lane = { api: Comlink.Remote<ParserAPI>; busy: boolean };
let lanes: Lane[] | null = null;
const waiting: ((i: number) => void)[] = [];

function getLanes() {
  lanes ??= Array.from({ length: POOL_SIZE }, () => ({ api: Comlink.wrap<ParserAPI>(new ParserWorker()), busy: false }));
  return lanes;
}

async function acquire(): Promise<number> {
  const free = getLanes().findIndex((l) => !l.busy);
  if (free >= 0) {
    lanes![free].busy = true;
    return free;
  }
  return new Promise((resolve) => waiting.push(resolve));
}
function release(i: number) {
  const next = waiting.shift();
  if (next) next(i);
  else lanes![i].busy = false;
}

export async function parseFile(file: File, opts: { redact: boolean; onStart?: (lane: number) => void }) {
  if (file.size > 10 * 1024 * 1024) throw new Error('File is over 10 MB.');
  const lane = await acquire();
  opts.onStart?.(lane);
  try {
    const buf = await file.arrayBuffer();
    const out = await getLanes()[lane].api.parse(file.name, Comlink.transfer(buf, [buf]), { redact: opts.redact });
    return { ...out, lane };
  } finally {
    release(lane);
  }
}
