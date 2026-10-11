import { kv } from './kv';

export const TTL_WEEK = 7 * 24 * 60 * 60; // 7 days in seconds
export const TTL_DAY = 24 * 60 * 60;      // 24 hours in seconds

/**
 * Normalizes prompt text before hashing:
 * Trims leading/trailing whitespace, normalizes CRLF to LF, and collapses repeated horizontal whitespace.
 */
export function normalizePrompt(prompt: string): string {
  return prompt.trim().replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');
}

/**
 * Calculates SHA-256 hash using the Web Crypto API.
 */
export async function sha256(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constructs the cache key: "ai:cache:" + SHA-256(route + normalized prompt).
 */
export async function getCacheKey(route: string, prompt: string): Promise<string> {
  const normRoute = route.startsWith('/') ? route.slice(1) : route;
  const hash = await sha256(`${normRoute}${normalizePrompt(prompt)}`);
  return `ai:cache:${hash}`;
}

/**
 * Constructs the per-candidate cache key for /rank:
 * hash of JD brief + that CV's text under the 'rank' route.
 */
export async function getCandidateCacheKey(jdBrief: string, cvText: string): Promise<string> {
  return getCacheKey('rank', `${jdBrief}\n${cvText}`);
}

/**
 * Retrieves cached validated JSON for a route from KV.
 * Returns null on cache miss or expiration.
 */
export async function getRouteCache<T>(route: string, prompt: string): Promise<T | null> {
  const key = await getCacheKey(route, prompt);
  return getFromKV<T>(key);
}

/**
 * Stores validated JSON for a route in KV with an expiration timestamp.
 */
export async function setRouteCache<T>(route: string, prompt: string, data: T, ttlSeconds: number): Promise<void> {
  const key = await getCacheKey(route, prompt);
  return setInKV<T>(key, data, ttlSeconds);
}

/**
 * Retrieves cached ranking result for an individual candidate from KV.
 */
export async function getCandidateCache<T>(jdBrief: string, cvText: string): Promise<T | null> {
  const key = await getCandidateCacheKey(jdBrief, cvText);
  return getFromKV<T>(key);
}

/**
 * Stores cached ranking result for an individual candidate in KV with 7-day TTL.
 */
export async function setCandidateCache<T>(jdBrief: string, cvText: string, data: T): Promise<void> {
  const key = await getCandidateCacheKey(jdBrief, cvText);
  return setInKV<T>(key, data, TTL_WEEK);
}

async function getFromKV<T>(key: string): Promise<T | null> {
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.expiresAt === 'number' && Date.now() > parsed.expiresAt) {
        await kv.del(key).catch(() => {});
        return null;
      }
      return (parsed.data !== undefined ? parsed.data : parsed) as T;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

async function setInKV<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const payload = JSON.stringify({ data, expiresAt });
  await kv.set(key, payload);
}
