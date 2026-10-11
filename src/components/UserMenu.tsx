import { DropdownMenu } from 'radix-ui';
import { useNavigate } from 'react-router';
import { Building2, ChevronDown, LayoutDashboard, LogOut, UserRoundCog } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useSession } from '@/store/session';
import { Logo } from './Logo';

export const initials = (name?: string) => (name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export function UserMenu() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  if (!user) return null;
  const item = 'flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm outline-none data-[highlighted]:bg-white/8';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="glass flex items-center gap-2 rounded-2xl py-1 pl-1 pr-2.5 text-sm outline-none hover:bg-white/10">
        <span className="grid size-7 place-items-center rounded-xl bg-gradient-to-br from-violet to-teal font-display text-xs font-bold text-ink">{initials(user.name)}</span>
        <span className="hidden max-w-32 truncate sm:block">{user.name}</span>
        <ChevronDown className="size-3.5 text-muted" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="glass-strong z-50 w-64 rounded-2xl p-1.5 shadow-2xl">
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/6 px-2 py-0.5 text-[11px] text-muted">
              <Building2 className="size-3" />
              Recruiter
            </span>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-white/8" />
          <DropdownMenu.Item className={item} onSelect={() => nav('/app')}><LayoutDashboard className="size-4 text-teal" /> Dashboard</DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => nav('/app/profile')}><UserRoundCog className="size-4 text-teal" /> Edit profile</DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-white/8" />
          <DropdownMenu.Item className={`${item} text-coral`} onSelect={() => { useSession.getState().reset(); signOut(); nav('/'); }}><LogOut className="size-4" /> Sign out</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function AppHeader({ children, right }: { children?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/8 bg-ink/55 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          {children}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {right}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

