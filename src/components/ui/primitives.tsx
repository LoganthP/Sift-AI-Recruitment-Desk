import { Tabs as TabsP, Tooltip as TooltipP, Dialog as DialogP, Slider as SliderP, Accordion as AccordionP, Progress as ProgressP, ToggleGroup as ToggleGroupP } from 'radix-ui';
import { motion } from 'motion/react';
import { X, ChevronDown } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { spring } from './button';

/* ---------- Tabs with sliding indicator ---------- */
export const Tabs = TabsP.Root;
export const TabsContent = TabsP.Content;
export function TabsList({ className, ...p }: TabsP.TabsListProps) {
  return <TabsP.List className={cn('relative inline-flex rounded-2xl bg-black/30 p-1', className)} {...p} />;
}
export function TabsTrigger({ value, active, children, layoutId = 'tab-pill', className }: { value: string; active: boolean; children: React.ReactNode; layoutId?: string; className?: string }) {
  return (
    <TabsP.Trigger value={value} className={cn('relative rounded-xl px-4 py-1.5 text-sm font-medium transition-colors', active ? 'text-ink' : 'text-muted hover:text-mist', className)}>
      {active && <motion.span layoutId={layoutId} transition={spring} className="absolute inset-0 rounded-xl bg-mist" />}
      <span className="relative inline-flex items-center gap-1.5">{children}</span>
    </TabsP.Trigger>
  );
}

/* ---------- Tooltip ---------- */
export const TooltipProvider = TooltipP.Provider;
export function Tip({ content, children, side = 'top' }: { content: React.ReactNode; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipP.Root delayDuration={150}>
      <TooltipP.Trigger asChild>{children}</TooltipP.Trigger>
      <TooltipP.Portal>
        <TooltipP.Content side={side} sideOffset={6} className="glass-strong z-50 max-w-72 rounded-xl px-3 py-2 text-xs leading-relaxed text-mist shadow-xl data-[state=delayed-open]:animate-in">
          {content}
        </TooltipP.Content>
      </TooltipP.Portal>
    </TooltipP.Root>
  );
}

/* ---------- Dialog ---------- */
export const Dialog = DialogP.Root;
export const DialogTrigger = DialogP.Trigger;
export const DialogClose = DialogP.Close;
export function DialogContent({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <DialogP.Portal>
      <DialogP.Overlay asChild>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm" />
      </DialogP.Overlay>
      <DialogP.Content asChild>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={spring}
          className={cn('glass-strong fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(92vw,960px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl p-6 shadow-2xl scroll-thin', className)}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <DialogP.Title className="font-display text-2xl font-bold">{title}</DialogP.Title>
              {description && <DialogP.Description className="mt-1 text-sm text-muted">{description}</DialogP.Description>}
            </div>
            <DialogP.Close className="rounded-xl p-2 text-muted hover:bg-white/8 hover:text-mist" aria-label="Close"><X className="size-5" /></DialogP.Close>
          </div>
          {children}
        </motion.div>
      </DialogP.Content>
    </DialogP.Portal>
  );
}

/* ---------- Slider ---------- */
export function Slider({ value, onChange, max = 100, className }: { value: number; onChange: (v: number) => void; max?: number; className?: string }) {
  return (
    <SliderP.Root value={[value]} max={max} step={1} onValueChange={([v]) => onChange(v)} className={cn('relative flex h-5 w-full touch-none select-none items-center', className)}>
      <SliderP.Track className="relative h-2 grow overflow-hidden rounded-full bg-white/10">
        <SliderP.Range className="absolute h-full rounded-full bg-gradient-to-r from-violet to-teal" />
      </SliderP.Track>
      <SliderP.Thumb aria-label="Score" className="block size-5 rounded-full border-2 border-teal bg-ink shadow-[0_0_0_4px_rgb(52_211_180/0.2)] transition-transform hover:scale-110 focus-visible:outline-none" />
    </SliderP.Root>
  );
}

/* ---------- Accordion ---------- */
export const Accordion = AccordionP.Root;
export const AccordionItem = AccordionP.Item;
export function AccordionTrigger({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <AccordionP.Header asChild>
      <div>
        <AccordionP.Trigger className={cn('group flex w-full items-start gap-4 p-5 text-left', className)}>
          <div className="min-w-0 flex-1">{children}</div>
          <ChevronDown className="mt-1 size-5 shrink-0 text-muted transition-transform duration-300 group-data-[state=open]:rotate-180" />
        </AccordionP.Trigger>
      </div>
    </AccordionP.Header>
  );
}
export const AccordionContent = forwardRef<HTMLDivElement, AccordionP.AccordionContentProps>(function AccordionContent({ className, children, ...p }, ref) {
  return (
    <AccordionP.Content ref={ref} className={cn('overflow-hidden data-[state=closed]:animate-[collapse_200ms_ease-out] data-[state=open]:animate-[expand_250ms_var(--ease-soft)]', className)} {...p}>
      {children}
    </AccordionP.Content>
  );
});

/* ---------- Progress ---------- */
export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <ProgressP.Root value={value} className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-white/8', className)}>
      <ProgressP.Indicator asChild>
        <motion.div className="h-full rounded-full bg-gradient-to-r from-violet via-sky to-teal" animate={{ width: `${value}%` }} transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.5 }} />
      </ProgressP.Indicator>
    </ProgressP.Root>
  );
}

/* ---------- Segmented toggle ---------- */
export function Segmented<T extends string>({ value, onChange, options, size = 'sm' }: { value?: T; onChange: (v: T | undefined) => void; options: { value: T; label: React.ReactNode; tone?: string }[]; size?: 'sm' | 'md' }) {
  return (
    <ToggleGroupP.Root type="single" value={value ?? ''} onValueChange={(v) => onChange((v || undefined) as T | undefined)} className="inline-flex rounded-xl bg-black/30 p-0.5">
      {options.map((o) => (
        <ToggleGroupP.Item key={o.value} value={o.value} className={cn('relative rounded-[10px] font-medium text-muted transition-colors hover:text-mist data-[state=on]:text-ink', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm')}>
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join('')}-${o.value}`} className={cn('absolute inset-0 rounded-[10px]', o.tone || 'bg-mist')} transition={spring} />}
          <span className="relative inline-flex items-center gap-1">{o.label}</span>
        </ToggleGroupP.Item>
      ))}
    </ToggleGroupP.Root>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>;
}
