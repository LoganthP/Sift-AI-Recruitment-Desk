import type { z } from 'zod';
import type { AIMeta, JD, Source } from '../../shared/schemas';
import { kv } from './kv';
import {
  callOpenRouter,
  isOpenRouterExhausted,
  markOpenRouterExhausted,
  getOpenRouterExhaustedUntil,
  _resetOpenRouterTracking,
} from './openrouter';
export {
  callOpenRouter,
  isOpenRouterExhausted,
  markOpenRouterExhausted,
  getOpenRouterExhaustedUntil,
  _resetOpenRouterTracking,
};

export class HttpError extends Error {
  constructor(public status: number, message: string, public upstreamStatus?: number, public detail?: string) {
    super(message);
  }
}

type Provider = 'groq' | 'gemini' | 'openrouter' | 'anthropic';

export function getGroqModels(tier: 'fast' | 'heavy' = 'fast'): string[] {
  const envVal = tier === 'heavy' ? process.env.GROQ_MODELS_HEAVY : process.env.GROQ_MODELS_FAST;
  if (envVal) {
    return envVal.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (tier === 'heavy' && process.env.GROQ_MODEL_HEAVY) {
    return [process.env.GROQ_MODEL_HEAVY.trim()];
  }
  if (tier === 'fast' && process.env.GROQ_MODEL) {
    return [process.env.GROQ_MODEL.trim()];
  }
  return tier === 'heavy'
    ? ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile']
    : ['openai/gpt-oss-20b', 'llama-3.1-8b-instant'];
}

export function getProviders(): Provider[] {
  const env = process.env.AI_PROVIDERS || process.env.AI_PROVIDER || 'groq,gemini,openrouter';
  return env
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is Provider => s === 'groq' || s === 'gemini' || s === 'openrouter' || s === 'anthropic');
}

export function providerInfo(tier: 'fast' | 'heavy' = 'fast') {
  const groqConfigured = !!process.env.GROQ_API_KEY;
  const geminiConfigured = !!process.env.GEMINI_API_KEY;
  const openrouterConfigured = !!process.env.OPENROUTER_API_KEY;
  const anthropicConfigured = !!process.env.ANTHROPIC_API_KEY;
  const configured = groqConfigured || geminiConfigured || openrouterConfigured || anthropicConfigured;
  const models = getGroqModels(tier);
  const provider = (groqConfigured ? 'groq' : geminiConfigured ? 'gemini' : openrouterConfigured ? 'openrouter' : 'anthropic') as Provider;
  const model = models[0] || 'openai/gpt-oss-20b';
  return { provider, model, configured };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- State tracking for model exhaustion & decommissioned models ---------- */
const exhaustedModels = new Map<string, number>(); // model name -> reset timestamp ms
const decommissionedModels = new Set<string>();

export function isModelDecommissioned(model: string): boolean {
  return decommissionedModels.has(model);
}

export function markModelDecommissioned(model: string): void {
  decommissionedModels.add(model);
  console.warn(`[sift] Model ${model} is decommissioned or not found. Skipping permanently.`);
}

export async function isModelExhausted(model: string): Promise<boolean> {
  const memUntil = exhaustedModels.get(model);
  if (memUntil && memUntil > Date.now()) {
    return true;
  }
  if (memUntil && memUntil <= Date.now()) {
    exhaustedModels.delete(model);
  }
  try {
    const raw = await kv.get(`ai:exhausted:${model}`);
    if (raw) {
      let until = 0;
      try {
        const parsed = JSON.parse(raw);
        until = typeof parsed === 'number' ? parsed : (parsed.until || parsed.expiresAt || 0);
      } catch {
        until = Number(raw) || 0;
      }
      if (until > Date.now()) {
        exhaustedModels.set(model, until);
        return true;
      } else {
        await kv.del(`ai:exhausted:${model}`).catch(() => {});
      }
    }
  } catch {}
  return false;
}

export async function markModelExhausted(model: string, waitMs: number): Promise<void> {
  const until = Date.now() + Math.max(waitMs, 1000);
  exhaustedModels.set(model, until);
  try {
    await kv.set(`ai:exhausted:${model}`, JSON.stringify({ until, expiresAt: until }));
  } catch (e) {
    console.warn(`[sift] Failed to persist exhausted state to KV for ${model}`, e);
  }
}

export function _resetModelTracking(): void {
  exhaustedModels.clear();
  decommissionedModels.clear();
  _resetOpenRouterTracking();
}

/**
 * Parses wait time string like "try again in 5m21.8s", "try again in 1h23m45s", "try again in 30s".
 * Returns total wait time in milliseconds.
 */
export function parseWaitTimeMs(msg: string): number {
  if (!msg) return 0;
  const match = msg.match(/try again in\s+([0-9a-z\.]+)/i);
  if (!match) return 0;
  const timeStr = match[1];
  let totalMs = 0;
  const regex = /(\d+(?:\.\d+)?)\s*(ms|d|h|m|s)(?![a-zA-Z])/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(timeStr)) !== null) {
    const val = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    if (unit === 'd') totalMs += val * 24 * 3600 * 1000;
    else if (unit === 'h') totalMs += val * 3600 * 1000;
    else if (unit === 'm') totalMs += val * 60 * 1000;
    else if (unit === 's') totalMs += val * 1000;
    else if (unit === 'ms') totalMs += val;
  }
  if (totalMs === 0) {
    const num = parseFloat(timeStr);
    if (!isNaN(num) && num > 0) totalMs = num * 1000;
  }
  return totalMs;
}

