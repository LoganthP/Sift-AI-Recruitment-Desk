import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { MotionConfig } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import type { PublicUser } from '@shared/schemas';
import { request } from '@/lib/api';
import { isExpired, useAuth } from '@/store/auth';
import { Aurora } from '@/components/fx/Aurora';

const Landing = lazy(() => import('@/pages/Landing'));
const Auth = lazy(() => import('@/pages/Auth'));
const ProfileSetup = lazy(() => import('@/pages/ProfileSetup'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Workspace = lazy(() => import('@/pages/Workspace'));

function PageFallback() {
  return <div className="grid min-h-screen place-items-center"><div className="skeleton h-10 w-40 rounded-2xl" /></div>;
}

/** Signed-in routes. Keeps the user in sync with the server and enforces profile setup first. */
function RequireAuth({ needProfile = true }: { needProfile?: boolean }) {
  const { token, user, setUser, signOut } = useAuth();
  const loc = useLocation();
  const expired = !!token && isExpired();
  useEffect(() => { if (expired) signOut('Your session expired. Sign in again.'); }, [expired, signOut]);
  const me = useQuery({ queryKey: ['me', token], queryFn: () => request<{ user: PublicUser }>('GET', 'me'), enabled: !!token && !expired, staleTime: 60_000 });
  useEffect(() => { if (me.data) setUser(me.data.user); }, [me.data, setUser]);

  if (!token || !user || expired) return <Navigate to={`/auth?mode=signin`} replace state={{ from: loc.pathname }} />;
  if (needProfile && !user.profileComplete) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

function GuestOnly() {
  const { token, user } = useAuth();
  if (token && user && !isExpired()) return <Navigate to={user.profileComplete ? '/app' : '/onboarding'} replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Aurora />
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route element={<GuestOnly />}><Route path="/auth" element={<Auth />} /></Route>
            <Route element={<RequireAuth needProfile={false} />}><Route path="/onboarding" element={<ProfileSetup />} /></Route>
            <Route element={<RequireAuth />}>
              <Route path="/app" element={<Dashboard />} />
              <Route path="/app/profile" element={<ProfileSetup edit />} />
              <Route path="/app/p/:id" element={<Workspace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </MotionConfig>
  );
}
