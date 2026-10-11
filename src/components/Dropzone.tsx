import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { FileText, FileType2, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { spring } from './ui/button';

export function Dropzone({ multiple, accept, onFiles, title, hint, compact }: { multiple?: boolean; accept: string; onFiles: (f: File[]) => void; title: string; hint?: string; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const take = (list: FileList | null) => {
    const files = Array.from(list || []);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  return (
    <motion.div
      role="button" tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), input.current?.click())}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      animate={{ scale: over ? 1.012 : 1 }} transition={spring}
      className={cn('group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed text-center transition-colors', over ? 'border-teal bg-teal/8' : 'border-white/15 bg-white/[0.025] hover:border-white/30', compact ? 'px-4 py-7' : 'px-6 py-14')}
    >
      <input ref={input} type="file" className="sr-only" multiple={multiple} accept={accept} onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      <div className="relative mb-4 h-14 w-24">
        <motion.span animate={{ rotate: over ? -18 : -10, x: over ? -16 : -8, y: 4 }} transition={spring} className="absolute left-1/2 top-0 grid size-12 -translate-x-1/2 place-items-center rounded-xl border border-white/10 bg-coral/15 text-coral"><FileText className="size-5" /></motion.span>
        <motion.span animate={{ rotate: over ? 18 : 10, x: over ? 16 : 8, y: 4 }} transition={spring} className="absolute left-1/2 top-0 grid size-12 -translate-x-1/2 place-items-center rounded-xl border border-white/10 bg-violet/15 text-violet"><FileType2 className="size-5" /></motion.span>
        <motion.span animate={{ y: over ? -8 : 0 }} transition={spring} className="absolute left-1/2 top-0 grid size-12 -translate-x-1/2 place-items-center rounded-xl border border-white/15 bg-ink-3 text-teal shadow-lg"><UploadCloud className="size-5" /></motion.span>
      </div>
      <p className="font-display text-lg font-bold">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </motion.div>
  );
}
