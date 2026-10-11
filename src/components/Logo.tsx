import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/** Brand mark. Always returns to the landing page. */
export function Logo({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  return (
    <Link to="/" aria-label="Sift home" className={cn('group inline-flex shrink-0 items-center gap-2.5 rounded-xl', className)}>
      <img src="/favicon.svg" alt="" className={cn('transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105', size === 'lg' ? 'size-9' : 'size-7')} />
      <span className={cn('font-display font-extrabold tracking-tight', size === 'lg' ? 'text-3xl' : 'text-2xl')}>Sift</span>
    </Link>
  );
}
