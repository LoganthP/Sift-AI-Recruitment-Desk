import { lazy, Suspense, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Building2, Check, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import type { PublicUser } from '@shared/schemas';
import { postJSON } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/Logo';
import { Button, spring } from '@/components/ui/button';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { easeSoft } from '@/components/common';

const ParticleField = lazy(() => import('@/components/fx/ParticleField'));

type Mode = 'signin' | 'signup';
type Session = { token: string; user: PublicUser; expiresAt: number };

const PITCH = {
  title: 'Hire with evidence',
  lead: 'For recruiters, HR teams and hiring managers.',
  points: [
    'Rank every CV against your JD on evidence',
    'Hide personal details from the AI automatically',
    'Get a call script, market pay and sourcing strings',
    'Keep a history of every search you run',
  ],
};

function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs text-muted">{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-coral">{error}</p> : hint ? <p className="mt-1 text-xs text-muted/70">{hint}</p> : null}
    </div>
  );
}

export default function Auth() {
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get('mode') === 'signup' ? 'signup' : 'signin';
  const setMode = (m: Mode) => setParams({ mode: m }, { replace: true });

  const signIn = useAuth((s) => s.signIn);
  const nav = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);

  const done = (s: Session) => {
    signIn(s);
    toast.success(mode === 'signup' ? 'Account created' : `Welcome back, ${s.user.name.split(' ')[0]}`);
    nav(s.user.profileComplete ? '/app' : '/onboarding', { replace: true });
  };
  const auth = useMutation({
    mutationFn: () =>
      mode === 'signin'
        ? postJSON<Session>('auth/login', { email, password })
        : postJSON<Session>('auth/signup', { name, email, password }),
    onSuccess: done,
  });

  const canSubmit = mode === 'signin' ? Boolean(email && password) : Boolean(name.trim().length > 1 && email && password.length >= 6);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <Suspense fallback={null}>
        <ParticleField className="absolute inset-x-0 bottom-0 h-[60vh] opacity-70 [mask-image:linear-gradient(to_top,black_40%,transparent)]" />
      </Suspense>
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <button onClick={() => nav('/')} className="text-sm text-muted hover:text-mist">Back to home</button>
      </header>

      <div className="relative mx-auto grid max-w-6xl items-start gap-10 px-6 pb-16 pt-4 lg:grid-cols-[1fr_1.05fr] lg:pt-10">
        {/* Left: recruiter pitch */}
        <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, ease: easeSoft }} className="lg:pt-10">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-muted">
            <Building2 className="size-3.5 text-teal" />
            Recruiters & Hiring Teams
          </div>
          <h1 className="font-display text-5xl font-extrabold leading-[1] tracking-tight sm:text-6xl">{PITCH.title}</h1>
          <p className="mt-4 text-lg text-muted">{PITCH.lead}</p>
          <SpotlightCard className="mt-8 max-w-md p-6">
            <p className="mb-3 font-display text-lg font-bold">{mode === 'signup' ? 'On registering, you can' : 'Pick up where you left off'}</p>
            <ul className="space-y-2.5">
              {PITCH.points.map((p) => (
                <li key={p} className="flex gap-2.5 text-sm">
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-teal">
                    <Check className="size-3 text-ink" strokeWidth={3} />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </SpotlightCard>
        </motion.div>

        {/* Right: form */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: easeSoft }}>
          <SpotlightCard className="beam-border p-6 sm:p-8">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-3xl font-bold">{mode === 'signin' ? 'Recruiter sign in' : 'Create recruiter account'}</h2>
                <p className="mt-1 text-sm text-muted">Recruiter and hiring-team workspace</p>
              </div>
              <div className="flex gap-1 rounded-xl bg-black/30 p-0.5 text-xs">
                {(['signin', 'signup'] as const).map((m) => (
                  <button key={m} onClick={() => { setMode(m); auth.reset(); }} className={cn('relative rounded-[10px] px-3 py-1.5 font-medium', mode === m ? 'text-ink' : 'text-muted hover:text-mist')}>
                    {mode === m && <motion.span layoutId="mode-pill" transition={spring} className="absolute inset-0 rounded-[10px] bg-teal" />}
                    <span className="relative">{m === 'signin' ? 'Sign in' : 'Sign up'}</span>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) auth.mutate(); }} className="mt-6 space-y-4">
              <AnimatePresence initial={false}>
                {mode === 'signup' && (
                  <motion.div key="name" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <Field label="Full name">
                      <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="neu-field px-4 py-3" placeholder="What is your name?" />
                    </Field>
                  </motion.div>
                )}
              </AnimatePresence>
              <Field label="Work email" hint={mode === 'signup' ? 'Use your company email' : undefined}>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required className="neu-field px-4 py-3" placeholder="you@company.com" />
              </Field>
              <Field label="Password" hint={mode === 'signup' ? 'Minimum 6 characters' : undefined}>
                <div className="relative">
                  <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required className="neu-field px-4 py-3 pr-11" placeholder="••••••••" />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-mist" aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>

              {auth.error && (
                <motion.p key={String(auth.submittedAt)} animate={{ x: [0, -8, 8, -4, 0] }} className="text-sm text-coral" role="alert">
                  {(auth.error as Error).message}
                </motion.p>
              )}
              <Button type="submit" size="lg" loading={auth.isPending} disabled={!canSubmit} iconRight={ArrowRight} className="w-full">
                {mode === 'signin' ? 'Sign in' : 'Create recruiter account'}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted">
              {mode === 'signin' ? 'New to Sift? ' : 'Already have an account? '}
              <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} className="font-semibold text-teal hover:underline">
                {mode === 'signin' ? 'Create recruiter account' : 'Sign in'}
              </button>
            </p>

            {mode === 'signin' && (
              <button type="button" onClick={() => { setEmail('recruiter@demo.com'); setPassword('Demo@123'); }} className="group mt-5 flex w-full items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-teal/30">
                <span>
                  <span className="block text-xs text-muted">Demo recruiter account</span>
                  <span className="font-mono text-xs">recruiter@demo.com · Demo@123</span>
                </span>
                <span className="text-sm font-semibold text-teal transition-transform group-hover:translate-x-0.5">Use it</span>
              </button>
            )}
          </SpotlightCard>
        </motion.div>
      </div>
    </div>
  );
}
