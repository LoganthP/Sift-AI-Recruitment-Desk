import type { AIMeta, StreamEvent } from '@shared/schemas';
import { useAuth } from '@/store/auth';

export class ApiError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

function headers(): HeadersInit {
  const token = useAuth.getState().token;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function onUnauthorized(path: string, status: number) {
  if (status === 401 && !path.startsWith('auth/')) useAuth.getState().signOut('Your session ended. Sign in again.');
}

export const postJSON = <T,>(path: string, body: unknown) => request<T>('POST', path, body);

export async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown, opts: { keepalive?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body), keepalive: opts.keepalive });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection.', 0);
  }
  const data = await res.json().catch(() => ({ error: `The server returned ${res.status}.` }));
  onUnauthorized(path, res.status);
  if (!res.ok) throw new ApiError(data.error || 'Request failed.', res.status);
  return data as T;
}

export type StreamHandlers<I> = {
  onProgress?: (e: { message: string; done?: number; total?: number }) => void;
  onItem?: (item: I) => void;
  signal?: AbortSignal;
};

/** POST that consumes a Server-Sent Events stream (EventSource can't POST, so we parse it ourselves). */
export async function streamAPI<T, I = unknown>(path: string, body: unknown, h: StreamHandlers<I> = {}): Promise<{ data: T; meta?: AIMeta }> {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: h.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('Could not reach the server. Check your connection.', 0);
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    onUnauthorized(path, res.status);
    throw new ApiError(data.error || `Request failed (${res.status}).`, res.status);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      if (/^event:\s*ping/m.test(block)) continue;
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (!data) continue;
      const ev = JSON.parse(data) as StreamEvent;
      if (ev.type === 'progress') h.onProgress?.(ev);
      else if (ev.type === 'item') h.onItem?.(ev.item as I);
      else if (ev.type === 'result') return { data: ev.data as T, meta: ev.meta };
      else if (ev.type === 'error') {
        onUnauthorized(path, ev.status || 500);
        throw new ApiError(ev.message, ev.status);
      }
    }
  }
  throw new ApiError('The connection closed before the AI finished. Try again.', 502);
}
