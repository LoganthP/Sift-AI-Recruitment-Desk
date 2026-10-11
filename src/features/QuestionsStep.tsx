import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Copy, MessagesSquare, PhoneCall, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import type { JD, Question } from '@shared/schemas';
import { useSession } from '@/store/session';
import { useStreamMutation } from '@/lib/useStream';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Dialog, DialogContent, Kbd, Segmented } from '@/components/ui/primitives';
import { AIStatus, EmptyState, ErrorNote, StepHeader, rise, stagger } from '@/components/common';

type Cat = 'All' | Question['category'];
const TONE = { Technical: 'teal', Experience: 'violet', Fit: 'sky' } as const;

function Answer({ q }: { q: Question }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
      <div>
        <p className="mb-1 text-xs text-muted">A good answer</p>
        <p className="text-sm leading-relaxed">{q.goodAnswer}</p>
      </div>
      <div className="space-y-2">
        {q.lookFor.map((l) => <p key={l} className="flex gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-teal" />{l}</p>)}
        {q.redFlags.map((l) => <p key={l} className="flex gap-2 text-sm text-coral/90"><X className="mt-0.5 size-4 shrink-0" />{l}</p>)}
      </div>
    </div>
  );
}

function CallMode({ questions, open, onOpenChange }: { questions: Question[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const go = (d: number) => {
    setDir(d);
    setI((x) => Math.min(questions.length - 1, Math.max(0, x + d)));
  };
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => (e.key === 'ArrowRight' ? go(1) : e.key === 'ArrowLeft' ? go(-1) : null);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  const q = questions[i];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent title="Call mode" description="One question at a time. Use the arrow keys while you're on the call." className="w-[min(92vw,760px)]">
          <div className="mb-4 flex gap-1">
            {questions.map((_, n) => <button key={n} onClick={() => { setDir(n > i ? 1 : -1); setI(n); }} aria-label={`Question ${n + 1}`} className={`h-1.5 flex-1 rounded-full transition-colors ${n === i ? 'bg-teal' : n < i ? 'bg-teal/40' : 'bg-white/10'}`} />)}
          </div>
          <div className="relative min-h-72 overflow-hidden">
            <AnimatePresence mode="popLayout" custom={dir} initial={false}>
              <motion.div key={i} custom={dir} initial={{ x: dir * 80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: dir * -80, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
                <div className="mb-3 flex gap-2"><Badge tone={TONE[q.category]}>{q.category}</Badge>{q.skill && <Badge>{q.skill}</Badge>}<span className="ml-auto text-sm tabular-nums text-muted">{i + 1} / {questions.length}</span></div>
                <p className="font-display text-2xl font-bold leading-snug sm:text-3xl">{q.question}</p>
                <div className="mt-6 rounded-2xl bg-white/[0.04] p-4"><Answer q={q} /></div>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="mt-5 flex items-center justify-between">
            <Button variant="glass" icon={ArrowLeft} disabled={i === 0} onClick={() => go(-1)}>Previous</Button>
            <span className="hidden text-xs text-muted sm:block"><Kbd>←</Kbd> <Kbd>→</Kbd></span>
            {i < questions.length - 1 ? <Button iconRight={ArrowRight} onClick={() => go(1)}>Next</Button> : <Button icon={Check} onClick={() => onOpenChange(false)}>Done</Button>}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

export default function QuestionsStep({ onNext }: { onNext: () => void }) {
  const { jd, questions, set } = useSession();
  const [cat, setCat] = useState<Cat>('All');
  const [call, setCall] = useState(false);
  const gen = useStreamMutation<{ questions: Question[] }, { jd: JD }>('questions', {
    onSuccess: (data, meta) => set('questions', { ...data, meta, at: Date.now() }),
  });
  const list = questions?.questions || [];
  const count = (c: Cat) => (c === 'All' ? list.length : list.filter((q) => q.category === c).length);

  const copyAll = () =>
    navigator.clipboard
      .writeText(list.map((q, i) => `${i + 1}. [${q.category}] ${q.question}\n   Good answer: ${q.goodAnswer}`).join('\n\n'))
      .then(() => toast.success('All 10 questions copied'), () => toast.error('Copy failed'));

  return (
    <div>
      <StepHeader
        step={5}
        title="Screening questions"
        description="Ten questions for a first call: technical, experience and fit, each with what a good answer covers. Use call mode to run through them live."
        actions={list.length > 0 && !gen.isPending && (
          <>
            <Button size="sm" icon={PhoneCall} onClick={() => setCall(true)}>Call mode</Button>
            <Button size="sm" variant="glass" icon={Copy} onClick={copyAll}>Copy all</Button>
            <Button size="sm" variant="glass" icon={RefreshCw} onClick={() => jd && gen.mutate({ jd })}>New set</Button>
          </>
        )}
      />
      <ErrorNote message={gen.errorMessage} onRetry={() => jd && gen.mutate({ jd })} />
      <AIStatus progress={gen.progress} onCancel={gen.cancel} />

      {!list.length && !gen.isPending && (
        <EmptyState icon={MessagesSquare} title={`Write a call script for ${jd?.role}`} action={<Button size="lg" icon={MessagesSquare} onClick={() => jd && gen.mutate({ jd })}>Write 10 questions</Button>}>
          Plain-language questions a recruiter can ask without a technical background. 4 technical, 3 experience, 3 fit.
        </EmptyState>
      )}

      {list.length > 0 && !gen.isPending && (
        <>
          <div className="mb-4">
            <Segmented<Cat> value={cat} onChange={(v) => setCat(v || 'All')} size="md" options={(['All', 'Technical', 'Experience', 'Fit'] as Cat[]).map((c) => ({ value: c, label: <>{c} <span className="opacity-60">{count(c)}</span></> }))} />
          </div>
          <Accordion type="single" collapsible defaultValue="0" key={`${questions!.at}-${cat}`}>
            <motion.ol variants={stagger} initial="hidden" animate="show" className="space-y-3">
              {list.map((q, i) =>
                cat === 'All' || q.category === cat ? (
                  <motion.li key={i} variants={rise}>
                    <AccordionItem value={String(i)} className="glass overflow-hidden rounded-3xl data-[state=open]:border-teal/25">
                      <AccordionTrigger>
                        <div className="flex gap-4">
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-white/12 to-white/4 font-display text-sm font-bold tabular-nums">{i + 1}</span>
                          <div>
                            <div className="mb-1.5 flex flex-wrap gap-1.5"><Badge tone={TONE[q.category]}>{q.category}</Badge>{q.skill && <Badge>{q.skill}</Badge>}</div>
                            <p className="font-medium leading-relaxed">{q.question}</p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="border-t border-white/8 px-5 pb-5 pt-4 sm:pl-[4.75rem]"><Answer q={q} /></div>
                      </AccordionContent>
                    </AccordionItem>
                  </motion.li>
                ) : null
              )}
            </motion.ol>
          </Accordion>
          <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
            <Button iconRight={ArrowRight} onClick={onNext}>Continue to hiring market</Button>
          </div>
          <CallMode questions={list} open={call} onOpenChange={setCall} />
        </>
      )}
    </div>
  );
}
