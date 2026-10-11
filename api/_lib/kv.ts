/**
 * Minimal Redis client over the Upstash REST API (works on Edge, no SDK needed).
 * Reads KV_REST_API_URL/TOKEN (Vercel Marketplace) or UPSTASH_REDIS_REST_URL/TOKEN.
 * Without them it falls back to an in-memory store, which is fine for local dev only.
 */
type Mem = { str: Map<string, string>; hash: Map<string, Map<string, string>> };
const g = globalThis as unknown as { __siftMem?: Mem };
const mem: Mem = (g.__siftMem ??= { str: new Map(), hash: new Map() });

const url = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const storageMode = () => (url() && token() ? 'redis' : 'memory') as 'redis' | 'memory';

async function cmd<T = unknown>(...args: (string | number)[]): Promise<T> {
  const res = await fetch(url()!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const j = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
  if (!res.ok || j.error) throw Object.assign(new Error('Storage is unavailable. Try again.'), { status: 503, detail: j.error });
  return j.result as T;
}

export const kv = {
  async get(key: string): Promise<string | null> {
    return storageMode() === 'redis' ? cmd<string | null>('GET', key) : (mem.str.get(key) ?? null);
  },
  async set(key: string, value: string, opts?: { nx?: boolean }): Promise<boolean> {
    if (storageMode() === 'redis') return (await cmd<string | null>('SET', key, value, ...(opts?.nx ? ['NX'] : []))) === 'OK';
    if (opts?.nx && mem.str.has(key)) return false;
    mem.str.set(key, value);
    return true;
  },
  async del(key: string) {
    if (storageMode() === 'redis') await cmd('DEL', key);
    else {
      mem.str.delete(key);
      mem.hash.delete(key);
    }
  },
  async hset(key: string, field: string, value: string) {
    if (storageMode() === 'redis') await cmd('HSET', key, field, value);
    else (mem.hash.get(key) ?? mem.hash.set(key, new Map()).get(key)!).set(field, value);
  },
  async hget(key: string, field: string): Promise<string | null> {
    return storageMode() === 'redis' ? cmd<string | null>('HGET', key, field) : (mem.hash.get(key)?.get(field) ?? null);
  },
  async hdel(key: string, field: string) {
    if (storageMode() === 'redis') await cmd('HDEL', key, field);
    else mem.hash.get(key)?.delete(field);
  },
  async hvals(key: string): Promise<string[]> {
    return storageMode() === 'redis' ? (await cmd<string[]>('HVALS', key)) || [] : [...(mem.hash.get(key)?.values() ?? [])];
  },
};