export function isDailyLimit(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes('per day') || m.includes('tpd') || m.includes('rpd');
}

export function parseRetryAfter(res?: Response, detail?: string): number {
  if (res) {
    const header = res.headers.get('retry-after');
    if (header) {
      const num = Number(header);
      if (Number.isFinite(num) && num > 0) return num;
    }
  }
  if (detail) {
    const ms = parseWaitTimeMs(detail);
    if (ms > 0) return Math.ceil(ms / 1000);
  }
  return 2;
}

type CallArgs = {
  system: string;
  prompt: string;
  json: boolean;
  webSearch: boolean;
  maxTokens: number;
  temperature: number;
  model: string;
  reasoningEffort?: 'low' | 'medium';
  isCompoundMini?: boolean;
};
type CallOut = { text: string; sources: Source[]; queries: string[] };

async function callGroq(a: CallArgs): Promise<CallOut> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new HttpError(503, 'Groq API key is not configured.');

  const isLlama = a.model.toLowerCase().startsWith('llama-') || a.model.toLowerCase().includes('llama');
  const isCompoundMini = a.isCompoundMini || a.model === 'groq/compound-mini';

  const body: any = {
    model: a.model,
    messages: [
      { role: 'system', content: a.system },
      { role: 'user', content: a.prompt },
    ],
    temperature: a.temperature,
    max_completion_tokens: a.maxTokens,
  };

  // For compound-mini: no tools, no response_format, no reasoning params
  // For llama-* models: don't send reasoning_effort or include_reasoning
  if (!isCompoundMini && !isLlama) {
    body.reasoning_effort = a.reasoningEffort || 'low';
    body.include_reasoning = false;
  }

  if (a.json && !a.webSearch && !isCompoundMini) {
    body.response_format = { type: 'json_object' };
  }

  if (a.webSearch && !isCompoundMini) {
    body.tools = [{ type: 'browser_search' }];
    body.tool_choice = 'auto';
  }

  const droppedParams = new Set<string>();

  while (true) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = '';
      try {
        const j: any = await res.json();
        detail = j?.error?.param ? `${j.error.param}: ${j.error.message}` : (j?.error?.message || JSON.stringify(j).slice(0, 500));
      } catch {
        detail = await res.text().catch(() => '');
      }

      if (res.status === 400) {
        const errDetail = detail.toLowerCase();
        let dropped: string | null = null;
        if (!droppedParams.has('include_reasoning') && errDetail.includes('include_reasoning')) {
          dropped = 'include_reasoning';
          delete body.include_reasoning;
        } else if (!droppedParams.has('reasoning_effort') && errDetail.includes('reasoning_effort')) {
          dropped = 'reasoning_effort';
          delete body.reasoning_effort;
        } else if (
          !droppedParams.has('browser_search') &&
          body.tools &&
          (errDetail.includes('browser_search') ||
            errDetail.includes('tool') ||
            errDetail.includes('browser') ||
            errDetail.includes('parse') ||
            errDetail.includes('failed_generation'))
        ) {
          dropped = 'browser_search';
          delete body.tools;
          delete body.tool_choice;
          if (a.json) body.response_format = { type: 'json_object' };
        }
        if (dropped) {
          droppedParams.add(dropped);
          console.error(`[sift] Dropped unsupported Groq parameter: ${dropped}`);
          continue;
        }
      }

      throw new HttpError(res.status, `Groq API error (${res.status})`, res.status, detail);
    }

    const data: any = await res.json();
    const choice = data.choices?.[0];
    const msg = choice?.message;
    let text = msg?.content || '';

    // If content was empty but reasoning field contains JSON, extract it
    if (!text && msg?.reasoning) {
      try {
        const extracted = extractJSON(msg.reasoning);
        if (extracted && typeof extracted === 'object') {
          text = JSON.stringify(extracted);
        }
      } catch {}
    }

    // If browser_search was requested but returned empty text, treat as unavailable and re-run without tools
    if (!text && body.tools && !droppedParams.has('browser_search')) {
      droppedParams.add('browser_search');
      console.error('[sift] Dropped unsupported Groq parameter: browser_search');
      delete body.tools;
      delete body.tool_choice;
      if (a.json) body.response_format = { type: 'json_object' };
      continue;
    }

    if (!text) throw new HttpError(502, 'The AI returned an empty answer. Try again.');

    const sources: Source[] = [];
    const seenUrls = new Set<string>();
    const executedTools: any[] = msg?.executed_tools || [];
    for (const tool of executedTools) {
      const results = tool?.search_results?.results || [];
      for (const r of results) {
        if (r?.url && !seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          sources.push({ title: r.title || r.url || 'Source', url: r.url });
        }
      }
    }

    const queries: string[] = [];
    for (const tool of executedTools) {
      let q: any = undefined;
      if (typeof tool?.arguments === 'string') {
        try {
          const parsed = JSON.parse(tool.arguments);
          q = parsed?.query || parsed?.queries;
        } catch {
          q = tool.arguments;
        }
      } else if (tool?.arguments && typeof tool.arguments === 'object') {
        q = tool.arguments.query || tool.arguments.queries;
      } else if (tool?.input) {
        q = typeof tool.input === 'object' ? tool.input.query : tool.input;
      } else if (tool?.parameters) {
        q = typeof tool.parameters === 'object' ? tool.parameters.query : tool.parameters;
      } else if (typeof tool?.query === 'string') {
        q = tool.query;
      }
      if (typeof q === 'string' && q.trim()) {
        queries.push(q.trim());
      } else if (Array.isArray(q)) {
        for (const item of q) {
          if (typeof item === 'string' && item.trim()) queries.push(item.trim());
        }
      }
    }

    return { text, sources, queries };
  }
}

