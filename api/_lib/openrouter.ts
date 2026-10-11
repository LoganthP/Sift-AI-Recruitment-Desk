import type { Source } from '../../shared/schemas';
import { kv } from './kv';

export type OpenRouterCallArgs = {
  system: string;
  prompt: string;
  json: boolean;
  webSearch: boolean;
  maxTokens: number;
  temperature: number;
  tier?: 'fast' | 'heavy';
};

export type OpenRouterCallOut = {
  text: string;
  sources: Source[];
  queries: string[];
  servedModel: string;
};

export type DiscoveredModel = {
  id: string;
  context_length: number;
  isTextOnly: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- State tracking for OpenRouter exhaustion ---------- */
let openRouterExhaustedUntil = 0;
let lastKnownModels: DiscoveredModel[] = [];
let cachedModelsList: { models: DiscoveredModel[]; timestamp: number } | null = null;

export function getOpenRouterExhaustedUntil(): number {
  return openRouterExhaustedUntil;
}

export async function isOpenRouterExhausted(): Promise<boolean> {
  const now = Date.now();
  if (openRouterExhaustedUntil > now) {
    return true;
  }
  if (openRouterExhaustedUntil > 0 && openRouterExhaustedUntil <= now) {
    openRouterExhaustedUntil = 0;
  }

  try {
    const raw = await kv.get('ai:exhausted:openrouter');
    if (raw) {
      let until = 0;
      try {
        const parsed = JSON.parse(raw);
        until = typeof parsed === 'number' ? parsed : (parsed.until || parsed.expiresAt || 0);
      } catch {
        until = Number(raw) || 0;
      }
      if (until > now) {
        openRouterExhaustedUntil = until;
        return true;
      } else {
        await kv.del('ai:exhausted:openrouter').catch(() => {});
      }
    }
  } catch {}

  return false;
}

export async function markOpenRouterExhausted(until: number): Promise<void> {
  openRouterExhaustedUntil = until;
  try {
    await kv.set('ai:exhausted:openrouter', JSON.stringify({ until, expiresAt: until }));
  } catch (e) {
    console.warn('[sift] Failed to persist OpenRouter exhausted state to KV', e);
  }
}

/* ---------- Per-minute token bucket rate limiter ---------- */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor() {
    const rpm = Number(process.env.OPENROUTER_RPM) || 18;
    this.tokens = rpm;
    this.lastRefill = Date.now();
  }

  private refill() {
    const rpm = Number(process.env.OPENROUTER_RPM) || 18;
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * (rpm / 60000);
    this.tokens = Math.min(rpm, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  async acquire(): Promise<boolean> {
    const rpm = Number(process.env.OPENROUTER_RPM) || 18;
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    // Calculate wait time for 1 token
    const ratePerMs = rpm / 60000;
    const needed = 1 - this.tokens;
    const waitMs = Math.ceil(needed / ratePerMs);
    if (waitMs <= 4000) {
      await sleep(waitMs);
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return true;
      }
    }
    return false;
  }

  reset() {
    const rpm = Number(process.env.OPENROUTER_RPM) || 18;
    this.tokens = rpm;
    this.lastRefill = Date.now();
  }
}

const tokenBucket = new TokenBucket();

/* ---------- In-flight concurrency limiter for heavy / rank batches ---------- */
let activeHeavyCalls = 0;
const heavyQueue: (() => void)[] = [];

async function acquireHeavySlot(): Promise<() => void> {
  if (activeHeavyCalls >= 2) {
    await new Promise<void>((resolve) => heavyQueue.push(resolve));
  }
  activeHeavyCalls++;
  return () => {
    activeHeavyCalls--;
    const next = heavyQueue.shift();
    if (next) next();
  };
}

/* ---------- Model auto-discovery & caching ---------- */
function isTextOnlyInstructModel(m: any): boolean {
  const id = String(m.id || '').toLowerCase();
  const modality = String(m.architecture?.modality || '').toLowerCase();
  const isMultimodal = id.includes('vision') || id.includes('vl') || id.includes('image') || modality.includes('image');
  return !isMultimodal;
}

export async function discoverOpenRouterModels(): Promise<DiscoveredModel[]> {
  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.now();

  // 1. Check in-memory cache
  if (cachedModelsList && now - cachedModelsList.timestamp < ONE_HOUR && cachedModelsList.models.length > 0) {
    return cachedModelsList.models;
  }

  // 2. Check KV cache
  try {
    const raw = await kv.get('ai:or:models');
    if (raw) {
      const parsed = JSON.parse(raw);
      const list = parsed.models || parsed.list || (Array.isArray(parsed) ? parsed : []);
      const ts = parsed.timestamp || parsed.cachedAt || 0;
      if (Array.isArray(list) && list.length > 0) {
        lastKnownModels = list;
        if (now - ts < ONE_HOUR) {
          cachedModelsList = { models: list, timestamp: ts };
          return list;
        }
      }
    }
  } catch {}

  // 3. Auto-discover from OpenRouter models API
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ''}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`OpenRouter models API returned ${res.status}`);
    }

    const json: any = await res.json();
    const data: any[] = Array.isArray(json?.data) ? json.data : [];

    // Filter: ends with ":free", context_length >= 32000, prefer text-only instruct/chat
    const freeModels: DiscoveredModel[] = data
      .filter((m) => {
        const id = String(m?.id || '');
        const ctx = Number(m?.context_length || 0);
        return id.endsWith(':free') && ctx >= 32000;
      })
      .map((m) => ({
        id: String(m.id),
        context_length: Number(m.context_length || 0),
        isTextOnly: isTextOnlyInstructModel(m),
      }))
      .sort((a, b) => {
        // Prefer text-only models first
        if (a.isTextOnly && !b.isTextOnly) return -1;
        if (!a.isTextOnly && b.isTextOnly) return 1;
        // Then sort by context length descending
        return b.context_length - a.context_length;
      });

    if (freeModels.length > 0) {
      cachedModelsList = { models: freeModels, timestamp: now };
      lastKnownModels = freeModels;
      try {
        await kv.set('ai:or:models', JSON.stringify({ models: freeModels, timestamp: now }));
      } catch {}
      return freeModels;
    }
  } catch (err: any) {
    console.info(`[sift] OpenRouter model auto-discovery failed: ${err.message}`);
  }

  // 4. Fall back to last cached list
  if (lastKnownModels.length > 0) {
    return lastKnownModels;
  }
  if (cachedModelsList && cachedModelsList.models.length > 0) {
    return cachedModelsList.models;
  }

  // 5. If still nothing, mark OpenRouter unavailable for 10 minutes and move on without throwing
  console.info('[sift] No OpenRouter free models found. Marking unavailable for 10 minutes.');
  await markOpenRouterExhausted(Date.now() + 10 * 60 * 1000);
  return [];
}

