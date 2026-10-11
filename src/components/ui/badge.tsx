import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badge = cva('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    tone: {
      neutral: 'border-white/12 bg-white/6 text-mist',
      teal: 'border-teal/30 bg-teal/12 text-teal',
      coral: 'border-coral/30 bg-coral/10 text-coral',
      amber: 'border-dashed border-amber/45 bg-amber/10 text-amber',
      violet: 'border-violet/30 bg-violet/15 text-violet',
      sky: 'border-sky/30 bg-sky/10 text-sky',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ tone, className, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...p} />;
}