async function callGemini(a: CallArgs): Promise<CallOut> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new HttpError(503, 'Gemini API key is not configured.');

  const model = a.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

  const body: any = {
    contents: [
      {
        role: 'user',
        parts: [{ text: a.prompt }],
      },
    ],
    generationConfig: {
      temperature: a.temperature,
      maxOutputTokens: a.maxTokens,
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
  };

  if (a.system) {
    body.systemInstruction = {
      parts: [{ text: a.system }],
    };
  }

  if (a.json) {
    body.generationConfig.responseMimeType = 'application/json';
  }

  if (a.webSearch) {
    body.tools = [{ google_search: {} }];
  }

  let res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

    if (res.status === 400 && a.webSearch && a.json && detail.toLowerCase().includes('response_mime_type')) {
      delete body.generationConfig.responseMimeType;
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    if (!res.ok) {
      throw new HttpError(res.status, `Gemini API error (${res.status})`, res.status, detail);
    }
  }

  const data: any = await res.json();
  const candidate = data.candidates?.[0];
  const parts: any[] = candidate?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('');

  if (!text) throw new HttpError(502, 'Gemini returned an empty answer. Try again.');

  const sources: Source[] = [];
  const seenUrls = new Set<string>();
  const grounding = candidate?.groundingMetadata;
  if (Array.isArray(grounding?.groundingChunks)) {
    for (const chunk of grounding.groundingChunks) {
      const u = chunk.web?.uri || chunk.web?.url;
      if (u && !seenUrls.has(u)) {
        seenUrls.add(u);
        sources.push({ title: chunk.web?.title || u, url: u });
      }
    }
  }

  const queries: string[] = [];
  if (Array.isArray(grounding?.webSearchQueries)) {
    for (const q of grounding.webSearchQueries) {
      if (typeof q === 'string' && q.trim()) queries.push(q.trim());
    }
  }

  return { text, sources, queries };
}

