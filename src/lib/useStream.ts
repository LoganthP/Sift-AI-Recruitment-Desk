import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { AIMeta } from '@shared/schemas';
import { streamAPI } from './api';

export type Progress = { message: string; done?: number; total?: number; startedAt: number };

/** TanStack mutation over an SSE stream: exposes live progress, streamed items and cancel. */
export function useStreamMutation<T, V, I = unknown>(
  path: string,
  opts: { onStart?: (v: V) => void; onItem?: (item: I) => void; onSuccess?: (data: T, meta: AIMeta | undefined, vars: V) => void } = {}
) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const m = useMutation({
    mutationKey: [path],
    mutationFn: async (vars: V) => {
      ctrl.current = new AbortController();
      const startedAt = Date.now();
      setProgress({ message: 'Connecting to the AI', startedAt });
      opts.onStart?.(vars);
      return streamAPI<T, I>(path, vars, {
        signal: ctrl.current.signal,
        onProgress: (p) => setProgress({ ...p, startedAt }),
        onItem: opts.onItem,
      });
    },
    onSuccess: (r, vars) => opts.onSuccess?.(r.data, r.meta, vars),
    onSettled: () => setProgress(null),
  });
  return {
    ...m,
    progress,
    cancel: () => ctrl.current?.abort(),
    errorMessage: m.error && (m.error as Error).name !== 'AbortError' ? (m.error as Error).message : null,
  };
}
