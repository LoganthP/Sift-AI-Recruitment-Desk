import { Command } from 'cmdk';
import { Dialog as DialogP } from 'radix-ui';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CornerDownLeft, Download, FileDown, LayoutDashboard, LogOut, Plus, UserRoundCog, Wand2 } from 'lucide-react';
import { STEPS } from './Steps';
import { Kbd } from './ui/primitives';

export type Action = { id: string; label: string; icon: React.ComponentType<{ className?: string }>; run: () => void; disabled?: boolean; group: string };

export function useCommandActions(p: { go: (n: number) => void; unlocked: (n: number) => boolean; sampleJD: () => void; exportCsv?: () => void; pack?: () => void; reset: () => void; dashboard: () => void; profile: () => void; signOut: () => void }): Action[] {
  return [
    ...STEPS.filter((s) => s.n > 1).map((s) => ({ id: s.key, label: `Go to ${s.title}`, icon: s.icon, run: () => p.go(s.n), disabled: !p.unlocked(s.n), group: 'Navigate' })),
    { id: 'sample', label: 'Load the sample JD', icon: Wand2, run: p.sampleJD, group: 'Actions' },
    { id: 'csv', label: 'Export ranking as CSV', icon: Download, run: () => p.exportCsv?.(), disabled: !p.exportCsv, group: 'Actions' },
    { id: 'pack', label: 'Download hiring pack', icon: FileDown, run: () => p.pack?.(), disabled: !p.pack, group: 'Actions' },
    { id: 'dash', label: 'Go to dashboard', icon: LayoutDashboard, run: p.dashboard, group: 'Navigate' },
    { id: 'reset', label: 'Start a new search', icon: Plus, run: p.reset, group: 'Account' },
    { id: 'profile', label: 'Edit profile', icon: UserRoundCog, run: p.profile, group: 'Account' },
    { id: 'out', label: 'Sign out', icon: LogOut, run: p.signOut, group: 'Account' },
  ];
}

export function CommandMenu({ actions, open, setOpen }: { actions: Action[]; open: boolean; setOpen: (o: boolean) => void }) {
  const [q, setQ] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);
  const groups = [...new Set(actions.map((a) => a.group))];

  return (
    <DialogP.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(''); }}>
      <DialogP.Portal>
        <DialogP.Overlay className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm" />
        <DialogP.Content aria-describedby={undefined} className="fixed left-1/2 top-[18vh] z-50 w-[min(92vw,560px)] -translate-x-1/2">
          <DialogP.Title className="sr-only">Command menu</DialogP.Title>
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 34 }}>
            <Command loop className="glass-strong overflow-hidden rounded-3xl shadow-2xl">
              <Command.Input value={q} onValueChange={setQ} autoFocus placeholder="Jump to a step or run an action…" className="w-full border-b border-white/10 bg-transparent px-5 py-4 text-base outline-none placeholder:text-muted" />
              <Command.List className="scroll-thin max-h-[50vh] overflow-y-auto p-2">
                <Command.Empty className="px-4 py-8 text-center text-sm text-muted">No matching command.</Command.Empty>
                {groups.map((g) => (
                  <Command.Group key={g} heading={g} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted">
                    {actions.filter((a) => a.group === g).map((a) => (
                      <Command.Item
                        key={a.id}
                        disabled={a.disabled}
                        onSelect={() => { a.run(); setOpen(false); }}
                        className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm data-[disabled=true]:cursor-default data-[disabled=true]:opacity-35 data-[selected=true]:bg-white/8"
                      >
                        <a.icon className="size-4 text-teal" />
                        <span className="flex-1">{a.label}</span>
                        <CornerDownLeft className="size-3.5 text-muted opacity-0 [[data-selected=true]_&]:opacity-100" />
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </Command.List>
              <div className="flex items-center gap-3 border-t border-white/10 px-4 py-2 text-xs text-muted">
                <Kbd>↑↓</Kbd> move <Kbd>↵</Kbd> run <Kbd>esc</Kbd> close
              </div>
            </Command>
          </motion.div>
        </DialogP.Content>
      </DialogP.Portal>
    </DialogP.Root>
  );
}