async function callAnthropic(a: CallArgs): Promise<CallOut> {
  const body: any = {
    model: a.model,
    max_tokens: a.maxTokens,
    temperature: a.temperature,
    system: a.system,
    messages: [{ role: 'user', content: a.prompt }],
  };
  if (a.webSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
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
    throw new HttpError(res.status, `Anthropic API error (${res.status})`, res.status, detail);
  }

  const data: any = await res.json();
  const blocks: any[] = data.content || [];
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const sources: Source[] = [];
  for (const b of blocks) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content))
      for (const r of b.content) if (r.url) sources.push({ title: r.title || r.url, url: r.url });
    for (const c of b.citations || []) if (c.url) sources.push({ title: c.title || c.url, url: c.url });
  }
  const queries = blocks.filter((b) => b.type === 'server_tool_use').map((b) => b.input?.query).filter(Boolean);
  return { text, sources, queries };
}

export function extractJSON(text: string): unknown {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(t);
  } catch {}
  const start = t.search(/[[{]/);
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {}
  }
  throw new Error('Response was not valid JSON');
}

export const BASE_SYSTEM = `You are Sift, a precise assistant for technical recruiters in India.
Respond with valid JSON only: no markdown, no code fences, no commentary.
Never invent facts. If information is missing, say so in the field (null or "Not specified").`;

type ModelCandidate = {
  provider: Provider;
  model: string;
  webSearch: boolean;
  isCompoundMini?: boolean;
};

