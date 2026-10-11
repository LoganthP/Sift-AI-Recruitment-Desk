import { lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  ArrowRight, Briefcase, Building2, EyeOff, FileDown, FileText, ListOrdered, MessagesSquare,
  ScanSearch, Search, ShieldCheck, Sparkles, TrendingUp, Zap,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/primitives';
import { ScoreRing } from '@/components/fx/ScoreRing';
import { NumberTicker } from '@/components/fx/NumberTicker';
import { easeSoft, rise, stagger } from '@/components/common';

const ParticleField = lazy(() => import('@/components/fx/ParticleField'));

const HEADLINE = ['Hire', 'on', 'evidence,', 'not', 'keywords.'];

const FEATURES = [
  { icon: FileText, title: 'Understands the JD', body: 'Upload a PDF or Word JD. Role, must-have skills, experience and location come back as an editable brief.', span: 'md:col-span-3' },
  { icon: ScanSearch, title: 'Reads every CV in parallel', body: 'Drop a whole folder. Background workers parse PDFs and Word files at once without freezing the page.', span: 'md:col-span-3' },
  { icon: ListOrdered, title: 'Ranks on evidence', body: 'A 100-point rubric that only credits skills backed by real work, with quotes from each CV and a second, non-AI check.', span: 'md:col-span-4' },
  { icon: EyeOff, title: 'Fair by design', body: 'Name, gender, age, photo and marital status are removed before scoring.', span: 'md:col-span-2' },
  { icon: MessagesSquare, title: 'Call-ready questions', body: 'Ten technical, experience and fit questions, with what a good answer sounds like.', span: 'md:col-span-2' },
  { icon: TrendingUp, title: 'Live market pay', body: 'Who else is hiring, at what pay, with every source link checked before you see it.', span: 'md:col-span-2' },
  { icon: Search, title: 'Sourcing strings', body: 'LinkedIn and Naukri Boolean strings, highlighted and ready to paste.', span: 'md:col-span-2' },
];

const PREVIEW = [
  { name: 'Candidate A', score: 91, skills: ['Python', 'RAG', 'AWS'], note: 'Shipped RAG on 2M documents' },
  { name: 'Candidate B', score: 78, skills: ['NLP', 'LangChain', 'Docker'], note: 'Six years of NLP in fintech' },
  { name: 'Candidate C', score: 52, skills: ['Node.js', 'OpenAI API'], note: 'Adjacent full-stack profile' },
];

const FAQ = [
  ['Who is Sift for?', 'Sift is designed for recruiters, talent acquisition leads, and hiring teams. It turns a job description and applicant CVs into an evidence-ranked shortlist, phone-screening script, live market compensation benchmarks, and sourcing search strings.'],
  ['Does the AI see personal details?', 'No. Names, gender, age, date of birth, marital status, religion, contact details and links are removed in your browser before any CV text is sent for scoring. You can preview exactly what is sent.'],
  ['Can I correct the AI?', 'Yes. Every extracted JD field is editable, every score can be overridden with a note, and Sift flags any claim it could not find in the CV text.'],
  ['Where do market numbers come from?', 'From a live web search of public job posts and salary pages. Each row names its source or is clearly marked as an estimate, and links are checked before they are shown.'],
  ['Is my work saved?', 'Every search autosaves to your account. Your dashboard keeps the full history, and you can rename or reopen any search.'],
];

export default function Landing() {
  const signedIn = !!useAuth((a) => a.token);
  const nav = useNavigate();
  const cta = () => nav(signedIn ? '/app' : '/auth?mode=signup');

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-white/6 bg-ink/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
          <Logo />
          <nav className="hidden items-center gap-1 text-sm text-muted md:flex">
            {[['#features', 'Features'], ['#how', 'How it works'], ['#faq', 'FAQ']].map(([h, l]) => (
              <a key={h} href={h} className="rounded-xl px-3 py-1.5 transition-colors hover:bg-white/5 hover:text-mist">{l}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {signedIn ? (
              <Button size="sm" iconRight={ArrowRight} onClick={() => nav('/app')}>Open dashboard</Button>
            ) : (
              <>
                <Link to="/auth?mode=signin" className="rounded-xl px-3 py-1.5 text-sm font-semibold text-muted hover:text-mist">Sign in</Link>
                <Button size="sm" onClick={() => nav('/auth?mode=signup')}>Get started</Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <Suspense fallback={null}>
          <ParticleField className="absolute inset-x-0 top-[38vh] h-[70vh] opacity-80 [mask-image:linear-gradient(to_top,transparent,black_30%,black_60%,transparent)]" />
        </Suspense>
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-16 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
          <div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-muted backdrop-blur">
              <Sparkles className="size-3.5 text-teal" /> AI recruitment desk for India
            </motion.div>
            <h1 className="font-display text-5xl font-extrabold leading-[0.98] tracking-tight sm:text-7xl">
              {HEADLINE.map((w, i) => (
                <motion.span key={i} className="mr-[0.22em] inline-block" initial={{ opacity: 0, y: 28, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: 0.1 + i * 0.08, duration: 0.6, ease: easeSoft }}>
                  {w}
                </motion.span>
              ))}
            </h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
              One job description and a stack of CVs become a fair, explainable shortlist, a call script, live market pay and sourcing strings, in a few minutes.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75 }} className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" icon={Building2} onClick={cta}>Start hiring</Button>
            </motion.div>
            <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.95 }} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-violet" /> Bias fields removed before AI</li>
              <li className="flex items-center gap-2"><Zap className="size-4 text-amber" /> Results stream in live</li>
            </motion.ul>
          </div>

          {/* Product preview */}
          <motion.div initial={{ opacity: 0, y: 30, rotateX: 14 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.8, ease: easeSoft, delay: 0.3 }} style={{ perspective: 1200 }}>
            <SpotlightCard className="beam-border p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-coral/70" /><span className="size-2.5 rounded-full bg-amber/70" /><span className="size-2.5 rounded-full bg-teal/70" />
                <span className="ml-3 text-xs text-muted">Stack ranking · AI/ML Engineer</span>
              </div>
              <motion.ol variants={stagger} initial="hidden" animate="show" className="space-y-2.5">
                {PREVIEW.map((p, i) => (
                  <motion.li key={p.name} variants={rise} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                    <span className="w-5 text-center font-display text-xs font-bold text-muted">#{i + 1}</span>
                    <ScoreRing score={p.score} size={52} />
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-bold">{p.name}</p>
                      <p className="truncate text-xs text-muted">{p.note}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">{p.skills.map((s) => <Badge key={s} tone="teal">{s}</Badge>)}</div>
                    </div>
                  </motion.li>
                ))}
              </motion.ol>
              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-violet/20 bg-violet/[0.07] px-3 py-2 text-xs text-muted">
                <ShieldCheck className="size-3.5 shrink-0 text-violet" /> 12 personal details hidden before scoring
              </div>
            </SpotlightCard>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            [7, '', 'guided steps from JD to shortlist'],
            [100, '', 'point evidence-based rubric'],
            [10, '+', 'personal fields hidden from AI'],
            [0, '', 'LinkedIn or Naukri scraping'],
          ].map(([v, suffix, label]) => (
            <SpotlightCard key={label as string} className="p-5">
              <NumberTicker value={v as number} suffix={suffix as string} className="font-display text-4xl font-extrabold tabular-nums text-teal" />
              <p className="mt-1 text-sm text-muted">{label}</p>
            </SpotlightCard>
          ))}
        </div>
      </section>

      {/* Features bento */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
        <p className="mb-2 text-sm font-semibold text-teal">Features</p>
        <h2 className="max-w-2xl font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Everything between “we’re hiring” and “let’s talk”.</h2>
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} className="mt-10 grid gap-4 md:grid-cols-6">
          {FEATURES.map((f) => (
            <motion.div key={f.title} variants={rise} className={f.span}>
              <SpotlightCard className="h-full p-6">
                <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-violet/25 to-teal/20"><f.icon className="size-5 text-teal" /></div>
                <h3 className="font-display text-xl font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
              </SpotlightCard>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-24">
        <p className="mb-2 text-sm font-semibold text-teal">How it works</p>
        <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Three moves.</h2>
        <div className="relative mt-10 grid gap-4 md:grid-cols-3">
          <div aria-hidden className="absolute left-0 right-0 top-[34px] hidden h-px bg-gradient-to-r from-transparent via-teal/40 to-transparent md:block" />
          {[
            [Building2, 'Create your account', 'Sign up with your work email and set up your hiring profile.'],
            [Sparkles, 'Run a search', 'Add a JD and CVs. Sift walks you through the seven steps and saves as you go.'],
            [FileDown, 'Share the hiring pack', 'Export the ranking, questions, market data and strings in one file.'],
          ].map(([Icon, t, b], i) => {
            const I = Icon as typeof Building2;
            return (
              <motion.div key={t as string} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1, ease: easeSoft, duration: 0.5 }} className="relative">
                <div className="relative mb-4 grid size-[68px] place-items-center rounded-3xl border border-white/10 bg-ink-2"><I className="size-6 text-teal" /><span className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-teal font-display text-xs font-bold text-ink">{i + 1}</span></div>
                <h3 className="font-display text-xl font-bold">{t as string}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{b as string}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-6 pb-24">
        <h2 className="mb-8 text-center font-display text-4xl font-extrabold tracking-tight">Questions</h2>
        <Accordion type="single" collapsible className="space-y-3">
          {FAQ.map(([q, a], i) => (
            <AccordionItem key={q} value={String(i)} className="glass overflow-hidden rounded-3xl">
              <AccordionTrigger><span className="font-medium">{q}</span></AccordionTrigger>
              <AccordionContent><p className="px-5 pb-5 text-sm leading-relaxed text-muted">{a}</p></AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <SpotlightCard className="beam-border overflow-hidden px-8 py-14 text-center">
          <Briefcase className="mx-auto mb-4 size-8 text-teal" />
          <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Your next shortlist is a few minutes away.</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" icon={Building2} onClick={cta}>Start hiring</Button>
          </div>
        </SpotlightCard>
      </section>

      <footer className="border-t border-white/8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted">
          <Logo />
          <p>Built as a recruitment AI prototype. Sample data is fictional.</p>
        </div>
      </footer>
    </div>
  );
}
