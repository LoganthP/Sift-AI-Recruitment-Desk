import { useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Building2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { OrgProfile, type Profile, type PublicUser } from '@shared/schemas';
import { request } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { cn } from '@/lib/utils';
import { AppHeader } from '@/components/UserMenu';
import { Button } from '@/components/ui/button';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Progress } from '@/components/ui/primitives';
import { SkillEditor, easeSoft, rise, stagger } from '@/components/common';

type Errors = Record<string, string>;
const SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+'] as const;

function F({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <motion.div variants={rise} className={className}>
      <label className="mb-1.5 block text-xs text-muted">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-coral" role="alert">{error}</p>}
    </motion.div>
  );
}

export default function ProfileSetup({ edit = false }: { edit?: boolean }) {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const existing = user!.profile;

  const [o, setO] = useState(() =>
    existing?.type === 'organisation'
      ? existing
      : { type: 'organisation' as const, fullName: user!.name, designation: '', company: '', companySize: '11-50' as (typeof SIZES)[number], industry: '', location: '', hiringFor: [] as string[] }
  );
  const [errors, setErrors] = useState<Errors>({});

  const save = useMutation({
    mutationFn: (p: Profile) => request<{ user: PublicUser }>('PUT', 'me/profile', p),
    onSuccess: ({ user }) => {
      setUser(user);
      toast.success(edit ? 'Profile updated' : 'Profile ready. Welcome to Sift!');
      nav('/app', { replace: true });
    },
  });

  const submit = () => {
    const parsed = OrgProfile.safeParse(o);
    if (!parsed.success) {
      const e: Errors = {};
      for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
      setErrors(e);
      toast.error('Some details need attention.');
      return;
    }
    setErrors({});
    save.mutate(parsed.data as Profile);
  };

  const filled = [o.fullName, o.designation, o.company, o.industry, o.location, o.hiringFor.length].filter(Boolean).length / 6;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: easeSoft }}>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/5 px-2.5 py-1 text-xs text-muted">
            <Building2 className="size-3.5 text-teal" />
            {edit ? 'Edit profile' : 'Step 1 of 1 · Basic details'}
          </p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">{edit ? 'Your profile' : 'Tell us about your hiring'}</h1>
          <p className="mt-2 text-muted">This sets up your organisation workspace. It takes under a minute.</p>
          <div className="mt-5 flex items-center gap-3">
            <Progress value={filled * 100} className="h-2" />
            <span className="w-12 text-right text-xs tabular-nums text-muted">{Math.round(filled * 100)}%</span>
          </div>
        </motion.div>

        <SpotlightCard className="mt-6 p-6 sm:p-8">
          <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-5 sm:grid-cols-2">
            <F label="Full name" error={errors.fullName}><input className="neu-field px-4 py-3" value={o.fullName} onChange={(e) => setO({ ...o, fullName: e.target.value })} /></F>
            <F label="Designation" error={errors.designation}><input className="neu-field px-4 py-3" placeholder="e.g. Talent Acquisition Lead" value={o.designation} onChange={(e) => setO({ ...o, designation: e.target.value })} /></F>
            <F label="Company" error={errors.company}><input className="neu-field px-4 py-3" placeholder="Company name" value={o.company} onChange={(e) => setO({ ...o, company: e.target.value })} /></F>
            <F label="Industry" error={errors.industry}><input className="neu-field px-4 py-3" placeholder="e.g. Software, Fintech" value={o.industry} onChange={(e) => setO({ ...o, industry: e.target.value })} /></F>
            <F label="Company size" className="sm:col-span-2">
              <div className="flex flex-wrap gap-2">
                {SIZES.map((s) => (
                  <button key={s} type="button" onClick={() => setO({ ...o, companySize: s })} className={cn('rounded-full border px-3.5 py-1.5 text-sm transition-colors', o.companySize === s ? 'border-teal/50 bg-teal/15 text-teal' : 'border-white/10 text-muted hover:text-mist')}>{s} employees</button>
                ))}
              </div>
            </F>
            <F label="Location" error={errors.location}><input className="neu-field px-4 py-3" placeholder="City" value={o.location} onChange={(e) => setO({ ...o, location: e.target.value })} /></F>
            <F label="Roles you hire for" error={errors.hiringFor}><SkillEditor values={o.hiringFor} onChange={(v) => setO({ ...o, hiringFor: v })} /></F>
          </motion.div>
          {save.error && <p className="mt-5 text-sm text-coral" role="alert">{(save.error as Error).message}</p>}
          <div className="mt-8 flex flex-wrap justify-end gap-2">
            {edit && <Button variant="ghost" onClick={() => nav('/app')}>Cancel</Button>}
            <Button size="lg" loading={save.isPending} icon={edit ? Save : undefined} iconRight={edit ? undefined : ArrowRight} onClick={submit}>{edit ? 'Save profile' : 'Continue to dashboard'}</Button>
          </div>
        </SpotlightCard>
      </div>
    </div>
  );
}