function buildCandidateChain(opts: {
  webSearch?: boolean;
  tier?: 'fast' | 'heavy';
}): ModelCandidate[] {
  const providers = getProviders();
  const candidates: ModelCandidate[] = [];

  if (opts.webSearch) {
    // 1) Groq compound-mini first
    if (providers.includes('groq') && process.env.GROQ_API_KEY) {
      candidates.push({
        provider: 'groq',
        model: 'groq/compound-mini',
        webSearch: true,
        isCompoundMini: true,
      });
    }
    // 2) Fall back to Gemini with google_search (if configured)
    if (providers.includes('gemini') && process.env.GEMINI_API_KEY) {
      candidates.push({
        provider: 'gemini',
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        webSearch: true,
      });
    }
    // 3) OpenRouter with web search plugin (only if OPENROUTER_WEB=1)
    if (providers.includes('openrouter') && process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_WEB === '1') {
      candidates.push({
        provider: 'openrouter',
        model: 'openrouter',
        webSearch: true,
      });
    }
    // 4) Normal heavy chain without search in provider order
    for (const prov of providers) {
      if (prov === 'groq' && process.env.GROQ_API_KEY) {
        for (const model of getGroqModels('heavy')) {
          candidates.push({
            provider: 'groq',
            model,
            webSearch: false,
          });
        }
      } else if (prov === 'gemini' && process.env.GEMINI_API_KEY) {
        candidates.push({
          provider: 'gemini',
          model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
          webSearch: false,
        });
      } else if (prov === 'openrouter' && process.env.OPENROUTER_API_KEY) {
        candidates.push({
          provider: 'openrouter',
          model: 'openrouter',
          webSearch: false,
        });
      } else if (prov === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
        candidates.push({
          provider: 'anthropic',
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
          webSearch: false,
        });
      }
    }
    return candidates;
  }

  // Normal request chain (non-search) in provider order
  for (const prov of providers) {
    if (prov === 'groq' && process.env.GROQ_API_KEY) {
      for (const model of getGroqModels(opts.tier || 'fast')) {
        candidates.push({
          provider: 'groq',
          model,
          webSearch: false,
        });
      }
    } else if (prov === 'gemini' && process.env.GEMINI_API_KEY) {
      candidates.push({
        provider: 'gemini',
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        webSearch: false,
      });
    } else if (prov === 'openrouter' && process.env.OPENROUTER_API_KEY) {
      candidates.push({
        provider: 'openrouter',
        model: 'openrouter',
        webSearch: false,
      });
    } else if (prov === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      candidates.push({
        provider: 'anthropic',
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        webSearch: false,
      });
    }
  }

  return candidates;
}

async function callGroqWithHandling(
  cand: ModelCandidate,
  args: CallArgs,
  recordedWaits: number[]
): Promise<CallOut | null> {
  try {
    return await callGroq(args);
  } catch (err: any) {
    const upstreamStatus = err.upstreamStatus || err.status;
    const detail = String(err.detail || err.message || '');

    // 404 or decommissioned: skip permanently for this process and log it
    if (upstreamStatus === 404 || detail.toLowerCase().includes('model_not_found') || detail.toLowerCase().includes('decommissioned')) {
      markModelDecommissioned(cand.model);
      return null;
    }

    // 429
    if (upstreamStatus === 429) {
      if (isDailyLimit(detail)) {
        // Daily limit (TPD/RPD): parse wait time, mark exhausted in memory + KV, try next model immediately (no sleep)
        const waitMs = parseWaitTimeMs(detail) || 60 * 60 * 1000;
        await markModelExhausted(cand.model, waitMs);
        recordedWaits.push(waitMs);
        console.info(`[sift] Skipped model ${cand.model}: daily quota exhausted (TPD/RPD), resets in about ${Math.ceil(waitMs / 60000)}m`);
        return null;
      } else {
        // Per-minute limit (TPM/RPM): wait for retry-after (max 8s) once, then move to next model
        const retryAfterSec = parseRetryAfter(undefined, detail);
        const waitSec = Math.min(retryAfterSec, 8);
        console.info(`[sift] Model ${cand.model} rate limited (TPM/RPM). Waiting ${waitSec}s before retrying once.`);
        await sleep(waitSec * 1000);
        try {
          return await callGroq(args);
        } catch (retryErr: any) {
          const retryDetail = String(retryErr.detail || retryErr.message || '');
          if (isDailyLimit(retryDetail)) {
            const waitMs = parseWaitTimeMs(retryDetail) || 60 * 60 * 1000;
            await markModelExhausted(cand.model, waitMs);
            recordedWaits.push(waitMs);
          }
          console.info(`[sift] Skipped model ${cand.model}: per-minute rate limit after retry`);
          return null;
        }
      }
    }

    console.info(`[sift] Skipped model ${cand.model}: ${err.message}`);
    return null;
  }
}

