import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export const uid = () => crypto.randomUUID().slice(0, 8);
export const slug = (s: string) => s.replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase();
export const formatBytes = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const scoreTone = (s: number) => (s >= 75 ? 'teal' : s >= 50 ? 'amber' : 'coral');
export const scoreColor = (s: number) => `var(--color-${scoreTone(s)})`;
