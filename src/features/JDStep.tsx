import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Briefcase, Clock, FileText, GraduationCap, ListChecks, MapPin, PencilLine, Sparkles, Star, Wand2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import type { JD } from '@shared/schemas';
import { useSession } from '@/store/session';
import { parseFile } from '@/lib/parserPool';
import { useStreamMutation } from '@/lib/useStream';
import { SAMPLE_JD } from '@/lib/sampleJd';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { Dropzone } from '@/components/Dropzone';
import { AIStatus, ErrorNote, SkillEditor, StepHeader, rise, stagger } from '@/components/common';
import { cn } from '@/lib/utils';

function Tile({ icon: Icon, title, className, children }: { icon?: React.ComponentType<{ className?: string }>; title: string; className?: string; children: React.ReactNode }) {
  return (
    <motion.div variants={rise} className={className}>
      <SpotlightCard className="h-full p-5">
        <div className="mb-3 flex items-center gap-2 text-xs text-muted">
          {Icon && <Icon className="size-3.5 text-teal" />} {title}
        </div>
        {children}
      </SpotlightCard>
    </motion.div>
  );
}

export default function JDStep({ onNext }: { onNext: () => void }) {
  const { jdText, jdFile, jd, jdMeta, set } = useSession();
  const [tab, setTab] = useState(jdText ? 'paste' : 'upload');
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const analyze = useStreamMutation<JD, { text: string }>('parse-jd', {
    onSuccess: (data, meta) => {
      set('jd', { ...data, edited: false });
      set('jdMeta', meta ? { ...meta, at: Date.now() } : null);
      toast.success(`Understood: ${data.role}`);
    },
  });

  const onFile = async ([file]: File[]) => {
    setFileError(null);
    setReading(true);
    try {
      const { text, ms } = await parseFile(file, { redact: false });
      set('jdText', text);
      set('jdFile', file.name);
      setTab('paste');
      toast.success(`Read ${file.name} in ${ms} ms`);
    } catch (e) {
      setFileError(`${file.name}: ${(e as Error).message}`);
    } finally {
      setReading(false);
    }
  };

  const edit = (patch: Partial<JD>) => set('jd', (cur) => (cur ? { ...cur, ...patch, edited: true } : cur));
  const editExp = (patch: Partial<JD['experience']>) => {
    if (!jd) return;
    const e = { ...jd.experience, ...patch };
    edit({ experience: { ...e, text: e.max != null ? `${e.min ?? 0}–${e.max} years` : `${e.min ?? 0}+ years` } });
  };
  const num = (v: string) => (v === '' ? null : Math.max(0, Number(v)));

  return (
    <div>
      <StepHeader
        step={2}
        title="Job description"
        description="Upload the JD as PDF or Word, or paste it. Sift extracts the role, must-have skills, experience and location. Click any field to correct it."
      />
      <ErrorNote message={fileError || analyze.errorMessage} onRetry={analyze.errorMessage ? () => analyze.mutate({ text: jdText }) : undefined} />
      <AIStatus progress={analyze.progress} onCancel={analyze.cancel} />

      <SpotlightCard className="p-5 sm:p-6">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="upload" active={tab === 'upload'} layoutId="jd-tab">Upload file</TabsTrigger>
              <TabsTrigger value="paste" active={tab === 'paste'} layoutId="jd-tab">Paste text</TabsTrigger>
            </TabsList>
            <Button variant="ghost" size="sm" icon={Wand2} onClick={() => { set('jdText', SAMPLE_JD); set('jdFile', null); setTab('paste'); }}>Use sample JD</Button>
          </div>
          <TabsContent value="upload" forceMount hidden={tab !== 'upload'}>
            <Dropzone accept=".pdf,.docx,.txt" onFiles={onFile} title={reading ? 'Reading in a background worker…' : 'Drop the JD here'} hint="PDF, Word (.docx) or .txt" />
          </TabsContent>
          <TabsContent value="paste" forceMount hidden={tab !== 'paste'}>
            {jdFile && <p className="mb-2 flex items-center gap-2 text-sm text-muted"><FileText className="size-4" /> Extracted from {jdFile}. Check it, then analyze.</p>}
            <textarea value={jdText} onChange={(e) => set('jdText', e.target.value)} rows={11} placeholder="Paste the full job description…" className="neu-field scroll-thin resize-y p-4 text-sm leading-relaxed" />
            <div className="mt-1 flex justify-between text-xs text-muted">
              <span>{jdText.trim().length < 80 && jdText ? 'Add a little more text so the AI has enough to go on.' : ''}</span>
              <span className="tabular-nums">{jdText.length.toLocaleString()} characters</span>
            </div>
          </TabsContent>
        </Tabs>
        <div className="mt-4 flex justify-end">
          <Button icon={Sparkles} loading={analyze.isPending} disabled={jdText.trim().length < 80} onClick={() => analyze.mutate({ text: jdText })}>
            {jd ? 'Analyze again' : 'Analyze JD'}
          </Button>
        </div>
      </SpotlightCard>

      <AnimatePresence>
        {jd && !analyze.isPending && (
          <motion.section key={jdMeta?.at ?? 'jd'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-10">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-bold">What Sift understood</h2>
              {jd.edited ? <Badge tone="amber"><PencilLine className="size-3" /> Corrected by you</Badge> : <Badge tone="violet"><Sparkles className="size-3" /> AI extracted. Click to correct</Badge>}
            </div>

            <motion.div variants={stagger} initial="hidden" animate="show" className="grid auto-rows-min grid-cols-1 gap-4 md:grid-cols-6">
              <Tile icon={Briefcase} title="Role" className="md:col-span-4">
                <input value={jd.role} onChange={(e) => edit({ role: e.target.value })} aria-label="Role" className="w-full rounded-lg bg-transparent font-display text-2xl font-bold outline-none hover:bg-white/[0.03] sm:text-3xl" />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                  {jd.company && <span>{jd.company}</span>}
                  {jd.seniority !== 'Not specified' && <Badge>{jd.seniority}</Badge>}
                  {jd.employmentType !== 'Not specified' && <Badge>{jd.employmentType}</Badge>}
                </div>
                {jd.summary && <p className="mt-3 text-sm leading-relaxed text-muted">{jd.summary}</p>}
              </Tile>

              <Tile icon={Clock} title="Experience" className="md:col-span-2">
                <div className="flex items-end gap-1">
                  {(['min', 'max'] as const).map((k, i) => (
                    <span key={k} className="flex items-end gap-1">
                      {i === 1 && <span className="pb-1 text-3xl text-muted">–</span>}
                      <input
                        type="number" min={0} value={jd.experience[k] ?? ''} placeholder={k === 'max' ? '+' : '0'}
                        onChange={(e) => editExp({ [k]: num(e.target.value) })}
                        aria-label={k === 'min' ? 'Minimum years' : 'Maximum years'}
                        style={{ width: `${Math.max(1, String(jd.experience[k] ?? '').length) + 0.5}ch` }}
                        className="rounded-lg bg-transparent font-display text-5xl font-extrabold tabular-nums outline-none placeholder:text-muted hover:bg-white/5"
                      />
                    </span>
                  ))}
                  <span className="pb-2 pl-1 text-sm text-muted">years</span>
                </div>
              </Tile>

              <Tile icon={ListChecks} title={`Must-have skills · ${jd.keySkills.length}`} className="md:col-span-4">
                <SkillEditor values={jd.keySkills} onChange={(v) => edit({ keySkills: v })} />
              </Tile>

              <Tile icon={MapPin} title="Location" className="md:col-span-2">
                <input value={jd.location} onChange={(e) => edit({ location: e.target.value })} aria-label="Location" className="neu-field px-3 py-2 text-sm" />
                <div className="mt-2 flex flex-wrap gap-1">
                  {(['On-site', 'Hybrid', 'Remote'] as const).map((m) => (
                    <button key={m} onClick={() => edit({ workMode: m })} className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors', jd.workMode === m ? 'border-teal/40 bg-teal/15 text-teal' : 'border-white/10 text-muted hover:text-mist')}>{m}</button>
                  ))}
                </div>
              </Tile>

              <Tile icon={Star} title="Nice to have" className="md:col-span-2">
                <SkillEditor values={jd.niceToHave} onChange={(v) => edit({ niceToHave: v })} tone="violet" />
              </Tile>
              <Tile title="Responsibilities" className="md:col-span-2">
                <ul className="space-y-2 text-sm">
                  {jd.responsibilities.map((r) => <li key={r} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-teal" />{r}</li>)}
                </ul>
              </Tile>
              <Tile icon={GraduationCap} title="Education and domain" className="md:col-span-2">
                <p className="text-sm">{jd.education}</p>
                {jd.domain !== 'Not specified' && <p className="mt-2 text-sm text-muted">{jd.domain}</p>}
              </Tile>
            </motion.div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <Button iconRight={ArrowRight} onClick={onNext}>Continue to CVs</Button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