async function callGeminiWithHandling(
  cand: ModelCandidate,
  args: CallArgs,
  recordedWaits: number[]
): Promise<CallOut | null> {
  try {
    return await callGemini(args);
  } catch (err: any) {
    const upstreamStatus = err.upstreamStatus || err.status;
    const detail = String(err.detail || err.message || '');

    if (upstreamStatus === 404 || detail.toLowerCase().includes('not_found')) {
      markModelDecommissioned(cand.model);
      return null;
    }

    if (upstreamStatus === 429) {
      const waitMs = parseWaitTimeMs(detail) || 60 * 60 * 1000;
      await markModelExhausted(cand.model, waitMs);
      recordedWaits.push(waitMs);
      console.info(`[sift] Skipped Gemini model ${cand.model}: quota exhausted (429)`);
      return null;
    }

    console.info(`[sift] Skipped Gemini model ${cand.model}: ${err.message}`);
    return null;
  }
}

function calculateResetMinutes(recordedWaits: number[]): number {
  const futureWaits: number[] = [...recordedWaits];
  const now = Date.now();
  for (const [, until] of exhaustedModels.entries()) {
    if (until > now) {
      futureWaits.push(until - now);
    }
  }
  const orUntil = getOpenRouterExhaustedUntil();
  if (orUntil > now) {
    futureWaits.push(orUntil - now);
  }
  if (futureWaits.length > 0) {
    const minMs = Math.min(...futureWaits);
    return Math.max(1, Math.round(minMs / 60000));
  }
  return 60;
}

async function callOpenRouterWithHandling(
  cand: ModelCandidate,
  args: CallArgs,
  recordedWaits: number[],
  tier: 'fast' | 'heavy'
): Promise<(CallOut & { servedModel?: string }) | null> {
  const res = await callOpenRouter({
    system: args.system,
    prompt: args.prompt,
    json: args.json,
    webSearch: cand.webSearch,
    maxTokens: args.maxTokens,
    temperature: args.temperature,
    tier,
  });
  if (!res) {
    const until = getOpenRouterExhaustedUntil();
    if (until > Date.now()) {
      recordedWaits.push(until - Date.now());
    }
    return null;
  }
  return {
    text: res.text,
    sources: res.sources,
    queries: res.queries,
    servedModel: res.servedModel,
  };
}

function finish<S extends z.ZodTypeAny>(
  data: z.infer<S>,
  sources: Source[],
  queries: string[],
  provider: Provider,
  model: string,
  t0: number
) {
  const seen = new Set<string>();
  const filteredSources = (sources || []).filter((s) => s.url && !seen.has(s.url) && seen.add(s.url));
  return {
    data,
    sources: filteredSources,
    queries: queries || [],
    meta: { provider: provider as any, model, ms: Date.now() - t0 } as AIMeta,
  };
}

/**
 * Calls the fallback model chain and validates the JSON against a Zod schema.
 * If validation fails, it performs one repair attempt on the NEXT model in the chain.
 */
