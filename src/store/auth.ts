import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { toast } from 'sonner';
import type { PublicUser } from '@shared/schemas';

type AuthState = {
  token: string | null;
  user: PublicUser | null;
  expiresAt: number | null;
  signIn: (s: { token: string; user: PublicUser; expiresAt: number }) => void;
  setUser: (u: PublicUser) => void;
  signOut: (reason?: string) => void;
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      expiresAt: null,
      signIn: (s) => set(s),
      setUser: (user) => set({ user }),
      signOut: (reason) => {
        if (!get().token) return;
        set({ token: null, user: null, expiresAt: null });
        if (reason) toast.error(reason);
      },
    }),
    // localStorage so a signed-in session survives new tabs; tokens expire after 12h
    { name: 'sift.auth.v3', storage: createJSONStorage(() => localStorage) }
  )
);

export const isExpired = () => {
  const e = useAuth.getState().expiresAt;
  return !e || e < Date.now();
};