export async function removeModelsFromCache(modelIds: string[]): Promise<void> {
  const removeSet = new Set(modelIds);
  if (cachedModelsList) {
    cachedModelsList.models = cachedModelsList.models.filter((m) => !removeSet.has(m.id));
  }
  lastKnownModels = lastKnownModels.filter((m) => !removeSet.has(m.id));
  try {
    await kv.set('ai:or:models', JSON.stringify({ models: lastKnownModels, timestamp: Date.now() }));
  } catch {}
}

export async function getOpenRouterModels(tier: 'fast' | 'heavy' = 'fast'): Promise<string[]> {
  const envVal = tier === 'heavy' ? process.env.OPENROUTER_MODELS_HEAVY : process.env.OPENROUTER_MODELS_FAST;
  if (envVal) {
    const list = envVal.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length > 0) return list.slice(0, 3);
  }

  const discovered = await discoverOpenRouterModels();
  if (discovered.length === 0) return [];

  if (tier === 'heavy') {
    // Heavy picks the 3 largest-context models
    const sorted = [...discovered].sort((a, b) => b.context_length - a.context_length);
    return sorted.slice(0, 3).map((m) => m.id);
  }

  // Fast picks the first 3
  return discovered.slice(0, 3).map((m) => m.id);
}

/* ---------- Calling OpenRouter ---------- */
export async function callOpenRouter(a: OpenRouterCallArgs): Promise<OpenRouterCallOut | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return null;
  }

  if (await isOpenRouterExhausted()) {
    return null;
  }

  const models = await getOpenRouterModels(a.tier || 'fast');
  if (models.length === 0) {
    return null;
  }

  // Token bucket check (wait up to 4s, otherwise skip to next provider)
  const tokenAcquired = await tokenBucket.acquire();
  if (!tokenAcquired) {
    console.info('[sift] OpenRouter rate limit token bucket empty. Skipping to next provider.');
    return null;
  }

  // If tier is heavy (e.g. rank batches), limit concurrency to 2
  let releaseSlot: (() => void) | null = null;
  if (a.tier === 'heavy') {
    releaseSlot = await acquireHeavySlot();
  }

  try {
    const body: any = {
      models: models.slice(0, 3),
      messages: [
        { role: 'system', content: a.system },
        { role: 'user', content: a.prompt },
      ],
      temperature: a.temperature,
      max_tokens: a.maxTokens,
    };

    const isWebSearch = a.webSearch && process.env.OPENROUTER_WEB === '1';

    if (isWebSearch) {
      body.plugins = [{ id: 'web', max_results: 5 }];
    } else if (a.json) {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:5173',
        'X-Title': 'Sift',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = '';
      try {
        const j: any = await res.json();
        detail = j?.error?.message || JSON.stringify(j);
      } catch {
        detail = await res.text().catch(() => '');
      }

      // 402: Payment Required (no credits) -> mark exhausted for 1 hour
      if (res.status === 402) {
        console.warn('[sift] OpenRouter credit limit reached (402). Marked exhausted for 1 hour.');
        await markOpenRouterExhausted(Date.now() + 60 * 60 * 1000);
        return null;
      }

      // 429: Rate limit
      if (res.status === 429) {
        let until = 0;
        const resetHeader = res.headers.get('x-ratelimit-reset');
        if (resetHeader) {
          const num = Number(resetHeader);
          if (!isNaN(num) && num > 0) {
            until = num > 1e11 ? num : num * 1000;
          }
        }

        const lower = detail.toLowerCase();
        const isDaily =
          lower.includes('daily') ||
          lower.includes('free-models-per-day') ||
          lower.includes('per day') ||
          lower.includes('free model') ||
          lower.includes('limit reached for today');

        if (isDaily) {
          const now = new Date();
          until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)).getTime();
          console.info(`[sift] OpenRouter daily rate limit reached. Exhausted until UTC midnight (${new Date(until).toISOString()}).`);
        } else if (!until) {
          until = Date.now() + 60 * 1000;
          console.info(`[sift] OpenRouter rate limit reached (429). Exhausted until ${new Date(until).toISOString()}.`);
        } else {
          console.info(`[sift] OpenRouter rate limit reset header received. Exhausted until ${new Date(until).toISOString()}.`);
        }

        await markOpenRouterExhausted(until);
        return null;
      }

      // 404 or No endpoints found -> remove model from cache and skip
      if (res.status === 404 || detail.includes('No endpoints found') || detail.toLowerCase().includes('model_not_found')) {
        console.warn(`[sift] OpenRouter model not found (${detail}). Removing from cached models.`);
        await removeModelsFromCache(models);
        return null;
      }

      // 5xx / timeouts / other upstream error
      console.info(`[sift] OpenRouter API error (${res.status}): ${detail}`);
      return null;
    }

    const data: any = await res.json();
    const servedModel = String(data?.model || models[0] || 'openrouter');
    console.info(`[sift] OpenRouter served request with model ${servedModel}`);

    const choice = data.choices?.[0];
    const text = choice?.message?.content || '';

    const sources: Source[] = [];
    const annotations: any[] = choice?.message?.annotations || [];
    for (const ann of annotations) {
      if (ann?.url_citation?.url) {
        sources.push({
          url: ann.url_citation.url,
          title: ann.url_citation.title || ann.url_citation.url || 'Source',
        });
      }
    }

    return {
      text,
      sources,
      queries: [],
      servedModel,
    };
  } catch (err: any) {
    console.info(`[sift] OpenRouter call failed: ${err.message}`);
    return null;
  } finally {
    if (releaseSlot) {
      releaseSlot();
    }
  }
}

export function _resetOpenRouterTracking(): void {
  openRouterExhaustedUntil = 0;
  cachedModelsList = null;
  lastKnownModels = [];
  tokenBucket.reset();
  activeHeavyCalls = 0;
  heavyQueue.length = 0;
}