export async function generateJSON<S extends z.ZodTypeAny>(
  schema: S,
  opts: {
    prompt: string;
    system?: string;
    webSearch?: boolean;
    temperature?: number;
    maxTokens?: number;
    tier?: 'fast' | 'heavy';
    reasoning_effort?: 'low' | 'medium';
  }
): Promise<{ data: z.infer<S>; sources: Source[]; queries: string[]; meta: AIMeta }> {
  const candidates = buildCandidateChain(opts);

  if (candidates.length === 0) {
    console.error('[sift] No AI provider configured.');
    throw new HttpError(503, 'The AI service is not configured yet. Add the AI key to the server environment and redeploy.');
  }

  const t0 = Date.now();
  const recordedWaits: number[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];

    if (cand.provider === 'openrouter') {
      if (await isOpenRouterExhausted()) {
        const until = getOpenRouterExhaustedUntil() || Date.now() + 3600000;
        recordedWaits.push(Math.max(until - Date.now(), 60000));
        console.info(`[sift] Skipped provider openrouter: exhausted until ${new Date(until).toISOString()}`);
        continue;
      }
    } else {
      if (isModelDecommissioned(cand.model)) {
        console.info(`[sift] Skipped model ${cand.model}: decommissioned or not found`);
        continue;
      }

      if (await isModelExhausted(cand.model)) {
        const until = exhaustedModels.get(cand.model) || Date.now() + 3600000;
        recordedWaits.push(Math.max(until - Date.now(), 60000));
        console.info(`[sift] Skipped model ${cand.model}: exhausted until ${new Date(until).toISOString()}`);
        continue;
      }
    }

    const callArgs: CallArgs = {
      system: opts.system || BASE_SYSTEM,
      prompt: opts.prompt,
      json: true,
      webSearch: cand.webSearch,
      maxTokens: opts.maxTokens ?? 2500,
      temperature: opts.temperature ?? 0.2,
      model: cand.model,
      reasoningEffort: opts.reasoning_effort || 'low',
      isCompoundMini: cand.isCompoundMini,
    };

    let out: (CallOut & { servedModel?: string }) | null = null;

    try {
      if (cand.provider === 'groq') {
        out = await callGroqWithHandling(cand, callArgs, recordedWaits);
      } else if (cand.provider === 'gemini') {
        out = await callGeminiWithHandling(cand, callArgs, recordedWaits);
      } else if (cand.provider === 'openrouter') {
        out = await callOpenRouterWithHandling(cand, callArgs, recordedWaits, opts.tier || 'fast');
      } else {
        out = await callAnthropic(callArgs);
      }
    } catch (err: any) {
      console.info(`[sift] Skipped model ${cand.model}: ${err.message || 'error'}`);
      continue;
    }

    if (!out) continue;

    // Validate with Zod
    let problem = '';
    try {
      const parsed = schema.safeParse(extractJSON(out.text));
      if (parsed.success) {
        const modelName = out.servedModel || cand.model;
        console.info(`[sift] Served request using model ${modelName} (${cand.provider}) in ${Date.now() - t0}ms`);
        return finish(parsed.data, out.sources, out.queries, cand.provider, modelName, t0);
      }
      problem = parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ');
    } catch (e: any) {
      problem = e.message || 'Invalid JSON';
    }

    // Keep the single Zod repair retry, but run it on the next model in the chain
    console.info(`[sift] Model ${cand.model} returned invalid data (${problem}). Retrying Zod repair on next model in chain.`);

    const repairPrompt = `${opts.prompt}\n\nYour previous reply could not be used (${problem}). Previous reply:\n"""\n${out.text.slice(0, 7000)}\n"""\nReturn the corrected JSON only.`;

    const repairCandidates = candidates.slice(i + 1);
    if (repairCandidates.length === 0) {
      repairCandidates.push(cand);
    }

    for (let j = 0; j < repairCandidates.length; j++) {
      const repairCand = repairCandidates[j];
      if (repairCand.provider === 'openrouter') {
        if (await isOpenRouterExhausted()) continue;
      } else {
        if (isModelDecommissioned(repairCand.model)) continue;
        if (await isModelExhausted(repairCand.model)) continue;
      }

      const repairArgs: CallArgs = {
        ...callArgs,
        prompt: repairPrompt,
        model: repairCand.model,
        webSearch: false,
        isCompoundMini: repairCand.isCompoundMini,
      };

      try {
        let repairOut: (CallOut & { servedModel?: string }) | null = null;
        if (repairCand.provider === 'groq') {
          repairOut = await callGroqWithHandling(repairCand, repairArgs, recordedWaits);
        } else if (repairCand.provider === 'gemini') {
          repairOut = await callGeminiWithHandling(repairCand, repairArgs, recordedWaits);
        } else if (repairCand.provider === 'openrouter') {
          repairOut = await callOpenRouterWithHandling(repairCand, repairArgs, recordedWaits, opts.tier || 'fast');
        } else {
          repairOut = await callAnthropic(repairArgs);
        }
        if (!repairOut) continue;

        const repairParsed = schema.safeParse(extractJSON(repairOut.text));
        if (repairParsed.success) {
          const modelName = repairOut.servedModel || repairCand.model;
          console.info(`[sift] Served request using model ${modelName} (${repairCand.provider}) via Zod repair in ${Date.now() - t0}ms`);
          return finish(repairParsed.data, out.sources, out.queries, repairCand.provider, modelName, t0);
        } else {
          console.info(`[sift] Skipped model ${repairCand.model}: Zod repair returned invalid shape`);
          throw new HttpError(502, 'The AI returned data in the wrong shape twice. Try again.');
        }
      } catch (err: any) {
        if (err instanceof HttpError && err.status === 502 && err.message.includes('wrong shape twice')) {
          throw err;
        }
        console.info(`[sift] Skipped model ${repairCand.model} during repair: ${err.message}`);
      }
    }

    throw new HttpError(502, 'The AI returned data in the wrong shape twice. Try again.');
  }

  // If every model and provider is exhausted, return friendly 429
  const resetMinutes = calculateResetMinutes(recordedWaits);
  throw new HttpError(
    429,
    `Today’s AI limit has been reached. It resets in about ${resetMinutes} minutes. Results you’ve already generated are still available.`
  );
}

export function jdBrief(jd: JD) {
  const e = jd.experience;
  return [
    `Role: ${jd.role}`,
    jd.company && `Company: ${jd.company}`,
    `Location: ${jd.location}${jd.workMode !== 'Not specified' ? ` (${jd.workMode})` : ''}`,
    `Experience required: ${e.text !== 'Not specified' ? e.text : [e.min, e.max].filter((x) => x != null).join('-') + ' years'}`,
    jd.seniority !== 'Not specified' && `Seniority: ${jd.seniority}`,
    jd.domain !== 'Not specified' && `Domain: ${jd.domain}`,
    `Must-have skills: ${jd.keySkills.join(', ') || 'Not specified'}`,
    jd.niceToHave.length && `Nice to have: ${jd.niceToHave.join(', ')}`,
    jd.responsibilities.length && `Responsibilities: ${jd.responsibilities.join('; ')}`,
    jd.education !== 'Not specified' && `Education: ${jd.education}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function isOpenRouterActive(tier: 'fast' | 'heavy' = 'heavy'): Promise<boolean> {
  const providers = getProviders();
  for (const prov of providers) {
    if (prov === 'groq' && process.env.GROQ_API_KEY) {
      const models = getGroqModels(tier);
      let anyAvailable = false;
      for (const m of models) {
        if (!isModelDecommissioned(m) && !(await isModelExhausted(m))) {
          anyAvailable = true;
          break;
        }
      }
      if (anyAvailable) return false;
    } else if (prov === 'gemini' && process.env.GEMINI_API_KEY) {
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      if (!isModelDecommissioned(model) && !(await isModelExhausted(model))) {
        return false;
      }
    } else if (prov === 'openrouter' && process.env.OPENROUTER_API_KEY) {
      if (!(await isOpenRouterExhausted())) {
        return true;
      }
    } else if (prov === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      return false;
    }
  }
  return false;
}

/** Run async tasks with a concurrency cap (keeps us under provider rate limits). */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>) {
  let effectiveLimit = limit;
  if (items.length > 2 && (await isOpenRouterActive('heavy'))) {
    effectiveLimit = Math.min(limit, 2);
  }
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(effectiveLimit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          results[i] = { status: 'fulfilled', value: await fn(items[i], i) };
        } catch (reason) {
          results[i] = { status: 'rejected', reason };
        }
      }
    })
  );
  return results;
}
